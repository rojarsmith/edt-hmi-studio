import { describe, expect, it } from 'vitest';
import { centringPan } from '../canvasView';

describe('centring the canvas', () => {
  it('puts a canvas smaller than the viewport in the middle of it', () => {
    const pan = centringPan({
      container: { left: 0, top: 0, width: 1000, height: 800 },
      canvasCorner: { left: 100, top: 100 },
      currentPan: { x: 0, y: 0 },
      design: { width: 800, height: 480 },
    });

    // Centred means (1000-800)/2 = 100 across and (800-480)/2 = 160 down; the
    // canvas is already at 100 across, so only the vertical needs moving.
    expect(pan).toEqual({ x: 0, y: 60 });
  });

  it('undoes whatever panning was done first', () => {
    const resting = { left: 100, top: 100 };
    const panned = centringPan({
      container: { left: 0, top: 0, width: 1000, height: 800 },
      // Dragged 250 right and 90 up from resting.
      canvasCorner: { left: resting.left + 250, top: resting.top - 90 },
      currentPan: { x: 250, y: -90 },
      design: { width: 800, height: 480 },
    });
    const unpanned = centringPan({
      container: { left: 0, top: 0, width: 1000, height: 800 },
      canvasCorner: resting,
      currentPan: { x: 0, y: 0 },
      design: { width: 800, height: 480 },
    });

    // Where it was dragged to cannot change where centred is.
    expect(panned).toEqual(unpanned);
  });

  it('overlaps a canvas wider than the viewport evenly on both sides', () => {
    const pan = centringPan({
      container: { left: 240, top: 117, width: 760, height: 311 },
      canvasCorner: { left: 380, top: 113 },
      currentPan: { x: 0, y: 0 },
      design: { width: 800, height: 480 },
    });

    // Measured from the running app: the resting position sits 160px right and
    // 80px below centre, so the reset pans back by exactly that.
    expect(pan).toEqual({ x: -160, y: -80.5 });
  });

  it('is measured from the viewport, so it follows a resized window', () => {
    const narrow = centringPan({
      container: { left: 0, top: 0, width: 900, height: 600 },
      canvasCorner: { left: 50, top: 60 },
      currentPan: { x: 0, y: 0 },
      design: { width: 800, height: 480 },
    });
    const wide = centringPan({
      container: { left: 0, top: 0, width: 1400, height: 600 },
      canvasCorner: { left: 50, top: 60 },
      currentPan: { x: 0, y: 0 },
      design: { width: 800, height: 480 },
    });

    expect(wide.x - narrow.x).toBe(250);
    expect(wide.y).toBe(narrow.y);
  });
});
