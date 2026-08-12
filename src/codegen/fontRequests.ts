// Turning collected glyph usage into font conversion requests.
//
// Kept out of the compile-preview component so the mapping can be tested, and
// so the firmware deploy path can build the same requests from the same inputs
// — see docs/charset-trimming-design.md §8.

import type { FontResource } from '../resources/types';
import { resolveFontCharset } from '../resources/converters/fontConverter';
import { glyphSetKey, type GlyphCollection } from './collectGlyphs';
import type { FontCompileRequest } from './types';

/**
 * Build one request per custom font in use, with one variant per size.
 *
 * `usedSizes` decides which sizes exist at all — it comes from which fonts the
 * widgets select, not from which glyphs they need. A size with no text still
 * has to be converted, because the generated C refers to it either way.
 *
 * `collection` only affects fonts whose charset mode is `auto`; `preset` and
 * `manual` are the author stating what they want, and are passed through.
 */
export function buildFontCompileRequests(
  fonts: FontResource[],
  usedSizes: Map<string, Set<number>>,
  collection?: GlyphCollection,
): FontCompileRequest[] {
  const requests: FontCompileRequest[] = [];

  for (const font of fonts) {
    const sizes = usedSizes.get(font.cFontName);
    if (!sizes || sizes.size === 0) continue;

    // Ranges come from the charset mode and are the same for every size
    const { ranges } = resolveFontCharset(font);

    const variants = [...sizes]
      .sort((a, b) => a - b)
      .map((size) => {
        const collected = collection?.byFontSize.get(glyphSetKey(font.cFontName, size));
        const { symbols } = resolveFontCharset(font, collected?.codePoints);
        return symbols ? { size, symbols } : { size };
      });

    requests.push({
      data: font.data,
      cFontName: font.cFontName,
      ranges,
      variants,
      bpp: font.bpp,
    });
  }

  return requests;
}
