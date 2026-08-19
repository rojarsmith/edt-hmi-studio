import { describe, it, expect } from 'vitest';
import { resizeBox, MIN_RESIZE_SIZE } from '../resizeGeometry';

const grid = { snapToGrid: true, gridSize: 10 };
const free = { snapToGrid: false, gridSize: 10 };

// The box the screenshots were taken from: on the grid, 120×80.
const box = { x: 50, y: 0, width: 120, height: 80 };

const edges = (b: { x: number; y: number; width: number; height: number }) => ({
  left: b.x,
  top: b.y,
  right: b.x + b.width,
  bottom: b.y + b.height,
});

describe('resizeBox', () => {
  describe('the edges a handle does not touch never move', () => {
    it('holds left and bottom while the top-right corner is dragged', () => {
      // 5px up is the case that used to drop the bottom edge by a whole grid
      // step: y rounded back to 0 while the height rounded up to 90.
      for (const [dx, dy] of [[5, -5], [-5, 5], [3, -3], [17, -12], [0, -5], [5, 0]]) {
        const result = edges(resizeBox(box, 'top-right', dx, dy, grid));
        expect(result.left, `dx=${dx} dy=${dy}`).toBe(50);
        expect(result.bottom, `dx=${dx} dy=${dy}`).toBe(80);
      }
    });

    it('holds right and top while the bottom-left corner is dragged', () => {
      for (const [dx, dy] of [[-5, 5], [5, -5], [-13, 8]]) {
        const result = edges(resizeBox(box, 'bottom-left', dx, dy, grid));
        expect(result.right, `dx=${dx} dy=${dy}`).toBe(170);
        expect(result.top, `dx=${dx} dy=${dy}`).toBe(0);
      }
    });

    it('leaves the whole horizontal extent alone for a vertical handle', () => {
      const result = edges(resizeBox(box, 'top', 40, -5, grid));
      expect(result.left).toBe(50);
      expect(result.right).toBe(170);
    });

    it('holds the anchored edges of a box that is not on the grid', () => {
      const offGrid = { x: 53, y: 7, width: 121, height: 83 };
      const result = edges(resizeBox(offGrid, 'top-right', 6, -6, grid));
      expect(result.left).toBe(53);
      expect(result.bottom).toBe(90);
      // The dragged edges are the ones that land on grid lines
      expect(result.right).toBe(180);
      expect(result.top).toBe(0);
    });
  });

  describe('snapping', () => {
    it('snaps the dragged edge to the nearest grid line', () => {
      expect(edges(resizeBox(box, 'right', 4, 0, grid)).right).toBe(170);
      expect(edges(resizeBox(box, 'right', 6, 0, grid)).right).toBe(180);
      expect(edges(resizeBox(box, 'top', -6, -6, grid)).top).toBe(-10);
    });

    it('follows the pointer exactly when snapping is off', () => {
      const result = edges(resizeBox(box, 'top-right', 7, -3, free));
      expect(result.top).toBe(-3);
      expect(result.right).toBe(177);
      expect(result.left).toBe(50);
      expect(result.bottom).toBe(80);
    });

    it('measures from the start of the drag, so small steps are not lost', () => {
      // Four separate 4px frames of one drag: the third crosses the grid line
      expect(resizeBox(box, 'right', 4, 0, grid).width).toBe(120);
      expect(resizeBox(box, 'right', 8, 0, grid).width).toBe(130);
      expect(resizeBox(box, 'right', 12, 0, grid).width).toBe(130);
      expect(resizeBox(box, 'right', 16, 0, grid).width).toBe(140);
    });
  });

  describe('minimum size', () => {
    it('stops the dragged edge and keeps the anchored one', () => {
      const result = edges(resizeBox(box, 'left', 300, 0, grid));
      expect(result.right).toBe(170);
      expect(result.left).toBe(170 - 10);
    });

    it('stops the top edge at the bottom edge', () => {
      const result = edges(resizeBox(box, 'top', 0, 300, grid));
      expect(result.bottom).toBe(80);
      expect(result.top).toBe(80 - 10);
    });

    it('never goes below the minimum without a grid', () => {
      const result = resizeBox(box, 'bottom-right', -1000, -1000, free);
      expect(result.width).toBe(MIN_RESIZE_SIZE);
      expect(result.height).toBe(MIN_RESIZE_SIZE);
    });
  });
});
