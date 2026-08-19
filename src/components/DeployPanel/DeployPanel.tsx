import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAppStore } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources';
import { useLogicEditorStore } from '../LogicEditor';
import type { BoardId, ProtocolId } from '../../types/hmi';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_PROTOCOL_ID,
  getBoardDefinition,
  getProtocolDefinition,
} from '../../types/hmi';
import {
  buildHmiProject,
  flashHmiBuild,
  getHmiCapabilities,
  getHmiImageLayout,
  listHmiPorts,
  type HmiCapabilities,
  type HmiImageLayout,
  type HmiSerialPort,
} from '../../services/hmiApi';
import '../HmiPanel/hmiPanel.css';
import './DeployPanel.css';

type BusyAction = 'building' | 'flashing' | null;

type LogCopyFeedback = {
  kind: 'success' | 'error';
  message: string;
} | null;


function formatAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(8, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const REGION_LABEL: Record<string, string> = {
  'external-flash': 'External Flash (QSPI NOR)',
  'internal-flash': 'Internal Flash',
  other: 'Other',
};

const DeployPanel: React.FC = () => {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const factoryDevMode = useAppStore((state) => state.factoryDevMode);
  const {
    getProjectConfig,
    saveProjectData,
    exportProject,
    flushProjectConfigWrites,
  } = useProjectStore();
  const screens = useEditorStore((state) => state.screens);
  const animations = useEditorStore((state) => state.animations);
  const logicGraphs = useLogicEditorStore((state) => state.graphs);
  const images = useResourceStore((state) => state.images);
  const fonts = useResourceStore((state) => state.fonts);

  /* Replaced by the project's own board as soon as its config loads. */
  const [boardId, setBoardId] = useState<BoardId>(DEFAULT_BOARD_ID);
  const [protocol, setProtocol] = useState<ProtocolId>(DEFAULT_PROTOCOL_ID);
  const [runtimePort, setRuntimePort] = useState('');
  const [ports, setPorts] = useState<HmiSerialPort[]>([]);
  const [capabilities, setCapabilities] = useState<HmiCapabilities | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [buildId, setBuildId] = useState('');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [logCopyFeedback, setLogCopyFeedback] = useState<LogCopyFeedback>(null);
  const [layout, setLayout] = useState<HmiImageLayout | null>(null);

  const board = useMemo(() => getBoardDefinition(boardId), [boardId]);
  const protocolDefinition = useMemo(
    () => getProtocolDefinition(protocol),
    [protocol],
  );
  const selectedPort = useMemo(
    () => ports.find((port) => port.path === runtimePort),
    [ports, runtimePort],
  );
  const serviceAvailable = capabilities
    ? capabilities.available !== false
      && capabilities.programmerAvailable !== false
      && capabilities.success
    : null;
  const buildable = protocolDefinition.implemented;
  const canBuild = buildable
    && serviceAvailable !== false
    && capabilities?.canBuild !== false;
  const canFlash = serviceAvailable !== false && capabilities?.canFlash !== false;

  const appendLog = useCallback((message: string | string[]) => {
    const next = Array.isArray(message) ? message : [message];
    setLogCopyFeedback(null);
    setLogs((current) => [...current, ...next].filter(Boolean));
  }, []);

  const handleCopyLogs = useCallback(async () => {
    if (logs.length === 0) {
      setLogCopyFeedback({
        kind: 'error',
        message: 'No log entries to copy.',
      });
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(logs.join('\n'));
      setLogCopyFeedback({
        kind: 'success',
        message: `Copied ${logs.length} log ${logs.length === 1 ? 'entry' : 'entries'}.`,
      });
    } catch {
      setLogCopyFeedback({
        kind: 'error',
        message: 'Could not copy the log. Check clipboard permissions and try again.',
      });
    }
  }, [logs]);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
    setLogCopyFeedback(null);
  }, []);

  const refreshPorts = useCallback(async () => {
    try {
      const result = await listHmiPorts();
      setPorts(result.ports);
    } catch {
      // The port list only supplies the ST-LINK serial number here; the local
      // service picks a probe on its own when it is missing.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!currentProjectId) return;

    setBuildId('');
    setArtifactUrl('');

    // The Protocol tab debounces its saves and may have unmounted moments ago,
    // so wait for those writes before reading the board and protocol back.
    void flushProjectConfigWrites()
      .then(() => getProjectConfig(currentProjectId))
      .then((config) => {
        if (cancelled || !config) return;
        setBoardId(config.boardId);
        setProtocol(config.protocol ?? DEFAULT_PROTOCOL_ID);
        setRuntimePort(config.communication?.port ?? '');
      })
      .catch((error) => {
        if (!cancelled) {
          appendLog(`Failed to load project settings: ${String(error)}`);
        }
      });

    getHmiCapabilities()
      .then((result) => {
        if (cancelled) return;
        setCapabilities(result);
        if (result.error) appendLog(`Local HMI service: ${result.error}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setCapabilities({ success: false, available: false, error: String(error) });
        appendLog(`Local HMI service unavailable: ${error instanceof Error ? error.message : String(error)}`);
      });

    refreshPorts();
    return () => {
      cancelled = true;
    };
  }, [
    appendLog,
    currentProjectId,
    flushProjectConfigWrites,
    getProjectConfig,
    refreshPorts,
  ]);

  const handleBuild = useCallback(async () => {
    if (!currentProjectId) return;
    setBusy('building');
    setBuildId('');
    setArtifactUrl('');
    setLayout(null);
    try {
      // Anything the user typed on the Protocol tab has to be on disk before
      // the project is exported, or the firmware is built from stale settings.
      await flushProjectConfigWrites();
      await saveProjectData(currentProjectId, screens, logicGraphs, images, fonts, undefined, undefined, undefined, undefined, undefined, undefined, animations);
      const project = await exportProject(currentProjectId);
      const result = await buildHmiProject(project);
      appendLog(result.log);
      if (!result.success) {
        appendLog(`Firmware build failed: ${result.error || 'Unknown error'}`);
        return;
      }
      if (result.buildId) setBuildId(result.buildId);
      if (result.artifact?.downloadUrl) setArtifactUrl(result.artifact.downloadUrl);
      if (result.buildId && factoryDevMode) {
        // Only read back when the section is on screen; it is a file parse.
        try {
          setLayout(await getHmiImageLayout(result.buildId));
        } catch {
          // The layout is diagnostic; a build is not less successful without it.
        }
      }
      appendLog(
        result.buildId
          ? `Firmware build complete, buildId: ${result.buildId}`
          : 'Firmware build complete.',
      );
    } catch (error) {
      appendLog(`Firmware build failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }, [
    appendLog,
    currentProjectId,
    exportProject,
    flushProjectConfigWrites,
    fonts,
    images,
    logicGraphs,
    factoryDevMode,
    saveProjectData,
    screens,
    animations,
  ]);

  const handleFlash = useCallback(async () => {
    if (!buildId) {
      appendLog('Build the firmware first.');
      return;
    }
    setBusy('flashing');
    try {
      const result = await flashHmiBuild(buildId, selectedPort?.probeSerial);
      appendLog(result.log);
      appendLog(result.success
        ? 'Firmware flashed and device reset.'
        : `Firmware flashing failed: ${result.error || 'Unknown error'}`);
    } catch (error) {
      appendLog(`Firmware flashing failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }, [appendLog, buildId, selectedPort?.probeSerial]);

  if (!currentProjectId) {
    return <div className="hmi-panel hmi-panel-empty">Open a project first.</div>;
  }

  return (
    <div className="hmi-panel deploy-panel">
      <div className="hmi-panel-header">
        <div>
          <h2>Deploy</h2>
          <p>{board.name} · Build the firmware, then flash it through ST-LINK SWD.</p>
        </div>
        <div className={`hmi-service-status ${serviceAvailable === false ? 'offline' : ''}`}>
          <span />
          {serviceAvailable === null
            ? 'Checking local service...'
            : serviceAvailable
              ? 'Local HMI service ready'
              : 'Local HMI service unavailable'}
        </div>
      </div>

      <div className="hmi-panel-scroll">
        {!buildable && (
          <div className="hmi-panel-card">
            <div className="hmi-panel-notice" role="note">
              <strong>This project cannot be built.</strong>
              <span>
                It uses {protocolDefinition.name}, which the binding generator
                and the board firmware do not implement yet. Switch the project
                to a supported protocol on the Protocol tab to build it.
              </span>
            </div>
          </div>
        )}

        <section className="hmi-panel-card">
          <div className="hmi-panel-card-title">
            <div>
              <h3>Build &amp; Flash</h3>
              <p>Protocol settings are saved automatically before the build starts.</p>
            </div>
          </div>

          <div className={`deploy-step ${buildId ? 'done' : ''}`}>
            <span className="deploy-step-index">1</span>
            <span>
              Compile the generated UI and the {board.name} firmware into an
              image.
            </span>
          </div>
          <div className="deploy-step">
            <span className="deploy-step-index">2</span>
            <span>
              Write that image to the board over SWD and reset it.
            </span>
          </div>

          <div className="deploy-actions">
            <button
              type="button"
              className="hmi-panel-primary"
              onClick={handleBuild}
              disabled={busy !== null || !canBuild}
            >
              {busy === 'building' ? 'Building...' : 'Build Firmware'}
            </button>
            <button
              type="button"
              className="hmi-panel-danger"
              onClick={handleFlash}
              disabled={!buildId || busy !== null || !canFlash}
            >
              {busy === 'flashing' ? 'Flashing...' : 'Flash & Reset'}
            </button>
            {artifactUrl && (
              <a href={artifactUrl} className="artifact-link" download>
                Download Firmware
              </a>
            )}
          </div>

          <div className="deploy-target">
            <span>Target: {board.name}</span>
            <span>Protocol: {protocolDefinition.name}</span>
            <span>Build ID: {buildId || 'Not built yet'}</span>
            <span>ST-LINK: {selectedPort?.probeSerial || 'Selected automatically by the local service'}</span>
          </div>

          <div className="deploy-log">
            <div className="deploy-log-header">
              <span>Build / Flash log</span>
              <div className="deploy-log-controls">
                {logCopyFeedback && (
                  <span
                    className={`deploy-log-feedback ${logCopyFeedback.kind}`}
                    role="status"
                    aria-live="polite"
                  >
                    {logCopyFeedback.message}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  aria-label="Copy build and flash log"
                  title={logs.length === 0 ? 'No log entries to copy' : 'Copy all log entries'}
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={logs.length === 0}
                  aria-label="Clear build and flash log"
                  title={logs.length === 0 ? 'No log entries to clear' : 'Clear all log entries'}
                >
                  Clear
                </button>
              </div>
            </div>
            <pre>{logs.length > 0 ? logs.join('\n') : 'Waiting for an operation...'}</pre>
          </div>
        </section>

          {/* Where the images physically land. Diagnostic rather than
              operational, and reads addresses out of the linker map, so it is
              for EDT engineers -- see docs/factory-dev-mode.md. */}
          {factoryDevMode && (
            <section className="hmi-panel-card">
              <div className="hmi-panel-card-title">
                <div>
                  <h3>
                    Asset Placement
                    <span className="hwinfo-dev-badge">Factory Mode</span>
                  </h3>
                  <p>
                    Where each flashed image and font glyph bitmap sits in
                    memory, as the range it occupies, read from the linker map
                    of the build above rather than predicted. A row whose start
                    and end are both in external flash is entirely in the QSPI
                    NOR.
                  </p>
                </div>
              </div>

              {layout === null ? (
                <p className="deploy-placement-empty">
                  Build the firmware to read the placement back.
                </p>
              ) : layout.images.length === 0 ? (
                <p className="deploy-placement-empty">
                  This project flashes no images or custom fonts.
                </p>
              ) : (
                <>
                  <div className="deploy-target">
                    {layout.externalFlashBase !== '' && (
                      <span>Region base: {layout.externalFlashBase}</span>
                    )}
                    <span>
                      External flash image: {formatSize(layout.externalImageBytes)}
                    </span>
                    <span>
                      {layout.images.filter((entry) => entry.kind === 'image').length} images,{' '}
                      {layout.images.filter((entry) => entry.kind === 'font').length} fonts
                    </span>
                    {layout.images.some(
                      (entry) => entry.region !== 'external-flash'
                        || entry.endRegion !== 'external-flash',
                    ) && (
                      <span className="deploy-region-int">
                        not all of it is in external flash
                      </span>
                    )}
                  </div>
                  <div className="tag-table-wrap">
                    <table className="deploy-placement-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Size</th>
                          <th>Glyphs</th>
                          <th>Memory</th>
                          <th>Section</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layout.images.map((entry) => (
                          <tr key={entry.cArrayName}>
                            <td>
                              {entry.name}
                              <span className="deploy-carray">
                                {entry.kind === 'font' ? 'font · ' : 'image · '}
                                {entry.cArrayName}
                              </span>
                            </td>
                            <td className="deploy-mono">{formatAddress(entry.address)}</td>
                            <td className="deploy-mono">{formatAddress(entry.endAddress)}</td>
                            <td>{formatSize(entry.size)}</td>
                            <td>
                              {entry.glyphCount === undefined ? (
                                <span className="deploy-carray">—</span>
                              ) : (
                                <>
                                  {entry.glyphCount}
                                  {/* The average is what a size alone cannot say:
                                      whether a font is large because it covers a
                                      lot or because each glyph is expensive */}
                                  <span className="deploy-carray">
                                    ~{formatSize(Math.round(entry.size / entry.glyphCount))} each
                                  </span>
                                </>
                              )}
                            </td>
                            <td
                              className={
                                entry.region === 'external-flash'
                                  && entry.endRegion === 'external-flash'
                                  ? 'deploy-region-ext'
                                  : 'deploy-region-int'
                              }
                            >
                              {/* Both ends, because a range that starts in one
                                  region and ends in another is the failure this
                                  panel exists to make visible */}
                              {entry.region === entry.endRegion
                                ? REGION_LABEL[entry.region] ?? entry.region
                                : `${REGION_LABEL[entry.region] ?? entry.region} → ${REGION_LABEL[entry.endRegion] ?? entry.endRegion}`}
                            </td>
                            <td className="deploy-mono">{entry.section}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
      </div>
    </div>
  );
};

export default DeployPanel;
