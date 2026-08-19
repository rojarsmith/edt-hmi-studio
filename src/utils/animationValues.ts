import type { AnimationTrack, LvglComponent } from '../types';

/**
 * Properties that can be animated as a distance rather than as coordinates.
 *
 * Only position qualifies. A width of 100 is a hundred pixels wherever it is
 * measured from, and an opacity has no place to travel from.
 */
const OFFSET_CAPABLE = new Set(['x', 'y']);

/**
 * How a track states its movement.
 *
 * `absolute` gives two coordinates: start here, end there. `offset` gives one
 * distance, travelled from wherever the widget is when the animation runs —
 * which is not necessarily where it was designed, since a button may have
 * moved it already.
 *
 * Absent means absolute: that is what every animation written before the
 * choice existed meant, and what the generator did with it.
 */
export function trackValueMode(track: AnimationTrack): 'absolute' | 'offset' {
  return track.valueMode ?? 'absolute';
}

/** Whether the editor should offer the choice for this property at all. */
export function supportsOffset(property: string): boolean {
  return OFFSET_CAPABLE.has(property);
}

/** How far an offset track travels. Zero for an absolute one. */
export function trackDistance(track: AnimationTrack): number {
  return trackValueMode(track) === 'offset' ? (track.distance ?? 0) : 0;
}

/**
 * Where the screen puts the widget back before an entry animation replays.
 *
 * An offset track counts from wherever the widget is, so replaying one without
 * restoring anything would walk the widget further on every visit to the
 * screen. The place to restore is where it was designed: an author who wants a
 * slide-in parks the component off the edge and animates it in, so its
 * designed position *is* the track's starting place.
 *
 * An absolute track states its own start, and parks there.
 */
export function trackParkValue(
  track: AnimationTrack,
  component: Pick<LvglComponent, 'x' | 'y'> | undefined,
): number {
  if (trackValueMode(track) !== 'offset') return track.startValue;
  if (!component) return 0;
  return track.property === 'x' ? component.x : component.y;
}

/**
 * The values the preview draws between.
 *
 * The canvas has no running widget to read a position from, so an offset track
 * is shown travelling from the component's designed position — the same
 * journey the firmware makes on the first play.
 */
export function trackPreviewValues(
  track: AnimationTrack,
  component: Pick<LvglComponent, 'x' | 'y'> | undefined,
): { startValue: number; endValue: number } {
  if (trackValueMode(track) !== 'offset') {
    return { startValue: track.startValue, endValue: track.endValue };
  }
  const from = component
    ? (track.property === 'x' ? component.x : component.y)
    : 0;
  return { startValue: from, endValue: from + trackDistance(track) };
}
