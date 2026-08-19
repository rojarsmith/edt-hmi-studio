import React, { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Animation, AnimationEasing, AnimationTrack } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import { componentsById } from '../../utils/animationAssets';
import { animationTracks, newTrack } from '../../utils/animationTracks';
import { supportsOffset, trackValueMode } from '../../utils/animationValues';
import { isAnimationNameTaken, nextAnimationName } from '../../utils/animationNames';
import './AnimationPanel.css';

interface AnimationEditDialogProps {
  animation: Animation | null;
  isCreating: boolean;
  targetComponentId: string;
  onSave: (animation: Animation) => void;
  onClose: () => void;
}

const EASING_OPTIONS: { type: AnimationEasing; label: string }[] = [
  { type: 'linear', label: 'Linear' },
  { type: 'ease_in', label: 'Ease In' },
  { type: 'ease_out', label: 'Ease Out' },
  { type: 'ease_in_out', label: 'Ease In Out' },
  { type: 'overshoot', label: 'Overshoot' },
  { type: 'bounce', label: 'Bounce' },
];

const PROPERTY_OPTIONS = [
  { value: 'x', label: 'X Coordinate' },
  { value: 'y', label: 'Y Coordinate' },
  { value: 'opa', label: 'Opacity (opa)' },
  { value: 'width', label: 'Width' },
  { value: 'height', label: 'Height' },
  { value: 'transform_zoom', label: 'Zoom (transform_zoom)' },
  { value: 'transform_angle', label: 'Rotation Angle (transform_angle)' },
];

/**
 * Ready-made journeys, kept as buttons rather than as a field on the
 * animation. A preset used to be an Animation Type stored beside the property
 * it duplicated, free to contradict it — "Slide In from Left" on an opacity
 * animation. It adds tracks now and is forgotten.
 */
const PRESETS: { label: string; tracks: (id: () => string) => AnimationTrack[] }[] = [
  {
    label: 'Slide in from left',
    tracks: (id) => [{ id: id(), property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 }],
  },
  {
    label: 'Slide in from right',
    tracks: (id) => [{ id: id(), property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: -100 }],
  },
  {
    label: 'Slide in from top',
    tracks: (id) => [{ id: id(), property: 'y', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 }],
  },
  {
    label: 'Slide in from bottom',
    tracks: (id) => [{ id: id(), property: 'y', valueMode: 'offset', startValue: 0, endValue: 0, distance: -100 }],
  },
  {
    label: 'Fade in',
    tracks: (id) => [{ id: id(), property: 'opa', valueMode: 'absolute', startValue: 0, endValue: 255 }],
  },
  {
    label: 'Fade out',
    tracks: (id) => [{ id: id(), property: 'opa', valueMode: 'absolute', startValue: 255, endValue: 0 }],
  },
  {
    label: 'Zoom in',
    tracks: (id) => [{ id: id(), property: 'transform_zoom', valueMode: 'absolute', startValue: 128, endValue: 256 }],
  },
];

