/**
 * A polygon's geometry: a closed run of points, and the box the editor gives
 * the widget.
 *
 * The rule is the same one a line follows — the box is exactly what the shape
 * draws — but a polygon has area, so the box is the points' extent with
 * nothing added: dragging the box scales the points, editing the points
 * resizes the box, and there is never an empty margin to select or drag.
 *
 * Points are stored as `[[x, y], ...]` in `props.points`, the same shape a
 * line stores, and the run is closed implicitly: the last point joins the
 * first. The first point is not repeated in storage — the generated C repeats
 * it, because `lv_line_set_points` draws an open polyline.
 *
 * Unlike a line's, these are kept as written rather than rounded. LVGL's
 * `lv_point_precise_t` is a float when `LV_USE_FLOAT` is on, and a design is
 * worth keeping at the precision it was drawn at whether or not a particular
 * firmware build rounds it on the way out.
 */

/** Points as they are stored on the widget. */
export type PolygonPoints = number[][];

export interface PolygonBox {
  width: number;
  height: number;
}

/** What a polygon is when nothing else is known: a diamond in a 100px box. */
export const DEFAULT_POLYGON_POINTS: PolygonPoints = [
  [50, 0],
  [100, 50],
  [50, 100],
  [0, 50],
];

/** Three points is the fewest that enclose anything. */
export const MIN_POLYGON_POINTS = 3;

/** A polygon smaller than this cannot be seen or grabbed. */
export const MIN_POLYGON_SIZE = 2;

const isFinitePair = (point: unknown): point is number[] =>
  Array.isArray(point) &&
  point.length >= 2 &&
  typeof point[0] === 'number' &&
  typeof point[1] === 'number' &&
  Number.isFinite(point[0]) &&
  Number.isFinite(point[1]);

/** Stored points cleaned into usable pairs; anything unusable becomes the default. */
export function normalizePolygonPoints(value: unknown): PolygonPoints {
  if (!Array.isArray(value)) return DEFAULT_POLYGON_POINTS.map((p) => [...p]);
  const points = value.filter(isFinitePair).map((p) => [p[0], p[1]]);
  return points.length >= MIN_POLYGON_POINTS
    ? points
    : DEFAULT_POLYGON_POINTS.map((p) => [...p]);
}

/** How far the points reach on each axis. */
export function polygonExtent(points: PolygonPoints): PolygonBox {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * The box the widget occupies. A polygon flat on one axis — every point on one
 * row — still needs a box to exist in, so neither side goes below the minimum.
 */
export function polygonBox(points: PolygonPoints): PolygonBox {
  const extent = polygonExtent(points);
  return {
    width: Math.max(MIN_POLYGON_SIZE, Math.round(extent.width)),
    height: Math.max(MIN_POLYGON_SIZE, Math.round(extent.height)),
  };
}

/**
 * Where the points sit inside that box, in box-local coordinates: the shape is
 * moved so its top-left corner is the box's. The canvas, the preview and the
 * generated code all place the polygon with this, so all three agree.
 */
export function pointsInPolygonBox(points: PolygonPoints): PolygonPoints {
  const minX = Math.min(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1]));
  return points.map(([x, y]) => [x - minX, y - minY]);
}

/** Points scaled from one box into another, which is what dragging a handle does. */
export function scalePolygonPoints(
  points: PolygonPoints,
  from: PolygonBox,
  to: PolygonBox,
): PolygonPoints {
  const extent = polygonExtent(points);
  // An axis the shape has no extent along has nothing to scale: stretching
  // zero by any factor is still zero.
  const scaleX = extent.width > 0 && from.width > 0 ? to.width / from.width : 1;
  const scaleY = extent.height > 0 && from.height > 0 ? to.height / from.height : 1;
  return points.map(([x, y]) => [x * scaleX, y * scaleY]);
}

/**
 * Whether the shape is convex, which decides whether it can be filled.
 *
 * The fill is a triangle fan from the first point (see polygonFanTriangles),
 * and a fan only covers a convex outline — on a concave one it paints over the
 * dent. So a concave polygon is drawn as an outline everywhere: on the canvas,
 * in the preview and on the panel. Reported rather than approximated, because
 * a fill that appears in the editor and not on the device is the kind of lie
 * this tool is built to avoid.
 *
 * Measured by the sign of the cross product at each corner: a convex outline
 * turns the same way all the way round. Collinear corners contribute nothing
 * and are skipped.
 */
export function isConvexPolygon(points: PolygonPoints): boolean {
  if (points.length < MIN_POLYGON_POINTS) return false;
  let sign = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const [cx, cy] = points[(i + 2) % points.length];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (cross === 0) continue;
    const turn = cross > 0 ? 1 : -1;
    if (sign === 0) sign = turn;
    else if (turn !== sign) return false;
  }
  // Every corner collinear: a run of points on one straight line encloses
  // nothing, so there is no area to fill.
  return sign !== 0;
}

/**
 * The polygon as triangles, fanned from its first point.
 *
 * This is what the firmware draws: LVGL's software renderer has a filled
 * triangle and no filled polygon, so a convex outline is covered by n-2
 * triangles all sharing point 0.
 */
export function polygonFanTriangles(points: PolygonPoints): PolygonPoints[] {
  const triangles: PolygonPoints[] = [];
  for (let i = 1; i + 1 < points.length; i += 1) {
    triangles.push([points[0], points[i], points[i + 1]]);
  }
  return triangles;
}

export interface PolygonGeometry {
  width: number;
  height: number;
  points: PolygonPoints;
}

/**
 * The geometry a polygon ends up with after an edit.
 *
 * Whichever side the edit came from, the other follows: new points resize the
 * box, a new box scales the points. Nothing here can leave a polygon with a
 * box bigger than what it draws.
 */
export function applyPolygonGeometry(
  before: { width: number; height: number; points: unknown },
  after: { width: number; height: number; points: unknown },
): PolygonGeometry {
  const beforePoints = normalizePolygonPoints(before.points);
  const afterPoints = normalizePolygonPoints(after.points);

  const pointsEdited = JSON.stringify(beforePoints) !== JSON.stringify(afterPoints);
  const resized = after.width !== before.width || after.height !== before.height;

  const points =
    !pointsEdited && resized
      ? scalePolygonPoints(
          beforePoints,
          { width: before.width, height: before.height },
          { width: after.width, height: after.height },
        )
      : afterPoints;

  const placed = pointsInPolygonBox(points);
  return { ...polygonBox(placed), points: placed };
}
