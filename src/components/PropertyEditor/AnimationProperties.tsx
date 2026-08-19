// The property editor's animation face.
//
// An animation used to be edited in a popup, which meant the manager could
// only list it and every change was a modal round trip. It is edited here now,
// beside components and screens, so one panel answers "what am I looking at".

import React, { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Animation, AnimationEasing, AnimationTrack } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import { componentsById } from '../../utils/animationAssets';
import { animationTracks, newTrack } from '../../utils/animationTracks';
import { supportsOffset, trackValueMode } from '../../utils/animationValues';
import { isAnimationNameTaken } from '../../utils/animationNames';

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
const PRESETS: { label: string; track: () => AnimationTrack }[] = [
  { label: 'Slide in from left', track: () => ({ id: uuidv4(), property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 }) },
  { label: 'Slide in from right', track: () => ({ id: uuidv4(), property: 'x', valueMode: 'offset', startValue: 0, endValue: 0, distance: -100 }) },
  { label: 'Slide in from top', track: () => ({ id: uuidv4(), property: 'y', valueMode: 'offset', startValue: 0, endValue: 0, distance: 100 }) },
  { label: 'Slide in from bottom', track: () => ({ id: uuidv4(), property: 'y', valueMode: 'offset', startValue: 0, endValue: 0, distance: -100 }) },
  { label: 'Fade in', track: () => ({ id: uuidv4(), property: 'opa', valueMode: 'absolute', startValue: 0, endValue: 255 }) },
  { label: 'Fade out', track: () => ({ id: uuidv4(), property: 'opa', valueMode: 'absolute', startValue: 255, endValue: 0 }) },
  { label: 'Zoom in', track: () => ({ id: uuidv4(), property: 'transform_zoom', valueMode: 'absolute', startValue: 128, endValue: 256 }) },
];

