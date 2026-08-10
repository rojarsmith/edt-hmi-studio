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
import type {
  BoardId,
  BusAccess,
  CanBusConfig,
  CanFrameFormat,
  CanSignalDataType,
  CanSignalTag,
  CommunicationConfig,
  ModbusDataType,
  ModbusRegisterArea,
  ModbusRegisterTag,
  ProtocolId,
} from '../../types/hmi';
import {
  CAN_BITRATES,
  CAN_DATA_BITRATES,
  DEFAULT_BOARD_ID,
  DEFAULT_PROTOCOL_ID,
  createDefaultCanBusConfig,
  boardSupportsProtocol,
  createDefaultCommunicationConfig,
  getBoardDefinition,
  getBoardProtocols,
  getProtocolDefinition,
  maxCanFrameId,
} from '../../types/hmi';
import {
  getHmiCapabilities,
  listHmiPorts,
  testHmiPort,
  type HmiCapabilities,
  type HmiSerialPort,
} from '../../services/hmiApi';
import { useDebouncedPersistence } from '../../hooks/useDebouncedPersistence';
import '../HmiPanel/hmiPanel.css';
import './ProtocolPanel.css';

type BusyAction = 'loading' | 'saving' | 'testing' | null;

type StatusMessage = {
  kind: 'info' | 'error';
  text: string;
} | null;

interface ConfigurationSnapshot {
  projectId: string;
  boardId: BoardId;
  protocol: ProtocolId;
  communication: CommunicationConfig;
  canBus: CanBusConfig;
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

const ACCESS_OPTIONS: { value: BusAccess; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'readwrite', label: 'Read / Write' },
];

const CAN_DATA_TYPES: { value: CanSignalDataType; label: string }[] = [
  { value: 'bool', label: 'bool' },
  { value: 'unsigned', label: 'unsigned' },
  { value: 'signed', label: 'signed' },
  { value: 'float32', label: 'float32' },
];

function cloneCommunication(config?: CommunicationConfig): CommunicationConfig {
  const defaults = createDefaultCommunicationConfig();
  return {
    ...defaults,
    ...(config || {}),
    tags: (config?.tags || []).map((tag) => ({ ...tag })),
  };
}

function cloneCanBus(config?: CanBusConfig): CanBusConfig {
  const defaults = createDefaultCanBusConfig();
  return {
    ...defaults,
    ...(config || {}),
    signals: (config?.signals || []).map((signal) => ({ ...signal })),
  };
}

function isReadOnlyArea(area: ModbusRegisterArea): boolean {
  return area === 'discrete-input' || area === 'input-register';
}

function parseFrameId(input: string, format: CanFrameFormat): number {
  const parsed = Number.parseInt(input.replace(/^0x/i, ''), 16);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(maxCanFrameId(format), parsed);
}

