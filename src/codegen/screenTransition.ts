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

import type { Screen } from '../types';
import {
  lvglScreenLoadAnim,
  resolveScreenTransition,
  type ScreenTransitionFields,
} from '../utils/screenTransitions';
import type { CodeGenOptions } from './types';
import { getScreenVarName } from './utils/nameUtils';

/**
 * The C statement that loads `screen`, drawn the way `action` asks for.
 *
 * None becomes lv_scr_load: LVGL's own shortcut for a zero-length transition
 * loads the screen between two frames, which is the point of choosing it.
 */
export function screenLoadStatement(
  screen: Screen,
  action: ScreenTransitionFields | undefined,
  options: CodeGenOptions,
): string {
  const screenVar = getScreenVarName(screen.name, options);
  const { transition, direction, duration } = resolveScreenTransition(action);

  if (transition === 'none') {
    return `lv_scr_load(${screenVar});`;
  }
  const anim = lvglScreenLoadAnim(transition, direction);
  return `lv_scr_load_anim(${screenVar}, ${anim}, ${duration}, 0, false);`;
}
