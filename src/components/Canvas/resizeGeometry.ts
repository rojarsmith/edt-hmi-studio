import type { ResizeHandle } from '../../types';

/**
 * Where a box ends up when one of its eight resize handles is dragged.
 *
 * A handle moves the edges it touches and nothing else: dragging the top-right
 * corner may not shift the left or the bottom edge. Keeping that promise is
 * why a box is described here by its four edges rather than by a position and
 * a size — the dragged edges are snapped, the anchored ones are copied from
 * the geometry the drag started with and never rounded again.
 *
 * Rounding position and size separately is exactly what broke it before: with
 * a 10px grid, dragging the top edge up by 5px rounded `y` back to 0 (JS
 * rounds -0.5 towards zero) while rounding the height 85 up to 90, so the
 * bottom edge — which the author was not touching — dropped by a whole grid
 * step.
 *
 * Snapping applies to the edge under the cursor, which is why a size can come
 * out off-grid when the anchored edge was off-grid: the edge the author is
 * watching is the one that lands on the grid line.
 *
 * Every frame is measured from the geometry the drag started with, never from
 * the previous frame, so a movement too small to reach the next grid line is
 * remembered instead of discarded — nudging 4px at a time used to move nothing
 * at all, however long the drag went on.
 */

export interface ResizeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeGrid {
  snapToGrid: boolean;
  gridSize: number;
}

export interface ResizeOptions {
  /**
   * Keep the box square, for a widget that is only ever round. The dragged
   * handle decides which side leads — a side handle its own axis, a corner the
   * larger of the two — and the edges it does not touch still hold, so the
   * result is the same for a given pointer position however it was reached.
   * A rule that instead asked "which side changed?" would answer differently
   * on the frame after it had squared the box, and the widget would flicker
   * between two sizes for as long as the drag lasted.
   */
  square?: boolean;
}

/** Smallest side a drag may leave a widget with, so it stays grabbable. */
export const MIN_RESIZE_SIZE = 10;

/**
 * @param start geometry when the handle was grabbed
 * @param deltaX total pointer travel since then, in canvas units (not per frame)
 */
export function resizeBox(
  start: ResizeBox,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  grid: ResizeGrid,
  options: ResizeOptions = {},
): ResizeBox {
  const snap = (value: number) =>
    grid.snapToGrid && grid.gridSize > 0
      ? Math.round(value / grid.gridSize) * grid.gridSize
      : value;

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes('left')) left = snap(start.x + deltaX);
  if (handle.includes('right')) right = snap(right + deltaX);
  if (handle.includes('top')) top = snap(start.y + deltaY);
  if (handle.includes('bottom')) bottom = snap(bottom + deltaY);

  // A widget squeezed past its minimum stops there rather than turning inside
  // out, and it is the dragged edge that stops — the anchored one still holds.
  const min = grid.snapToGrid ? Math.max(MIN_RESIZE_SIZE, grid.gridSize) : MIN_RESIZE_SIZE;
  if (right - left < min) {
    if (handle.includes('left')) left = right - min;
    else right = left + min;
  }
  if (bottom - top < min) {
    if (handle.includes('top')) top = bottom - min;
    else bottom = top + min;
  }

  if (options.square) {
    const width = right - left;
    const height = bottom - top;
    const size =
      handle === 'top' || handle === 'bottom'
        ? height
        : handle === 'left' || handle === 'right'
          ? width
          : Math.max(width, height);
    // The edges the handle is not holding are the ones that move
    if (handle.includes('left')) left = right - size;
    right = left + size;
    if (handle.includes('top')) top = bottom - size;
    bottom = top + size;
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}
