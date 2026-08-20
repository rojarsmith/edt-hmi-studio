import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useEditorStore } from '../../store/editorStore';
import type { LvglComponent, ResizeHandle } from '../../types';
import { resizeBox } from './resizeGeometry';
import { centringPan } from './canvasView';
import { getComponentDefinition } from '../../utils/componentDefinitions';
import CanvasComponent from './CanvasComponent';
import AlignmentGuides from './AlignmentGuides';
import MousePosition from './MousePosition';
import ContextMenu, { type ContextMenuItem } from '../ContextMenu';
import {
  hasClipboard,
  copySelectedComponents,
  cutSelectedComponents,
  pasteClipboardComponents,
  duplicateSelectedComponents,
  selectAllComponents,
} from '../../hooks/useKeyboardShortcuts';
import './Canvas.css';

interface BoxSelection {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// Flatten components for box selection
function flattenComponents(comps: LvglComponent[], offsetX = 0, offsetY = 0): Array<{ comp: LvglComponent; absX: number; absY: number }> {
  const result: Array<{ comp: LvglComponent; absX: number; absY: number }> = [];
  for (const comp of comps) {
    const absX = comp.x + offsetX;
    const absY = comp.y + offsetY;
    result.push({ comp, absX, absY });
    result.push(...flattenComponents(comp.children, absX, absY));
  }
  return result;
}

// Find component in tree by id
function findComponentInTree(components: LvglComponent[], id: string): LvglComponent | undefined {
  for (const comp of components) {
    if (comp.id === id) return comp;
    const found = findComponentInTree(comp.children, id);
    if (found) return found;
  }
  return undefined;
}

// Calculate absolute position of a component
function getAbsolutePosition(comp: LvglComponent, allComps: LvglComponent[]): { x: number; y: number } {
  let absX = comp.x;
  let absY = comp.y;
  let pid = comp.parentId;
  while (pid) {
    const parent = findComponentInTree(allComps, pid);
    if (!parent) break;
    absX += parent.x;
    absY += parent.y;
    pid = parent.parentId;
  }
  return { x: absX, y: absY };
}

const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartMousePos = useRef({ x: 0, y: 0 });
  const dragStartCompPos = useRef({ x: 0, y: 0 });
  // Geometry and pointer position a resize started from. Every frame of the
  // drag is measured against these rather than against the frame before it, so
  // the edges the handle does not touch stay exactly where they were.
  const resizeStartRef = useRef({ box: { x: 0, y: 0, width: 0, height: 0 }, mouseX: 0, mouseY: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const rafRef = useRef<number>(0);

  // Transient interaction state lives in refs so the mouse handlers read the
  // current value synchronously without re-creating themselves. Panning never
  // affects rendering, so it needs no state at all; space-pan does (cursor
  // class), so its handlers write the ref and the state together.
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const spacePressedRef = useRef(false);
  const potentialDragRef = useRef<{ id: string, startX: number, startY: number, originalX: number, originalY: number, initialSelectionState: boolean } | null>(null);

  // Box selection state — drives the marquee rendering, while the ref hands
  // handlers the current value synchronously. Updated together below.
  const [boxSelection, setBoxSelectionState] = useState<BoxSelection>({
    isSelecting: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const boxSelectionRef = useRef(boxSelection);
  const setBoxSelection = useCallback((next: BoxSelection) => {
    boxSelectionRef.current = next;
    setBoxSelectionState(next);
  }, []);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string | null } | null>(null);

  // === Fine-grained store subscriptions ===
  // State that affects rendering
  const canvas = useEditorStore(s => s.canvas);
  const languages = useEditorStore(s => s.languages);
  const previewLanguage = useEditorStore(s => s.previewLanguage);
  const setPreviewLanguage = useEditorStore(s => s.setPreviewLanguage);
  useEditorStore(s => s.selection.selectedIds);
  useEditorStore(s => s.selection.hoveredId);
  const alignmentGuides = useEditorStore(s => s.alignmentGuides);
  const screens = useEditorStore(s => s.screens);
  const currentScreenId = useEditorStore(s => s.currentScreenId);

  // DO NOT subscribe to drag — it changes every frame during drag.
  // Read it via getState() inside event handlers.

  // Actions — stable references from zustand
  const setZoom = useEditorStore(s => s.setZoom);
  const setPan = useEditorStore(s => s.setPan);
  const toggleClipContent = useEditorStore(s => s.toggleClipContent);
  const selectComponent = useEditorStore(s => s.selectComponent);
  const selectComponents = useEditorStore(s => s.selectComponents);
  const clearSelection = useEditorStore(s => s.clearSelection);
  const startDrag = useEditorStore(s => s.startDrag);
  const endDrag = useEditorStore(s => s.endDrag);
  const saveToHistory = useEditorStore(s => s.saveToHistory);
  const deleteComponents = useEditorStore(s => s.deleteComponents);
  const bringToFront = useEditorStore(s => s.bringToFront);
  const sendToBack = useEditorStore(s => s.sendToBack);
  const bringForward = useEditorStore(s => s.bringForward);
  const sendBackward = useEditorStore(s => s.sendBackward);
  const moveComponentAndUpdateDrag = useEditorStore(s => s.moveComponentAndUpdateDrag);
  const resizeComponentAndUpdateDrag = useEditorStore(s => s.resizeComponentAndUpdateDrag);
  const reparentComponent = useEditorStore(s => s.reparentComponent);
  const moveComponent = useEditorStore(s => s.moveComponent);

  // Get current screen and its components
  const currentScreen = screens.find(p => p.id === currentScreenId);
  const components = useMemo(() => currentScreen?.components || [], [currentScreen?.components]);
  const pageBackgroundColor = currentScreen?.backgroundColor || '#ffffff';

  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas-drop-area',
  });

  // Handle keyboard events for space key (panning)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        // Don't block space in input/textarea/contenteditable elements
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        ) {
          return;
        }
        spacePressedRef.current = true;
        setSpacePressed(true);
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        setSpacePressed(false);
        isPanningRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle wheel zoom — read canvas.zoom from getState to avoid dep
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const { canvas: c } = useEditorStore.getState();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(c.zoom + delta);
      }
    },
    [setZoom]
  );

  // Handle mouse down for panning, selection, or box selection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Close context menu
      setContextMenu(null);
      
      const { canvas: c } = useEditorStore.getState();

      // Middle mouse button or space + left click for panning
      if (e.button === 1 || (spacePressedRef.current && e.button === 0)) {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX - c.panX, y: e.clientY - c.panY };
        e.preventDefault();
        return;
      }

      // Left click on canvas background - start box selection or clear selection
      if (e.button === 0 && e.target === canvasRef.current) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = (e.clientX - rect.left) / c.zoom;
          const y = (e.clientY - rect.top) / c.zoom;
          
          // Start box selection
          setBoxSelection({
            isSelecting: true,
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
          });
          
          // Clear selection unless Ctrl/Cmd is held
          if (!e.ctrlKey && !e.metaKey) {
            clearSelection();
          }
        }
      }
    },
    [clearSelection, setBoxSelection]
  );

  // Handle resize logic — the geometry rules live in resizeGeometry.ts
  const handleResize = useCallback(
    (componentId: string, handle: ResizeHandle, mouseX: number, mouseY: number) => {
      const state = useEditorStore.getState();
      const comp = state.getComponentById(componentId);
      if (!comp) return;

      const start = resizeStartRef.current;
      const box = resizeBox(
        start.box,
        handle,
        mouseX - start.mouseX,
        mouseY - start.mouseY,
        state.canvas,
        // An circle is round, so it resizes square — decided here, where the
        // handle is known, rather than by the store guessing afterwards.
        { square: comp.type === 'circle' },
      );

      resizeComponentAndUpdateDrag(componentId, box.width, box.height, mouseX, mouseY, box.x, box.y);
    },
    [resizeComponentAndUpdateDrag]
  );

  // Handle mouse move — all state read via refs or getState(), zero reactive deps
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) {
        const ps = panStartRef.current;
        setPan(e.clientX - ps.x, e.clientY - ps.y);
        return;
      }

      // Box selection
      if (boxSelectionRef.current.isSelecting) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const { canvas: c } = useEditorStore.getState();
          const x = (e.clientX - rect.left) / c.zoom;
          const y = (e.clientY - rect.top) / c.zoom;
          setBoxSelection({
            ...boxSelectionRef.current,
            currentX: x,
            currentY: y,
          });
        }
        return;
      }
      
      const { canvas: c } = useEditorStore.getState();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left) / c.zoom;
      const y = (e.clientY - rect.top) / c.zoom;

      // Check if we should START a drag (Deferred logic)
      if (potentialDragRef.current && !useEditorStore.getState().drag.isDragging) {
         const pd = potentialDragRef.current;
         // Calculate distance
         const dx = (x - pd.startX) * c.zoom; // Screen pixels
         const dy = (y - pd.startY) * c.zoom;
         const dist = Math.sqrt(dx*dx + dy*dy);
         
         if (dist > 5) {
            // Threshold passed, START DRAG
            startDrag('move', {
              draggedComponentId: pd.id,
              startX: pd.startX,
              startY: pd.startY,
              currentX: x,
              currentY: y,
            });
            canvasRef.current?.classList.add('dragging-move');
            
            // Hoist immediately if needed
            const state = useEditorStore.getState();
            let comp = state.getComponentById(pd.id);
            if (comp && comp.parentId) {
               reparentComponent(comp.id, null);
               moveComponent(comp.id, pd.originalX, pd.originalY);
               // Refresh comp
               comp = state.getComponentById(comp.id);
            }
            
            // Clear potential drag ref so we don't trigger again
            // But we keep it null? No, drag system takes over.
            potentialDragRef.current = null;
         }
      }

      const drag = useEditorStore.getState().drag;
      if (drag.isDragging) {
        // Throttle with requestAnimationFrame
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const currentDrag = useEditorStore.getState().drag;
          if (!currentDrag.isDragging) return;

          // Handle component move
          if (currentDrag.dragType === 'move' && currentDrag.draggedComponentId) {
             // For move, we rely on dragStartCompPos which was set in mouseDown
             // Recalculate component position based on delta from START
             const totalDeltaX = x - dragStartMousePos.current.x;
             const totalDeltaY = y - dragStartMousePos.current.y;
             
             const newX = dragStartCompPos.current.x + totalDeltaX;
             const newY = dragStartCompPos.current.y + totalDeltaY;

             moveComponentAndUpdateDrag(
                currentDrag.draggedComponentId,
                newX,
                newY,
                x, 
                y
              );
          }

          // Handle resize
          if (currentDrag.dragType === 'resize' && currentDrag.draggedComponentId && currentDrag.resizeHandle) {
            handleResize(currentDrag.draggedComponentId, currentDrag.resizeHandle, x, y);
          }
        });
      }
    },
    [setPan, moveComponentAndUpdateDrag, handleResize, reparentComponent, moveComponent, startDrag, setBoxSelection]
  );

  // Handle mouse up — read all transient state from refs/getState
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Clean up any pending RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    
    isPanningRef.current = false;
    
    // Handle deferred click selection logic if NO drag happened
    if (potentialDragRef.current && !useEditorStore.getState().drag.isDragging) {
       const pd = potentialDragRef.current;
       const isCtrl = e.ctrlKey || e.metaKey;
       
       // If it was already selected, now we process the click action
       if (pd.initialSelectionState) {
          if (isCtrl) {
             // Toggle off
             selectComponent(pd.id, true);
          } else {
             // Select ONLY this (clear others)
             selectComponent(pd.id, false);
          }
       }
       // If it wasn't selected, we already selected it in MouseDown.
       
       potentialDragRef.current = null;
    }
    
    // Finish box selection
    const bs = boxSelectionRef.current;
    if (bs.isSelecting) {
      const minX = Math.min(bs.startX, bs.currentX);
      const maxX = Math.max(bs.startX, bs.currentX);
      const minY = Math.min(bs.startY, bs.currentY);
      const maxY = Math.max(bs.startY, bs.currentY);
      
      // Find components within the box
      const { screens: p, currentScreenId: cpId } = useEditorStore.getState();
      const cp = p.find(pg => pg.id === cpId);
      const comps = cp?.components || [];
      const flatComps = flattenComponents(comps);
      const ids = flatComps
        .filter(({ comp, absX, absY }) => {
          const compRight = absX + comp.width;
          const compBottom = absY + comp.height;
          return absX < maxX && compRight > minX && absY < maxY && compBottom > minY;
        })
        .map(({ comp }) => comp.id);
      
      if (ids.length > 0) {
        selectComponents(ids);
      }
      
      setBoxSelection({
        isSelecting: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
    }
    
    const drag = useEditorStore.getState().drag;
    if (drag.isDragging) {
      if (drag.dragType === 'move' || drag.dragType === 'resize') {
        saveToHistory();
      }

      // Auto-reparent: when a move-drag ends over a container, reparent into it
      // Only check reparent if the component was actually moved (not just clicked)
      if (drag.dragType === 'move' && drag.draggedComponentId) {
        const state = useEditorStore.getState();
        const draggedComp = state.getComponentById(drag.draggedComponentId);
        const actuallyMoved = draggedComp && (
          Math.abs(draggedComp.x - dragStartCompPos.current.x) > 2 ||
          Math.abs(draggedComp.y - dragStartCompPos.current.y) > 2
        );
        if (draggedComp && actuallyMoved) {
          const currentScreen = state.screens.find(p => p.id === state.currentScreenId);
          const allComps = currentScreen?.components || [];

          // Calculate the absolute position of the dragged component
          const draggedAbs = getAbsolutePosition(draggedComp, allComps);
          const centerX = draggedAbs.x + draggedComp.width / 2;
          const centerY = draggedAbs.y + draggedComp.height / 2;

          // Find the deepest container under the center of the dragged component
          // (excluding the dragged component itself and its descendants)
          const isDescendantOf = (compId: string, ancestorId: string, comps: LvglComponent[]): boolean => {
            const comp = findComponentInTree(comps, compId);
            if (!comp) return false;
            let pid = comp.parentId;
            while (pid) {
              if (pid === ancestorId) return true;
              const parent = findComponentInTree(comps, pid);
              if (!parent) break;
              pid = parent.parentId;
            }
            return false;
          };

          type HitResult = { comp: LvglComponent; absX: number; absY: number } | null;
          const findDeepestContainer = (
            comps: LvglComponent[],
            offsetX: number,
            offsetY: number,
          ): HitResult => {
            for (let i = comps.length - 1; i >= 0; i--) {
              const comp = comps[i];
              if (comp.id === drag.draggedComponentId) continue;
              if (isDescendantOf(comp.id, drag.draggedComponentId!, allComps)) continue;

              const absX = comp.x + offsetX;
              const absY = comp.y + offsetY;

              if (
                centerX >= absX && centerX <= absX + comp.width &&
                centerY >= absY && centerY <= absY + comp.height
              ) {
                const def = getComponentDefinition(comp.type);
                
                // Special handling for Button:
                // Although it is technically a container (can hold labels/images),
                // we only want to drop into it if dragging a Label or Image.
                // Otherwise, treat it as a non-container to avoid accidental nesting.
                let isContainer = def?.isContainer;
                if (isContainer && comp.type === 'btn') {
                   const allowedTypes = ['label', 'img'];
                   if (!draggedComp || !allowedTypes.includes(draggedComp.type)) {
                     isContainer = false;
                   }
                }

                if (isContainer) {
                  const deeper = findDeepestContainer(comp.children, absX, absY);
                  return deeper || { comp, absX, absY };
                }
              }
            }
            return null;
          };

          const container = findDeepestContainer(allComps, 0, 0);
          const newParentId = container ? container.comp.id : null;

          // Only reparent if the parent actually changed
          if (newParentId !== draggedComp.parentId) {
            // Convert absolute position to be relative to the new parent
            if (container) {
              const newX = draggedAbs.x - container.absX;
              const newY = draggedAbs.y - container.absY;
              moveComponent(drag.draggedComponentId, newX, newY);
            } else {
              // Moving to root — position is already absolute
              moveComponent(drag.draggedComponentId, draggedAbs.x, draggedAbs.y);
            }
            reparentComponent(drag.draggedComponentId, newParentId);
          }
        }
      }

      endDrag();
      canvasRef.current?.classList.remove('dragging-move');
    }
  }, [selectComponent, selectComponents, saveToHistory, endDrag, reparentComponent, moveComponent, setBoxSelection]);

  // Handle component selection
  const handleComponentClick = useCallback(
    (e: React.MouseEvent, componentId: string) => {
      e.stopPropagation();
      // Ctrl/Cmd+click multi-select is handled in mousedown (handleComponentDragStart).
      // If we handle it again here, the toggle fires twice and cancels itself out.
      if (e.ctrlKey || e.metaKey) return;
      selectComponent(componentId, false);
    },
    [selectComponent]
  );

  // Handle component drag start — read transient state from getState
  // Renamed to handleMouseDownOnComponent to reflect deferred logic
  const handleMouseDownOnComponent = useCallback(
    (e: React.MouseEvent, componentId: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();

      const state = useEditorStore.getState();

      // Don't allow dragging locked components
      const comp = state.getComponentById(componentId);
      if (comp?.locked) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left) / state.canvas.zoom;
        const y = (e.clientY - rect.top) / state.canvas.zoom;

        const isSelected = state.selection.selectedIds.includes(componentId);
        const isCtrl = e.ctrlKey || e.metaKey;

        // Immediate selection logic for unselected items
        if (!isSelected) {
          if (isCtrl) {
            selectComponent(componentId, true);
          } else {
            selectComponent(componentId, false);
          }
        }
        // If already selected, we defer selection logic to MouseUp (to handle toggle/single-select)
        // so that a drag start doesn't accidentally deselect others or toggle off.

        // Capture initial position for potential drag
        dragStartMousePos.current = { x, y };
        if (comp) {
          // Calculate visual absolute position for potential hoist
          if (comp.parentId && e.currentTarget) {
             const domRect = (e.currentTarget as Element).getBoundingClientRect();
             const canvasRect = canvasRef.current?.getBoundingClientRect();
             if (canvasRect) {
               dragStartCompPos.current = {
                 x: (domRect.left - canvasRect.left) / state.canvas.zoom,
                 y: (domRect.top - canvasRect.top) / state.canvas.zoom
               };
             } else {
               dragStartCompPos.current = { x: comp.x, y: comp.y };
             }
          } else {
            dragStartCompPos.current = { x: comp.x, y: comp.y };
          }
          
          // Set potential drag state
          potentialDragRef.current = {
            id: componentId,
            startX: x,
            startY: y,
            originalX: dragStartCompPos.current.x,
            originalY: dragStartCompPos.current.y,
            initialSelectionState: isSelected
          };
        }
      }
    },
    [selectComponent]
  );

  // Handle resize handle drag start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, componentId: string, handle: ResizeHandle) => {
      e.stopPropagation();
      e.preventDefault();

      const state = useEditorStore.getState();

      // Don't allow resizing locked components
      const comp = state.getComponentById(componentId);
      if (comp?.locked) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect && comp) {
        const x = (e.clientX - rect.left) / state.canvas.zoom;
        const y = (e.clientY - rect.top) / state.canvas.zoom;

        resizeStartRef.current = {
          box: { x: comp.x, y: comp.y, width: comp.width, height: comp.height },
          mouseX: x,
          mouseY: y,
        };

        startDrag('resize', {
          draggedComponentId: componentId,
          resizeHandle: handle,
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        });
      }
    },
    [startDrag]
  );

  // Handle context menu — read selection from getState
  const handleContextMenu = useCallback((e: React.MouseEvent, componentId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const state = useEditorStore.getState();
    // If right-clicking on a component that's not selected, select it
    if (componentId && !state.selection.selectedIds.includes(componentId)) {
      selectComponent(componentId);
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetId: componentId || null,
    });
  }, [selectComponent]);

  // Context menu items — read selection from getState inside onClick handlers
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    const state = useEditorStore.getState();
    const sIds = state.selection.selectedIds;
    const hasSelection = sIds.length > 0;
    const hasMultiple = sIds.length > 1;
    
    const items: ContextMenuItem[] = [
      {
        id: 'copy',
        label: 'Copy',
        icon: '📋',
        shortcut: 'Ctrl+C',
        disabled: !hasSelection,
        onClick: () => {
          copySelectedComponents();
        },
      },
      {
        id: 'cut',
        label: 'Cut',
        icon: '✂️',
        shortcut: 'Ctrl+X',
        disabled: !hasSelection,
        onClick: () => {
          cutSelectedComponents();
        },
      },
      {
        id: 'paste',
        label: 'Paste',
        icon: '📄',
        shortcut: 'Ctrl+V',
        disabled: !hasClipboard(),
        onClick: () => {
          pasteClipboardComponents();
        },
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: '⧉',
        shortcut: 'Ctrl+D',
        disabled: !hasSelection,
        onClick: () => {
          duplicateSelectedComponents();
        },
      },
      { id: 'divider1', label: '', divider: true },
      {
        id: 'delete',
        label: 'Delete',
        icon: '🗑️',
        shortcut: 'Delete',
        disabled: !hasSelection,
        onClick: () => {
          const s = useEditorStore.getState();
          saveToHistory();
          deleteComponents(s.selection.selectedIds);
        },
      },
      { id: 'divider2', label: '', divider: true },
      {
        id: 'bring-front',
        label: 'Bring to Front',
        icon: '⬆️',
        disabled: !hasSelection || hasMultiple,
        onClick: () => {
          const s = useEditorStore.getState();
          if (s.selection.selectedIds.length === 1) {
            bringToFront(s.selection.selectedIds[0]);
          }
        },
      },
      {
        id: 'bring-forward',
        label: 'Bring Forward',
        icon: '↑',
        disabled: !hasSelection || hasMultiple,
        onClick: () => {
          const s = useEditorStore.getState();
          if (s.selection.selectedIds.length === 1) {
            bringForward(s.selection.selectedIds[0]);
          }
        },
      },
      {
        id: 'send-backward',
        label: 'Send Backward',
        icon: '↓',
        disabled: !hasSelection || hasMultiple,
        onClick: () => {
          const s = useEditorStore.getState();
          if (s.selection.selectedIds.length === 1) {
            sendBackward(s.selection.selectedIds[0]);
          }
        },
      },
      {
        id: 'send-back',
        label: 'Send to Back',
        icon: '⬇️',
        disabled: !hasSelection || hasMultiple,
        onClick: () => {
          const s = useEditorStore.getState();
          if (s.selection.selectedIds.length === 1) {
            sendToBack(s.selection.selectedIds[0]);
          }
        },
      },
      { id: 'divider3', label: '', divider: true },
      {
        id: 'select-all',
        label: 'Select All',
        icon: '☑️',
        shortcut: 'Ctrl+A',
        onClick: () => {
          selectAllComponents();
        },
      },
    ];
    
    return items;
  }, [saveToHistory, deleteComponents, bringToFront, bringForward, sendBackward, sendToBack]);

  // Handle zoom controls
  const handleZoomIn = useCallback(() => {
    const { canvas: c } = useEditorStore.getState();
    setZoom(c.zoom + 0.1);
  }, [setZoom]);

  const handleZoomOut = useCallback(() => {
    const { canvas: c } = useEditorStore.getState();
    setZoom(c.zoom - 0.1);
  }, [setZoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, [setZoom]);

  /**
   * Back to 100% and centred: the two things that get lost together after a
   * while of zooming and panning around a screen. See canvasView.ts for how
   * the centre is worked out.
   */
  const handleResetCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvasElement = canvasRef.current;
    const { canvas: c } = useEditorStore.getState();

    setZoom(1);
    if (!container || !canvasElement) {
      setPan(0, 0);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvasElement.getBoundingClientRect();
    const pan = centringPan({
      container: containerRect,
      canvasCorner: { left: canvasRect.left, top: canvasRect.top },
      currentPan: { x: c.panX, y: c.panY },
      design: { width: c.width, height: c.height },
    });

    setPan(pan.x, pan.y);
  }, [setZoom, setPan]);

  // Ctrl+0, scoped to the canvas rather than global: resetting the view means
  // nothing on the tabs where there is no view to reset.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key !== '0' && event.code !== 'Digit0') return;
      event.preventDefault();
      handleResetCanvas();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleResetCanvas]);

  // Render grid
  const renderGrid = () => {
    if (!canvas.showGrid) return null;

    const gridSize = canvas.gridSize;
    const pattern = `
      <pattern id="grid" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
        <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>
      </pattern>
    `;

    return (
      <svg
        className="canvas-grid"
        width={canvas.width}
        height={canvas.height}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      >
        <defs dangerouslySetInnerHTML={{ __html: pattern }} />
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    );
  };

  // Render box selection
  const renderBoxSelection = () => {
    if (!boxSelection.isSelecting) return null;
    
    const minX = Math.min(boxSelection.startX, boxSelection.currentX);
    const minY = Math.min(boxSelection.startY, boxSelection.currentY);
    const width = Math.abs(boxSelection.currentX - boxSelection.startX);
    const height = Math.abs(boxSelection.currentY - boxSelection.startY);
    
    return (
      <div
        className="box-selection"
        style={{
          left: minX,
          top: minY,
          width,
          height,
        }}
      />
    );
  };

  // Stable callback ref for context menu per-component
  const handleComponentContextMenu = useCallback(
    (e: React.MouseEvent, compId: string) => handleContextMenu(e, compId),
    [handleContextMenu]
  );

  // Render components recursively
  const renderComponents = (comps: LvglComponent[], offsetX = 0, offsetY = 0, parentComp?: LvglComponent) => {
    // Filter children for tabview/tileview based on active tab/tile
    let visibleComps = comps;
    if (parentComp?.type === 'tabview') {
      const tabChildMap: Record<string, string[]> = parentComp.props?.tabChildMap || {};
      const activeTab = String(parentComp.props?.activeTab || 0);
      const activeChildIds = tabChildMap[activeTab] || [];
      // If tabChildMap is empty, show all children (backward compat); otherwise filter
      if (Object.keys(tabChildMap).length > 0) {
        visibleComps = comps.filter(c => activeChildIds.includes(c.id));
      }
    } else if (parentComp?.type === 'tileview') {
      const tileChildMap: Record<string, string[]> = parentComp.props?.tileChildMap || {};
      const activeKey = `${parentComp.props?.currentRow || 0}-${parentComp.props?.currentCol || 0}`;
      const activeChildIds = tileChildMap[activeKey] || [];
      if (Object.keys(tileChildMap).length > 0) {
        visibleComps = comps.filter(c => activeChildIds.includes(c.id));
      }
    }

    // Parent dimensions: use parent component size, or canvas (screen) size for top-level
    const pw = parentComp ? parentComp.width : canvas.width;
    const ph = parentComp ? parentComp.height : canvas.height;

    return visibleComps.map(comp => (
      <CanvasComponent
        key={comp.id}
        component={comp}
        offsetX={offsetX}
        offsetY={offsetY}
        parentWidth={pw}
        parentHeight={ph}
        parentLayout={parentComp?.props?.layout || undefined}
        parentFlexDirection={parentComp?.props?.flexDirection || undefined}
        onClick={handleComponentClick}
        onDragStart={handleMouseDownOnComponent}
        onResizeStart={handleResizeStart}
        onContextMenu={handleComponentContextMenu}
      >
        {comp.children.length > 0 &&
          renderComponents(comp.children, offsetX + comp.x, offsetY + comp.y, comp)}
      </CanvasComponent>
    ));
  };

  return (
    <div
      ref={containerRef}
      className={`canvas-container ${spacePressed ? 'panning-mode' : ''} ${isOver ? 'drop-target' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      <div
        className="canvas-viewport"
        style={{
          transform: `translate(${canvas.panX}px, ${canvas.panY}px)`,
        }}
      >
        <div
          ref={(node) => {
            canvasRef.current = node as HTMLDivElement;
            setNodeRef(node);
          }}
          className={`canvas ${canvas.clipContent ? 'clip-content' : ''}`}
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `scale(${canvas.zoom})`,
            transformOrigin: 'top left',
            backgroundColor: pageBackgroundColor,
          }}
        >
          {renderGrid()}
          {renderComponents(components)}
          {renderBoxSelection()}
          <AlignmentGuides guides={alignmentGuides} />

          {/* Everything outside the canvas, washed towards the workspace
              colour. Last in the canvas so it paints over the components
              without needing a z-index — this canvas stacks by document order
              on purpose, see CanvasComponent.css. Nothing to wash once the
              content is clipped. */}
          {!canvas.clipContent && <div className="canvas-outside-wash" aria-hidden="true" />}
        </div>
      </div>
      
      {/* The floating controls, in one row so that adding another cannot push
          the others off their hardcoded offsets. */}
      <div className="canvas-overlay-controls">
        <button
          type="button"
          className="canvas-reset"
          onClick={handleResetCanvas}
          title="Reset Canvas — zoom to 100% and centre the screen (Ctrl+0)"
          aria-label="Reset canvas: zoom to 100% and centre the screen"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            {/* Corner brackets around a screen: fit it back into view. */}
            <path
              d="M2 5.5V3a1 1 0 0 1 1-1h2.5M10.5 2H13a1 1 0 0 1 1 1v2.5M14 10.5V13a1 1 0 0 1-1 1h-2.5M5.5 14H3a1 1 0 0 1-1-1v-2.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <rect x="5.5" y="5.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>

        <button
          type="button"
          className={`canvas-clip ${canvas.clipContent ? 'active' : ''}`}
          onClick={toggleClipContent}
          aria-pressed={canvas.clipContent}
          title={
            canvas.clipContent
              ? 'Clip Content: on — anything outside the canvas is hidden'
              : 'Clip Content: off — anything outside the canvas is shown, dimmed'
          }
          aria-label="Clip content to the canvas"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            {/* A crop mark: the frame that decides what the panel will show. */}
            <path
              d="M4.5 1v10.5H15M1 4.5h10.5V15"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <MousePosition containerRef={containerRef} canvasRef={canvasRef} />

        {/* Language preview: which column of the text table the canvas renders.
            One language means nothing to switch, so the control stays hidden. */}
        {languages.length > 1 && (
          <div className="language-controls">
            <span className="language-icon" title="Preview language">🌐</span>
            <select
              value={previewLanguage ?? languages[0].code}
              onChange={(e) => setPreviewLanguage(e.target.value)}
              title="Preview language"
            >
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Zoom controls */}
        <div className="zoom-controls">
          <button onClick={handleZoomOut} title="Zoom Out">−</button>
          <button className="zoom-level" onClick={handleZoomReset} title="Reset Zoom">
            {Math.round(canvas.zoom * 100)}%
          </button>
          <button onClick={handleZoomIn} title="Zoom In">+</button>
        </div>
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default Canvas;
