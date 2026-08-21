import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources/resourceStore';
import type {
  LvglComponent,
  Animation,
  EventBinding,
  ScreenTransition,
  ScreenTransitionDirection,
} from '../../types';
import { getEntryScreen } from '../../utils/entryScreen';
import {
  resolveScreenTransition,
  screenChangeFrame,
  type ScreenTransitionFields,
} from '../../utils/screenTransitions';
import { componentsById } from '../../utils/animationAssets';
import { trackPreviewValues } from '../../utils/animationValues';
import { animationTracks } from '../../utils/animationTracks';
import {
  isConvexPolygon,
  normalizePolygonPoints,
  pointsInPolygonBox,
  polygonBox,
} from '../../utils/polygonGeometry';
import {
  DEFAULT_LINE_WIDTH,
  normalizeLinePoints,
  pointsInBox,
} from '../../utils/lineGeometry';
import {
  DEFAULT_END_ANGLE,
  DEFAULT_START_ANGLE,
  sectorPath,
} from '../../utils/circleGeometry';
import {
  getImageButtonState,
  getNextImageButtonStateIndex,
  normalizeImageButtonProps,
} from '../PropertyEditor/imageButtonModel';
import { partColor, partStyle } from '../../utils/widgetParts';
import './PreviewPanel.css';

// Image cache to avoid reloading images
const imageCache = new Map<string, HTMLImageElement>();

