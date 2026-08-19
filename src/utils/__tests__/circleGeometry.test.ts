import { describe, it, expect } from 'vitest';
import {
  MIN_CIRCLE_SIZE,
  innerRadius,
  normalizeSweep,
  sectorPath,
  squareBox,
} from '../circleGeometry';

describe('normalizeSweep', () => {
  it('measures clockwise from the start, LVGL style', () => {
    expect(normalizeSweep(0, 270)).toEqual({ start: 0, sweep: 270 });
    expect(normalizeSweep(135, 45)).toEqual({ start: 135, sweep: 270 });
  });

  it('reads a whole turn as a whole turn, not as nothing', () => {
    expect(normalizeSweep(0, 360)).toEqual({ start: 0, sweep: 360 });
    expect(normalizeSweep(90, 90)).toEqual({ start: 90, sweep: 360 });
  });

  it('falls back when the angles are not angles', () => {
    expect(normalizeSweep(undefined, undefined)).toEqual({ start: 0, sweep: 270 });
  });
});

describe('innerRadius', () => {
  it('is zero for a wedge filled to the centre', () => {
    expect(innerRadius(100, 0)).toBe(0);
    // A thickness at or past the radius fills it too
    expect(innerRadius(100, 50)).toBe(0);
    expect(innerRadius(100, 80)).toBe(0);
  });

  it('leaves a ring for anything thinner', () => {
    expect(innerRadius(100, 12)).toBe(38);
  });
});

describe('sectorPath', () => {
  it('closes a full disc without a seam', () => {
    const path = sectorPath(100, 0, 0, 360);
    expect(path.startsWith('M 0 50')).toBe(true);
    expect(path.split('A').length - 1).toBe(2);
    expect(path.trim().endsWith('Z')).toBe(true);
  });

  it('gives a full ring two circles, wound opposite ways', () => {
    const path = sectorPath(100, 10, 0, 360);
    // Two subpaths, and the inner one reverses the sweep flag so even-odd
    // leaves the hole
    expect(path.split('M').length - 1).toBe(2);
    expect(path).toContain('A 40 40 0 1 0');
  });

  it('draws a wedge from the centre when nothing is hollowed out', () => {
    const path = sectorPath(100, 0, 0, 90);
    expect(path.startsWith('M 50 50')).toBe(true);
    expect(path).toContain('L 100 50');
    // 90° clockwise from 3 o'clock is 6 o'clock
    expect(path).toContain('50 100');
  });

  it('marks a sweep over half a turn as a large arc', () => {
    expect(sectorPath(100, 0, 0, 270)).toContain('0 1 1');
    expect(sectorPath(100, 0, 0, 90)).toContain('0 0 1');
  });

  it('draws an annular sector as two arcs joined at the ends', () => {
    const path = sectorPath(100, 20, 0, 90);
    expect(path.split('A').length - 1).toBe(2);
    expect(path).toContain('A 30 30');
  });
});

describe('squareBox', () => {
  const before = { width: 100, height: 100 };

  it('follows whichever side was dragged', () => {
    expect(squareBox(before, { width: 160, height: 100 })).toEqual({ width: 160, height: 160 });
    expect(squareBox(before, { width: 100, height: 40 })).toEqual({ width: 40, height: 40 });
  });

  it('takes the larger when a corner moves both', () => {
    expect(squareBox(before, { width: 160, height: 120 })).toEqual({ width: 160, height: 160 });
  });

  it('leaves a box that is already square alone', () => {
    // What a resize drag sends. Re-deciding here is what made the widget
    // flicker between two sizes for the length of a drag.
    expect(squareBox({ width: 145, height: 145 }, { width: 150, height: 150 })).toEqual({
      width: 150,
      height: 150,
    });
    const settled = squareBox({ width: 100, height: 100 }, { width: 145, height: 145 });
    expect(squareBox(settled, settled)).toEqual(settled);
  });

  it('keeps a disc big enough to see and to grab', () => {
    expect(squareBox(before, { width: 1, height: 1 })).toEqual({
      width: MIN_CIRCLE_SIZE,
      height: MIN_CIRCLE_SIZE,
    });
  });
});
