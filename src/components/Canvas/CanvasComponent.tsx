import React, { useCallback } from 'react';
import type { LvglComponent, ResizeHandle } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import { useAppStore } from '../../store/appStore';
import { displayTextFor } from '../../utils/componentText';
import { resolveCanvasFont } from './canvasFont';
import { useResourceStore } from '../../resources/resourceStore';
import {
  getImageButtonState,
  normalizeImageButtonProps,
} from '../PropertyEditor/imageButtonModel';
import { resolveFallbackBackground } from './widgetBackground';
import { partColor, partStyle } from '../../utils/widgetParts';
import {
  DEFAULT_LINE_WIDTH,
  lineBox,
  lineExtent,
  normalizeLinePoints,
  pointsInBox,
} from '../../utils/lineGeometry';
import {
  isConvexPolygon,
  normalizePolygonPoints,
  pointsInPolygonBox,
  polygonBox,
} from '../../utils/polygonGeometry';
import {
  DEFAULT_END_ANGLE,
  DEFAULT_START_ANGLE,
  sectorPath,
} from '../../utils/circleGeometry';
import './CanvasComponent.css';

interface CanvasComponentProps {
  component: LvglComponent;
  offsetX?: number;
  offsetY?: number;
  parentWidth?: number;
  parentHeight?: number;
  parentLayout?: string; // 'flex' | 'grid' | 'none' — parent container's layout mode
  parentFlexDirection?: string; // parent's flexDirection when parentLayout='flex'
  onClick: (e: React.MouseEvent, id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onResizeStart: (e: React.MouseEvent, id: string, handle: ResizeHandle) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  children?: React.ReactNode;
}

const resizeHandles: ResizeHandle[] = [
  'top-left', 'top', 'top-right',
  'left', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

/**
 * The handles worth offering. A line only has length: dragging it across its
 * own stroke can do nothing — the geometry rule puts the box straight back —
 * so the handles that would try are not drawn at all.
 */
function handlesFor(component: LvglComponent): ResizeHandle[] {
  if (component.type !== 'line') return resizeHandles;
  const extent = lineExtent(normalizeLinePoints(component.props?.points));
  if (extent.width > 0 && extent.height > 0) return resizeHandles;
  return extent.height > 0 ? ['top', 'bottom'] : ['left', 'right'];
}

const CanvasComponent: React.FC<CanvasComponentProps> = ({
  component,
  parentWidth,
  parentHeight,
  parentLayout,
  onClick,
  onDragStart,
  onResizeStart,
  onContextMenu,
  children,
}) => {
  // Self-subscribe: only re-render when THIS component's selection/hover actually changes
  const isSelected = useEditorStore(
    useCallback((s) => s.selection.selectedIds.includes(component.id), [component.id])
  );
  const isHovered = useEditorStore(
    useCallback((s) => s.selection.hoveredId === component.id, [component.id])
  );
  const setHoveredComponent = useEditorStore(state => state.setHoveredComponent);
  const updateComponent = useEditorStore(state => state.updateComponent);
  const defaultFontSize = useAppStore(state => state.defaultFontSize);
  // The canvas previews the selected language, so a linked widget renders its
  // text resource rather than the literal it was drawn with
  const texts = useEditorStore(state => state.texts);
  const languages = useEditorStore(state => state.languages);
  const previewLanguage = useEditorStore(state => state.previewLanguage);
  const { styles, props, type } = component;
  const defaultStyle = styles.default;
  const shownText = displayTextFor(component, 'text', texts, languages, previewLanguage);
  const shownPlaceholder = displayTextFor(component, 'placeholder', texts, languages, previewLanguage);
  const shownTitle = displayTextFor(component, 'title', texts, languages, previewLanguage);
  const shownOptions = displayTextFor(component, 'options', texts, languages, previewLanguage).split('\n');
  const typographies = useEditorStore(state => state.typographies);
  const fontResources = useResourceStore(state => state.fonts);
  // The face and size the device would use, per the same precedence ui.c emits
  const canvasFont = resolveCanvasFont(component, typographies, fontResources, languages, previewLanguage, texts);
  const textFontStyle = {
    fontFamily: canvasFont.fontFamily,
    fontSize: canvasFont.fontSize ?? defaultFontSize,
    // A typography's resolved spacing and decoration, so Label and Button
    // preview what the style will actually render — per language included
    ...(canvasFont.letterSpacing !== undefined ? { letterSpacing: canvasFont.letterSpacing } : {}),
    ...(canvasFont.lineHeight !== undefined ? { lineHeight: `${canvasFont.lineHeight}px` } : {}),
    ...(canvasFont.textDecoration ? { textDecoration: canvasFont.textDecoration } : {}),
  };

  // Helper: apply shadow opacity to shadow color
  const buildShadowColor = (color?: string, opacity?: number): string => {
    if (!color) return 'rgba(0,0,0,0.3)';
    if (opacity === undefined || opacity === null) return color;
    // Parse hex color and apply alpha
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity / 255))})`;
  };

  // Build box-shadow from shadow properties
  const buildBoxShadow = (): string | undefined => {
    if (!defaultStyle.shadowWidth && !defaultStyle.shadowOffsetX && !defaultStyle.shadowOffsetY) return undefined;
    const offX = defaultStyle.shadowOffsetX || 0;
    const offY = defaultStyle.shadowOffsetY || 0;
    const blur = defaultStyle.shadowWidth || 0;
    const spread = defaultStyle.shadowSpread || 0;
    const color = buildShadowColor(defaultStyle.shadowColor, defaultStyle.shadowOpacity);
    return `${offX}px ${offY}px ${blur}px ${spread}px ${color}`;
  };

  // Build transform from transform properties
  const buildTransform = (): string | undefined => {
    const parts: string[] = [];
    if (defaultStyle.transformAngle) {
      // LVGL uses 0.1 degree units
      parts.push(`rotate(${defaultStyle.transformAngle / 10}deg)`);
    }
    if (defaultStyle.transformZoomX !== undefined || defaultStyle.transformZoomY !== undefined) {
      // LVGL 256 = 100%
      const sx = defaultStyle.transformZoomX !== undefined ? defaultStyle.transformZoomX / 256 : 1;
      const sy = defaultStyle.transformZoomY !== undefined ? defaultStyle.transformZoomY / 256 : 1;
      parts.push(`scaleX(${sx}) scaleY(${sy})`);
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  };

  // Build transform-origin from pivot properties
  const buildTransformOrigin = (): string | undefined => {
    if (defaultStyle.transformPivotX !== undefined || defaultStyle.transformPivotY !== undefined) {
      const px = defaultStyle.transformPivotX ?? component.width / 2;
      const py = defaultStyle.transformPivotY ?? component.height / 2;
      return `${px}px ${py}px`;
    }
    return undefined;
  };

  // Build background with gradient support
  const buildBackground = (): string | undefined => {
    if (defaultStyle.bgGradDir && defaultStyle.bgGradDir !== 'none' && defaultStyle.bgGradColor) {
      const baseColor = defaultStyle.bgColor || '#e0e0e0';
      const gradColor = defaultStyle.bgGradColor;
      const stop = defaultStyle.bgGradStop !== undefined ? Math.round((defaultStyle.bgGradStop / 255) * 100) : 100;
      const dir = defaultStyle.bgGradDir === 'hor' ? 'to right' : 'to bottom';
      return `linear-gradient(${dir}, ${baseColor} 0%, ${gradColor} ${stop}%)`;
    }
    return undefined;
  };

  // Build outline
  const buildOutline = (): React.CSSProperties => {
    const result: React.CSSProperties = {};
    if (defaultStyle.outlineWidth) {
      result.outline = `${defaultStyle.outlineWidth}px solid ${defaultStyle.outlineColor || '#000'}`;
      if (defaultStyle.outlinePad !== undefined) {
        result.outlineOffset = `${defaultStyle.outlinePad}px`;
      }
    }
    return result;
  };

  // Build border styles with borderSide support
  const buildBorderStyles = (): React.CSSProperties => {
    const bw = defaultStyle.borderWidth;
    const bc = defaultStyle.borderColor;
    const side = defaultStyle.borderSide || 'full';

    if (!bw) return { borderStyle: 'none' };

    const borderVal = `${bw}px solid ${bc || '#ccc'}`;
    const noBorder = 'none';

    switch (side) {
      case 'top':
        return { borderTop: borderVal, borderBottom: noBorder, borderLeft: noBorder, borderRight: noBorder };
      case 'bottom':
        return { borderTop: noBorder, borderBottom: borderVal, borderLeft: noBorder, borderRight: noBorder };
      case 'left':
        return { borderTop: noBorder, borderBottom: noBorder, borderLeft: borderVal, borderRight: noBorder };
      case 'right':
        return { borderTop: noBorder, borderBottom: noBorder, borderLeft: noBorder, borderRight: borderVal };
      case 'top_bottom':
        return { borderTop: borderVal, borderBottom: borderVal, borderLeft: noBorder, borderRight: noBorder };
      case 'left_right':
        return { borderTop: noBorder, borderBottom: noBorder, borderLeft: borderVal, borderRight: borderVal };
      case 'none':
        return { borderStyle: 'none' };
      default: // 'full'
        return { borderColor: bc, borderWidth: bw, borderStyle: 'solid' };
    }
  };

  // Build padding with four-direction support
  const buildPadding = (): React.CSSProperties => {
    const result: React.CSSProperties = {};
    const base = defaultStyle.padding;
    if (base !== undefined) result.padding = base;
    if (defaultStyle.paddingTop !== undefined) result.paddingTop = defaultStyle.paddingTop;
    if (defaultStyle.paddingBottom !== undefined) result.paddingBottom = defaultStyle.paddingBottom;
    if (defaultStyle.paddingLeft !== undefined) result.paddingLeft = defaultStyle.paddingLeft;
    if (defaultStyle.paddingRight !== undefined) result.paddingRight = defaultStyle.paddingRight;
    return result;
  };

  // Build border-radius with four-corner support
  const buildBorderRadius = (): string | number | undefined => {
    if (
      defaultStyle.borderRadiusTopLeft !== undefined ||
      defaultStyle.borderRadiusTopRight !== undefined ||
      defaultStyle.borderRadiusBottomLeft !== undefined ||
      defaultStyle.borderRadiusBottomRight !== undefined
    ) {
      const tl = defaultStyle.borderRadiusTopLeft ?? defaultStyle.borderRadius ?? 0;
      const tr = defaultStyle.borderRadiusTopRight ?? defaultStyle.borderRadius ?? 0;
      const br = defaultStyle.borderRadiusBottomRight ?? defaultStyle.borderRadius ?? 0;
      const bl = defaultStyle.borderRadiusBottomLeft ?? defaultStyle.borderRadius ?? 0;
      return `${tl}px ${tr}px ${br}px ${bl}px`;
    }
    return defaultStyle.borderRadius;
  };

  // Build blend mode
  const buildMixBlendMode = (): React.CSSProperties['mixBlendMode'] => {
    switch (defaultStyle.blendMode) {
      case 'additive': return 'screen';
      case 'subtractive': return 'difference';
      case 'multiply': return 'multiply';
      default: return undefined; // 'normal' is default, no need to set
    }
  };

  // Build text-decoration
  const buildTextDecoration = (): string | undefined => {
    switch (defaultStyle.textDecor) {
      case 'underline': return 'underline';
      case 'strikethrough': return 'line-through';
      default: return undefined;
    }
  };

  // Build width/height with mode support
  const buildDimension = (value: number, mode?: string): string | number => {
    switch (mode) {
      case 'percent': return `${value}%`;
      case 'content': return 'fit-content';
      default: return value;
    }
  };

  const background = buildBackground();
  const outlineStyles = buildOutline();
  const borderStyles = buildBorderStyles();
  const paddingStyles = buildPadding();

  const resolvedBgColor = (() => {
    const bg = defaultStyle.bgColor;
    const isMissing = !bg || bg === '';
    const isTransparent = bg?.toLowerCase() === 'transparent';

    if (isMissing || isTransparent) {
      return resolveFallbackBackground(type) ?? bg ?? 'transparent';
    }
    return bg;
  })();

  // Calculate visual position based on align property
  // When align is set, the component's position is relative to the alignment anchor point
  // within the parent. x/y become offsets from that anchor (like LVGL's lv_obj_align).
  const computeAlignedPosition = (): { left: number; top: number } => {
    const align = component.align;
    if (!align || align === 'default') {
      return { left: component.x, top: component.y };
    }

    const pw = parentWidth ?? 0;
    const ph = parentHeight ?? 0;
    const cw = component.width;
    const ch = component.height;
    // In LVGL, after lv_obj_align, x/y are offsets from the align point.
    // alignOffsetX/Y are additional offsets on top of that.
    const offX = (component.alignOffsetX || 0) + component.x;
    const offY = (component.alignOffsetY || 0) + component.y;

    switch (align) {
      case 'center':
        return { left: (pw - cw) / 2 + offX, top: (ph - ch) / 2 + offY };
      case 'top_left':
        return { left: offX, top: offY };
      case 'top_mid':
        return { left: (pw - cw) / 2 + offX, top: offY };
      case 'top_right':
        return { left: pw - cw + offX, top: offY };
      case 'bottom_left':
        return { left: offX, top: ph - ch + offY };
      case 'bottom_mid':
        return { left: (pw - cw) / 2 + offX, top: ph - ch + offY };
      case 'bottom_right':
        return { left: pw - cw + offX, top: ph - ch + offY };
      case 'left_mid':
        return { left: offX, top: (ph - ch) / 2 + offY };
      case 'right_mid':
        return { left: pw - cw + offX, top: (ph - ch) / 2 + offY };
      default:
        return { left: component.x, top: component.y };
    }
  };

  const alignedPos = computeAlignedPosition();

  // Determine if this component is inside a layout container (flex/grid)
  const isInLayout = parentLayout === 'flex' || parentLayout === 'grid';

  // What the wrapper is allowed to paint. A line has no box at all — a border
  // would be a rectangle around the stroke — and a sector is drawn as a path,
  // so the box behind it must stay out of the way. A circle keeps the box and
  // simply rounds it all the way.
  const circleShape: 'circle' | 'sector' | undefined =
    type === 'circle' ? (props.shape === 'sector' ? 'sector' : 'circle') : undefined;
  // A polygon draws its own fill and outline from its points, so the box
  // styles would only add a rectangle around it — the same reason a line has
  // none.
  const drawsBox = type !== 'line' && type !== 'polygon' && circleShape !== 'sector';

  // Build inline styles from component styles
  const componentStyle: React.CSSProperties = {
    position: isInLayout ? 'relative' : 'absolute',
    ...(isInLayout ? {} : { left: alignedPos.left, top: alignedPos.top }),
    width: buildDimension(component.width, (component as unknown as Record<string, unknown>).widthMode as string | undefined),
    height: buildDimension(component.height, (component as unknown as Record<string, unknown>).heightMode as string | undefined),
    backgroundColor: drawsBox ? (background ? undefined : resolvedBgColor) : undefined,
    ...(background && drawsBox ? { background } : {}),
    ...(drawsBox ? borderStyles : {}),
    borderRadius: circleShape === 'circle' ? '50%' : drawsBox ? buildBorderRadius() : undefined,
    color: defaultStyle.textColor,
    opacity: component.visible === false ? 0.3 : (defaultStyle.opacity !== undefined ? defaultStyle.opacity : 1),
    ...(drawsBox ? paddingStyles : {}),
    boxSizing: 'border-box',
    pointerEvents: component.visible === false ? 'none' : undefined,
    // Shadow
    boxShadow: buildBoxShadow(),
    // Transform
    transform: buildTransform(),
    transformOrigin: buildTransformOrigin(),
    // Outline
    ...outlineStyles,
    // Blend mode
    mixBlendMode: buildMixBlendMode(),
    // Text decoration
    textDecoration: buildTextDecoration(),
    // Flex child properties when inside a flex container
    ...(parentLayout === 'flex' ? {
      flexGrow: component.props.flexGrow ?? undefined,
      flexShrink: component.props.flexShrink ?? undefined,
      alignSelf: component.props.alignSelf && component.props.alignSelf !== 'auto' ? component.props.alignSelf : undefined,
    } : {}),
    // Grid child properties when inside a grid container
    ...(parentLayout === 'grid' ? {
      gridColumn: component.props.gridColumnSpan && component.props.gridColumnSpan > 1
        ? `${(component.props.gridColumn ?? 0) + 1} / span ${component.props.gridColumnSpan}`
        : (component.props.gridColumn !== undefined ? `${component.props.gridColumn + 1}` : undefined),
      gridRow: component.props.gridRowSpan && component.props.gridRowSpan > 1
        ? `${(component.props.gridRow ?? 0) + 1} / span ${component.props.gridRowSpan}`
        : (component.props.gridRow !== undefined ? `${component.props.gridRow + 1}` : undefined),
    } : {}),
  };

  // Render component content based on type
  const renderContent = () => {
    switch (type) {
      case 'btn':
        return (
          <div className="lvgl-btn" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            color: defaultStyle.textColor || '#ffffff',
            ...textFontStyle,
          }}>
            {children}
            {(!children || React.Children.count(children) === 0) && (shownText || 'Button')}
          </div>
        );
      
      case 'label':
        return (
          <span className="lvgl-label" style={{
            color: defaultStyle.textColor || '#333333',
            ...textFontStyle,
            // Alignment needs a block box to align within, which is what the
            // widget's frame is on the device
            ...(canvasFont.textAlign
              ? { display: 'block', width: '100%', textAlign: canvasFont.textAlign }
              : {}),
            // The browser's single-line ellipsis is exactly what the generated
            // truncation does on the device, same character included
            ...(props.longMode === 'ellipsis'
              ? { display: 'block', width: '100%', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }
              : {}),
          }}>{shownText || 'Label'}</span>
        );
      
      case 'img':
        return <CanvasImageContent src={props.src} />;

      case 'image-button': {
        const imageButton = normalizeImageButtonProps(props);
        const state = getImageButtonState(
          imageButton.states,
          imageButton.currentState,
        );
        return (
          <CanvasImageContent
            src={state?.imageId}
            placeholder={
              state
                ? `${state.name} · value ${state.value}`
                : 'Add an image-button state'
            }
            title={state ? `${state.name} (${state.value})` : 'Image Button'}
          />
        );
      }
      
      case 'line': {
        // The line is drawn from its own points, so a vertical or diagonal one
        // looks like what LVGL will draw rather than always like a rule. The
        // widget's box is the points' extent (utils/lineGeometry.ts), so the
        // drawing fills it exactly.
        const points = normalizeLinePoints(props.points);
        const stroke = Math.max(1, props.lineWidth ?? DEFAULT_LINE_WIDTH);
        const box = lineBox(points, stroke);
        const placed = pointsInBox(points, box);
        const path = placed.map(([x, y]) => `${x},${y}`).join(' ');
        const color =
          props.lineColor || defaultStyle.borderColor || defaultStyle.textColor || '#333333';
        const dash =
          props.lineDashWidth > 0
            ? `${props.lineDashWidth} ${props.lineDashGap || props.lineDashWidth}`
            : undefined;

        return (
          <svg
            className="lvgl-line"
            viewBox={`0 0 ${box.width} ${box.height}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
          >
            {/* A 2px line is 2px to click. This widens the target without
                widening the widget — editor chrome, never drawn on the panel. */}
            <polyline
              points={path}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(stroke, 10)}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={path}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap={props.lineRounded ? 'round' : 'butt'}
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        );
      }

      case 'polygon': {
        // Drawn from its own points, closed, and filled only when a triangle
        // fan could cover it — which is exactly what the panel will do, so
        // the canvas never shows a fill the device cannot draw. See
        // utils/polygonGeometry.ts.
        const points = normalizePolygonPoints(props.points);
        const placed = pointsInPolygonBox(points);
        const box = polygonBox(placed);
        const path = placed.map(([x, y]) => `${x},${y}`).join(' ');
        const stroke = Math.max(0, props.lineWidth ?? DEFAULT_LINE_WIDTH);
        const strokeColor =
          props.lineColor || defaultStyle.borderColor || defaultStyle.textColor || '#333333';
        const fill =
          resolvedBgColor && resolvedBgColor !== 'transparent' && isConvexPolygon(placed)
            ? resolvedBgColor
            : 'none';

        return (
          <svg
            className="lvgl-polygon"
            viewBox={`0 0 ${box.width} ${box.height}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
          >
            {/* An unfilled outline is only as clickable as its stroke. This
                widens the target without widening the widget — editor chrome,
                never drawn on the panel. */}
            <polygon
              points={path}
              fill={fill === 'none' ? 'transparent' : fill}
              stroke="transparent"
              strokeWidth={Math.max(stroke, 10)}
              vectorEffect="non-scaling-stroke"
            />
            <polygon
              points={path}
              fill={fill}
              stroke={stroke > 0 ? strokeColor : 'none'}
              strokeWidth={stroke}
              strokeLinejoin={props.lineRounded ? 'round' : 'miter'}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        );
      }

      case 'textarea':
        return (
          <div className="lvgl-textarea" style={{
            width: '100%',
            height: '100%',
            fontSize: '12px',
            color: '#999',
            backgroundColor: resolvedBgColor === 'transparent' ? '#ffffff' : undefined,
            border: !defaultStyle.borderWidth ? '1px solid #cccccc' : undefined,
            borderRadius: defaultStyle.borderRadius || 4,
            padding: '6px 8px',
            boxSizing: 'border-box',
          }}>
            {shownText || shownPlaceholder || 'Enter text...'}
          </div>
        );
      
      case 'dropdown':
        return (
          <div className="lvgl-dropdown" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '0 8px',
            backgroundColor: resolvedBgColor === 'transparent' ? '#ffffff' : undefined,
            border: !defaultStyle.borderWidth ? '1px solid #cccccc' : undefined,
            borderRadius: defaultStyle.borderRadius || 4,
            boxSizing: 'border-box',
            color: defaultStyle.textColor || '#333',
          }}>
            <span>{shownOptions[props.selected || 0] || 'Select...'}</span>
            <span style={{ color: '#999', fontSize: '10px' }}>▼</span>
          </div>
        );
      
      case 'checkbox':
        return (
          <div className="lvgl-checkbox" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: defaultStyle.textColor || '#333',
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: `2px solid ${partStyle(component.styles, 'indicator', 'checked')?.borderColor ?? '#666'}`,
              borderRadius: '2px',
              backgroundColor: props.checked
                ? partColor(component, 'indicator', '#2196F3', 'checked')
                : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {props.checked && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
            </div>
            <span style={textFontStyle}>{shownText || 'Checkbox'}</span>
          </div>
        );
      
      case 'switch':
        return (
          <div className="lvgl-switch" style={{
            width: '100%',
            height: '100%',
            borderRadius: defaultStyle.borderRadius || 13,
            backgroundColor: props.checked
              ? partColor(component, 'indicator', '#2196F3', 'checked')
              : '#ccc',
            position: 'relative',
            minHeight: '20px',
          }}>
            <div style={{
              position: 'absolute',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: partColor(component, 'knob', '#fff'),
              top: '50%',
              marginTop: '-10px',
              left: props.checked ? 'calc(100% - 23px)' : '3px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'left 0.2s',
            }} />
          </div>
        );
      
      case 'slider': {
        // The fill and the knob are LVGL parts of their own, so each takes its
        // colour from its part style. The fallbacks are the theme's, which is
        // what a widget that styles no part still draws. The track is the main
        // part and the wrapper below already paints it.
        const sliderPercent = Math.max(0, Math.min(100,
          ((props.value ?? 50) - (props.min ?? 0)) / ((props.max ?? 100) - (props.min ?? 0)) * 100));
        return (
          <div className="lvgl-slider" style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#e0e0e0',
              borderRadius: '2px',
              position: 'relative',
            }}>
              <div style={{
                width: `${sliderPercent}%`,
                height: '100%',
                backgroundColor: partColor(component, 'indicator', '#2196F3'),
                borderRadius: '2px',
              }} />
            </div>
            <div style={{
              position: 'absolute',
              left: `calc(${sliderPercent}% - 8px)`,
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: partColor(component, 'knob', '#2196F3'),
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>
        );
      }
      
      // A rectangle is nothing but its frame: the wrapper below already paints
      // the fill, border, radius, gradient and shadow from its styles, so
      // there is no inner content to draw.
      case 'rectangle':
        return null;

      case 'circle': {
        // A full disc is the wrapper again, rounded all the way. A sector is a
        // path, drawn from the same geometry the preview and the generated arc
        // use — see utils/circleGeometry.ts.
        if (circleShape !== 'sector') return null;
        const size = Math.min(component.width, component.height);
        return (
          <svg
            className="lvgl-circle"
            viewBox={`0 0 ${size} ${size}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0 }}
          >
            <path
              d={sectorPath(
                size,
                props.thickness ?? 0,
                props.startAngle ?? DEFAULT_START_ANGLE,
                props.endAngle ?? DEFAULT_END_ANGLE,
              )}
              fill={resolvedBgColor}
              fillRule="evenodd"
            />
          </svg>
        );
      }

      case 'obj': {
        // Build layout styles for the container based on props.layout
        const layoutStyle: React.CSSProperties = {};
        if (props.layout === 'flex') {
          layoutStyle.display = 'flex';
          layoutStyle.flexDirection = (props.flexDirection === 'column' ? 'column' : 'row') as React.CSSProperties['flexDirection'];
          if (props.flexWrap === 'wrap' || props.flexWrap === true) {
            layoutStyle.flexWrap = 'wrap';
          } else if (props.flexWrap === 'wrap-reverse') {
            layoutStyle.flexWrap = 'wrap-reverse';
          }
          if (props.justifyContent) layoutStyle.justifyContent = props.justifyContent;
          if (props.alignItems) layoutStyle.alignItems = props.alignItems;
          if (props.alignContent) layoutStyle.alignContent = props.alignContent;
          // gap maps to lv_obj_set_style_pad_row/pad_column in codegen
          if (props.gap !== undefined && props.gap > 0) {
            layoutStyle.gap = `${props.gap}px`;
          }
        } else if (props.layout === 'grid') {
          layoutStyle.display = 'grid';
          // Parse grid template: "1fr 2fr 1fr" → CSS grid-template-columns
          if (props.gridColumns) layoutStyle.gridTemplateColumns = props.gridColumns;
          if (props.gridRows) layoutStyle.gridTemplateRows = props.gridRows;
          if (props.gridColumnGap || props.gridRowGap) {
            layoutStyle.gap = `${props.gridRowGap || 0}px ${props.gridColumnGap || 0}px`;
          }
        }
        return (
          <div className="lvgl-obj" style={{
            width: '100%',
            height: '100%',
            border: !defaultStyle.borderWidth ? '1px solid #e0e0e0' : undefined,
            position: 'relative',
            ...layoutStyle,
          }}>
            {children}
          </div>
        );
      }
      
      case 'tabview':
        return (
          <div className="lvgl-tabview" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'flex',
              borderBottom: '2px solid #e0e0e0',
              backgroundColor: '#f5f5f5',
              flexShrink: 0,
            }}>
              {(props.tabs || ['Tab 1', 'Tab 2']).map((tab: string, i: number) => (
                <div key={i} style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  borderBottom: i === (props.activeTab || 0) ? '2px solid #2196F3' : '2px solid transparent',
                  color: i === (props.activeTab || 0) ? '#2196F3' : '#666',
                  fontWeight: i === (props.activeTab || 0) ? 600 : 400,
                  marginBottom: '-2px',
                }} onClick={(e) => {
                  e.stopPropagation();
                  updateComponent(component.id, { props: { ...props, activeTab: i } });
                }}>
                  {tab}
                </div>
              ))}
            </div>
            <div className="lvgl-tabview-content" style={{ flex: 1, padding: '8px' }}>{children}</div>
          </div>
        );
      
      case 'win':
        return (
          <div className="lvgl-win" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#e8e8e8',
              borderBottom: '1px solid #ccc',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span>{shownTitle || 'Window'}</span>
              {props.showCloseBtn !== false && <span style={{ color: '#999', cursor: 'pointer' }}>✕</span>}
            </div>
            <div className="lvgl-win-content" style={{ flex: 1, padding: '8px' }}>{children}</div>
          </div>
        );
      
      case 'bar': {
        const barMin = props.min ?? 0;
        const barMax = props.max ?? 100;
        const barVal = props.value ?? 60;
        const barPercent = barMax > barMin ? Math.max(0, Math.min(100, (barVal - barMin) / (barMax - barMin) * 100)) : 0;
        return (
          <div className="lvgl-bar" style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#e0e0e0',
            borderRadius: defaultStyle.borderRadius,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${barPercent}%`,
              height: '100%',
              backgroundColor: partColor(component, 'indicator', '#2196F3'),
              borderRadius: defaultStyle.borderRadius,
              transition: 'width 0.15s',
            }} />
          </div>
        );
      }
      
      case 'arc':
        return (
          <div className="lvgl-arc" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
              {/* Both arcs are parts: the track is the main one, the value the
                  indicator. Border Color still stands in for the indicator on
                  a widget that names no part — see partColor. */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={partColor(component, 'main', '#e0e0e0')}
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={partColor(component, 'indicator', '#2196F3')}
                strokeWidth="8"
                strokeDasharray={`${(props.value || 60) * 2.51} 251`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </svg>
          </div>
        );
      
      case 'spinner':
        return (
          <div className="lvgl-spinner" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: '80%',
              height: '80%',
              border: `4px solid ${partColor(component, 'main', '#e0e0e0')}`,
              borderTopColor: partColor(component, 'indicator', '#2196F3'),
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          </div>
        );
      
      case 'chart': {
        const series = props.series || (props.data ? [{ data: props.data, color: props.lineColor || '#2196F3' }] : [{ data: [10, 20, 30, 25, 40], color: '#2196F3' }]);
        const chartData = series[0]?.data || [10, 20, 30, 25, 40];
        const chartColor = series[0]?.color || '#2196F3';
        const maxVal = Math.max(...chartData, 1);
        return (
          <div className="lvgl-chart" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-around',
            padding: '8px',
            backgroundColor: resolvedBgColor === 'transparent' ? '#ffffff' : undefined,
            border: !defaultStyle.borderWidth ? '1px solid #e0e0e0' : undefined,
            borderRadius: defaultStyle.borderRadius || 4,
            boxSizing: 'border-box',
          }}>
            {chartData.map((val: number, i: number) => (
              <div
                key={i}
                style={{
                  width: `${Math.max(8, 80 / chartData.length)}%`,
                  height: `${Math.max(2, (val / maxVal) * 100)}%`,
                  backgroundColor: chartColor,
                  borderRadius: '2px 2px 0 0',
                }}
              />
            ))}
          </div>
        );
      }
      
      case 'table':
        return (
          <div className="lvgl-table" style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            gridTemplateColumns: `repeat(${props.cols || 3}, 1fr)`,
            gridTemplateRows: `repeat(${props.rows || 3}, 1fr)`,
            gap: '1px',
            backgroundColor: '#ccc',
            border: '1px solid #ccc',
            borderRadius: defaultStyle.borderRadius || 4,
            overflow: 'hidden',
          }}>
            {Array.from({ length: (props.rows || 3) * (props.cols || 3) }).map((_, i) => (
              <div key={i} style={{
                backgroundColor: i < (props.cols || 3) && props.headerRow !== false ? '#f0f0f0' : '#fff',
                padding: '4px',
                fontSize: '10px',
                fontWeight: i < (props.cols || 3) && props.headerRow !== false ? 600 : 400,
                color: '#333',
              }}>
                {props.cellData?.[Math.floor(i / (props.cols || 3))]?.[i % (props.cols || 3)] || (i + 1)}
              </div>
            ))}
          </div>
        );
      
      case 'calendar':
        return (
          <div className="lvgl-calendar" style={{
            width: '100%',
            height: '100%',
            fontSize: '10px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: resolvedBgColor === 'transparent' ? '#ffffff' : undefined,
            border: !defaultStyle.borderWidth ? '1px solid #ddd' : undefined,
            borderRadius: defaultStyle.borderRadius || 4,
            boxSizing: 'border-box',
            overflow: 'hidden',
            color: '#333',
          }}>
            <div style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 'bold', borderBottom: '1px solid #eee', backgroundColor: '#f8f8f8' }}>
              {props.year || 2024} / {props.month || 1}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', flex: 1, padding: '2px' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => (
                <div key={`${d}-${index}`} style={{ textAlign: 'center', fontWeight: 'bold', color: '#666', padding: '2px 0' }}>{d}</div>
              ))}
              {Array.from({ length: 28 }).map((_, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '1px 0' }}>{i + 1}</div>
              ))}
            </div>
          </div>
        );
      
      case 'tileview':
        return (
          <div className="lvgl-tileview" style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            gridTemplateColumns: `repeat(${props.cols || 2}, 1fr)`,
            gridTemplateRows: `repeat(${props.rows || 2}, 1fr)`,
            gap: '2px',
            backgroundColor: '#e0e0e0',
            border: !defaultStyle.borderWidth ? '1px solid #ccc' : undefined,
            borderRadius: defaultStyle.borderRadius || 4,
            overflow: 'hidden',
          }}>
            {Array.from({ length: (props.rows || 2) * (props.cols || 2) }).map((_, i) => (
              <div key={i} style={{ backgroundColor: '#f8f8f8', border: '1px dashed #bbb' }} />
            ))}
          </div>
        );
      
      case 'video':
        return (
          <CanvasVideoContent
            fileName={props.fileName}
            autoPlay={props.autoPlay !== false}
            loop={props.loop !== false}
            textColor={defaultStyle.textColor || '#ffffff'}
          />
        );

      default:
        return <div>{type}</div>;
    }
  };

  return (
    <div
      className={`canvas-component ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${component.locked ? 'locked' : ''} ${component.visible === false ? 'hidden-component' : ''}`}
      style={componentStyle}
      onClick={(e) => onClick(e, component.id)}
      onMouseDown={(e) => onDragStart(e, component.id)}
      onMouseEnter={() => setHoveredComponent(component.id)}
      onMouseLeave={() => setHoveredComponent(null)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, component.id) : undefined}
    >
      {renderContent()}
      
      {/* Align badge */}
      {component.align && component.align !== 'default' && (
        <div className="align-badge" title={`Alignment: ${component.align}`}>
          {component.align === 'center' ? '⊕' :
           component.align === 'top_mid' ? '⬆' :
           component.align === 'bottom_mid' ? '⬇' :
           component.align === 'left_mid' ? '⬅' :
           component.align === 'right_mid' ? '➡' :
           component.align === 'top_left' ? '↖' :
           component.align === 'top_right' ? '↗' :
           component.align === 'bottom_left' ? '↙' :
           component.align === 'bottom_right' ? '↘' : '⊕'}
        </div>
      )}

      {/* Selection overlay with resize handles */}
      {isSelected && (
        <div className="selection-overlay">
          {handlesFor(component).map(handle => (
            <div
              key={handle}
              className={`resize-handle ${handle}`}
              onMouseDown={(e) => onResizeStart(e, component.id, handle)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Separate component to subscribe to resource store only for image types.
export const CanvasImageContent: React.FC<{
  src?: string;
  placeholder?: string;
  title?: string;
}> = React.memo(({ src, placeholder, title }) => {
  const images = useResourceStore((s) => s.images);
  const matched = src
    ? images.find((img) => img.id === src || img.name === src)
    : undefined;

  if (matched) {
    return (
      <div
        className="lvgl-img"
        title={title}
        style={{
          width: '100%',
          height: '100%',
          backgroundImage: `url(${matched.data})`,
          backgroundSize: '100% 100%',
        }}
      />
    );
  }

  // No image resolves yet, so nothing would be painted. Fill the widget so it
  // stays visible and clickable on the canvas — this is the only case where an
  // image widget gets an opaque background.
  return (
    <div
      className="lvgl-img placeholder"
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '6px',
        boxSizing: 'border-box',
        textAlign: 'center',
        fontSize: placeholder ? '11px' : '24px',
        color: '#777',
        backgroundColor: '#f0f0f0',
      }}
    >
      {placeholder || '🖼️'}
    </div>
  );
});

/**
 * A video on the design canvas.
 *
 * There is nothing to show: the file is on the panel's SD card, and the editor
 * has never seen it. So the widget draws what it *is* — a black frame the size
 * the picture will be, with the file it is pointed at named across it, rather
 * than a still that would be a fabrication. The badges say what the widget will
 * do when the screen loads, which is the part of the configuration that is
 * invisible in a frame.
 *
 * A widget pointed at nothing says so here, because that is the one case the
 * editor can catch before the panel does. Everything else — a name that
 * matches no file, a file that is not Motion JPEG — is the panel's to report,
 * in the same words, at the moment it looks. See docs/video-playback.md.
 */
export const CanvasVideoContent: React.FC<{
  fileName?: string;
  autoPlay?: boolean;
  loop?: boolean;
  textColor?: string;
}> = React.memo(({ fileName, autoPlay, loop, textColor }) => {
  const named = typeof fileName === 'string' ? fileName.trim() : '';

  return (
    <div
      className={`lvgl-video${named ? '' : ' unnamed'}`}
      title={named ? `Plays ${named} from the SD card` : 'No file named yet'}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        width: '100%',
        height: '100%',
        padding: '6px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        textAlign: 'center',
        color: textColor || '#ffffff',
      }}
    >
      <span className="lvgl-video-glyph" style={{ fontSize: '20px', lineHeight: 1, opacity: 0.85 }}>
        ▶
      </span>
      <span
        className="lvgl-video-name"
        style={{
          maxWidth: '100%',
          fontSize: '11px',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: named ? 0.9 : 0.6,
        }}
      >
        {named || 'No file named'}
      </span>
      {named && (autoPlay || loop) && (
        <span
          className="lvgl-video-badges"
          style={{ fontSize: '9px', letterSpacing: '0.04em', opacity: 0.6 }}
        >
          {[autoPlay ? 'AUTO' : null, loop ? 'LOOP' : null].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  );
});

export default React.memo(CanvasComponent);