// Easing functions
function easingLinear(t: number): number { return t; }
function easingEaseIn(t: number): number { return t * t; }
function easingEaseOut(t: number): number { return t * (2 - t); }
function easingEaseInOut(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function easingOvershoot(t: number): number { const s = 1.70158; return t * t * ((s + 1) * t - s); }
function easingBounce(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { const t2 = t - 1.5 / 2.75; return 7.5625 * t2 * t2 + 0.75; }
  if (t < 2.5 / 2.75) { const t2 = t - 2.25 / 2.75; return 7.5625 * t2 * t2 + 0.9375; }
  const t2 = t - 2.625 / 2.75; return 7.5625 * t2 * t2 + 0.984375;
}

function getEasingFn(easing: string): (t: number) => number {
  switch (easing) {
    case 'ease_in': return easingEaseIn;
    case 'ease_out': return easingEaseOut;
    case 'ease_in_out': return easingEaseInOut;
    case 'overshoot': return easingOvershoot;
    case 'bounce': return easingBounce;
    default: return easingLinear;
  }
}

interface AnimState {
  compId: string;
  anim: Animation;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

/** The project animations whose target sits on the given components. */
function animationsOn(
  comps: LvglComponent[],
  animations: Animation[],
): { compId: string; anim: Animation }[] {
  const onScreen = new Set<string>();
  const visit = (list: LvglComponent[]) => {
    for (const comp of list) {
      onScreen.add(comp.id);
      visit(comp.children);
    }
  };
  visit(comps);
  return animations
    .filter((anim) => onScreen.has(anim.targetComponentId))
    .map((anim) => ({ compId: anim.targetComponentId, anim }));
}

function computeAnimState(
  anim: Animation,
  progress: number,
  component?: Pick<LvglComponent, 'x' | 'y'>,
): Partial<AnimState> {
  const easeFn = getEasingFn(anim.easing);
  const t = easeFn(Math.max(0, Math.min(1, progress)));
  const state: Partial<AnimState> = {};

  // Every track of the animation contributes, so sliding in while fading up
  // draws as one movement rather than two that have to be kept in step.
  for (const track of animationTracks(anim)) {
    const resolved = trackPreviewValues(track, component);
    const start = Number(resolved.startValue) || 0;
    const end = Number(resolved.endValue) || 0;
    const val = start + (end - start) * t;
    // x and y are drawn as a shift from the component's own position.
    const origin = component
      ? (track.property === 'x' ? component.x : track.property === 'y' ? component.y : 0)
      : 0;

    switch (track.property) {
      case 'x': state.offsetX = val - origin; break;
      case 'y': state.offsetY = val - origin; break;
      case 'opa': state.opacity = val / 255; break;
      case 'width': state.scaleX = val / 100; break;
      case 'height': state.scaleY = val / 100; break;
      // LVGL scale units: 256 is 1:1, which is what the editor stores.
      case 'transform_zoom': state.scaleX = val / 256; state.scaleY = val / 256; break;
    }
  }

  return state;
}

function collectInitialImageButtonStates(
  components: LvglComponent[],
  result = new Map<string, number>(),
): Map<string, number> {
  for (const component of components) {
    if (component.type === 'image-button') {
      const props = normalizeImageButtonProps(component.props);
      result.set(component.id, props.initialState);
    }
    collectInitialImageButtonStates(component.children, result);
  }
  return result;
}

/** A screen change being drawn, and how far through it is. */
interface ActiveScreenChange {
  fromScreenId: string;
  transition: ScreenTransition;
  direction: ScreenTransitionDirection;
  progress: number;
}

const PreviewPanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const { screens, currentScreenId, canvas, animations: projectAnimations } = useEditorStore();
  const { images } = useResourceStore();
  const [scale, setScale] = useState(1);
  const [hoveredComponent, setHoveredComponent] = useState<string | null>(null);
  // This panel simulates the device, so it boots where the firmware boots: the
  // entry screen, not whichever screen is being edited. From there the footer
  // buttons and in-preview navigation move around freely.
  const entryScreenId = getEntryScreen(screens)?.id ?? currentScreenId;
  const [previewPageId, setPreviewPageId] = useState<string>(entryScreenId);
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animPaused, setAnimPaused] = useState(false);
  const animStartRef = useRef<number>(0);
  /** The animations the current run covers — everything, or the one an event played. */
  const runningAnimsRef = useRef<{ compId: string; anim: Animation }[]>([]);
  const animPausedAtRef = useRef<number>(0);
  const [animStates, setAnimStates] = useState<Map<string, Partial<AnimState>>>(new Map());
  /**
   * A screen change being drawn, if one is. The ref shadows the state so the
   * click handler and the frame loop can read it without either of them being
   * rebuilt every frame.
   */
  const [screenChange, setScreenChange] = useState<ActiveScreenChange | null>(null);
  const screenChangeRef = useRef<ActiveScreenChange | null>(null);
  const changeFrameRef = useRef<number>(0);
  /**
   * Which animations of the current run have already announced themselves, so
   * one announces once however many frames it is still asked about.
   */
  const completedRef = useRef<Set<string>>(new Set());
  /**
   * What a binding does, held in a ref because the animation loop runs it and
   * it, in turn, can start the animation loop.
   */
  const runActionsRef = useRef<(bindings: EventBinding[]) => void>(() => {});
  const [imageButtonStateIndices, setImageButtonStateIndices] =
    useState<Map<string, number>>(new Map());

  // Re-boot when the entry screen moves. Adjusted during render behind a
  // previous-value guard rather than in an effect, so the preview never paints
  // a stale screen first.
  //
  // Playback ending used to re-boot too, which an animation that changes
  // screen as its last act would have had undone a frame later. Reset returns
  // to the entry screen itself, so nothing is lost by leaving a finished run
  // wherever it arrived.
  const [prevEntry, setPrevEntry] = useState(entryScreenId);
  if (prevEntry !== entryScreenId) {
    setPrevEntry(entryScreenId);
    setPreviewPageId(entryScreenId);
  }

  const previewPage = screens.find(p => p.id === previewPageId) || screens.find(p => p.id === entryScreenId);
  const components = useMemo(() => previewPage?.components || [], [previewPage?.components]);
  const bgColor = previewPage?.backgroundColor || '#ffffff';


  // Image buttons restart from their configured initial state whenever the
  // previewed components change — the same render-phase adjustment pattern.
  // The null start makes the first render populate the map too.
  const [prevComponents, setPrevComponents] = useState<LvglComponent[] | null>(null);
  if (prevComponents !== components) {
    setPrevComponents(components);
    setImageButtonStateIndices(collectInitialImageButtonStates(components));
  }

  // Load image from resource store or URL
  const loadImage = useCallback((src: string): HTMLImageElement | null => {
    // Check cache first
    if (imageCache.has(src)) {
      const cached = imageCache.get(src)!;
      if (cached.complete) {
        return cached;
      }
    }

    // Try to find in resource store by name or id
    let imageData: string | null = null;
    
    // Check if src is a resource ID or name
    const resource = images.find(img => img.id === src || img.name === src || img.cArrayName === src);
    if (resource) {
      imageData = resource.data;
    } else if (src.startsWith('data:') || src.startsWith('http')) {
      // Direct URL or data URL
      imageData = src;
    }

    if (!imageData) {
      return null;
    }

    // Create new image
    const img = new Image();
    img.src = imageData;
    imageCache.set(src, img);

    // Trigger re-render when image loads
    img.onload = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        // Force re-render
        setHoveredComponent(prev => prev);
      }
    };

    return img.complete ? img : null;
  }, [images]);

  // Animation playback
  const componentIndex = useMemo(() => componentsById(screens), [screens]);

  const runAnimations = useCallback((allAnims: { compId: string; anim: Animation }[]) => {
    if (allAnims.length === 0) return;
    runningAnimsRef.current = allAnims;
    completedRef.current = new Set();

    setAnimPlaying(true);
    setAnimPaused(false);
    animStartRef.current = performance.now();
    animPausedAtRef.current = 0;

    const maxEnd = Math.max(...allAnims.map(a => (a.anim.delay || 0) + (a.anim.duration || 300)));

    const tick = (now: number) => {
      const elapsed = now - animStartRef.current;
      const newStates = new Map<string, Partial<AnimState>>();

      for (const { compId, anim } of allAnims) {
        const delay = anim.delay || 0;
        const duration = anim.duration || 300;
        const localTime = elapsed - delay;

        if (localTime < 0) continue;

        let progress = Math.min(1, localTime / duration);

        // Handle repeat
        if (anim.repeat && anim.repeat > 1 && progress >= 1) {
          const totalDuration = duration * anim.repeat;
          const totalLocal = elapsed - delay;
          if (totalLocal < totalDuration) {
            progress = (totalLocal % duration) / duration;
          }
        }

        const state = computeAnimState(anim, progress, componentIndex.get(compId));
        const existing = newStates.get(compId) || {};
        newStates.set(compId, {
          offsetX: (existing.offsetX || 0) + (state.offsetX || 0),
          offsetY: (existing.offsetY || 0) + (state.offsetY || 0),
          scaleX: (existing.scaleX ?? 1) * (state.scaleX ?? 1),
          scaleY: (existing.scaleY ?? 1) * (state.scaleY ?? 1),
          opacity: Math.min(existing.opacity ?? 1, state.opacity ?? 1),
        });
      }

      setAnimStates(newStates);

      // Each animation announces itself on its own clock, not the run's: two
      // played together can be different lengths.
      const finished = allAnims.filter(({ anim }) => {
        const end = (anim.delay || 0) + (anim.duration || 300) * Math.max(1, anim.repeat || 1);
        if (elapsed < end || completedRef.current.has(anim.id)) return false;
        completedRef.current.add(anim.id);
        return (anim.events ?? []).length > 0;
      });

      if (elapsed < maxEnd * (Math.max(...allAnims.map(a => a.anim.repeat || 1)))) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setAnimPlaying(false);
        setAnimStates(new Map());
      }

      // Last, so a binding that starts another run replaces the frame just
      // scheduled rather than racing it.
      for (const { anim } of finished) {
        runActionsRef.current(anim.events ?? []);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [componentIndex]);

  /** What a screen plays once it has finished appearing, in binding order. */
  const loadAnimationsOf = useCallback((screenId: string) => {
    const target = screens.find(screen => screen.id === screenId);
    return (target?.events ?? [])
      .filter(event => event.eventType === 'LV_EVENT_SCREEN_LOADED'
        && event.action?.type === 'playAnimation')
      .map(event => projectAnimations.find(a => a.id === event.action?.animationId))
      .filter((animation): animation is Animation => !!animation)
      .map(animation => ({ compId: animation.targetComponentId, anim: animation }));
  }, [screens, projectAnimations]);

  /**
   * Show a screen, playing whatever it plays on load — the same thing the
   * firmware does when lv_scr_load_anim finishes.
   */
  const enterScreen = useCallback((screenId: string, action?: ScreenTransitionFields) => {
    const from = previewPageId;
    setPreviewPageId(screenId);

    const play = () => {
      const played = loadAnimationsOf(screenId);
      if (played.length === 0) return;
      cancelAnimationFrame(animFrameRef.current);
      runAnimations(played);
    };

    const { transition, direction, duration } = resolveScreenTransition(action);
    // A jump with no navigation behind it - the footer's screen buttons - has
    // no transition to draw, and neither has an instant one.
    const drawn = !!action
      && transition !== 'none'
      && duration > 0
      && from !== screenId
      && screens.some(screen => screen.id === from);
    if (!drawn) {
      setScreenChange(null);
      screenChangeRef.current = null;
      play();
      return;
    }

    cancelAnimationFrame(changeFrameRef.current);
    const startedAt = performance.now();
    const change: ActiveScreenChange = { fromScreenId: from, transition, direction, progress: 0 };
    screenChangeRef.current = change;
    setScreenChange(change);

    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      if (progress < 1) {
        const next = { ...change, progress };
        screenChangeRef.current = next;
        setScreenChange(next);
        changeFrameRef.current = requestAnimationFrame(step);
        return;
      }
      screenChangeRef.current = null;
      setScreenChange(null);
      // The firmware starts these on LV_EVENT_SCREEN_LOADED, which LVGL sends
      // once the transition has finished - so an entry animation waits here
      // too, rather than running behind the change.
      play();
    };
    changeFrameRef.current = requestAnimationFrame(step);
  }, [previewPageId, screens, loadAnimationsOf, runAnimations]);

  /**
   * The toolbar's play button replays the current screen's entry. A screen
   * that binds nothing falls back to every animation aimed at it, so one kept
   * for a button is still previewable.
   */
  const startAnimation = useCallback(() => {
    const played = loadAnimationsOf(previewPageId);
    runAnimations(played.length > 0 ? played : animationsOn(components, projectAnimations));
  }, [components, previewPageId, loadAnimationsOf, projectAnimations, runAnimations]);

  const pauseAnimation = useCallback(() => {
    if (animPlaying && !animPaused) {
      cancelAnimationFrame(animFrameRef.current);
      animPausedAtRef.current = performance.now();
      setAnimPaused(true);
    }
  }, [animPlaying, animPaused]);

  const resumeAnimation = useCallback(() => {
    if (animPlaying && animPaused) {
      const pauseDuration = performance.now() - animPausedAtRef.current;
      animStartRef.current += pauseDuration;
      setAnimPaused(false);

      // Restart the tick loop
      const allAnims = runningAnimsRef.current;
      const maxEnd = Math.max(...allAnims.map(a => (a.anim.delay || 0) + (a.anim.duration || 300)));

      const tick = (now: number) => {
        const elapsed = now - animStartRef.current;
        const newStates = new Map<string, Partial<AnimState>>();

        for (const { compId, anim } of allAnims) {
          const delay = anim.delay || 0;
          const duration = anim.duration || 300;
          const localTime = elapsed - delay;
          if (localTime < 0) continue;
          let progress = Math.min(1, localTime / duration);
          if (anim.repeat && anim.repeat > 1 && progress >= 1) {
            const totalLocal = elapsed - delay;
            if (totalLocal < duration * anim.repeat) {
              progress = (totalLocal % duration) / duration;
            }
          }
          const state = computeAnimState(anim, progress, componentIndex.get(compId));
          const existing = newStates.get(compId) || {};
          newStates.set(compId, {
            offsetX: (existing.offsetX || 0) + (state.offsetX || 0),
            offsetY: (existing.offsetY || 0) + (state.offsetY || 0),
            scaleX: (existing.scaleX ?? 1) * (state.scaleX ?? 1),
            scaleY: (existing.scaleY ?? 1) * (state.scaleY ?? 1),
            opacity: Math.min(existing.opacity ?? 1, state.opacity ?? 1),
          });
        }
        setAnimStates(newStates);
        if (elapsed < maxEnd * (Math.max(...allAnims.map(a => a.anim.repeat || 1)))) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          setAnimPlaying(false);
          setAnimStates(new Map());
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [animPlaying, animPaused, componentIndex]);

  // Reset is a restart of the simulated device: animations and widget states
  // go back to their initial values, and the preview returns to the entry
  // screen however far navigation wandered from it.
  const resetAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setAnimPlaying(false);
    setAnimPaused(false);
    setAnimStates(new Map());
    setPreviewPageId(entryScreenId);
    setImageButtonStateIndices(collectInitialImageButtonStates(components));
  }, [components, entryScreenId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(changeFrameRef.current);
    };
  }, []);

  /**
   * Run a list of bindings, in the order the panel lists them - a widget's, or
   * an animation's now that one can say it has finished.
   */
  const runActions = useCallback((bindings: EventBinding[]) => {
    for (const ev of bindings) {
      if (ev.action?.type === 'playAnimation' && ev.action.animationId) {
        const target = animationsOn(components, projectAnimations)
          .find(entry => entry.anim.id === ev.action!.animationId);
        // An animation on another screen has nothing to move here.
        if (target) {
          cancelAnimationFrame(animFrameRef.current);
          runAnimations([target]);
        }
        continue;
      }
      if (ev.action?.type === 'stopAnimation') {
        // Stop leaves the widget where it reached, so the states stay put.
        cancelAnimationFrame(animFrameRef.current);
        setAnimPlaying(false);
        setAnimPaused(false);
        continue;
      }
      if (ev.action?.type === 'navigate') {
        // `targetPage` is the pre-rename spelling, still present in older
        // projects; every binding written since says `targetScreen`, which
        // this had stopped looking at.
        const wanted = ev.action.targetScreen ?? ev.action.targetPage;
        const targetPage = wanted
          ? screens.find(p => p.name === wanted || p.id === wanted)
          : undefined;
        if (targetPage) {
          enterScreen(targetPage.id, ev.action);
          return;
        }
      }
    }
  }, [components, screens, projectAnimations, runAnimations, enterScreen]);

  // The animation loop reaches it through this, which is what keeps the two
  // from having to be defined in terms of each other. Written in an effect
  // because a ref may not be touched during render.
  useEffect(() => {
    runActionsRef.current = runActions;
  }, [runActions]);

  // Handle click for navigation
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Mid-change the two screens are somewhere between where they were and
    // where they are going, so there is nothing sensible to hit.
    if (screenChangeRef.current) return;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const findAtPoint = (comps: LvglComponent[], ox = 0, oy = 0): LvglComponent | null => {
      for (let i = comps.length - 1; i >= 0; i--) {
        const comp = comps[i];
        const cx = comp.x + ox;
        const cy = comp.y + oy;
        if (x >= cx && x <= cx + comp.width && y >= cy && y <= cy + comp.height) {
          const child = findAtPoint(comp.children, cx, cy);
          return child || comp;
        }
      }
      return null;
    };

    const hit = findAtPoint(components);
    if (hit?.type === 'image-button') {
      const imageButton = normalizeImageButtonProps(hit.props);
      if (imageButton.cycleOnClick && imageButton.states.length > 0) {
        setImageButtonStateIndices((previous) => {
          const current = previous.get(hit.id) ?? imageButton.initialState;
          const next = new Map(previous);
          next.set(
            hit.id,
            getNextImageButtonStateIndex(imageButton.states, current),
          );
          return next;
        });
      }
    }
    if (hit && hit.events) runActions(hit.events);
  }, [components, scale, runActions]);

  // Render components to canvas
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // How opaque the screen being painted is as a whole, which is what Fade
    // animates. A widget's own opacity multiplies into it.
    let screenAlpha = 1;

    // Render each component
    const renderComponent = (comp: LvglComponent, offsetX = 0, offsetY = 0) => {
      let x = comp.x + offsetX;
      let y = comp.y + offsetY;
      let w = comp.width;
      let h = comp.height;
      const isHovered = hoveredComponent === comp.id;

      // Apply animation state
      const aState = animStates.get(comp.id);
      if (aState) {
        x += aState.offsetX || 0;
        y += aState.offsetY || 0;
        if (aState.scaleX !== undefined && aState.scaleX !== 1) {
          const newW = w * aState.scaleX;
          x += (w - newW) / 2;
          w = newW;
        }
        if (aState.scaleY !== undefined && aState.scaleY !== 1) {
          const newH = h * aState.scaleY;
          y += (h - newH) / 2;
          h = newH;
        }
      }
      const alpha = screenAlpha * (aState?.opacity ?? 1);
      if (alpha !== 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
      }

      // Get styles
      const styles = comp.styles.default;
      const bgColorStyle = styles.bgColor || '#e0e0e0';
      const borderColor = styles.borderColor || '#cccccc';
      // Nullish, not falsy: a widget that asks for no border or square corners
      // — which is every shape — means 0, and the canvas already honours it.
      const borderWidth = styles.borderWidth ?? 1;
      const borderRadius = styles.borderRadius ?? 4;
      const textColor = styles.textColor || '#333333';

      // --- Transform support ---
      const hasTransform = styles.transformAngle || styles.transformZoomX !== undefined || styles.transformZoomY !== undefined;
      if (hasTransform) {
        ctx.save();
        const cx = x + w / 2;
        const cy = y + h / 2;
        const pivotX = styles.transformPivotX !== undefined ? x + styles.transformPivotX : cx;
        const pivotY = styles.transformPivotY !== undefined ? y + styles.transformPivotY : cy;
        ctx.translate(pivotX, pivotY);
        if (styles.transformAngle) {
          // LVGL uses 0.1 degree units
          ctx.rotate((styles.transformAngle / 10) * Math.PI / 180);
        }
        if (styles.transformZoomX !== undefined || styles.transformZoomY !== undefined) {
          const sx = styles.transformZoomX !== undefined ? styles.transformZoomX / 256 : 1;
          const sy = styles.transformZoomY !== undefined ? styles.transformZoomY / 256 : 1;
          ctx.scale(sx, sy);
        }
        ctx.translate(-pivotX, -pivotY);
      }

      // --- Shadow support ---
      const hasShadow = styles.shadowWidth || styles.shadowOffsetX || styles.shadowOffsetY;
      if (hasShadow) {
        ctx.save();
        if (styles.shadowColor) {
          const hex = styles.shadowColor.replace('#', '');
          const sr = parseInt(hex.substring(0, 2), 16) || 0;
          const sg = parseInt(hex.substring(2, 4), 16) || 0;
          const sb = parseInt(hex.substring(4, 6), 16) || 0;
          const sa = styles.shadowOpacity !== undefined ? Math.max(0, Math.min(1, styles.shadowOpacity / 255)) : 1;
          ctx.shadowColor = `rgba(${sr},${sg},${sb},${sa})`;
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
        }
        ctx.shadowBlur = styles.shadowWidth || 0;
        ctx.shadowOffsetX = styles.shadowOffsetX || 0;
        ctx.shadowOffsetY = styles.shadowOffsetY || 0;
      }

      // --- Gradient helper ---
      const getGradientFill = (): string | CanvasGradient => {
        if (styles.bgGradDir && styles.bgGradDir !== 'none' && styles.bgGradColor) {
          const stop = styles.bgGradStop !== undefined ? styles.bgGradStop / 255 : 1;
          let grad: CanvasGradient;
          if (styles.bgGradDir === 'hor') {
            grad = ctx.createLinearGradient(x, y, x + w, y);
          } else {
            grad = ctx.createLinearGradient(x, y, x, y + h);
          }
          grad.addColorStop(0, bgColorStyle);
          grad.addColorStop(stop, styles.bgGradColor);
          return grad;
        }
        return bgColorStyle;
      };

      // Draw based on component type
      switch (comp.type) {
        case 'btn':
          drawButton(ctx, x, y, w, h, {
            bgColor: isHovered ? lightenColor(bgColorStyle, 20) : bgColorStyle,
            borderColor,
            borderWidth,
            borderRadius,
            text: comp.props.text || 'Button',
            textColor,
            gradientFill: isHovered ? undefined : getGradientFill(),
            textDecor: styles.textDecor,
            borderSide: styles.borderSide,
          });
          break;

        case 'label':
          drawLabel(ctx, x, y, w, h, {
            text: comp.props.text || 'Label',
            textColor,
            fontSize: comp.props.fontSize || 14,
            textDecor: styles.textDecor,
          });
          break;

        case 'slider':
          drawSlider(ctx, x, y, w, h, {
            value: comp.props.value || 50,
            min: comp.props.min || 0,
            max: comp.props.max || 100,
            bgColor: bgColorStyle,
            indicator: partColor(comp, 'indicator', '#2196f3'),
            knob: partColor(comp, 'knob', '#2196f3'),
          });
          break;

        case 'checkbox':
          drawCheckbox(ctx, x, y, w, h, {
            checked: comp.props.checked || false,
            text: comp.props.text || 'Checkbox',
            textColor,
            textDecor: styles.textDecor,
            indicator: partColor(comp, 'indicator', '#2196f3', 'checked'),
            indicatorBorder: partStyle(comp.styles, 'indicator', 'checked')?.borderColor ?? '#999',
          });
          break;

        case 'switch':
          drawSwitch(ctx, x, y, w, h, {
            checked: comp.props.checked || false,
            indicator: partColor(comp, 'indicator', '#4caf50', 'checked'),
            knob: partColor(comp, 'knob', '#fff'),
          });
          break;

        case 'bar':
          drawBar(ctx, x, y, w, h, {
            value: comp.props.value || 50,
            min: comp.props.min || 0,
            max: comp.props.max || 100,
            bgColor: bgColorStyle,
            indicator: partColor(comp, 'indicator', '#2196f3'),
          });
          break;

        case 'arc':
          drawArc(ctx, x, y, w, h, {
            value: comp.props.value || 75,
            min: comp.props.min || 0,
            max: comp.props.max || 100,
            bgColor: bgColorStyle,
            track: partColor(comp, 'main', '#e0e0e0'),
            indicator: partColor(comp, 'indicator', '#2196f3'),
          });
          break;

        case 'textarea':
          drawTextarea(ctx, x, y, w, h, {
            text: comp.props.text || '',
            placeholder: comp.props.placeholder || 'Enter text...',
            bgColor: bgColorStyle,
            borderColor,
            borderRadius,
            textColor,
            gradientFill: getGradientFill(),
          });
          break;

        case 'dropdown':
          drawDropdown(ctx, x, y, w, h, {
            options: comp.props.options || ['Option 1', 'Option 2', 'Option 3'],
            selected: comp.props.selected || 0,
            bgColor: bgColorStyle,
            borderColor,
            borderRadius,
            textColor,
            gradientFill: getGradientFill(),
          });
          break;

        case 'img':
          drawImage(ctx, x, y, w, h, {
            src: comp.props.src,
            loadImage,
          });
          break;

        case 'image-button': {
          const imageButton = normalizeImageButtonProps(comp.props);
          const activeIndex = imageButtonStateIndices.get(comp.id)
            ?? imageButton.initialState;
          const activeState = getImageButtonState(
            imageButton.states,
            activeIndex,
          );
          drawImage(ctx, x, y, w, h, {
            src: activeState?.imageId,
            loadImage,
          });
          if (isHovered) {
            ctx.save();
            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
            ctx.restore();
          }
          break;
        }

        case 'circle':
          drawCircle(ctx, x, y, w, h, {
            shape: comp.props.shape === 'sector' ? 'sector' : 'circle',
            startAngle: comp.props.startAngle ?? DEFAULT_START_ANGLE,
            endAngle: comp.props.endAngle ?? DEFAULT_END_ANGLE,
            thickness: comp.props.thickness ?? 0,
            bgColor: bgColorStyle,
            borderColor,
            borderWidth,
            gradientFill: getGradientFill(),
          });
          break;

        // A rectangle is the same box a panel draws: fill, gradient, border,
        // border side and corner radius, all straight from its styles.
        case 'rectangle':
        case 'obj':
        case 'panel':
        case 'container':
          drawPanel(ctx, x, y, w, h, {
            bgColor: bgColorStyle,
            borderColor,
            borderWidth,
            borderRadius,
            gradientFill: getGradientFill(),
            borderSide: styles.borderSide,
          });
          break;

        case 'line':
          drawLine(ctx, x, y, w, h, {
            points: comp.props.points,
            lineColor: comp.props.lineColor || styles.borderColor || '#333333',
            lineWidth: comp.props.lineWidth ?? DEFAULT_LINE_WIDTH,
            rounded: !!comp.props.lineRounded,
            dashWidth: comp.props.lineDashWidth || 0,
            dashGap: comp.props.lineDashGap || 0,
          });
          break;

        case 'polygon':
          drawPolygon(ctx, x, y, w, h, {
            points: comp.props.points,
            // The style background is the fill, the same one the panel draws.
            fill: bgColorStyle && bgColorStyle !== 'transparent' ? bgColorStyle : null,
            lineColor: comp.props.lineColor || styles.borderColor || '#333333',
            lineWidth: comp.props.lineWidth ?? DEFAULT_LINE_WIDTH,
            rounded: !!comp.props.lineRounded,
          });
          break;

        case 'video':
          drawVideo(ctx, x, y, w, h, {
            fileName: comp.props.fileName,
            autoPlay: comp.props.autoPlay !== false,
            loop: comp.props.loop !== false,
            bgColor: bgColorStyle,
            textColor,
          });
          break;

        case 'spinner':
          drawSpinner(ctx, x, y, w, h, {
            track: partColor(comp, 'main', '#e0e0e0'),
            indicator: partColor(comp, 'indicator', '#2196F3'),
          });
          break;

        case 'chart':
          drawChart(ctx, x, y, w, h, {
            type: comp.props.type || 'line',
            data: comp.props.data || [10, 20, 30, 25, 40],
            lineColor: comp.props.lineColor || '#2196F3',
            bgColor: bgColorStyle,
            borderColor,
            borderRadius,
            showGrid: comp.props.showGrid !== false,
          });
          break;

        case 'table':
          drawTable(ctx, x, y, w, h, {
            rows: comp.props.rows || 3,
            cols: comp.props.cols || 3,
            bgColor: bgColorStyle,
            borderColor,
            textColor,
          });
          break;

        case 'calendar':
          drawCalendar(ctx, x, y, w, h, {
            year: comp.props.year || new Date().getFullYear(),
            month: comp.props.month || 1,
            bgColor: bgColorStyle,
            borderColor,
            textColor,
          });
          break;

        case 'tabview':
          drawTabview(ctx, x, y, w, h, {
            tabs: comp.props.tabs || ['Tab 1', 'Tab 2'],
            activeTab: comp.props.activeTab || 0,
            bgColor: bgColorStyle,
            borderColor,
            textColor,
          });
          break;

        case 'tileview':
          drawTileview(ctx, x, y, w, h, {
            rows: comp.props.rows || 2,
            cols: comp.props.cols || 2,
            currentRow: comp.props.currentRow || 0,
            currentCol: comp.props.currentCol || 0,
            bgColor: bgColorStyle,
            borderColor,
          });
          break;

        case 'win':
          drawWindow(ctx, x, y, w, h, {
            title: comp.props.title || 'Window',
            bgColor: bgColorStyle,
            borderColor,
            borderRadius,
            textColor,
          });
          break;

        default:
          // Generic rectangle for unknown types
          drawGeneric(ctx, x, y, w, h, {
            bgColor: bgColorStyle,
            borderColor,
            borderWidth,
            borderRadius,
            label: comp.type,
          });
      }

      // Reset shadow after drawing the main shape
      if (hasShadow) {
        ctx.restore();
      }

      // --- Outline support (draw after shadow restore so outline isn't shadowed) ---
      if (styles.outlineWidth) {
        const olColor = styles.outlineColor || '#000';
        const olWidth = styles.outlineWidth;
        const olPad = styles.outlinePad || 0;
        ctx.strokeStyle = olColor;
        ctx.lineWidth = olWidth;
        roundRect(ctx, x - olPad - olWidth / 2, y - olPad - olWidth / 2, w + (olPad + olWidth / 2) * 2, h + (olPad + olWidth / 2) * 2, borderRadius + olPad);
        ctx.stroke();
      }

      // Render children (apply padding offset, filter by tab/tile)
      const padTop = styles.paddingTop ?? styles.padding ?? 0;
      const padLeft = styles.paddingLeft ?? styles.padding ?? 0;
      
      let visibleChildren = comp.children;
      const childOffsetX = x + padLeft;
      let childOffsetY = y + padTop;
      
      if (comp.type === 'tabview') {
        const tabChildMap: Record<string, string[]> = comp.props?.tabChildMap || {};
        const activeTab = String(comp.props?.activeTab || 0);
        const activeChildIds = tabChildMap[activeTab] || [];
        if (Object.keys(tabChildMap).length > 0) {
          visibleChildren = comp.children.filter(c => activeChildIds.includes(c.id));
        }
        // Offset for tab bar height
        childOffsetY = y + padTop + 30;
      } else if (comp.type === 'tileview') {
        const tileChildMap: Record<string, string[]> = comp.props?.tileChildMap || {};
        const activeKey = `${comp.props?.currentRow || 0}-${comp.props?.currentCol || 0}`;
        const activeChildIds = tileChildMap[activeKey] || [];
        if (Object.keys(tileChildMap).length > 0) {
          visibleChildren = comp.children.filter(c => activeChildIds.includes(c.id));
        }
      } else if (comp.type === 'win') {
        // Offset for window title bar
        childOffsetY = y + padTop + 32;
      }
      
      visibleChildren.forEach(child => renderComponent(child, childOffsetX, childOffsetY));

      // Restore transform if applied
      if (hasTransform) {
        ctx.restore();
      }

      // Restore alpha if the animation or the screen changed it
      if (alpha !== 1) {
        ctx.restore();
      }
    };

    /** One screen, laid down where a change in progress puts it. */
    const paintScreen = (
      screenComponents: LvglComponent[],
      background: string,
      at: { dx: number; dy: number; alpha: number },
    ) => {
      screenAlpha = at.alpha;
      if (at.dx !== 0 || at.dy !== 0 || at.alpha !== 1) {
        ctx.save();
        ctx.globalAlpha = at.alpha;
        ctx.fillStyle = background;
        ctx.fillRect(at.dx, at.dy, canvas.width, canvas.height);
        ctx.restore();
      }
      screenComponents.forEach(comp => renderComponent(comp, at.dx, at.dy));
      screenAlpha = 1;
    };

    const leaving = screenChange
      ? screens.find(screen => screen.id === screenChange.fromScreenId)
      : undefined;

    if (!screenChange || !leaving) {
      components.forEach(comp => renderComponent(comp));
      return;
    }

    // Both screens are on the panel at once until the change finishes, drawn
    // where lv_screen_load_anim would have them.
    const frame = screenChangeFrame(
      screenChange.transition,
      screenChange.direction,
      screenChange.progress,
      canvas.width,
      canvas.height,
    );
    const paintLeaving = () =>
      paintScreen(leaving.components, leaving.backgroundColor || '#ffffff', frame.from);
    const paintArriving = () => paintScreen(components, bgColor, frame.to);
    if (frame.outgoingOnTop) {
      paintArriving();
      paintLeaving();
    } else {
      paintLeaving();
      paintArriving();
    }
  }, [
    components,
    screens,
    screenChange,
    canvas,
    bgColor,
    hoveredComponent,
    loadImage,
    animStates,
    imageButtonStateIndices,
  ]);

  // Handle mouse move for hover effects
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    // Find component at point
    const findAtPoint = (comps: LvglComponent[], offsetX = 0, offsetY = 0): string | null => {
      for (let i = comps.length - 1; i >= 0; i--) {
        const comp = comps[i];
        const compX = comp.x + offsetX;
        const compY = comp.y + offsetY;

        if (x >= compX && x <= compX + comp.width && y >= compY && y <= compY + comp.height) {
          const childHit = findAtPoint(comp.children, compX, compY);
          return childHit || comp.id;
        }
      }
      return null;
    };

    setHoveredComponent(findAtPoint(components));
  };

  const handleMouseLeave = () => {
    setHoveredComponent(null);
  };

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <h3>📱 Prototype</h3>
        <div className="preview-controls">
          {!animPlaying ? (
            <button className="preview-btn" onClick={startAnimation} title="Play animation">▶</button>
          ) : animPaused ? (
            <button className="preview-btn" onClick={resumeAnimation} title="Resume">▶</button>
          ) : (
            <button className="preview-btn" onClick={pauseAnimation} title="Pause">⏸</button>
          )}
          <button
            className="preview-btn"
            onClick={resetAnimation}
            title="Restart from the entry screen"
            disabled={!animPlaying && animStates.size === 0 && previewPageId === entryScreenId}
          >
            ⏹
          </button>
          <span className="preview-divider" />
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(2, s + 0.25))}>+</button>
        </div>
      </div>
      <div className="preview-content">
        <div 
          className="preview-canvas-wrapper"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <canvas
            ref={canvasRef}
            width={canvas.width}
            height={canvas.height}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
            style={{ cursor: hoveredComponent ? 'pointer' : 'default' }}
          />
        </div>
      </div>
      <div className="preview-footer">
        <div className="preview-screens">
          {screens.map(p => (
            <button
              key={p.id}
              className={`preview-screen-btn ${p.id === previewPageId ? 'active' : ''}`}
              onClick={() => enterScreen(p.id)}
              title={p.id === entryScreenId ? `${p.name} (entry screen)` : p.name}
            >
              {p.name}
              {p.id === entryScreenId && <span className="preview-screen-entry">Entry</span>}
            </button>
          ))}
        </div>
        <span>{canvas.width} × {canvas.height}</span>
        {hoveredComponent && <span>Hovered: {hoveredComponent.slice(0, 8)}...</span>}
      </div>
    </div>
  );
};

