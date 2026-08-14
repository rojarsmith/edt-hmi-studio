import { describe, it, expect } from 'vitest';
import { buildFontCompileRequests } from '../fontRequests';
import { collectGlyphs } from '../collectGlyphs';
import { collectUsedCustomFonts } from '../fontUsage';
import { createComponent, createScreen, createFontResource } from './helpers';
import type { FontResource } from '../../resources/types';

const FONT = 'font_noto';

function autoFont(overrides: Partial<FontResource> = {}): FontResource {
  return createFontResource({ cFontName: FONT, charsetMode: 'auto', ...overrides });
}

/** Sizes as the font selector would report them. */
function used(...sizes: number[]): Map<string, Set<number>> {
  return new Map([[FONT, new Set(sizes)]]);
}

/** A collection where each size carries the text of a label at that size. */
function collectionFor(font: FontResource, bySize: Record<number, string>) {
  const components = Object.entries(bySize).map(([size, text]) =>
    createComponent('label', {
      name: `l${size}`,
      props: { text, fontResource: font.cFontName, fontSize: Number(size) },
    }),
  );
  return collectGlyphs({
    screens: [createScreen({ components })],
    fontResources: [font],
  });
}

describe('buildFontCompileRequests', () => {
  it('sends the font data once, however many sizes are built', () => {
    const font = autoFont();
    const [request] = buildFontCompileRequests([font], used(14, 16, 48));
    expect(request.data).toBe(font.data);
    expect(request.variants.map((v) => v.size)).toEqual([14, 16, 48]);
  });

  it('skips fonts no widget uses', () => {
    const requests = buildFontCompileRequests([autoFont()], new Map());
    expect(requests).toEqual([]);
  });

  it('orders variants by size', () => {
    const [request] = buildFontCompileRequests([autoFont()], used(48, 14, 24));
    expect(request.variants.map((v) => v.size)).toEqual([14, 24, 48]);
  });

  it('gives each size only the characters that size uses', () => {
    const font = autoFont();
    const collection = collectionFor(font, { 16: '溫度', 48: '警告' });
    const [request] = buildFontCompileRequests([font], used(16, 48), collection);

    const bySize = Object.fromEntries(request.variants.map((v) => [v.size, v.symbols]));
    expect(bySize[16]).toBe('度溫');
    expect(bySize[48]).toBe('告警');
  });

  it('keeps a size that has no text of its own', () => {
    // The generated C still refers to it, so it has to be converted
    const font = autoFont();
    const collection = collectionFor(font, { 16: '中' });
    const [request] = buildFontCompileRequests([font], used(16, 24), collection);
    expect(request.variants.map((v) => v.size)).toEqual([16, 24]);
    expect(request.variants.find((v) => v.size === 24)?.symbols).toBeUndefined();
  });

  it('puts the ASCII baseline in ranges, not in every variant', () => {
    const font = autoFont();
    const collection = collectionFor(font, { 16: 'AB中' });
    const [request] = buildFontCompileRequests([font], used(16), collection);
    expect(request.ranges).toContain('0x20-0x7e');
    expect(request.variants[0].symbols).toBe('中');
  });

  it('ignores collected glyphs for a preset font', () => {
    const font = createFontResource({ cFontName: FONT, charsetMode: 'preset', charset: 'ascii' });
    const collection = collectionFor(font, { 16: '中文' });
    const [request] = buildFontCompileRequests([font], used(16), collection);
    expect(request.variants[0].symbols).toBeUndefined();
    expect(request.ranges).toBe('0x20-0x7e');
  });

  it('uses the author\'s list for a manual font, whatever the project contains', () => {
    const font = createFontResource({
      cFontName: FONT,
      charsetMode: 'manual',
      extraChars: '甲乙',
    });
    const collection = collectionFor(font, { 16: '中文' });
    const [request] = buildFontCompileRequests([font], used(16), collection);
    expect(request.variants[0].symbols).toBe('乙甲');
  });

  it('works with no collection at all, falling back to the baseline', () => {
    const [request] = buildFontCompileRequests([autoFont()], used(16));
    expect(request.ranges).toContain('0x20-0x7e');
    expect(request.variants[0].symbols).toBeUndefined();
  });

  it('carries bpp through', () => {
    const [request] = buildFontCompileRequests([autoFont({ bpp: 2 })], used(16));
    expect(request.bpp).toBe(2);
  });
});

