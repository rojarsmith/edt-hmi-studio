import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommunicationPanel from '../CommunicationPanel';

const mocks = vi.hoisted(() => ({
  getProjectConfig: vi.fn(),
  updateProjectConfig: vi.fn(),
  saveProjectData: vi.fn(),
  exportProject: vi.fn(),
  syncModbusBindings: vi.fn(),
  getHmiCapabilities: vi.fn(),
  listHmiPorts: vi.fn(),
  testHmiPort: vi.fn(),
  buildHmiProject: vi.fn(),
  flashHmiBuild: vi.fn(),
}));

vi.mock('../../../store/appStore', () => ({
  useAppStore: (selector: (state: { currentProjectId: string }) => unknown) =>
    selector({ currentProjectId: 'project-1' }),
}));

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: () => ({
    getProjectConfig: mocks.getProjectConfig,
    updateProjectConfig: mocks.updateProjectConfig,
    saveProjectData: mocks.saveProjectData,
    exportProject: mocks.exportProject,
  }),
}));

vi.mock('../../../store/editorStore', () => ({
  useEditorStore: (
    selector: (state: {
      screens: unknown[];
      syncModbusBindings: typeof mocks.syncModbusBindings;
    }) => unknown,
  ) => selector({
    screens: [],
    syncModbusBindings: mocks.syncModbusBindings,
  }),
}));

vi.mock('../../../resources', () => ({
  useResourceStore: (
    selector: (state: { images: unknown[]; fonts: unknown[] }) => unknown,
  ) => selector({ images: [], fonts: [] }),
}));

vi.mock('../../LogicEditor', () => ({
  useLogicEditorStore: (
    selector: (state: { graphs: unknown[] }) => unknown,
  ) => selector({ graphs: [] }),
}));

vi.mock('../../../services/hmiApi', () => ({
  getHmiCapabilities: mocks.getHmiCapabilities,
  listHmiPorts: mocks.listHmiPorts,
  testHmiPort: mocks.testHmiPort,
  buildHmiProject: mocks.buildHmiProject,
  flashHmiBuild: mocks.flashHmiBuild,
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
    rotation: 0 as const,
  },
  lvglConfig: {
    version: '9' as const,
    colorFormat: 'RGB565' as const,
    fontLarge: true,
    defaultFont: 'montserrat_14',
    useBuiltinSymbols: true,
    memSize: 64,
  },
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
  codeGenOptions: {
    outputFormat: 'single-file' as const,
    includeComments: true,
    useStaticAllocation: true,
    prefix: 'ui',
    indentSize: 4,
    indentStyle: 'spaces' as const,
  },
};

describe('CommunicationPanel autosave', () => {
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
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  });

  it('shows the exact PC server serial settings and address convention', async () => {
    mocks.getProjectConfig.mockResolvedValue(projectConfig);

    render(<CommunicationPanel />);

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

    const view = render(<CommunicationPanel />);
    const unitId = await screen.findByLabelText('Server unit ID');
    fireEvent.change(unitId, { target: { value: '7' } });
    view.unmount();

    await waitFor(() => {
      expect(mocks.updateProjectConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'project-1',
          communication: expect.objectContaining({ unitId: 7 }),
        }),
      );
    });
  });
});

describe('CommunicationPanel build and flash log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectConfig.mockResolvedValue(projectConfig);
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
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  });

  it('copies every log entry in display order and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.listHmiPorts.mockResolvedValue({
      success: true,
      ports: [],
      log: ['First log entry', 'Second log entry'],
    });

    render(<CommunicationPanel />);

    const copyButton = await screen.findByRole('button', {
      name: 'Copy build and flash log',
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('First log entry\nSecond log entry');
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Copied 2 log entries.');
  });

  it('disables copy and clear when there are no log entries', async () => {
    render(<CommunicationPanel />);

    const copyButton = await screen.findByRole('button', {
      name: 'Copy build and flash log',
    });
    const clearButton = screen.getByRole('button', {
      name: 'Clear build and flash log',
    });

    expect(copyButton).toBeDisabled();
    expect(copyButton).toHaveAttribute('title', 'No log entries to copy');
    expect(clearButton).toBeDisabled();
    expect(clearButton).toHaveAttribute('title', 'No log entries to clear');
  });

  it('reports clipboard failures without changing the displayed log', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.listHmiPorts.mockResolvedValue({
      success: true,
      ports: [],
      log: ['Log entry that must remain visible'],
    });

    render(<CommunicationPanel />);

    const copyButton = await screen.findByRole('button', {
      name: 'Copy build and flash log',
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not copy the log. Check clipboard permissions and try again.',
    );
    expect(screen.getByText('Log entry that must remain visible')).toBeInTheDocument();
  });
});
