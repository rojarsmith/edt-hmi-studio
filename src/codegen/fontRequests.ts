// Turning collected glyph usage into font conversion requests.
//
// Kept out of the compile-preview component so the mapping can be tested, and
// so the firmware deploy path can build the same requests from the same inputs
// — see docs/charset-trimming-design.md §8.

import type { FontResource } from '../resources/types';
import type { Typography } from '../types';
import { resolveFontCharset } from '../resources/converters/fontConverter';
import { glyphSetKey, type GlyphCollection } from './collectGlyphs';
import { collectTypographyWildcards } from './typographyWildcards';
import type { FontCompileRequest } from './types';

/** `symbols` plus any wildcard characters it does not already carry. */
function mergeSymbols(symbols: string, extra: ReadonlySet<number> | undefined): string {
  if (!extra || extra.size === 0) return symbols;
  const points = new Set([...symbols].map((char) => char.codePointAt(0)));
  let merged = symbols;
  for (const point of extra) {
    if (!points.has(point)) merged += String.fromCodePoint(point);
  }
  return merged;
}

/**
 * Build one request per custom font in use, with one variant per size.
 *
 * `usedSizes` decides which sizes exist at all — it comes from which fonts the
 * widgets select, not from which glyphs they need. A size with no text still
 * has to be converted, because the generated C refers to it either way.
 *
 * `collection` only affects fonts whose charset mode is `auto`; `preset` and
 * `manual` are the author stating what they want, and are passed through.
 *
 * Typography wildcards apply in every mode, to every size of the fonts the
 * typography resolves to. They are a declaration of runtime traffic rather
 * than a derivation from the project, so a manual charset does not override
 * them — the two are unioned, exactly as lv_font_conv unions --range and
 * --symbols.
 */
export function buildFontCompileRequests(
  fonts: FontResource[],
  usedSizes: Map<string, Set<number>>,
  collection?: GlyphCollection,
  typographies: Typography[] = [],
): FontCompileRequest[] {
  const requests: FontCompileRequest[] = [];
  const wildcards = collectTypographyWildcards(
    typographies,
    new Set(fonts.map((font) => font.cFontName)),
  );

  for (const font of fonts) {
    const sizes = usedSizes.get(font.cFontName);
    if (!sizes || sizes.size === 0) continue;

    const extra = wildcards.get(font.cFontName);

    // Ranges come from the charset mode and are the same for every size.
    // Wildcard ranges stay ranges rather than being expanded into symbols: a
    // declared CJK block is tens of thousands of characters, and Windows cuts
    // a command line off at 32k characters.
    const { ranges } = resolveFontCharset(font);
    const allRanges = [ranges, ...(extra?.ranges ?? [])].filter(Boolean).join(',');

    const variants = [...sizes]
      .sort((a, b) => a - b)
      .map((size) => {
        const collected = collection?.byFontSize.get(glyphSetKey(font.cFontName, size));
        const { symbols } = resolveFontCharset(font, collected?.codePoints);
        const merged = mergeSymbols(symbols, extra?.codePoints);
        return merged ? { size, symbols: merged } : { size };
      });

    requests.push({
      data: font.data,
      cFontName: font.cFontName,
      ranges: allRanges,
      variants,
      bpp: font.bpp,
    });
  }

  return requests;
}
