// The tofu-before-flashing check: the canvas draws with browser fonts and
// shows every script, so a label whose device font is the built-in Montserrat
// renders 中文 perfectly in the editor and boxes on the panel. These tests pin
// what the built-in can draw and which widget/language pairs get flagged.

import { describe, it, expect } from 'vitest';
import {
  builtinFontCanDraw,
  glyphCoverageGaps,
  undrawableCharacters,
} from '../glyphCoverage';
import { typographyUsageCounts } from '../componentText';
import type {
  LvglComponent,
  ProjectLanguage,
  Screen,
  TextResource,
  Typography,
} from '../../types';

function component(id: string, overrides: Partial<LvglComponent> = {}): LvglComponent {
  return {
    id, type: 'label', name: id, x: 0, y: 0, width: 100, height: 30,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
    ...overrides,
  };
}

const languages: ProjectLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'cht', name: '繁體中文' },
];

describe('builtinFontCanDraw', () => {
  it('covers ASCII, the degree sign, the bullet and the symbol block', () => {
    expect(builtinFontCanDraw(0x20)).toBe(true);
    expect(builtinFontCanDraw(0x7e)).toBe(true);
    expect(builtinFontCanDraw(0xb0)).toBe(true); // °
    expect(builtinFontCanDraw(0x2022)).toBe(true); // •
    expect(builtinFontCanDraw(0xf00c)).toBe(true); // LV_SYMBOL_OK
  });

  it('lets control characters pass — a line break is not a box', () => {
    expect(builtinFontCanDraw(0x0a)).toBe(true);
  });

  it('draws nothing else — CJK, accents, even the ellipsis', () => {
    expect(builtinFontCanDraw(0x4e2d)).toBe(false); // 中
    expect(builtinFontCanDraw(0xe9)).toBe(false); // é
    expect(builtinFontCanDraw(0x2026)).toBe(false); // …
  });
});

describe('undrawableCharacters', () => {
  it('reports each offending character once', () => {
    expect(undrawableCharacters('中文中文 ok\n')).toEqual(['中', '文']);
    expect(undrawableCharacters('all ascii')).toEqual([]);
  });
});

describe('glyphCoverageGaps', () => {
  const resource = (typographyId?: string): TextResource => ({
    id: 't1',
    key: 'greeting',
    values: { en: 'Hello', cht: '你好' },
    typographyId,
  });

  it('flags a literal the built-in cannot draw, naming no typography', () => {
    const comp = component('a', { props: { text: '中文' } });
    const gaps = glyphCoverageGaps(comp, [], [], languages);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].language).toBeNull();
    expect(gaps[0].characters).toEqual(['中', '文']);
    expect(gaps[0].typography).toBeUndefined();
  });

  it('trusts a converted font — its character set is collected from this text', () => {
    const comp = component('a', { props: { text: '中文', fontResource: 'ui_font_noto_sans_tc' } });
    expect(glyphCoverageGaps(comp, [], [], languages)).toEqual([]);
  });

  it('checks a bound widget per language, flagging only the uncovered ones', () => {
    // Default Montserrat, no cht tab: English survives, 繁體 does not — the
    // flashed panel's two boxes, caught in the editor
    const typography: Typography = {
      id: 'ty1', name: 'Body', fontResource: 'montserrat_14', fontSize: 14,
    };
    const comp = component('a', { textId: 't1', textProp: 'text', typographyId: 'ty1' });
    const gaps = glyphCoverageGaps(comp, [resource()], [typography], languages);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].language).toBe('cht');
    expect(gaps[0].characters).toEqual(['你', '好']);
    expect(gaps[0].typography).toBe(typography);
  });

  it('clears the flag once the language has a tab with a covering font', () => {
    const typography: Typography = {
      id: 'ty1', name: 'Body', fontResource: 'montserrat_14', fontSize: 14,
      languages: { cht: { fontResource: 'ui_font_noto_sans_tc' } },
    };
    const comp = component('a', { textId: 't1', textProp: 'text', typographyId: 'ty1' });
    expect(glyphCoverageGaps(comp, [resource()], [typography], languages)).toEqual([]);
  });

  it('checks a language with no value against the words it falls back to', () => {
    // en falls back to the first language's 中文 — the firmware renders that
    // fallback in en's font, so that is what has to be drawable
    const cjkFirst: TextResource = { id: 't1', key: 'greeting', values: { cht: '你好' } };
    const cjkLanguages: ProjectLanguage[] = [languages[1], languages[0]];
    const typography: Typography = {
      id: 'ty1', name: 'Body', fontResource: 'montserrat_14', fontSize: 14,
      languages: { cht: { fontResource: 'ui_font_noto_sans_tc' } },
    };
    const comp = component('a', { textId: 't1', textProp: 'text', typographyId: 'ty1' });
    const gaps = glyphCoverageGaps(comp, [cjkFirst], [typography], cjkLanguages);
    expect(gaps.map((gap) => gap.language)).toEqual(['en']);
  });

  it('resolves the typography a text resource imposes, same as the firmware', () => {
    const typography: Typography = {
      id: 'ty1', name: 'Body', fontResource: 'montserrat_14', fontSize: 14,
    };
    const comp = component('a', { textId: 't1', textProp: 'text' });
    const gaps = glyphCoverageGaps(comp, [resource('ty1')], [typography], languages);
    expect(gaps[0]?.typography).toBe(typography);
  });
});

describe('typographyUsageCounts', () => {
  const screensOf = (...components: LvglComponent[]): Screen[] => [
    { id: 's1', name: 'Screen 1', components, backgroundColor: '#ffffff' },
  ];

  it('counts text-imposed bindings, not just the widget field', () => {
    // The regression this pins: a typography working entirely through the
    // Texts table showed "Used by 0 widgets"
    const texts: TextResource[] = [
      { id: 't1', key: 'greeting', values: {}, typographyId: 'ty1' },
    ];
    const screens = screensOf(
      component('a', { textId: 't1' }),
      component('b', { typographyId: 'ty1' }),
      component('c'),
    );
    expect(typographyUsageCounts(screens, texts).get('ty1')).toBe(2);
  });

  it('counts nested children and resolves the text-resource override', () => {
    const texts: TextResource[] = [
      { id: 't1', key: 'greeting', values: {}, typographyId: 'ty1' },
    ];
    const child = component('child', { textId: 't1', typographyId: 'ty2' });
    const screens = screensOf(component('parent', { children: [child] }));
    const counts = typographyUsageCounts(screens, texts);
    expect(counts.get('ty1')).toBe(1);
    expect(counts.get('ty2')).toBeUndefined();
  });
});
