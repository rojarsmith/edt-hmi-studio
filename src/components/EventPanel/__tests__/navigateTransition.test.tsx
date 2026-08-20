// A navigation carries its own transition, so the dialog that writes the
// binding is where it is chosen — under the screen it goes to.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../../store/editorStore';
import type { EventBinding } from '../../../types';
import EventEditDialog from '../EventEditDialog';

function setUp(event: EventBinding | null = null) {
  useEditorStore.setState({
    screens: [
      { id: 's1', name: 'Screen 1', components: [], backgroundColor: '#fff' },
      { id: 's2', name: 'Screen 2', components: [], backgroundColor: '#fff' },
    ],
    currentScreenId: 's1',
    languages: [],
    texts: [],
  });
  const onSave = vi.fn();
  render(<EventEditDialog event={event} isCreating={!event} onSave={onSave} onClose={vi.fn()} />);
  return { onSave };
}

const save = () => fireEvent.click(screen.getByText('Save'));

describe('navigate transition', () => {
  it('offers the five effects', () => {
    setUp();

    const options = [...screen.getByLabelText('Transition').querySelectorAll('option')]
      .map(option => option.textContent);

    expect(options).toEqual(['None', 'Slide', 'Cover', 'Wipe', 'Fade']);
  });

  it('opens on the fade an older binding already generated', () => {
    setUp();

    expect(screen.getByLabelText<HTMLSelectElement>('Transition').value).toBe('fade');
    expect(screen.getByLabelText<HTMLInputElement>('Duration (ms)').value).toBe('300');
  });

  it('asks which way only for the effects that travel', () => {
    setUp();

    // Fade has nowhere to go.
    expect(screen.queryByLabelText('Direction')).toBeNull();

    fireEvent.change(screen.getByLabelText('Transition'), { target: { value: 'slide' } });
    expect(screen.getByLabelText('Direction')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Transition'), { target: { value: 'cover' } });
    expect(screen.getByLabelText('Direction')).toBeTruthy();
  });

  it('drops both fields for None, which is instant', () => {
    setUp();

    fireEvent.change(screen.getByLabelText('Transition'), { target: { value: 'none' } });

    expect(screen.queryByLabelText('Direction')).toBeNull();
    expect(screen.queryByLabelText('Duration (ms)')).toBeNull();
  });

  it('saves the choice onto the action', () => {
    const { onSave } = setUp();

    fireEvent.change(screen.getByLabelText('Target Screen'), { target: { value: 'Screen 2' } });
    fireEvent.change(screen.getByLabelText('Transition'), { target: { value: 'wipe' } });
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'up' } });
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '450' } });
    save();

    expect(onSave.mock.calls[0][0].action).toMatchObject({
      type: 'navigate',
      targetScreen: 'Screen 2',
      transition: 'wipe',
      transitionDirection: 'up',
      transitionDuration: 450,
    });
  });

  it('leaves no direction or duration behind when None is chosen', () => {
    const { onSave } = setUp();

    fireEvent.change(screen.getByLabelText('Target Screen'), { target: { value: 'Screen 2' } });
    fireEvent.change(screen.getByLabelText('Transition'), { target: { value: 'none' } });
    save();

    expect(onSave.mock.calls[0][0].action).toEqual({
      type: 'navigate',
      targetScreen: 'Screen 2',
      transition: 'none',
    });
  });

  it('reopens an existing binding on what it holds', () => {
    setUp({
      id: 'e1',
      eventType: 'LV_EVENT_CLICKED',
      handlerType: 'builtin',
      action: {
        type: 'navigate',
        targetScreen: 'Screen 2',
        transition: 'cover',
        transitionDirection: 'right',
        transitionDuration: 250,
      },
    });

    expect(screen.getByLabelText<HTMLSelectElement>('Transition').value).toBe('cover');
    expect(screen.getByLabelText<HTMLSelectElement>('Direction').value).toBe('right');
    expect(screen.getByLabelText<HTMLInputElement>('Duration (ms)').value).toBe('250');
  });

  it('previews the line the firmware will run', () => {
    setUp();

    fireEvent.change(screen.getByLabelText('Target Screen'), { target: { value: 'Screen 2' } });
    fireEvent.change(screen.getByLabelText('Transition'), { target: { value: 'slide' } });
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'left' } });
    fireEvent.click(screen.getByText('Show'));

    expect(document.querySelector('.code-preview')!.textContent)
      .toContain('lv_scr_load_anim(ui_screen_screen_2, LV_SCR_LOAD_ANIM_MOVE_LEFT, 300, 0, false);');
  });
});
