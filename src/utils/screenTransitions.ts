/*
 * How a screen change is drawn.
 *
 * The word list is TouchGFX Designer's, because that is the vocabulary the
 * people using this tool already carry in their heads. Four of the five map
 * onto a family LVGL draws natively; the fifth does not. TouchGFX's Block
 * repaints the screen in chunks, which LVGL has no equivalent for, and LVGL's
 * fade has no TouchGFX counterpart, so Fade takes that slot rather than a name
 * the engine could not honour.
 *
 * The mapping, all of it stock LVGL 9.5:
 *
 *   None   instant, no animation at all
 *   Slide  LV_SCR_LOAD_ANIM_MOVE_*  both screens travel, the old pushed out
 *   Cover  LV_SCR_LOAD_ANIM_OVER_*  the new screen travels in over the old
 *   Wipe   LV_SCR_LOAD_ANIM_OUT_*   the old screen leaves, uncovering the new
 *   Fade   LV_SCR_LOAD_ANIM_FADE_IN
 */

import type { ScreenTransition, ScreenTransitionDirection } from '../types';

export type { ScreenTransition, ScreenTransitionDirection };

/**
 * What a navigate action with no transition of its own means.
 *
 * Fade over 300 ms, because that is what every project generated before the
 * field existed: the screen load function has always called lv_scr_load_anim
 * with LV_SCR_LOAD_ANIM_FADE_ON and 300. Reading the absent field as Fade
 * therefore leaves an old project's firmware behaving exactly as it did.
 */
export const DEFAULT_SCREEN_TRANSITION: ScreenTransition = 'fade';
export const DEFAULT_SCREEN_TRANSITION_DIRECTION: ScreenTransitionDirection = 'left';
export const DEFAULT_SCREEN_TRANSITION_DURATION = 300;

export const SCREEN_TRANSITIONS: {
  value: ScreenTransition;
  label: string;
  description: string;
  /** Whether the effect has a direction to choose. */
  directional: boolean;
}[] = [
  {
    value: 'none',
    label: 'None',
    description: 'The new screen replaces the old one between two frames',
    directional: false,
  },
  {
    value: 'slide',
    label: 'Slide',
    description: 'Both screens travel together, the old one pushed out by the new',
    directional: true,
  },
  {
    value: 'cover',
    label: 'Cover',
    description: 'The new screen travels in over the old one, which stays where it is',
    directional: true,
  },
  {
    value: 'wipe',
    label: 'Wipe',
    description: 'The old screen travels away, uncovering the new one beneath it',
    directional: true,
  },
  {
    value: 'fade',
    label: 'Fade',
    description: 'The new screen fades in over the old one',
    directional: false,
  },
];

export const SCREEN_TRANSITION_DIRECTIONS: {
  value: ScreenTransitionDirection;
  label: string;
}[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
];

/** The fields a navigate action carries about how the change is drawn. */
export interface ScreenTransitionFields {
  transition?: ScreenTransition;
  transitionDirection?: ScreenTransitionDirection;
  transitionDuration?: number;
}

export interface ResolvedScreenTransition {
  transition: ScreenTransition;
  direction: ScreenTransitionDirection;
  duration: number;
}

/**
 * Fill in what a navigate action leaves unsaid.
 *
 * Everything downstream - the C, the preview, the summary line - goes through
 * here, so an old project and a new one are the same shape by the time anyone
 * reads them.
 */
export function resolveScreenTransition(
  action: ScreenTransitionFields | undefined,
): ResolvedScreenTransition {
  const transition = action?.transition ?? DEFAULT_SCREEN_TRANSITION;
  return {
    transition,
    direction: action?.transitionDirection ?? DEFAULT_SCREEN_TRANSITION_DIRECTION,
    // None is instant by definition, so a duration here would be a promise the
    // engine does not keep.
    duration:
      transition === 'none'
        ? 0
        : action?.transitionDuration ?? DEFAULT_SCREEN_TRANSITION_DURATION,
  };
}

/** LVGL's family prefix for the directional effects. */
const LVGL_FAMILY: Record<'slide' | 'cover' | 'wipe', string> = {
  slide: 'MOVE',
  cover: 'OVER',
  wipe: 'OUT',
};

/** LVGL says TOP and BOTTOM where the editor says Up and Down. */
const LVGL_DIRECTION: Record<ScreenTransitionDirection, string> = {
  left: 'LEFT',
  right: 'RIGHT',
  up: 'TOP',
  down: 'BOTTOM',
};

