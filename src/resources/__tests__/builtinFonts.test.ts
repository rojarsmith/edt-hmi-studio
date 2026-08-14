import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILTIN_FONTS,
  BUILTIN_FONT_SIZES,
  builtinFontFor,
  builtinFontSize,
  isBuiltinFont,
  nearestBuiltinSize,
  normalizeBuiltinSizes,
} from '../builtinFonts';

/** Every lv_conf.h the editor generates against. */
const CONFIGS = [
  'firmware/stm32h747i-disco/include/lv_conf.h',
  'firmware/stm32f746g-disco/include/lv_conf.h',
  'firmware/edt-evk043027b/include/lv_conf.h',
  'wasm/lv_conf.h',
];

function enabledSizes(configPath: string): number[] {
  const text = readFileSync(join(process.cwd(), configPath), 'utf-8');
  return [...text.matchAll(/#define\s+LV_FONT_MONTSERRAT_(\d+)\s+1\b/g)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

describe('the offered sizes are the ones that exist', () => {
  // The failure this guards against is not subtle but is very late: referring
  // to a size that is switched off fails with `'lv_font_montserrat_22'
  // undeclared`, thousands of lines into a full LVGL build
  it.each(CONFIGS)('%s enables exactly the offered set', (configPath) => {
    expect(enabledSizes(configPath)).toEqual([...BUILTIN_FONT_SIZES]);
  });

  it('names them the way LV_FONT_DECLARE does', () => {
    expect(BUILTIN_FONTS).toContain('montserrat_24');
    expect(BUILTIN_FONTS).toHaveLength(BUILTIN_FONT_SIZES.length);
  });
});

describe('nearestBuiltinSize', () => {
  it('leaves a size that exists alone', () => {
    for (const size of BUILTIN_FONT_SIZES) expect(nearestBuiltinSize(size)).toBe(size);
  });

  it('snaps one that does not', () => {
    expect(nearestBuiltinSize(22)).toBe(24);
    expect(nearestBuiltinSize(8)).toBe(12);
    expect(nearestBuiltinSize(64)).toBe(32);
  });

  it('rounds a tie up, reading "about this, and no smaller"', () => {
    expect(nearestBuiltinSize(18)).toBe(20);
  });

  it('builds a name that always resolves', () => {
    expect(builtinFontFor(22)).toBe('montserrat_24');
  });
});

describe('recognising built-ins', () => {
  it('tells a built-in from a converted font', () => {
    expect(isBuiltinFont('montserrat_24')).toBe(true);
    expect(isBuiltinFont('ui_font_noto_sans_jp')).toBe(false);
  });

  it('reads the size out of the name', () => {
    expect(builtinFontSize('montserrat_24')).toBe(24);
    expect(builtinFontSize('ui_font_noto_sans_jp')).toBeUndefined();
  });
});

describe('normalizeBuiltinSizes', () => {
  it('rescues a stored size the build never had', () => {
    const [fixed] = normalizeBuiltinSizes([
      { id: 't1', name: 'Heading', fontResource: 'montserrat_22', fontSize: 22 },
    ]);
    expect(fixed.fontResource).toBe('montserrat_24');
    expect(fixed.fontSize).toBe(24);
  });

  it('leaves a custom font untouched, whatever its size', () => {
    const [same] = normalizeBuiltinSizes([
      { id: 't1', name: 'CJK', fontResource: 'ui_font_noto_sans_jp', fontSize: 22 },
    ]);
    expect(same.fontResource).toBe('ui_font_noto_sans_jp');
    expect(same.fontSize).toBe(22);
  });

  it('reaches per-language overrides, which link the same way', () => {
    const [fixed] = normalizeBuiltinSizes([
      {
        id: 't1',
        name: 'Heading',
        fontResource: 'montserrat_24',
        fontSize: 24,
        languageFonts: { ja: { fontResource: 'montserrat_26', fontSize: 26 } },
      },
    ]);
    expect(fixed.languageFonts!.ja.fontResource).toBe('montserrat_28');
    expect(fixed.languageFonts!.ja.fontSize).toBe(28);
  });

  it('returns a size that already exists unchanged', () => {
    const input = [{ id: 't1', name: 'Body', fontResource: 'montserrat_16', fontSize: 16 }];
    expect(normalizeBuiltinSizes(input)[0]).toBe(input[0]);
  });
});