/**
 * ui.h declares a font for every (font, size) collectUsedCustomFonts reports,
 * and the build converts one for every variant here. If the two ever disagree,
 * the firmware fails to link on an undefined symbol a long way from its cause,
 * so the agreement is pinned rather than left to both calling the same helper.
 */
describe('declarations and conversions cover the same (font, size) pairs', () => {
  const pairsOf = (requests: ReturnType<typeof buildFontCompileRequests>) =>
    requests
      .flatMap((request) => request.variants.map((v) => `${request.cFontName}@${v.size}`))
      .sort();

  const pairsFrom = (usedSizes: Map<string, Set<number>>) =>
    [...usedSizes]
      .flatMap(([name, sizes]) => [...sizes].map((size) => `${name}@${size}`))
      .sort();

  it.each([
    ['a widget naming a font and size', { fontResource: FONT, fontSize: 24 }],
    ['a widget naming a font with no size', { fontResource: FONT }],
  ])('agrees for %s', (_label, props) => {
    const font = autoFont();
    const screens = [
      createScreen({ components: [createComponent('label', { name: 'l', props: { text: 'A', ...props } })] }),
    ];
    const usedSizes = collectUsedCustomFonts(screens, [font]);
    const requests = buildFontCompileRequests([font], usedSizes, collectGlyphs({ screens, fontResources: [font] }));
    expect(pairsOf(requests)).toEqual(pairsFrom(usedSizes));
  });

  it('agrees when the project default font pulls in a size no widget names', () => {
    const font = autoFont();
    const screens = [
      createScreen({ components: [createComponent('label', { name: 'l', props: { text: 'A', fontResource: FONT, fontSize: 48 } })] }),
    ];
    const usedSizes = collectUsedCustomFonts(screens, [font], FONT, 16);
    const requests = buildFontCompileRequests([font], usedSizes, collectGlyphs({ screens, fontResources: [font], defaultFont: FONT, defaultFontSize: 16 }));
    // 48 from the widget, 16 from the project default
    expect(pairsOf(requests)).toEqual(pairsFrom(usedSizes));
    expect(pairsOf(requests)).toEqual([`${FONT}@16`, `${FONT}@48`]);
  });

  it('agrees when a typography names a font no widget prop mentions', () => {
    // ui_typography_init takes the font's address regardless of use, so the
    // declaration set and the conversion set must both include it
    const fonts = [autoFont(), createFontResource({ cFontName: 'font_heading', charsetMode: 'auto' })];
    const typographies = [
      { id: 'typo1', name: 'Heading', fontResource: 'font_heading', fontSize: 32 },
    ];
    const screens = [
      createScreen({ components: [createComponent('label', { name: 'l', props: { text: 'A', fontResource: FONT, fontSize: 16 } })] }),
    ];
    const usedSizes = collectUsedCustomFonts(screens, fonts, undefined, undefined, typographies);
    const requests = buildFontCompileRequests(fonts, usedSizes, collectGlyphs({ screens, fontResources: fonts, typographies }));
    expect(pairsOf(requests)).toEqual(pairsFrom(usedSizes));
    expect(pairsOf(requests)).toContain('font_heading@32');
  });

  it('carries translation characters into the conversion request', () => {
    const font = autoFont();
    const screens = [
      createScreen({
        components: [createComponent('label', { name: 'l', props: { text: 'Hello', fontResource: FONT, fontSize: 16 }, textId: 't1' })],
      }),
    ];
    const texts = [{ id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' } }];
    const usedSizes = collectUsedCustomFonts(screens, [font]);
    const requests = buildFontCompileRequests([font], usedSizes, collectGlyphs({ screens, fontResources: [font], texts }));
    const symbols = requests[0].variants.find((v) => v.size === 16)?.symbols ?? '';
    expect(symbols).toContain('你');
    expect(symbols).toContain('好');
  });

  it('agrees across several fonts and styles', () => {
    const fonts = [autoFont(), createFontResource({ cFontName: 'font_other', charsetMode: 'auto' })];
    const screens = [
      createScreen({
        components: [
          createComponent('label', { name: 'a', props: { text: 'A', fontResource: FONT, fontSize: 16 } }),
          createComponent('obj', { name: 'b', styles: { default: { textFont: 'font_other', textFontSize: 20 } } }),
        ],
      }),
    ];
    const usedSizes = collectUsedCustomFonts(screens, fonts);
    const requests = buildFontCompileRequests(fonts, usedSizes, collectGlyphs({ screens, fontResources: fonts }));
    expect(pairsOf(requests)).toEqual(pairsFrom(usedSizes));
  });
});
