// Schematic thumbnail of a screen — a cheap SVG sketch drawn straight from
// project data, used by project and demo cards when no custom thumbnail is
// set. It deliberately draws boxes, not widgets: rendering the real canvas
// here would mean loading fonts and images for every card on the list.

import React from 'react';
import type { Screen, LvglComponent } from '../../types';

/** Fallback fill per widget type, for components with no explicit bgColor. */
const TYPE_FILLS: Record<string, string> = {
  btn: '#5c6bc0',
  slider: '#4f9d68',
  bar: '#4f9d68',
  arc: '#e0a23a',
  checkbox: '#5c6bc0',
  switch: '#5c6bc0',
  dropdown: '#3a3a5c',
  roller: '#3a3a5c',
  textarea: '#2f3542',
  label: '#9aa4b0',
  img: '#556270',
  led: '#c94f4f',
};

interface ScreenThumbnailProps {
  screen: Screen;
  /** Design-canvas size of the project's display. */
  width: number;
  height: number;
  className?: string;
}

const ScreenThumbnail: React.FC<ScreenThumbnailProps> = ({ screen, width, height, className }) => {
  const shapes: React.ReactNode[] = [];

  const draw = (component: LvglComponent, offsetX: number, offsetY: number) => {
    if (component.visible === false) return;
    const x = offsetX + component.x;
    const y = offsetY + component.y;
    const fill =
      component.styles?.default?.bgColor || TYPE_FILLS[component.type] || '#8892a0';

    if (component.type === 'arc') {
      const r = Math.min(component.width, component.height) / 2;
      shapes.push(
        <circle
          key={component.id}
          cx={x + component.width / 2}
          cy={y + component.height / 2}
          r={Math.max(r - 2, 2)}
          fill="none"
          stroke={fill}
          strokeWidth={Math.max(r / 5, 2)}
          opacity={0.9}
        />,
      );
    } else {
      const radius = component.styles?.default?.borderRadius;
      shapes.push(
        <rect
          key={component.id}
          x={x}
          y={y}
          width={Math.max(component.width, 2)}
          height={Math.max(component.height, 2)}
          rx={typeof radius === 'number' ? radius : 4}
          fill={fill}
          opacity={component.type === 'label' ? 0.55 : 0.9}
        />,
      );
    }

    for (const child of component.children ?? []) {
      draw(child, x, y);
    }
  };

  for (const component of screen.components ?? []) {
    draw(component, 0, 0);
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${screen.name} preview`}
    >
      <rect x={0} y={0} width={width} height={height} fill={screen.backgroundColor ?? '#F5F5F5'} />
      {shapes}
    </svg>
  );
};

export default ScreenThumbnail;
