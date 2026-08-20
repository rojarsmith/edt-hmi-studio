// An animation that has finished runs its own bindings in the preview too, so
// a chain can be judged without flashing a board.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, EventBinding, LvglComponent } from '../../../types';
import PreviewPanel from '../PreviewPanel';

function component(id: string): LvglComponent {
  return {
    id, type: 'btn', name: id, x: 0, y: 0, width: 100, height: 40,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
  };
}

const finished = (action: EventBinding['action']): EventBinding => ({
  id: 'e1', eventType: 'ANIM_COMPLETED', handlerType: 'builtin', action,
});

function setUp(events: EventBinding[]) {
  const exit: Animation = {
    id: 'anim-1', name: 'Exit', targetComponentId: 'card-1',
    easing: 'linear', duration: 100, delay: 0, repeat: 0, events,
    tracks: [{ id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: -100 }],
  };
  useEditorStore.setState({
    screens: [
      {
        id: 'screen-1', name: 'Screen 1', backgroundColor: '#fff',
        components: [component('card-1')],
        // The entry binding is what starts the run this test measures.
        events: [{
          id: 'load-1',
          eventType: 'LV_EVENT_SCREEN_LOADED',
          handlerType: 'builtin',
          action: { type: 'playAnimation', animationId: 'anim-1' },
        }],
        isEntry: true,
      },
      { id: 'screen-2', name: 'Screen 2', backgroundColor: '#fff', components: [], events: [] },
    ],
    animations: [exit],
    currentScreenId: 'screen-1',
    openScreenIds: ['screen-1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
  return render(<PreviewPanel />);
}

/** Drive the rAF loop past the animation's end. */
function runPast(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const showing = (container: HTMLElement) =>
  container.querySelector('.preview-screen-btn.active')?.textContent;

afterEach(() => vi.useRealTimers());

describe('what follows an animation in the preview', () => {
  it('changes screen when the animation has finished', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance', 'Date'] });
    const { container } = setUp([finished({ type: 'navigate', targetScreen: 'Screen 2', transition: 'none' })]);

    // The play button starts the entry animation the screen binds.
    act(() => { screen.getByTitle('Play animation').click(); });
    expect(showing(container)).toContain('Screen 1');

    runPast(200);

    expect(showing(container)).toContain('Screen 2');
  });

  it('waits for it: nothing happens while it is still running', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance', 'Date'] });
    const { container } = setUp([finished({ type: 'navigate', targetScreen: 'Screen 2', transition: 'none' })]);

    act(() => { screen.getByTitle('Play animation').click(); });
    runPast(50);

    expect(showing(container)).toContain('Screen 1');
  });
});