const ProtocolPanel: React.FC = () => {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const { getProjectConfig, updateProjectConfig } = useProjectStore();
  const syncModbusBindings = useEditorStore(
    (state) => state.syncModbusBindings,
  );

  /* Replaced by the project's own board as soon as its config loads. */
  const [boardId, setBoardId] = useState<BoardId>(DEFAULT_BOARD_ID);
  const [protocol, setProtocol] = useState<ProtocolId>(DEFAULT_PROTOCOL_ID);
  const [communication, setCommunication] = useState<CommunicationConfig>(
    createDefaultCommunicationConfig,
  );
  const [canBus, setCanBus] = useState<CanBusConfig>(createDefaultCanBusConfig);
  const [ports, setPorts] = useState<HmiSerialPort[]>([]);
  const [capabilities, setCapabilities] = useState<HmiCapabilities | null>(null);
  const [busy, setBusy] = useState<BusyAction>('loading');
  const [portsLoading, setPortsLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const configurationRevision = useRef(0);

  const board = useMemo(() => getBoardDefinition(boardId), [boardId]);
  const boardProtocols = useMemo(() => getBoardProtocols(boardId), [boardId]);
  const protocolDefinition = useMemo(
    () => getProtocolDefinition(protocol),
    [protocol],
  );
  const parityCode = communication.parity === 'even'
    ? 'E'
    : communication.parity === 'odd'
      ? 'O'
      : 'N';
  const serialFormat =
    `${communication.dataBits}${parityCode}${communication.stopBits}`;
  const serviceAvailable = capabilities
    ? capabilities.available !== false
      && capabilities.programmerAvailable !== false
      && capabilities.success
    : null;

  const report = useCallback((kind: 'info' | 'error', text: string) => {
    setStatus({ kind, text });
  }, []);

  const persistConfigurationSnapshot = useCallback(async (
    snapshot: ConfigurationSnapshot,
  ) => {
    const latest = await getProjectConfig(snapshot.projectId);
    if (!latest) throw new Error('Project configuration not found');
    await updateProjectConfig({
      ...latest,
      boardId: snapshot.boardId,
      protocol: snapshot.protocol,
      communication: cloneCommunication(snapshot.communication),
      canBus: cloneCanBus(snapshot.canBus),
    });
  }, [getProjectConfig, updateProjectConfig]);

  const {
    schedule: scheduleConfigurationSave,
    flush: flushConfigurationSave,
    cancel: cancelConfigurationSave,
  } = useDebouncedPersistence(persistConfigurationSnapshot, {
    delayMs: 600,
    onPersisted: (snapshot) => {
      if (snapshot.revision === configurationRevision.current) {
        setDirty(false);
      }
    },
    onError: (error) => {
      report(
        'error',
        `Failed to auto-save protocol settings: ${error instanceof Error ? error.message : String(error)}`,
      );
    },
  });

  const scheduleSave = useCallback((next: {
    protocol?: ProtocolId;
    communication?: CommunicationConfig;
    canBus?: CanBusConfig;
  }) => {
    if (!currentProjectId) return;
    configurationRevision.current += 1;
    scheduleConfigurationSave({
      projectId: currentProjectId,
      boardId,
      protocol: next.protocol ?? protocol,
      communication: cloneCommunication(next.communication ?? communication),
      canBus: cloneCanBus(next.canBus ?? canBus),
      revision: configurationRevision.current,
    });
    setDirty(true);
  }, [
    boardId,
    canBus,
    communication,
    currentProjectId,
    protocol,
    scheduleConfigurationSave,
  ]);

  const updateCommunication = useCallback((
    updates: Partial<CommunicationConfig>,
  ) => {
    const next = { ...communication, ...updates };
    setCommunication(next);
    if (updates.tags) {
      syncModbusBindings(updates.tags);
    }
    scheduleSave({ communication: next });
  }, [communication, scheduleSave, syncModbusBindings]);

  const updateCanBus = useCallback((updates: Partial<CanBusConfig>) => {
    const next = { ...canBus, ...updates };
    setCanBus(next);
    scheduleSave({ canBus: next });
  }, [canBus, scheduleSave]);

  const selectProtocol = useCallback((next: ProtocolId) => {
    setProtocol(next);
    scheduleSave({ protocol: next });
  }, [scheduleSave]);

  const refreshPorts = useCallback(async () => {
    setPortsLoading(true);
    try {
      const result = await listHmiPorts();
      setPorts(result.ports);
      if (!result.success) {
        report('error', `Failed to list COM ports: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      report('error', `Failed to list COM ports: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPortsLoading(false);
    }
  }, [report]);

  useEffect(() => {
    let cancelled = false;
    if (!currentProjectId) {
      setBusy(null);
      return;
    }

    configurationRevision.current += 1;
    setDirty(false);
    void flushConfigurationSave().catch(() => {
      // The autosave hook reports the failure through onError.
    });
    setBusy('loading');
    getProjectConfig(currentProjectId)
      .then((config) => {
        if (cancelled || !config) return;
        setBoardId(config.boardId);
        setProtocol(config.protocol ?? DEFAULT_PROTOCOL_ID);
        setCommunication(cloneCommunication(config.communication));
        setCanBus(cloneCanBus(config.canBus));
        setDirty(false);
      })
      .catch((error) => {
        if (!cancelled) {
          report('error', `Failed to load project protocol settings: ${String(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });

    getHmiCapabilities()
      .then((result) => {
        if (cancelled) return;
        setCapabilities(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setCapabilities({ success: false, available: false, error: String(error) });
      });

    refreshPorts();
    return () => {
      cancelled = true;
    };
  }, [
    currentProjectId,
    flushConfigurationSave,
    getProjectConfig,
    refreshPorts,
    report,
  ]);

  const handleSave = useCallback(async () => {
    if (!currentProjectId) return;
    setBusy('saving');
    try {
      cancelConfigurationSave();
      configurationRevision.current += 1;
      scheduleConfigurationSave({
        projectId: currentProjectId,
        boardId,
        protocol,
        communication: cloneCommunication(communication),
        canBus: cloneCanBus(canBus),
        revision: configurationRevision.current,
      });
      await flushConfigurationSave();
      report('info', 'Protocol settings saved.');
    } catch (error) {
      report('error', `Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }, [
    boardId,
    canBus,
    cancelConfigurationSave,
    communication,
    currentProjectId,
    flushConfigurationSave,
    protocol,
    report,
    scheduleConfigurationSave,
  ]);

  const handleTestPort = useCallback(async () => {
    if (!communication.port) {
      report('error', 'Select a COM port first.');
      return;
    }
    setBusy('testing');
    try {
      const result = await testHmiPort(communication.port);
      report(
        result.success ? 'info' : 'error',
        result.success
          ? `${communication.port} test succeeded.`
          : `${communication.port} test failed: ${result.error || 'Unknown error'}`,
      );
    } catch (error) {
      report('error', `Test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }, [communication.port, report]);

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

  const addSignal = () => {
    const signal: CanSignalTag = {
      id: uuidv4(),
      name: `Signal ${canBus.signals.length + 1}`,
      frameId: 0x100,
      frameFormat: canBus.defaultFrameFormat,
      startBit: 0,
      bitLength: 8,
      byteOrder: 'little-endian',
      dataType: 'unsigned',
      access: 'readwrite',
      scale: 1,
      offset: 0,
      pollIntervalMs: canBus.pollIntervalMs,
    };
    updateCanBus({ signals: [...canBus.signals, signal] });
  };

  const updateSignal = (signalId: string, updates: Partial<CanSignalTag>) => {
    updateCanBus({
      signals: canBus.signals.map((signal) => (
        signal.id === signalId ? { ...signal, ...updates } : signal
      )),
    });
  };

  const removeSignal = (signalId: string) => {
    updateCanBus({
      signals: canBus.signals.filter((signal) => signal.id !== signalId),
    });
  };

  if (!currentProjectId) {
    return <div className="hmi-panel hmi-panel-empty">Open a project first.</div>;
  }

  return (
    <div className="hmi-panel protocol-panel">
      <div className="hmi-panel-header">
        <div>
          <h2>Protocol / {protocolDefinition.name}</h2>
          <p>
            {board.name}
            {protocol === 'modbus-rtu'
              ? ' · Modbus RTU Client · ST-LINK Virtual COM'
              : ' · CAN frames and signals'}
          </p>
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
              <strong>{protocolDefinition.name} is configuration only.</strong>
              <span>
                Settings are saved with the project, but the binding generator
                and the board firmware do not implement this protocol yet, so a
                project using it cannot be built.
              </span>
            </div>
          </div>
        )}

        <section className="hmi-panel-card">
          <div className="hmi-panel-card-title">
            <div>
              <h3>Protocol</h3>
              <p>{protocolDefinition.summary}</p>
            </div>
            {boardProtocols.length > 1 ? (
              <label className="hmi-panel-field">
                <span>Protocol</span>
                <select
                  value={protocol}
                  onChange={(event) => selectProtocol(event.target.value as ProtocolId)}
                >
                  {boardProtocols.map((id) => (
                    <option key={id} value={id}>
                      {getProtocolDefinition(id).name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              /* The board drives exactly one bus, so the choice made at project
                 creation is the only one available; show it rather than a
                 single-entry dropdown. A project can still name a protocol the
                 board does not offer — an imported file, or a board that
                 dropped one — and saying "fixed by" there would be a lie. */
              <span className="protocol-badge">
                {boardSupportsProtocol(boardId, protocol)
                  ? `${protocolDefinition.name} · fixed by ${board.name}`
                  : `${protocolDefinition.name} · not offered by ${board.name}`}
              </span>
            )}
          </div>

          <div className="hmi-panel-card-title">
            <div>
              {status && (
                <p
                  className={status.kind === 'error' ? 'protocol-status error' : 'protocol-status'}
                  role="status"
                  aria-live="polite"
                >
                  {status.text}
                </p>
              )}
            </div>
            <div className="hmi-panel-inline">
              {dirty && <span className="hmi-panel-dirty">Unsaved changes</span>}
              <button type="button" onClick={handleSave} disabled={busy !== null}>
                {busy === 'saving' ? 'Saving...' : 'Save Now'}
              </button>
            </div>
          </div>
        </section>

        {protocol === 'modbus-rtu' ? (
          <>
            <section className="hmi-panel-card">
              <div className="hmi-panel-card-title">
                <h3>Serial / Modbus RTU</h3>
                <label className="hmi-panel-enable">
                  <input
                    type="checkbox"
                    checked={communication.enabled}
                    onChange={(event) => updateCommunication({ enabled: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>

              <div className="hmi-panel-grid">
                <label className="hmi-panel-field hmi-panel-field-wide">
                  <span>COM port (Modbus runtime)</span>
                  <div className="hmi-panel-inline">
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

                <label className="hmi-panel-field">
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

                <label className="hmi-panel-field">
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

                <label className="hmi-panel-field">
                  <span>Data bits</span>
                  <input value={communication.dataBits} disabled />
                </label>

                <label className="hmi-panel-field">
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

                <label className="hmi-panel-field">
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

                <label className="hmi-panel-field">
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

                <label className="hmi-panel-field">
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

                <label className="hmi-panel-field">
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

            <section className="hmi-panel-card">
              <div className="hmi-panel-card-title">
                <div>
                  <h3>Register tags</h3>
                  <p>Create a reusable Modbus address table.</p>
                </div>
                <button type="button" className="hmi-panel-primary" onClick={addTag}>
                  + Add Tag
                </button>
              </div>

              <div className="tag-table-wrap">
                <table className="tag-table modbus-tag-table">
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
                              access: event.target.value as BusAccess,
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
          </>
        ) : (
          <>
            <section className="hmi-panel-card">
              <div className="hmi-panel-card-title">
                <h3>CAN bus</h3>
                <label className="hmi-panel-enable">
                  <input
                    type="checkbox"
                    checked={canBus.enabled}
                    onChange={(event) => updateCanBus({ enabled: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>

              <div className="hmi-panel-grid">
                <label className="hmi-panel-field">
                  <span>Bitrate (bit/s)</span>
                  <select
                    value={canBus.bitrate}
                    onChange={(event) => updateCanBus({ bitrate: Number(event.target.value) })}
                  >
                    {CAN_BITRATES.map((rate) => (
                      <option key={rate} value={rate}>{rate.toLocaleString('en-US')}</option>
                    ))}
                  </select>
                </label>

                <label className="hmi-panel-field">
                  <span>Sample point (%)</span>
                  <input
                    type="number"
                    min={50}
                    max={95}
                    value={canBus.samplePointPercent}
                    onChange={(event) => updateCanBus({
                      samplePointPercent: Math.min(95, Math.max(50, Number(event.target.value) || 75)),
                    })}
                  />
                </label>

                <label className="hmi-panel-field">
                  <span>Mode</span>
                  <select
                    value={canBus.mode}
                    onChange={(event) => updateCanBus({
                      mode: event.target.value as CanBusConfig['mode'],
                    })}
                  >
                    <option value="normal">Normal</option>
                    <option value="listen-only">Listen only</option>
                    <option value="loopback">Loopback (self test)</option>
                  </select>
                </label>

                <label className="hmi-panel-field">
                  <span>Default frame format</span>
                  <select
                    value={canBus.defaultFrameFormat}
                    onChange={(event) => updateCanBus({
                      defaultFrameFormat: event.target.value as CanFrameFormat,
                    })}
                  >
                    <option value="standard">Standard (11-bit)</option>
                    <option value="extended">Extended (29-bit)</option>
                  </select>
                </label>

                <label className="hmi-panel-field">
                  <span>CAN FD</span>
                  <select
                    value={canBus.fd ? 'on' : 'off'}
                    onChange={(event) => updateCanBus({ fd: event.target.value === 'on' })}
                  >
                    <option value="off">Classic CAN</option>
                    <option value="on">CAN FD (bit rate switching)</option>
                  </select>
                </label>

                <label className="hmi-panel-field">
                  <span>Data bitrate (bit/s)</span>
                  <select
                    value={canBus.dataBitrate}
                    disabled={!canBus.fd}
                    onChange={(event) => updateCanBus({ dataBitrate: Number(event.target.value) })}
                  >
                    {CAN_DATA_BITRATES.map((rate) => (
                      <option key={rate} value={rate}>{rate.toLocaleString('en-US')}</option>
                    ))}
                  </select>
                  <small>Applies to the data phase only, and only when CAN FD is on.</small>
                </label>

                <label className="hmi-panel-field">
                  <span>Default poll (ms)</span>
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={canBus.pollIntervalMs}
                    onChange={(event) => updateCanBus({
                      pollIntervalMs: Math.max(10, Number(event.target.value) || 10),
                    })}
                  />
                </label>
              </div>
            </section>

            <section className="hmi-panel-card">
              <div className="hmi-panel-card-title">
                <div>
                  <h3>Signals</h3>
                  <p>Each signal is a bit window inside a CAN frame's payload.</p>
                </div>
                <button type="button" className="hmi-panel-primary" onClick={addSignal}>
                  + Add Signal
                </button>
              </div>

              <div className="tag-table-wrap">
                <table className="tag-table can-tag-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Frame ID</th>
                      <th>Format</th>
                      <th>Start bit</th>
                      <th>Length</th>
                      <th>Byte order</th>
                      <th>Data type</th>
                      <th>Access</th>
                      <th>Scale</th>
                      <th>Offset</th>
                      <th>Poll ms</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {canBus.signals.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="tag-empty">
                          No signals yet.
                        </td>
                      </tr>
                    ) : canBus.signals.map((signal) => (
                      <tr key={signal.id}>
                        <td>
                          <input
                            value={signal.name}
                            onChange={(event) => updateSignal(signal.id, { name: event.target.value })}
                          />
                        </td>
                        <td>
                          <div className="can-frame-id">
                            <span className="can-frame-id-prefix">0x</span>
                            <input
                              value={signal.frameId.toString(16).toUpperCase()}
                              onChange={(event) => updateSignal(signal.id, {
                                frameId: parseFrameId(event.target.value, signal.frameFormat),
                              })}
                            />
                          </div>
                        </td>
                        <td>
                          <select
                            value={signal.frameFormat}
                            onChange={(event) => {
                              const frameFormat = event.target.value as CanFrameFormat;
                              updateSignal(signal.id, {
                                frameFormat,
                                // Narrowing to 11-bit cannot keep a 29-bit id.
                                frameId: Math.min(maxCanFrameId(frameFormat), signal.frameId),
                              });
                            }}
                          >
                            <option value="standard">Standard</option>
                            <option value="extended">Extended</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={63}
                            value={signal.startBit}
                            onChange={(event) => updateSignal(signal.id, {
                              startBit: Math.min(63, Math.max(0, Number(event.target.value) || 0)),
                            })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={64}
                            value={signal.bitLength}
                            onChange={(event) => updateSignal(signal.id, {
                              bitLength: Math.min(64, Math.max(1, Number(event.target.value) || 1)),
                            })}
                          />
                        </td>
                        <td>
                          <select
                            value={signal.byteOrder}
                            onChange={(event) => updateSignal(signal.id, {
                              byteOrder: event.target.value as CanSignalTag['byteOrder'],
                            })}
                          >
                            <option value="little-endian">Little endian</option>
                            <option value="big-endian">Big endian</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={signal.dataType}
                            onChange={(event) => updateSignal(signal.id, {
                              dataType: event.target.value as CanSignalDataType,
                            })}
                          >
                            {CAN_DATA_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={signal.access}
                            onChange={(event) => updateSignal(signal.id, {
                              access: event.target.value as BusAccess,
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
                            value={signal.scale}
                            onChange={(event) => updateSignal(signal.id, {
                              scale: Number(event.target.value) || 1,
                            })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={signal.offset}
                            onChange={(event) => updateSignal(signal.id, {
                              offset: Number(event.target.value) || 0,
                            })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={10}
                            step={10}
                            value={signal.pollIntervalMs}
                            onChange={(event) => updateSignal(signal.id, {
                              pollIntervalMs: Math.max(10, Number(event.target.value) || 10),
                            })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="tag-delete"
                            onClick={() => removeSignal(signal.id)}
                            title="Delete signal"
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
          </>
        )}
      </div>
    </div>
  );
};

export default ProtocolPanel;
