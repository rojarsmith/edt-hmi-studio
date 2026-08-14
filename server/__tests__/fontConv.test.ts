import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildFontConvArgs,
  resolveLvFontConvEntry,
  fontCacheKey,
  hashFontData,
  convertFonts,
  FALLBACK_RANGE,
  placeGlyphBitmapInExternalFlash,
  countFontGlyphs,
} from '../fontConv';

const base = { fontFile: '/tmp/f.ttf', outFile: '/tmp/f_16.c', size: 16, bpp: 4 };

/** The value following a flag, so assertions do not depend on argument order. */
function valueAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function valuesAfter(args: string[], flag: string): string[] {
  return args.flatMap((arg, i) => (arg === flag ? [args[i + 1]] : []));
}

describe('buildFontConvArgs', () => {
  it('passes the basics through', () => {
    const args = buildFontConvArgs({ ...base, ranges: '0x20-0x7e' });
    expect(valueAfter(args, '--font')).toBe('/tmp/f.ttf');
    expect(valueAfter(args, '--output')).toBe('/tmp/f_16.c');
    expect(valueAfter(args, '--size')).toBe('16');
    expect(valueAfter(args, '--bpp')).toBe('4');
    expect(args).toContain('--no-compress');
    expect(valueAfter(args, '--format')).toBe('lvgl');
  });

  it('emits one --range per comma-separated entry', () => {
    const args = buildFontConvArgs({ ...base, ranges: '0x20-0x7e,0x4e00-0x4eff' });
    expect(valuesAfter(args, '--range')).toEqual(['0x20-0x7e', '0x4e00-0x4eff']);
  });

  it('tolerates whitespace and empty entries in the range string', () => {
    const args = buildFontConvArgs({ ...base, ranges: ' 0x20-0x7e , ,0x30-0x39 ' });
    expect(valuesAfter(args, '--range')).toEqual(['0x20-0x7e', '0x30-0x39']);
  });

  it('passes symbols as a single argument', () => {
    const args = buildFontConvArgs({ ...base, ranges: '0x20-0x7e', symbols: '中文溫度' });
    expect(valueAfter(args, '--symbols')).toBe('中文溫度');
  });

  it('omits --symbols entirely when there are none', () => {
    expect(buildFontConvArgs({ ...base, ranges: '0x20-0x7e' })).not.toContain('--symbols');
    expect(buildFontConvArgs({ ...base, ranges: '0x20-0x7e', symbols: '' })).not.toContain('--symbols');
  });

  it('carries ranges and symbols together, since lv_font_conv unions them', () => {
    const args = buildFontConvArgs({ ...base, ranges: '0x20-0x7e', symbols: '中' });
    expect(valuesAfter(args, '--range')).toEqual(['0x20-0x7e']);
    expect(valueAfter(args, '--symbols')).toBe('中');
  });

  it('falls back to ASCII when given neither', () => {
    const args = buildFontConvArgs({ ...base, ranges: '' });
    expect(valuesAfter(args, '--range')).toEqual([FALLBACK_RANGE]);
  });

  it('does not fall back when symbols alone are given', () => {
    // A manual charset lists exactly what it wants; ASCII is not implied
    const args = buildFontConvArgs({ ...base, ranges: '', symbols: '中文' });
    expect(args).not.toContain('--range');
    expect(valueAfter(args, '--symbols')).toBe('中文');
  });

  // The reason this function exists rather than a template string
  it('keeps shell-significant characters intact and self-contained', () => {
    const nasty = 'A"B&C%D^E<F>G|H!I`J$K\\L';
    const args = buildFontConvArgs({ ...base, ranges: '', symbols: nasty });
    expect(valueAfter(args, '--symbols')).toBe(nasty);
    // The dangerous outcome is a quote swallowing a later flag
    expect(valueAfter(args, '--output')).toBe('/tmp/f_16.c');
    expect(args.filter((a) => a === '--output')).toHaveLength(1);
  });

  it('handles a large CJK set without splitting it across arguments', () => {
    const many = Array.from({ length: 800 }, (_, i) => String.fromCodePoint(0x4e00 + i * 25)).join('');
    const args = buildFontConvArgs({ ...base, ranges: '0x20-0x7e', symbols: many });
    expect(valueAfter(args, '--symbols')).toHaveLength(800);
    // The same set as ranges would be ~800 arguments and too long for cmd.exe
    expect(args.length).toBeLessThan(20);
  });
});

describe('fontCacheKey', () => {
  const spec = { fontHash: 'abc', cFontName: 'ui_font_noto', size: 16, bpp: 4, ranges: '0x20-0x7e' };

  it('is stable for the same inputs', () => {
    expect(fontCacheKey(spec)).toBe(fontCacheKey({ ...spec }));
  });

  it('ignores the order symbols arrive in', () => {
    const a = fontCacheKey({ ...spec, symbols: '中文溫度' });
    const b = fontCacheKey({ ...spec, symbols: '度溫文中' });
    expect(a).toBe(b);
  });

  it('ignores duplicated symbols', () => {
    expect(fontCacheKey({ ...spec, symbols: '中中文' })).toBe(fontCacheKey({ ...spec, symbols: '中文' }));
  });

  it('ignores range order, spacing and case', () => {
    const a = fontCacheKey({ ...spec, ranges: '0x20-0x7E,0x4E00-0x4EFF' });
    const b = fontCacheKey({ ...spec, ranges: ' 0x4e00-0x4eff , 0x20-0x7e ' });
    expect(a).toBe(b);
  });

  it.each([
    ['a different font file', { fontHash: 'def' }],
    ['a different size', { size: 24 }],
    ['a different bpp', { bpp: 2 }],
    ['different ranges', { ranges: '0x20-0x7f' }],
    ['different symbols', { symbols: '中' }],
  ])('changes for %s', (_label, override) => {
    expect(fontCacheKey({ ...spec, ...override })).not.toBe(fontCacheKey(spec));
  });

  // lv_font_conv names the global it emits after the output file
  it('changes for a different C variable name, even with identical glyphs', () => {
    expect(fontCacheKey({ ...spec, cFontName: 'ui_font_other' })).not.toBe(fontCacheKey(spec));
  });

  it('does not confuse adjacent fields', () => {
    // Without separators, ("ab", "c") and ("a", "bc") would hash the same
    const a = fontCacheKey({ ...spec, fontHash: 'ab', cFontName: 'c' });
    const b = fontCacheKey({ ...spec, fontHash: 'a', cFontName: 'bc' });
    expect(a).not.toBe(b);
  });
});

