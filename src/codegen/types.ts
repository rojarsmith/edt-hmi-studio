// Code Generation Types

export interface CodeGenOptions {
  lvglVersion: '8' | '9';
  namingStyle: 'snake_case' | 'camelCase';
  indentStyle: 'spaces' | 'tabs';
  indentSize: number;
  generateComments: boolean;
  userCodeMarkers: boolean;
}

/**
 * One font to convert, as sent to the compile server.
 *
 * Lives here rather than beside the WASM preview because the firmware deploy
 * path has to build the same request from the same collector — otherwise the
 * preview and the board disagree about which glyphs exist. See
 * docs/charset-trimming-design.md §8.
 */
export interface FontCompileRequest {
  /** base64 data URI of the TTF/OTF, sent once however many sizes are built */
  data: string;
  /** e.g. "ui_font_noto" */
  cFontName: string;
  /**
   * Comma-separated ranges, e.g. `"0x20-0x7e,0x4e00-0x4eff"`.
   *
   * Font-level: ranges come from the charset mode, which does not vary by size.
   */
  ranges: string;
  /** One entry per size to convert. */
  variants: FontVariantRequest[];
  /** 1 | 2 | 4 | 8 */
  bpp: number;
}

/**
 * One size of one font.
 *
 * Sizes are listed separately rather than as a `number[]` because the glyphs
 * differ between them — a 48px title and a 14px status line rarely share
 * characters, and trimming per size is strictly smaller for no extra work.
 * See docs/charset-trimming-design.md §2.
 */
export interface FontVariantRequest {
  size: number;
  /** Characters this size needs, on top of the font's `ranges`. */
  symbols?: string;
}

export interface GeneratedCode {
  'ui.h': string;
  'ui.c': string;
  'ui_events.h': string;
  'ui_events.c': string;
  'ui_logic.h': string;
  'ui_logic.c': string;
}

export const DEFAULT_CODEGEN_OPTIONS: CodeGenOptions = {
  lvglVersion: '9',
  namingStyle: 'snake_case',
  indentStyle: 'spaces',
  indentSize: 4,
  generateComments: true,
  userCodeMarkers: true,
};
