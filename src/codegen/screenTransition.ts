/*
 * The one call that changes screens, and the transition it draws with.
 *
 * Every path that navigates goes through here - the built-in action, the logic
 * graph node - so the same choice in either place compiles to the same line.
 * The screen's own load function keeps the project's default and is what
 * ui_init and hand-written code call; a navigation that names a transition
 * says so at the call site instead.
 *
 * v9 spells these lv_screen_load_anim and lv_screen_load; the v8 names are
 * still exported as aliases, and the rest of the generated source uses them,
 * so they are what comes out here too.
 */

import {
  lvglScreenLoadAnim,
  resolveScreenTransition,
  type ScreenTransitionFields,
} from '../utils/screenTransitions';

/**
 * The C statement that loads the screen held in `screenVar`, drawn the way
 * `action` asks for.
 *
 * Takes the variable name rather than the screen, because the logic graph has
 * its own answer for a screen it cannot resolve and needs to keep giving it.
 *
 * None becomes lv_scr_load: LVGL's own shortcut for a zero-length transition
 * loads the screen between two frames, which is the point of choosing it.
 */
export function screenLoadStatement(
  screenVar: string,
  action: ScreenTransitionFields | undefined,
): string {
  const { transition, direction, duration } = resolveScreenTransition(action);

  if (transition === 'none') {
    return `lv_scr_load(${screenVar});`;
  }
  const anim = lvglScreenLoadAnim(transition, direction);
  return `lv_scr_load_anim(${screenVar}, ${anim}, ${duration}, 0, false);`;
}
