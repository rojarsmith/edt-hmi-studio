import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources';
import { useLogicEditorStore } from '../LogicEditor';
import type {
  BoardId,
  CommunicationConfig,
  ModbusAccess,
  ModbusDataType,
  ModbusRegisterArea,
  ModbusRegisterTag,
} from '../../types/hmi';
import {
  createDefaultCommunicationConfig,
  DEFAULT_BOARD_ID,
  getBoardDefinition,
} from '../../types/hmi';
import {
  buildHmiProject,
  flashHmiBuild,
  getHmiCapabilities,
  listHmiPorts,
  testHmiPort,
  type HmiCapabilities,
  type HmiSerialPort,
} from '../../services/hmiApi';
import { useDebouncedPersistence } from '../../hooks/useDebouncedPersistence';
import './CommunicationPanel.css';

type BusyAction = 'loading' | 'saving' | 'testing' | 'building' | 'flashing' | null;
type LogCopyFeedback = {
  kind: 'success' | 'error';
  message: string;
} | null;

interface ConfigurationSnapshot {
  projectId: string;
  boardId: BoardId;
  communication: CommunicationConfig;
  revision: number;
}

const REGISTER_AREAS: { value: ModbusRegisterArea; label: string }[] = [
  { value: 'coil', label: 'Coil (0x)' },
  { value: 'discrete-input', label: 'Discrete Input (1x)' },
  { value: 'input-register', label: 'Input Register (3x)' },
  { value: 'holding-register', label: 'Holding Register (4x)' },
];

const DATA_TYPES: ModbusDataType[] = [
  'bool',
  'uint16',
  'int16',
  'uint32',
  'int32',
  'float32',
];

const ACCESS_OPTIONS: { value: ModbusAccess; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'readwrite', label: 'Read / Write' },
];

function cloneCommunication(config?: CommunicationConfig): CommunicationConfig {
  const defaults = createDefaultCommunicationConfig();
  return {
    ...defaults,
    ...(config || {}),
    tags: (config?.tags || []).map((tag) => ({ ...tag })),
  };
}

function isReadOnlyArea(area: ModbusRegisterArea): boolean {
  return area === 'discrete-input' || area === 'input-register';
}

