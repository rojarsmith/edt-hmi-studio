/**
 * A line's geometry: the relationship between the points LVGL draws and the
 * box the editor gives the widget.
 *
 * The rule is that a line has no area beyond the line itself. Its box is the
 * extent of its points, never thinner than the stroke — so a horizontal 2px
 * line is 2px tall, not 4px or 40px, and there is no empty region around it to
 * select, style or drag. Dragging the box scales the points; editing the points
 * resizes the box. `applyLineGeometry` is what keeps the two from drifting, and
 * every path that changes a line goes through it.
 *
 * Points are stored as `[[x, y], ...]` in `props.points`, which is the shape
 * LVGL's `lv_line_set_points` takes and what the WASM preview already reads.
 */

/** Points as they are stored on the widget. */
export type LinePoints = number[][];

export interface LineBox {
  width: number;
  height: number;
}

/** What a line is when nothing else is known: 100px, left to right. */
export const DEFAULT_LINE_POINTS: LinePoints = [
  [0, 0],
  [100, 0],
];

/** Stroke width a line falls back to, matching LVGL's own default styling. */
export const DEFAULT_LINE_WIDTH = 2;

/** A line shorter than this cannot be seen or grabbed. */
export const MIN_LINE_LENGTH = 2;

export type LineOrientation = 'horizontal' | 'vertical' | 'custom';

const isFinitePair = (point: unknown): point is number[] =>
  Array.isArray(point) &&
  point.length >= 2 &&
  typeof point[0] === 'number' &&
  typeof point[1] === 'number' &&
  Number.isFinite(point[0]) &&
  Number.isFinite(point[1]);

/** Stored points cleaned into usable pairs; anything unusable becomes the default. */
export function normalizeLinePoints(value: unknown): LinePoints {
  if (!Array.isArray(value)) return DEFAULT_LINE_POINTS.map((p) => [...p]);
  const points = value.filter(isFinitePair).map((p) => [Math.round(p[0]), Math.round(p[1])]);
  return points.length >= 2 ? points : DEFAULT_LINE_POINTS.map((p) => [...p]);
}

/** How far the points reach on each axis, before the stroke is accounted for. */
export function lineExtent(points: LinePoints): LineBox {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * The box the widget occupies: the points' extent, opened up to the stroke
 * width on an axis the line does not travel along, because that is exactly how
 * much of the panel the stroke covers.
 */
export function lineBox(points: LinePoints, lineWidth: number): LineBox {
  const extent = lineExtent(points);
  const stroke = Math.max(1, Math.round(lineWidth));
  return {
    width: Math.max(extent.width, stroke),
    height: Math.max(extent.height, stroke),
  };
}

/**
 * Where the points sit inside that box, in box-local pixels: the extent is
 * centred, so the stroke of a horizontal line is centred on the box's middle
 * row rather than hanging off its top edge. The canvas, the preview and the
 * generated code all place the line with this, so all three agree.
 */
export function pointsInBox(points: LinePoints, box: LineBox): LinePoints {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const extent = lineExtent(points);
  const offsetX = (box.width - extent.width) / 2;
  const offsetY = (box.height - extent.height) / 2;
  return points.map(([x, y]) => [x - minX + offsetX, y - minY + offsetY]);
}

/** Points scaled from one box into another, which is what dragging a handle does. */
export function scaleLinePoints(points: LinePoints, from: LineBox, to: LineBox): LinePoints {
  const extent = lineExtent(points);
  // An axis the line does not travel along has nothing to scale: its box size
  // is the stroke width, and stretching zero by any factor is still zero.
  const scaleX = extent.width > 0 && from.width > 0 ? to.width / from.width : 1;
  const scaleY = extent.height > 0 && from.height > 0 ? to.height / from.height : 1;
  return points.map(([x, y]) => [Math.round(x * scaleX), Math.round(y * scaleY)]);
}

/** Which way the line runs, or `custom` once it is neither axis. */
export function lineOrientation(points: LinePoints): LineOrientation {
  const extent = lineExtent(points);
  if (extent.height === 0) return 'horizontal';
  if (extent.width === 0) return 'vertical';
  return 'custom';
}

/** The length of an axis-aligned line — its extent along the axis it runs on. */
export function lineLength(points: LinePoints): number {
  const extent = lineExtent(points);
  return Math.max(extent.width, extent.height);
}

/** A straight line of the given length, running the given way. */
export function orientedLinePoints(
  orientation: 'horizontal' | 'vertical',
  length: number,
): LinePoints {
  const span = Math.max(MIN_LINE_LENGTH, Math.round(length));
  return orientation === 'vertical'
    ? [
        [0, 0],
        [0, span],
      ]
    : [
        [0, 0],
        [span, 0],
      ];
}

export interface LineGeometry {
  width: number;
  height: number;
  points: LinePoints;
}

/**
 * The geometry a line ends up with after an edit.
 *
 * Whichever side the edit came from, the other follows: new points resize the
 * box, a new box scales the points, and a wider stroke thickens the box on the
 * axis the line does not travel along. Nothing here can leave a line with a box
 * bigger than what it draws.
 */
export function applyLineGeometry(
  before: { width: number; height: number; points: unknown; lineWidth?: number },
  after: { width: number; height: number; points: unknown; lineWidth?: number },
): LineGeometry {
  const beforePoints = normalizeLinePoints(before.points);
  const afterPoints = normalizeLinePoints(after.points);
  const lineWidth = after.lineWidth ?? before.lineWidth ?? DEFAULT_LINE_WIDTH;

  const pointsEdited = JSON.stringify(beforePoints) !== JSON.stringify(afterPoints);
  const resized = after.width !== before.width || after.height !== before.height;

  const points =
    !pointsEdited && resized
      ? scaleLinePoints(
          beforePoints,
          { width: before.width, height: before.height },
          { width: after.width, height: after.height },
        )
      : afterPoints;

  return { ...lineBox(points, lineWidth), points };
}
