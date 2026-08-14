import { describe, it, expect } from 'vitest';
import { generateUiHeader } from '../templates/ui.h';
import { defaultOptions, createScreen, createComponent, createFontResource } from './helpers';

describe('generateUiHeader', () => {
  it('generates include guard', () => {
    const result = generateUiHeader([], defaultOptions());
    expect(result).toContain('#ifndef UI_H');
    expect(result).toContain('#define UI_H');
    expect(result).toContain('#endif /* UI_H */');
  });

  it('includes lvgl.h', () => {
    const result = generateUiHeader([], defaultOptions());
    expect(result).toContain('#include "lvgl.h"');
  });

  it('declares ui_init', () => {
    const result = generateUiHeader([], defaultOptions());
    expect(result).toContain('void ui_init(void);');
  });

  it('declares screen extern variables', () => {
    const screens = [createScreen({ name: 'main' }), createScreen({ name: 'settings' })];
    const result = generateUiHeader(screens, defaultOptions());
    expect(result).toContain('extern lv_obj_t *ui_screen_main;');
    expect(result).toContain('extern lv_obj_t *ui_screen_settings;');
  });

  it('declares screen load functions', () => {
    const screens = [createScreen({ name: 'main' })];
    const result = generateUiHeader(screens, defaultOptions());
    expect(result).toContain('void ui_load_screen_main(void);');
  });

  it('declares component extern variables', () => {
    const btn = createComponent('btn', { name: 'myBtn' });
    const screens = [createScreen({ name: 'main', components: [btn] })];
    const result = generateUiHeader(screens, defaultOptions());
    expect(result).toContain('extern lv_obj_t *ui_my_btn;');
  });

  it('declares image-button value adapter functions', () => {
    const imageButton = createComponent('image-button', {
      name: 'modeSelect',
    });
    const screens = [
      createScreen({ name: 'main', components: [imageButton] }),
    ];
    const result = generateUiHeader(screens, defaultOptions());

    expect(result).toContain(
      'float ui_mode_select_get_value(lv_obj_t *object);',
    );
    expect(result).toContain(
      'void ui_mode_select_set_value(lv_obj_t *object, float value);',
    );
  });

  it('declares nested component variables', () => {
    const label = createComponent('label', { name: 'innerLabel' });
    const container = createComponent('obj', { name: 'container', children: [label] });
    const screens = [createScreen({ name: 'main', components: [container] })];
    const result = generateUiHeader(screens, defaultOptions());
    expect(result).toContain('extern lv_obj_t *ui_container;');
    expect(result).toContain('extern lv_obj_t *ui_inner_label;');
  });

  it('handles cross-screen same-name components with screen prefix', () => {
    const btn1 = createComponent('btn', { id: 'b1', name: 'submit' });
    const btn2 = createComponent('btn', { id: 'b2', name: 'submit' });
    const screens = [
      createScreen({ name: 'page1', components: [btn1] }),
      createScreen({ name: 'page2', components: [btn2] }),
    ];
    const result = generateUiHeader(screens, defaultOptions());
    expect(result).toContain('extern lv_obj_t *ui_page1_submit;');
    expect(result).toContain('extern lv_obj_t *ui_page2_submit;');
  });

  it('does not prefix same-name components on same screen', () => {
    const btn1 = createComponent('btn', { id: 'b1', name: 'submit' });
    const btn2 = createComponent('btn', { id: 'b2', name: 'submit' });
    const screens = [createScreen({ name: 'page1', components: [btn1, btn2] })];
    const result = generateUiHeader(screens, defaultOptions());
    // Both on same screen, no prefix needed
    expect(result).not.toContain('ui_page1_submit');
  });

  it('generates section headers when comments enabled', () => {
    const screens = [createScreen({ name: 'main', components: [createComponent('btn', { name: 'b' })] })];
    const result = generateUiHeader(screens, defaultOptions({ generateComments: true }));
    expect(result).toContain('Screen Declarations');
    expect(result).toContain('Component Declarations');
    expect(result).toContain('Function Declarations');
  });

  it('omits section headers when comments disabled', () => {
    const screens = [createScreen({ name: 'main' })];
    const result = generateUiHeader(screens, defaultOptions({ generateComments: false }));
    expect(result).not.toContain('Screen Declarations');
  });

  /** A screen whose labels use `cFontName` at each of `sizes`. */
  const screensUsing = (cFontName: string, sizes: number[]) => [
    createScreen({
      components: sizes.map((size) =>
        createComponent('label', {
          name: `lbl_${size}`,
          props: { text: 'x', fontResource: cFontName, fontSize: size },
        }),
      ),
    }),
  ];

  it('generates font declarations for the sizes in use', () => {
    const font = createFontResource({ cFontName: 'font_roboto', sizes: [16, 24] });
    const result = generateUiHeader(screensUsing('font_roboto', [16, 24]), defaultOptions(), [font]);
    expect(result).toContain('LV_FONT_DECLARE(font_roboto_16);');
    expect(result).toContain('LV_FONT_DECLARE(font_roboto_24);');
  });

  // Declarations follow usage, not the resource: an unused size is never
  // converted, so declaring it would leave an undefined symbol at link time
  it('declares only the sizes widgets actually use', () => {
    const font = createFontResource({ cFontName: 'font_roboto', sizes: [16, 24] });
    const result = generateUiHeader(screensUsing('font_roboto', [16]), defaultOptions(), [font]);
    expect(result).toContain('LV_FONT_DECLARE(font_roboto_16);');
    expect(result).not.toContain('LV_FONT_DECLARE(font_roboto_24);');
  });

  it('declares nothing for a font no widget uses', () => {
    const font = createFontResource({ cFontName: 'font_roboto', sizes: [16] });
    const result = generateUiHeader([], defaultOptions(), [font]);
    expect(result).not.toContain('LV_FONT_DECLARE');
  });

  /**
   * Every stored typography is initialised by ui_typography_init and its style
   * takes the font's address, whether or not a widget uses it yet — so a font
   * only a typography names still needs its declaration.
   */
  it('declares a font referenced only by a typography', () => {
    const font = createFontResource({ cFontName: 'font_roboto', sizes: [16] });
    const result = generateUiHeader([], defaultOptions(), [font], undefined, undefined, undefined, [
      { id: 'typo1', name: 'Heading', fontResource: 'font_roboto', fontSize: 32 },
    ]);
    expect(result).toContain('LV_FONT_DECLARE(font_roboto_32);');
  });

  it('generates font section header when comments enabled', () => {
    const font = createFontResource({ cFontName: 'font_roboto' });
    const result = generateUiHeader(
      screensUsing('font_roboto', [16]),
      defaultOptions({ generateComments: true }),
      [font],
    );
    expect(result).toContain('Font Declarations');
  });

  it('handles empty screens array', () => {
    const result = generateUiHeader([], defaultOptions());
    expect(result).toContain('#ifndef UI_H');
    expect(result).toContain('void ui_init(void);');
  });

  it('uses camelCase naming', () => {
    const btn = createComponent('btn', { name: 'my_button' });
    const screens = [createScreen({ name: 'main_page', components: [btn] })];
    const result = generateUiHeader(screens, defaultOptions({ namingStyle: 'camelCase' }));
    expect(result).toContain('ui_screen_mainPage');
    expect(result).toContain('ui_myButton');
    expect(result).toContain('ui_load_screen_mainPage');
  });
});