// Drawing helper functions

// Helper: draw text decoration (underline / strikethrough)
function drawTextDecoration(
  ctx: CanvasRenderingContext2D,
  textX: number, textY: number, textWidth: number, fontSize: number,
  decor?: string, color?: string
) {
  if (!decor || decor === 'none') return;
  ctx.strokeStyle = color || ctx.fillStyle;
  ctx.lineWidth = Math.max(1, fontSize / 12);
  ctx.beginPath();
  if (decor === 'underline') {
    const lineY = textY + fontSize * 0.15;
    ctx.moveTo(textX, lineY);
    ctx.lineTo(textX + textWidth, lineY);
  } else if (decor === 'strikethrough') {
    const lineY = textY - fontSize * 0.3;
    ctx.moveTo(textX, lineY);
    ctx.lineTo(textX + textWidth, lineY);
  }
  ctx.stroke();
}

// Helper: draw border with side support
function drawBorderWithSide(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  borderColor: string, borderWidth: number, borderRadius: number,
  borderSide?: string
) {
  if (!borderWidth) return;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;

  const side = borderSide || 'full';
  if (side === 'none') return;

  if (side === 'full') {
    roundRect(ctx, x, y, w, h, borderRadius);
    ctx.stroke();
    return;
  }

  // Individual sides (no border-radius for partial borders)
  const drawTop = side === 'top' || side === 'top_bottom';
  const drawBottom = side === 'bottom' || side === 'top_bottom';
  const drawLeft = side === 'left' || side === 'left_right';
  const drawRight = side === 'right' || side === 'left_right';

  if (drawTop) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  if (drawBottom) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }
  if (drawLeft) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }
  if (drawRight) {
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { bgColor: string; borderColor: string; borderWidth: number; borderRadius: number; text: string; textColor: string; gradientFill?: string | CanvasGradient; textDecor?: string; borderSide?: string }
) {
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  drawBorderWithSide(ctx, x, y, w, h, opts.borderColor, opts.borderWidth, opts.borderRadius, opts.borderSide);

  ctx.fillStyle = opts.textColor;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textX = x + w / 2;
  const textY = y + h / 2;
  ctx.fillText(opts.text, textX, textY);

  // Text decoration
  if (opts.textDecor && opts.textDecor !== 'none') {
    const metrics = ctx.measureText(opts.text);
    drawTextDecoration(ctx, textX - metrics.width / 2, textY, metrics.width, 14, opts.textDecor, opts.textColor);
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, _w: number, _h: number,
  opts: { text: string; textColor: string; fontSize: number; textDecor?: string }
) {
  ctx.fillStyle = opts.textColor;
  ctx.font = `${opts.fontSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(opts.text, x, y);

  // Text decoration
  if (opts.textDecor && opts.textDecor !== 'none') {
    const metrics = ctx.measureText(opts.text);
    drawTextDecoration(ctx, x, y + opts.fontSize, metrics.width, opts.fontSize, opts.textDecor, opts.textColor);
  }
}

function drawSlider(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: {
    value: number; min: number; max: number; bgColor: string;
    indicator: string; knob: string;
  }
) {
  const trackHeight = 6;
  const trackY = y + (h - trackHeight) / 2;
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  const knobX = x + progress * w;

  // Track background
  ctx.fillStyle = '#e0e0e0';
  roundRect(ctx, x, trackY, w, trackHeight, 3);
  ctx.fill();

  // Track fill
  ctx.fillStyle = opts.indicator;
  roundRect(ctx, x, trackY, w * progress, trackHeight, 3);
  ctx.fill();

  // Knob
  ctx.fillStyle = opts.knob;
  ctx.beginPath();
  ctx.arc(knobX, y + h / 2, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawCheckbox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, _w: number, h: number,
  opts: {
    checked: boolean; text: string; textColor: string; textDecor?: string;
    indicator: string; indicatorBorder: string;
  }
) {
  const boxSize = 18;
  const boxY = y + (h - boxSize) / 2;

  // Box
  ctx.strokeStyle = opts.checked ? opts.indicator : opts.indicatorBorder;
  ctx.lineWidth = 2;
  ctx.fillStyle = opts.checked ? opts.indicator : '#fff';
  roundRect(ctx, x, boxY, boxSize, boxSize, 3);
  ctx.fill();
  ctx.stroke();

  // Checkmark
  if (opts.checked) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, boxY + boxSize / 2);
    ctx.lineTo(x + boxSize / 2 - 1, boxY + boxSize - 5);
    ctx.lineTo(x + boxSize - 4, boxY + 5);
    ctx.stroke();
  }

  // Text
  ctx.fillStyle = opts.textColor;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textStartX = x + boxSize + 8;
  const textCenterY = y + h / 2;
  ctx.fillText(opts.text, textStartX, textCenterY);

  // Text decoration
  if (opts.textDecor && opts.textDecor !== 'none') {
    const metrics = ctx.measureText(opts.text);
    drawTextDecoration(ctx, textStartX, textCenterY, metrics.width, 14, opts.textDecor, opts.textColor);
  }
}

function drawSwitch(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { checked: boolean; indicator: string; knob: string }
) {
  const trackWidth = Math.min(w, 50);
  const trackHeight = 24;
  const trackX = x + (w - trackWidth) / 2;
  const trackY = y + (h - trackHeight) / 2;

  // Track
  ctx.fillStyle = opts.checked ? opts.indicator : '#ccc';
  roundRect(ctx, trackX, trackY, trackWidth, trackHeight, trackHeight / 2);
  ctx.fill();

  // Knob
  const knobRadius = trackHeight / 2 - 2;
  const knobX = opts.checked ? trackX + trackWidth - knobRadius - 2 : trackX + knobRadius + 2;
  ctx.fillStyle = opts.knob;
  ctx.beginPath();
  ctx.arc(knobX, trackY + trackHeight / 2, knobRadius, 0, Math.PI * 2);
  ctx.fill();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { value: number; min: number; max: number; bgColor: string; indicator: string }
) {
  const progress = (opts.value - opts.min) / (opts.max - opts.min);

  // Background
  ctx.fillStyle = '#e0e0e0';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();

  // Fill
  ctx.fillStyle = opts.indicator;
  roundRect(ctx, x, y, w * progress, h, 4);
  ctx.fill();
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: {
    value: number; min: number; max: number; bgColor: string;
    track: string; indicator: string;
  }
) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const radius = Math.min(w, h) / 2 - 5;
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  const startAngle = -Math.PI * 0.75;
  const endAngle = Math.PI * 0.75;
  const currentAngle = startAngle + (endAngle - startAngle) * progress;

  // Background arc
  ctx.strokeStyle = opts.track;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.stroke();

  // Progress arc
  ctx.strokeStyle = opts.indicator;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, currentAngle);
  ctx.stroke();

  // Value text
  ctx.fillStyle = '#333';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${opts.value}`, centerX, centerY);
}

