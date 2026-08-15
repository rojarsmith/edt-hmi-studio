import { describe, it, expect } from 'vitest';
import { parseWildcardRanges, collectTypographyWildcards } from '../typographyWildcards';
import { buildFontCompileRequests } from '../fontRequests';
import { generateUiSource } from '../templates/ui.c';
import type { Typography } from '../../types';
import { createFontResource, createScreen, createComponent, defaultOptions } from './helpers';

describe('parseWildcardRanges', () => {
  it('reads a literal-character range as the characters, not the code points', () => {
    // Decimal 0–9 would be nine control characters, which nobody has ever meant
    expect(parseWildcardRanges('0-9').ranges).toEqual(['0x30-0x39']);
  });

  it('passes hex through, normalised', () => {
    expect(parseWildcardRanges('0x4E00-0x9FFF').ranges).toEqual(['0x4e00-0x9fff']);
  });

  it('takes single characters and single hex values', () => {
    expect(parseWildcardRanges('°, 0x2103').ranges).toEqual(['0xb0', '0x2103']);
  });

  it('mixes forms across commas and whitespace', () => {
    expect(parseWildcardRanges('0-9 A-Z,0x20AC').ranges).toEqual([
      '0x30-0x39', '0x41-0x5a', '0x20ac',
    ]);
  });

  it('reports what it cannot read instead of dropping it silently', () => {
    const { ranges, invalid } = parseWildcardRanges('0-9, abc, 9-0');
    expect(ranges).toEqual(['0x30-0x39']);
    expect(invalid).toEqual(['abc', '9-0']);
  });

  it('reads an empty declaration as nothing at all', () => {
    expect(parseWildcardRanges('')).toEqual({ ranges: [], invalid: [] });
  });
});

const CJK_TYPOGRAPHY: Typography = {
  id: 'ty1',
  name: 'Body',
  fontResource: 'ui_font_latin',
  fontSize: 16,
  wildcardCharacters: '°℃',
  wildcardRanges: '0-9',
  fallbackCharacter: '?',
  languages: { 'zh-TW': { fontResource: 'ui_font_cjk' } },
};

describe('collectTypographyWildcards', () => {
  const customFonts = new Set(['ui_font_latin', 'ui_font_cjk']);

  it('sends the declaration to every font the typography resolves to', () => {
    // A runtime value can arrive while any language is active
    const byFont = collectTypographyWildcards([CJK_TYPOGRAPHY], customFonts);
    for (const name of ['ui_font_latin', 'ui_font_cjk']) {
      const entry = byFont.get(name)!;
      expect(entry.ranges).toEqual(['0x30-0x39']);
      expect(entry.codePoints.has('°'.codePointAt(0)!)).toBe(true);
    }
  });

  it('carries the fallback character with them', () => {
    // It is only drawn when a wildcard value misses, and it can only be drawn
    // if it was converted in
    const byFont = collectTypographyWildcards([CJK_TYPOGRAPHY], customFonts);
    expect(byFont.get('ui_font_cjk')!.codePoints.has(0x3f)).toBe(true);
  });

  it('skips built-in Montserrat, which is compiled in rather than converted', () => {
    const typography: Typography = {
      ...CJK_TYPOGRAPHY, fontResource: 'montserrat_16', languages: undefined,
    };
    expect(collectTypographyWildcards([typography], customFonts).size).toBe(0);
  });

  it('contributes nothing for a typography that declares nothing', () => {
    const plain: Typography = { id: 't', name: 'P', fontResource: 'ui_font_latin', fontSize: 16 };
    expect(collectTypographyWildcards([plain], customFonts).size).toBe(0);
  });

  // TouchGFX's shape: each tab declares its own, inheritance fills the rest
  it("a tab's own declaration replaces the Default's for that language", () => {
    const typography: Typography = {
      ...CJK_TYPOGRAPHY,
      languages: {
        'zh-TW': {
          fontResource: 'ui_font_cjk',
          wildcardCharacters: '你',
          wildcardRanges: '0x4E00-0x9FFF',
        },
      },
    };
    const byFont = collectTypographyWildcards([typography], customFonts);
    const cjk = byFont.get('ui_font_cjk')!;
    expect(cjk.codePoints.has('你'.codePointAt(0)!)).toBe(true);
    expect(cjk.ranges).toEqual(['0x4e00-0x9fff']);
    // The Default's characters stay out of a font whose language declared its own…
    expect(cjk.codePoints.has('°'.codePointAt(0)!)).toBe(false);
    // …but its fallback character still arrives, since the tab did not override it
    expect(cjk.codePoints.has(0x3f)).toBe(true);
    expect(byFont.get('ui_font_latin')!.codePoints.has('°'.codePointAt(0)!)).toBe(true);
  });

  it('a wildcard-only tab lands its characters in the font it resolves to', () => {
    const typography: Typography = {
      id: 'ty2', name: 'Body', fontResource: 'ui_font_latin', fontSize: 16,
      languages: { ar: { wildcardCharacters: '٪' } },
    };
    const byFont = collectTypographyWildcards([typography], customFonts);
    expect(byFont.get('ui_font_latin')!.codePoints.has('٪'.codePointAt(0)!)).toBe(true);
  });
});