const CommunicationPanel: React.FC = () => {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const {
    getProjectConfig,
    updateProjectConfig,
    saveProjectData,
    exportProject,
  } = useProjectStore();
  const pages = useEditorStore((state) => state.pages);
  const syncModbusBindings = useEditorStore(
    (state) => state.syncModbusBindings,
  );
  const logicGraphs = useLogicEditorStore((state) => state.graphs);
  const images = useResourceStore((state) => state.images);
  const fonts = useResourceStore((state) => state.fonts);

  /* Replaced by the project's own board as soon as its config loads. */
  const [boardId, setBoardId] = useState<BoardId>(DEFAULT_BOARD_ID);
  const [communication, setCommunication] = useState<CommunicationConfig>(
    createDefaultCommunicationConfig,
  );
  const [ports, setPorts] = useState<HmiSerialPort[]>([]);
  const [capabilities, setCapabilities] = useState<HmiCapabilities | null>(null);
  const [busy, setBusy] = useState<BusyAction>('loading');
  const [portsLoading, setPortsLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [buildId, setBuildId] = useState('');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [logCopyFeedback, setLogCopyFeedback] = useState<LogCopyFeedback>(null);
  const communicationRevision = useRef(0);

  const board = useMemo(() => getBoardDefinition(boardId), [boardId]);
  const parityCode = communication.parity === 'even'
    ? 'E'
    : communication.parity === 'odd'
      ? 'O'
      : 'N';
  const serialFormat =
    `${communication.dataBits}${parityCode}${communication.stopBits}`;
  const selectedPort = useMemo(
    () => ports.find((port) => port.path === communication.port),
    [ports, communication.port],
  );
  const serviceAvailable = capabilities
    ? capabilities.available !== false
      && capabilities.programmerAvailable !== false
      && capabilities.success
    : null;
  const canBuild = serviceAvailable !== false && capabilities?.canBuild !== false;
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

  const persistConfigurationSnapshot = useCallback(async (
    snapshot: ConfigurationSnapshot,
  ) => {
    const latest = await getProjectConfig(snapshot.projectId);
    if (!latest) throw new Error('Project configuration not found');
    await updateProjectConfig({
      ...latest,
      boardId: snapshot.boardId,
      communication: cloneCommunication(snapshot.communication),
    });
  }, [getProjectConfig, updateProjectConfig]);

  const {
    schedule: scheduleConfigurationSave,
    flush: flushConfigurationSave,
    cancel: cancelConfigurationSave,
  } = useDebouncedPersistence(persistConfigurationSnapshot, {
    delayMs: 600,
    onPersisted: (snapshot) => {
      if (snapshot.revision === communicationRevision.current) {
        setDirty(false);
      }
    },
    onError: (error) => {
      appendLog(
        `Failed to auto-save communication settings: ${error instanceof Error ? error.message : String(error)}`,
      );
    },
  });

  const updateCommunication = useCallback((updates: Partial<CommunicationConfig>) => {
    const next = { ...communication, ...updates };
    setCommunication(next);
    if (updates.tags) {
      syncModbusBindings(updates.tags);
    }
    if (currentProjectId) {
      communicationRevision.current += 1;
      scheduleConfigurationSave({
        projectId: currentProjectId,
        boardId,
        communication: cloneCommunication(next),
        revision: communicationRevision.current,
      });
    }
    setDirty(true);
  }, [
    boardId,
    communication,
    currentProjectId,
    scheduleConfigurationSave,
    syncModbusBindings,
  ]);

  const refreshPorts = useCallback(async () => {
    setPortsLoading(true);
    try {
      const result = await listHmiPorts();
      setPorts(result.ports);
      if (result.log.length > 0) appendLog(result.log);
      if (!result.success) appendLog(`Failed to list COM ports: ${result.error || 'Unknown error'}`);
    } catch (error) {
      appendLog(`Failed to list COM ports: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPortsLoading(false);
    }
  }, [appendLog]);

  useEffect(() => {
    let cancelled = false;
    if (!currentProjectId) {
      setBusy(null);
      return;
    }

    communicationRevision.current += 1;
    setDirty(false);
    void flushConfigurationSave().catch(() => {
      // The autosave hook reports the failure through appendLog.
    });
    setBusy('loading');
    setBuildId('');
    setArtifactUrl('');
    getProjectConfig(currentProjectId)
      .then((config) => {
        if (cancelled || !config) return;
        setBoardId(config.boardId);
        setCommunication(cloneCommunication(config.communication));
        setDirty(false);
      })
      .catch((error) => {
        if (!cancelled) {
          appendLog(`Failed to load project communication settings: ${String(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
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
    flushConfigurationSave,
    getProjectConfig,
    refreshPorts,
  ]);

  const persistConfiguration = useCallback(async () => {
    if (!currentProjectId) throw new Error('No project is currently open');
    cancelConfigurationSave();
    scheduleConfigurationSave({
      projectId: currentProjectId,
      boardId,
      communication: cloneCommunication(communication),
      revision: communicationRevision.current,
    });
    await flushConfigurationSave();
  }, [
    boardId,
    cancelConfigurationSave,
    communication,
    currentProjectId,
    flushConfigurationSave,
    scheduleConfigurationSave,
  ]);

  const handleSave = useCallback(async () => {
    setBusy('saving');
    try {
      await persistConfiguration();
      appendLog('Communication settings saved.');
    } catch (error) {
      appendLog(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }, [appendLog, persistConfiguration]);

  const handleTestPort = useCallback(async () => {
    if (!communication.port) {
      appendLog('Select a COM port first.');
      return;
    }
    setBusy('testing');
    try {
      const result = await testHmiPort(communication.port);
      appendLog(result.log);
      appendLog(result.success
        ? `${communication.port} test succeeded.`
        : `${communication.port} test failed: ${result.error || 'Unknown error'}`);
    } catch (error) {
      appendLog(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }, [appendLog, communication.port]);

  const handleBuild = useCallback(async () => {
    if (!currentProjectId) return;
    setBusy('building');
    setBuildId('');
    setArtifactUrl('');
    try {
      await persistConfiguration();
      await saveProjectData(currentProjectId, pages, logicGraphs, images, fonts);
      const project = await exportProject(currentProjectId);
      const result = await buildHmiProject(project);
      appendLog(result.log);
      if (!result.success) {
        appendLog(`Firmware build failed: ${result.error || 'Unknown error'}`);
        return;
      }
      if (result.buildId) setBuildId(result.buildId);
      if (result.artifact?.downloadUrl) setArtifactUrl(result.artifact.downloadUrl);
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
    fonts,
    images,
    logicGraphs,
    pages,
    persistConfiguration,
    saveProjectData,
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

  const addTag = () => {
    const tag: ModbusRegisterTag = {
      id: uuidv4(),
      name: `Tag ${communication.tags.length + 1}`,
      area: 'holding-register',
      address: 0,
      dataType: 'uint16',
      access: 'readwrite',
      scale: 1,
      pollIntervalMs: communication.pollIntervalMs,
    };
    updateCommunication({ tags: [...communication.tags, tag] });
  };

  const updateTag = (tagId: string, updates: Partial<ModbusRegisterTag>) => {
    updateCommunication({
      tags: communication.tags.map((tag) => (
        tag.id === tagId ? { ...tag, ...updates } : tag
      )),
    });
  };

  const removeTag = (tagId: string) => {
    updateCommunication({
      tags: communication.tags.filter((tag) => tag.id !== tagId),
    });
  };

  if (!currentProjectId) {
    return <div className="communication-panel communication-empty">Open a project first.</div>;
  }

  return (
    <div className="communication-panel">
      <div className="communication-header">
        <div>
          <h2>Communication / Modbus</h2>
          <p>{board.name} · Modbus RTU Client · ST-LINK Virtual COM</p>
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

      <div className="communication-scroll">
        <section className="communication-card">
          <div className="communication-card-title">
            <h3>Serial / Modbus RTU</h3>
            <label className="communication-enable">
              <input
                type="checkbox"
                checked={communication.enabled}
                onChange={(event) => updateCommunication({ enabled: event.target.checked })}
              />
              Enabled
            </label>
          </div>

          <div className="communication-grid">
            <label className="communication-field communication-field-wide">
              <span>COM port (Modbus runtime)</span>
              <div className="communication-inline">
                <select
                  value={communication.port}
                  onChange={(event) => updateCommunication({ port: event.target.value })}
                >
                  <option value="">Select a COM port...</option>
                  {ports.map((port) => (
                    <option key={port.path} value={port.path}>
                      {port.path} — {port.displayName}
                      {port.boardName ? ` / ${port.boardName}` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={refreshPorts} disabled={portsLoading}>
                  {portsLoading ? 'Scanning...' : 'Scan Again'}
                </button>
                <button
                  type="button"
                  onClick={handleTestPort}
                  disabled={!communication.port || busy !== null}
                >
                  Test
                </button>
              </div>
              <small>The COM number may change. It is used only for PC↔board Modbus communication, not for SWD flashing.</small>
            </label>

            <label className="communication-field">
              <span>Baud rate</span>
              <select
                value={communication.baudRate}
                onChange={(event) => updateCommunication({ baudRate: Number(event.target.value) })}
              >
                {[9600, 19200, 38400, 57600, 115200].map((rate) => (
                  <option key={rate} value={rate}>{rate}</option>
                ))}
              </select>
            </label>

            <label className="communication-field">
              <span>Parity</span>
              <select
                value={communication.parity}
                onChange={(event) => updateCommunication({
                  parity: event.target.value as CommunicationConfig['parity'],
                })}
              >
                <option value="none">None</option>
                <option value="even">Even</option>
                <option value="odd">Odd</option>
              </select>
            </label>

            <label className="communication-field">
              <span>Data bits</span>
              <input value={communication.dataBits} disabled />
            </label>

            <label className="communication-field">
              <span>Stop bits</span>
              <select
                value={communication.stopBits}
                onChange={(event) => updateCommunication({
                  stopBits: Number(event.target.value) as 1 | 2,
                })}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>

            <label className="communication-field">
              <span>Server unit ID</span>
              <input
                type="number"
                min={1}
                max={247}
                value={communication.unitId}
                onChange={(event) => updateCommunication({
                  unitId: Math.min(247, Math.max(1, Number(event.target.value) || 1)),
                })}
              />
            </label>

            <label className="communication-field">
              <span>Timeout (ms)</span>
              <input
                type="number"
                min={100}
                step={100}
                value={communication.timeoutMs}
                onChange={(event) => updateCommunication({
                  timeoutMs: Math.max(100, Number(event.target.value) || 100),
                })}
              />
            </label>

            <label className="communication-field">
              <span>Retries</span>
              <input
                type="number"
                min={0}
                max={10}
                value={communication.retries}
                onChange={(event) => updateCommunication({
                  retries: Math.min(10, Math.max(0, Number(event.target.value) || 0)),
                })}
              />
            </label>

            <label className="communication-field">
              <span>Default poll (ms)</span>
              <input
                type="number"
                min={50}
                step={50}
                value={communication.pollIntervalMs}
                onChange={(event) => updateCommunication({
                  pollIntervalMs: Math.max(50, Number(event.target.value) || 50),
                })}
              />
            </label>
          </div>

          <div className="modbus-wire-settings" role="note">
            <strong>PC server must match:</strong>
            <span>
              {communication.port || 'COM not selected'} · {communication.baudRate} baud ·{' '}
              {serialFormat} · Unit {communication.unitId} · no RTS/CTS flow control
            </span>
            <small>
              Editor/PDU address 0 = Holding Register 400001; address 1 = 400002.
            </small>
          </div>
        </section>

        <section className="communication-card">
          <div className="communication-card-title">
            <div>
              <h3>Register tags</h3>
              <p>Create a reusable Modbus address table.</p>
            </div>
            <button type="button" className="communication-primary" onClick={addTag}>
              + Add Tag
            </button>
          </div>

          <div className="tag-table-wrap">
            <table className="tag-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Area</th>
                  <th>Address</th>
                  <th>Data type</th>
                  <th>Access</th>
                  <th>Scale</th>
                  <th>Poll ms</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {communication.tags.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="tag-empty">
                      No tags yet. Widgets can still bind directly to addresses.
                    </td>
                  </tr>
                ) : communication.tags.map((tag) => (
                  <tr key={tag.id}>
                    <td>
                      <input
                        value={tag.name}
                        onChange={(event) => updateTag(tag.id, { name: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={tag.area}
                        onChange={(event) => {
                          const area = event.target.value as ModbusRegisterArea;
                          updateTag(tag.id, {
                            area,
                            ...(isReadOnlyArea(area) ? { access: 'read' as const } : {}),
                            ...(
                              area === 'coil' || area === 'discrete-input'
                                ? { dataType: 'bool' as const }
                                : {}
                            ),
                          });
                        }}
                      >
                        {REGISTER_AREAS.map((area) => (
                          <option key={area.value} value={area.value}>{area.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={65535}
                        value={tag.address}
                        onChange={(event) => updateTag(tag.id, {
                          address: Math.min(65535, Math.max(0, Number(event.target.value) || 0)),
                        })}
                      />
                    </td>
                    <td>
                      <select
                        value={tag.dataType}
                        disabled={tag.area === 'coil' || tag.area === 'discrete-input'}
                        onChange={(event) => updateTag(tag.id, {
                          dataType: event.target.value as ModbusDataType,
                        })}
                      >
                        {DATA_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={tag.access}
                        disabled={isReadOnlyArea(tag.area)}
                        onChange={(event) => updateTag(tag.id, {
                          access: event.target.value as ModbusAccess,
                        })}
                      >
                        {ACCESS_OPTIONS.map((access) => (
                          <option key={access.value} value={access.value}>{access.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={tag.scale}
                        onChange={(event) => updateTag(tag.id, {
                          scale: Number(event.target.value) || 1,
                        })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={50}
                        step={50}
                        value={tag.pollIntervalMs}
                        onChange={(event) => updateTag(tag.id, {
                          pollIntervalMs: Math.max(50, Number(event.target.value) || 50),
                        })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="tag-delete"
                        onClick={() => removeTag(tag.id)}
                        title="Delete tag"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="communication-card">
          <div className="communication-card-title">
            <div>
              <h3>Build & Flash</h3>
              <p>Build complete {board.name} firmware, then flash it through ST-LINK SWD.</p>
            </div>
            {dirty && <span className="communication-dirty">Unsaved changes</span>}
          </div>
          <div className="build-actions">
            <button type="button" onClick={handleSave} disabled={busy !== null}>
              {busy === 'saving' ? 'Saving...' : 'Save Communication Settings'}
            </button>
            <button
              type="button"
              className="communication-primary"
              onClick={handleBuild}
              disabled={busy !== null || !canBuild}
            >
              {busy === 'building' ? 'Building...' : 'Build Firmware'}
            </button>
            <button
              type="button"
              className="communication-danger"
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
          <div className="build-target">
            <span>Target: {board.name}</span>
            <span>Build ID: {buildId || 'Not built yet'}</span>
            <span>ST-LINK: {selectedPort?.probeSerial || 'Selected automatically by the local service'}</span>
          </div>
          <div className="communication-log">
            <div className="communication-log-header">
              <span>Build / Flash log</span>
              <div className="communication-log-controls">
                {logCopyFeedback && (
                  <span
                    className={`communication-log-feedback ${logCopyFeedback.kind}`}
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
      </div>
    </div>
  );
};

export default CommunicationPanel;
