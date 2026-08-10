import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeployPanel from '../DeployPanel';

const mocks = vi.hoisted(() => ({
  getProjectConfig: vi.fn(),
  saveProjectData: vi.fn(),
  exportProject: vi.fn(),
  flushProjectConfigWrites: vi.fn(),
  getHmiCapabilities: vi.fn(),
  listHmiPorts: vi.fn(),
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
    saveProjectData: mocks.saveProjectData,
    exportProject: mocks.exportProject,
    flushProjectConfigWrites: mocks.flushProjectConfigWrites,
  }),
}));

vi.mock('../../../store/editorStore', () => ({
  useEditorStore: (
    selector: (state: { screens: unknown[] }) => unknown,
  ) => selector({ screens: [] }),
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
  buildHmiProject: mocks.buildHmiProject,
  flashHmiBuild: mocks.flashHmiBuild,
}));

const projectConfig = {
  id: 'project-1',
  name: 'Machine HMI',
  boardId: 'stm32f746g-disco' as const,
  protocol: 'modbus-rtu' as const,
  communication: { port: 'COM5' },
};

async function buildWithLog(log: string[]) {
  mocks.buildHmiProject.mockResolvedValue({ success: true, log });
  render(<DeployPanel />);
  const build = await screen.findByRole('button', { name: 'Build Firmware' });
  await waitFor(() => expect(build).toBeEnabled());
  fireEvent.click(build);
  await waitFor(() => expect(mocks.buildHmiProject).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectConfig.mockResolvedValue(projectConfig);
  mocks.flushProjectConfigWrites.mockResolvedValue(undefined);
  mocks.saveProjectData.mockResolvedValue(undefined);
  mocks.exportProject.mockResolvedValue({ name: 'Machine HMI' });
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

describe('DeployPanel build', () => {
  it('lands the protocol tab’s pending writes before exporting the project', async () => {
    const order: string[] = [];
    mocks.flushProjectConfigWrites.mockImplementation(async () => {
      order.push('flush');
    });
    mocks.exportProject.mockImplementation(async () => {
      order.push('export');
      return { name: 'Machine HMI' };
    });

    await buildWithLog(['done']);

    // The build must not export settings the user typed but that are still
    // sitting in the Protocol tab's debounce.
    expect(order.indexOf('flush')).toBeLessThan(order.indexOf('export'));
  });

  it('refuses to build a project whose protocol has no firmware support', async () => {
    mocks.getProjectConfig.mockResolvedValue({
      ...projectConfig,
      protocol: 'can-bus' as const,
    });

    render(<DeployPanel />);

    const build = await screen.findByRole('button', { name: 'Build Firmware' });
    await waitFor(() => expect(build).toBeDisabled());
    expect(screen.getByRole('note')).toHaveTextContent(
      'This project cannot be built.',
    );
  });
});

describe('DeployPanel build and flash log', () => {
  it('copies every log entry in display order and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await buildWithLog(['First log entry', 'Second log entry']);

    const copyButton = await screen.findByRole('button', {
      name: 'Copy build and flash log',
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'First log entry\nSecond log entry\nFirmware build complete.',
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Copied 3 log entries.');
  });

  it('disables copy and clear when there are no log entries', async () => {
    render(<DeployPanel />);

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

    await buildWithLog(['Log entry that must remain visible']);

    const copyButton = await screen.findByRole('button', {
      name: 'Copy build and flash log',
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not copy the log. Check clipboard permissions and try again.',
    );
    expect(screen.getByText(/Log entry that must remain visible/)).toBeInTheDocument();
  });
});