function drawTextarea(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { text: string; placeholder: string; bgColor: string; borderColor: string; borderRadius: number; textColor: string; gradientFill?: string | CanvasGradient }
) {
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  const displayText = opts.text || opts.placeholder;
  ctx.fillStyle = opts.text ? opts.textColor : '#999';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(displayText, x + 8, y + 8);
}

function drawDropdown(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { options: string[]; selected: number; bgColor: string; borderColor: string; borderRadius: number; textColor: string; gradientFill?: string | CanvasGradient }
) {
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  const selectedText = opts.options[opts.selected] || opts.options[0] || 'Select...';
  ctx.fillStyle = opts.textColor;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(selectedText, x + 10, y + h / 2);

  // Arrow
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(x + w - 20, y + h / 2 - 3);
  ctx.lineTo(x + w - 10, y + h / 2 - 3);
  ctx.lineTo(x + w - 15, y + h / 2 + 3);
  ctx.closePath();
  ctx.fill();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { src?: string; loadImage: (src: string) => HTMLImageElement | null }
) {
  // Try to load and draw the image
  if (opts.src) {
    const img = opts.loadImage(opts.src);
    if (img && img.complete && img.naturalWidth > 0) {
      // Draw the actual image
      ctx.drawImage(img, x, y, w, h);
      return;
    }
  }

  // Placeholder for image (when no src or image not loaded)
  ctx.fillStyle = '#f0f0f0';
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  // Image icon
  ctx.fillStyle = '#999';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🖼️', x + w / 2, y + h / 2);
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { bgColor: string; borderColor: string; borderWidth: number; borderRadius: number; gradientFill?: string | CanvasGradient; borderSide?: string }
) {
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  drawBorderWithSide(ctx, x, y, w, h, opts.borderColor, opts.borderWidth, opts.borderRadius, opts.borderSide);
}

