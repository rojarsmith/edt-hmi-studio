// Animations are generated as individually named functions so that something
// other than "the screen appeared" can trigger one. The symbol names the
// animation alone, and stays put when its neighbours change.

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { generateUiHeader } from '../templates/ui.h';
import { defaultOptions, createScreen, createComponent, createAnimation } from './helpers';

function screensWith(...animations: Parameters<typeof createAnimation>[0][]) {
  return [
    createScreen({
      name: 'main',
      components: [
        createComponent('btn', {
          name: 'myBtn',
          animations: animations.map((overrides) => createAnimation(overrides)),
        }),
      ],
    }),
  ];
}

describe('animation functions', () => {
  it('gives each animation its own start and stop function', () => {
    const result = generateUiSource(
      screensWith(
        { name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 },
        { name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 },
      ),
      defaultOptions(),
    );

    expect(result).toContain('void ui_anim_fade_in_1_start(void) {');
    expect(result).toContain('void ui_anim_fade_in_1_stop(void) {');
    expect(result).toContain('void ui_anim_slide_left_1_start(void) {');
    expect(result).toContain('void ui_anim_slide_left_1_stop(void) {');
  });

  it('declares them in the header, so anything may call one', () => {
    const header = generateUiHeader(
      screensWith({ name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 }),
      defaultOptions(),
    );

    expect(header).toContain('void ui_anim_fade_in_1_start(void);');
    expect(header).toContain('void ui_anim_fade_in_1_stop(void);');
  });

  it('starts them from the screen callback rather than inline', () => {
    const result = generateUiSource(
      screensWith(
        { name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 },
        { name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 },
      ),
      defaultOptions(),
    );

    const callback = result.slice(result.indexOf('static void ui_screen_main_start_anims'));
    expect(callback).toContain('ui_anim_fade_in_1_start();');
    expect(callback).toContain('ui_anim_slide_left_1_start();');
    // The descriptor is built inside the animation's own function now.
    expect(callback.slice(0, callback.indexOf('}'))).not.toContain('lv_anim_init');
  });

  it('stops an animation where it stands, without restarting it', () => {
    const result = generateUiSource(
      screensWith({ name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 }),
      defaultOptions(),
    );

    const stop = result.slice(
      result.indexOf('void ui_anim_fade_in_1_stop(void) {'),
    );
    expect(stop).toContain('lv_anim_delete(ui_my_btn, ui_anim_set_opa);');
  });

  it('uses the v8 spelling of the delete call for LVGL 8', () => {
    const result = generateUiSource(
      screensWith({ name: 'Fade_In_1', property: 'x', startValue: 0, endValue: 10 }),
      { ...defaultOptions(), lvglVersion: '8' },
    );

    expect(result).toContain('lv_anim_del(ui_my_btn, (lv_anim_exec_xcb_t)lv_obj_set_x);');
    expect(result).not.toContain('lv_anim_delete(');
  });

  it('keeps a symbol stable when a neighbouring animation is deleted', () => {
    const both = generateUiSource(
      screensWith(
        { name: 'Fade_In_1', property: 'opa', startValue: 0, endValue: 255 },
        { name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 },
      ),
      defaultOptions(),
    );
    const survivorOnly = generateUiSource(
      screensWith({ name: 'Slide_Left_1', property: 'x', startValue: -110, endValue: 0 }),
      defaultOptions(),
    );

    // Index-based naming would have renamed the survivor to _anim_0.
    expect(both).toContain('void ui_anim_slide_left_1_start(void) {');
    expect(survivorOnly).toContain('void ui_anim_slide_left_1_start(void) {');
  });

  it('breaks a name collision carried by an older project', () => {
    // Names are unique project-wide from now on, but a project saved before
    // that rule can hold two "Fade In" animations, and two functions of one
    // name would not compile.
    const result = generateUiSource(
      screensWith(
        { name: 'Fade In', property: 'opa', startValue: 0, endValue: 255 },
        { name: 'Fade In', property: 'x', startValue: 0, endValue: 10 },
      ),
      defaultOptions(),
    );

    expect(result).toContain('void ui_anim_fade_in_start(void) {');
    expect(result).toContain('void ui_anim_fade_in_2_start(void) {');
  });

  it('does not let an animation claim a wrapper helper name', () => {
    const result = generateUiSource(
      screensWith(
        { name: 'set_opa', property: 'opa', startValue: 0, endValue: 255 },
      ),
      defaultOptions(),
    );

    // ui_anim_set_opa is the generated exec-callback wrapper.
    expect(result).toContain('static void ui_anim_set_opa(void *object, int32_t value) {');
    expect(result).toContain('void ui_anim_set_opa_2_start(void) {');
  });

  it('generates no function for a property that cannot be animated', () => {
    const result = generateUiSource(
      screensWith({ name: 'Weird_1', property: 'bg_color' }),
      defaultOptions(),
    );

    expect(result).not.toContain('void ui_anim_weird_1_start(void)');
    expect(result).toContain(
      'Animation "Weird_1" skipped: property "bg_color" is not animatable',
    );
  });
});
