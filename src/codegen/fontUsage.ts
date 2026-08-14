// Which custom font + size combinations a project actually uses.
//
// Separate from collectGlyphs: this answers "which fonts have to exist", while
// that answers "which characters each one has to draw". A size with no text of
// its own still has to be converted, because the generated C refers to it.
//
// Shared so ui.h's declarations, the WASM preview's conversion requests and the
// firmware build all agree — see docs/charset-trimming-design.md §8.

import type { LvglComponent, Screen, Typography } from '../types';
import type { FontResource } from '../resources/types';

/** Size assumed when a widget selects a font without stating a size. */
const IMPLIED_FONT_SIZE = 16;

function isBuiltinFont(name: string): boolean {
  return /^montserrat_\d+$/.test(name);
}

/**
 * Map of cFontName → the sizes it is used at.
 *
 * Built-in Montserrat fonts are excluded: they ship inside LVGL and are never
 * converted.
 */
export function collectUsedCustomFonts(
  screens: Screen[],
  fontResources: FontResource[],
  defaultFont?: string,
  defaultFontSize?: number,
  typographies: Typography[] = [],
): Map<string, Set<number>> {
  const usedFonts = new Map<string, Set<number>>();
  const customFontNames = new Set(fontResources.map((f) => f.cFontName));

  const addFont = (fontName: string, size: number) => {
    if (!isBuiltinFont(fontName) && customFontNames.has(fontName)) {
      const sizes = usedFonts.get(fontName) ?? new Set<number>();
      sizes.add(size);
      usedFonts.set(fontName, sizes);
    }
  };

  const walk = (components: LvglComponent[]) => {
    for (const comp of components) {
      const props = comp.props ?? {};

      if (props.fontResource) {
        addFont(props.fontResource as string, (props.fontSize as number) || IMPLIED_FONT_SIZE);
      } else if (props.fontSize !== undefined && defaultFont) {
        // Inherits the default font, at a size of its own
        const fontSize = props.fontSize as number;
        if (fontSize !== (defaultFontSize || IMPLIED_FONT_SIZE)) {
          addFont(defaultFont, fontSize);
        }
      }

      if (comp.styles?.default?.textFont) {
        addFont(comp.styles.default.textFont, comp.styles.default.textFontSize || IMPLIED_FONT_SIZE);
      }
      for (const state of ['pressed', 'focused', 'disabled'] as const) {
        const stateStyles = comp.styles?.[state];
        if (stateStyles?.textFont) {
          addFont(stateStyles.textFont, stateStyles.textFontSize || IMPLIED_FONT_SIZE);
        }
      }

      walk(comp.children ?? []);
    }
  };

  for (const screen of screens) walk(screen.components);

  // The project default is always converted: every screen sets it, whether or
  // not any widget names it explicitly
  if (defaultFont) addFont(defaultFont, defaultFontSize || IMPLIED_FONT_SIZE);

  // Every stored typography is initialised by ui_typography_init and its style
  // takes the font's address, whether or not any widget uses it yet. A font
  // referenced only here would otherwise be neither declared nor converted —
  // a compile error pointing at the style, a long way from the missing font.
  for (const typography of typographies) {
    addFont(typography.fontResource, typography.fontSize || IMPLIED_FONT_SIZE);
  }

  return usedFonts;
}
