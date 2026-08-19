// An event can play or stop one named animation. The binding names it by id,
// so renaming the animation cannot quietly unbind the button.

import { describe, it, expect } from 'vitest';
import { generateEventsSource } from '../templates/ui_events.c';
import { defaultOptions, createScreen, createComponent, createAnimation, createEvent } from './helpers';

function project(actionType: 'playAnimation' | 'stopAnimation', animationId: string, animOverrides = {}) {
  const target = createComponent('label', {
    id: 'target',
    name: 'Title',
    animations: [createAnimation({ id: 'anim-1', name: 'Pulse_1', property: 'opa', ...animOverrides })],
  });
  const button = createComponent('btn', {
    id: 'button',
    name: 'Go',
    events: [createEvent({
      eventType: 'LV_EVENT_CLICKED',
      handlerType: 'builtin',
      action: { type: actionType, animationId },
    })],
  });
  return [createScreen({ name: 'main', components: [target, button] })];
}

describe('animation actions', () => {
  it('plays the named animation by calling its start function', () => {
    const result = generateEventsSource(project('playAnimation', 'anim-1'), defaultOptions());

    expect(result).toContain('ui_anim_pulse_1_start();');
    expect(result).not.toContain('ui_anim_pulse_1_stop();');
  });

  it('stops it by calling its stop function', () => {
    const result = generateEventsSource(project('stopAnimation', 'anim-1'), defaultOptions());

    expect(result).toContain('ui_anim_pulse_1_stop();');
    expect(result).not.toContain('ui_anim_pulse_1_start();');
  });

  it('names the same symbol ui.c defined, so the call links', async () => {
    const { generateUiSource } = await import('../templates/ui.c');
    const screens = project('playAnimation', 'anim-1');

    expect(generateUiSource(screens, defaultOptions())).toContain('void ui_anim_pulse_1_start(void) {');
    expect(generateEventsSource(screens, defaultOptions())).toContain('ui_anim_pulse_1_start();');
  });

  it('comments out a binding whose animation is gone', () => {
    // Deleting the animation must not leave a call to a symbol that no longer
    // exists — that fails to link rather than merely doing nothing.
    const result = generateEventsSource(project('playAnimation', 'deleted-id'), defaultOptions());

    expect(result).not.toContain('_start();');
    expect(result).toContain('names no animation the project still has');
  });

  it('comments out a binding whose property cannot be animated', () => {
    const result = generateEventsSource(
      project('playAnimation', 'anim-1', { property: 'bg_color' }),
      defaultOptions(),
    );

    expect(result).not.toContain('ui_anim_pulse_1_start();');
    expect(result).toContain('names no animation the project still has');
  });

  it('survives a binding that names no animation at all', () => {
    const result = generateEventsSource(project('playAnimation', ''), defaultOptions());

    expect(result).toContain('names no animation the project still has');
  });
});
