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
  /** base64 data URI of the TTF/OTF */
  data: string;
  /** e.g. "ui_font_noto" */
  cFontName: string;
  /** every size in use, e.g. [16, 24] */
  sizes: number[];
  /** comma-separated ranges, e.g. "0x20-0x7e,0x4e00-0x4eff" */
  ranges: string;
  /** literal characters to include, on top of `ranges` */
  symbols?: string;
  /** 1 | 2 | 4 | 8 */
  bpp: number;
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
