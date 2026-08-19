// The animation manager is independent of the canvas selection: animations are
// project assets, so the panel lists them all and can add one with nothing
// selected. An animation whose target is missing is flagged, never hidden.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, LvglComponent } from '../../../types';
import AnimationPanel from '../AnimationPanel';

function anim(name: string, targetComponentId: string): Animation {
  return {
    id: name,
    name,
    targetComponentId,
    type: 'fade_in',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    property: 'opa',
    startValue: 0,
    endValue: 255,
  };
}

function component(id: string, name: string): LvglComponent {
  return {
    id,
    type: 'btn',
    name,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  };
}

function setUp(animations: Animation[]) {
  useEditorStore.setState({
    screens: [{
      id: 'screen-1',
      name: 'Screen 1',
      backgroundColor: '#fff',
      components: [component('label-1', 'Title')],
    }],
    animations,
    currentScreenId: 'screen-1',
    // Nothing selected: the panel must work anyway.
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

describe('AnimationPanel', () => {
  beforeEach(() => setUp([]));

  it('lists animations with nothing selected', () => {
    setUp([anim('Pulse_1', 'label-1')]);
    const { container } = render(<AnimationPanel />);

    expect(screen.getByText('Pulse_1')).toBeTruthy();
    expect(container.querySelector('.panel-bar-count')!.textContent).toBe('1');
    expect(screen.queryByText('Select a component')).toBeNull();
  });

  it('adds one with nothing selected on the canvas', () => {
    render(<AnimationPanel />);

    fireEvent.click(screen.getByTitle('Add animation'));

    expect(useEditorStore.getState().animations).toHaveLength(1);
  });

  it('points the property panel at a row that is clicked', () => {
    setUp([anim('Pulse_1', 'label-1')]);
    render(<AnimationPanel />);

    fireEvent.click(screen.getByText('Pulse_1'));

    expect(useEditorStore.getState().selectedAnimationId).toBe('Pulse_1');
    // Editing an animation is not editing a component.
    expect(useEditorStore.getState().selection.selectedIds).toEqual([]);
  });

  it('names the widget each animation drives', () => {
    setUp([anim('Pulse_1', 'label-1')]);
    const { container } = render(<AnimationPanel />);

    expect(container.querySelector('.anim-detail')!.textContent).toContain('Title');
  });

  it('flags an animation whose target was deleted', () => {
    setUp([anim('Pulse_1', 'deleted')]);
    const { container } = render(<AnimationPanel />);

    // Still listed — the work is not thrown away with the widget.
    expect(screen.getByText('Pulse_1')).toBeTruthy();
    const badge = container.querySelector('.lack-badge')!;
    expect(badge.textContent).toBe('LACK');
    expect(badge.getAttribute('title')).toBe('Target component no longer exists');
  });

  it('flags an animation that never got a target', () => {
    setUp([anim('Pulse_1', '')]);
    const { container } = render(<AnimationPanel />);

    expect(container.querySelector('.lack-badge')!.getAttribute('title'))
      .toBe('No target component');
  });

  it('leaves a bound animation unflagged', () => {
    setUp([anim('Pulse_1', 'label-1')]);
    const { container } = render(<AnimationPanel />);

    expect(container.querySelector('.lack-badge')).toBeNull();
  });

  it('deletes from the project list', () => {
    setUp([anim('Pulse_1', 'label-1'), anim('Pulse_2', 'label-1')]);
    render(<AnimationPanel />);

    fireEvent.click(screen.getAllByTitle('Delete')[0]);

    expect(useEditorStore.getState().animations.map(a => a.name)).toEqual(['Pulse_2']);
  });
});
