// Screens carry events of their own, edited from the same panel components
// use. That is where an entry animation is wired: "when this screen has
// finished loading, play that animation".

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen as domScreen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, EventBinding, LvglComponent } from '../../../types';
import EventPanel from '../EventPanel';

const animation: Animation = {
  id: 'anim-1',
  name: 'Slide_In_1',
  targetComponentId: 'label-1',
  type: 'slide_left',
  easing: 'linear',
  duration: 300,
  delay: 0,
  repeat: 0,
  property: 'x',
  startValue: -110,
  endValue: 0,
};

function component(id: string, name: string): LvglComponent {
  return {
    id,
    type: 'label',
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

function setUp(events: EventBinding[] | undefined, animations: Animation[] = [animation]) {
  useEditorStore.setState({
    screens: [{
      id: 'screen-1',
      name: 'Screen 1',
      backgroundColor: '#fff',
      components: [component('label-1', 'Title')],
      events,
    }],
    animations,
    currentScreenId: 'screen-1',
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

const playOnLoad: EventBinding = {
  id: 'e1',
  eventType: 'LV_EVENT_SCREEN_LOADED',
  handlerType: 'builtin',
  action: { type: 'playAnimation', animationId: 'anim-1' },
};

describe('screen events', () => {
  beforeEach(() => setUp([]));

  it('renders for a screen with nothing selected on the canvas', () => {
    const { container } = render(<EventPanel screenId="screen-1" />);

    expect(container.querySelector('.pe-events-section')).not.toBeNull();
    expect(domScreen.getByText('No event bindings')).toBeTruthy();
  });

  it('describes an entry animation binding', () => {
    setUp([playOnLoad]);
    render(<EventPanel screenId="screen-1" />);

    expect(domScreen.getByText('Screen Loaded')).toBeTruthy();
    expect(domScreen.getByText('Play animation: Slide_In_1')).toBeTruthy();
  });

  it('writes a new binding to the screen, not to a component', () => {
    render(<EventPanel screenId="screen-1" />);

    fireEvent.click(domScreen.getByTitle('Add event'));
    fireEvent.click(domScreen.getByText('Save'));

    const events = useEditorStore.getState().screens[0].events!;
    expect(events).toHaveLength(1);
    // A screen has no Clicked to default to.
    expect(events[0].eventType).toBe('LV_EVENT_SCREEN_LOADED');
  });

  it('offers screen lifecycle events rather than input events', () => {
    render(<EventPanel screenId="screen-1" />);
    fireEvent.click(domScreen.getByTitle('Add event'));

    const options = [...document.querySelectorAll('.event-type-select option')]
      .map(o => o.textContent);
    expect(options.some(o => o?.includes('LV_EVENT_SCREEN_LOADED'))).toBe(true);
    expect(options.some(o => o?.includes('LV_EVENT_CLICKED'))).toBe(false);
  });

  it('deletes from the screen', () => {
    setUp([playOnLoad]);
    render(<EventPanel screenId="screen-1" />);

    fireEvent.click(domScreen.getByTitle('Delete event'));

    expect(useEditorStore.getState().screens[0].events).toEqual([]);
  });

  it('flags a binding whose animation was deleted', () => {
    setUp([playOnLoad], []);
    const { container } = render(<EventPanel screenId="screen-1" />);

    // The binding stays put — the user still has to re-point it.
    expect(domScreen.getByText('Screen Loaded')).toBeTruthy();
    const badge = container.querySelector('.lack-badge')!;
    expect(badge.textContent).toBe('LACK');
    expect(badge.getAttribute('title')).toBe('The animation this played no longer exists');
  });

  it('leaves a bound event unflagged', () => {
    setUp([playOnLoad]);
    const { container } = render(<EventPanel screenId="screen-1" />);

    expect(container.querySelector('.lack-badge')).toBeNull();
  });
});
