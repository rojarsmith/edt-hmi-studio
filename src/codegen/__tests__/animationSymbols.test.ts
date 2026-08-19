// Animations are generated as individually named functions so that something
// other than "the screen appeared" can trigger one. The symbol names the
// animation alone, and stays put when its neighbours change.

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { generateUiHeader } from '../templates/ui.h';
import { generateEventsSource } from '../templates/ui_events.c';
import { defaultOptions, createScreen, animatedComponent } from './helpers';
import type { Animation } from '../../types';

/**
 * One button on one screen, driven by the given animations — each of which the
 * screen plays once it has loaded, which is how an entry animation is now
 * expressed.
 */
function project(...overrides: Partial<Animation>[]) {
  const { component, animations } = animatedComponent('btn', { name: 'myBtn' }, ...overrides);
  const screen = createScreen({
    name: 'main',
    components: [component],
    events: animations.map((animation, i) => ({
      id: `play-${i}`,
      eventType: 'LV_EVENT_SCREEN_LOADED' as const,
      handlerType: 'builtin' as const,
      action: { type: 'playAnimation' as const, animationId: animation.id },
    })),
  });
  return { screens: [screen], animations };
}

type Project = ReturnType<typeof project>;
const generateUiSourceFor = (p: Project, options: ReturnType<typeof defaultOptions>) =>
  generateUiSource(p.screens, options, undefined, [], undefined, undefined, [], undefined, undefined, undefined, [], [], p.animations);
const generateUiHeaderFor = (p: Project, options: ReturnType<typeof defaultOptions>) =>
  generateUiHeader(p.screens, options, [], undefined, undefined, undefined, [], p.animations);

describe('animation functions', () => {
  it('gives each animation its own start and stop function', () => {
    const result = generateUiSourceFor(project({ name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 },
        { name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 },), defaultOptions());

    expect(result).toContain('void ui_anim_fade_in_1_start(void) {');
    expect(result).toContain('void ui_anim_fade_in_1_stop(void) {');
    expect(result).toContain('void ui_anim_slide_left_1_start(void) {');
    expect(result).toContain('void ui_anim_slide_left_1_stop(void) {');
  });

  it('declares them in the header, so anything may call one', () => {
    const header = generateUiHeaderFor(project({ name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 }), defaultOptions());

    expect(header).toContain('void ui_anim_fade_in_1_start(void);');
    expect(header).toContain('void ui_anim_fade_in_1_stop(void);');
  });

  it('starts them from the screen event handler rather than inline', () => {
    const built = project(
      { name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 },
      { name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 },
    );
    const events = generateEventsSource(built.screens, defaultOptions(), [], [], built.animations);

    const handler = events.slice(events.indexOf('void ui_event_screen_main_screen_loaded'));
    expect(handler).toContain('ui_anim_fade_in_1_start();');
    expect(handler).toContain('ui_anim_slide_left_1_start();');
    // The descriptor is built inside the animation's own function.
    expect(handler.slice(0, handler.indexOf('}'))).not.toContain('lv_anim_init');
  });

  it('stops an animation where it stands, without restarting it', () => {
    const result = generateUiSourceFor(project({ name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 }), defaultOptions());

    const stop = result.slice(
      result.indexOf('void ui_anim_fade_in_1_stop(void) {'),
    );
    expect(stop).toContain('lv_anim_delete(ui_my_btn, ui_anim_set_opa);');
  });

  it('uses the v8 spelling of the delete call for LVGL 8', () => {
    const result = generateUiSourceFor(project({ name: 'Fade_In_1', property: 'x', startValue: 0, endValue: 10 }), { ...defaultOptions(), lvglVersion: '8' });

    expect(result).toContain('lv_anim_del(ui_my_btn, (lv_anim_exec_xcb_t)lv_obj_set_x);');
    expect(result).not.toContain('lv_anim_delete(');
  });

  it('keeps a symbol stable when a neighbouring animation is deleted', () => {
    const both = generateUiSourceFor(project({ name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 },
        { name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 },), defaultOptions());
    const survivorOnly = generateUiSourceFor(project({ name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 }), defaultOptions());

    // Index-based naming would have renamed the survivor to _anim_0.
    expect(both).toContain('void ui_anim_slide_left_1_start(void) {');
    expect(survivorOnly).toContain('void ui_anim_slide_left_1_start(void) {');
  });

  it('breaks a name collision carried by an older project', () => {
    // Names are unique project-wide from now on, but a project saved before
    // that rule can hold two "Fade In" animations, and two functions of one
    // name would not compile.
    const result = generateUiSourceFor(project({ name: 'Fade In', property: 'opa', startValue: 0, endValue: 255 },
        { name: 'Fade In', property: 'x', startValue: 0, endValue: 10 },), defaultOptions());

    expect(result).toContain('void ui_anim_fade_in_start(void) {');
    expect(result).toContain('void ui_anim_fade_in_2_start(void) {');
  });

  it('does not let an animation claim a wrapper helper name', () => {
    const result = generateUiSourceFor(project({ name: 'set_opa', property: 'opa', startValue: 0, endValue: 255 },), defaultOptions());

    // ui_anim_set_opa is the generated exec-callback wrapper.
    expect(result).toContain('static void ui_anim_set_opa(void *object, int32_t value) {');
    expect(result).toContain('void ui_anim_set_opa_2_start(void) {');
  });

  it('slides a widget back to where it was designed, not to the raw offset', () => {
    // "Slide in from the left" on a widget placed at x: 40 has to end at 40.
    // Reading -110 as a coordinate would land every such animation at the same
    // spot regardless of where the designer put the widget.
    const { component, animations } = animatedComponent(
      'btn', { name: 'myBtn', x: 40 },
      { name: 'Slide_In_1', property: 'x', startValue: -110, endValue: 0 },
    );
    const screens = [createScreen({ name: 'main', components: [component] })];

    const result = generateUiSource(
      screens, defaultOptions(), undefined, [], undefined, undefined, [],
      undefined, undefined, undefined, [], [], animations,
    );

    expect(result).toContain('lv_anim_set_values(&anim, -70, 40);');
  });

  it('takes the coordinates literally when told they are absolute', () => {
    const { component, animations } = animatedComponent(
      'btn', { name: 'myBtn', x: 40 },
      { name: 'Slide_In_1', property: 'x', startValue: -110, endValue: 0, valueMode: 'absolute' },
    );
    const screens = [createScreen({ name: 'main', components: [component] })];

    const result = generateUiSource(
      screens, defaultOptions(), undefined, [], undefined, undefined, [],
      undefined, undefined, undefined, [], [], animations,
    );

    expect(result).toContain('lv_anim_set_values(&anim, -110, 0);');
  });

  it('generates no function for a property that cannot be animated', () => {
    const built = project({ name: 'Weird_1', property: 'bg_color' });

    expect(generateUiSourceFor(built, defaultOptions()))
      .not.toContain('void ui_anim_weird_1_start(void)');
    // The binding that would have played it says so, rather than calling a
    // symbol that was never defined.
    expect(generateEventsSource(built.screens, defaultOptions(), [], [], built.animations))
      .toContain('names no animation the project still has');
  });
});