function drawGeneric(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { bgColor: string; borderColor: string; borderWidth: number; borderRadius: number; label: string }
) {
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = opts.borderWidth;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.label, x + w / 2, y + h / 2);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function lightenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// A disc keeps its fill and border, the way the canvas draws it with a 50%
// radius; a sector is the same path the canvas draws and the generated arc
// reproduces. See utils/circleGeometry.ts.
function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: {
    shape: 'circle' | 'sector';
    startAngle: number;
    endAngle: number;
    thickness: number;
    bgColor: string;
    borderColor: string;
    borderWidth: number;
    gradientFill?: string | CanvasGradient;
  }
) {
  const size = Math.min(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (opts.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = opts.gradientFill || opts.bgColor;
    ctx.fill();
    if (opts.borderWidth > 0) {
      ctx.strokeStyle = opts.borderColor;
      ctx.lineWidth = opts.borderWidth;
      ctx.stroke();
    }
    return;
  }

  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  ctx.fill(
    new Path2D(sectorPath(size, opts.thickness, opts.startAngle, opts.endAngle)),
    'evenodd',
  );
  ctx.restore();
}

// Draws the widget's own points, placed in its box exactly as the editor
// canvas places them, so a vertical or dashed line previews as itself rather
// than as a horizontal rule. See utils/lineGeometry.ts.
function drawLine(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: {
    points: unknown;
    lineColor: string;
    lineWidth: number;
    rounded: boolean;
    dashWidth: number;
    dashGap: number;
  }
) {
  const placed = pointsInBox(normalizeLinePoints(opts.points), { width: w, height: h });
  ctx.save();
  ctx.strokeStyle = opts.lineColor;
  ctx.lineWidth = Math.max(1, opts.lineWidth);
  ctx.lineCap = opts.rounded ? 'round' : 'butt';
  ctx.setLineDash(
    opts.dashWidth > 0 ? [opts.dashWidth, opts.dashGap || opts.dashWidth] : [],
  );
  ctx.beginPath();
  placed.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(x + px, y + py);
    else ctx.lineTo(x + px, y + py);
  });
  ctx.stroke();
  ctx.restore();
}

