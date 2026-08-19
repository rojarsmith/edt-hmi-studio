// Wiring a button to Play Animation has to do something in the preview too.
// Verifying only the generated C would repeat the entry-screen mistake: the
// setting looked right everywhere except where the user actually tries it.

import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, BuiltinActionType, EventBinding, LvglComponent } from '../../../types';
import PreviewPanel from '../PreviewPanel';

const animation: Animation = {
  id: 'anim-1',
  name: 'Pulse_1',
  targetComponentId: 'label-1',
  type: 'fade_in',
  easing: 'linear',
  duration: 300,
  delay: 0,
  repeat: 0,
  property: 'opa',
  startValue: 0,
  endValue: 255,
};

function component(
  id: string,
  overrides: Partial<LvglComponent> = {},
): LvglComponent {
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

function event(type: BuiltinActionType, animationId?: string): EventBinding {
  return {
    id: `e-${type}`,
    eventType: 'LV_EVENT_CLICKED',
    handlerType: 'builtin',
    action: { type, animationId },
  };
}

/** The button sits at the origin, so a click near it lands on the button. */
function setUp(buttonEvents: EventBinding[]) {
  useEditorStore.setState({
    screens: [{
      id: 'screen-1',
      name: 'Screen 1',
      backgroundColor: '#fff',
      components: [
        component('label-1', { type: 'label', x: 200, y: 200 }),
        component('btn-1', { events: buttonEvents }),
      ],
    }],
    animations: [animation],
    currentScreenId: 'screen-1',
    openScreenIds: ['screen-1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

function clickTheButton() {
  fireEvent.click(document.querySelector('canvas')!, { clientX: 10, clientY: 10 });
}

describe('preview animation actions', () => {
  beforeEach(() => setUp([]));

  it('plays nothing until something asks it to', () => {
    render(<PreviewPanel />);
    expect(screen.queryByTitle('Pause')).toBeNull();
  });

  it('plays the named animation when the button is clicked', () => {
    setUp([event('playAnimation', 'anim-1')]);
    render(<PreviewPanel />);

    clickTheButton();

    // Playback is running: the play button has become a pause button.
    expect(screen.queryByTitle('Pause')).not.toBeNull();
  });

  it('plays a screen entry animation when that screen is entered', () => {
    // The whole point of a screen-load binding is seeing it without flashing a
    // board, so the preview has to honour it.
    useEditorStore.setState({
      screens: [
        {
          id: 'screen-1', name: 'Screen 1', backgroundColor: '#fff',
          components: [component('label-1', { type: 'label' })],
          events: [],
        },
        {
          id: 'screen-2', name: 'Screen 2', backgroundColor: '#fff',
          components: [component('label-2', { type: 'label' })],
          events: [{
            id: 'load-1',
            eventType: 'LV_EVENT_SCREEN_LOADED',
            handlerType: 'builtin',
            action: { type: 'playAnimation', animationId: 'anim-1' },
          }],
        },
      ],
      animations: [{ ...animation, targetComponentId: 'label-2' }],
      currentScreenId: 'screen-1',
      openScreenIds: ['screen-1'],
      selection: { selectedIds: [], hoveredId: null },
      history: [],
      historyIndex: -1,
    });
    const { container } = render(<PreviewPanel />);
    expect(screen.queryByTitle('Pause')).toBeNull();

    const toScreen2 = [...container.querySelectorAll('.preview-screen-btn')]
      .find(b => b.textContent?.startsWith('Screen 2'))!;
    fireEvent.click(toScreen2);

    expect(screen.queryByTitle('Pause')).not.toBeNull();
  });

  it('leaves playback alone when the binding names a deleted animation', () => {
    setUp([event('playAnimation', 'gone')]);
    render(<PreviewPanel />);

    clickTheButton();

    expect(screen.queryByTitle('Pause')).toBeNull();
  });

  it('stops a running animation from a stop binding', () => {
    setUp([event('playAnimation', 'anim-1')]);
    const { rerender } = render(<PreviewPanel />);
    clickTheButton();
    expect(screen.queryByTitle('Pause')).not.toBeNull();

    // The play loop is live, so let its pending frame settle into the rerender.
    act(() => {
      setUp([event('stopAnimation', 'anim-1')]);
    });
    rerender(<PreviewPanel />);
    clickTheButton();

    expect(screen.queryByTitle('Pause')).toBeNull();
  });
});
