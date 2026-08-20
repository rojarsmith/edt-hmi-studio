// An animation carries its own events, in the same category a screen and a
// widget have — which is what lets "when this has finished, change screen" be
// said without writing code.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, LvglComponent } from '../../../types';
import PropertyEditor from '..';

const animation: Animation = {
  id: 'anim-1',
  name: 'Exit',
  targetComponentId: 'card-1',
  easing: 'linear',
  duration: 1000,
  delay: 0,
  repeat: 0,
  tracks: [{ id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: -200 }],
};

function component(id: string, name: string): LvglComponent {
  return {
    id, type: 'obj', name, x: 0, y: 0, width: 80, height: 20,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
  };
}

function setUp(animations: Animation[] = [animation]) {
  useEditorStore.setState({
    screens: [
      { id: 'screen-1', name: 'Screen 1', backgroundColor: '#fff', components: [component('card-1', 'Card')] },
      { id: 'screen-2', name: 'Screen 2', backgroundColor: '#fff', components: [] },
    ],
    animations,
    selectedAnimationId: 'anim-1',
    currentScreenId: 'screen-1',
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

const current = () => useEditorStore.getState().animations[0];

describe('an animation Events category', () => {
  beforeEach(() => setUp());

  it('is there, below the properties it drives', () => {
    const { container } = render(<PropertyEditor />);
    const headers = [...container.querySelectorAll('.section-header')].map(h => h.textContent);

    expect(headers.some(h => h?.startsWith('Events'))).toBe(true);
    expect(headers.findIndex(h => h?.startsWith('Events')))
      .toBeGreaterThan(headers.indexOf('Animated Properties'));
  });

  it('offers finishing, and nothing else', () => {
    render(<PropertyEditor />);
    fireEvent.click(screen.getByTitle('Add event'));

    const options = [...screen.getByLabelText('Event Type').querySelectorAll('option')]
      .map(o => o.textContent);
    expect(options).toHaveLength(1);
    expect(options[0]).toContain('Animation Finished');
  });

  it('writes the binding onto the animation', () => {
    render(<PropertyEditor />);
    fireEvent.click(screen.getByTitle('Add event'));
    fireEvent.change(screen.getByLabelText('Target Screen'), { target: { value: 'Screen 2' } });
    fireEvent.click(screen.getByText('Save'));

    expect(current().events).toMatchObject([{
      eventType: 'ANIM_COMPLETED',
      handlerType: 'builtin',
      action: { type: 'navigate', targetScreen: 'Screen 2' },
    }]);
  });

  it('leaves the component and the screen alone', () => {
    render(<PropertyEditor />);
    fireEvent.click(screen.getByTitle('Add event'));
    fireEvent.click(screen.getByText('Save'));

    const state = useEditorStore.getState();
    expect(state.screens[0].events ?? []).toEqual([]);
    expect(state.screens[0].components[0].events).toEqual([]);
  });
});
