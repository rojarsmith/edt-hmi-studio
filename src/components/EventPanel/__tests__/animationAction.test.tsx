// Wiring a button to an animation: the picker lists every animation in the
// project, names the widget each one drives, and stores the binding by id.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, EventBinding, LvglComponent } from '../../../types';
import EventEditDialog from '../EventEditDialog';

function anim(id: string, name: string, targetComponentId: string): Animation {
  return {
    id,
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

function setUp(components: LvglComponent[], animations: Animation[] = []) {
  useEditorStore.setState({
    screens: [{ id: 'screen-1', name: 'Screen 1', components, backgroundColor: '#fff' }],
    animations,
    currentScreenId: 'screen-1',
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

function renderDialog(existing: EventBinding | null = null) {
  const saved: EventBinding[] = [];
  render(
    <EventEditDialog
      event={existing}
      isCreating={!existing}
      onSave={(e) => saved.push(e)}
      onClose={() => {}}
    />,
  );
  return saved;
}

function chooseAction(label: string) {
  const select = screen.getAllByRole('combobox')
    .find(el => [...el.querySelectorAll('option')].some(o => o.textContent === label))!;
  fireEvent.change(select, {
    target: { value: [...select.querySelectorAll('option')].find(o => o.textContent === label)!.value },
  });
}

describe('play animation action', () => {
  beforeEach(() => {
    setUp(
      [component('label-1', 'Title'), component('btn-1', 'Go')],
      [anim('anim-1', 'Pulse_1', 'label-1')],
    );
  });

  it('lists the project animations with the widget each drives', () => {
    renderDialog();
    chooseAction('Play Animation');

    expect(screen.getByText('Pulse_1 → Title')).toBeTruthy();
  });

  it('stores the chosen animation by id', () => {
    const saved = renderDialog();
    chooseAction('Play Animation');

    const picker = screen.getByText('Select an animation...').closest('select')!;
    fireEvent.change(picker, { target: { value: 'anim-1' } });
    fireEvent.click(screen.getByText('Save'));

    expect(saved[0].action).toMatchObject({ type: 'playAnimation', animationId: 'anim-1' });
  });

  it('stores a stop binding the same way', () => {
    const saved = renderDialog();
    chooseAction('Stop Animation');

    const picker = screen.getByText('Select an animation...').closest('select')!;
    fireEvent.change(picker, { target: { value: 'anim-1' } });
    fireEvent.click(screen.getByText('Save'));

    expect(saved[0].action).toMatchObject({ type: 'stopAnimation', animationId: 'anim-1' });
  });

  it('says where to make one when the project has no animations', () => {
    setUp([component('btn-1', 'Go')]);
    renderDialog();
    chooseAction('Play Animation');

    expect(screen.getByText(/no animations yet/)).toBeTruthy();
  });

  it('reopens an existing binding on its animation', () => {
    const existing: EventBinding = {
      id: 'e1',
      eventType: 'LV_EVENT_CLICKED',
      handlerType: 'builtin',
      action: { type: 'playAnimation', animationId: 'anim-1' },
    };
    renderDialog(existing);

    const picker = screen.getByText('Select an animation...').closest('select') as HTMLSelectElement;
    expect(picker.value).toBe('anim-1');
  });
});
