import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { deriveTextResources } from '../textResources';
import type { ProjectLanguage, Screen, TextResource, Typography } from '../../types';
import { createComponent, createScreen, defaultOptions } from './helpers';

const LANGUAGES: ProjectLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
];

const TYPOGRAPHIES: Typography[] = [
  { id: 'ty_widget', name: 'Widget', fontResource: 'montserrat_14', fontSize: 14 },
  { id: 'ty_text', name: 'FromText', fontResource: 'montserrat_28', fontSize: 28 },
];

/** One label bound to a text resource, with typographies set where asked. */
function build(textTypography?: string, widgetTypography?: string): { screens: Screen[]; texts: TextResource[] } {
  return {
    screens: [
      createScreen({
        name: 'main',
        components: [
          createComponent('label', {
            name: 'greeting',
            props: { text: 'Hello' },
            textId: 't1',
            textProp: 'text',
            typographyId: widgetTypography,
          }),
        ],
      }),
    ],
    texts: [
      { id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' }, typographyId: textTypography },
    ],
  };
}

function source(textTypography?: string, widgetTypography?: string): string {
  const { screens, texts } = build(textTypography, widgetTypography);
  return generateUiSource(
    screens, defaultOptions(), undefined, [], undefined, undefined, [], undefined, undefined,
    TYPOGRAPHIES, texts, LANGUAGES,
  );
}

describe("a text resource's typography reaches the generated style", () => {
  it('applies to a widget that carries none of its own', () => {
    expect(source('ty_text')).toContain('lv_obj_add_style(ui_greeting, &ui_style_fromtext, 0);');
  });

  it("wins over the widget's own", () => {
    // The words and the face that suits them are chosen together; a widget
    // keeping its own would render 你好 in a Latin font
    const result = source('ty_text', 'ty_widget');
    expect(result).toContain('lv_obj_add_style(ui_greeting, &ui_style_fromtext, 0);');
    expect(result).not.toContain('lv_obj_add_style(ui_greeting, &ui_style_widget, 0);');
  });

  it("leaves the widget's own alone when the resource names none", () => {
    expect(source(undefined, 'ty_widget')).toContain('lv_obj_add_style(ui_greeting, &ui_style_widget, 0);');
  });

  it('adds no style at all when neither names one', () => {
    expect(source()).not.toContain('lv_obj_add_style(ui_greeting, &ui_style');
  });
});

describe('derived keys are unique case-insensitively', () => {
  it('separates literals whose keys would differ only in case', () => {
    // `keyFromText` lowercases, so "New Text" and "newText" both want `newtext`
    const screens = [
      createScreen({
        name: 'main',
        components: [
          createComponent('label', { name: 'a', props: { text: 'New Text' } }),
          createComponent('label', { name: 'b', props: { text: 'NEW TEXT' } }),
        ],
      }),
    ];
    const keys = deriveTextResources(screens, 'en').texts.map((text) => text.key);
    const folded = keys.map((key) => key.toLocaleUpperCase());
    expect(new Set(folded).size).toBe(keys.length);
  });
});

describe('glyphs follow the effective typography', () => {
  it("subsets a language's words into the font the resource's typography names", async () => {
    // The routing the tofu depends on: 你好 must reach the CJK override, not
    // the Latin base font, or the device renders boxes
    const { collectGlyphs } = await import('../collectGlyphs');
    const cjk: Typography = {
      id: 'ty_cjk',
      name: 'CJK',
      fontResource: 'ui_font_latin',
      fontSize: 16,
      languageFonts: { 'zh-TW': { fontResource: 'ui_font_cjk', fontSize: 16 } },
    };
    const screens = [
      createScreen({
        name: 'main',
        components: [
          createComponent('label', { name: 'greeting', props: { text: 'Hello' }, textId: 't1', textProp: 'text' }),
        ],
      }),
    ];
    const texts: TextResource[] = [
      { id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' }, typographyId: 'ty_cjk' },
    ];

    const sets = collectGlyphs({
      screens,
      texts,
      typographies: [cjk],
      fontResources: [
        { id: 'f1', name: 'Latin', family: 'L', style: 'R', sizes: [16], charsetMode: 'auto', charset: 'ascii', bpp: 4, data: '', cFontName: 'ui_font_latin', size: 1, createdAt: 1 },
        { id: 'f2', name: 'CJK', family: 'C', style: 'R', sizes: [16], charsetMode: 'auto', charset: 'ascii', bpp: 4, data: '', cFontName: 'ui_font_cjk', size: 1, createdAt: 1 },
      ],
    });

    const all = [...sets.byFontSize.values()];
    const cjkSet = all.find((set) => set.cFontName === 'ui_font_cjk');
    const latinSet = all.find((set) => set.cFontName === 'ui_font_latin');
    expect(cjkSet?.codePoints.has('你'.codePointAt(0)!)).toBe(true);
    expect(latinSet?.codePoints.has('你'.codePointAt(0)!)).toBe(false);
  });
});
