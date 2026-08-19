import type { Animation, LvglComponent } from '../types';

/**
 * Properties whose animated value can be read as a distance from where the
 * component sits, rather than as a coordinate of its own.
 *
 * Only position qualifies. A width of 100 means 100 pixels wherever it is
 * measured from, and an opacity has no place on the canvas to be offset from.
 */
const OFFSET_CAPABLE = new Set(['x', 'y']);

/**
 * How an animation's start and end values are read.
 *
 * `offset` counts from where the component sits on the canvas, which is what
 * "slide in from the left" means: −100 is a hundred pixels to the left of its
 * place, not the coordinate −100. `absolute` treats them as coordinates.
 *
 * Position animations default to `offset` — the built-in slides hand out
 * −100 → 0, which only lands correctly for a component designed at zero, and
 * the preview has always drawn them as offsets. Everything else defaults to
 * `absolute`, which is the only reading those properties have.
 */
export function animationValueMode(animation: Animation): 'absolute' | 'offset' {
  if (animation.valueMode) return animation.valueMode;
  return OFFSET_CAPABLE.has(animation.property) ? 'offset' : 'absolute';
}

/** Whether the editor should offer the choice for this property at all. */
export function supportsOffset(property: string): boolean {
  return OFFSET_CAPABLE.has(property);
}

/**
 * What the animation counts from: the component's designed value for the
 * property in offset mode, and zero otherwise.
 *
 * Deliberately the designed position rather than wherever the widget happens
 * to be at runtime. Counting from the live position would drift: parking a
 * widget at its start value before each screen load, then reading that parked
 * position as the next base, walks it further away on every visit.
 */
export function animationBase(
  animation: Animation,
  component: Pick<LvglComponent, 'x' | 'y'> | undefined,
): number {
  if (!component || animationValueMode(animation) !== 'offset') return 0;
  return animation.property === 'x' ? component.x : component.y;
}

/** The animation's start and end as the values a setter is finally given. */
export function resolvedAnimationValues(
  animation: Animation,
  component: Pick<LvglComponent, 'x' | 'y'> | undefined,
): { startValue: number; endValue: number } {
  const base = animationBase(animation, component);
  return {
    startValue: base + animation.startValue,
    endValue: base + animation.endValue,
  };
}
