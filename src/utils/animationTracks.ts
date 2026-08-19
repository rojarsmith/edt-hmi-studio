import type { Animation, AnimationTrack } from '../types';

/**
 * What an animation drives, as a list of property tracks.
 *
 * An animation used to carry one property alongside a Type — "Slide In from
 * Left" and "X Coordinate" saying the same thing twice, and free to contradict
 * each other. It carries tracks now, and a preset is only a button in the
 * dialog that adds one.
 *
 * Animations written before that are read as a single track, so nothing has to
 * be rewritten on disk to keep working.
 */
export function animationTracks(animation: Animation): AnimationTrack[] {
  if (animation.tracks) return animation.tracks;
  if (!animation.property) return [];
  return [{
    id: `${animation.id}-track`,
    property: animation.property,
    valueMode: animation.valueMode,
    startValue: animation.startValue ?? 0,
    endValue: animation.endValue ?? 0,
    distance: animation.distance,
  }];
}

/** A short "x +100 · opa 0→255" summary for a list row. */
export function describeTracks(animation: Animation): string {
  const tracks = animationTracks(animation);
  if (tracks.length === 0) return 'nothing yet';
  return tracks
    .map((track) =>
      track.valueMode === 'offset'
        ? `${track.property} ${(track.distance ?? 0) >= 0 ? '+' : ''}${track.distance ?? 0}`
        : `${track.property} ${track.startValue}→${track.endValue}`,
    )
    .join(' · ');
}

/** A blank track for the property, with values that read sensibly for it. */
export function newTrack(id: string, property = 'x'): AnimationTrack {
  if (property === 'x' || property === 'y') {
    return { id, property, valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 };
  }
  if (property === 'opa') {
    return { id, property, valueMode: 'absolute', startValue: 0, endValue: 255 };
  }
  return { id, property, valueMode: 'absolute', startValue: 0, endValue: 0 };
}
