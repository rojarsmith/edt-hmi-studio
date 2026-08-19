import React, { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Animation, AnimationType, AnimationEasing } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import { componentsById } from '../../utils/animationAssets';
import { animationValueMode, supportsOffset } from '../../utils/animationValues';
import {
  animationNameBase,
  isAnimationNameTaken,
  nextAnimationName,
} from '../../utils/animationNames';
import './AnimationPanel.css';

interface AnimationEditDialogProps {
  animation: Animation | null;
  isCreating: boolean;
  targetComponentId: string;
  onSave: (animation: Animation) => void;
  onClose: () => void;
}

const ANIMATION_TYPES: { type: AnimationType; label: string }[] = [
  { type: 'fade_in', label: 'Fade In' },
  { type: 'fade_out', label: 'Fade Out' },
  { type: 'slide_left', label: 'Slide In from Left' },
  { type: 'slide_right', label: 'Slide In from Right' },
  { type: 'slide_up', label: 'Slide In from Bottom' },
  { type: 'slide_down', label: 'Slide In from Top' },
  { type: 'zoom_in', label: 'Zoom In' },
  { type: 'zoom_out', label: 'Zoom Out' },
  { type: 'custom', label: 'Custom' },
];

const EASING_OPTIONS: { type: AnimationEasing; label: string }[] = [
  { type: 'linear', label: 'Linear' },
  { type: 'ease_in', label: 'Ease In' },
  { type: 'ease_out', label: 'Ease Out' },
  { type: 'ease_in_out', label: 'Ease In Out' },
  { type: 'overshoot', label: 'Overshoot' },
  { type: 'bounce', label: 'Bounce' },
];

const PROPERTY_OPTIONS = [
  { value: 'opa', label: 'Opacity (opa)' },
  { value: 'x', label: 'X Coordinate' },
  { value: 'y', label: 'Y Coordinate' },
  { value: 'width', label: 'Width' },
  { value: 'height', label: 'Height' },
  { value: 'transform_zoom', label: 'Zoom (transform_zoom)' },
  { value: 'transform_angle', label: 'Rotation Angle (transform_angle)' },
];

interface TypeDefaults {
  property: string;
  startValue: number;
  endValue: number;
  valueMode: 'absolute' | 'offset';
  distance: number;
}

function getDefaultsForType(type: AnimationType): TypeDefaults {
  const values = (property: string, startValue: number, endValue: number): TypeDefaults =>
    ({ property, startValue, endValue, valueMode: 'absolute', distance: 0 });
  // A slide is a journey rather than a pair of coordinates: park the component
  // where it should set off — outside the screen, for an entrance — and give
  // the distance it travels.
  const travel = (property: string, distance: number): TypeDefaults =>
    ({ property, startValue: 0, endValue: 0, valueMode: 'offset', distance });

  switch (type) {
    case 'fade_in': return values('opa', 0, 255);
    case 'fade_out': return values('opa', 255, 0);
    case 'slide_left': return travel('x', 100);
    case 'slide_right': return travel('x', -100);
    case 'slide_up': return travel('y', 100);
    case 'slide_down': return travel('y', -100);
    case 'zoom_in': return values('transform_zoom', 128, 256);
    case 'zoom_out': return values('transform_zoom', 256, 128);
    case 'custom': return values('opa', 0, 255);
  }
}

