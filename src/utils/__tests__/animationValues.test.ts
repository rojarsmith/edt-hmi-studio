// An offset animation states one distance and travels it from wherever the
// widget is; an absolute one states two coordinates.

import { describe, it, expect } from 'vitest';
import type { Animation } from '../../types';
import {
  animationDistance,
  animationParkValue,
  animationValueMode,
  previewValues,
  supportsOffset,
} from '../animationValues';

function anim(overrides: Partial<Animation> = {}): Animation {
  return {
    id: 'a1',
    name: 'Slide_In_1',
    targetComponentId: 'c1',
    type: 'slide_left',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    property: 'x',
    startValue: 0,
    endValue: 0,
    ...overrides,
  };
}

/** Parked off the left edge, which is where a slide-in sets off. */
const placed = { x: -100, y: 25 };

describe('animation value mode', () => {
  it('offers the choice for position only', () => {
    expect(supportsOffset('x')).toBe(true);
    expect(supportsOffset('y')).toBe(true);
    // A width of 100 is a hundred pixels wherever it is measured from.
    expect(supportsOffset('width')).toBe(false);
    expect(supportsOffset('opa')).toBe(false);
  });

  it('reads an animation with no mode as absolute', () => {
    // What every animation written before the choice existed meant.
    expect(animationValueMode(anim())).toBe('absolute');
  });

  it('respects an explicit choice', () => {
    expect(animationValueMode(anim({ valueMode: 'offset' }))).toBe('offset');
    expect(animationValueMode(anim({ valueMode: 'absolute' }))).toBe('absolute');
  });

  it('has a distance only in offset mode', () => {
    expect(animationDistance(anim({ valueMode: 'offset', distance: 100 }))).toBe(100);
    expect(animationDistance(anim({ valueMode: 'offset' }))).toBe(0);
    expect(animationDistance(anim({ valueMode: 'absolute', distance: 100 }))).toBe(0);
  });
});

describe('where a screen parks the widget before replaying', () => {
  it('puts an offset animation back where the component was designed', () => {
    // Travelling from wherever it is means replaying without restoring would
    // walk it further on every visit to the screen.
    const travelling = anim({ valueMode: 'offset', distance: 100 });

    expect(animationParkValue(travelling, placed)).toBe(-100);
  });

  it('uses the y coordinate for a vertical travel', () => {
    const vertical = anim({ property: 'y', valueMode: 'offset', distance: 100 });

    expect(animationParkValue(vertical, placed)).toBe(25);
  });

  it('parks an absolute animation at the start it states', () => {
    const absolute = anim({ startValue: -110, endValue: 0 });

    expect(animationParkValue(absolute, placed)).toBe(-110);
  });
});

describe('what the preview draws between', () => {
  it('travels the distance from the designed position', () => {
    const travelling = anim({ valueMode: 'offset', distance: 100 });

    // The canvas has no running widget to read, so it shows the first play:
    // parked at -100, arriving at 0.
    expect(previewValues(travelling, placed)).toEqual({ startValue: -100, endValue: 0 });
  });

  it('takes an absolute animation literally', () => {
    const absolute = anim({ startValue: -110, endValue: 0 });

    expect(previewValues(absolute, placed)).toEqual({ startValue: -110, endValue: 0 });
  });

  it('falls back to zero when the target is gone', () => {
    const travelling = anim({ valueMode: 'offset', distance: 100 });

    expect(previewValues(travelling, undefined)).toEqual({ startValue: 0, endValue: 100 });
  });
});
