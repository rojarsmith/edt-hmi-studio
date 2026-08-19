import { describe, it, expect } from 'vitest';
import {
  applyLineGeometry,
  lineBox,
  lineLength,
  lineOrientation,
  normalizeLinePoints,
  orientedLinePoints,
  pointsInBox,
  scaleLinePoints,
} from '../lineGeometry';

const horizontal = [
  [0, 0],
  [100, 0],
];

describe('lineBox', () => {
  it('is the stroke thick on the axis the line does not travel along', () => {
    expect(lineBox(horizontal, 2)).toEqual({ width: 100, height: 2 });
    expect(lineBox(horizontal, 8)).toEqual({ width: 100, height: 8 });
  });

  it('turns with the line', () => {
    const vertical = [
      [0, 0],
      [0, 60],
    ];
    expect(lineBox(vertical, 4)).toEqual({ width: 4, height: 60 });
  });

  it('hugs a diagonal on both axes', () => {
    const diagonal = [
      [0, 0],
      [80, 40],
    ];
    expect(lineBox(diagonal, 2)).toEqual({ width: 80, height: 40 });
  });
});

describe('pointsInBox', () => {
  it('centres the stroke in the box rather than hanging it off the edge', () => {
    const box = lineBox(horizontal, 8);
    expect(pointsInBox(horizontal, box)).toEqual([
      [0, 4],
      [100, 4],
    ]);
  });

  it('leaves a line that already fills its box where it is', () => {
    const diagonal = [
      [0, 0],
      [80, 40],
    ];
    expect(pointsInBox(diagonal, lineBox(diagonal, 2))).toEqual([
      [0, 0],
      [80, 40],
    ]);
  });
});

describe('scaleLinePoints', () => {
  it('stretches the points with the box', () => {
    expect(
      scaleLinePoints(horizontal, { width: 100, height: 2 }, { width: 150, height: 2 }),
    ).toEqual([
      [0, 0],
      [150, 0],
    ]);
  });

  it('leaves an axis the line does not travel along alone', () => {
    expect(
      scaleLinePoints(horizontal, { width: 100, height: 2 }, { width: 100, height: 40 }),
    ).toEqual(horizontal);
  });
});

describe('lineOrientation', () => {
  it('names the axis, or says custom', () => {
    expect(lineOrientation(horizontal)).toBe('horizontal');
    expect(
      lineOrientation([
        [0, 0],
        [0, 40],
      ]),
    ).toBe('vertical');
    expect(
      lineOrientation([
        [0, 0],
        [40, 40],
      ]),
    ).toBe('custom');
  });

  it('measures length along whichever axis that is', () => {
    expect(lineLength(horizontal)).toBe(100);
    expect(lineLength(orientedLinePoints('vertical', 60))).toBe(60);
  });
});

describe('applyLineGeometry', () => {
  const line = { width: 100, height: 2, points: horizontal, lineWidth: 2 };

  it('thickens the box when the stroke grows, and no more', () => {
    const result = applyLineGeometry(line, { ...line, lineWidth: 8 });
    expect(result).toEqual({ width: 100, height: 8, points: horizontal });
  });

  it('scales the points when the box is dragged wider', () => {
    const result = applyLineGeometry(line, { ...line, width: 200 });
    expect(result.points).toEqual([
      [0, 0],
      [200, 0],
    ]);
    expect(result.width).toBe(200);
  });

  it('refuses the empty area a vertical drag used to create', () => {
    const result = applyLineGeometry(line, { ...line, height: 40 });
    expect(result).toEqual({ width: 100, height: 2, points: horizontal });
  });

  it('resizes the box when the points are edited instead', () => {
    const points = orientedLinePoints('vertical', 60);
    const result = applyLineGeometry(line, { ...line, points });
    expect(result).toEqual({ width: 2, height: 60, points });
  });

  it('survives points that are not points at all', () => {
    const result = applyLineGeometry(
      { ...line, points: undefined },
      { ...line, points: [[0, 0]] },
    );
    expect(result.points).toEqual(horizontal);
  });
});

describe('normalizeLinePoints', () => {
  it('keeps whole pixels and drops anything unusable', () => {
    expect(
      normalizeLinePoints([
        [0.4, 0],
        [99.6, 0],
        ['x', 1],
      ]),
    ).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });
});
