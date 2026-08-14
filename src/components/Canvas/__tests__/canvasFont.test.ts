import { describe, it, expect } from 'vitest';
import { resolveCanvasFont } from '../canvasFont';
import type { LvglComponent, Typography } from '../../../types';
import type { FontResource } from '../../../resources/types';

function component(overrides: Partial<LvglComponent> = {}): LvglComponent {
  return {
    id: 'c1', type: 'label', name: 'c1', x: 0, y: 0, width: 100, height: 30,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
    ...overrides,
  };
}

const NOTO: FontResource = {
  id: 'f1', name: 'noto', family: 'Noto Sans', style: 'Regular', sizes: [16],
  charsetMode: 'auto', charset: 'ascii', bpp: 4,
  data: 'data:font/ttf;base64,AAAA', cFontName: 'ui_font_noto', size: 0, createdAt: 0,
};

const LANGUAGES = [{ code: 'en', name: 'English' }, { code: 'zh-TW', name: '繁體中文' }];

const HEADING: Typography = {
  id: 'typo1', name: 'Heading', fontResource: 'montserrat_32', fontSize: 32,
  languageFonts: { 'zh-TW': { fontResource: 'ui_font_noto', fontSize: 28 } },
};

describe('resolveCanvasFont', () => {
  it('renders an assigned typography\'s base font', () => {
    const font = resolveCanvasFont(component({ typographyId: 'typo1' }), [HEADING], [NOTO], LANGUAGES, 'en');
    expect(font.fontFamily).toContain('Montserrat');
    expect(font.fontSize).toBe(32);
  });

  it('follows the previewed language onto the override font', () => {
    const font = resolveCanvasFont(component({ typographyId: 'typo1' }), [HEADING], [NOTO], LANGUAGES, 'zh-TW');
    expect(font.fontFamily).toBe('ui-font-f1');
    expect(font.fontSize).toBe(28);
  });

  it('lets the style font win over the props font, as ui.c emission does', () => {
    const comp = component({
      props: { fontResource: 'montserrat_14', fontSize: 14 },
      styles: { default: { textFont: 'ui_font_noto', textFontSize: 20 } },
    });
    const font = resolveCanvasFont(comp, [], [NOTO], LANGUAGES, 'en');
    expect(font.fontFamily).toBe('ui-font-f1');
    expect(font.fontSize).toBe(20);
  });

  it('takes a built-in props font\'s size from its name', () => {
    const comp = component({ props: { fontResource: 'montserrat_24', fontSize: 99 } });
    const font = resolveCanvasFont(comp, [], [], LANGUAGES, 'en');
    expect(font.fontSize).toBe(24);
  });

  it('leaves the family alone for a widget with no font at all', () => {
    const font = resolveCanvasFont(component(), [], [], LANGUAGES, 'en');
    expect(font.fontFamily).toBeUndefined();
    expect(font.fontSize).toBeUndefined();
  });

  it('falls back to the base font when the previewed language has no override', () => {
    const noOverride: Typography = { id: 'typo2', name: 'Body', fontResource: 'ui_font_noto', fontSize: 16 };
    const comp = component({ typographyId: 'typo2' });
    const font = resolveCanvasFont(comp, [noOverride], [NOTO], LANGUAGES, 'zh-TW');
    expect(font.fontFamily).toBe('ui-font-f1');
    expect(font.fontSize).toBe(16);
  });

  it('survives a typography naming a font that no longer exists', () => {
    const gone: Typography = { id: 'typo3', name: 'Gone', fontResource: 'ui_font_missing', fontSize: 16 };
    const font = resolveCanvasFont(component({ typographyId: 'typo3' }), [gone], [NOTO], LANGUAGES, 'en');
    expect(font.fontFamily).toBeUndefined();
    expect(font.fontSize).toBe(16);
  });
});
