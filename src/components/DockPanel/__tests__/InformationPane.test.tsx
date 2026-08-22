// The Information pane, and the dock bringing it forward when a video is picked.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DockPanel from '../DockPanel';
import InformationPane from '../InformationPane';
import { useDeployStore } from '../../../store/deployStore';
import { useDockStore, DOCK_DEFAULT_HEIGHT } from '../../../store/dockStore';
import { useEditorStore } from '../../../store/editorStore';
import { useWorkStore } from '../../../store/workStore';
import type { LvglComponent } from '../../../types';

vi.mock('../../../services/hmiApi', () => ({
  getHmiCapabilities: vi.fn(),
  getHmiImageLayout: vi.fn(),
  listHmiPorts: vi.fn(),
  buildHmiProject: vi.fn(),
  flashHmiBuild: vi.fn(),
  cancelHmiBuild: vi.fn(),
  subscribeBuildLog: () => () => {},
}));

function widget(
  type: string,
  name: string,
  box: { x: number; y: number; width: number; height: number },
  extra: Partial<LvglComponent> = {},
): LvglComponent {
  return {
    id: name, type, name, ...box,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
    ...extra,
  };
}

const video = widget('video', 'Video_1', { x: 0, y: 0, width: 800, height: 480 }, {
  props: { fileName: 'city.avi', autoPlay: true, loop: true },
});
const button = widget('btn', 'Button_2', { x: 300, y: 400, width: 100, height: 40 });
const beside = widget('btn', 'Button_3', { x: 820, y: 400, width: 100, height: 40 });

function setUp(components: LvglComponent[], selectedIds: string[]) {
  // Inside act: the dock reacts to a selection from an effect, and the
  // assertion that follows has to see the effect's work.
  act(() => {
    useEditorStore.setState({
      screens: [{ id: 'screen-1', name: 'Screen 1', components }],
      currentScreenId: 'screen-1',
      selection: { selectedIds, hoveredId: null },
      canvas: { ...useEditorStore.getState().canvas, width: 800, height: 480 },
    });
  });
}

beforeEach(() => {
  useDockStore.setState({ expanded: true, activePane: 'work', height: DOCK_DEFAULT_HEIGHT });
  useDeployStore.setState({
    busy: null, buildId: '', buildLog: [], flashLog: [], ports: [],
    capabilities: { success: true, canBuild: true, canFlash: true },
  });
  useWorkStore.setState({ items: [], nextId: 1 });
  setUp([], []);
});

describe('InformationPane', () => {
  it('asks for a selection when there is none', () => {
    render(<InformationPane />);
    expect(screen.getByText(/Select a component/)).toBeInTheDocument();
  });

  it('has nothing to add for a component that behaves as the canvas shows', () => {
    setUp([button], ['Button_2']);
    render(<InformationPane />);
    expect(screen.getByText(/Nothing to add/)).toBeInTheDocument();
  });

  it('lists the rules for a video, with the file and size in the toolbar', () => {
    setUp([video], ['Video_1']);
    render(<InformationPane />);

    // The toolbar line; a rule's body mentions the same size, so scope it.
    expect(screen.getByText(/city\.avi/)).toHaveTextContent('800 × 480');
    expect(screen.getByText('The video needs its space to itself')).toBeInTheDocument();
    expect(screen.getByText('The file lives in the top level of the SD card')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ready to play');
  });

  it('names the button that overlaps the video and counts it as a thing to fix', () => {
    setUp([video, button], ['Video_1']);
    render(<InformationPane />);

    expect(screen.getByText('Button_2 overlaps this video')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 thing to fix');
  });

  it('is satisfied by a button beside the video', () => {
    setUp([video, beside], ['Video_1']);
    render(<InformationPane />);

    expect(screen.queryByText(/overlaps this video/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Ready to play');
  });
});

describe('the dock and a video', () => {
  it('offers Information between Work and Build Firmware', () => {
    render(<DockPanel />);
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Work', 'Information', 'Build Firmware', 'Flash & Reset']);
  });

  it('brings Information forward when a video is selected', () => {
    setUp([video, button], []);
    render(<DockPanel />);
    expect(useDockStore.getState().activePane).toBe('work');

    setUp([video, button], ['Video_1']);

    expect(useDockStore.getState().activePane).toBe('info');
    expect(screen.getByText('Button_2 overlaps this video')).toBeInTheDocument();
  });

  it('leaves the pane alone when something other than a video is selected', () => {
    setUp([video, button], []);
    render(<DockPanel />);

    setUp([video, button], ['Button_2']);

    expect(useDockStore.getState().activePane).toBe('work');
  });

  it('does not pull Information back once the designer has moved away', () => {
    setUp([video], ['Video_1']);
    render(<DockPanel />);
    expect(useDockStore.getState().activePane).toBe('info');

    fireEvent.click(screen.getByRole('tab', { name: 'Work' }));
    expect(useDockStore.getState().activePane).toBe('work');

    // The same video, still selected: nothing new happened, so nothing moves.
    act(() => {
      useEditorStore.setState({ selection: { selectedIds: ['Video_1'], hoveredId: null } });
    });
    expect(useDockStore.getState().activePane).toBe('work');
  });

  it('leaves a collapsed dock collapsed, with Information waiting behind the strip', () => {
    // Selecting a widget is the commonest thing a designer does; a drawer that
    // opened on every click would be taking the canvas away for a note.
    useDockStore.setState({ expanded: false });
    setUp([video], []);
    render(<DockPanel />);

    setUp([video], ['Video_1']);

    expect(useDockStore.getState().expanded).toBe(false);
    expect(useDockStore.getState().activePane).toBe('info');
  });
});
