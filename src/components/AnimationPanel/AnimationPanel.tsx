import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { Animation, AnimationType } from '../../types';
import AnimationEditDialog from './AnimationEditDialog';
import PanelChevron from '../LogicEditor/PanelChevron';
import './AnimationPanel.css';

const ANIM_TYPE_LABELS: Record<AnimationType, string> = {
  fade_in: 'Fade In',
  fade_out: 'Fade Out',
  slide_left: 'Slide In from Left',
  slide_right: 'Slide In from Right',
  slide_up: 'Slide In from Bottom',
  slide_down: 'Slide In from Top',
  zoom_in: 'Zoom In',
  zoom_out: 'Zoom Out',
  custom: 'Custom',
};

const ANIM_TYPE_ICONS: Record<AnimationType, string> = {
  fade_in: '🌅',
  fade_out: '🌇',
  slide_left: '⬅️',
  slide_right: '➡️',
  slide_up: '⬆️',
  slide_down: '⬇️',
  zoom_in: '🔍',
  zoom_out: '🔎',
  custom: '⚙️',
};

// Resize limits, mirroring the hierarchy panel: the panel keeps room for its
// own header, and the panels above keep room to stay usable.
const MIN_PANEL_HEIGHT = 120;
const MIN_ABOVE_HEIGHT = 220;
const DEFAULT_PANEL_HEIGHT = 240;

const AnimationPanel: React.FC = () => {
  const { selection, getComponentById, updateComponent } = useEditorStore();
  const [editingAnim, setEditingAnim] = useState<Animation | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [resizing, setResizing] = useState(false);
  const [query, setQuery] = useState('');

  // Same drag behaviour as the hierarchy panel: bottom-docked, so dragging
  // the top edge up grows it.
  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = panelHeight;
      const column = e.currentTarget.closest('.left-panel, .right-panel');
      const maxHeight = column
        ? Math.max(MIN_PANEL_HEIGHT, column.clientHeight - MIN_ABOVE_HEIGHT)
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

  const selectedId = selection.selectedIds[0];
  const component = selectedId ? getComponentById(selectedId) : undefined;
  const animations = useMemo(() => component?.animations || [], [component?.animations]);

  const visibleAnimations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return animations;
    return animations.filter(
      anim =>
        (anim.name || '').toLowerCase().includes(q) ||
        (ANIM_TYPE_LABELS[anim.type] || anim.type).toLowerCase().includes(q) ||
        anim.property.toLowerCase().includes(q),
    );
  }, [animations, query]);

  const handleAddAnim = useCallback(() => {
    setEditingAnim(null);
    setIsCreating(true);
    setIsDialogOpen(true);
  }, []);

  const handleEditAnim = useCallback((anim: Animation) => {
    setEditingAnim(anim);
    setIsCreating(false);
    setIsDialogOpen(true);
  }, []);

  const handleDeleteAnim = useCallback((animId: string) => {
    if (!selectedId || !component) return;
    const newAnims = animations.filter(a => a.id !== animId);
    updateComponent(selectedId, { animations: newAnims });
  }, [selectedId, component, animations, updateComponent]);

  const handleSaveAnim = useCallback((anim: Animation) => {
    if (!selectedId || !component) return;
    if (isCreating) {
      updateComponent(selectedId, { animations: [...animations, anim] });
    } else {
      updateComponent(selectedId, {
        animations: animations.map(a => a.id === anim.id ? anim : a),
      });
    }
    setIsDialogOpen(false);
  }, [selectedId, component, animations, isCreating, updateComponent]);

  return (
    <div className="animation-panel" style={panelExpanded ? { height: panelHeight } : undefined}>
      {panelExpanded && (
        <div
          className={`anim-panel-resizer ${resizing ? 'resizing' : ''}`}
          onPointerDown={handleResizeStart}
        />
      )}
      <div
        className="anim-panel-header"
        onClick={() => setPanelExpanded(prev => !prev)}
        title={panelExpanded ? 'Collapse' : 'Expand'}
      >
        <PanelChevron open={panelExpanded} className="anim-panel-toggle" />
        <span className="anim-panel-title">Animations</span>
        <span className="anim-panel-count">{animations.length}</span>
        {component && (
          <div className="anim-panel-actions" onClick={e => e.stopPropagation()}>
            <button className="add-anim-btn" onClick={handleAddAnim} title="Add animation">＋</button>
          </div>
        )}
      </div>

      {panelExpanded && component && (
        <div className="anim-search">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search animations..."
            aria-label="Search animations"
          />
        </div>
      )}

      {panelExpanded && (
        !component ? (
          <div className="anim-no-selection">
            <p>Select a component</p>
            <p className="hint">Select a component to add animations</p>
          </div>
        ) : (
          <div className="anim-list">
            {animations.length === 0 ? (
              <div className="no-anims">
                <p>No animations</p>
              </div>
            ) : visibleAnimations.length === 0 ? (
              <div className="no-anims">
                <p>No matching animations</p>
              </div>
            ) : (
              visibleAnimations.map(anim => (
                <div key={anim.id} className="anim-item">
                  <div className="anim-info" onClick={() => handleEditAnim(anim)}>
                    <div className="anim-type">
                      <span className="anim-icon">{ANIM_TYPE_ICONS[anim.type] || '⚙️'}</span>
                      {anim.name || ANIM_TYPE_LABELS[anim.type] || anim.type}
                    </div>
                    <div className="anim-detail">
                      {anim.duration}ms · {anim.easing} · {anim.property}: {anim.startValue}→{anim.endValue}
                    </div>
                  </div>
                  <div className="anim-actions">
                    <button className="anim-edit-btn" onClick={() => handleEditAnim(anim)} title="Edit">✏️</button>
                    <button className="anim-delete-btn" onClick={() => handleDeleteAnim(anim.id)} title="Delete">🗑️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )
      )}

      {component && isDialogOpen && (
        <AnimationEditDialog
          animation={editingAnim}
          isCreating={isCreating}
          targetComponentId={selectedId}
          onSave={handleSaveAnim}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  );
};

export default AnimationPanel;
