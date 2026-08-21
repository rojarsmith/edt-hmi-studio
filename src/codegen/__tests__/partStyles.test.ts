import { describe, it, expect } from 'vitest';
import { generateCode } from '../generator';
import { createScreen, createComponent } from './helpers';

/** The ui.c a single styled widget generates. */
function uiFor(component: ReturnType<typeof createComponent>): string {
  return generateCode([createScreen({ name: 'main', components: [component] })])['ui.c'];
}

describe('part styles', () => {
  it('writes a slider fill and knob through their own part selectors', () => {
    const ui = uiFor(createComponent('slider', {
      name: 'strength',
      styles: {
        default: { bgColor: '#2E2620' },
        parts: {
          indicator: { default: { bgColor: '#F0A94C' } },
          knob: { default: { bgColor: '#F7F2ED' } },
        },
      },
    }));

    expect(ui).toContain('lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0x2E2620), 0);');
    expect(ui).toContain('lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0xF0A94C), LV_PART_INDICATOR);');
    expect(ui).toContain('lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0xF7F2ED), LV_PART_KNOB);');
  });

  it('combines a part with a state selector', () => {
    const ui = uiFor(createComponent('slider', {
      name: 'strength',
      styles: {
        default: {},
        parts: { knob: { pressed: { bgColor: '#E08C2E' } } },
      },
    }));

    expect(ui).toContain(
      'lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0xE08C2E), LV_PART_KNOB | LV_STATE_PRESSED);',
    );
  });

  /**
   * The one selector a switch's on colour can live in. LVGL's theme sets the
   * primary on `LV_PART_INDICATOR | LV_STATE_CHECKED`, and a style with a
   * state beats one without it whatever order they were added in — so a
   * switch styled at rest alone turns blue the moment it is switched on.
   */
  it('writes a switch on colour against the checked state', () => {
    const ui = uiFor(createComponent('switch', {
      name: 'eco',
      styles: {
        default: { bgColor: '#3A2E25' },
        parts: { indicator: { checked: { bgColor: '#4FD1A5' } } },
      },
    }));

    expect(ui).toContain(
      'lv_obj_set_style_bg_color(ui_eco, lv_color_hex(0x4FD1A5), LV_PART_INDICATOR | LV_STATE_CHECKED);',
    );
  });

  it('writes the main part in its checked state too', () => {
    const ui = uiFor(createComponent('btn', {
      name: 'toggle',
      styles: { default: {}, checked: { bgColor: '#F0A94C' } },
    }));

    expect(ui).toContain('lv_obj_set_style_bg_color(ui_toggle, lv_color_hex(0xF0A94C), LV_STATE_CHECKED);');
  });

  it('says nothing for a widget that styles no part', () => {
    const ui = uiFor(createComponent('slider', { name: 'plain', styles: { default: {} } }));

    expect(ui).not.toContain('LV_PART_INDICATOR');
    expect(ui).not.toContain('LV_PART_KNOB');
  });

  it('ignores a part the widget does not have', () => {
    // A progress bar has no knob, so a style left on one from an earlier
    // widget type must not reach the generated code.
    const ui = uiFor(createComponent('bar', {
      name: 'level',
      styles: {
        default: {},
        parts: { knob: { default: { bgColor: '#FF0000' } } },
      },
    }));

    expect(ui).not.toContain('LV_PART_KNOB');
  });
});

describe('arc-shaped widgets', () => {
  it('draws an arc rather than a box around a spinner', () => {
    const ui = uiFor(createComponent('spinner', {
      name: 'busy',
      styles: { default: { bgColor: '#3A2E25', borderColor: '#F0A94C', borderWidth: 4 } },
    }));

    // The colour and thickness reach the arc...
    expect(ui).toContain('lv_obj_set_style_arc_color(ui_busy, lv_color_hex(0x3A2E25), LV_PART_MAIN);');
    expect(ui).toContain('lv_obj_set_style_arc_color(ui_busy, lv_color_hex(0xF0A94C), LV_PART_INDICATOR);');
    expect(ui).toContain('lv_obj_set_style_arc_width(ui_busy, 4, LV_PART_MAIN);');
    expect(ui).toContain('lv_obj_set_style_arc_width(ui_busy, 4, LV_PART_INDICATOR);');
    // ...and no box is drawn with them.
    expect(ui).not.toContain('lv_obj_set_style_border_color(ui_busy');
    expect(ui).not.toContain('lv_obj_set_style_border_width(ui_busy, 4');
  });

  it('lets a Value part override the colour Border Color stood in for', () => {
    const ui = uiFor(createComponent('arc', {
      name: 'gauge',
      styles: {
        default: { borderColor: '#2196F3', borderWidth: 12 },
        parts: { indicator: { default: { bgColor: '#4FD1A5', borderWidth: 16 } } },
      },
    }));

    const indicatorColour = ui.indexOf('lv_obj_set_style_arc_color(ui_gauge, lv_color_hex(0x4FD1A5), LV_PART_INDICATOR);');
    const standIn = ui.indexOf('lv_obj_set_style_arc_color(ui_gauge, lv_color_hex(0x2196F3), LV_PART_INDICATOR);');
    expect(indicatorColour).toBeGreaterThan(-1);
    // Later wins in LVGL, so the part has to be written after the stand-in.
    expect(indicatorColour).toBeGreaterThan(standIn);
    expect(ui).toContain('lv_obj_set_style_arc_width(ui_gauge, 16, LV_PART_INDICATOR);');
  });

  it('styles an arc knob as the box it is', () => {
    const ui = uiFor(createComponent('arc', {
      name: 'gauge',
      styles: {
        default: {},
        parts: { knob: { default: { bgColor: '#F7F2ED' } } },
      },
    }));

    expect(ui).toContain('lv_obj_set_style_bg_color(ui_gauge, lv_color_hex(0xF7F2ED), LV_PART_KNOB);');
    expect(ui).not.toContain('lv_obj_set_style_arc_color(ui_gauge, lv_color_hex(0xF7F2ED)');
  });
});
