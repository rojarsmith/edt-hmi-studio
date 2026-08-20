// An animation can announce that it has finished, which is the only thing an
// animation itself says. LVGL calls a completed callback rather than sending
// an event to an object, so the binding compiles to that callback - which is
// what makes "play the exit animation, then change screen" expressible.

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { generateEventsSource } from '../templates/ui_events.c';
import { generateEventsHeader } from '../templates/ui_events.h';
import type { Animation, EventBinding, Screen } from '../../types';
import { defaultOptions, createScreen, createComponent, createAnimation } from './helpers';

function project(events: EventBinding[], animOverrides: Partial<Animation> = {}) {
  const card = createComponent('obj', { id: 'card', name: 'Card' });
  const screens: Screen[] = [
    createScreen({ id: 'main', name: 'main', components: [card] }),
    createScreen({ id: 'next', name: 'next' }),
  ];
  const animations = [createAnimation({
    id: 'anim-1',
    name: 'Exit',
    targetComponentId: 'card',
    duration: 400,
    tracks: [{ id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: -200 }],
    events,
    ...animOverrides,
  })];
  return { screens, animations };
}

const completed = (action: EventBinding['action']): EventBinding => ({
  id: 'e1',
  eventType: 'ANIM_COMPLETED',
  handlerType: 'builtin',
  action,
});

const source = (p: ReturnType<typeof project>) =>
  generateUiSource(p.screens, defaultOptions(), undefined, [], undefined, undefined, [],
    undefined, undefined, undefined, [], [], p.animations);
const events = (p: ReturnType<typeof project>) =>
  generateEventsSource(p.screens, defaultOptions(), [], [], p.animations);

describe('an animation that has finished', () => {
  it('changes screen when the binding says so', () => {
    const p = project([completed({
      type: 'navigate',
      targetScreen: 'next',
      transition: 'slide',
      transitionDirection: 'left',
      transitionDuration: 250,
    })]);

    const handler = events(p);
    expect(handler).toContain('void ui_anim_exit_completed(lv_anim_t *a) {');
    expect(handler).toContain('lv_scr_load_anim(ui_screen_next, LV_SCR_LOAD_ANIM_MOVE_LEFT, 250, 0, false);');
  });

  it('hands the callback to LVGL where the animation starts', () => {
    const p = project([completed({ type: 'navigate', targetScreen: 'next' })]);

    const result = source(p);
    expect(result).toContain('lv_anim_set_completed_cb(&anim, ui_anim_exit_completed);');
    // Set before the animation is started, or LVGL would never see it.
    expect(result.indexOf('lv_anim_set_completed_cb'))
      .toBeLessThan(result.indexOf('lv_anim_start(&anim);'));
  });

  it('announces itself once however many properties it drives', () => {
    // The tracks share one clock and end together, so exactly one of them
    // carries the callback.
    const p = project([completed({ type: 'navigate', targetScreen: 'next' })], {
      tracks: [
        { id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: -200 },
        { id: 't2', property: 'opa', valueMode: 'absolute', startValue: 255, endValue: 0 },
      ],
    });

    const result = source(p);
    expect(result.split('lv_anim_set_completed_cb').length - 1).toBe(1);
    // On the first track: the second one re-inits the same local, which would
    // clear it again.
    const body = result.slice(
      result.indexOf('void ui_anim_exit_start(void) {'),
      result.indexOf('void ui_anim_exit_stop(void) {'),
    );
    expect(body.indexOf('lv_anim_set_completed_cb')).toBeLessThan(body.lastIndexOf('lv_anim_init'));
  });

  it('declares the callback for ui.c to reach', () => {
    const p = project([completed({ type: 'navigate', targetScreen: 'next' })]);

    expect(generateEventsHeader(p.screens, defaultOptions(), p.animations))
      .toContain('void ui_anim_exit_completed(lv_anim_t *a);');
  });

  it('never reaches lv_obj_add_event_cb', () => {
    // ANIM_COMPLETED is not an LVGL event code; an animation finishing is a
    // callback on the animation, not an event on an object.
    const p = project([completed({ type: 'navigate', targetScreen: 'next' })]);

    expect(source(p)).not.toContain('ANIM_COMPLETED');
    expect(events(p)).not.toContain('ANIM_COMPLETED');
  });

  it('plays another animation, which is how a sequence is written', () => {
    const p = project([completed({ type: 'playAnimation', animationId: 'anim-2' })]);
    p.animations.push(createAnimation({
      id: 'anim-2',
      name: 'Settle',
      targetComponentId: 'card',
      tracks: [{ id: 't1', property: 'opa', valueMode: 'absolute', startValue: 0, endValue: 255 }],
    }));

    expect(events(p)).toContain('ui_anim_settle_start();');
  });

  it('generates nothing for an animation that drives nothing', () => {
    // No start function exists, so nothing would ever call the callback.
    const p = project([completed({ type: 'navigate', targetScreen: 'next' })], { tracks: [] });

    expect(events(p)).not.toContain('ui_anim_exit_completed');
    expect(source(p)).not.toContain('lv_anim_set_completed_cb');
  });

  it('leaves an animation nothing waits on exactly as it was', () => {
    const p = project([]);

    expect(source(p)).not.toContain('lv_anim_set_completed_cb');
    expect(events(p)).not.toContain('_completed(lv_anim_t');
  });
});
