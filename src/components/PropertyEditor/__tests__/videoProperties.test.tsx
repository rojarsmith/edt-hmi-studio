// A video's own section: the file it names on the SD card, what to do with it
// when the screen loads, and what the chosen board will actually do with it.

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

function setUp(props: Record<string, unknown> = { fileName: 'intro.avi', autoPlay: true, loop: true }) {
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

describe('video properties', () => {
  beforeEach(() => {
    onBoard('stm32h747i-disco');
  });

  it('shows the file name as a field to type into, not a resource to pick', () => {
    setUp();

    const field = screen.getByLabelText('Video file name') as HTMLInputElement;
    expect(field.value).toBe('intro.avi');
    expect(field.placeholder).toBe('name.avi');
  });

  it('keeps what was typed', () => {
    setUp();

    fireEvent.change(screen.getByLabelText('Video file name'), {
      target: { value: 'demo-loop.avi' },
    });

    expect(current().props.fileName).toBe('demo-loop.avi');
  });

  it('says what to do about a name that is not one', () => {
    setUp({ fileName: 'clips/intro.avi', autoPlay: true, loop: true });

    expect(screen.getByText(/rather than a path/)).toBeTruthy();
  });

  it('says which container is read when the extension is something else', () => {
    setUp({ fileName: 'intro.mp4', autoPlay: true, loop: true });

    expect(screen.getByText(/Only an AVI container/)).toBeTruthy();
  });

  it('asks for a name when the widget is pointed at nothing', () => {
    setUp({ fileName: '', autoPlay: true, loop: true });

    expect(screen.getByText(/No file named yet/)).toBeTruthy();
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

  it('treats props written before these existed as both switched on', () => {
    setUp({ fileName: 'intro.avi' });

    // Turning one off has to be a change, which it only is if it read as on.
    fireEvent.click(screen.getByText('Loop').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!);

    expect(current().props.loop).toBe(false);
  });
});
