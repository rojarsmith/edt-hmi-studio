// A navigation says how it is drawn. The five effects are TouchGFX Designer's
// names over LVGL's four native families plus fade, and the choice belongs to
// the navigation rather than to the screen being entered.

import { describe, it, expect } from 'vitest';
import { screenLoadStatement } from '../screenTransition';
import {
  describeScreenTransition,
  logicNodeTransition,
  lvglScreenLoadAnim,
  resolveScreenTransition,
} from '../../utils/screenTransitions';
const statement = (action: Parameters<typeof screenLoadStatement>[1]) =>
  screenLoadStatement('ui_screen_settings', action);

describe('screen transitions', () => {
  it('maps each effect onto its LVGL family', () => {
    expect(lvglScreenLoadAnim('slide', 'left')).toBe('LV_SCR_LOAD_ANIM_MOVE_LEFT');
    expect(lvglScreenLoadAnim('cover', 'right')).toBe('LV_SCR_LOAD_ANIM_OVER_RIGHT');
    expect(lvglScreenLoadAnim('wipe', 'up')).toBe('LV_SCR_LOAD_ANIM_OUT_TOP');
    expect(lvglScreenLoadAnim('fade', 'down')).toBe('LV_SCR_LOAD_ANIM_FADE_IN');
    expect(lvglScreenLoadAnim('none', 'left')).toBe('LV_SCR_LOAD_ANIM_NONE');
  });

  it('says Up and Down where LVGL says TOP and BOTTOM', () => {
    expect(lvglScreenLoadAnim('slide', 'up')).toBe('LV_SCR_LOAD_ANIM_MOVE_TOP');
    expect(lvglScreenLoadAnim('slide', 'down')).toBe('LV_SCR_LOAD_ANIM_MOVE_BOTTOM');
  });

  it('reads an action that names nothing as the fade it always was', () => {
    // Projects saved before the field existed generated a 300 ms FADE_ON, and
    // FADE_ON is FADE_IN in v9 - so their firmware is unchanged.
    expect(resolveScreenTransition(undefined)).toEqual({
      transition: 'fade',
      direction: 'left',
      duration: 300,
    });
    expect(statement(undefined)).toBe('lv_scr_load_anim(ui_screen_settings, LV_SCR_LOAD_ANIM_FADE_IN, 300, 0, false);');
  });

  it('loads between two frames for None', () => {
    // No animation at all, so a widget drawn identically on both screens does
    // not move: the change is invisible.
    expect(statement({ transition: 'none', transitionDuration: 500 })).toBe('lv_scr_load(ui_screen_settings);');
    expect(resolveScreenTransition({ transition: 'none', transitionDuration: 500 }).duration).toBe(0);
  });

  it('writes the duration the navigation asked for', () => {
    expect(statement({ transition: 'slide', transitionDirection: 'right', transitionDuration: 500 }))
      .toBe('lv_scr_load_anim(ui_screen_settings, LV_SCR_LOAD_ANIM_MOVE_RIGHT, 500, 0, false);');
  });

  it('ignores the direction of an effect that has none', () => {
    expect(statement({ transition: 'fade', transitionDirection: 'down', transitionDuration: 200 }))
      .toBe('lv_scr_load_anim(ui_screen_settings, LV_SCR_LOAD_ANIM_FADE_IN, 200, 0, false);');
  });

  it('describes itself for a list row', () => {
    expect(describeScreenTransition({ transition: 'slide', transitionDirection: 'up', transitionDuration: 400 }))
      .toBe('Slide Up, 400 ms');
    expect(describeScreenTransition({ transition: 'fade' })).toBe('Fade, 300 ms');
    expect(describeScreenTransition({ transition: 'none' })).toBe('None');
  });
});

describe('a logic graph written before the five effects', () => {
  it('reads its four old spellings', () => {
    expect(logicNodeTransition({ animation: 'slide_left' }))
      .toEqual({ transition: 'slide', transitionDirection: 'left' });
    expect(logicNodeTransition({ animation: 'slide_right' }))
      .toEqual({ transition: 'slide', transitionDirection: 'right' });
    expect(logicNodeTransition({ animation: 'fade' })).toEqual({ transition: 'fade' });
    expect(logicNodeTransition({ animation: 'none' })).toEqual({ transition: 'none' });
  });

  it('means None when it says nothing', () => {
    // Which is not what an absent field means on a navigate action: the node
    // has always defaulted to no transition, and the action to a fade.
    expect(logicNodeTransition({})).toEqual({ transition: 'none' });
  });

  it('is overridden by the fields an edited node writes', () => {
    expect(logicNodeTransition({
      animation: 'fade',
      transition: 'cover',
      transitionDirection: 'up',
      transitionDuration: 200,
    })).toEqual({ transition: 'cover', transitionDirection: 'up', transitionDuration: 200 });
  });
});
