// Wildcards: the characters runtime values may substitute into a typography's
// text, declared by the author because no walk of the project can see them.
//
// Charset trimming collects what the project's own text needs
// (collectGlyphs.ts); a Modbus string or a formatted number arrives at runtime
// and is invisible to that walk. Wildcards are the author's declaration of
// that traffic, and they reach the converter the same two ways lv_font_conv
// accepts: literal characters as --symbols, ranges as --range.
//
// The fallback character travels with them: it is only drawn when a wildcard
// value brings a glyph the font lacks, and it can only be drawn if it was
// converted in.

import type { Typography } from '../types';
import { resolveTypographyStyle, overriddenLanguages } from '../utils/typographyStyle';

/**
 * Normalise one wildcard-ranges declaration into lv_font_conv `--range` form.
 *
 * Comma- or whitespace-separated tokens; each side of a token is either a
 * single literal character or `0x` hex, so `0-9` is the digits and
 * `0x4E00-0x9FFF` is the block. Decimal is deliberately not accepted: `0-9`
 * reading as code points 0–9 would be nine control characters, which nobody
 * declaring a wildcard range has ever meant.
 *
 * Unparseable tokens are returned rather than dropped, so the editor can say
 * which part of the field is being ignored instead of ignoring it silently.
 */
export function parseWildcardRanges(input: string): { ranges: string[]; invalid: string[] } {
  const ranges: string[] = [];
  const invalid: string[] = [];

  const sideToCodePoint = (side: string): number | undefined => {
    if (/^0x[0-9a-f]+$/i.test(side)) return Number.parseInt(side, 16);
    const points = [...side];
    if (points.length === 1) return points[0].codePointAt(0);
    return undefined;
  };

  for (const token of input.split(/[\s,]+/).filter(Boolean)) {
    // Split on a dash that separates two sides — not one that *is* a side,
    // which is what a literal `-` or a range like `--0x2D` would put there
    const match = /^(0x[0-9a-f]+|.)-(0x[0-9a-f]+|.)$/iu.exec(token);
    const sides = match ? [match[1], match[2]] : [token];
    const points = sides.map(sideToCodePoint);

    if (points.some((point) => point === undefined)) {
      invalid.push(token);
      continue;
    }
    if (points.length === 2) {
      const [start, end] = points as [number, number];
      if (start > end) {
        invalid.push(token);
        continue;
      }
      ranges.push(`0x${start.toString(16)}-0x${end.toString(16)}`);
    } else {
      ranges.push(`0x${(points[0] as number).toString(16)}`);
    }
  }

  return { ranges, invalid };
}

/** What every typography resolving to one font asks the converter to add. */
export interface FontWildcards {
  /** Literal characters, sent as --symbols. */
  codePoints: Set<number>;
  /** Normalised ranges, sent as --range. */
  ranges: string[];
}

/**
 * Wildcard declarations folded down to the fonts that must carry them.
 *
 * Per language, TouchGFX's shape: each language resolves its own declaration
 * — its tab's, or the Default's where the tab declares nothing — and that
 * declaration goes into the font the same resolution names. The Default's
 * declaration therefore still reaches a CJK override font when the override
 * changes only the face, because the language inherits the declaration; a
 * language that declares its own carries exactly that instead. Built-in
 * Montserrat is skipped: it is compiled into LVGL, not converted, so there is
 * nothing to add glyphs to.
 */
export function collectTypographyWildcards(
  typographies: Typography[],
  customFontNames: ReadonlySet<string>,
): Map<string, FontWildcards> {
  const byFont = new Map<string, FontWildcards>();

  for (const typography of typographies) {
    // undefined is the Default — the resolution every tabless language uses
    for (const language of [undefined, ...overriddenLanguages(typography)]) {
      const style = resolveTypographyStyle(typography, language);
      const characters = [
        ...(style.wildcardCharacters ?? ''),
        ...(style.fallbackCharacter ?? ''),
      ];
      const { ranges } = parseWildcardRanges(style.wildcardRanges ?? '');
      if (characters.length === 0 && ranges.length === 0) continue;
      if (!customFontNames.has(style.fontResource)) continue;

      let entry = byFont.get(style.fontResource);
      if (!entry) {
        entry = { codePoints: new Set(), ranges: [] };
        byFont.set(style.fontResource, entry);
      }
      for (const character of characters) {
        const point = character.codePointAt(0);
        if (point !== undefined) entry.codePoints.add(point);
      }
      for (const range of ranges) {
        if (!entry.ranges.includes(range)) entry.ranges.push(range);
      }
    }
  }

  return byFont;
}