const AnimationEditDialog: React.FC<AnimationEditDialogProps> = ({
  animation,
  isCreating,
  targetComponentId,
  onSave,
  onClose,
}) => {
  const screens = useEditorStore(s => s.screens);
  const projectAnimations = useEditorStore(s => s.animations);
  // An animation names its target rather than living inside it, so the target
  // is picked here — and may be left unset, which shows as LACK in the panel.
  const [targetId, setTargetId] = useState(animation?.targetComponentId || targetComponentId || '');
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
  const [name, setName] = useState(animation?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [type, setType] = useState<AnimationType>(animation?.type || 'fade_in');
  const [easing, setEasing] = useState<AnimationEasing>(animation?.easing || 'ease_in_out');
  const [duration, setDuration] = useState(animation?.duration ?? 300);
  const [delay, setDelay] = useState(animation?.delay ?? 0);
  const [repeat, setRepeat] = useState(animation?.repeat ?? 0);
  const [property, setProperty] = useState(animation?.property || 'opa');
  const [startValue, setStartValue] = useState(animation?.startValue ?? 0);
  const [valueMode, setValueMode] = useState<'absolute' | 'offset'>(
    animation ? animationValueMode(animation) : 'absolute',
  );
  const [distance, setDistance] = useState(animation?.distance ?? 0);
  const [endValue, setEndValue] = useState(animation?.endValue ?? 255);

  // The name the animation takes if the field is left blank. Shown as the
  // placeholder so the default is never a surprise.
  const suggestedName = useMemo(
    () => nextAnimationName(projectAnimations, animationNameBase(type)),
    [projectAnimations, type],
  );

  const handleTypeChange = useCallback((newType: AnimationType) => {
    setType(newType);
    if (newType !== 'custom') {
      const defaults = getDefaultsForType(newType);
      setProperty(defaults.property);
      setStartValue(defaults.startValue);
      setEndValue(defaults.endValue);
      setValueMode(defaults.valueMode);
      setDistance(defaults.distance);
    }
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
    const anim: Animation = {
      id: animation?.id || uuidv4(),
      name: chosen,
      targetComponentId: targetId,
      type,
      easing,
      duration,
      delay,
      repeat,
      property,
      startValue,
      valueMode: supportsOffset(property) ? valueMode : 'absolute',
      distance,
      endValue,
    };
    onSave(anim);
  }, [animation, name, suggestedName, projectAnimations, targetId, type, easing, duration, delay, repeat, property, valueMode, distance, startValue, endValue, onSave]);

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
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
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
            <label className="section-label">Animation Type</label>
            <select value={type} onChange={(e) => handleTypeChange(e.target.value as AnimationType)}>
              {ANIMATION_TYPES.map(t => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <label className="section-label">Easing</label>
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
            <label className="section-label">Animated Property</label>
            <select value={property} onChange={(e) => setProperty(e.target.value)}>
              {PROPERTY_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {supportsOffset(property) && (
            <div className="form-section">
              <label className="section-label">Values Are</label>
              <div className="anim-mode-switch">
                {(['offset', 'absolute'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    className={`anim-mode-btn ${valueMode === mode ? 'active' : ''}`}
                    onClick={() => setValueMode(mode)}
                  >
                    {mode === 'offset' ? 'Offset' : 'Absolute'}
                  </button>
                ))}
              </div>
              <p className="field-hint">
                {valueMode === 'offset'
                  ? 'One distance, travelled from wherever the component is when this runs — not necessarily where it was designed.'
                  : 'Two coordinates on the screen, whatever the component position is.'}
              </p>
            </div>
          )}

          {supportsOffset(property) && valueMode === 'offset' ? (
            <div className="form-section">
              <label
                className="section-label"
                title="How far to travel, in pixels. Negative moves left or up."
              >
                Distance (px)
              </label>
              <input
                type="number"
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
              />
              <p className="field-hint">
                Park the component where the movement should begin — outside the
                screen for a slide-in — and travel from there.
              </p>
            </div>
          ) : (
            <div className="form-row">
              <div className="form-section">
                <label className="section-label">Start Value</label>
                <input type="number" value={startValue} onChange={(e) => setStartValue(Number(e.target.value))} />
              </div>
              <div className="form-section">
                <label className="section-label">End Value</label>
                <input type="number" value={endValue} onChange={(e) => setEndValue(Number(e.target.value))} />
              </div>
            </div>
          )}
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
