import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import {
  defaultOptions,
  createScreen,
  createComponent,
  createTheme,
  createImageResource,
  createEvent,
  createAnimation,
} from './helpers';

describe('generateUiSource', () => {
  // ─── Basic Structure ───────────────────────────────────────────

  describe('basic structure', () => {
    it('includes ui.h and ui_events.h', () => {
      const result = generateUiSource([], defaultOptions());
      expect(result).toContain('#include "ui.h"');
      expect(result).toContain('#include "ui_events.h"');
    });

    it('generates screen variable definitions', () => {
      const screens = [createScreen({ name: 'main' }), createScreen({ name: 'settings' })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_t *ui_screen_main;');
      expect(result).toContain('lv_obj_t *ui_screen_settings;');
    });

    it('generates component variable definitions', () => {
      const btn = createComponent('btn', { name: 'myBtn' });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_t *ui_my_btn;');
    });

    it('generates static screen init function', () => {
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('static void ui_screen_main_init(void)');
      expect(result).toContain('ui_screen_main = lv_obj_create(NULL);');
    });

    it('generates screen load function with lv_scr_load_anim', () => {
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('void ui_load_screen_main(void)');
      expect(result).toContain('lv_scr_load_anim(ui_screen_main,');
    });

    it('generates ui_init function', () => {
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('void ui_init(void)');
      expect(result).toContain('ui_screen_main_init();');
      expect(result).toContain('ui_load_screen_main();');
    });

    it('loads first screen in ui_init', () => {
      const screens = [createScreen({ name: 'home' }), createScreen({ name: 'settings' })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_load_screen_home();');
    });

    it('generates screen background color', () => {
      const screens = [createScreen({ name: 'main', backgroundColor: '#FF0000' })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_bg_color(ui_screen_main, lv_color_hex(0xFF0000), 0);');
    });

    it('handles empty screens array', () => {
      const result = generateUiSource([], defaultOptions());
      expect(result).toContain('void ui_init(void)');
      expect(result).toContain('#include "ui.h"');
    });
  });

  // ─── Component Creation (v9 API) ──────────────────────────────

  describe('component creation', () => {
    it('creates btn with inner label', () => {
      const btn = createComponent('btn', { name: 'myBtn', props: { text: 'Click Me' } });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_my_btn = lv_btn_create(ui_screen_main);');
      expect(result).toContain('lv_obj_t *ui_my_btn_label = lv_label_create(ui_my_btn);');
      expect(result).toContain('lv_label_set_text(ui_my_btn_label, "Click Me");');
      expect(result).toContain('lv_obj_center(ui_my_btn_label);');
    });

    it('creates label with text', () => {
      const label = createComponent('label', { name: 'title', props: { text: 'Hello World' } });
      const screens = [createScreen({ name: 'main', components: [label] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_title = lv_label_create(ui_screen_main);');
      expect(result).toContain('lv_label_set_text(ui_title, "Hello World");');
    });

    it('creates slider with range and value', () => {
      const slider = createComponent('slider', {
        name: 'vol',
        props: { min: 0, max: 200, value: 50 },
      });
      const screens = [createScreen({ name: 'main', components: [slider] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_vol = lv_slider_create(ui_screen_main);');
      expect(result).toContain('lv_slider_set_range(ui_vol, 0, 200);');
      expect(result).toContain('lv_slider_set_value(ui_vol, 50, LV_ANIM_OFF);');
    });

    it('creates bar', () => {
      const bar = createComponent('bar', {
        name: 'progress',
        props: { min: 0, max: 100, value: 75 },
      });
      const screens = [createScreen({ name: 'main', components: [bar] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_progress = lv_bar_create(ui_screen_main);');
      expect(result).toContain('lv_bar_set_value(ui_progress, 75, LV_ANIM_OFF);');
    });

    it('creates arc with angles and mode', () => {
      const arc = createComponent('arc', {
        name: 'dial',
        props: { startAngle: 0, endAngle: 270, value: 60, mode: 'reverse' },
      });
      const screens = [createScreen({ name: 'main', components: [arc] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_dial = lv_arc_create(ui_screen_main);');
      expect(result).toContain('lv_arc_set_bg_angles(ui_dial, 0, 270);');
      expect(result).toContain('lv_arc_set_value(ui_dial, 60);');
      expect(result).toContain('lv_arc_set_mode(ui_dial, LV_ARC_MODE_REVERSE);');
    });

    it('creates checkbox with text and checked state', () => {
      const cb = createComponent('checkbox', {
        name: 'agree',
        props: { text: 'I agree', checked: true },
      });
      const screens = [createScreen({ name: 'main', components: [cb] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_agree = lv_checkbox_create(ui_screen_main);');
      expect(result).toContain('lv_checkbox_set_text(ui_agree, "I agree");');
      expect(result).toContain('lv_obj_add_state(ui_agree, LV_STATE_CHECKED);');
    });

    it('creates switch with checked state', () => {
      const sw = createComponent('switch', {
        name: 'toggle',
        props: { checked: true },
      });
      const screens = [createScreen({ name: 'main', components: [sw] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_toggle = lv_switch_create(ui_screen_main);');
      expect(result).toContain('lv_obj_add_state(ui_toggle, LV_STATE_CHECKED);');
    });

    it('creates textarea with placeholder, password, oneLine (v9)', () => {
      const ta = createComponent('textarea', {
        name: 'input',
        props: { placeholder: 'Enter text', password: true, oneLine: true },
      });
      const screens = [createScreen({ name: 'main', components: [ta] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      expect(result).toContain('ui_input = lv_textarea_create(ui_screen_main);');
      expect(result).toContain('lv_textarea_set_placeholder_text(ui_input, "Enter text");');
      expect(result).toContain('lv_textarea_set_password_mode(ui_input, true);');
      expect(result).toContain('lv_textarea_set_one_line(ui_input, true);');
    });

    it('creates textarea oneLine for v8', () => {
      const ta = createComponent('textarea', {
        name: 'input',
        props: { oneLine: true },
      });
      const screens = [createScreen({ name: 'main', components: [ta] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(result).toContain('lv_textarea_set_one_line(ui_input, true);');
    });

    it('creates dropdown with options and selected', () => {
      const dd = createComponent('dropdown', {
        name: 'color_picker',
        props: { options: ['Red', 'Green', 'Blue'], selected: 1 },
      });
      const screens = [createScreen({ name: 'main', components: [dd] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_color_picker = lv_dropdown_create(ui_screen_main);');
      expect(result).toContain('lv_dropdown_set_options(ui_color_picker, "Red\\nGreen\\nBlue");');
      expect(result).toContain('lv_dropdown_set_selected(ui_color_picker, 1);');
    });

    it('creates img with lv_image_create for v9', () => {
      const img = createComponent('img', { name: 'logo', props: { src: 'logo_img' } });
      const screens = [createScreen({ name: 'main', components: [img] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      expect(result).toContain('ui_logo = lv_image_create(ui_screen_main);');
      expect(result).toContain('lv_image_set_src(ui_logo, &logo_img);');
    });

    it('creates img with lv_img_create for v8', () => {
      const img = createComponent('img', { name: 'logo', props: { src: 'logo_img' } });
      const screens = [createScreen({ name: 'main', components: [img] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(result).toContain('ui_logo = lv_img_create(ui_screen_main);');
      expect(result).toContain('lv_img_set_src(ui_logo, &logo_img);');
    });

    it('creates a multi-state image button from image resources', () => {
      const offImage = createImageResource({
        id: 'off-image',
        cArrayName: 'img_off',
      });
      const onImage = createImageResource({
        id: 'on-image',
        cArrayName: 'img_on',
      });
      const imageButton = createComponent('image-button', {
        name: 'modeSelect',
        props: {
          states: [
            { id: 'off', name: 'Off', imageId: offImage.id, value: 10 },
            { id: 'on', name: 'On', imageId: onImage.id, value: 20 },
          ],
          initialState: 1,
          currentState: 1,
          cycleOnClick: true,
        },
      });
      const screens = [
        createScreen({ name: 'main', components: [imageButton] }),
      ];
      const result = generateUiSource(
        screens,
        defaultOptions({ lvglVersion: '9' }),
        undefined,
        [offImage, onImage],
      );

      expect(result).toContain('LV_IMAGE_DECLARE(img_off);');
      expect(result).toContain('LV_IMAGE_DECLARE(img_on);');
      expect(result).toContain(
        'ui_mode_select = lv_image_create(ui_screen_main);',
      );
      expect(result).toContain(
        'static const void *const ui_mode_select_state_images[]',
      );
      expect(result).toContain('&img_off, &img_on');
      expect(result).toContain('10, 20');
      expect(result).toContain('.current_index = 1U');
      expect(result).toContain('ui_mode_select_get_value');
      expect(result).toContain('ui_mode_select_set_value');
      expect(result).toContain('LV_EVENT_VALUE_CHANGED');
    });

    it('creates obj', () => {
      const obj = createComponent('obj', { name: 'panel' });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_panel = lv_obj_create(ui_screen_main);');
    });

    it('creates table with rows, cols, and cell data', () => {
      const table = createComponent('table', {
        name: 'data_table',
        props: {
          rows: 2,
          cols: 3,
          cellData: [['A', 'B', 'C'], ['1', '2', '3']],
        },
      });
      const screens = [createScreen({ name: 'main', components: [table] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_data_table = lv_table_create(ui_screen_main);');
      expect(result).toContain('lv_table_set_row_cnt(ui_data_table, 2);');
      expect(result).toContain('lv_table_set_col_cnt(ui_data_table, 3);');
      expect(result).toContain('lv_table_set_cell_value(ui_data_table, 0, 0, "A");');
      expect(result).toContain('lv_table_set_cell_value(ui_data_table, 1, 2, "3");');
    });

    it('creates chart with type and series', () => {
      const chart = createComponent('chart', {
        name: 'temp_chart',
        props: {
          type: 'line',
          series: [{ color: '#FF0000', data: [10, 20, 30] }],
        },
      });
      const screens = [createScreen({ name: 'main', components: [chart] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_temp_chart = lv_chart_create(ui_screen_main);');
      expect(result).toContain('lv_chart_set_type(ui_temp_chart, LV_CHART_TYPE_LINE);');
      expect(result).toContain('lv_chart_add_series(ui_temp_chart,');
      expect(result).toContain('lv_chart_set_next_value(ui_temp_chart,');
    });

    it('creates spinner with speed and arcLength (v9)', () => {
      const spinner = createComponent('spinner', {
        name: 'loader',
        props: { speed: 2000, arcLength: 90 },
      });
      const screens = [createScreen({ name: 'main', components: [spinner] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_loader = lv_spinner_create(ui_screen_main);');
      expect(result).toContain('lv_spinner_set_anim_params(ui_loader, 2000, 90);');
    });

    it('creates spinner with old API (v8)', () => {
      const spinner = createComponent('spinner', {
        name: 'loader',
        props: { speed: 2000, arcLength: 90 },
      });
      const screens = [createScreen({ name: 'main', components: [spinner] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(result).toContain('ui_loader = lv_spinner_create(ui_screen_main, 2000, 90);');
    });

    it('creates tabview with tabs for v9', () => {
      const tv = createComponent('tabview', {
        name: 'tabs',
        props: { tabs: ['Home', 'Settings'], tabPosition: 'top' },
      });
      const screens = [createScreen({ name: 'main', components: [tv] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      expect(result).toContain('ui_tabs = lv_tabview_create(ui_screen_main);');
      expect(result).toContain('lv_tabview_set_tab_bar_position(ui_tabs, LV_DIR_TOP);');
      expect(result).toContain('lv_tabview_add_tab(ui_tabs, "Home");');
      expect(result).toContain('lv_tabview_add_tab(ui_tabs, "Settings");');
    });

    it('creates tileview with tiles', () => {
      const tv = createComponent('tileview', {
        name: 'tiles',
        props: { rows: 2, cols: 2 },
      });
      const screens = [createScreen({ name: 'main', components: [tv] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_tiles = lv_tileview_create(ui_screen_main);');
      expect(result).toContain('lv_tileview_add_tile(ui_tiles, 0, 0, LV_DIR_ALL);');
      expect(result).toContain('lv_tileview_add_tile(ui_tiles, 1, 1, LV_DIR_ALL);');
    });

    it('creates win with title and close btn', () => {
      const win = createComponent('win', {
        name: 'dialog',
        props: { title: 'My Window', showCloseBtn: true },
      });
      const screens = [createScreen({ name: 'main', components: [win] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      expect(result).toContain('ui_dialog = lv_win_create(ui_screen_main);');
      expect(result).toContain('lv_win_add_title(ui_dialog, "My Window");');
      expect(result).toContain('lv_win_add_button(ui_dialog, LV_SYMBOL_CLOSE, 40);');
    });

    it('creates calendar with date', () => {
      const cal = createComponent('calendar', {
        name: 'cal',
        props: { year: 2025, month: 6 },
      });
      const screens = [createScreen({ name: 'main', components: [cal] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_cal = lv_calendar_create(ui_screen_main);');
      expect(result).toContain('lv_calendar_set_showed_date(ui_cal, 2025, 6);');
    });

    it('creates line', () => {
      const line = createComponent('line', { name: 'divider' });
      const screens = [createScreen({ name: 'main', components: [line] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('ui_divider = lv_line_create(ui_screen_main);');
    });
  });

  // ─── Style Generation ─────────────────────────────────────────

  describe('style generation', () => {
    it('generates bgColor with bg_opa COVER', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { bgColor: '#FF0000' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_bg_color(ui_box, lv_color_hex(0xFF0000), 0);');
      expect(result).toContain('lv_obj_set_style_bg_opa(ui_box, LV_OPA_COVER, 0);');
    });

    it('generates transparent bgColor with LV_OPA_TRANSP', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { bgColor: 'transparent' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_bg_opa(ui_box, LV_OPA_TRANSP, 0);');
    });

    it('generates borderColor, borderWidth, borderRadius', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { borderColor: '#00FF00', borderWidth: 2, borderRadius: 8 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_border_color(ui_box, lv_color_hex(0x00FF00), 0);');
      expect(result).toContain('lv_obj_set_style_border_width(ui_box, 2, 0);');
      expect(result).toContain('lv_obj_set_style_radius(ui_box, 8, 0);');
    });

    it('generates textColor', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { textColor: '#333333' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_text_color(ui_box, lv_color_hex(0x333333), 0);');
    });

    it('generates opacity', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { opacity: 0.5 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_opa(ui_box, 128, 0);');
    });

    it('generates padding all', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { padding: 10 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_pad_all(ui_box, 10, 0);');
    });

    it('generates individual padding directions', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { paddingTop: 5, paddingBottom: 10, paddingLeft: 15, paddingRight: 20 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_pad_top(ui_box, 5, 0);');
      expect(result).toContain('lv_obj_set_style_pad_bottom(ui_box, 10, 0);');
      expect(result).toContain('lv_obj_set_style_pad_left(ui_box, 15, 0);');
      expect(result).toContain('lv_obj_set_style_pad_right(ui_box, 20, 0);');
    });

    it('generates shadow styles', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: {
          default: {
            shadowWidth: 10,
            shadowColor: '#000000',
            shadowOffsetX: 5,
            shadowOffsetY: 5,
            shadowSpread: 2,
            shadowOpacity: 128,
          },
        },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_shadow_width(ui_box, 10, 0);');
      expect(result).toContain('lv_obj_set_style_shadow_color(ui_box, lv_color_hex(0x000000), 0);');
      expect(result).toContain('lv_obj_set_style_shadow_ofs_x(ui_box, 5, 0);');
      expect(result).toContain('lv_obj_set_style_shadow_ofs_y(ui_box, 5, 0);');
      expect(result).toContain('lv_obj_set_style_shadow_spread(ui_box, 2, 0);');
      expect(result).toContain('lv_obj_set_style_shadow_opa(ui_box, 128, 0);');
    });

    it('generates gradient styles', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { bgGradDir: 'ver', bgGradColor: '#0000FF', bgGradStop: 200 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_bg_grad_dir(ui_box, LV_GRAD_DIR_VER, 0);');
      expect(result).toContain('lv_obj_set_style_bg_grad_color(ui_box, lv_color_hex(0x0000FF), 0);');
      expect(result).toContain('lv_obj_set_style_bg_grad_stop(ui_box, 200, 0);');
    });

    it('generates outline styles', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { outlineWidth: 3, outlineColor: '#FF00FF', outlinePad: 2 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_outline_width(ui_box, 3, 0);');
      expect(result).toContain('lv_obj_set_style_outline_color(ui_box, lv_color_hex(0xFF00FF), 0);');
      expect(result).toContain('lv_obj_set_style_outline_pad(ui_box, 2, 0);');
    });

    it('generates transform rotation for v9', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { transformAngle: 450 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      expect(result).toContain('lv_obj_set_style_transform_rotation(ui_box, 450, 0);');
    });

    it('generates transform_angle for v8', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { transformAngle: 450 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(result).toContain('lv_obj_set_style_transform_angle(ui_box, 450, 0);');
    });

    it('generates transform scale_x/y for v9', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { transformZoomX: 512, transformZoomY: 300 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      expect(result).toContain('lv_obj_set_style_transform_scale_x(ui_box, 512, 0);');
      expect(result).toContain('lv_obj_set_style_transform_scale_y(ui_box, 300, 0);');
    });

    it('generates transform_zoom for v8', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { transformZoomX: 512 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(result).toContain('lv_obj_set_style_transform_zoom(ui_box, 512, 0);');
    });

    it('generates transform pivot', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { transformPivotX: 50, transformPivotY: 50 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_transform_pivot_x(ui_box, 50, 0);');
      expect(result).toContain('lv_obj_set_style_transform_pivot_y(ui_box, 50, 0);');
    });

    it('generates builtin montserrat font', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { textFont: 'montserrat_24' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_text_font(ui_box, &lv_font_montserrat_24, 0);');
    });

    it('generates custom font', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { textFont: 'my_custom_font' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_text_font(ui_box, &font_my_custom_font, 0);');
    });

    it('generates textLetterSpace and textLineSpace', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { textLetterSpace: 2, textLineSpace: 5 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_text_letter_space(ui_box, 2, 0);');
      expect(result).toContain('lv_obj_set_style_text_line_space(ui_box, 5, 0);');
    });

    it('generates textDecor underline', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { textDecor: 'underline' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_text_decor(ui_box, LV_TEXT_DECOR_UNDERLINE, 0);');
    });

    it('generates textDecor strikethrough', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { textDecor: 'strikethrough' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_text_decor(ui_box, LV_TEXT_DECOR_STRIKETHROUGH, 0);');
    });

    it('generates blendMode', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { blendMode: 'additive' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_blend_mode(ui_box, LV_BLEND_MODE_ADDITIVE, 0);');
    });

    it('generates borderSide', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { borderSide: 'bottom' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_border_side(ui_box, LV_BORDER_SIDE_BOTTOM, 0);');
    });

    it('generates pressed state styles with LV_STATE_PRESSED selector', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: {
          default: {},
          pressed: { bgColor: '#FF0000' },
        },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_bg_color(ui_box, lv_color_hex(0xFF0000), LV_STATE_PRESSED);');
    });

    it('generates focused state styles', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: {
          default: {},
          focused: { borderColor: '#0000FF', borderWidth: 3 },
        },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_border_color(ui_box, lv_color_hex(0x0000FF), LV_STATE_FOCUSED);');
      expect(result).toContain('lv_obj_set_style_border_width(ui_box, 3, LV_STATE_FOCUSED);');
    });

    it('generates disabled state styles', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: {
          default: {},
          disabled: { opacity: 0.3 },
        },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_style_opa(ui_box, 77, LV_STATE_DISABLED);');
    });
  });

  // ─── Layout ────────────────────────────────────────────────────

  describe('layout', () => {
    it('generates flex layout with flow and align', () => {
      const obj = createComponent('obj', {
        name: 'container',
        props: {
          layout: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 10,
        },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_layout(ui_container, LV_LAYOUT_FLEX);');
      expect(result).toContain('lv_obj_set_flex_flow(ui_container, LV_FLEX_FLOW_COLUMN);');
      expect(result).toContain('lv_obj_set_flex_align(ui_container, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER,');
      expect(result).toContain('lv_obj_set_style_pad_row(ui_container, 10, 0);');
      expect(result).toContain('lv_obj_set_style_pad_column(ui_container, 10, 0);');
    });

    it('generates flex wrap', () => {
      const obj = createComponent('obj', {
        name: 'container',
        props: { layout: 'flex', flexDirection: 'row', flexWrap: true },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_flex_flow(ui_container, LV_FLEX_FLOW_ROW_WRAP);');
    });

    it('generates grid layout with descriptors and LV_GRID_FR', () => {
      const obj = createComponent('obj', {
        name: 'grid',
        props: {
          layout: 'grid',
          gridColumns: '1fr 2fr 100',
          gridRows: '1fr 50',
        },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      expect(result).toContain('lv_obj_set_layout(ui_grid, LV_LAYOUT_GRID);');
      expect(result).toContain('int32_t ui_grid_col_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(2), 100, LV_GRID_TEMPLATE_LAST};');
      expect(result).toContain('int32_t ui_grid_row_dsc[] = {LV_GRID_FR(1), 50, LV_GRID_TEMPLATE_LAST};');
      expect(result).toContain('lv_obj_set_grid_dsc_array(ui_grid, ui_grid_col_dsc, ui_grid_row_dsc);');
    });

    it('uses lv_coord_t for grid descriptors in v8', () => {
      const obj = createComponent('obj', {
        name: 'grid',
        props: { layout: 'grid', gridColumns: '1fr' },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(result).toContain('lv_coord_t ui_grid_col_dsc[]');
    });

    it('generates flexGrow on child', () => {
      const child = createComponent('obj', {
        name: 'child',
        props: { flexGrow: 2 },
      });
      const screens = [createScreen({ name: 'main', components: [child] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_flex_grow(ui_child, 2);');
    });

    it('generates grid cell placement', () => {
      const child = createComponent('obj', {
        name: 'cell',
        props: { gridColumn: 1, gridRow: 0, gridColumnSpan: 2, gridRowSpan: 1 },
      });
      const screens = [createScreen({ name: 'main', components: [child] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_grid_cell(ui_cell,');
      expect(result).toContain(', 1, 2,');
      expect(result).toContain(', 0, 1);');
    });
  });

  // ─── Size Modes ────────────────────────────────────────────────

  describe('size modes', () => {
    it('generates px size with lv_obj_set_size', () => {
      const obj = createComponent('obj', { name: 'box', width: 200, height: 100 });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_size(ui_box, 200, 100);');
    });

    it('generates percent width with lv_pct', () => {
      const obj = createComponent('obj', {
        name: 'box',
        width: 50,
        height: 100,
        widthMode: 'percent',
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_width(ui_box, lv_pct(50));');
    });

    it('generates content width with LV_SIZE_CONTENT', () => {
      const obj = createComponent('obj', {
        name: 'box',
        width: 100,
        height: 50,
        widthMode: 'content',
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_width(ui_box, LV_SIZE_CONTENT);');
    });

    it('generates content height with LV_SIZE_CONTENT', () => {
      const obj = createComponent('obj', {
        name: 'box',
        width: 100,
        height: 50,
        heightMode: 'content',
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_height(ui_box, LV_SIZE_CONTENT);');
    });

    it('generates percent height with lv_pct', () => {
      const obj = createComponent('obj', {
        name: 'box',
        width: 100,
        height: 80,
        heightMode: 'percent',
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_height(ui_box, lv_pct(80));');
    });
  });

  // ─── Alignment ─────────────────────────────────────────────────

  describe('alignment', () => {
    it('generates LV_ALIGN_CENTER with offset', () => {
      const obj = createComponent('obj', {
        name: 'box',
        align: 'center',
        alignOffsetX: 10,
        alignOffsetY: -5,
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_align(ui_box, LV_ALIGN_CENTER, 10, -5);');
    });

    it('generates various alignment types', () => {
      const obj = createComponent('obj', { name: 'box', align: 'top_right' });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_align(ui_box, LV_ALIGN_TOP_RIGHT, 0, 0);');
    });

    it('does not generate alignment for default', () => {
      const obj = createComponent('obj', { name: 'box', align: 'default' });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).not.toContain('lv_obj_align(ui_box');
    });
  });

  // ─── Flags ─────────────────────────────────────────────────────

  describe('flags', () => {
    it('generates hidden flag', () => {
      const obj = createComponent('obj', { name: 'box', flags: { hidden: true } });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_add_flag(ui_box, LV_OBJ_FLAG_HIDDEN);');
    });

    it('generates disabled state', () => {
      const obj = createComponent('obj', { name: 'box', flags: { disabled: true } });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_add_state(ui_box, LV_STATE_DISABLED);');
    });

    it('clears clickable flag', () => {
      const obj = createComponent('obj', { name: 'box', flags: { clickable: false } });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_clear_flag(ui_box, LV_OBJ_FLAG_CLICKABLE);');
    });

    it('generates checkable flag', () => {
      const obj = createComponent('obj', { name: 'box', flags: { checkable: true } });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_add_flag(ui_box, LV_OBJ_FLAG_CHECKABLE);');
    });

    it('clears scrollable flag', () => {
      const obj = createComponent('obj', { name: 'box', flags: { scrollable: false } });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_clear_flag(ui_box, LV_OBJ_FLAG_SCROLLABLE);');
    });
  });

  // ─── Scrollbar Mode ────────────────────────────────────────────

  describe('scrollbar mode', () => {
    it('generates scrollbar mode off', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { scrollbarMode: 'off' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_set_scrollbar_mode(ui_box, LV_SCROLLBAR_MODE_OFF);');
    });

    it('does not generate scrollbar mode for auto (default)', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { scrollbarMode: 'auto' } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions());
      // Screens always turn their scrollbar off, so scope this to the widget.
      expect(result).not.toContain('lv_obj_set_scrollbar_mode(ui_box');
    });
  });

  // ─── Events ────────────────────────────────────────────────────

  describe('events', () => {
    it('generates event callback binding', () => {
      const btn = createComponent('btn', {
        name: 'myBtn',
        events: [createEvent({ eventType: 'LV_EVENT_CLICKED' })],
      });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_add_event_cb(ui_my_btn, ui_event_my_btn_clicked, LV_EVENT_CLICKED, NULL);');
    });

    it('generates multiple event bindings', () => {
      const slider = createComponent('slider', {
        name: 'vol',
        events: [
          createEvent({ eventType: 'LV_EVENT_VALUE_CHANGED' }),
          createEvent({ eventType: 'LV_EVENT_RELEASED' }),
        ],
      });
      const screens = [createScreen({ name: 'main', components: [slider] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_add_event_cb(ui_vol, ui_event_vol_value_changed, LV_EVENT_VALUE_CHANGED, NULL);');
      expect(result).toContain('lv_obj_add_event_cb(ui_vol, ui_event_vol_released, LV_EVENT_RELEASED, NULL);');
    });
  });

  // ─── Animations ────────────────────────────────────────────────

  describe('animations', () => {
    it('generates animation code', () => {
      const btn = createComponent('btn', {
        name: 'myBtn',
        animations: [
          createAnimation({
            name: 'fade_in',
            property: 'opa',
            startValue: 0,
            endValue: 255,
            duration: 500,
            delay: 100,
            easing: 'ease_in_out',
            repeat: 3,
          }),
        ],
      });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_anim_t ui_my_btn_anim_0;');
      expect(result).toContain('lv_anim_init(&ui_my_btn_anim_0);');
      expect(result).toContain('lv_anim_set_var(&ui_my_btn_anim_0, ui_my_btn);');
      expect(result).toContain('lv_anim_set_exec_cb(&ui_my_btn_anim_0,');
      expect(result).toContain('lv_anim_set_values(&ui_my_btn_anim_0, 0, 255);');
      expect(result).toContain('lv_anim_set_time(&ui_my_btn_anim_0, 500);');
      expect(result).toContain('lv_anim_set_delay(&ui_my_btn_anim_0, 100);');
      expect(result).toContain('lv_anim_set_path_cb(&ui_my_btn_anim_0, lv_anim_path_ease_in_out);');
      expect(result).toContain('lv_anim_set_repeat_count(&ui_my_btn_anim_0, 3);');
      expect(result).toContain('lv_anim_start(&ui_my_btn_anim_0);');
    });

    it('routes selector-taking setters through a wrapper of the right signature', () => {
      // lv_obj_set_style_opa takes (obj, value, selector); lv_anim_exec_xcb_t is
      // (void *, int32_t). Passing it directly leaves the selector undefined, so
      // the opacity lands on an arbitrary part and the animation does nothing.
      const btn = createComponent('btn', {
        name: 'fader',
        animations: [createAnimation({ property: 'opa', startValue: 0, endValue: 255 })],
      });
      const result = generateUiSource(
        [createScreen({ name: 'main', components: [btn] })],
        defaultOptions(),
      );

      expect(result).toContain('static void ui_anim_set_opa(void *object, int32_t value) {');
      expect(result).toContain('lv_obj_set_style_opa(target, (lv_opa_t)value, LV_PART_MAIN);');
      expect(result).toContain('lv_anim_set_exec_cb(&ui_fader_anim_0, ui_anim_set_opa);');
      expect(result).not.toContain('(lv_anim_exec_xcb_t)lv_obj_set_style_opa');
    });

    it('animates transforms through styles so non-image widgets work', () => {
      // lv_image_set_scale/_rotation only exist on image widgets; used on any
      // other widget they reinterpret the object, and LV_USE_ASSERT_OBJ is off.
      const btn = createComponent('btn', {
        name: 'spinner',
        animations: [
          createAnimation({ property: 'transform_zoom', startValue: 128, endValue: 256 }),
          createAnimation({ property: 'transform_angle', startValue: 0, endValue: 3600 }),
        ],
      });
      const result = generateUiSource(
        [createScreen({ name: 'main', components: [btn] })],
        defaultOptions(),
      );

      expect(result).toContain('lv_obj_set_style_transform_scale_x(target, value, LV_PART_MAIN);');
      expect(result).toContain('lv_obj_set_style_transform_scale_y(target, value, LV_PART_MAIN);');
      expect(result).toContain('lv_obj_set_style_transform_rotation(target, value, LV_PART_MAIN);');
      expect(result).not.toContain('lv_image_set_scale');
      expect(result).not.toContain('lv_image_set_rotation');
    });

    it('emits a helper only for the properties actually animated', () => {
      const btn = createComponent('btn', {
        name: 'mover',
        animations: [createAnimation({ property: 'x', startValue: 0, endValue: 100 })],
      });
      const result = generateUiSource(
        [createScreen({ name: 'main', components: [btn] })],
        defaultOptions(),
      );

      expect(result).toContain('lv_anim_set_exec_cb(&ui_mover_anim_0, (lv_anim_exec_xcb_t)lv_obj_set_x);');
      expect(result).not.toContain('ui_anim_set_opa');
      expect(result).not.toContain('Animation Helpers');
    });

    it('starts animations from LV_EVENT_SCREEN_LOADED, not from screen init', () => {
      // Screens appear through lv_scr_load_anim, so anything started during
      // init burns part of its duration before the screen is even visible and
      // is only ever seen part-way through.
      const btn = createComponent('btn', {
        name: 'slider_in',
        animations: [createAnimation({ property: 'x', startValue: -110, endValue: 0 })],
      });
      const result = generateUiSource(
        [createScreen({ name: 'main', components: [btn] })],
        defaultOptions(),
      );

      expect(result).toContain('static void ui_screen_main_start_anims(lv_event_t *event) {');
      expect(result).toContain(
        'lv_obj_add_event_cb(ui_screen_main, ui_screen_main_start_anims, LV_EVENT_SCREEN_LOADED, NULL);',
      );
      // The callback must be defined before the init function that binds it.
      expect(result.indexOf('static void ui_screen_main_start_anims'))
        .toBeLessThan(result.indexOf('lv_obj_add_event_cb(ui_screen_main,'));
      // and lv_anim_start belongs to the callback, not to the init function
      expect(result.indexOf('lv_anim_start(&ui_slider_in_anim_0);'))
        .toBeLessThan(result.indexOf('static void ui_screen_main_init'));
    });

    it('parks animated widgets on every screen load, not only the first', () => {
      // Widgets keep whatever the previous run left them at, so parking only at
      // init means a second visit to the screen shows them at their end position
      // for the whole transition before the animation resets them.
      const btn = createComponent('btn', {
        name: 'slider_in',
        x: 40,
        animations: [
          createAnimation({ property: 'x', startValue: -110, endValue: 0 }),
          createAnimation({ property: 'opa', startValue: 0, endValue: 255 }),
        ],
      });
      const result = generateUiSource(
        [createScreen({ name: 'main', components: [btn] })],
        defaultOptions(),
      );

      expect(result).toContain('static void ui_screen_main_reset_anims(lv_event_t *event) {');
      expect(result).toContain('lv_obj_set_x(ui_slider_in, -110);');
      expect(result).toContain('ui_anim_set_opa(ui_slider_in, 0);');
      expect(result).toContain(
        'lv_obj_add_event_cb(ui_screen_main, ui_screen_main_reset_anims, LV_EVENT_SCREEN_LOAD_START, NULL);',
      );
      // Parking must be bound to LOAD_START (before the transition draws) and
      // starting to LOADED (after it ends).
      expect(result.indexOf('ui_screen_main_reset_anims, LV_EVENT_SCREEN_LOAD_START'))
        .toBeLessThan(result.indexOf('ui_screen_main_start_anims, LV_EVENT_SCREEN_LOADED'));
      // The start value is no longer applied inline in the init function.
      const initAt = result.indexOf('static void ui_screen_main_init');
      expect(result.indexOf('lv_obj_set_x(ui_slider_in, -110);')).toBeLessThan(initAt);
    });

    it('clips every screen instead of letting it scroll', () => {
      // LVGL screens are scrollable by default, so a widget reaching past the
      // panel — a slide-in starting off-screen, for instance — would turn the
      // screen into a scrollable area with a scrollbar. The design canvas is a
      // fixed viewport that clips, and the firmware has to match it.
      const offEdge = createComponent('btn', { name: 'off_edge', x: 380, width: 200 });
      const result = generateUiSource(
        [
          createScreen({ name: 'main', components: [] }),
          createScreen({ name: 'screen 2', components: [offEdge] }),
        ],
        defaultOptions(),
      );

      for (const screen of ['ui_screen_main', 'ui_screen_screen_2']) {
        expect(result).toContain(`lv_obj_clear_flag(${screen}, LV_OBJ_FLAG_SCROLLABLE);`);
        expect(result).toContain(`lv_obj_set_scrollbar_mode(${screen}, LV_SCROLLBAR_MODE_OFF);`);
      }
    });

    it('omits the animation callback for screens without animations', () => {
      const result = generateUiSource(
        [createScreen({ name: 'main', components: [createComponent('btn', { name: 'plain' })] })],
        defaultOptions(),
      );

      expect(result).not.toContain('start_anims');
      expect(result).not.toContain('LV_EVENT_SCREEN_LOADED');
    });

    it('skips an unanimatable property instead of animating something else', () => {
      const btn = createComponent('btn', {
        name: 'odd',
        animations: [createAnimation({ name: 'weird', property: 'bg_color' })],
      });
      const result = generateUiSource(
        [createScreen({ name: 'main', components: [btn] })],
        defaultOptions(),
      );

      expect(result).toContain('Animation "weird" skipped: property "bg_color" is not animatable');
      expect(result).not.toContain('ui_odd_anim_0');
    });

    it('omits delay when 0', () => {
      const btn = createComponent('btn', {
        name: 'b',
        animations: [createAnimation({ delay: 0 })],
      });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).not.toContain('lv_anim_set_delay');
    });

    it('omits repeat_count when 0', () => {
      const btn = createComponent('btn', {
        name: 'b',
        animations: [createAnimation({ repeat: 0 })],
      });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).not.toContain('lv_anim_set_repeat_count');
    });
  });

  // ─── Image Resources ──────────────────────────────────────────

  describe('image resources', () => {
    it('generates LV_IMAGE_DECLARE for v9', () => {
      const imgRes = createImageResource({ name: 'logo', cArrayName: 'img_logo' });
      const img = createComponent('img', { name: 'logo_img', props: { src: imgRes.name } });
      const screens = [createScreen({ name: 'main', components: [img] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }), undefined, [imgRes]);
      expect(result).toContain('LV_IMAGE_DECLARE(img_logo);');
    });

    it('generates LV_IMG_DECLARE for v8', () => {
      const imgRes = createImageResource({ name: 'logo', cArrayName: 'img_logo' });
      const img = createComponent('img', { name: 'logo_img', props: { src: imgRes.name } });
      const screens = [createScreen({ name: 'main', components: [img] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }), undefined, [imgRes]);
      expect(result).toContain('LV_IMG_DECLARE(img_logo);');
    });

    it('uses cArrayName in lv_image_set_src', () => {
      const imgRes = createImageResource({ name: 'bg', cArrayName: 'img_background' });
      const img = createComponent('img', { name: 'bg_img', props: { src: 'bg' } });
      const screens = [createScreen({ name: 'main', components: [img] })];
      const result = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }), undefined, [imgRes]);
      expect(result).toContain('lv_image_set_src(ui_bg_img, &img_background);');
    });

    it('does not declare unused image resources', () => {
      const imgRes = createImageResource({ name: 'unused', cArrayName: 'img_unused' });
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions(), undefined, [imgRes]);
      expect(result).not.toContain('LV_IMAGE_DECLARE');
      expect(result).not.toContain('LV_IMG_DECLARE');
    });
  });

  // ─── Cross-Screen Same-Name Components ──────────────────────────

  describe('cross-screen component prefix', () => {
    it('prefixes same-name components on different screens', () => {
      const btn1 = createComponent('btn', { id: 'b1', name: 'submit' });
      const btn2 = createComponent('btn', { id: 'b2', name: 'submit' });
      const screens = [
        createScreen({ name: 'page1', components: [btn1] }),
        createScreen({ name: 'page2', components: [btn2] }),
      ];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_t *ui_page1_submit;');
      expect(result).toContain('lv_obj_t *ui_page2_submit;');
      expect(result).toContain('ui_page1_submit = lv_btn_create(ui_screen_page1);');
      expect(result).toContain('ui_page2_submit = lv_btn_create(ui_screen_page2);');
    });

    it('does not prefix unique-name components', () => {
      const btn1 = createComponent('btn', { id: 'b1', name: 'ok' });
      const btn2 = createComponent('btn', { id: 'b2', name: 'cancel' });
      const screens = [
        createScreen({ name: 'page1', components: [btn1] }),
        createScreen({ name: 'page2', components: [btn2] }),
      ];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).toContain('lv_obj_t *ui_ok;');
      expect(result).toContain('lv_obj_t *ui_cancel;');
      expect(result).not.toContain('ui_page1_ok');
      expect(result).not.toContain('ui_page2_cancel');
    });
  });

  // ─── Theme ─────────────────────────────────────────────────────

  describe('theme', () => {
    it('generates theme initialization in ui_init', () => {
      const theme = createTheme({
        colors: {
          primary: '#2196F3',
          secondary: '#FF9800',
          background: '#FFFFFF',
          surface: '#F5F5F5',
          text: '#212121',
          border: '#E0E0E0',
        },
      });
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions(), theme);
      expect(result).toContain('lv_theme_default_init(NULL, lv_color_hex(0x2196F3), lv_color_hex(0xFF9800), false, LV_FONT_DEFAULT);');
    });

    it('detects dark theme from background color', () => {
      const theme = createTheme({
        colors: {
          primary: '#BB86FC',
          secondary: '#03DAC6',
          background: '#121212',
          surface: '#1E1E1E',
          text: '#FFFFFF',
          border: '#333333',
        },
      });
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions(), theme);
      expect(result).toContain('true, LV_FONT_DEFAULT);');
    });

    it('does not generate theme code when no theme provided', () => {
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions());
      expect(result).not.toContain('lv_theme_default_init');
    });
  });

  // ─── User Code Markers ────────────────────────────────────────

  describe('user code markers', () => {
    it('generates user code markers when enabled', () => {
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions({ userCodeMarkers: true }));
      expect(result).toContain('USER_CODE_START');
      expect(result).toContain('USER_CODE_END');
    });

    it('generates screen-specific user code section', () => {
      const screens = [createScreen({ name: 'home' })];
      const result = generateUiSource(screens, defaultOptions({ userCodeMarkers: true }));
      expect(result).toContain('USER_CODE_START: home_init');
      expect(result).toContain('USER_CODE_END: home_init');
    });

    it('generates ui_init user code section', () => {
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions({ userCodeMarkers: true }));
      expect(result).toContain('USER_CODE_START: ui_init');
      expect(result).toContain('USER_CODE_END: ui_init');
    });

    it('omits user code markers when disabled', () => {
      const screens = [createScreen({ name: 'main' })];
      const result = generateUiSource(screens, defaultOptions({ userCodeMarkers: false }));
      expect(result).not.toContain('USER_CODE_START');
      expect(result).not.toContain('USER_CODE_END');
    });
  });

  // ─── v8 vs v9 Differences ─────────────────────────────────────

  describe('v8 vs v9 differences', () => {
    it('uses lv_image_create for v9 and lv_img_create for v8', () => {
      const img = createComponent('img', { name: 'pic', props: { src: 'test' } });
      const screens = [createScreen({ name: 'main', components: [img] })];
      const v9 = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      const v8 = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(v9).toContain('lv_image_create');
      expect(v8).toContain('lv_img_create');
      expect(v9).toContain('lv_image_set_src');
      expect(v8).toContain('lv_img_set_src');
    });

    it('uses transform_rotation for v9 and transform_angle for v8', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { transformAngle: 900 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const v9 = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      const v8 = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(v9).toContain('transform_rotation');
      expect(v8).toContain('transform_angle');
    });

    it('uses scale_x/y for v9 and transform_zoom for v8', () => {
      const obj = createComponent('obj', {
        name: 'box',
        styles: { default: { transformZoomX: 512 } },
      });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const v9 = generateUiSource(screens, defaultOptions({ lvglVersion: '9' }));
      const v8 = generateUiSource(screens, defaultOptions({ lvglVersion: '8' }));
      expect(v9).toContain('transform_scale_x');
      expect(v8).toContain('transform_zoom');
    });
  });

  // ─── Naming Style ─────────────────────────────────────────────

  describe('naming style', () => {
    it('uses camelCase naming when configured', () => {
      const btn = createComponent('btn', { name: 'my_button' });
      const screens = [createScreen({ name: 'main_page', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions({ namingStyle: 'camelCase' }));
      expect(result).toContain('ui_screen_mainPage');
      expect(result).toContain('ui_myButton');
    });

    it('uses snake_case naming by default', () => {
      const btn = createComponent('btn', { name: 'myButton' });
      const screens = [createScreen({ name: 'mainPage', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions({ namingStyle: 'snake_case' }));
      expect(result).toContain('ui_screen_main_page');
      expect(result).toContain('ui_my_button');
    });
  });

  // ─── Indentation ──────────────────────────────────────────────

  describe('indentation', () => {
    it('uses tabs when configured', () => {
      const obj = createComponent('obj', { name: 'box' });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ indentStyle: 'tabs' }));
      expect(result).toContain('\tui_box = lv_obj_create(ui_screen_main);');
    });

    it('uses spaces when configured', () => {
      const obj = createComponent('obj', { name: 'box' });
      const screens = [createScreen({ name: 'main', components: [obj] })];
      const result = generateUiSource(screens, defaultOptions({ indentStyle: 'spaces', indentSize: 4 }));
      expect(result).toContain('    ui_box = lv_obj_create(ui_screen_main);');
    });
  });

  // ─── Comments ─────────────────────────────────────────────────

  describe('comments', () => {
    it('generates section headers when comments enabled', () => {
      const screens = [createScreen({ name: 'main', components: [createComponent('btn', { name: 'b' })] })];
      const result = generateUiSource(screens, defaultOptions({ generateComments: true }));
      expect(result).toContain('Screen Definitions');
      expect(result).toContain('Component Definitions');
      expect(result).toContain('Screen Init Functions');
      expect(result).toContain('Screen Load Functions');
      expect(result).toContain('Main Init Function');
    });

    it('generates component creation comments', () => {
      const btn = createComponent('btn', { name: 'myBtn' });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions({ generateComments: true }));
      expect(result).toContain('// Create btn: myBtn');
    });

    it('omits comments when disabled', () => {
      const btn = createComponent('btn', { name: 'myBtn' });
      const screens = [createScreen({ name: 'main', components: [btn] })];
      const result = generateUiSource(screens, defaultOptions({ generateComments: false }));
      expect(result).not.toContain('// Create btn');
      expect(result).not.toContain('Screen Definitions');
    });
  });
});
