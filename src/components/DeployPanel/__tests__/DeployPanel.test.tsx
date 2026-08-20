import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeployPanel from '../DeployPanel';
import { useDeployStore } from '../../../store/deployStore';

const mocks = vi.hoisted(() => ({
  getProjectConfig: vi.fn(),
  saveProjectData: vi.fn(),
  exportProject: vi.fn(),
  flushProjectConfigWrites: vi.fn(),
  getHmiCapabilities: vi.fn(),
  getHmiImageLayout: vi.fn(),
  listHmiPorts: vi.fn(),
  buildHmiProject: vi.fn(),
  flashHmiBuild: vi.fn(),
}));

/**
 * The panel reads these through hooks and deployStore reads the same modules
 * through getState(), so a stand-in has to answer to both.
 */
const fakeStore = vi.hoisted(() => <T,>(state: T) => {
  const hook = (selector?: (value: T) => unknown) =>
    (selector ? selector(state) : state);
  hook.getState = () => state;
  return hook;
});

vi.mock('../../../store/appStore', () => ({
  useAppStore: fakeStore({ currentProjectId: 'project-1', factoryDevMode: false }),
}));

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: fakeStore({
    getProjectConfig: mocks.getProjectConfig,
    saveProjectData: mocks.saveProjectData,
    exportProject: mocks.exportProject,
    flushProjectConfigWrites: mocks.flushProjectConfigWrites,
  }),
}));

vi.mock('../../../store/editorStore', () => ({
  useEditorStore: fakeStore({ screens: [], animations: [] }),
}));

vi.mock('../../../resources', () => ({
  useResourceStore: fakeStore({ images: [], fonts: [] }),
}));

vi.mock('../../LogicEditor', () => ({
  useLogicEditorStore: fakeStore({ graphs: [] }),
}));

vi.mock('../../../services/hmiApi', () => ({
  getHmiCapabilities: mocks.getHmiCapabilities,
  getHmiImageLayout: mocks.getHmiImageLayout,
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
  // The store outlives the component now, so each test starts from a clean one.
  useDeployStore.setState({
    loadedProjectId: null,
    busy: null,
    buildId: '',
    artifactUrl: '',
    layout: null,
    buildLog: [],
    flashLog: [],
    ports: [],
    capabilities: null,
  });
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
    expect(order.lastIndexOf('flush')).toBeLessThan(order.indexOf('export'));
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

describe('DeployPanel state outlives the panel', () => {
  it('keeps the build id when the tab is left and re-entered', async () => {
    mocks.buildHmiProject.mockResolvedValue({
      success: true,
      log: ['compiling'],
      buildId: 'build-42',
    });

    const first = render(<DeployPanel />);
    const build = await screen.findByRole('button', { name: 'Build Firmware' });
    await waitFor(() => expect(build).toBeEnabled());
    fireEvent.click(build);
    await waitFor(() => expect(useDeployStore.getState().buildId).toBe('build-42'));

    // Switching tabs unmounts the panel; the build must not go with it, or
    // Flash & Reset has nothing to flash. See docs/bottom-dock-panel.md §3.
    first.unmount();
    render(<DeployPanel />);

    await waitFor(() =>
      expect(screen.getByText('Build ID: build-42')).toBeInTheDocument(),
    );
    expect(useDeployStore.getState().buildLog).toContain('compiling');
  });

  it('clears the build when a different project is opened', async () => {
    useDeployStore.setState({
      loadedProjectId: 'project-0',
      buildId: 'stale-build',
      buildLog: ['from the other project'],
    });

    render(<DeployPanel />);

    await waitFor(() => expect(useDeployStore.getState().buildId).toBe(''));
    expect(useDeployStore.getState().buildLog).not.toContain(
      'from the other project',
    );
  });
});
