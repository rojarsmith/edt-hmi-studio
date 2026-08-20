// Naming happens in the manager, in place, the way a screen is named. The
// popup that used to own it is gone: adding an animation creates it and puts
// the cursor in its name.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, LvglComponent } from '../../../types';
import AnimationPanel from '../AnimationPanel';

function anim(name: string, id = name): Animation {
  return {
    id,
    name,
    targetComponentId: 'comp-1',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    tracks: [{ id: `${id}-t`, property: 'opa', startValue: 0, endValue: 255 }],
  };
}

function component(id: string): LvglComponent {
  return {
    id,
    type: 'btn',
    name: id,
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

function setUp(components: LvglComponent[], animations: Animation[] = []) {
  useEditorStore.setState({
    screens: [{ id: 'screen-1', name: 'Screen 1', components, backgroundColor: '#fff' }],
    animations,
    selectedAnimationId: null,
    currentScreenId: 'screen-1',
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

describe('naming an animation in the manager', () => {
  beforeEach(() => setUp([component('comp-1')]));

  it('creates it named and ready to rename', () => {
    render(<AnimationPanel />);

    fireEvent.click(screen.getByTitle('Add animation'));

    // It exists straight away, under a neutral numbered name.
    expect(useEditorStore.getState().animations.map(a => a.name)).toEqual(['Animation_1']);
    // And the name is in an input, waiting.
    expect((screen.getByLabelText('Animation name') as HTMLInputElement).value).toBe('Animation_1');
  });

  it('starts a second long, which is long enough to see', () => {
    render(<AnimationPanel />);

    fireEvent.click(screen.getByTitle('Add animation'));

    expect(useEditorStore.getState().animations[0].duration).toBe(1000);
  });

  it('numbers a second one without clashing', () => {
    setUp([component('comp-1')], [anim('Animation_1')]);
    render(<AnimationPanel />);

    fireEvent.click(screen.getByTitle('Add animation'));

    expect(useEditorStore.getState().animations.map(a => a.name)).toEqual(['Animation_1', 'Animation_2']);
  });

  it('points the property panel at what it just created', () => {
    render(<AnimationPanel />);

    fireEvent.click(screen.getByTitle('Add animation'));

    const created = useEditorStore.getState().animations[0];
    expect(useEditorStore.getState().selectedAnimationId).toBe(created.id);
  });

  it('commits a typed name on Enter', () => {
    render(<AnimationPanel />);
    fireEvent.click(screen.getByTitle('Add animation'));

    const input = screen.getByLabelText('Animation name');
    fireEvent.change(input, { target: { value: 'slide_in' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useEditorStore.getState().animations[0].name).toBe('slide_in');
    expect(screen.queryByLabelText('Animation name')).toBeNull();
  });

  it('renames an existing one on double click', () => {
    setUp([component('comp-1')], [anim('Anim_1', 'a1')]);
    render(<AnimationPanel />);

    fireEvent.doubleClick(screen.getByText('Anim_1'));
    const input = screen.getByLabelText('Animation name');
    fireEvent.change(input, { target: { value: 'intro' } });
    fireEvent.blur(input);

    expect(useEditorStore.getState().animations[0].name).toBe('intro');
  });

  it('keeps the old name when the new one is taken', () => {
    setUp([component('comp-1')], [anim('Anim_1', 'a1'), anim('intro', 'a2')]);
    render(<AnimationPanel />);

    fireEvent.doubleClick(screen.getByText('Anim_1'));
    const input = screen.getByLabelText('Animation name');
    fireEvent.change(input, { target: { value: 'intro' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // The name identifies the generated C function, so two cannot share one.
    expect(useEditorStore.getState().animations.map(a => a.name)).toEqual(['Anim_1', 'intro']);
  });

  it('abandons a rename on Escape', () => {
    setUp([component('comp-1')], [anim('Anim_1', 'a1')]);
    render(<AnimationPanel />);

    fireEvent.doubleClick(screen.getByText('Anim_1'));
    const input = screen.getByLabelText('Animation name');
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useEditorStore.getState().animations[0].name).toBe('Anim_1');
  });
});
