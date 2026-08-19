import React, { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useEditorStore } from '../../store/editorStore';
import PanelChevron from '../LogicEditor/PanelChevron';
import LackBadge from '../common/LackBadge';
import { animationLack, componentsById } from '../../utils/animationAssets';
import { describeTracks, newTrack } from '../../utils/animationTracks';
import { isAnimationNameTaken } from '../../utils/animationNames';
import { useDockedPanelResize } from '../../hooks/useDockedPanelResize';
import '../panelBar.css';
import './AnimationPanel.css';

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
  const selectedAnimationId = useEditorStore(s => s.selectedAnimationId);
  const selectAnimation = useEditorStore(s => s.selectAnimation);
  /** The animation being named in place, and the text so far. */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
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
        describeTracks(anim).toLowerCase().includes(q),
    );
  }, [animations, query]);

  // A new animation exists immediately, named in the list and then edited in
  // the property panel — no modal round trip to get either done.
  const handleAddAnim = useCallback(() => {
    const id = addAnimation({
      targetComponentId: '',
      easing: 'ease_out',
      duration: 300,
      delay: 0,
      repeat: 0,
      tracks: [newTrack(uuidv4(), 'x')],
    });
    selectAnimation(id);
    const created = useEditorStore.getState().animations.find(a => a.id === id);
    if (created) setRenaming({ id, value: created.name });
  }, [addAnimation, selectAnimation]);

  const commitRename = useCallback(() => {
    if (!renaming) return;
    const name = renaming.value.trim();
    const clashes = name && isAnimationNameTaken(animations, name, renaming.id);
    if (name && !clashes) updateAnimation(renaming.id, { name });
    setRenaming(null);
  }, [renaming, animations, updateAnimation]);

  const handleDeleteAnim = useCallback((animId: string) => {
    deleteAnimation(animId);
  }, [deleteAnimation]);

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
                <div
                  key={anim.id}
                  className={`anim-item ${selectedAnimationId === anim.id ? 'selected' : ''}`}
                  onClick={() => selectAnimation(anim.id)}
                  onDoubleClick={() => setRenaming({ id: anim.id, value: anim.name })}
                  title={anim.name}
                >
                  <div className="anim-info">
                    <div className="anim-type">
                      <span className="anim-icon">🎞️</span>
                      {renaming?.id === anim.id ? (
                        <input
                          type="text"
                          className="anim-rename-input"
                          value={renaming.value}
                          aria-label="Animation name"
                          autoFocus
                          onChange={e => setRenaming({ id: anim.id, value: e.target.value })}
                          onBlur={commitRename}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename();
                            else if (e.key === 'Escape') setRenaming(null);
                          }}
                        />
                      ) : (
                        anim.name
                      )}
                      {animationLack(anim, components) && (
                        <LackBadge reason={animationLack(anim, components)!} />
                      )}
                    </div>
                    <div className="anim-detail">
                      {components.get(anim.targetComponentId)?.name ?? 'no target'}
                      {' · '}
                      {anim.duration}ms · {describeTracks(anim)}
                    </div>
                  </div>
                  <div className="anim-actions">
                    <button
                      className="anim-delete-btn"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteAnim(anim.id);
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
      )}

    </div>
  );
};

export default AnimationPanel;
