// A position animation's numbers count from where the component sits, which
// is the only reading under which "slide in from the left" lands the widget
// back in its place.

import { describe, it, expect } from 'vitest';
import type { Animation } from '../../types';
import {
  animationBase,
  animationValueMode,
  resolvedAnimationValues,
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
    startValue: -100,
    endValue: 0,
    ...overrides,
  };
}

const placed = { x: 40, y: 25 };

describe('animation value mode', () => {
  it('offers the choice for position only', () => {
    expect(supportsOffset('x')).toBe(true);
    expect(supportsOffset('y')).toBe(true);
    // A width of 100 is 100 pixels wherever it is measured from.
    expect(supportsOffset('width')).toBe(false);
    expect(supportsOffset('opa')).toBe(false);
  });

  it('defaults position to offset and everything else to absolute', () => {
    expect(animationValueMode(anim({ property: 'x' }))).toBe('offset');
    expect(animationValueMode(anim({ property: 'y' }))).toBe('offset');
    expect(animationValueMode(anim({ property: 'opa' }))).toBe('absolute');
  });

  it('respects an explicit choice', () => {
    expect(animationValueMode(anim({ property: 'x', valueMode: 'absolute' }))).toBe('absolute');
    expect(animationValueMode(anim({ property: 'opa', valueMode: 'offset' }))).toBe('offset');
  });
});

describe('resolving values against the component', () => {
  it('counts an offset animation from where the component sits', () => {
    // Designed at x: 40, sliding in from 100px to its left: -60 → 40, so it
    // ends where the designer put it rather than at the coordinate 0.
    expect(resolvedAnimationValues(anim(), placed)).toEqual({ startValue: -60, endValue: 40 });
  });

  it('uses the y coordinate for a vertical slide', () => {
    const vertical = anim({ property: 'y', startValue: -100, endValue: 0 });

    expect(resolvedAnimationValues(vertical, placed)).toEqual({ startValue: -75, endValue: 25 });
  });

  it('leaves an absolute animation alone', () => {
    const absolute = anim({ valueMode: 'absolute' });

    expect(resolvedAnimationValues(absolute, placed)).toEqual({ startValue: -100, endValue: 0 });
  });

  it('leaves a non-positional property alone whatever the component', () => {
    const fade = anim({ property: 'opa', startValue: 0, endValue: 255 });

    expect(resolvedAnimationValues(fade, placed)).toEqual({ startValue: 0, endValue: 255 });
  });

  it('falls back to zero when the target is gone', () => {
    expect(animationBase(anim(), undefined)).toBe(0);
    expect(resolvedAnimationValues(anim(), undefined)).toEqual({ startValue: -100, endValue: 0 });
  });
});
