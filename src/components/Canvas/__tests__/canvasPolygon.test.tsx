// The canvas draws a polygon the way the panel will: closed, and filled only
// when a triangle fan could cover it. A fill the device cannot draw must not
// appear here either.

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LvglComponent } from '../../../types';
import CanvasComponent from '../CanvasComponent';

function polygon(overrides: Record<string, unknown> = {}, bgColor = '#E0E0E0'): LvglComponent {
  return {
    id: 'poly-1', type: 'polygon', name: 'Polygon 1',
    x: 0, y: 0, width: 100, height: 100,
    children: [], events: [], animations: [],
    parentId: null, locked: false, visible: true,
    props: {
      points: [[50, 0], [100, 50], [50, 100], [0, 50]],
      lineWidth: 2,
      lineColor: '#212121',
      ...overrides,
    },
    styles: { default: { bgColor, borderWidth: 0, opacity: 1 } },
  };
}

const draw = (component: LvglComponent) =>
  render(
    <CanvasComponent
      component={component}
      parentWidth={480}
      parentHeight={272}
      onClick={vi.fn()}
      onDragStart={vi.fn()}
      onResizeStart={vi.fn()}
    />,
  ).container;

/** The drawn shape, which is the second of the two — the first is the hit area. */
const shape = (container: HTMLElement) =>
  container.querySelectorAll('.lvgl-polygon polygon')[1] as SVGPolygonElement;

describe('a polygon on the canvas', () => {
  it('draws its points as a closed shape', () => {
    // SVG closes a <polygon> itself, which is what the generated C does by
    // repeating the first point.
    expect(shape(draw(polygon())).getAttribute('points')).toBe('50,0 100,50 50,100 0,50');
  });

  it('fills a convex shape with the style background', () => {
    expect(shape(draw(polygon())).getAttribute('fill')).toBe('#E0E0E0');
  });

  it('leaves a concave shape unfilled, as the panel will', () => {
    const chevron = polygon({ points: [[0, 0], [50, 40], [100, 0], [50, 100]] });
    expect(shape(draw(chevron)).getAttribute('fill')).toBe('none');
  });

  it('leaves it unfilled when the background is transparent', () => {
    expect(shape(draw(polygon({}, 'transparent'))).getAttribute('fill')).toBe('none');
  });

  it('strokes the outline with the line colour', () => {
    const outline = shape(draw(polygon()));
    expect(outline.getAttribute('stroke')).toBe('#212121');
    expect(outline.getAttribute('stroke-width')).toBe('2');
  });

  it('draws no outline at all when the stroke is zero', () => {
    expect(shape(draw(polygon({ lineWidth: 0 }))).getAttribute('stroke')).toBe('none');
  });

  it('paints no box behind the shape', () => {
    // The style background is the polygon's fill, not a rectangle under it.
    const container = draw(polygon());
    const box = container.querySelector('.canvas-component') as HTMLElement;
    expect(box.style.backgroundColor).toBe('');
  });
});
