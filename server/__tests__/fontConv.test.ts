import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  buildFontConvArgs,
  resolveLvFontConvEntry,
  fontCacheKey,
  hashFontData,
  FALLBACK_RANGE,
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

describe('resolveLvFontConvEntry', () => {
  it('resolves to a file that exists, so no global install is needed', () => {
    const entry = resolveLvFontConvEntry();
    expect(entry).toMatch(/lv_font_conv\.js$/);
    expect(existsSync(entry)).toBe(true);
  });
});
