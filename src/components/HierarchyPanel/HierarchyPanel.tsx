// Hierarchy Panel - Tree view of component structure

import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { LvglComponent } from '../../types';
import PanelChevron from '../LogicEditor/PanelChevron';
import './HierarchyPanel.css';

// Resize limits, mirroring the logic editor's GraphManager: the panel keeps
// room for its own header, and the panels above keep room to stay usable.
const MIN_PANEL_HEIGHT = 120;
const MIN_ABOVE_HEIGHT = 220;
const DEFAULT_PANEL_HEIGHT = 280;

/**
 * The component array is stored back-to-front: index 0 is created first and so
 * is drawn first by LVGL, putting it at the bottom of the stack. Layer panels
 * are read the other way round — front-most on top — so the tree renders the
 * reverse of the array, and drop positions are translated back in `handleDrop`.
 */
function toDisplayOrder(components: LvglComponent[]): LvglComponent[] {
  return [...components].reverse();
}

/**
 * Where a drop lands relative to the row under the cursor. 'above'/'below' are
 * same-level reorders; 'inside' nests the dragged component as a child.
 */
type DropZone = 'above' | 'inside' | 'below';

/** Fraction of a row's height that reads as a same-level drop at each edge. */
const EDGE_ZONE_RATIO = 0.3;

function resolveDropZone(event: React.DragEvent<HTMLElement>): DropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  const offset = event.clientY - rect.top;
  if (offset < rect.height * EDGE_ZONE_RATIO) return 'above';
  if (offset > rect.height * (1 - EDGE_ZONE_RATIO)) return 'below';
  return 'inside';
}

