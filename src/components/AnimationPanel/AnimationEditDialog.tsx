import React, { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Animation, AnimationType, AnimationEasing } from '../../types';
import { useEditorStore } from '../../store/editorStore';
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

function getDefaultsForType(type: AnimationType): { property: string; startValue: number; endValue: number } {
  switch (type) {
    case 'fade_in': return { property: 'opa', startValue: 0, endValue: 255 };
    case 'fade_out': return { property: 'opa', startValue: 255, endValue: 0 };
    case 'slide_left': return { property: 'x', startValue: -100, endValue: 0 };
    case 'slide_right': return { property: 'x', startValue: 100, endValue: 0 };
    case 'slide_up': return { property: 'y', startValue: -100, endValue: 0 };
    case 'slide_down': return { property: 'y', startValue: 100, endValue: 0 };
    case 'zoom_in': return { property: 'transform_zoom', startValue: 128, endValue: 256 };
    case 'zoom_out': return { property: 'transform_zoom', startValue: 256, endValue: 128 };
    case 'custom': return { property: 'opa', startValue: 0, endValue: 255 };
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
  const [name, setName] = useState(animation?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [type, setType] = useState<AnimationType>(animation?.type || 'fade_in');
  const [easing, setEasing] = useState<AnimationEasing>(animation?.easing || 'ease_in_out');
  const [duration, setDuration] = useState(animation?.duration ?? 300);
  const [delay, setDelay] = useState(animation?.delay ?? 0);
  const [repeat, setRepeat] = useState(animation?.repeat ?? 0);
  const [property, setProperty] = useState(animation?.property || 'opa');
  const [startValue, setStartValue] = useState(animation?.startValue ?? 0);
  const [endValue, setEndValue] = useState(animation?.endValue ?? 255);

  // The name the animation takes if the field is left blank. Shown as the
  // placeholder so the default is never a surprise.
  const suggestedName = useMemo(
    () => nextAnimationName(screens, animationNameBase(type)),
    [screens, type],
  );

  const handleTypeChange = useCallback((newType: AnimationType) => {
    setType(newType);
    if (newType !== 'custom') {
      const defaults = getDefaultsForType(newType);
      setProperty(defaults.property);
      setStartValue(defaults.startValue);
      setEndValue(defaults.endValue);
    }
  }, []);

  const handleSave = useCallback(() => {
    // The name becomes the generated C function's name, so it has to be unique
    // across the whole project rather than within this component: a button
    // wired to ui_anim_fade_in_1_start() must have exactly one animation to
    // mean.
    const chosen = name.trim() || suggestedName;
    if (isAnimationNameTaken(screens, chosen, animation?.id)) {
      setNameError(`An animation named "${chosen}" already exists.`);
      return;
    }
    const anim: Animation = {
      id: animation?.id || uuidv4(),
      name: chosen,
      targetComponentId,
      type,
      easing,
      duration,
      delay,
      repeat,
      property,
      startValue,
      endValue,
    };
    onSave(anim);
  }, [animation, name, suggestedName, screens, targetComponentId, type, easing, duration, delay, repeat, property, startValue, endValue, onSave]);

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
              <label className="section-label">Duration (ms)</label>
              <input type="number" value={duration} min={0} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="form-section">
              <label className="section-label">Delay (ms)</label>
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