describe('hashFontData', () => {
  it('is stable and content-dependent', () => {
    const a = hashFontData(new Uint8Array([1, 2, 3]));
    expect(a).toBe(hashFontData(new Uint8Array([1, 2, 3])));
    expect(a).not.toBe(hashFontData(new Uint8Array([1, 2, 4])));
  });
});

describe('convertFonts', () => {
  it('does nothing, and spawns nothing, for an empty list', async () => {
    await expect(convertFonts([], join(tmpdir(), 'unused'))).resolves.toEqual({});
  });

  /**
   * The alternative is worse than a slow build: a font that quietly produces no
   * source still gets an LV_FONT_DECLARE in ui.h, so the failure resurfaces as
   * an undefined symbol at link time with nothing pointing back here.
   */
  it('rejects when a font cannot be converted, rather than omitting it', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'edt-fontconv-fail-'));
    try {
      const notAFont = `data:font/ttf;base64,${Buffer.from('definitely not a font').toString('base64')}`;
      await expect(
        convertFonts(
          [{ data: notAFont, cFontName: 'ui_font_broken', ranges: '0x20-0x7e', variants: [{ size: 16 }], bpp: 4 }],
          workDir,
        ),
      ).rejects.toThrow(/ui_font_broken_16/);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('resolveLvFontConvEntry', () => {
  it('resolves to a file that exists, so no global install is needed', () => {
    const entry = resolveLvFontConvEntry();
    expect(entry).toMatch(/lv_font_conv\.js$/);
    expect(existsSync(entry)).toBe(true);
  });
});

describe('placeGlyphBitmapInExternalFlash', () => {
  const DECL = 'static LV_ATTRIBUTE_LARGE_CONST const uint8_t glyph_bitmap[] = {';

  it('redefines the hook LVGL already puts on the bitmaps', () => {
    const out = placeGlyphBitmapInExternalFlash(`#include "lvgl.h"\n\n${DECL}\n0x00\n};\n`);
    expect(out).toContain('#  define LV_ATTRIBUTE_LARGE_CONST __attribute__((section(".ext_flash_fonts")))');
    expect(out).toContain(DECL);
  });

  it('guards it, so the same file still serves a board with no external flash', () => {
    const out = placeGlyphBitmapInExternalFlash(`${DECL}\n};\n`);
    expect(out).toContain('#ifdef HMI_FONTS_IN_EXTERNAL_FLASH');
    // The WASM preview and the F746 compile this too and define nothing
    expect(out.indexOf('#ifdef HMI_FONTS_IN_EXTERNAL_FLASH')).toBeLessThan(out.indexOf(DECL));
  });

  it('touches only the bitmaps, leaving the descriptors in internal flash', () => {
    // They are read on every glyph lookup; a memory-mapped QSPI read is the
    // wrong place for them, and they are small
    const source = `${DECL}\n};\nstatic const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {\n};\n`;
    const out = placeGlyphBitmapInExternalFlash(source);
    expect(out).toContain('static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {');
    expect(out.match(/#ifdef HMI_FONTS_IN_EXTERNAL_FLASH/g)).toHaveLength(1);
  });

  it('leaves a file it does not recognise exactly as it was', () => {
    const source = 'static const uint8_t something_else[] = {};\n';
    expect(placeGlyphBitmapInExternalFlash(source)).toBe(source);
  });
});

describe('countFontGlyphs', () => {
  const font = (...entries: string[]) => `
static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {
    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0} /* id = 0 reserved */,
${entries.join(',\n')}
};
`;

  it('does not count the reserved id 0, which draws the missing-glyph box', () => {
    const source = font(
      '    {.bitmap_index = 0, .adv_w = 163, .box_w = 8, .box_h = 11, .ofs_x = 1, .ofs_y = 0}',
      '    {.bitmap_index = 44, .adv_w = 124, .box_w = 8, .box_h = 8, .ofs_x = 0, .ofs_y = 0}',
    );
    expect(countFontGlyphs(source)).toBe(2);
  });

  it('reads a font carrying nothing but the reserved entry as none', () => {
    expect(countFontGlyphs(`
static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {
    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0} /* id = 0 reserved */
};
`)).toBe(0);
  });

  it('says nothing rather than guessing when the array is not there', () => {
    expect(countFontGlyphs('static const uint8_t glyph_bitmap[] = {};')).toBeUndefined();
  });

  it('stops at the end of the array, ignoring anything after it', () => {
    const source = `${font('    {.bitmap_index = 0, .adv_w = 1, .box_w = 1, .box_h = 1, .ofs_x = 0, .ofs_y = 0}')}
static const lv_font_fmt_txt_glyph_dsc_t other[] = {
    {.bitmap_index = 9, .adv_w = 9, .box_w = 9, .box_h = 9, .ofs_x = 0, .ofs_y = 0}
};
`;
    expect(countFontGlyphs(source)).toBe(1);
  });
});