const AnimationProperties: React.FC<{
  animation: Animation;
  /** The panel's search box, which sits directly below the pinned block. */
  searchBox: React.ReactNode;
}> = ({ animation, searchBox }) => {
  const screens = useEditorStore(s => s.screens);
  const animations = useEditorStore(s => s.animations);
  const updateAnimation = useEditorStore(s => s.updateAnimation);

  const components = useMemo(() => componentsById(screens), [screens]);
  const tracks = animationTracks(animation);

  const targets = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    for (const screen of screens) {
      const visit = (list: typeof screen.components) => {
        for (const component of list) {
          rows.push({ id: component.id, label: `${screen.name} / ${component.name}` });
          visit(component.children);
        }
      };
      visit(screen.components);
    }
    return rows;
  }, [screens]);

  const setTracks = useCallback((next: AnimationTrack[]) => {
    updateAnimation(animation.id, { tracks: next });
  }, [animation.id, updateAnimation]);

  const updateTrack = useCallback((id: string, updates: Partial<AnimationTrack>) => {
    setTracks(tracks.map(track => (track.id === id ? { ...track, ...updates } : track)));
  }, [setTracks, tracks]);

  // A rename lands on the store only when it is committed, so the field is
  // uncontrolled and keyed on the current name.
  const commitName = (input: HTMLInputElement) => {
    const name = input.value.trim();
    if (!name || name === animation.name) {
      input.value = animation.name;
      return;
    }
    if (isAnimationNameTaken(animations, name, animation.id)) {
      input.value = animation.name;
      return;
    }
    updateAnimation(animation.id, { name });
  };

  return (
    <>
      {/* Animation Info — pinned above the search box, never filtered or folded */}
      <div className="property-section" data-pe-pinned="true">
        <div className="section-header">Animation</div>
        <div className="property-row">
          <label>Id</label>
          <input
            key={`${animation.id}:${animation.name}`}
            type="text"
            defaultValue={animation.name}
            aria-label="Animation Id"
            onBlur={(e) => commitName(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName(e.currentTarget);
              else if (e.key === 'Escape') e.currentTarget.value = animation.name;
            }}
          />
        </div>
        <div className="property-row">
          <label>Type</label>
          <div className="property-value readonly">
            <span className="component-type-icon">🎞️</span>
            Animation
          </div>
        </div>
      </div>

      {searchBox}

      <div className="property-section">
        <div className="section-header">Target</div>
        <div className="property-row">
          <label>Widget</label>
          <select
            value={animation.targetComponentId}
            aria-label="Target"
            onChange={(e) => updateAnimation(animation.id, { targetComponentId: e.target.value })}
          >
            <option value="">No target yet</option>
            {targets.map(target => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
          </select>
        </div>
        {!components.has(animation.targetComponentId) && (
          <p className="field-hint">
            Without a target this animation drives nothing and generates no code.
          </p>
        )}
      </div>

      <div className="property-section">
        <div className="section-header">Timing</div>
        <div className="property-row">
          <label title="Applies to every property below — they move together on one clock.">
            Easing
          </label>
          <select
            value={animation.easing}
            aria-label="Easing"
            onChange={(e) => updateAnimation(animation.id, { easing: e.target.value as AnimationEasing })}
          >
            {EASING_OPTIONS.map(option => (
              <option key={option.type} value={option.type}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="property-row">
          <label title="How long the movement itself takes, once it has started.">
            Duration
          </label>
          <input
            type="number"
            min={0}
            value={animation.duration}
            aria-label="Duration"
            onChange={(e) => updateAnimation(animation.id, { duration: Number(e.target.value) })}
          />
        </div>
        <div className="property-row">
          <label title="How long to wait after the animation is triggered before it starts moving. The widget stays where it is for this long.">
            Delay
          </label>
          <input
            type="number"
            min={0}
            value={animation.delay}
            aria-label="Delay"
            onChange={(e) => updateAnimation(animation.id, { delay: Number(e.target.value) })}
          />
        </div>
        <div className="property-row">
          <label title="0 plays it once.">Repeat</label>
          <input
            type="number"
            min={0}
            value={animation.repeat}
            aria-label="Repeat"
            onChange={(e) => updateAnimation(animation.id, { repeat: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="property-section">
        <div className="section-header">Animated Properties</div>

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
                    // Carrying an offset onto a property with nowhere to travel
                    // from would keep a distance nothing can use.
                    updateTrack(track.id, supportsOffset(property)
                      ? { property }
                      : { property, valueMode: 'absolute' });
                  }}
                >
                  {PROPERTY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="anim-track-remove"
                  aria-label={`Remove ${track.property}`}
                  title="Remove this property"
                  onClick={() => setTracks(tracks.filter(t => t.id !== track.id))}
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
                <div className="property-row">
                  <label title="How far to travel, in pixels. Negative moves left or up.">
                    Distance
                  </label>
                  <input
                    type="number"
                    value={track.distance ?? 0}
                    aria-label="Distance"
                    onChange={(e) => updateTrack(track.id, { distance: Number(e.target.value) })}
                  />
                </div>
              ) : (
                <div className="property-row two-col">
                  <div className="property-field">
                    <label>Start</label>
                    <input
                      type="number"
                      value={track.startValue}
                      aria-label="Start Value"
                      onChange={(e) => updateTrack(track.id, { startValue: Number(e.target.value) })}
                    />
                  </div>
                  <div className="property-field">
                    <label>End</label>
                    <input
                      type="number"
                      value={track.endValue}
                      aria-label="End Value"
                      onChange={(e) => updateTrack(track.id, { endValue: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        <button
          type="button"
          className="anim-track-add"
          title="Drive another property with this same animation"
          onClick={() => setTracks([...tracks, newTrack(uuidv4(), 'opa')])}
        >
          ＋ Property
        </button>
      </div>

      <div className="property-section">
        <div className="section-header">Presets</div>
        <div className="anim-presets">
          {PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              className="anim-preset-btn"
              onClick={() => setTracks([...tracks, preset.track()])}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="field-hint">
          A preset adds properties to the list above; it is not remembered as a
          setting of its own.
        </p>
      </div>

    </>
  );
};

export default AnimationProperties;
