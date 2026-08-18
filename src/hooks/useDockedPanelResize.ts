import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { registerDockedPanel, startDockedPanelDrag } from '../utils/panelResize';

interface DockedPanelResizeOptions {
  /** Smallest height the panel may be dragged - or squeezed - to. */
  minHeight: number;
  /** Height it starts at, and returns to on a fresh mount. */
  defaultHeight: number;
  /** False while the panel is collapsed to its header bar. */
  expanded: boolean;
}

export interface DockedPanelResize<T extends HTMLElement> {
  /** Height to apply while expanded. */
  height: number;
  /** True for the length of a drag, for the handle's own styling. */
  resizing: boolean;
  /** Goes on the panel's root element. */
  panelRef: React.RefObject<T | null>;
  /** Goes on the panel's top-edge handle. */
  onResizeStart: (event: React.PointerEvent<HTMLElement>) => void;
}

/**
 * The top-edge drag shared by the panels docked down a side column. The grip
 * trades height between the sections either side of it and cascades outward
 * rather than sticking (see utils/panelResize), which is why every panel
 * registers itself as movable by the others.
 */
export function useDockedPanelResize<T extends HTMLElement>({
  minHeight,
  defaultHeight,
  expanded,
}: DockedPanelResizeOptions): DockedPanelResize<T> {
  const [height, setHeight] = useState(defaultHeight);
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<T | null>(null);

  // The lender handle outlives any one render, so it reads through refs.
  const heightRef = useRef(height);
  const expandedRef = useRef(expanded);

  useEffect(() => {
    heightRef.current = height;
    expandedRef.current = expanded;
  }, [expanded, height]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    return registerDockedPanel(panel, {
      canDonate: () => expandedRef.current,
      height: () => heightRef.current,
      minHeight: () => minHeight,
      resize: setHeight,
    });
  }, [minHeight]);

  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const panel = panelRef.current;
      if (!panel) return;
      event.preventDefault();

      const startY = event.clientY;
      const startHeight = heightRef.current;
      const drag = startDockedPanelDrag(panel, minHeight, startHeight);
      setResizing(true);

      const onMove = (moved: PointerEvent) => {
        setHeight(drag.moveEdge(startY - moved.clientY));
      };
      const onUp = () => {
        setResizing(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [minHeight],
  );

  return { height, resizing, panelRef, onResizeStart };
}