/**
 * A polygon: the closed run of points, filled only when a triangle fan could
 * cover it, and stroked with its outline.
 *
 * The fill is drawn as one path rather than as the fan the firmware uses -
 * over a convex outline the two cover the same pixels, and a path has no seams
 * between triangles.
 */
function drawPolygon(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: {
    points: unknown;
    fill: string | null;
    lineColor: string;
    lineWidth: number;
    rounded: boolean;
  }
) {
  const points = normalizePolygonPoints(opts.points);
  const placed = pointsInPolygonBox(points);
  const box = polygonBox(placed);
  // The box the preview was given is the widget's; the points are drawn in
  // theirs, scaled to fit, so a resized polygon fills its box here too.
  const scaleX = box.width > 0 ? w / box.width : 1;
  const scaleY = box.height > 0 ? h / box.height : 1;

  ctx.save();
  ctx.beginPath();
  placed.forEach(([px, py], i) => {
    const cx = x + px * scaleX;
    const cy = y + py * scaleY;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.closePath();
  if (opts.fill && isConvexPolygon(placed)) {
    ctx.fillStyle = opts.fill;
    ctx.fill();
  }
  if (opts.lineWidth > 0) {
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = opts.lineWidth;
    ctx.lineJoin = opts.rounded ? 'round' : 'miter';
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpinner(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { track: string; indicator: string }
) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const radius = Math.min(w, h) / 2 - 4;

  // Background circle
  ctx.strokeStyle = opts.track;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Spinner arc (partial)
  ctx.strokeStyle = opts.indicator;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI / 3);
  ctx.stroke();
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { type: string; data: number[]; lineColor: string; bgColor: string; borderColor: string; borderRadius: number; showGrid: boolean }
) {
  // Background
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  const pad = 10;
  const chartX = x + pad;
  const chartY = y + pad;
  const chartW = w - pad * 2;
  const chartH = h - pad * 2;

  if (opts.data.length === 0) return;

  const maxVal = Math.max(...opts.data, 1);
  const minVal = Math.min(...opts.data, 0);
  const range = maxVal - minVal || 1;

  // Grid
  if (opts.showGrid) {
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const gy = chartY + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(chartX, gy);
      ctx.lineTo(chartX + chartW, gy);
      ctx.stroke();
    }
  }

  if (opts.type === 'bar') {
    const barW = chartW / opts.data.length * 0.7;
    const gap = chartW / opts.data.length;
    ctx.fillStyle = opts.lineColor;
    for (let i = 0; i < opts.data.length; i++) {
      const barH = ((opts.data[i] - minVal) / range) * chartH;
      const bx = chartX + gap * i + (gap - barW) / 2;
      const by = chartY + chartH - barH;
      roundRect(ctx, bx, by, barW, barH, 2);
      ctx.fill();
    }
  } else {
    // Line / scatter
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < opts.data.length; i++) {
      const px = chartX + (chartW / (opts.data.length - 1 || 1)) * i;
      const py = chartY + chartH - ((opts.data[i] - minVal) / range) * chartH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Dots
    ctx.fillStyle = opts.lineColor;
    for (let i = 0; i < opts.data.length; i++) {
      const px = chartX + (chartW / (opts.data.length - 1 || 1)) * i;
      const py = chartY + chartH - ((opts.data[i] - minVal) / range) * chartH;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { rows: number; cols: number; bgColor: string; borderColor: string; textColor: string }
) {
  // Background
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const cellW = w / opts.cols;
  const cellH = h / opts.rows;

  // Grid lines
  for (let r = 1; r < opts.rows; r++) {
    ctx.beginPath();
    ctx.moveTo(x, y + cellH * r);
    ctx.lineTo(x + w, y + cellH * r);
    ctx.stroke();
  }
  for (let c = 1; c < opts.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(x + cellW * c, y);
    ctx.lineTo(x + cellW * c, y + h);
    ctx.stroke();
  }

  // Header row
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 1, y + 1, w - 2, cellH - 1);
  ctx.strokeStyle = opts.borderColor;
  ctx.beginPath();
  ctx.moveTo(x, y + cellH);
  ctx.lineTo(x + w, y + cellH);
  ctx.stroke();

  // Cell text
  ctx.fillStyle = opts.textColor;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const label = r === 0 ? `Col ${c + 1}` : `${r},${c}`;
      ctx.fillText(label, x + cellW * c + cellW / 2, y + cellH * r + cellH / 2);
    }
  }
}

