// The bundled font catalog and its persistence contract: saved copies drop
// the payload, loading restores it, and the shipped files really exist —
// a catalog entry pointing at a missing file would fail only at runtime.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_FONTS,
  BUNDLED_FONT_DIR,
  bundledFontById,
  hydrateBundledFonts,
  stripBundledFontData,
} from '../bundledFonts';
import { useResourceStore } from '../resourceStore';
import type { FontResource } from '../types';

function font(overrides: Partial<FontResource> = {}): FontResource {
  return {
    id: 'f1',
    name: 'MyFont',
    family: 'MyFont',
    style: 'Regular',
    sizes: [16],
    charsetMode: 'auto',
    charset: 'ascii',
    bpp: 4,
    data: 'data:font/opentype;base64,QUJD',
    cFontName: 'ui_font_myfont',
    size: 3,
    createdAt: 0,
    ...overrides,
  };
}

describe('bundled font catalog', () => {
  it('has unique ids and C names', () => {
    const ids = BUNDLED_FONTS.map((spec) => spec.id);
    const cNames = BUNDLED_FONTS.map((spec) => spec.cFontName);
    expect(new Set(ids).size).toBe(BUNDLED_FONTS.length);
    expect(new Set(cNames).size).toBe(BUNDLED_FONTS.length);
  });

  it('covers the scripts a Latin font cannot render at all', () => {
    const languages = BUNDLED_FONTS.flatMap((spec) => spec.languages);
    expect(languages).toContain('ja');
    expect(languages).toContain('ko');
    // Traditional Chinese, the primary market for these boards. Its absence
    // was why switching to 繁體 rendered a row of tofu with nothing in the
    // dropdown to fix it
    expect(languages).toContain('zh-TW');
    expect(languages).toContain('zh-CN');
  });

  it('lists Traditional Chinese first, the primary market for these boards', () => {
    // Array order is display order in both font dropdowns
    expect(BUNDLED_FONTS[0].id).toBe('noto-sans-tc');
  });

  it('ships every file it lists, as a real font, next to its license', () => {
    const dir = join(process.cwd(), 'public', BUNDLED_FONT_DIR);
    for (const spec of BUNDLED_FONTS) {
      const magic = readFileSync(join(dir, spec.file)).subarray(0, 4).toString('latin1');
      // OTTO is CFF OpenType; \x00\x01\x00\x00 is TrueType
      expect(['OTTO', '\x00\x01\x00\x00'], spec.file).toContain(magic);
    }
    expect(readFileSync(join(dir, 'OFL.txt'), 'utf-8')).toContain('SIL Open Font License');
  });

  it('resolves ids and rejects unknown ones', () => {
    expect(bundledFontById('noto-sans-jp')?.file).toBe('NotoSansJP-Regular.otf');
    expect(bundledFontById('nope')).toBeUndefined();
    expect(bundledFontById(undefined)).toBeUndefined();
  });
});

describe('stripBundledFontData', () => {
  it('drops the payload of a known bundled font', () => {
    const stripped = stripBundledFontData(font({ bundled: 'noto-sans-jp' }));
    expect(stripped.data).toBe('');
    expect(stripped.bundled).toBe('noto-sans-jp');
  });

  it('leaves uploaded fonts alone', () => {
    const plain = font();
    expect(stripBundledFontData(plain)).toBe(plain);
  });

  it('keeps the payload when the id is not in this catalog', () => {
    // A project from a newer app version must stay openable here
    const foreign = font({ bundled: 'font-from-the-future' });
    expect(stripBundledFontData(foreign)).toBe(foreign);
  });
});

describe('hydrateBundledFonts', () => {
  it('fills exactly the dataless bundled fonts, from the catalog file name', async () => {
    const loader = vi.fn(async (file: string) => `loaded:${file}`);
    const fonts = [
      font({ id: 'a', bundled: 'noto-sans-jp', data: '' }),
      font({ id: 'b' }),
      font({ id: 'c', bundled: 'noto-sans-kr' }), // has data already
    ];
    const result = await hydrateBundledFonts(fonts, loader);

    expect(result[0].data).toBe('loaded:NotoSansJP-Regular.otf');
    expect(result[1]).toBe(fonts[1]);
    expect(result[2]).toBe(fonts[2]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('leaves an unknown catalog id untouched', async () => {
    const loader = vi.fn();
    const foreign = font({ bundled: 'font-from-the-future', data: '' });
    const result = await hydrateBundledFonts([foreign], loader);
    expect(result[0]).toBe(foreign);
    expect(loader).not.toHaveBeenCalled();
  });

  it('restores what stripping removed', async () => {
    const original = font({ bundled: 'noto-sans-kr', data: 'data:font/opentype;base64,S1I=' });
    const stored = stripBundledFontData(original);
    const [restored] = await hydrateBundledFonts([stored], async () => original.data);
    expect(restored).toEqual(original);
  });

  it('propagates loader failures', async () => {
    const broken = font({ bundled: 'noto-sans-jp', data: '' });
    await expect(
      hydrateBundledFonts([broken], async () => { throw new Error('gone'); }),
    ).rejects.toThrow('gone');
  });
});

describe('resourceStore.addBundledFont', () => {
  beforeEach(() => {
    useResourceStore.setState({ fonts: [] });
    const bytes = Uint8Array.from([0x4f, 0x54, 0x54, 0x4f]); // "OTTO"
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })));
  });

  it('creates a resource wired for the trimming pipeline', async () => {
    const spec = BUNDLED_FONTS[0];
    const added = await useResourceStore.getState().addBundledFont(spec);

    expect(added.bundled).toBe(spec.id);
    expect(added.cFontName).toBe(spec.cFontName);
    expect(added.charsetMode).toBe('auto');
    expect(added.data).toBe('data:font/opentype;base64,T1RUTw==');
    expect(added.size).toBe(4);
    expect(useResourceStore.getState().fonts).toHaveLength(1);
  });

  it('returns the existing resource instead of adding twice', async () => {
    const spec = BUNDLED_FONTS[0];
    const first = await useResourceStore.getState().addBundledFont(spec);
    const second = await useResourceStore.getState().addBundledFont(spec);

    expect(second).toBe(first);
    expect(useResourceStore.getState().fonts).toHaveLength(1);
  });
});
