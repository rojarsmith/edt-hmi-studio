// Folding a typography's per-language overrides onto its Default.
//
// One rule, shared by the canvas, the property editor and ui.c, for the same
// reason `effectiveTypographyId` is shared: a preview that resolves style
// differently from the generator is a preview of something else.
//
// The Default is the typography's own fields. A language listed in `languages`
// changes only what it names; everything it omits keeps coming from the
// Default, which is what lets editing the Default reach every language that
// did not override it.

import type { Typography, TypographyLanguageStyle } from '../types';

/** A typography's settings for one language, with nothing left to inherit. */
export interface ResolvedTypographyStyle {
  fontResource: string;
  fontSize: number;
  letterSpace?: number;
  lineSpace?: number;
  align?: Typography['align'];
  decor?: Typography['decor'];
  baseDir?: Typography['baseDir'];
  fallbackCharacter?: string;
  wildcardCharacters?: string;
  wildcardRanges?: string;
}

/**
 * The properties that live in the generated `lv_style_t`. Wildcards and the
 * fallback character resolve through the same inheritance but are not style
 * properties: wildcards feed the font converter, and the fallback character
 * picks which font *copy* the style points at.
 */
export const TYPOGRAPHY_STYLE_KEYS = [
  'fontResource', 'fontSize', 'letterSpace', 'lineSpace', 'align', 'decor', 'baseDir',
] as const satisfies readonly (keyof ResolvedTypographyStyle)[];

/**
 * The per-language overrides, in one shape.
 *
 * Projects written before a language could override anything but the font
 * carry `languageFonts`; those entries mean the same thing and are read here
 * rather than migrated in place, so an older project file stays loadable.
 */
export function languageStylesOf(
  typography: Typography,
): Record<string, TypographyLanguageStyle> {
  if (typography.languages) return typography.languages;
  if (!typography.languageFonts) return {};

  return Object.fromEntries(
    Object.entries(typography.languageFonts).map(([code, font]) => [
      code,
      { fontResource: font.fontResource, fontSize: font.fontSize },
    ]),
  );
}

/** Does this language change anything, or does it simply take the Default? */
export function hasLanguageOverride(typography: Typography, language: string): boolean {
  const style = languageStylesOf(typography)[language];
  return style !== undefined && Object.values(style).some((value) => value !== undefined);
}

/**
 * The languages that have a tab of their own, whether or not they have set
 * anything yet.
 *
 * An entry existing and an entry differing are two facts: a just-added tab is
 * an empty entry — it exists, so the editor shows it, but it renders exactly
 * as the Default and the generator ignores it. Only `overriddenLanguages`
 * feeds codegen.
 */
export function tabbedLanguages(typography: Typography): string[] {
  return Object.keys(languageStylesOf(typography));
}

/**
 * The settings a language actually renders with.
 *
 * Passing no language — or one with no entry — returns the Default itself,
 * which is the case every project starts in.
 */
export function resolveTypographyStyle(
  typography: Typography,
  language?: string | null,
): ResolvedTypographyStyle {
  const base: ResolvedTypographyStyle = {
    fontResource: typography.fontResource,
    fontSize: typography.fontSize,
    letterSpace: typography.letterSpace,
    lineSpace: typography.lineSpace,
    align: typography.align,
    decor: typography.decor,
    baseDir: typography.baseDir,
    fallbackCharacter: typography.fallbackCharacter,
    wildcardCharacters: typography.wildcardCharacters,
    wildcardRanges: typography.wildcardRanges,
  };

  const override = language ? languageStylesOf(typography)[language] : undefined;
  if (!override) return base;

  // Only defined values win. An override that clears a field back to the
  // Default stores nothing rather than storing undefined, so `??` would be
  // wrong here only if a language wanted to set a field to undefined — which
  // is the same as not overriding it.
  return {
    fontResource: override.fontResource ?? base.fontResource,
    fontSize: override.fontSize ?? base.fontSize,
    letterSpace: override.letterSpace ?? base.letterSpace,
    lineSpace: override.lineSpace ?? base.lineSpace,
    align: override.align ?? base.align,
    decor: override.decor ?? base.decor,
    baseDir: override.baseDir ?? base.baseDir,
    fallbackCharacter: override.fallbackCharacter ?? base.fallbackCharacter,
    wildcardCharacters: override.wildcardCharacters ?? base.wildcardCharacters,
    wildcardRanges: override.wildcardRanges ?? base.wildcardRanges,
  };
}

/**
 * Which properties a language differs from the Default on.
 *
 * Generated code re-applies exactly these when the language changes, so a
 * typography that only swaps its face does not also restate spacing it never
 * changed.
 */
export function languageDifferences(
  typography: Typography,
  language: string,
): (keyof ResolvedTypographyStyle)[] {
  const base = resolveTypographyStyle(typography);
  const resolved = resolveTypographyStyle(typography, language);
  const keys: (keyof ResolvedTypographyStyle)[] = [
    ...TYPOGRAPHY_STYLE_KEYS, 'fallbackCharacter', 'wildcardCharacters', 'wildcardRanges',
  ];
  return keys.filter((key) => resolved[key] !== base[key]);
}

/** Every language code any override in the project names. */
export function overriddenLanguages(typography: Typography): string[] {
  return Object.keys(languageStylesOf(typography)).filter((code) =>
    hasLanguageOverride(typography, code),
  );
}
