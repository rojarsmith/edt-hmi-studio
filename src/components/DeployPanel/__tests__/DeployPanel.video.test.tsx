// A Video widget needs a JPEG codec to decode its frames and an SD interface
// to read them. A board with neither has no slower path to fall back to, so the
// build is stopped here — before the compiler, where it would surface as a
// missing header file rather than as something a person can act on.

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeployPanel from '../DeployPanel';
import { useDeployStore } from '../../../store/deployStore';
import type { BoardId } from '../../../types/hmi';

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

/** Mutable, so each test can put a different screen set behind the panel. */
const editorState = vi.hoisted(() => ({
  screens: [] as unknown[],
  animations: [] as unknown[],
}));

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
  useEditorStore: fakeStore(editorState),
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
  subscribeBuildLog: () => () => {},
}));

function widget(type: string, children: unknown[] = []) {
  return {
    id: `${type}-1`, type, name: type, x: 0, y: 0, width: 10, height: 10,
    children, props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
  };
}

function withScreens(components: unknown[]) {
  editorState.screens = [{ id: 'screen-1', name: 'Screen 1', components }];
}

function onBoard(boardId: BoardId) {
  mocks.getProjectConfig.mockResolvedValue({
    id: 'project-1',
    name: 'Machine HMI',
    boardId,
    protocol: 'modbus-rtu' as const,
    communication: { port: 'COM5' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
  editorState.screens = [];
  onBoard('stm32h747i-disco');
  mocks.flushProjectConfigWrites.mockResolvedValue(undefined);
  mocks.getHmiCapabilities.mockResolvedValue({
    success: true,
    canBuild: true,
    canFlash: true,
  });
  mocks.listHmiPorts.mockResolvedValue({ success: true, ports: [], log: [] });
});

describe('a video on a board that cannot play one', () => {
  it('blocks the build and says why', async () => {
    onBoard('stm32f746g-disco');
    withScreens([widget('video')]);

    render(<DeployPanel />);

    const notice = await screen.findByText(/has no JPEG codec/);
    expect(notice).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Build Firmware' })).toBeDisabled());
  });

  it('finds a video nested inside a container', async () => {
    onBoard('edt-evk043027b');
    withScreens([widget('obj', [widget('video')])]);

    render(<DeployPanel />);

    expect(await screen.findByText(/has no JPEG codec/)).toBeTruthy();
  });

  it('lets the build run on the board that has the codec', async () => {
    withScreens([widget('video')]);

    render(<DeployPanel />);

    const build = await screen.findByRole('button', { name: 'Build Firmware' });
    await waitFor(() => expect(build).toBeEnabled());
    expect(screen.queryByText(/has no JPEG codec/)).toBeNull();
  });

  it('says nothing about video for a project that has none', async () => {
    onBoard('stm32f746g-disco');
    withScreens([widget('label')]);

    render(<DeployPanel />);

    const build = await screen.findByRole('button', { name: 'Build Firmware' });
    await waitFor(() => expect(build).toBeEnabled());
    expect(screen.queryByText(/has no JPEG codec/)).toBeNull();
  });
});