/** The lv_screen_load_anim_t value that draws this transition. */
export function lvglScreenLoadAnim(
  transition: ScreenTransition,
  direction: ScreenTransitionDirection,
): string {
  if (transition === 'none') return 'LV_SCR_LOAD_ANIM_NONE';
  if (transition === 'fade') return 'LV_SCR_LOAD_ANIM_FADE_IN';
  return `LV_SCR_LOAD_ANIM_${LVGL_FAMILY[transition]}_${LVGL_DIRECTION[direction]}`;
}

/** One line for a list row: "Slide Left, 300 ms". */
export function describeScreenTransition(action: ScreenTransitionFields | undefined): string {
  const { transition, direction, duration } = resolveScreenTransition(action);
  const entry = SCREEN_TRANSITIONS.find((candidate) => candidate.value === transition);
  if (transition === 'none') return 'None';
  const name = entry?.label ?? transition;
  const heading = entry?.directional
    ? `${name} ${SCREEN_TRANSITION_DIRECTIONS.find((d) => d.value === direction)?.label ?? direction}`
    : name;
  return `${heading}, ${duration} ms`;
}

/**
 * What a logic graph's Navigate node means by its transition.
 *
 * The node predates the five effects and stored one of four strings under
 * `animation`. Those are read here rather than rewritten in the project file,
 * so an old graph keeps working and a re-saved one carries the new fields.
 *
 * A node that says nothing at all means None, which is what the node has
 * always defaulted to - unlike a navigate action, whose silence means the fade
 * its screen load function used to perform.
 */
export function logicNodeTransition(params: {
  transition?: ScreenTransition;
  transitionDirection?: ScreenTransitionDirection;
  transitionDuration?: number;
  animation?: string;
}): ScreenTransitionFields {
  if (params.transition) {
    return {
      transition: params.transition,
      transitionDirection: params.transitionDirection,
      transitionDuration: params.transitionDuration,
    };
  }
  return LEGACY_LOGIC_ANIMATIONS[params.animation ?? ''] ?? { transition: 'none' };
}

const LEGACY_LOGIC_ANIMATIONS: Record<string, ScreenTransitionFields> = {
  none: { transition: 'none' },
  fade: { transition: 'fade' },
  slide_left: { transition: 'slide', transitionDirection: 'left' },
  slide_right: { transition: 'slide', transitionDirection: 'right' },
  slide_up: { transition: 'slide', transitionDirection: 'up' },
  slide_down: { transition: 'slide', transitionDirection: 'down' },
};

/** Where each screen sits, and how opaque it is, part way through a change. */
export interface ScreenChangeFrame {
  from: { dx: number; dy: number; alpha: number };
  to: { dx: number; dy: number; alpha: number };
  /** True when the outgoing screen is drawn over the incoming one. */
  outgoingOnTop: boolean;
}

/** Which way the picture travels, as a unit vector. */
const TRAVEL: Record<ScreenTransitionDirection, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/**
 * What a screen change looks like `progress` of the way through, so the
 * preview can draw what the panel will.
 *
 * Reproduces what lv_screen_load_anim does to the two screen objects: Slide
 * moves both, Cover moves only the screen arriving, Wipe moves only the one
 * leaving, and Fade moves neither. LVGL runs these on its linear path, so this
 * takes progress as it comes.
 */
export function screenChangeFrame(
  transition: ScreenTransition,
  direction: ScreenTransitionDirection,
  progress: number,
  width: number,
  height: number,
): ScreenChangeFrame {
  const travel = TRAVEL[direction];
  const spanX = travel.x * width;
  const spanY = travel.y * height;
  const still = { dx: 0, dy: 0, alpha: 1 };
  // Multiplying a zero span produces -0, which is a strange thing to hand to
  // anyone comparing two frames.
  const offset = (span: number, factor: number) => span * factor || 0;

  switch (transition) {
    case 'slide':
      return {
        // The one arriving starts a screen away, on the side it travels from.
        from: { dx: offset(spanX, progress), dy: offset(spanY, progress), alpha: 1 },
        to: {
          dx: offset(spanX, -(1 - progress)),
          dy: offset(spanY, -(1 - progress)),
          alpha: 1,
        },
        outgoingOnTop: false,
      };
    case 'cover':
      return {
        from: still,
        to: {
          dx: offset(spanX, -(1 - progress)),
          dy: offset(spanY, -(1 - progress)),
          alpha: 1,
        },
        outgoingOnTop: false,
      };
    case 'wipe':
      return {
        from: { dx: offset(spanX, progress), dy: offset(spanY, progress), alpha: 1 },
        to: still,
        // The screen leaving slides across the one it uncovers.
        outgoingOnTop: true,
      };
    case 'fade':
      return {
        from: still,
        to: { dx: 0, dy: 0, alpha: progress },
        outgoingOnTop: false,
      };
    case 'none':
      return { from: still, to: still, outgoingOnTop: false };
  }
}
