import type { Animation, LvglComponent } from '../types';

/**
 * Properties that can be animated as a distance rather than as coordinates.
 *
 * Only position qualifies. A width of 100 is a hundred pixels wherever it is
 * measured from, and an opacity has no place to travel from.
 */
const OFFSET_CAPABLE = new Set(['x', 'y']);

/**
 * How an animation states its movement.
 *
 * `absolute` gives two coordinates: start here, end there. `offset` gives one
 * distance, travelled from wherever the widget is when the animation runs —
 * which is not necessarily where it was designed, since a button may have
 * moved it already.
 *
 * Absent means absolute: that is what every animation written before the
 * choice existed meant, and what the generator did with it.
 */
export function animationValueMode(animation: Animation): 'absolute' | 'offset' {
  return animation.valueMode ?? 'absolute';
}

/** Whether the editor should offer the choice for this property at all. */
export function supportsOffset(property: string): boolean {
  return OFFSET_CAPABLE.has(property);
}

/** How far an offset animation travels. Zero for an absolute one. */
export function animationDistance(animation: Animation): number {
  return animationValueMode(animation) === 'offset' ? (animation.distance ?? 0) : 0;
}

/**
 * Where the screen puts the widget back before an entry animation replays.
 *
 * An offset animation counts from wherever the widget is, so replaying one
 * without restoring anything would walk the widget further on every visit to
 * the screen. The place to restore is where it was designed: an author who
 * wants a slide-in parks the component off the edge and animates it in, so its
 * designed position *is* the animation's starting place.
 *
 * An absolute animation states its own start, and parks there.
 */
export function animationParkValue(
  animation: Animation,
  component: Pick<LvglComponent, 'x' | 'y'> | undefined,
): number {
  if (animationValueMode(animation) !== 'offset') return animation.startValue;
  if (!component) return 0;
  return animation.property === 'x' ? component.x : component.y;
}

/**
 * The values the preview draws between.
 *
 * The canvas has no running widget to read a position from, so an offset
 * animation is shown travelling from the component's designed position — the
 * same journey the firmware makes on the first play.
 */
export function previewValues(
  animation: Animation,
  component: Pick<LvglComponent, 'x' | 'y'> | undefined,
): { startValue: number; endValue: number } {
  if (animationValueMode(animation) !== 'offset') {
    return { startValue: animation.startValue, endValue: animation.endValue };
  }
  const from = component
    ? (animation.property === 'x' ? component.x : component.y)
    : 0;
  return { startValue: from, endValue: from + animationDistance(animation) };
}
