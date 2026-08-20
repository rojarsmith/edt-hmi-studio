// A polygon is a closed run of points whose box is exactly what it draws, and
// whose fill exists only when a triangle fan can cover it.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POLYGON_POINTS,
  applyPolygonGeometry,
  isConvexPolygon,
  normalizePolygonPoints,
  pointsInPolygonBox,
  polygonBox,
  polygonFanTriangles,
  scalePolygonPoints,
} from '../polygonGeometry';

const diamond = [[50, 0], [100, 50], [50, 100], [0, 50]];
// A chevron: the middle point is pushed in, so a fan from point 0 would paint
// over the dent.
const chevron = [[0, 0], [50, 40], [100, 0], [50, 100]];

describe('polygon points', () => {
  it('keeps what was written rather than rounding it', () => {
    // LVGL's point is a float when LV_USE_FLOAT is on, and a design is worth
    // keeping at the precision it was drawn at either way.
    expect(normalizePolygonPoints([[10.5, 20.25], [30, 40], [0, 40]]))
      .toEqual([[10.5, 20.25], [30, 40], [0, 40]]);
  });

  it('falls back when there is nothing to enclose', () => {
    expect(normalizePolygonPoints([[0, 0], [10, 10]])).toEqual(DEFAULT_POLYGON_POINTS);
    expect(normalizePolygonPoints('nonsense')).toEqual(DEFAULT_POLYGON_POINTS);
  });

  it('drops a pair it cannot read and keeps the rest', () => {
    // Three survive, which still encloses something.
    expect(normalizePolygonPoints([[0, 0], ['a', 1], [5, 5], [1, 9]]))
      .toEqual([[0, 0], [5, 5], [1, 9]]);
  });

  it('measures a box that is exactly the shape', () => {
    expect(polygonBox(diamond)).toEqual({ width: 100, height: 100 });
  });

  it('gives a flat run a box to exist in', () => {
    // Every point on one row: no height, but a widget still needs one.
    expect(polygonBox([[0, 0], [50, 0], [100, 0]])).toEqual({ width: 100, height: 2 });
  });

  it('moves the shape into the corner of its box', () => {
    expect(pointsInPolygonBox([[60, 10], [110, 60], [60, 110], [10, 60]]))
      .toEqual(diamond);
  });

  it('scales with the box', () => {
    expect(scalePolygonPoints(diamond, { width: 100, height: 100 }, { width: 200, height: 50 }))
      .toEqual([[100, 0], [200, 25], [100, 50], [0, 25]]);
  });
});

describe('whether a polygon can be filled', () => {
  it('says yes to a convex outline', () => {
    expect(isConvexPolygon(diamond)).toBe(true);
    expect(isConvexPolygon([[0, 0], [100, 0], [100, 100], [0, 100]])).toBe(true);
    expect(isConvexPolygon([[0, 0], [100, 0], [50, 80]])).toBe(true);
  });

  it('says no to a dent', () => {
    expect(isConvexPolygon(chevron)).toBe(false);
  });

  it('ignores corners that do not turn', () => {
    // A point part way along an edge is not a corner.
    expect(isConvexPolygon([[0, 0], [50, 0], [100, 0], [100, 100], [0, 100]])).toBe(true);
  });

  it('says no to a run that encloses nothing', () => {
    expect(isConvexPolygon([[0, 0], [50, 0], [100, 0]])).toBe(false);
    expect(isConvexPolygon([[0, 0], [10, 10]])).toBe(false);
  });

  it('does not care which way round the points were written', () => {
    expect(isConvexPolygon([...diamond].reverse())).toBe(true);
  });
});

describe('the fill itself', () => {
  it('is n-2 triangles sharing the first point', () => {
    expect(polygonFanTriangles(diamond)).toEqual([
      [[50, 0], [100, 50], [50, 100]],
      [[50, 0], [50, 100], [0, 50]],
    ]);
  });

  it('is one triangle for a triangle', () => {
    expect(polygonFanTriangles([[0, 0], [100, 0], [50, 80]])).toHaveLength(1);
  });
});

describe('what an edit leaves behind', () => {
  it('resizes the box when the points move', () => {
    const next = applyPolygonGeometry(
      { width: 100, height: 100, points: diamond },
      { width: 100, height: 100, points: [[25, 0], [50, 25], [25, 50], [0, 25]] },
    );
    expect(next).toEqual({
      width: 50,
      height: 50,
      points: [[25, 0], [50, 25], [25, 50], [0, 25]],
    });
  });

  it('scales the points when the box is dragged', () => {
    const next = applyPolygonGeometry(
      { width: 100, height: 100, points: diamond },
      { width: 200, height: 100, points: diamond },
    );
    expect(next).toEqual({
      width: 200,
      height: 100,
      points: [[100, 0], [200, 50], [100, 100], [0, 50]],
    });
  });

  it('leaves no margin around the shape', () => {
    // Points that start away from the origin are brought back to it, so the
    // box has nothing in it but the polygon.
    const next = applyPolygonGeometry(
      { width: 200, height: 200, points: diamond },
      { width: 200, height: 200, points: [[80, 30], [130, 80], [80, 130], [30, 80]] },
    );
    expect(next).toEqual({ width: 100, height: 100, points: diamond });
  });
});
