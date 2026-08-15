// Which font the canvas should render a widget's text with.
//
// The precedence mirrors what generated code actually does, so the canvas is a
// truthful preview rather than an approximation with its own rules:
//
//   1. The effective typography — the bound text resource's when it names one,
//      the widget's own otherwise — using its per-language override for the
//      previewed language when one exists and its base font otherwise. The
//      shared style is what renders on the device.
//   2. The widget's own style font, which ui.c emits after the props font and
//      therefore wins.
//   3. The widget's props font.
//
// Custom fonts render through their real @font-face; built-ins approximate
// Montserrat with the closest system sans, since the TTF is LVGL's, not ours.

import type { LvglComponent, ProjectLanguage, TextResource, Typography } from '../../types';
import type { FontResource } from '../../resources/types';
import { ensureFontFaceLoaded } from '../../resources/fontFaces';
import { effectiveTypographyId } from '../../utils/componentText';
import { resolveTypographyStyle } from '../../utils/typographyStyle';

export interface CanvasFont {
  /** CSS font-family, or undefined to leave the browser default. */
  fontFamily?: string;
  /** Pixel size, or undefined when the widget states none. */
  fontSize?: number;
  /** Extra pixels between letters — LVGL's text_letter_space. */
  letterSpacing?: number;
  /** Line height in px: font size plus LVGL's text_line_space. */
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  textDecoration?: 'underline' | 'line-through';
}

function familyOf(
  fontResource: string,
  fontResources: FontResource[],
): string | undefined {
  const builtin = fontResource.match(/^montserrat_(\d+)$/);
  if (builtin) return "'Montserrat', sans-serif";
  const resource = fontResources.find((font) => font.cFontName === fontResource);
  return resource ? ensureFontFaceLoaded(resource) : undefined;
}

export function resolveCanvasFont(
  comp: LvglComponent,
  typographies: Typography[],
  fontResources: FontResource[],
  languages: ProjectLanguage[],
  previewLanguage: string | null,
  texts: TextResource[] = [],
): CanvasFont {
  const typographyId = effectiveTypographyId(comp, texts);
  const typography = typographyId
    ? typographies.find((t) => t.id === typographyId)
    : undefined;

  if (typography) {
    // Through the shared rule, so the canvas shows what the language actually
    // resolves to rather than a second reading of the same data
    const activeCode = previewLanguage ?? languages[0]?.code;
    const chosen = resolveTypographyStyle(typography, activeCode);
    const builtin = chosen.fontResource.match(/^montserrat_(\d+)$/);
    const fontSize = builtin ? Number(builtin[1]) : chosen.fontSize;
    return {
      fontFamily: familyOf(chosen.fontResource, fontResources),
      // A built-in font's size lives in its name
      fontSize,
      // The rest of the resolved style rides along, so a language that changes
      // spacing or alignment previews that change — not only its face
      ...(chosen.letterSpace ? { letterSpacing: chosen.letterSpace } : {}),
      ...(chosen.lineSpace ? { lineHeight: fontSize + chosen.lineSpace } : {}),
      ...(chosen.align && chosen.align !== 'auto' ? { textAlign: chosen.align } : {}),
      ...(chosen.decor === 'underline' ? { textDecoration: 'underline' as const } : {}),
      ...(chosen.decor === 'strikethrough' ? { textDecoration: 'line-through' as const } : {}),
    };
  }

  const styleFont = comp.styles?.default?.textFont;
  if (styleFont) {
    const builtin = styleFont.match(/^montserrat_(\d+)$/);
    return {
      fontFamily: familyOf(styleFont, fontResources),
      fontSize: builtin ? Number(builtin[1]) : comp.styles?.default?.textFontSize,
    };
  }

  const propsFont = comp.props?.fontResource as string | undefined;
  if (propsFont) {
    const builtin = propsFont.match(/^montserrat_(\d+)$/);
    return {
      fontFamily: familyOf(propsFont, fontResources),
      fontSize: builtin ? Number(builtin[1]) : (comp.props?.fontSize as number | undefined),
    };
  }

  return { fontSize: comp.props?.fontSize as number | undefined };
}
