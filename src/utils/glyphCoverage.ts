// Whether the device can draw a widget's text — the check the canvas cannot do.
//
// The canvas renders with the browser's fonts, which cover practically every
// script, so a label whose device font is the built-in Montserrat shows 中文
// perfectly in the editor and a row of boxes on the panel — a failure invisible
// until after flashing. Converted fonts do not have this gap: their character
// set is collected from this same text, and the Fonts tab already warns when
// the file itself lacks a glyph. The one font never converted is the built-in
// Montserrat, whose coverage is fixed when LVGL is compiled; this module knows
// that coverage and names the languages that will not survive it.

import type { LvglComponent, ProjectLanguage, TextResource, Typography } from '../types';
import { isBuiltinFont } from '../resources/builtinFonts';
import { resolveTypographyStyle } from './typographyStyle';
import { displayTextFor, effectiveTypographyId, standInProp } from './componentText';

/**
 * LVGL's Montserrat builds carry ASCII, °, • and the LV_SYMBOL private-use
 * block — nothing else. Control characters pass because they render as line
 * breaks or nothing, never as a box.
 */
export function builtinFontCanDraw(codePoint: number): boolean {
  return codePoint <= 0x7e
    || codePoint === 0xb0
    || codePoint === 0x2022
    || (codePoint >= 0xf000 && codePoint <= 0xf8ff);
}

/** The characters of `text` the built-in font draws as boxes, deduplicated. */
export function undrawableCharacters(text: string): string[] {
  const seen = new Set<string>();
  for (const char of text) {
    if (!builtinFontCanDraw(char.codePointAt(0)!)) seen.add(char);
  }
  return [...seen];
}

export interface GlyphCoverageGap {
  /** Project language code, or null when the widget's own literal is the text. */
  language: string | null;
  /** The characters that would render as boxes. */
  characters: string[];
  /**
   * The typography whose resolution for this language is the built-in font —
   * where a language tab with a covering font fixes it. Undefined means the
   * widget has no typography at all, which is its own finding: without one
   * there is nowhere to put a per-language font.
   */
  typography?: Typography;
}

/**
 * The languages whose text this widget cannot draw on the device.
 *
 * A widget bound to a text resource is checked per project language, with the
 * same fallback `resolveText` and the firmware use — so a language with no
 * value of its own is checked against the words it actually falls back to. An
 * unbound widget is its literal, checked once.
 */
export function glyphCoverageGaps(
  comp: LvglComponent,
  texts: TextResource[],
  typographies: Typography[],
  languages: ProjectLanguage[],
): GlyphCoverageGap[] {
  const prop = standInProp(comp);
  const typographyId = effectiveTypographyId(comp, texts);
  const typography = typographies.find((t) => t.id === typographyId);

  // The font that draws this widget in a given language. With no typography
  // the widget's own font applies, and an unset one inherits the screen's
  // default, which is the built-in.
  const fontFor = (language: string | null): string => {
    if (typography) return resolveTypographyStyle(typography, language).fontResource;
    return (comp.props?.fontResource as string | undefined) ?? 'montserrat_14';
  };

  const resource = comp.textId ? texts.find((text) => text.id === comp.textId) : undefined;
  const candidates: (string | null)[] = resource
    ? languages.map((language) => language.code)
    : [null];

  const gaps: GlyphCoverageGap[] = [];
  for (const language of candidates) {
    if (!isBuiltinFont(fontFor(language))) continue;
    const shown = displayTextFor(comp, prop, texts, languages, language);
    const characters = undrawableCharacters(shown);
    if (characters.length > 0) gaps.push({ language, characters, typography });
  }
  return gaps;
}
