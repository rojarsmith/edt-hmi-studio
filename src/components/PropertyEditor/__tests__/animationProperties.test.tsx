// Picking an animation in the manager turns the property editor into its
// editor — the third thing the one panel can be showing, beside a component
// and the screen. There is no dialog any more.

import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, LvglComponent } from '../../../types';
import PropertyEditor from '..';

const animation: Animation = {
  id: 'anim-1',
  name: 'slide_in',
  targetComponentId: 'label-1',
  easing: 'linear',
  duration: 300,
  delay: 0,
  repeat: 0,
  tracks: [
    { id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 },
  ],
};

function component(id: string, name: string): LvglComponent {
  return {
    id,
    type: 'label',
    name,
    x: -100,
    y: 30,
    width: 80,
    height: 20,
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

function setUp(animations: Animation[] = [animation], selectedAnimationId: string | null = 'anim-1') {
  useEditorStore.setState({
    screens: [{
      id: 'screen-1',
      name: 'Screen 1',
      backgroundColor: '#fff',
      components: [component('label-1', 'Title')],
    }],
    animations,
    selectedAnimationId,
    currentScreenId: 'screen-1',
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

const current = () => useEditorStore.getState().animations[0];

describe('animation properties', () => {
  beforeEach(() => setUp());

  it('shows the animation when the manager points here', () => {
    const { container } = render(<PropertyEditor />);
    const pinned = container.querySelector('[data-pe-pinned]')!;

    expect(pinned.querySelector('.section-header')!.textContent).toBe('Animation');
    expect([...pinned.querySelectorAll('.property-row > label')].map(l => l.textContent))
      .toEqual(['Id', 'Type']);
    expect(pinned.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('slide_in');
    // The search box still sits directly below the pinned block.
    expect(pinned.nextElementSibling).toBe(container.querySelector('.pe-search'));
  });

  it('falls back to the screen when nothing is selected anywhere', () => {
    setUp([animation], null);
    const { container } = render(<PropertyEditor />);

    expect(container.querySelector('[data-pe-pinned] .section-header')!.textContent).toBe('Screen');
  });

  it('gives the panel back to the screen when a screen is picked', () => {
    // The symptom: pick an animation, then click a screen, and the panel stayed
    // on the animation.
    const { container } = render(<PropertyEditor />);
    expect(container.querySelector('[data-pe-pinned] .section-header')!.textContent).toBe('Animation');

    act(() => useEditorStore.getState().openScreen('screen-1'));

    expect(container.querySelector('[data-pe-pinned] .section-header')!.textContent).toBe('Screen');
  });

  it('renames on commit, and refuses a name another animation holds', () => {
    setUp([animation, { ...animation, id: 'anim-2', name: 'taken' }]);
    const { container } = render(<PropertyEditor />);
    const input = container.querySelector<HTMLInputElement>('[data-pe-pinned] input[type="text"]')!;

    fireEvent.change(input, { target: { value: 'entrance' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(current().name).toBe('entrance');

    fireEvent.change(input, { target: { value: 'taken' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // The name identifies the generated C function, so it stays as it was.
    expect(current().name).toBe('entrance');
  });

  it('edits the target', () => {
    render(<PropertyEditor />);

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '' } });

    expect(current().targetComponentId).toBe('');
    expect(screen.getByText(/drives nothing and generates no code/)).toBeTruthy();
  });

  it('edits the shared clock', () => {
    render(<PropertyEditor />);

    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Delay'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Easing'), { target: { value: 'bounce' } });

    expect(current()).toMatchObject({ duration: 1000, delay: 50, easing: 'bounce' });
  });

  it('edits the distance of an offset track', () => {
    render(<PropertyEditor />);

    fireEvent.change(screen.getByLabelText('Distance'), { target: { value: '250' } });

    expect(current().tracks![0].distance).toBe(250);
  });

  it('adds and removes a property track', () => {
    render(<PropertyEditor />);

    fireEvent.click(screen.getByText('＋ Property'));
    expect(current().tracks).toHaveLength(2);

    fireEvent.click(screen.getByLabelText('Remove opa'));
    expect(current().tracks).toHaveLength(1);
  });

  it('switches a track to absolute, which asks for two coordinates', () => {
    const { container } = render(<PropertyEditor />);

    fireEvent.click(screen.getByText('Absolute'));

    expect(current().tracks![0].valueMode).toBe('absolute');
    expect(container.querySelector('[aria-label="Start Value"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Distance"]')).toBeNull();
  });
});
