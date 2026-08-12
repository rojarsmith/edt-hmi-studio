import { describe, it, expect } from 'vitest';
import {
  getCharsetRanges,
  resolveFontCharset,
  charsetCodePoints,
  migrateFontResource,
  ASCII_BASELINE,
} from '../fontConverter';
import type { CharsetType, FontResource } from '../../types';

/** A font resource as written by a build before charsetMode existed. */
function legacyFont(overrides: Partial<FontResource> = {}): FontResource {
  return {
    id: 'f1',
    name: 'legacy',
    family: 'Noto Sans',
    style: 'Regular',
    sizes: [16],
    charset: 'ascii',
    bpp: 4,
    data: 'base64',
    cFontName: 'ui_font_legacy',
    size: 1024,
    createdAt: 0,
    ...overrides,
  } as FontResource;
}

/**
 * The glyph set the pre-migration code would actually have shipped.
 *
 * Note the fallback: `getCharsetRanges` returns an empty list for a custom
 * charset with no characters, and the ASCII default was applied by its callers
 * — both `CompilePreview` and `convertFonts` carry their own copy of it. The
 * guarantee that matters is about what reached the font, so the fallback has to
 * be part of the model.
 */
function legacyCodePoints(font: FontResource): Set<number> {
  const ranges = getCharsetRanges(font.charset, font.customChars);
  const effective = ranges.length > 0 ? ranges : ([[0x20, 0x7e]] as [number, number][]);

  const out = new Set<number>();
  for (const [start, end] of effective) {
    for (let cp = start; cp <= end; cp++) out.add(cp);
  }
  return out;
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The regression guarantee: migrating a project must not change which glyphs
// end up in the font. Written before the migration existed, on purpose.
// ---------------------------------------------------------------------------

describe('migration preserves the glyph set', () => {
  const legacyCharsets: CharsetType[] = ['ascii', 'latin', 'cjk-basic'];

  it.each(legacyCharsets)('preset charset %s is unchanged', (charset) => {
    const before = legacyFont({ charset });
    const after = migrateFontResource(before);
    expect(sameSet(charsetCodePoints(resolveFontCharset(after)), legacyCodePoints(before))).toBe(true);
  });

  it('custom charset with hand-typed characters is unchanged', () => {
    const before = legacyFont({ charset: 'custom', customChars: '溫度中文ABC' });
    const after = migrateFontResource(before);
    expect(sameSet(charsetCodePoints(resolveFontCharset(after)), legacyCodePoints(before))).toBe(true);
  });

  it('custom charset with no characters falls back to ASCII, as it did before', () => {
    const before = legacyFont({ charset: 'custom', customChars: '' });
    const after = migrateFontResource(before);
    expect(sameSet(charsetCodePoints(resolveFontCharset(after)), legacyCodePoints(before))).toBe(true);
  });

  it('scattered CJK survives the round trip that used to become one range each', () => {
    const chars = '一丁七万丈三';
    const before = legacyFont({ charset: 'custom', customChars: chars });
    const after = migrateFontResource(before);
    const points = charsetCodePoints(resolveFontCharset(after));
    for (const ch of chars) expect(points.has(ch.codePointAt(0)!)).toBe(true);
  });
});

describe('migrateFontResource', () => {
  it('maps a custom charset onto manual mode, moving the characters across', () => {
    const after = migrateFontResource(legacyFont({ charset: 'custom', customChars: '中文' }));
    expect(after.charsetMode).toBe('manual');
    expect(after.extraChars).toBe('中文');
  });

  it('maps a preset charset onto preset mode, leaving the preset alone', () => {
    const after = migrateFontResource(legacyFont({ charset: 'cjk-basic' }));
    expect(after.charsetMode).toBe('preset');
    expect(after.charset).toBe('cjk-basic');
  });

  it('leaves an already-migrated font untouched', () => {
    const migrated = migrateFontResource(legacyFont({ charset: 'custom', customChars: 'AB' }));
    expect(migrateFontResource(migrated)).toEqual(migrated);
  });

  it('is idempotent', () => {
    const once = migrateFontResource(legacyFont({ charset: 'latin' }));
    const twice = migrateFontResource(migrateFontResource(legacyFont({ charset: 'latin' })));
    expect(twice).toEqual(once);
  });

  it('never silently turns an existing font into auto mode', () => {
    // Auto would change what ships for a project the author already tuned
    for (const charset of ['ascii', 'latin', 'cjk-basic', 'custom'] as CharsetType[]) {
      expect(migrateFontResource(legacyFont({ charset })).charsetMode).not.toBe('auto');
    }
  });
});

describe('resolveFontCharset — auto mode', () => {
  const autoFont = (overrides: Partial<FontResource> = {}) =>
    legacyFont({ charsetMode: 'auto', ...overrides } as Partial<FontResource>);

  it('always includes the ASCII baseline, even with nothing collected', () => {
    const points = charsetCodePoints(resolveFontCharset(autoFont()));
    expect(points.has(0x20)).toBe(true);
    expect(points.has(0x7e)).toBe(true);
    expect(points.has(0x41)).toBe(true);
  });

  it('adds the collected code points on top of the baseline', () => {
    const points = charsetCodePoints(resolveFontCharset(autoFont(), [0x4e2d, 0x6587]));
    expect(points.has(0x4e2d)).toBe(true);
    expect(points.has(0x6587)).toBe(true);
    expect(points.has(0x41)).toBe(true);
  });

  it('passes collected characters as symbols, not as ranges', () => {
    const selection = resolveFontCharset(autoFont(), [0x4e2d, 0x6587]);
    expect(selection.symbols).toBe('中文');
    expect(selection.ranges).toBe(ASCII_BASELINE);
  });

  it('keeps the symbols string sorted and deduplicated for the cache key', () => {
    const a = resolveFontCharset(autoFont(), [0x6587, 0x4e2d, 0x4e2d]).symbols;
    const b = resolveFontCharset(autoFont(), [0x4e2d, 0x6587]).symbols;
    expect(a).toBe(b);
  });

  it('honours the author\'s extra characters', () => {
    const points = charsetCodePoints(resolveFontCharset(autoFont({ extraChars: '±' })));
    expect(points.has('±'.codePointAt(0)!)).toBe(true);
  });

  it('honours the author\'s extra ranges', () => {
    const points = charsetCodePoints(resolveFontCharset(autoFont({ extraRanges: '0x3000-0x3003' })));
    expect(points.has(0x3000)).toBe(true);
    expect(points.has(0x3003)).toBe(true);
    expect(points.has(0x3004)).toBe(false);
  });

  it('does not repeat ASCII inside the symbols string', () => {
    // The baseline covers it as a range; repeating it only lengthens the command
    const selection = resolveFontCharset(autoFont(), [0x41, 0x4e2d]);
    expect(selection.symbols).toBe('中');
  });
});

describe('resolveFontCharset — preset and manual modes', () => {
  it('preset mode ignores collected characters', () => {
    const font = legacyFont({ charsetMode: 'preset', charset: 'ascii' } as Partial<FontResource>);
    const selection = resolveFontCharset(font, [0x4e2d]);
    expect(selection.symbols).toBe('');
    expect(charsetCodePoints(selection).has(0x4e2d)).toBe(false);
  });

  it('manual mode ignores collected characters', () => {
    const font = legacyFont({ charsetMode: 'manual', extraChars: 'AB' } as Partial<FontResource>);
    const selection = resolveFontCharset(font, [0x4e2d]);
    expect(charsetCodePoints(selection).has(0x4e2d)).toBe(false);
  });

  it('manual mode emits characters as symbols rather than one range each', () => {
    const font = legacyFont({ charsetMode: 'manual', extraChars: '一丁七' } as Partial<FontResource>);
    const selection = resolveFontCharset(font);
    expect(selection.symbols).toBe('一丁七');
    expect(selection.ranges).toBe('');
  });
});
