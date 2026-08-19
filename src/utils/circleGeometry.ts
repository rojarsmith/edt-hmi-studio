/**
 * The geometry of the Circle widget: a disc, a ring, or a sector of either.
 *
 * Everything here is circular, because that is the whole of what LVGL's
 * software renderer can draw. A rounded rectangle's radius is clamped to half
 * its shorter side (`lv_draw_sw_fill.c`), so a wide box with a circular radius
 * comes out a pill rather than an circle, and `lv_draw_arc_dsc_t` carries a
 * single `radius`, so an arc is always a circular one. A true circle needs the
 * vector pipeline (`LV_USE_VECTOR_GRAPHIC`), which needs ThorVG or a vector GPU
 * — none of which these boards have. So the widget keeps a square box and draws
 * within it, rather than showing something on the canvas the panel cannot
 * reproduce.
 *
 * Angles follow LVGL's convention throughout: 0° is 3 o'clock and they grow
 * clockwise, which is also what SVG and Canvas 2D do with y pointing down.
 */

export type CircleShape = 'circle' | 'sector';

export const DEFAULT_START_ANGLE = 0;
export const DEFAULT_END_ANGLE = 270;

/** Smallest disc that is still worth drawing and grabbing. */
export const MIN_CIRCLE_SIZE = 8;

export interface CircleSweep {
  /** Where the sector starts, 0–359. */
  start: number;
  /** How far it travels, 1–360. */
  sweep: number;
}

const wrap = (angle: number) => ((Math.round(angle) % 360) + 360) % 360;

/** Start and sweep from a pair of angles, with a full turn kept as a full turn. */
export function normalizeSweep(start: unknown, end: unknown): CircleSweep {
  const from = Number.isFinite(start as number) ? (start as number) : DEFAULT_START_ANGLE;
  const to = Number.isFinite(end as number) ? (end as number) : DEFAULT_END_ANGLE;
  if (Math.abs(to - from) >= 360) return { start: wrap(from), sweep: 360 };
  const sweep = wrap(to - from);
  return { start: wrap(from), sweep: sweep === 0 ? 360 : sweep };
}

/**
 * The inner radius a thickness leaves: 0 — a solid wedge — unless the widget
 * asks for a ring thinner than the radius.
 */
export function innerRadius(size: number, thickness: number): number {
  const outer = size / 2;
  if (!Number.isFinite(thickness) || thickness <= 0 || thickness >= outer) return 0;
  return outer - thickness;
}

const pointOn = (cx: number, cy: number, r: number, angle: number): [number, number] => {
  const rad = (angle * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * An SVG path for the shape inside a square box of `size`, which both the
 * canvas and the 2D preview draw so the two cannot disagree. A full disc and a
 * full ring are closed circles; anything less is a wedge, hollow when the
 * thickness leaves an inner radius.
 */
export function sectorPath(
  size: number,
  thickness: number,
  startAngle: number,
  endAngle: number,
): string {
  const outer = size / 2;
  const inner = innerRadius(size, thickness);
  const cx = outer;
  const cy = outer;
  const { start, sweep } = normalizeSweep(startAngle, endAngle);

  const circle = (r: number, sweepFlag: 0 | 1) =>
    `M ${round(cx - r)} ${round(cy)} ` +
    `A ${round(r)} ${round(r)} 0 1 ${sweepFlag} ${round(cx + r)} ${round(cy)} ` +
    `A ${round(r)} ${round(r)} 0 1 ${sweepFlag} ${round(cx - r)} ${round(cy)} Z`;

  if (sweep >= 360) {
    // The inner circle is wound the other way so the even-odd fill leaves a hole
    return inner > 0 ? `${circle(outer, 1)} ${circle(inner, 0)}` : circle(outer, 1);
  }

  const end = start + sweep;
  const large = sweep > 180 ? 1 : 0;
  const [ox1, oy1] = pointOn(cx, cy, outer, start);
  const [ox2, oy2] = pointOn(cx, cy, outer, end);

  if (inner <= 0) {
    return (
      `M ${round(cx)} ${round(cy)} L ${round(ox1)} ${round(oy1)} ` +
      `A ${round(outer)} ${round(outer)} 0 ${large} 1 ${round(ox2)} ${round(oy2)} Z`
    );
  }

  const [ix1, iy1] = pointOn(cx, cy, inner, end);
  const [ix2, iy2] = pointOn(cx, cy, inner, start);
  return (
    `M ${round(ox1)} ${round(oy1)} ` +
    `A ${round(outer)} ${round(outer)} 0 ${large} 1 ${round(ox2)} ${round(oy2)} ` +
    `L ${round(ix1)} ${round(iy1)} ` +
    `A ${round(inner)} ${round(inner)} 0 ${large} 0 ${round(ix2)} ${round(iy2)} Z`
  );
}

/**
 * The widget's box after an edit. An circle is circular, so its box is square:
 * whichever side the edit moved is the one the other follows, and a drag that
 * changes both takes the larger.
 */
export function squareBox(
  before: { width: number; height: number },
  after: { width: number; height: number },
): { width: number; height: number } {
  // Already square: nothing to decide. This is what a resize drag sends, and
  // leaving it alone is what keeps the drag from oscillating — see
  // ResizeOptions.square in components/Canvas/resizeGeometry.ts.
  if (after.width === after.height) {
    const size = Math.max(MIN_CIRCLE_SIZE, Math.round(after.width));
    return { width: size, height: size };
  }
  const widthMoved = after.width !== before.width;
  const heightMoved = after.height !== before.height;
  let size: number;
  if (widthMoved && heightMoved) size = Math.max(after.width, after.height);
  else if (heightMoved) size = after.height;
  else size = after.width;
  const square = Math.max(MIN_CIRCLE_SIZE, Math.round(size));
  return { width: square, height: square };
}
