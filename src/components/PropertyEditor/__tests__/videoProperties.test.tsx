// A video's own section: the playlist it names on the SD card, what to do
// with it when the screen loads, and what the chosen board will actually do.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import { useAppStore } from '../../../store/appStore';
import { useProjectStore } from '../../../store/projectStore';
import type { LvglComponent } from '../../../types';
import type { BoardId } from '../../../types/hmi';
import PropertyEditor from '..';

function video(props: Record<string, unknown>): LvglComponent {
  return {
    id: 'video-1', type: 'video', name: 'Video 1',
    x: 10, y: 10, width: 400, height: 240,
    children: [], events: [], animations: [],
    parentId: null, locked: false, visible: true,
    props,
    styles: { default: { bgColor: '#000000', borderWidth: 0, opacity: 1 } },
  };
}

/** Just enough of a project list for the editor to find the board. */
function onBoard(boardId: BoardId) {
  useAppStore.setState({ currentProjectId: 'project-1' });
  useProjectStore.setState({
    projects: [
      // The panel reads the board off this; the tag table is what the Modbus
      // section reads, and it has to be there for the panel to render at all.
      { config: { id: 'project-1', boardId, communication: { tags: [] } } },
    ] as unknown as ReturnType<typeof useProjectStore.getState>['projects'],
  });
}

const DEFAULT_PROPS = {
  source: 'list', files: ['intro.avi'], folder: '',
  autoPlay: true, loop: true, shuffle: false,
};

function setUp(props: Record<string, unknown> = DEFAULT_PROPS) {
  useEditorStore.setState({
    screens: [{
      id: 'screen-1', name: 'Screen 1', backgroundColor: '#fff',
      components: [video(props)],
    }],
    animations: [],
    selectedAnimationId: null,
    currentScreenId: 'screen-1',
    selection: { selectedIds: ['video-1'], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
  return render(<PropertyEditor />);
}

const current = () => useEditorStore.getState().screens[0].components[0];
const BS = String.fromCharCode(92);

describe('video properties', () => {
  beforeEach(() => {
    onBoard('stm32h747i-disco');
  });

  it('shows the files as a list to type into, not resources to pick', () => {
    setUp();

    const field = screen.getByLabelText('Video files') as HTMLTextAreaElement;
    expect(field.value).toBe('intro.avi');
    expect(field.placeholder).toContain('clips/morning.avi');
  });

  it('commits the typed lines as files, normalising each path', () => {
    setUp();

    const field = screen.getByLabelText('Video files');
    fireEvent.change(field, {
      target: { value: `intro.avi\nclips${BS}morning.avi\n\n` },
    });
    fireEvent.blur(field);

    expect(current().props.files).toEqual(['intro.avi', 'clips/morning.avi']);
  });

  it('switches to a folder scan and keeps the folder normalised', () => {
    const first = setUp();

    fireEvent.change(screen.getByLabelText('Video source'), {
      target: { value: 'folder' },
    });
    expect(current().props.source).toBe('folder');
    first.unmount();

    setUp({ ...DEFAULT_PROPS, source: 'folder', folder: '' });
    const folder = screen.getByLabelText('Video folder');
    fireEvent.change(folder, { target: { value: `${BS}clips${BS}` } });
    fireEvent.blur(folder);

    expect(current().props.folder).toBe('clips');
  });

  it('says which container is read when an entry has the wrong extension', () => {
    setUp({ ...DEFAULT_PROPS, files: ['intro.mp4'] });

    expect(screen.getByText(/Only an AVI container/)).toBeTruthy();
  });

  it('asks for a file when the list is empty', () => {
    setUp({ ...DEFAULT_PROPS, files: [] });

    expect(screen.getByText(/No file named yet/)).toBeTruthy();
  });

  it('accepts a path in front of a name without complaint', () => {
    setUp({ ...DEFAULT_PROPS, files: ['clips/intro.avi'] });

    expect(screen.queryByText(/Only an AVI container/)).toBeNull();
    expect(screen.queryByText(/No file named yet/)).toBeNull();
  });

  it('names the board and what it will do with the file', () => {
    setUp();

    expect(screen.getByText(/STM32H747I-DISCO plays Motion JPEG/)).toBeTruthy();
    expect(screen.getByText(/Video not found/)).toBeTruthy();
  });

  it('says a board with no JPEG codec cannot play it at all', () => {
    onBoard('stm32f746g-disco');
    setUp();

    expect(screen.getByText(/STM32F746G-DISCO cannot play video/)).toBeTruthy();
  });

  it('switches auto play off', () => {
    setUp();

    fireEvent.click(screen.getByText('Auto Play').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!);

    expect(current().props.autoPlay).toBe(false);
  });

  it('switches loop off', () => {
    setUp();

    fireEvent.click(screen.getByText('Loop').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!);

    expect(current().props.loop).toBe(false);
  });

  it('switches random order on for a real list, and explains it', () => {
    const first = setUp({ ...DEFAULT_PROPS, files: ['a.avi', 'b.avi'] });

    fireEvent.click(screen.getByText('Random order').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!);
    expect(current().props.shuffle).toBe(true);
    first.unmount();

    setUp({ ...DEFAULT_PROPS, files: ['a.avi', 'b.avi'], shuffle: true });
    expect(screen.getByText(/never the one that just/)).toBeTruthy();
  });

  it('makes random order inert while the list holds one file', () => {
    setUp();

    const toggle = screen.getByText('Random order').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!;
    expect(toggle.className).toContain('disabled');

    // Clicking a switch with nothing to shuffle changes nothing.
    fireEvent.click(toggle);
    expect(current().props.shuffle).toBe(false);
  });

  it('reads a stored shuffle as off while only one file is named', () => {
    setUp({ ...DEFAULT_PROPS, shuffle: true });

    const knob = screen.getByText('Random order').closest('.property-row')!
      .querySelector('.toggle-switch')!;
    expect(knob.className).not.toContain('on');
    expect(screen.queryByText(/never the one that just/)).toBeNull();
  });

  it('keeps random order available for a folder scan', () => {
    setUp({ ...DEFAULT_PROPS, source: 'folder', folder: 'clips' });

    const toggle = screen.getByText('Random order').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!;
    expect(toggle.className).not.toContain('disabled');
  });

  it('reads a project written before playlists as its one file', () => {
    setUp({ fileName: 'legacy.avi' });

    const field = screen.getByLabelText('Video files') as HTMLTextAreaElement;
    expect(field.value).toBe('legacy.avi');

    // Turning a switch off has to be a change, which it only is if it read as on.
    fireEvent.click(screen.getByText('Loop').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!);
    expect(current().props.loop).toBe(false);
  });
});