interface TreeNodeProps {
  component: LvglComponent;
  depth: number;
  onSelect: (id: string, addToSelection: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string, zone: DropZone) => void;
  selectedIds: string[];
  draggedId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  component,
  depth,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onDragStart,
  onDrop,
  selectedIds,
  draggedId,
  expandedIds,
  onToggleExpand,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(component.name);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);

  const isSelected = selectedIds.includes(component.id);
  const isExpanded = expandedIds.has(component.id);
  const hasChildren = component.children.length > 0;
  const isDragging = draggedId === component.id;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(component.id, e.ctrlKey || e.metaKey);
  };
  
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditName(component.name);
  };
  
  const handleRenameSubmit = () => {
    if (editName.trim() && editName !== component.name) {
      onRename(component.id, editName.trim());
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(component.name);
    }
  };
  
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    onDragStart(component.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedId || draggedId === component.id) return;
    e.dataTransfer.dropEffect = 'move';
    setDropZone(resolveDropZone(e));
  };

  const handleDragLeave = () => setDropZone(null);

  const handleDragEnd = () => setDropZone(null);

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const zone = resolveDropZone(e);
    setDropZone(null);
    if (draggedId && draggedId !== component.id) {
      onDrop(component.id, zone);
    }
  };
  
  // Get icon based on component type
  const getTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      btn: '🔘',
      label: '🏷️',
      img: '🖼️',
      slider: '🎚️',
      checkbox: '☑️',
      switch: '🔀',
      bar: '📊',
      arc: '⭕',
      textarea: '📝',
      dropdown: '📋',
      panel: '📦',
      container: '📦',
      tabview: '📑',
      window: '🪟',
      chart: '📈',
      table: '📅',
      calendar: '📆',
    };
    return icons[type] || '⬜';
  };
  
  return (
    <div className="tree-node-wrapper">
      <div
        className={[
          'tree-node',
          isSelected ? 'selected' : '',
          isDragging ? 'dragging' : '',
          dropZone ? `drop-${dropZone}` : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
      >
        {/* Expand/Collapse button — same twisty as the panel header */}
        <span
          className={`expand-btn ${hasChildren ? 'has-children' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(component.id);
          }}
        >
          {hasChildren && <PanelChevron open={isExpanded} className="tree-expand-chevron" />}
        </span>
        
        {/* Type icon */}
        <span className="type-icon">{getTypeIcon(component.type)}</span>
        
        {/* Name */}
        {isEditing ? (
          <input
            type="text"
            className="rename-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="node-name">{component.name}</span>
        )}
        
        {/* Status icons */}
        <div className="status-icons">
          <span
            className={`status-icon visibility ${component.visible ? '' : 'off'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(component.id);
            }}
            title={component.visible ? 'Visible' : 'Hidden'}
          >
            {component.visible ? '👁️' : '👁️‍🗨️'}
          </span>
          <span
            className={`status-icon lock ${component.locked ? 'on' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(component.id);
            }}
            title={component.locked ? 'Locked' : 'Unlocked'}
          >
            {component.locked ? '🔒' : '🔓'}
          </span>
        </div>
      </div>
      
      {/* Children — front-most first, see toDisplayOrder */}
      {hasChildren && isExpanded && (
        <div className="tree-children">
          {toDisplayOrder(component.children).map(child => (
            <TreeNode
              key={child.id}
              component={child}
              depth={depth + 1}
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onRename={onRename}
              onDragStart={onDragStart}
              onDrop={onDrop}
              selectedIds={selectedIds}
              draggedId={draggedId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HierarchyPanel: React.FC = () => {
  const {
    screens,
    currentScreenId,
    selection,
    selectComponent,
    updateComponent,
    reparentComponent,
    reorderComponentAdjacentTo,
    saveToHistory,
  } = useEditorStore();
  
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [resizing, setResizing] = useState(false);

  const currentScreen = screens.find(p => p.id === currentScreenId);
  const components = useMemo(() => currentScreen?.components || [], [currentScreen?.components]);

  const componentCount = useMemo(() => {
    const count = (comps: LvglComponent[]): number =>
      comps.reduce((sum, comp) => sum + 1 + count(comp.children), 0);
    return count(components);
  }, [components]);

  // Same drag behaviour as the logic editor's GraphManager: the panel is
  // bottom-docked, so dragging its top edge up grows it.
  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = panelHeight;
      const leftPanel = e.currentTarget.closest('.left-panel');
      const maxHeight = leftPanel
        ? Math.max(MIN_PANEL_HEIGHT, leftPanel.clientHeight - MIN_ABOVE_HEIGHT)
        : startHeight;
      setResizing(true);

      const onMove = (ev: PointerEvent) => {
        setPanelHeight(Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, startHeight + startY - ev.clientY)));
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
    [panelHeight],
  );
  
  const handleSelect = useCallback((id: string, addToSelection: boolean) => {
    selectComponent(id, addToSelection);
  }, [selectComponent]);
  
  const handleToggleVisibility = useCallback((id: string) => {
    const comp = useEditorStore.getState().getComponentById(id);
    if (comp) {
      saveToHistory();
      updateComponent(id, { visible: !comp.visible });
    }
  }, [updateComponent, saveToHistory]);
  
  const handleToggleLock = useCallback((id: string) => {
    const comp = useEditorStore.getState().getComponentById(id);
    if (comp) {
      saveToHistory();
      updateComponent(id, { locked: !comp.locked });
    }
  }, [updateComponent, saveToHistory]);
  
  const handleRename = useCallback((id: string, newName: string) => {
    saveToHistory();
    updateComponent(id, { name: newName });
  }, [updateComponent, saveToHistory]);
  
  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDrop = useCallback((targetId: string, zone: DropZone) => {
    if (draggedId && draggedId !== targetId) {
      // Check if target is not a descendant of dragged
      const isDescendant = (parentId: string, childId: string): boolean => {
        const parent = useEditorStore.getState().getComponentById(parentId);
        if (!parent) return false;
        for (const child of parent.children) {
          if (child.id === childId) return true;
          if (isDescendant(child.id, childId)) return true;
        }
        return false;
      };

      if (!isDescendant(draggedId, targetId)) {
        if (zone === 'inside') {
          saveToHistory();
          reparentComponent(draggedId, targetId);
        } else {
          // The tree is rendered front-to-back, so a row dropped visually above
          // the target belongs *after* it in the back-to-front array.
          reorderComponentAdjacentTo(
            draggedId,
            targetId,
            zone === 'above' ? 'after' : 'before',
          );
        }
      }
    }
    setDraggedId(null);
  }, [draggedId, reparentComponent, reorderComponentAdjacentTo, saveToHistory]);
  
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  const handleExpandAll = useCallback(() => {
    const getAllIds = (comps: LvglComponent[]): string[] => {
      const ids: string[] = [];
      for (const comp of comps) {
        if (comp.children.length > 0) {
          ids.push(comp.id);
          ids.push(...getAllIds(comp.children));
        }
      }
      return ids;
    };
    setExpandedIds(new Set(getAllIds(components)));
  }, [components]);
  
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);
  
  // Handle drop on empty area (move to root)
  const handleDropOnRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (draggedId) {
      saveToHistory();
      reparentComponent(draggedId, null);
      setDraggedId(null);
    }
  }, [draggedId, reparentComponent, saveToHistory]);
  
  const handleDragOverRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  
  return (
    <div className="hierarchy-panel" style={panelExpanded ? { height: panelHeight } : undefined}>
      {panelExpanded && (
        <div
          className={`hierarchy-resizer ${resizing ? 'resizing' : ''}`}
          onPointerDown={handleResizeStart}
        />
      )}
      <div
        className="hierarchy-header"
        onClick={() => setPanelExpanded(prev => !prev)}
        title={panelExpanded ? 'Collapse' : 'Expand'}
      >
        <PanelChevron open={panelExpanded} className="hierarchy-toggle" />
        <span className="hierarchy-title">Hierarchy</span>
        <span className="hierarchy-count">{componentCount}</span>
        <div className="hierarchy-actions" onClick={e => e.stopPropagation()}>
          <button
            className="hierarchy-btn"
            onClick={handleExpandAll}
            title="Expand all"
          >
            ⊞
          </button>
          <button
            className="hierarchy-btn"
            onClick={handleCollapseAll}
            title="Collapse all"
          >
            ⊟
          </button>
        </div>
      </div>

      {panelExpanded && (
        <div
          className="hierarchy-tree"
          onDragOver={handleDragOverRoot}
          onDrop={handleDropOnRoot}
        >
          {components.length === 0 ? (
            <div className="empty-message">
              No components
            </div>
          ) : (
            toDisplayOrder(components).map(comp => (
              <TreeNode
                key={comp.id}
                component={comp}
                depth={0}
                onSelect={handleSelect}
                onToggleVisibility={handleToggleVisibility}
                onToggleLock={handleToggleLock}
                onRename={handleRename}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                selectedIds={selection.selectedIds}
                draggedId={draggedId}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default HierarchyPanel;
