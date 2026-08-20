// Where the canvas has to be panned to sit centred in its viewport.
//
// Kept out of the component so the arithmetic can be checked without a layout
// engine, the way resizeGeometry.ts is.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CentringInput {
  /** The editing viewport the canvas has to end up in the middle of. */
  container: Rect;
  /** Where the canvas's top-left corner sits now, the current pan included. */
  canvasCorner: { left: number; top: number };
  currentPan: Point;
  /** The design size, which is what the canvas occupies at 100%. */
  design: { width: number; height: number };
}

/**
 * The centre is measured rather than assumed: the viewport's resting offset is
 * set in CSS, and recomputing it here from those constants would be the same
 * number written in two places.
 *
 * Because the canvas scales from its top-left corner, that corner does not move
 * with the zoom — so removing the current pan from where it sits leaves where
 * it would sit with no pan at all, and the distance from there to the centred
 * position is the pan to apply. A canvas larger than its viewport therefore
 * overlaps it evenly on both sides, which is what centring means for one.
 */
export function centringPan(input: CentringInput): Point {
  const restingLeft = input.canvasCorner.left - input.currentPan.x;
  const restingTop = input.canvasCorner.top - input.currentPan.y;

  const centredLeft = input.container.left + (input.container.width - input.design.width) / 2;
  const centredTop = input.container.top + (input.container.height - input.design.height) / 2;

  return {
    x: centredLeft - restingLeft,
    y: centredTop - restingTop,
  };
}
