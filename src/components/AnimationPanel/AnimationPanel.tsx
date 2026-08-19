import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { Animation, AnimationType } from '../../types';
import AnimationEditDialog from './AnimationEditDialog';
import PanelChevron from '../LogicEditor/PanelChevron';
import LackBadge from '../common/LackBadge';
import { animationLack, componentsById } from '../../utils/animationAssets';
import { useDockedPanelResize } from '../../hooks/useDockedPanelResize';
import '../panelBar.css';
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
// own header, whether it is being dragged or lending height to a panel below.
const MIN_PANEL_HEIGHT = 120;
const DEFAULT_PANEL_HEIGHT = 140;

const AnimationPanel: React.FC = () => {
  // Animations are project assets: the panel lists all of them and needs no
  // selection to add one. Each names its target, and says so when the target
  // is missing rather than hiding the animation along with it.
  const animations = useEditorStore(s => s.animations);
  const screens = useEditorStore(s => s.screens);
  const addAnimation = useEditorStore(s => s.addAnimation);
  const updateAnimation = useEditorStore(s => s.updateAnimation);
  const deleteAnimation = useEditorStore(s => s.deleteAnimation);
  const components = useMemo(() => componentsById(screens), [screens]);
  const [editingAnim, setEditingAnim] = useState<Animation | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [query, setQuery] = useState('');

  // Same drag behaviour as the hierarchy panel: bottom-docked, so dragging the
  // top edge up grows it into the space above.
  const { height: panelHeight, resizing, panelRef, onResizeStart } =
    useDockedPanelResize<HTMLDivElement>({
      minHeight: MIN_PANEL_HEIGHT,
      defaultHeight: DEFAULT_PANEL_HEIGHT,
      expanded: panelExpanded,
    });

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
    deleteAnimation(animId);
  }, [deleteAnimation]);

  const handleSaveAnim = useCallback((anim: Animation) => {
    if (isCreating) addAnimation(anim);
    else updateAnimation(anim.id, anim);
    setIsDialogOpen(false);
  }, [isCreating, addAnimation, updateAnimation]);

  return (
    <div
      className="animation-panel"
      ref={panelRef}
      style={panelExpanded ? { height: panelHeight } : undefined}
    >
      {panelExpanded && (
        <div
          className={`panel-grip ${resizing ? 'resizing' : ''}`}
          onPointerDown={onResizeStart}
        />
      )}
      <div
        className="anim-panel-header panel-bar"
        onClick={() => setPanelExpanded(prev => !prev)}
        title={panelExpanded ? 'Collapse' : 'Expand'}
      >
        <PanelChevron open={panelExpanded} className="panel-bar-toggle" />
        <span className="panel-bar-title">Animations</span>
        <span className="panel-bar-count">{animations.length}</span>
        <div className="panel-bar-actions" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="panel-bar-btn"
              onClick={handleAddAnim}
              title="Add animation"
            >
              ＋
            </button>
        </div>
      </div>

      {panelExpanded && (
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
                      {animationLack(anim, components) && (
                        <LackBadge reason={animationLack(anim, components)!} />
                      )}
                    </div>
                    <div className="anim-detail">
                      {components.get(anim.targetComponentId)?.name ?? 'no target'}
                      {' · '}
                      {anim.duration}ms · {anim.property}: {anim.startValue}→{anim.endValue}
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
      )}

      {isDialogOpen && (
        <AnimationEditDialog
          animation={editingAnim}
          isCreating={isCreating}
          targetComponentId=""
          onSave={handleSaveAnim}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  );
};

export default AnimationPanel;
