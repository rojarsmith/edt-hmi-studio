// Which animations a project holds, and the C symbols they generate.
//
// A symbol names the animation alone — never its target. Animation names are
// unique project-wide (see nextAnimationName in src/utils/animationNames.ts),
// so retargeting an animation must not rename the function some button has
// been wired to call. Projects written before that rule can still carry
// duplicate names, so collisions are broken here rather than trusted away.

import type { Screen, Animation, AnimationTrack, LvglComponent } from '../types';
import type { CodeGenOptions } from './types';
import { componentsById, screenByComponentId } from '../utils/animationAssets';
import { animationTracks } from '../utils/animationTracks';
import { getComponentVarName, toValidCIdentifier, convertName } from './utils/nameUtils';

/**
 * Animated properties whose LVGL setter takes a style selector, so it cannot be
 * used as an `lv_anim_exec_xcb_t` (`void (*)(void *, int32_t)`) directly —
 * calling a three-parameter function through a two-parameter pointer leaves the
 * selector as whatever happens to be in the register, and the value lands on an
 * arbitrary part/state. Each needs a generated wrapper instead.
 *
 * These use style transforms rather than `lv_image_set_scale`/`_rotation`, which
 * only exist on image widgets: applied to any other widget they reinterpret the
 * object, and LV_USE_ASSERT_OBJ is off in the firmware so nothing catches it.
 */
export const ANIM_WRAPPERS: Record<string, { name: string; setter: (isV9: boolean) => string[] }> = {
  opa: {
    name: 'ui_anim_set_opa',
    setter: () => ['lv_obj_set_style_opa(target, (lv_opa_t)value, LV_PART_MAIN);'],
  },
  transform_zoom: {
    name: 'ui_anim_set_zoom',
    setter: (isV9) => isV9
      ? [
        'lv_obj_set_style_transform_scale_x(target, value, LV_PART_MAIN);',
        'lv_obj_set_style_transform_scale_y(target, value, LV_PART_MAIN);',
      ]
      : ['lv_obj_set_style_transform_zoom(target, value, LV_PART_MAIN);'],
  },
  transform_angle: {
    name: 'ui_anim_set_angle',
    setter: (isV9) => isV9
      ? ['lv_obj_set_style_transform_rotation(target, value, LV_PART_MAIN);']
      : ['lv_obj_set_style_transform_angle(target, value, LV_PART_MAIN);'],
  },
};

/** Properties whose setter already matches lv_anim_exec_xcb_t exactly. */
export const ANIM_DIRECT_SETTERS: Record<string, string> = {
  x: 'lv_obj_set_x',
  y: 'lv_obj_set_y',
  width: 'lv_obj_set_width',
  height: 'lv_obj_set_height',
};

/**
 * Map animation property to LVGL exec callback, or undefined when the property
 * cannot be animated — emitting a wrong-but-plausible callback would silently
 * animate something the user never asked for.
 */
export function getAnimExecCb(property: string): string | undefined {
  const wrapper = ANIM_WRAPPERS[property];
  if (wrapper) return wrapper.name;
  const direct = ANIM_DIRECT_SETTERS[property];
  return direct ? `(lv_anim_exec_xcb_t)${direct}` : undefined;
}

/** One animation, resolved to everything the templates need to emit it. */
export interface AnimationSymbol {
  animation: Animation;
  /** The screen the animated widget lives on. */
  screen: Screen;
  /** C variable of the widget the animation drives. */
  targetVar: string;
  /** `ui_anim_<name>`, unique across the project. */
  base: string;
  /** The widget the animation drives, for its designed position. */
  component: LvglComponent;
  /**
   * The tracks that can actually be generated, each with its exec callback.
   * A track whose property cannot be animated is left out; an animation with
   * no generatable track produces no function at all.
   */
  tracks: ResolvedTrack[];
  /** Tracks whose property cannot be animated, for the honest comment. */
  unanimatable: AnimationTrack[];
}

/** One track of an animation, paired with the callback that drives it. */
export interface ResolvedTrack {
  track: AnimationTrack;
  execCb: string;
}

/** `${base}_start`: starts (or restarts) the animation. */
export function animStartFuncName(symbol: AnimationSymbol): string {
  return `${symbol.base}_start`;
}

/** `${base}_stop`: leaves the widget wherever the animation had reached. */
export function animStopFuncName(symbol: AnimationSymbol): string {
  return `${symbol.base}_stop`;
}

/**
 * `${base}_completed`: what LVGL calls once the animation has finished, which
 * is where the animation's own event bindings run.
 *
 * Only the animation's first track carries it. The tracks share one clock, so
 * they all end together and any one of them would do - one of them has to,
 * or an animation with two tracks would announce itself twice.
 */
export function animCompletedFuncName(symbol: AnimationSymbol): string {
  return `${symbol.base}_completed`;
}

/** Whether anything is waiting for this animation to finish. */
export function hasCompletedBindings(symbol: AnimationSymbol): boolean {
  return symbol.tracks.length > 0 && (symbol.animation.events ?? []).length > 0;
}

/** The project's animations indexed by id, for resolving a binding. */
export function animationSymbolsById(
  animations: Animation[],
  screens: Screen[],
  options: CodeGenOptions,
): Map<string, AnimationSymbol> {
  return new Map(
    collectAnimationSymbols(animations, screens, options).map(
      (symbol) => [symbol.animation.id, symbol],
    ),
  );
}

function uniqueBase(animation: Animation, options: CodeGenOptions, taken: Set<string>): string {
  const converted = convertName(toValidCIdentifier(animation.name || animation.id), options);
  const wanted = `ui_anim_${converted}`;
  let base = wanted;
  for (let n = 2; taken.has(base); n += 1) base = `${wanted}_${n}`;
  taken.add(base);
  return base;
}

/**
 * Every animation in the project, in screen → component → child order, each
 * carrying the symbol its functions are generated under.
 *
 * Only `targetVar` depends on `needsScreenPrefix`; `base` and `execCb` do
 * not, so a caller that only needs to name an animation — the event templates,
 * naming one to call — can leave the set out.
 */
export function collectAnimationSymbols(
  animations: Animation[],
  screens: Screen[],
  options: CodeGenOptions,
  needsScreenPrefix: Set<string> = new Set(),
): AnimationSymbol[] {
  const symbols: AnimationSymbol[] = [];
  // An animation named "set_opa" would otherwise claim a wrapper's symbol.
  const taken = new Set(Object.values(ANIM_WRAPPERS).map((wrapper) => wrapper.name));
  const components = componentsById(screens);
  const screenOf = screenByComponentId(screens);

  for (const animation of animations) {
    const component = components.get(animation.targetComponentId);
    const screen = screenOf.get(animation.targetComponentId);
    // An animation whose target was deleted drives nothing; the editor shows it
    // as lacking one rather than deleting it, and no code comes of it.
    if (!component || !screen) continue;
    const targetVar = needsScreenPrefix.has(component.id)
      ? getComponentVarName(`${screen.name}_${component.name}`, options)
      : getComponentVarName(component.name, options);
    const tracks: ResolvedTrack[] = [];
    const unanimatable: AnimationTrack[] = [];
    for (const track of animationTracks(animation)) {
      const execCb = getAnimExecCb(track.property);
      if (execCb) tracks.push({ track, execCb });
      else unanimatable.push(track);
    }

    symbols.push({
      animation,
      screen,
      targetVar,
      component,
      base: uniqueBase(animation, options, taken),
      tracks,
      unanimatable,
    });
  }

  return symbols;
}