const AnimationEditDialog: React.FC<AnimationEditDialogProps> = ({
  animation,
  isCreating,
  targetComponentId,
  onSave,
  onClose,
}) => {
  const screens = useEditorStore(s => s.screens);
  const projectAnimations = useEditorStore(s => s.animations);
  const [name, setName] = useState(animation?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);
  // An animation names its target rather than living inside it, so the target
  // is picked here — and may be left unset, which shows as LACK in the panel.
  const [targetId, setTargetId] = useState(animation?.targetComponentId || targetComponentId || '');
  const [easing, setEasing] = useState<AnimationEasing>(animation?.easing || 'ease_out');
  const [duration, setDuration] = useState(animation?.duration ?? 300);
  const [delay, setDelay] = useState(animation?.delay ?? 0);
  const [repeat, setRepeat] = useState(animation?.repeat ?? 0);
  // What moves. An animation may drive several properties at once, on one
  // shared clock — sliding in while fading up is one animation, not two that
  // have to be kept in step by hand.
  const [tracks, setTracks] = useState<AnimationTrack[]>(
    () => (animation ? animationTracks(animation) : [newTrack(uuidv4(), 'x')]),
  );

  const targets = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    for (const screen of screens) {
      const visit = (components: typeof screen.components) => {
        for (const component of components) {
          rows.push({ id: component.id, label: `${screen.name} / ${component.name}` });
          visit(component.children);
        }
      };
      visit(screen.components);
    }
    return rows;
  }, [screens]);

  // The name the animation takes if the field is left blank. Shown as the
  // placeholder so the default is never a surprise.
  const suggestedName = useMemo(
    () => nextAnimationName(projectAnimations, 'Anim'),
    [projectAnimations],
  );

  const updateTrack = useCallback((id: string, updates: Partial<AnimationTrack>) => {
    setTracks(previous => previous.map(track => (track.id === id ? { ...track, ...updates } : track)));
  }, []);

  const handleSave = useCallback(() => {
    // The name becomes the generated C function's name, so it has to be unique
    // across the whole project rather than within this component: a button
    // wired to ui_anim_fade_in_1_start() must have exactly one animation to
    // mean.
    const chosen = name.trim() || suggestedName;
    if (isAnimationNameTaken(projectAnimations, chosen, animation?.id)) {
      setNameError(`An animation named "${chosen}" already exists.`);
      return;
    }
    onSave({
      id: animation?.id || uuidv4(),
      name: chosen,
      targetComponentId: targetId,
      easing,
      duration,
      delay,
      repeat,
      tracks,
    });
  }, [animation, name, suggestedName, projectAnimations, targetId, easing, duration, delay, repeat, tracks, onSave]);

  return (
    <div className="anim-dialog-overlay" onClick={onClose}>
      <div className="anim-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{isCreating ? 'Add Animation' : 'Edit Animation'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="dialog-content">
          <div className="form-section">
            <label className="section-label">Animation Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              placeholder={`Optional; leave blank for ${suggestedName}`}
              aria-label="Animation Name"
            />
            {nameError && <p className="field-error">{nameError}</p>}
          </div>

          <div className="form-section">
            <label className="section-label">Target</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-label="Target">
              <option value="">No target yet</option>
              {targets.map(target => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
            {!componentsById(screens).has(targetId) && (
              <p className="field-hint">
                Without a target this animation drives nothing and generates no code.
              </p>
            )}
          </div>

          <div className="form-section">
            <label
              className="section-label"
              title="Applies to every property below — they move together on one clock."
            >
              Easing
            </label>
            <select value={easing} onChange={(e) => setEasing(e.target.value as AnimationEasing)}>
              {EASING_OPTIONS.map(e => (
                <option key={e.type} value={e.type}>{e.label}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-section">
              <label
                className="section-label"
                title="How long the movement itself takes, once it has started."
              >
                Duration (ms)
              </label>
              <input type="number" value={duration} min={0} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="form-section">
              <label
                className="section-label"
                title="How long to wait after the animation is triggered before it starts moving. The widget stays where it is for this long."
              >
                Delay (ms)
              </label>
              <input type="number" value={delay} min={0} onChange={(e) => setDelay(Number(e.target.value))} />
            </div>
            <div className="form-section">
              <label className="section-label">Repeat Count</label>
              <input type="number" value={repeat} min={0} onChange={(e) => setRepeat(Number(e.target.value))} />
              <p className="field-hint">0 = no repeat</p>
            </div>
          </div>

          <div className="form-section">
            <div className="anim-tracks-header">
              <label className="section-label">Animated Properties</label>
              <button
                type="button"
                className="anim-track-add"
                onClick={() => setTracks(previous => [...previous, newTrack(uuidv4(), 'opa')])}
                title="Drive another property with this same animation"
              >
                ＋ Property
              </button>
            </div>

            {tracks.length === 0 ? (
              <p className="field-hint">
                This animation drives nothing yet. Add a property, or pick a preset below.
              </p>
            ) : (
              tracks.map(track => (
                <div key={track.id} className="anim-track">
                  <div className="anim-track-top">
                    <select
                      value={track.property}
                      aria-label="Animated Property"
                      onChange={(e) => {
                        const property = e.target.value;
                        // Carrying an offset onto a property with nowhere to
                        // travel from would keep a distance nothing can use.
                        updateTrack(track.id, supportsOffset(property)
                          ? { property }
                          : { property, valueMode: 'absolute' });
                      }}
                    >
                      {PROPERTY_OPTIONS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="anim-track-remove"
                      onClick={() => setTracks(previous => previous.filter(t => t.id !== track.id))}
                      title="Remove this property"
                      aria-label={`Remove ${track.property}`}
                    >
                      🗑
                    </button>
                  </div>

                  {supportsOffset(track.property) && (
                    <div className="anim-mode-switch">
                      {(['offset', 'absolute'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          className={`anim-mode-btn ${trackValueMode(track) === mode ? 'active' : ''}`}
                          onClick={() => updateTrack(track.id, { valueMode: mode })}
                        >
                          {mode === 'offset' ? 'Offset' : 'Absolute'}
                        </button>
                      ))}
                    </div>
                  )}

                  {trackValueMode(track) === 'offset' && supportsOffset(track.property) ? (
                    <div className="form-section">
                      <label
                        className="section-label"
                        title="How far to travel, in pixels. Negative moves left or up."
                      >
                        Distance (px)
                      </label>
                      <input
                        type="number"
                        value={track.distance ?? 0}
                        onChange={(e) => updateTrack(track.id, { distance: Number(e.target.value) })}
                      />
                      <p className="field-hint">
                        Travelled from wherever the component is when this runs. Park
                        it where the movement should begin — outside the screen for a
                        slide-in.
                      </p>
                    </div>
                  ) : (
                    <div className="form-row">
                      <div className="form-section">
                        <label className="section-label">Start Value</label>
                        <input
                          type="number"
                          value={track.startValue}
                          onChange={(e) => updateTrack(track.id, { startValue: Number(e.target.value) })}
                        />
                      </div>
                      <div className="form-section">
                        <label className="section-label">End Value</label>
                        <input
                          type="number"
                          value={track.endValue}
                          onChange={(e) => updateTrack(track.id, { endValue: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="form-section">
            <label className="section-label">Presets</label>
            <div className="anim-presets">
              {PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  className="anim-preset-btn"
                  onClick={() => setTracks(previous => [...previous, ...preset.tracks(() => uuidv4())])}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="field-hint">
              A preset adds properties to the list above; it is not remembered as
              a setting of its own.
            </p>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default AnimationEditDialog;
