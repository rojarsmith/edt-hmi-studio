import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtocolPanel from '../ProtocolPanel';

const mocks = vi.hoisted(() => ({
  getProjectConfig: vi.fn(),
  updateProjectConfig: vi.fn(),
  syncModbusBindings: vi.fn(),
  getHmiCapabilities: vi.fn(),
  listHmiPorts: vi.fn(),
  testHmiPort: vi.fn(),
}));

vi.mock('../../../store/appStore', () => ({
  useAppStore: (selector: (state: { currentProjectId: string }) => unknown) =>
    selector({ currentProjectId: 'project-1' }),
}));

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: () => ({
    getProjectConfig: mocks.getProjectConfig,
    updateProjectConfig: mocks.updateProjectConfig,
  }),
}));

vi.mock('../../../store/editorStore', () => ({
  useEditorStore: (
    selector: (state: {
      syncModbusBindings: typeof mocks.syncModbusBindings;
    }) => unknown,
  ) => selector({ syncModbusBindings: mocks.syncModbusBindings }),
}));

vi.mock('../../../services/hmiApi', () => ({
  getHmiCapabilities: mocks.getHmiCapabilities,
  listHmiPorts: mocks.listHmiPorts,
  testHmiPort: mocks.testHmiPort,
}));

const projectConfig = {
  id: 'project-1',
  name: 'Machine HMI',
  createdAt: 1,
  updatedAt: 1,
  boardId: 'stm32f746g-disco' as const,
  display: {
    width: 480,
    height: 272,
    colorDepth: 16 as const,
    orientation: 'landscape' as const,
  },
  lvglConfig: {
    version: '9' as const,
    colorFormat: 'RGB565' as const,
    fontLarge: true,
    defaultFont: 'montserrat_14',
    useBuiltinSymbols: true,
    memSize: 64,
  },
  protocol: 'modbus-rtu' as const,
  communication: {
    enabled: true,
    protocol: 'modbus-rtu' as const,
    role: 'client' as const,
    port: 'COM5',
    baudRate: 115200,
    parity: 'none' as const,
    dataBits: 8 as const,
    stopBits: 1 as const,
    timeoutMs: 1000,
    retries: 2,
    unitId: 1,
    pollIntervalMs: 250,
    tags: [],
  },
  canBus: {
    enabled: true,
    bitrate: 500_000,
    fd: false,
    dataBitrate: 2_000_000,
    samplePointPercent: 75,
    mode: 'normal' as const,
    defaultFrameFormat: 'standard' as const,
    pollIntervalMs: 100,
    signals: [],
  },
  codeGenOptions: {
    outputFormat: 'single-file' as const,
    includeComments: true,
    useStaticAllocation: true,
    prefix: 'ui',
    indentSize: 4,
    indentStyle: 'spaces' as const,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getHmiCapabilities.mockResolvedValue({
    success: true,
    canBuild: true,
    canFlash: true,
  });
  mocks.listHmiPorts.mockResolvedValue({
    success: true,
    ports: [],
    log: [],
  });
});

describe('ProtocolPanel Modbus configuration', () => {
  it('shows the exact PC server serial settings and address convention', async () => {
    mocks.getProjectConfig.mockResolvedValue(projectConfig);

    render(<ProtocolPanel />);

    expect(await screen.findByRole('note')).toHaveTextContent(
      'COM5 · 115200 baud · 8N1 · Unit 1 · no RTS/CTS flow control',
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'address 0 = Holding Register 400001',
    );
  });

  it('flushes the latest dirty communication value when the tab unmounts', async () => {
    mocks.getProjectConfig.mockResolvedValue(projectConfig);
    mocks.updateProjectConfig.mockResolvedValue(undefined);

    const view = render(<ProtocolPanel />);
    const unitId = await screen.findByLabelText('Server unit ID');
    fireEvent.change(unitId, { target: { value: '7' } });
    view.unmount();

    await waitFor(() => {
      expect(mocks.updateProjectConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'project-1',
          protocol: 'modbus-rtu',
          communication: expect.objectContaining({ unitId: 7 }),
        }),
      );
    });
  });

  it('presents the protocol as fixed when the board drives a single bus', async () => {
    mocks.getProjectConfig.mockResolvedValue(projectConfig);

    render(<ProtocolPanel />);

    expect(
      await screen.findByText(/Modbus RTU · fixed by STM32F746G-DISCO/),
    ).toBeInTheDocument();
  });
});

describe('ProtocolPanel CAN configuration', () => {
  const canProject = { ...projectConfig, protocol: 'can-bus' as const };

  it('renders the CAN form and warns that it cannot be built yet', async () => {
    mocks.getProjectConfig.mockResolvedValue(canProject);

    render(<ProtocolPanel />);

    expect(
      await screen.findByRole('heading', { name: 'CAN bus' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'CAN bus is configuration only.',
    );
    // The Modbus form must not be mounted alongside it.
    expect(screen.queryByLabelText('Server unit ID')).not.toBeInTheDocument();
  });

  it('keeps a 29-bit identifier from surviving a switch to standard frames', async () => {
    mocks.getProjectConfig.mockResolvedValue({
      ...canProject,
      canBus: {
        ...canProject.canBus,
        signals: [{
          id: 'signal-1',
          name: 'Torque',
          frameId: 0x1abcdef,
          frameFormat: 'extended' as const,
          startBit: 0,
          bitLength: 16,
          byteOrder: 'little-endian' as const,
          dataType: 'unsigned' as const,
          access: 'read' as const,
          scale: 1,
          offset: 0,
          pollIntervalMs: 100,
        }],
      },
    });
    mocks.updateProjectConfig.mockResolvedValue(undefined);

    render(<ProtocolPanel />);

    const frameId = await screen.findByDisplayValue('1ABCDEF');
    const format = screen.getByDisplayValue('Extended');
    fireEvent.change(format, { target: { value: 'standard' } });

    // 0x1ABCDEF does not fit in 11 bits, so it clamps to the format's maximum.
    await waitFor(() => expect(frameId).toHaveValue('7FF'));
  });
});