describe('wildcards reach the conversion request', () => {
  const font = createFontResource({ cFontName: 'ui_font_latin', charsetMode: 'auto' });
  const sizes = new Map([['ui_font_latin', new Set([16])]]);

  it('appends ranges as ranges, never expanded into symbols', () => {
    // A declared CJK block is tens of thousands of characters; Windows cuts a
    // command line off at 32k
    const big: Typography = {
      ...CJK_TYPOGRAPHY, languages: undefined, wildcardCharacters: undefined,
      wildcardRanges: '0x4E00-0x9FFF', fallbackCharacter: undefined,
    };
    const [request] = buildFontCompileRequests([font], sizes, undefined, [big]);
    expect(request.ranges).toContain('0x4e00-0x9fff');
    expect(request.variants[0].symbols ?? '').not.toContain('一');
  });

  it('merges characters into every size variant', () => {
    const [request] = buildFontCompileRequests([font], sizes, undefined, [
      { ...CJK_TYPOGRAPHY, languages: undefined },
    ]);
    expect(request.variants[0].symbols).toContain('°');
    expect(request.variants[0].symbols).toContain('?');
  });

  it('unions with a manual charset rather than being overridden by it', () => {
    const manual = createFontResource({
      cFontName: 'ui_font_latin', charsetMode: 'manual', extraRanges: '0x20-0x7e',
    });
    const [request] = buildFontCompileRequests([manual], sizes, undefined, [
      { ...CJK_TYPOGRAPHY, languages: undefined },
    ]);
    expect(request.ranges).toBe('0x20-0x7e,0x30-0x39');
    expect(request.variants[0].symbols).toContain('°');
  });
});

describe('fallback character codegen', () => {
  const generate = (typography: Typography) =>
    generateUiSource(
      [createScreen({ name: 'main', components: [
        createComponent('label', { name: 'value', props: { text: 'X' }, typographyId: typography.id }),
      ] })],
      defaultOptions({ generateComments: false }),
      undefined, [], undefined, undefined, [], undefined, undefined,
      [typography], [], [],
    );

  it('builds the chain: style -> source copy -> one-character substitute', () => {
    const result = generate(CJK_TYPOGRAPHY);
    expect(result).toContain('static lv_font_t ui_style_body_fb1;');
    expect(result).toContain('static lv_font_t ui_style_body_fbsub1;');
    expect(result).toContain('lv_memcpy(&ui_style_body_fbsub1, &ui_font_latin_16, sizeof(lv_font_t));');
    expect(result).toContain('ui_style_body_fbsub1.get_glyph_dsc = ui_style_body_fb_dsc;');
    expect(result).toContain('ui_style_body_fbsub1.fallback = NULL;');
    expect(result).toContain('ui_style_body_fb1.fallback = &ui_style_body_fbsub1;');
    expect(result).toContain('lv_style_set_text_font(&ui_style_body, &ui_style_body_fb1);');
  });

  it('answers every letter with the declared character', () => {
    expect(generate(CJK_TYPOGRAPHY)).toContain(
      'return lv_font_get_glyph_dsc_fmt_txt(font, dsc, 0x3f, letter_next);',
    );
  });

  it('gives each language font its own chain, switched with the language', () => {
    const result = generate(CJK_TYPOGRAPHY);
    // Two fonts resolved (default + zh-TW), so two chains
    expect(result).toContain('static lv_font_t ui_style_body_fb2;');
    expect(result).toContain('lv_memcpy(&ui_style_body_fb2, &ui_font_cjk_16, sizeof(lv_font_t));');
    // The language switch points at the copies, not the raw fonts
    expect(result).toContain('lv_style_set_text_font(&ui_style_body, &ui_style_body_fb2);');
    expect(result).not.toContain('lv_style_set_text_font(&ui_style_body, &ui_font_cjk_16);');
  });

  it('emits none of it for a typography without a fallback character', () => {
    const plain: Typography = { ...CJK_TYPOGRAPHY, fallbackCharacter: undefined };
    const result = generate(plain);
    expect(result).not.toContain('_fbsub');
    expect(result).not.toContain('lv_font_get_glyph_dsc_fmt_txt');
    expect(result).toContain('lv_style_set_text_font(&ui_style_body, &ui_font_latin_16);');
  });

  it('a language with its own fallback character gets its own wrapper', () => {
    const typography: Typography = {
      ...CJK_TYPOGRAPHY,
      languages: { 'zh-TW': { fontResource: 'ui_font_cjk', fallbackCharacter: '？' } },
    };
    const result = generate(typography);
    // The Default's '?' and 繁體's full-width '？', one wrapper each, and the
    // CJK copy wired to the language's own character
    expect(result).toContain('return lv_font_get_glyph_dsc_fmt_txt(font, dsc, 0x3f, letter_next);');
    expect(result).toContain('return lv_font_get_glyph_dsc_fmt_txt(font, dsc, 0xff1f, letter_next);');
    expect(result).toContain('ui_style_body_fbsub1.get_glyph_dsc = ui_style_body_fb_dsc;');
    expect(result).toContain('ui_style_body_fbsub2.get_glyph_dsc = ui_style_body_fb_dsc2;');
  });

  it('a wildcard-only language override generates no language switching', () => {
    // Its whole effect is extra characters in the converted font; the style
    // never changes at runtime, so no branch and no callback are emitted
    const typography: Typography = {
      id: 'ty3', name: 'Quiet', fontResource: 'ui_font_latin', fontSize: 16,
      languages: { ar: { wildcardCharacters: '٪' } },
    };
    const result = generate(typography);
    expect(result).not.toContain('ui_typography_apply_language_fonts');
  });
});
