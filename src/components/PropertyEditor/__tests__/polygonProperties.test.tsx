// A polygon's own section: the outline it is stroked with, the points it is
// drawn from, and the warning that its fill cannot be drawn.

import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { LvglComponent } from '../../../types';
import PropertyEditor from '..';

function polygon(points: number[][]): LvglComponent {
  return {
    id: 'poly-1', type: 'polygon', name: 'Polygon 1',
    x: 10, y: 10, width: 100, height: 100,
    children: [], events: [], animations: [],
    parentId: null, locked: false, visible: true,
    props: { points, lineWidth: 2, lineColor: '#212121', lineRounded: false },
    styles: { default: { bgColor: '#E0E0E0', borderWidth: 0, opacity: 1 } },
  };
}

const diamond = [[50, 0], [100, 50], [50, 100], [0, 50]];

function setUp(points = diamond) {
  useEditorStore.setState({
    screens: [{
      id: 'screen-1', name: 'Screen 1', backgroundColor: '#fff',
      components: [polygon(points)],
    }],
    animations: [],
    selectedAnimationId: null,
    currentScreenId: 'screen-1',
    selection: { selectedIds: ['poly-1'], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
  return render(<PropertyEditor />);
}

const current = () => useEditorStore.getState().screens[0].components[0];

describe('polygon properties', () => {
  it('lists every point', () => {
    setUp();

    expect(screen.getByText('Points (4)')).toBeTruthy();
    expect((screen.getByLabelText('X', { selector: '#polygon-point-1-x' }) as HTMLInputElement).value)
      .toBe('100');
  });

  it('takes a fractional coordinate', () => {
    setUp();
    // LVGL's point is a float when LV_USE_FLOAT is on, so the editor keeps
    // what was typed rather than rounding it away.
    fireEvent.change(screen.getByLabelText('X', { selector: '#polygon-point-0-x' }), {
      target: { value: '40.5' },
    });

    expect(current().props.points[0][0]).toBe(40.5);
  });

  it('adds a corner on the closing edge', () => {
    setUp();
    fireEvent.click(screen.getByText('+ Add Point'));

    // Between the last point and the first, which is the edge the list does
    // not show.
    expect(current().props.points).toHaveLength(5);
    expect(current().props.points[4]).toEqual([25, 25]);
  });

  it('refuses to go below three points', () => {
    setUp([[0, 0], [100, 0], [50, 80]]);

    expect(screen.queryByLabelText('Delete point 1')).toBeNull();
  });

  it('resizes the box when a point moves', () => {
    setUp();
    fireEvent.change(screen.getByLabelText('X', { selector: '#polygon-point-1-x' }), {
      target: { value: '200' },
    });

    expect(current().width).toBe(200);
  });

  it('says nothing about the fill while the shape is convex', () => {
    setUp();
    expect(screen.queryByText(/turns back on itself/)).toBeNull();
  });

  it('warns that a concave shape cannot be filled', () => {
    setUp([[0, 0], [50, 40], [100, 0], [50, 100]]);

    expect(screen.getByText(/turns back on itself/)).toBeTruthy();
  });
});
