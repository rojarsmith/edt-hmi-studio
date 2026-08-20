// A polygon is a closed line plus a fill drawn under it: LVGL has no polygon
// widget and no filled-polygon primitive, so the outline is lv_line and the
// fill is a fan of triangles drawn before the widget strokes itself.

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import type { LvglComponent } from '../../types';
import { defaultOptions, createScreen, createComponent } from './helpers';

const diamond = [[50, 0], [100, 50], [50, 100], [0, 50]];

function polygon(props: Record<string, unknown> = {}, bgColor = '#E0E0E0'): LvglComponent {
  return createComponent('polygon', {
    id: 'p1',
    name: 'Shape 1',
    width: 100,
    height: 100,
    props: { points: diamond, lineWidth: 2, lineColor: '#212121', ...props },
    styles: { default: { bgColor, borderWidth: 0, opacity: 1 } },
  });
}

const source = (comp: LvglComponent) =>
  generateUiSource([createScreen({ name: 'Home', components: [comp] })], defaultOptions());

describe('a generated polygon', () => {
  it('is a line widget', () => {
    expect(source(polygon())).toContain('ui_shape_1 = lv_line_create(ui_screen_home);');
  });

  it('closes the run by repeating the first point', () => {
    // lv_line draws an open polyline, so the shape is closed here rather than
    // by the widget.
    expect(source(polygon())).toContain(
      'static lv_point_precise_t ui_shape_1_points[5] = {{50, 0}, {100, 50}, {50, 100}, {0, 50}, {50, 0}};',
    );
    expect(source(polygon())).toContain('lv_line_set_points(ui_shape_1, ui_shape_1_points, 5);');
  });

  it('rounds the points on the way out', () => {
    // lv_point_precise_t is a float only where LV_USE_FLOAT is set; the editor
    // keeps the precision, the panel gets whole pixels.
    const result = source(polygon({ points: [[40.5, 0], [80, 40.25], [0, 40]] }));
    expect(result).toContain('{{41, 0}, {80, 40}, {0, 40}, {41, 0}}');
  });

  it('fills a convex shape with a fan of triangles', () => {
    const result = source(polygon());

    expect(result).toContain('static const ui_polygon_fill_t ui_shape_1_fill = { ui_shape_1_points, 4, 0xE0E0E0 };');
    expect(result).toContain(
      'lv_obj_add_event_cb(ui_shape_1, ui_polygon_fill_cb, LV_EVENT_DRAW_MAIN_BEGIN, (void *)&ui_shape_1_fill);',
    );
    // Under the outline: the widget strokes itself on DRAW_MAIN, which is
    // after DRAW_MAIN_BEGIN.
    expect(result).toContain('lv_draw_triangle(layer, &dsc);');
  });

  it('counts the fan without the closing repeat', () => {
    // The array is five points; the fan wants the four corners.
    expect(source(polygon())).toContain('ui_shape_1_points, 4, 0xE0E0E0');
  });

  it('draws the fill where lv_line draws the outline', () => {
    // Same origin, or the two would drift apart on a scrolled parent.
    const result = source(polygon());
    expect(result).toContain('int32_t x_ofs = area.x1 - lv_obj_get_scroll_x(obj);');
    expect(result).toContain('int32_t y_ofs = area.y1 - lv_obj_get_scroll_y(obj);');
  });

  it('declares the fill after the array it points at', () => {
    const result = source(polygon());
    expect(result.indexOf('static lv_point_precise_t ui_shape_1_points'))
      .toBeLessThan(result.indexOf('static const ui_polygon_fill_t ui_shape_1_fill'));
  });

  it('leaves a concave shape unfilled', () => {
    // A fan would paint over the dent, so the panel draws the outline alone -
    // which is what the canvas shows too.
    const result = source(polygon({ points: [[0, 0], [50, 40], [100, 0], [50, 100]] }));

    expect(result).not.toContain('ui_polygon_fill_cb');
    expect(result).toContain('lv_line_set_points(ui_shape_1, ui_shape_1_points, 5);');
  });

  it('leaves it unfilled when the background is transparent', () => {
    expect(source(polygon({}, 'transparent'))).not.toContain('ui_polygon_fill_cb');
  });

  it('generates the fill callback once however many polygons need it', () => {
    const second = polygon();
    second.id = 'p2';
    second.name = 'Shape 2';
    const result = generateUiSource(
      [createScreen({ name: 'Home', components: [polygon(), second] })],
      defaultOptions(),
    );

    expect(result.split('static void ui_polygon_fill_cb').length - 1).toBe(1);
    expect(result).toContain('ui_shape_1_fill');
    expect(result).toContain('ui_shape_2_fill');
  });

  it('paints no box behind the shape', () => {
    // The style background is the fill the callback draws, not a rectangle
    // under the outline.
    const result = source(polygon());
    expect(result).toContain('lv_obj_set_style_bg_opa(ui_shape_1, LV_OPA_TRANSP, 0);');
    expect(result).not.toContain('lv_obj_set_style_bg_color(ui_shape_1');
  });

  it('strokes the outline with the line styles', () => {
    const result = source(polygon({ lineWidth: 4, lineRounded: true }));
    expect(result).toContain('lv_obj_set_style_line_width(ui_shape_1, 4, 0);');
    expect(result).toContain('lv_obj_set_style_line_color(ui_shape_1, lv_color_hex(0x212121), 0);');
    expect(result).toContain('lv_obj_set_style_line_rounded(ui_shape_1, true, 0);');
  });
});
