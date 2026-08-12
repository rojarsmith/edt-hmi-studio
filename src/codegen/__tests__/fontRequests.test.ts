import { describe, it, expect } from 'vitest';
import { buildFontCompileRequests } from '../fontRequests';
import { collectGlyphs } from '../collectGlyphs';
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
