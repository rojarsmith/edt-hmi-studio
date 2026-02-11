import React, { useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { Animation, AnimationType } from '../../types';
import AnimationEditDialog from './AnimationEditDialog';
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

const AnimationPanel: React.FC = () => {
  const { selection, getComponentById, updateComponent } = useEditorStore();
  const [editingAnim, setEditingAnim] = useState<Animation | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedId = selection.selectedIds[0];
  const component = selectedId ? getComponentById(selectedId) : undefined;
  const animations = component?.animations || [];

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

  if (!component) {
    return (
      <div className="animation-panel">
        <div className="panel-header">
          <h3>🎬 Animations</h3>
        </div>
        <div className="anim-no-selection">
          <p>Select a component</p>
          <p className="hint">Select a component to add animations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animation-panel">
      <div className="panel-header">
        <h3>🎬 Animations</h3>
        <button className="add-anim-btn" onClick={handleAddAnim} title="Add animation">+</button>
      </div>
      <div className="anim-list">
        {animations.length === 0 ? (
          <div className="no-anims">
            <p>No animations</p>
            <button className="add-first-anim" onClick={handleAddAnim}>
              + Add First Animation
            </button>
          </div>
        ) : (
          animations.map(anim => (
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
      {isDialogOpen && (
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