function drawCalendar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { year: number; month: number; bgColor: string; borderColor: string; textColor: string }
) {
  // Background
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();

  const headerH = 30;
  const dayHeaderH = 20;

  // Month header
  ctx.fillStyle = '#2196F3';
  roundRect(ctx, x, y, w, headerH, 4);
  ctx.fill();
  // Fix bottom corners of header
  ctx.fillRect(x, y + headerH - 4, w, 4);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${monthNames[opts.month - 1] || 'Jan'} ${opts.year}`, x + w / 2, y + headerH / 2);

  // Day headers
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cellW = w / 7;
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  for (let i = 0; i < 7; i++) {
    ctx.fillText(days[i], x + cellW * i + cellW / 2, y + headerH + dayHeaderH / 2);
  }

  // Day numbers
  const firstDay = new Date(opts.year, opts.month - 1, 1).getDay();
  const daysInMonth = new Date(opts.year, opts.month, 0).getDate();
  const cellH = Math.min(18, (h - headerH - dayHeaderH) / 6);
  ctx.fillStyle = opts.textColor;
  ctx.font = '10px sans-serif';

  let day = 1;
  for (let row = 0; row < 6 && day <= daysInMonth; row++) {
    for (let col = 0; col < 7 && day <= daysInMonth; col++) {
      if (row === 0 && col < firstDay) continue;
      const dx = x + cellW * col + cellW / 2;
      const dy = y + headerH + dayHeaderH + cellH * row + cellH / 2;
      ctx.fillText(`${day}`, dx, dy);
      day++;
    }
  }
}

function drawTabview(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { tabs: string[]; activeTab: number; bgColor: string; borderColor: string; textColor: string }
) {
  const tabH = 32;

  // Background
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();

  // Tab bar
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 1, y + 1, w - 2, tabH);
  ctx.strokeStyle = opts.borderColor;
  ctx.beginPath();
  ctx.moveTo(x, y + tabH);
  ctx.lineTo(x + w, y + tabH);
  ctx.stroke();

  // Tabs
  const tabW = Math.min(80, w / opts.tabs.length);
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  for (let i = 0; i < opts.tabs.length; i++) {
    const tx = x + tabW * i;
    if (i === opts.activeTab) {
      ctx.fillStyle = opts.bgColor;
      ctx.fillRect(tx, y + 1, tabW, tabH);
      ctx.fillStyle = '#2196F3';
      ctx.fillRect(tx, y + tabH - 2, tabW, 2);
      ctx.fillStyle = '#2196F3';
    } else {
      ctx.fillStyle = '#888';
    }
    ctx.fillText(opts.tabs[i], tx + tabW / 2, y + tabH / 2);
  }

  // Content area hint
  ctx.fillStyle = '#ccc';
  ctx.font = '11px sans-serif';
  ctx.fillText('Tab Content', x + w / 2, y + tabH + (h - tabH) / 2);
}

function drawTileview(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { rows: number; cols: number; currentRow: number; currentCol: number; bgColor: string; borderColor: string }
) {
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  const cellW = w / opts.cols;
  const cellH = h / opts.rows;

  // Grid
  ctx.strokeStyle = '#ddd';
  ctx.setLineDash([4, 4]);
  for (let r = 1; r < opts.rows; r++) {
    ctx.beginPath();
    ctx.moveTo(x, y + cellH * r);
    ctx.lineTo(x + w, y + cellH * r);
    ctx.stroke();
  }
  for (let c = 1; c < opts.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(x + cellW * c, y);
    ctx.lineTo(x + cellW * c, y + h);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Highlight current tile
  const cx = x + cellW * opts.currentCol;
  const cy = y + cellH * opts.currentRow;
  ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
  ctx.fillRect(cx, cy, cellW, cellH);
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);

  // Labels
  ctx.fillStyle = '#999';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      ctx.fillText(`${r},${c}`, x + cellW * c + cellW / 2, y + cellH * r + cellH / 2);
    }
  }
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { title: string; bgColor: string; borderColor: string; borderRadius: number; textColor: string }
) {
  const titleH = 36;

  // Window frame
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  // Title bar
  ctx.fillStyle = '#e0e0e0';
  ctx.beginPath();
  const r = opts.borderRadius;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + titleH);
  ctx.lineTo(x, y + titleH);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  // Title bar border
  ctx.strokeStyle = opts.borderColor;
  ctx.beginPath();
  ctx.moveTo(x, y + titleH);
  ctx.lineTo(x + w, y + titleH);
  ctx.stroke();

  // Title text
  ctx.fillStyle = opts.textColor;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.title, x + 12, y + titleH / 2);

  // Close button
  ctx.fillStyle = '#999';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✕', x + w - 18, y + titleH / 2);
}

/**
 * The prototype's video frame.
 *
 * Deliberately not a still. The file is on the panel's SD card and no part of
 * the editor has ever read it, so the prototype draws the frame the picture
 * will occupy and names the file inside it. Inventing a thumbnail here would
 * be the one thing in this preview that is not derived from the project.
 */
function drawVideo(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: { fileName?: string; autoPlay: boolean; loop: boolean; bgColor: string; textColor: string }
) {
  const named = typeof opts.fileName === 'string' ? opts.fileName.trim() : '';

  ctx.fillStyle = opts.bgColor && opts.bgColor !== 'transparent' ? opts.bgColor : '#000000';
  ctx.fillRect(x, y, w, h);

  const centreX = x + w / 2;
  const centreY = y + h / 2;

  // A play triangle sized off the shorter side, so it stays inside a widget
  // that has been resized down to a strip.
  const size = Math.max(6, Math.min(w, h) * 0.18);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = opts.textColor || '#ffffff';
  ctx.beginPath();
  ctx.moveTo(centreX - size * 0.4, centreY - size - 4);
  ctx.lineTo(centreX + size * 0.75, centreY - 4);
  ctx.lineTo(centreX - size * 0.4, centreY + size - 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = opts.textColor || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = named ? 0.9 : 0.6;
  ctx.font = '11px monospace';
  ctx.fillText(named || 'No file named', centreX, centreY + size + 8, Math.max(0, w - 12));
  const badges = [opts.autoPlay ? 'AUTO' : null, opts.loop ? 'LOOP' : null].filter(Boolean);
  if (named && badges.length > 0) {
    ctx.globalAlpha = 0.6;
    ctx.font = '9px sans-serif';
    ctx.fillText(badges.join(' · '), centreX, centreY + size + 22, Math.max(0, w - 12));
  }
  ctx.restore();
}

export default PreviewPanel;
