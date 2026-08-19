// The property editor shows one thing at a time, so every gesture that picks
// something has to unpick whatever was showing before.
//
// Picking a screen used to be the exception twice over: it left an animation
// selected in the manager showing, and when the screen was already the current
// one it returned early and left a selected component showing — which is why
// clicking a screen appeared to work only sometimes.

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';
import type { Animation } from '../../types';

const animation: Animation = {
  id: 'anim-1',
  name: 'Anim_1',
  targetComponentId: '',
  easing: 'linear',
  duration: 300,
  delay: 0,
  repeat: 0,
  tracks: [{ id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 }],
};

function setUp() {
  useEditorStore.setState({
    screens: [
      { id: 'screen-1', name: 'Screen 1', components: [], backgroundColor: '#fff' },
      { id: 'screen-2', name: 'Screen 2', components: [], backgroundColor: '#fff' },
    ],
    animations: [animation],
    selectedAnimationId: null,
    currentScreenId: 'screen-1',
    openScreenIds: ['screen-1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

const state = () => useEditorStore.getState();

describe('what the property editor is looking at', () => {
  beforeEach(setUp);

  it('drops the animation when another screen is opened', () => {
    state().selectAnimation('anim-1');

    state().openScreen('screen-2');

    expect(state().selectedAnimationId).toBeNull();
    expect(state().currentScreenId).toBe('screen-2');
  });

  it('drops the animation when the current screen is clicked again', () => {
    state().selectAnimation('anim-1');

    // The screen is already current; the click still means "show me it".
    state().openScreen('screen-1');

    expect(state().selectedAnimationId).toBeNull();
  });

  it('drops a selected component when the current screen is clicked again', () => {
    useEditorStore.setState({ selection: { selectedIds: ['comp-1'], hoveredId: null } });

    state().openScreen('screen-1');

    expect(state().selection.selectedIds).toEqual([]);
  });

  it('does not reopen a tab that is already open', () => {
    state().openScreen('screen-1');

    expect(state().openScreenIds).toEqual(['screen-1']);
  });

  it('opens a tab for a screen that had none', () => {
    state().openScreen('screen-2');

    expect(state().openScreenIds).toEqual(['screen-1', 'screen-2']);
  });

  it('drops the animation when the screen is switched by tab', () => {
    state().selectAnimation('anim-1');

    state().setCurrentScreen('screen-2');

    expect(state().selectedAnimationId).toBeNull();
  });

  it('drops the animation when the canvas is cleared', () => {
    state().selectAnimation('anim-1');

    state().clearSelection();

    expect(state().selectedAnimationId).toBeNull();
  });

  it('drops the animation when a component is picked', () => {
    state().selectAnimation('anim-1');

    state().selectComponent('comp-1');

    expect(state().selectedAnimationId).toBeNull();
    expect(state().selection.selectedIds).toEqual(['comp-1']);
  });

  it('drops a component selection when an animation is picked', () => {
    useEditorStore.setState({ selection: { selectedIds: ['comp-1'], hoveredId: null } });

    state().selectAnimation('anim-1');

    expect(state().selection.selectedIds).toEqual([]);
    expect(state().selectedAnimationId).toBe('anim-1');
  });

  it('refuses to open a screen that is not there', () => {
    state().openScreen('gone');

    expect(state().currentScreenId).toBe('screen-1');
    expect(state().openScreenIds).toEqual(['screen-1']);
  });
});
