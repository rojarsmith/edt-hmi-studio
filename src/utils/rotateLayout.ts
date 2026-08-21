// Turning a design a quarter turn, for when a project's orientation changes
// after it already has widgets on it.
//
// This rotates *boxes*, and only boxes. What it deliberately does not do is
// rotate what is inside them: a 200x40 label comes out 40x200 with its text
// still running left to right, an arc keeps its start and end angles, a chart
// keeps its axes, and an image keeps its own `rotation` prop. That is not an
// oversight to fix here — "what should this widget look like turned" is a
// different answer for each of the sixteen types and is a design question, not
// a geometric one. See docs/display-orientation.md §6.
//
// The caller is expected to say so before running it. Silently moving a
// author's layout is the failure mode this file is most able to cause.

import type { LvglComponent, Screen } from '../types';

export type QuarterTurn = 'cw' | 'ccw';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One box, turned inside a frame of `frameWidth` x `frameHeight`.
 *
 * The frame is the *parent's* content box, not the canvas: a widget's x/y are
 * relative to whatever contains it, so a child inside a container turns within
 * the container, which is itself turning within its own parent. Passing the
 * canvas size for top-level widgets and each container's pre-rotation size for
 * its children is what makes the whole tree land correctly.
 *
 * Clockwise, a point at (x, y) in a W x H frame lands at (H - y, x) in the
 * H x W frame it becomes; the box's own extent follows, which is why the
 * height is what gets subtracted.
 */
export function rotateBox(
  box: Box,
  frameWidth: number,
  frameHeight: number,
  turn: QuarterTurn,
): Box {
  return turn === 'cw'
    ? {
      x: frameHeight - box.y - box.height,
      y: box.x,
      width: box.height,
      height: box.width,
    }
    : {
      x: box.y,
      y: frameWidth - box.x - box.width,
      width: box.height,
      height: box.width,
    };
}

function rotateComponent(
  component: LvglComponent,
  frameWidth: number,
  frameHeight: number,
  turn: QuarterTurn,
): LvglComponent {
  const turned = rotateBox(component, frameWidth, frameHeight, turn);
  return {
    ...component,
    ...turned,
    /*
     * Children turn inside the box as it was, not as it now is — the frame a
     * child was positioned in is its parent's pre-rotation size, and reading
     * that off `turned` would have width and height already swapped.
     */
    children: component.children.map((child) => (
      rotateComponent(child, component.width, component.height, turn)
    )),
    /*
     * An aligned widget is positioned by LVGL from an anchor rather than by
     * x/y, so turning its box while leaving the anchor alone would move it
     * twice. Dropping to explicit coordinates keeps it where the author put
     * it, which is the promise this whole function is making.
     */
    align: undefined,
    alignOffsetX: undefined,
    alignOffsetY: undefined,
  };
}

/**
 * Every screen's widgets, turned a quarter turn within a canvas that is about
 * to go from `canvasWidth` x `canvasHeight` to its transpose.
 *
 * The dimensions passed in are the ones the layout was authored against — the
 * canvas *before* the change, not after.
 */
export function rotateScreens(
  screens: Screen[],
  canvasWidth: number,
  canvasHeight: number,
  turn: QuarterTurn,
): Screen[] {
  return screens.map((screen) => ({
    ...screen,
    components: screen.components.map((component) => (
      rotateComponent(component, canvasWidth, canvasHeight, turn)
    )),
  }));
}
