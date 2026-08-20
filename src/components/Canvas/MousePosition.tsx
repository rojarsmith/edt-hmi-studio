// Live pointer position in canvas coordinates, after TouchGFX Designer's.
//
// The origin is the canvas's top-left corner, so a pointer above or left of it
// reads negative. That is not an edge case to guard against: the canvas is
// deliberately unclipped (see Canvas.css), a component parked off-screen is a
// normal thing to be dragging, and a reading that stopped at zero would be
// useless exactly there.
//
// It keeps its own state and listens on the viewport itself, so moving the
// mouse re-renders these two numbers rather than the canvas and everything on
// it. Updates are coalesced to one a frame.

import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';

interface MousePositionProps {
  /** The editing viewport: the area a reading is taken anywhere within. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The canvas itself, whose top-left corner is the origin. */
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

const MousePosition: React.FC<MousePositionProps> = ({ containerRef, canvasRef }) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    let pending: { clientX: number; clientY: number } | null = null;

    const flush = () => {
      frame = 0;
      const point = pending;
      pending = null;
      const canvas = canvasRef.current;
      if (!point || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      // The rect is already scaled, so dividing by the zoom returns the
      // coordinates the author designs in rather than the ones on screen.
      const { zoom } = useEditorStore.getState().canvas;
      setPosition({
        x: Math.round((point.clientX - rect.left) / zoom),
        y: Math.round((point.clientY - rect.top) / zoom),
      });
    };

    const handleMove = (event: MouseEvent) => {
      pending = { clientX: event.clientX, clientY: event.clientY };
      // A mouse reports far faster than the screen redraws; one reading a frame
      // is all anyone can see.
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const handleLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      // Blank rather than frozen: a stale pair of numbers looks live.
      setPosition(null);
    };

    container.addEventListener('mousemove', handleMove);
    container.addEventListener('mouseleave', handleLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      container.removeEventListener('mousemove', handleMove);
      container.removeEventListener('mouseleave', handleLeave);
    };
  }, [containerRef, canvasRef]);

  const label = position
    ? `Pointer at ${position.x}, ${position.y}`
    : 'Pointer outside the canvas area';

  return (
    <div className="mouse-position" title={label}>
      <svg
        className="mouse-position-icon"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1" />
      </svg>
      <span className="mouse-position-value" role="status" aria-label={label}>
        {position ? `${position.x}, ${position.y}` : '–, –'}
      </span>
    </div>
  );
};

export default MousePosition;
