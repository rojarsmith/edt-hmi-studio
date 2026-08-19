// An offset track states one distance and travels it from wherever the widget
// is; an absolute one states two coordinates.

import { describe, it, expect } from 'vitest';
import type { AnimationTrack } from '../../types';
import {
  supportsOffset,
  trackDistance,
  trackParkValue,
  trackPreviewValues,
  trackValueMode,
} from '../animationValues';

function track(overrides: Partial<AnimationTrack> = {}): AnimationTrack {
  return { id: 't1', property: 'x', startValue: 0, endValue: 0, ...overrides };
}

/** Parked off the left edge, which is where a slide-in sets off. */
const placed = { x: -100, y: 25 };

describe('track value mode', () => {
  it('offers the choice for position only', () => {
    expect(supportsOffset('x')).toBe(true);
    expect(supportsOffset('y')).toBe(true);
    // A width of 100 is a hundred pixels wherever it is measured from.
    expect(supportsOffset('width')).toBe(false);
    expect(supportsOffset('opa')).toBe(false);
  });

  it('reads a track with no mode as absolute', () => {
    // What every animation written before the choice existed meant.
    expect(trackValueMode(track())).toBe('absolute');
  });

  it('respects an explicit choice', () => {
    expect(trackValueMode(track({ valueMode: 'offset' }))).toBe('offset');
    expect(trackValueMode(track({ valueMode: 'absolute' }))).toBe('absolute');
  });

  it('has a distance only in offset mode', () => {
    expect(trackDistance(track({ valueMode: 'offset', distance: 100 }))).toBe(100);
    expect(trackDistance(track({ valueMode: 'offset' }))).toBe(0);
    expect(trackDistance(track({ valueMode: 'absolute', distance: 100 }))).toBe(0);
  });
});

describe('where a screen parks the widget before replaying', () => {
  it('puts an offset track back where the component was designed', () => {
    // Travelling from wherever it is means replaying without restoring would
    // walk the widget further on every visit to the screen.
    expect(trackParkValue(track({ valueMode: 'offset', distance: 100 }), placed)).toBe(-100);
  });

  it('uses the y coordinate for a vertical travel', () => {
    const vertical = track({ property: 'y', valueMode: 'offset', distance: 100 });

    expect(trackParkValue(vertical, placed)).toBe(25);
  });

  it('parks an absolute track at the start it states', () => {
    expect(trackParkValue(track({ startValue: -110, endValue: 0 }), placed)).toBe(-110);
  });
});

describe('what the preview draws between', () => {
  it('travels the distance from the designed position', () => {
    const travelling = track({ valueMode: 'offset', distance: 100 });

    // The canvas has no running widget to read, so it shows the first play:
    // parked at -100, arriving at 0.
    expect(trackPreviewValues(travelling, placed)).toEqual({ startValue: -100, endValue: 0 });
  });

  it('takes an absolute track literally', () => {
    const fixed = track({ startValue: -110, endValue: 0 });

    expect(trackPreviewValues(fixed, placed)).toEqual({ startValue: -110, endValue: 0 });
  });

  it('falls back to zero when the target is gone', () => {
    const travelling = track({ valueMode: 'offset', distance: 100 });

    expect(trackPreviewValues(travelling, undefined)).toEqual({ startValue: 0, endValue: 100 });
  });
});
