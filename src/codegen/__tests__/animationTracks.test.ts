// One animation drives one or more properties on a shared clock. Sliding in
// while fading up is one animation with two tracks, not two animations that
// have to be kept in step by hand.

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { defaultOptions, createScreen, createComponent } from './helpers';
import { animationTracks, describeTracks } from '../../utils/animationTracks';
import type { Animation, AnimationTrack, LvglComponent, Screen } from '../../types';

function component(): LvglComponent {
  return createComponent('btn', { id: 'target', name: 'Card', x: -100, y: 20 });
}

function animation(tracks: AnimationTrack[]): Animation {
  return {
    id: 'a1',
    name: 'enter',
    targetComponentId: 'target',
    easing: 'ease_out',
    duration: 300,
    delay: 0,
    repeat: 0,
    tracks,
  };
}

const sourceFor = (animations: Animation[], screens?: Screen[]) =>
  generateUiSource(
    screens ?? [createScreen({ name: 'main', components: [component()] })],
    defaultOptions(), undefined, [], undefined, undefined, [],
    undefined, undefined, undefined, [], [], animations,
  );

describe('multi-property animations', () => {
  const slideAndFade = animation([
    { id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 },
    { id: 't2', property: 'opa', valueMode: 'absolute', startValue: 0, endValue: 255 },
  ]);

  it('sets up one lv_anim_t per property inside a single start function', () => {
    const result = sourceFor([slideAndFade]);
    const fn = result.slice(
      result.indexOf('void ui_anim_enter_start(void) {'),
      result.indexOf('void ui_anim_enter_stop(void) {'),
    );

    expect(fn).toContain('lv_anim_set_exec_cb(&anim, (lv_anim_exec_xcb_t)lv_obj_set_x);');
    expect(fn).toContain('lv_anim_set_exec_cb(&anim, ui_anim_set_opa);');
    // lv_anim_start copies the descriptor, so one local serves both tracks.
    expect(fn.split('lv_anim_init(&anim);')).toHaveLength(3);
    expect(fn.split('lv_anim_start(&anim);')).toHaveLength(3);
    expect(fn.split('lv_anim_t anim;')).toHaveLength(2);
  });

  it('gives each track its own read of the live position', () => {
    const bothAxes = animation([
      { id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 },
      { id: 't2', property: 'y', valueMode: 'offset', startValue: 0, endValue: 0, distance: -40 },
    ]);

    const result = sourceFor([bothAxes]);

    // One `from` would have been redeclared and would read the wrong axis.
    expect(result).toContain('int32_t from_x = lv_obj_get_x(ui_card);');
    expect(result).toContain('int32_t from_y = lv_obj_get_y(ui_card);');
    expect(result).toContain('lv_anim_set_values(&anim, from_x, from_x + (100));');
    expect(result).toContain('lv_anim_set_values(&anim, from_y, from_y + (-40));');
  });

  it('stops every track, not only the first', () => {
    const result = sourceFor([slideAndFade]);
    const stop = result.slice(result.indexOf('void ui_anim_enter_stop(void) {'));

    expect(stop).toContain('lv_anim_delete(ui_card, (lv_anim_exec_xcb_t)lv_obj_set_x);');
    expect(stop).toContain('lv_anim_delete(ui_card, ui_anim_set_opa);');
  });

  it('parks every track before the screen replays it', () => {
    const screens = [createScreen({
      name: 'main',
      components: [component()],
      events: [{
        id: 'e1',
        eventType: 'LV_EVENT_SCREEN_LOADED',
        handlerType: 'builtin',
        action: { type: 'playAnimation', animationId: 'a1' },
      }],
    })];

    const result = sourceFor([slideAndFade], screens);
    const reset = result.slice(result.indexOf('static void ui_screen_main_reset_anims'));

    // The offset track parks where the component was designed; the absolute
    // one at the value it states.
    expect(reset).toContain('lv_obj_set_x(ui_card, -100);');
    expect(reset).toContain('ui_anim_set_opa(ui_card, 0);');
  });

  it('generates only the tracks it can, and skips the rest', () => {
    const mixed = animation([
      { id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 },
      { id: 't2', property: 'bg_color', startValue: 0, endValue: 1 },
    ]);

    const result = sourceFor([mixed]);

    expect(result).toContain('void ui_anim_enter_start(void) {');
    expect(result).not.toContain('bg_color');
  });
});

describe('reading an animation written before tracks', () => {
  const legacy: Animation = {
    id: 'a1',
    name: 'old',
    targetComponentId: 'target',
    type: 'slide_left',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    property: 'x',
    startValue: -110,
    endValue: 0,
  };

  it('reads its single property as one track', () => {
    expect(animationTracks(legacy)).toEqual([{
      id: 'a1-track',
      property: 'x',
      valueMode: undefined,
      startValue: -110,
      endValue: 0,
      distance: undefined,
    }]);
  });

  it('generates from it exactly as before', () => {
    // Nothing has to be rewritten on disk for an older project to keep working.
    expect(sourceFor([legacy])).toContain('lv_anim_set_values(&anim, -110, 0);');
  });

  it('summarises what an animation drives for the list row', () => {
    expect(describeTracks(legacy)).toBe('x -110→0');
    expect(describeTracks(animation([
      { id: 't1', property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 },
      { id: 't2', property: 'opa', valueMode: 'absolute', startValue: 0, endValue: 255 },
    ]))).toBe('x +100 · opa 0→255');
  });
});
