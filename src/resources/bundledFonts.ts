// Fonts that ship with the app, so CJK coverage does not depend on the user
// finding, downloading and uploading the right file themselves.
//
// A bundled font becomes an ordinary FontResource when added — it goes through
// the same charset trimming, conversion cache and coverage warnings as an
// uploaded one. What distinguishes it is the `bundled` id: persisted copies
// drop the multi-megabyte payload and re-read it from the app's own static
// files on load, so project saves stay small.
//
// The files live in public/fonts/ next to OFL.txt. All entries must be
// licensed for commercial use without a fee — that is the point of bundling.

import type { FontResource } from './types';

export interface BundledFontSpec {
  /** Stable catalog id, stored on FontResource.bundled. Never rename one. */
  id: string;
  /** Resource name shown in the panel. */
  label: string;
  /** File name under public/fonts/. */
  file: string;
  family: string;
  style: string;
  /** C symbol base, e.g. `ui_font_noto_sans_jp`. */
  cFontName: string;
  /** Language codes this font is meant to cover, matching ProjectLanguage.code. */
  languages: string[];
  license: string;
  description: string;
}

/** Subdirectory of public/ (and of the served root) holding the font files. */
export const BUNDLED_FONT_DIR = 'fonts';

export const BUNDLED_FONTS: BundledFontSpec[] = [
  {
    id: 'noto-sans-jp',
    label: 'Noto Sans JP',
    file: 'NotoSansJP-Regular.otf',
    family: 'Noto Sans JP',
    style: 'Regular',
    cFontName: 'ui_font_noto_sans_jp',
    languages: ['ja'],
    license: 'OFL-1.1',
    description: 'Japanese — kana and JIS kanji. Google Noto CJK, Japanese build.',
  },
  {
    id: 'noto-sans-kr',
    label: 'Noto Sans KR',
    file: 'NotoSansKR-Regular.otf',
    family: 'Noto Sans KR',
    style: 'Regular',
    cFontName: 'ui_font_noto_sans_kr',
    languages: ['ko'],
    license: 'OFL-1.1',
    description: 'Korean — all modern Hangul syllables. Google Noto CJK, Korean build.',
  },
];

export function bundledFontById(id: string | undefined): BundledFontSpec | undefined {
  return id ? BUNDLED_FONTS.find((spec) => spec.id === id) : undefined;
}

/**
 * The persisted shape of a font: bundled ones drop `data`, everything else is
 * stored as-is. Only a recognized catalog id is stripped — an id from a newer
 * app version keeps its payload rather than becoming unloadable here.
 */
export function stripBundledFontData(font: FontResource): FontResource {
  return font.bundled && bundledFontById(font.bundled)
    ? { ...font, data: '' }
    : font;
}

/**
 * Fill in `data` for bundled fonts loaded without it. `loadData` receives the
 * catalog file name and returns a base64 data URL — injectable so the browser
 * can fetch from the served root while the server reads public/ from disk.
 * Loader failures propagate; the caller decides whether a missing font file is
 * fatal (a firmware build) or survivable (opening a project offline).
 */
export async function hydrateBundledFonts(
  fonts: FontResource[],
  loadData: (file: string) => Promise<string>,
): Promise<FontResource[]> {
  return Promise.all(
    fonts.map(async (font) => {
      if (font.data || !font.bundled) return font;
      const spec = bundledFontById(font.bundled);
      if (!spec) return font;
      return { ...font, data: await loadData(spec.file) };
    }),
  );
}
