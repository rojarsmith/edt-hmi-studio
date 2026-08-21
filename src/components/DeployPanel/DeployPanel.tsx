import React, { useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { useDeployStore } from '../../store/deployStore';
import { useDockStore } from '../../store/dockStore';
import { useEditorStore } from '../../store/editorStore';
import { screensHaveVideo } from '../../utils/videoWidgets';
import {
  ORIENTATION_LABELS,
  boardCanDriveOrientation,
  getBoardDefinition,
  getProtocolDefinition,
} from '../../types/hmi';
import '../HmiPanel/hmiPanel.css';
import './DeployPanel.css';


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

  // Everything operational now lives in deployStore, so a build survives the
  // author switching tabs and the dock can drive it too.
  // See docs/bottom-dock-panel.md §3.
  const boardId = useDeployStore((state) => state.boardId);
  const protocol = useDeployStore((state) => state.protocol);
  const orientation = useDeployStore((state) => state.orientation);
  const ports = useDeployStore((state) => state.ports);
  const runtimePort = useDeployStore((state) => state.runtimePort);
  const capabilities = useDeployStore((state) => state.capabilities);
  const busy = useDeployStore((state) => state.busy);
  const buildId = useDeployStore((state) => state.buildId);
  const artifactUrl = useDeployStore((state) => state.artifactUrl);
  const layout = useDeployStore((state) => state.layout);
  const loadProjectContext = useDeployStore((state) => state.loadProjectContext);
  const runBuild = useDeployStore((state) => state.runBuild);
  const runFlash = useDeployStore((state) => state.runFlash);
  const showPane = useDockStore((state) => state.showPane);

  const screens = useEditorStore((state) => state.screens);

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
  /*
   * Two independent reasons a project may not be buildable, and both work the
   * same way: the editor lets it be configured, and this is where it is stopped
   * — before a flash, rather than after one that renders wrong.
   */
  const orientationBuildable = boardCanDriveOrientation(boardId, orientation);
  /*
   * A third, for the same reason. A Video widget needs a JPEG codec to decode
   * its frames and an SD interface to read them, and a board with neither has
   * no slower path to fall back to — so this is stopped here rather than in the
   * compiler, where it would surface as a missing header file.
   */
  const usesVideo = useMemo(() => screensHaveVideo(screens), [screens]);
  const videoBuildable = !usesVideo || board.video !== null;
  const buildable =
    protocolDefinition.implemented && orientationBuildable && videoBuildable;
  const canBuild = buildable
    && serviceAvailable !== false
    && capabilities?.canBuild !== false;
  const canFlash = serviceAvailable !== false && capabilities?.canFlash !== false;

  useEffect(() => {
    if (!currentProjectId) return;
    void loadProjectContext(currentProjectId);
  }, [currentProjectId, loadProjectContext]);

  // Each button also brings its own pane to the front, so the output the author
  // just asked for is the one they are looking at.
  const handleBuild = () => {
    showPane('build');
    void runBuild();
  };

  const handleFlash = () => {
    showPane('flash');
    void runFlash();
  };

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
        {!protocolDefinition.implemented && (
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

        {!orientationBuildable && (
          <div className="hmi-panel-card">
            <div className="hmi-panel-notice" role="note">
              <strong>This project cannot be built.</strong>
              <span>
                It is designed in {ORIENTATION_LABELS[orientation].toLowerCase()},
                and the {board.name} display driver cannot turn its panel — that
                needs a software rotation the firmware does not do yet. The
                design and the previews are unaffected; switch the project back
                to {ORIENTATION_LABELS[
                  orientation === 'portrait' ? 'landscape' : 'portrait'
                ].toLowerCase()} in Project Settings to build it.
              </span>
            </div>
          </div>
        )}

        {!videoBuildable && (
          <div className="hmi-panel-card">
            <div className="hmi-panel-notice" role="note">
              <strong>This project cannot be built.</strong>
              <span>
                It uses a Video widget, and the {board.name} has no JPEG codec
                to decode the frames with — every board that can play video
                decodes it in hardware, because a Cortex-M is not going to do it
                in software while also drawing a UI. The design and the previews
                are unaffected; remove the Video widgets, or move the project to
                a board that can play them, to build it.
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
            <span>Target: {board.model}</span>
            <span>Protocol: {protocolDefinition.name}</span>
            <span>Build ID: {buildId || 'Not built yet'}</span>
            <span>ST-LINK: {selectedPort?.probeSerial || 'Selected automatically by the local service'}</span>
          </div>

          {/* The log itself moved to the bottom dock, where it survives a
              tab switch and where each operation has its own pane and toolbar.
              See docs/bottom-dock-panel.md. */}
          <div className="deploy-log-moved">
            <span>
              Build and flash output appears in the panel below, one pane per
              operation. It keeps running — and keeps its log — if you switch
              tabs.
            </span>
            <div className="deploy-log-moved-links">
              <button type="button" onClick={() => showPane('build')}>
                Open Build output
              </button>
              <button type="button" onClick={() => showPane('flash')}>
                Open Flash output
              </button>
            </div>
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
