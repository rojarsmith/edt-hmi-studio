// Navigating in the preview has to do what the panel will do: reach the
// screen, and hold the screen's entry animation back until the change has
// finished, the way LVGL holds LV_EVENT_SCREEN_LOADED back.

import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, BuiltinAction, LvglComponent } from '../../../types';
import PreviewPanel from '../PreviewPanel';

const animation: Animation = {
  id: 'anim-1',
  name: 'Slide_in',
  targetComponentId: 'label-2',
  easing: 'linear',
  duration: 300,
  delay: 0,
  repeat: 0,
  tracks: [{ id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 }],
};

function component(id: string, overrides: Partial<LvglComponent> = {}): LvglComponent {
  return {
    id,
    type: 'btn',
    name: id,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
    ...overrides,
  };
}

/** Screen 1 holds a button that navigates; Screen 2 plays something on load. */
function setUp(action: BuiltinAction) {
  useEditorStore.setState({
    screens: [
      {
        id: 'screen-1', name: 'Screen 1', backgroundColor: '#fff', events: [],
        components: [component('btn-1', { events: [{
          id: 'e1', eventType: 'LV_EVENT_CLICKED', handlerType: 'builtin', action,
        }] })],
      },
      {
        id: 'screen-2', name: 'Screen 2', backgroundColor: '#fff',
        components: [component('label-2', { type: 'label', x: 200, y: 200 })],
        events: [{
          id: 'load-1',
          eventType: 'LV_EVENT_SCREEN_LOADED',
          handlerType: 'builtin',
          action: { type: 'playAnimation', animationId: 'anim-1' },
        }],
      },
    ],
    animations: [animation],
    currentScreenId: 'screen-1',
    openScreenIds: ['screen-1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
  return render(<PreviewPanel />);
}

const clickTheButton = () =>
  fireEvent.click(document.querySelector('canvas')!, { clientX: 10, clientY: 10 });

const showing = (container: HTMLElement) =>
  container.querySelector('.preview-screen-btn.active')?.textContent;

describe('navigating in the preview', () => {
  it('follows a binding that names the screen the current way', () => {
    // The handler only looked at `targetPage`, the pre-rename spelling, so
    // every binding written since navigated nowhere.
    const { container } = setUp({ type: 'navigate', targetScreen: 'Screen 2', transition: 'none' });

    clickTheButton();

    expect(showing(container)).toContain('Screen 2');
  });

  it('holds the entry animation until the change has finished', () => {
    setUp({
      type: 'navigate',
      targetScreen: 'Screen 2',
      transition: 'slide',
      transitionDirection: 'left',
      transitionDuration: 300,
    });

    clickTheButton();

    // Still travelling: playback would otherwise run behind the change and be
    // half over by the time the screen arrives.
    expect(screen.queryByTitle('Pause')).toBeNull();
  });

  it('plays it at once when there is no change to draw', () => {
    setUp({ type: 'navigate', targetScreen: 'Screen 2', transition: 'none' });

    clickTheButton();

    expect(screen.queryByTitle('Pause')).not.toBeNull();
  });
});
