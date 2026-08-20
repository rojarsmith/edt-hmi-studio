import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MousePosition from '../MousePosition';
import { useEditorStore } from '../../../store/editorStore';

/**
 * The component measures the canvas with getBoundingClientRect, which jsdom
 * always reports as zeros, so the canvas is a stub whose corner we choose.
 */
function harness(canvasCorner: { left: number; top: number }) {
  const container = document.createElement('div');
  const canvas = document.createElement('div');
  canvas.getBoundingClientRect = () => ({
    left: canvasCorner.left,
    top: canvasCorner.top,
    right: canvasCorner.left,
    bottom: canvasCorner.top,
    width: 0,
    height: 0,
    x: canvasCorner.left,
    y: canvasCorner.top,
    toJSON: () => ({}),
  }) as DOMRect;
  document.body.appendChild(container);

  const view = render(
    <MousePosition
      containerRef={{ current: container }}
      canvasRef={{ current: canvas }}
    />,
  );
  return { container, view };
}

const reading = () => screen.getByRole('status').textContent;

/** Runs whatever the component has scheduled for the next frame. */
let flushFrames: () => void = () => {};

function move(container: HTMLElement, clientX: number, clientY: number) {
  fireEvent.mouseMove(container, { clientX, clientY });
  flushFrames();
}

beforeEach(() => {
  useEditorStore.setState({
    canvas: { ...useEditorStore.getState().canvas, zoom: 1 },
  });
  // The component coalesces on rAF, so the stub has to keep rAF's ordering:
  // the id is returned *before* the callback runs. A stub that calls back first
  // and returns the id afterwards leaves the component's own re-arm flag set,
  // and every move after the first is silently dropped - which is exactly what
  // happened when this was first tried by hand in the browser.
  let nextFrame = 0;
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb);
    return ++nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  flushFrames = () => {
    const pending = queue.splice(0, queue.length);
    for (const cb of pending) cb(0);
  };
});

describe('MousePosition', () => {
  it('reads zero at the canvas corner', async () => {
    const { container } = harness({ left: 100, top: 50 });

    move(container, 100, 50);

    await waitFor(() => expect(reading()).toBe('0, 0'));
  });

  it('counts from the corner, not from the viewport', async () => {
    const { container } = harness({ left: 100, top: 50 });

    move(container, 571, 550);

    await waitFor(() => expect(reading()).toBe('471, 500'));
  });

  it('goes negative above and left of the canvas', async () => {
    // The canvas is deliberately unclipped, so a component parked off-screen is
    // a normal thing to be dragging. A reading that stopped at zero would be
    // useless exactly where it is needed.
    const { container } = harness({ left: 100, top: 50 });

    move(container, 60, 20);

    await waitFor(() => expect(reading()).toBe('-40, -30'));
  });

  it('reports the coordinates the author designs in, not the ones on screen', async () => {
    useEditorStore.setState({
      canvas: { ...useEditorStore.getState().canvas, zoom: 2 },
    });
    const { container } = harness({ left: 100, top: 50 });

    // 200 screen pixels from the corner at 2x is 100 canvas pixels.
    move(container, 300, 250);

    await waitFor(() => expect(reading()).toBe('100, 100'));
  });

  it('keeps following after the first reading', async () => {
    // The frame it coalesces on has to be re-armed each time. Getting that
    // wrong leaves the first reading stuck on screen while the pointer moves,
    // and a single-move test cannot tell the difference.
    const { container } = harness({ left: 0, top: 0 });

    move(container, 10, 10);
    await waitFor(() => expect(reading()).toBe('10, 10'));

    move(container, 20, 30);
    await waitFor(() => expect(reading()).toBe('20, 30'));

    move(container, 40, 50);
    await waitFor(() => expect(reading()).toBe('40, 50'));
  });

  it('reports once a frame however often the mouse moves', async () => {
    const { container } = harness({ left: 0, top: 0 });

    // Three moves inside one frame: only the last is worth showing.
    fireEvent.mouseMove(container, { clientX: 1, clientY: 1 });
    fireEvent.mouseMove(container, { clientX: 2, clientY: 2 });
    fireEvent.mouseMove(container, { clientX: 3, clientY: 3 });
    flushFrames();

    await waitFor(() => expect(reading()).toBe('3, 3'));
  });

  it('blanks rather than freezing when the pointer leaves', async () => {
    const { container } = harness({ left: 0, top: 0 });

    move(container, 10, 20);
    await waitFor(() => expect(reading()).toBe('10, 20'));

    fireEvent.mouseLeave(container);
    flushFrames();

    // A stale pair of numbers looks live, which is worse than none.
    await waitFor(() => expect(reading()).toBe('–, –'));
  });
});
