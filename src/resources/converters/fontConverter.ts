// Font Converter for LVGL
// Note: Full font conversion requires lv_font_conv or similar tool
// This provides basic font management and C code generation structure

import type { CharsetType, FontConversionOptions, CharsetPreset, FontResource } from '../types';

/** ASCII 0x20-0x7E, included unconditionally in `auto` mode. */
export const ASCII_BASELINE = '0x20-0x7e';

/**
 * A font's resolved coverage, in the shape `FontCompileRequest` wants:
 * `ranges` goes to `--range`, `symbols` goes to `--symbols`, and
 * `lv_font_conv` takes the union of the two.
 */
export interface CharsetSelection {
  /** Comma-separated, e.g. `"0x20-0x7e,0x4e00-0x4eff"`. May be empty. */
  ranges: string;
  /** Literal characters. May be empty. */
  symbols: string;
}

/** Format ranges the way the compile request and `lv_font_conv` expect. */
export function rangesToString(ranges: [number, number][]): string {
  return ranges
    .map(([start, end]) => `0x${start.toString(16)}-0x${end.toString(16)}`)
    .join(',');
}

/** Parse a `"0x20-0x7e,0x4e00-0x4eff"` string back into pairs. */
function parseRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const part of text.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [from, to] = trimmed.split('-');
    const start = Number.parseInt(from, 16);
    const end = to !== undefined ? Number.parseInt(to, 16) : start;
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    out.push([start, end]);
  }
  return out;
}

/** Code points of a string, iterated by character so surrogate pairs stay whole. */
function stringCodePoints(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) out.push(cp);
  }
  return out;
}

/**
 * Render code points as a `--symbols` string: sorted and deduplicated, so the
 * value is stable across runs and safe to use in a conversion cache key.
 */
function toSymbols(points: Iterable<number>, dropAscii: boolean): string {
  const sorted = [...new Set(points)]
    .filter((cp) => !dropAscii || cp < 0x20 || cp > 0x7e)
    .sort((a, b) => a - b);
  return String.fromCodePoint(...sorted);
}

/**
 * The mode a font written before `charsetMode` existed should be read as.
 * Never `auto`: switching an existing project to usage-derived coverage would
 * change what ships without the author asking.
 */
function legacyMode(font: FontResource): 'preset' | 'manual' {
  return font.charset === 'custom' ? 'manual' : 'preset';
}

/**
 * Bring a font resource loaded from an older project up to date.
 * Idempotent, and output-preserving — see the tests in
 * `converters/__tests__/charsetResolution.test.ts`.
 */
export function migrateFontResource(font: FontResource): FontResource {
  if (font.charsetMode) return font;

  if (font.charset === 'custom') {
    return {
      ...font,
      charsetMode: 'manual',
      extraChars: font.customChars ?? '',
      customChars: undefined,
    };
  }

  return { ...font, charsetMode: 'preset' };
}

/**
 * Work out which glyphs a font should be converted with.
 *
 * `collected` is the code point set from `collectGlyphs`, and is only consulted
 * in `auto` mode — the other two modes are the author saying what they want.
 */
export function resolveFontCharset(
  font: FontResource,
  collected?: Iterable<number>,
): CharsetSelection {
  const mode = font.charsetMode ?? legacyMode(font);

  if (mode === 'preset') {
    return { ranges: rangesToString(getCharsetRanges(font.charset)), symbols: '' };
  }

  if (mode === 'manual') {
    const chars = font.extraChars ?? font.customChars ?? '';
    const ranges = font.extraRanges ?? '';
    // Matches what an empty custom charset did before: fall back to ASCII
    if (!chars && !ranges) return { ranges: ASCII_BASELINE, symbols: '' };
    // Characters go out as symbols rather than one range each — scattered CJK
    // used to produce a command line too long for cmd.exe
    return { ranges, symbols: toSymbols(stringCodePoints(chars), false) };
  }

  const points = new Set<number>(collected ?? []);
  for (const cp of stringCodePoints(font.extraChars ?? '')) points.add(cp);
  const ranges = [ASCII_BASELINE, font.extraRanges?.trim()].filter(Boolean).join(',');
  // ASCII is already covered by the baseline range; repeating it in the symbols
  // string would only make the command longer
  return { ranges, symbols: toSymbols(points, true) };
}

/** One-line human description of a selection, for generated file comments. */
export function describeSelection(selection: CharsetSelection): string {
  const parts: string[] = [];
  if (selection.ranges) parts.push(selection.ranges.toUpperCase());
  if (selection.symbols) parts.push(`${[...selection.symbols].length} listed characters`);
  return parts.join(' + ') || '(empty)';
}

/** Expand a selection into the glyph set it asks for. Used by the editor's counters. */
export function charsetCodePoints(selection: CharsetSelection): Set<number> {
  const out = new Set<number>();
  for (const [start, end] of parseRanges(selection.ranges)) {
    for (let cp = start; cp <= end; cp++) out.add(cp);
  }
  for (const cp of stringCodePoints(selection.symbols)) out.add(cp);
  return out;
}

export interface ConvertedFont {
  cCode: string;
  glyphCount: number;
  sizes: number[];
}

/**
 * Get character ranges for charset type
 */
export function getCharsetRanges(
  charset: CharsetType,
  customChars?: string,
  presets?: CharsetPreset[]
): [number, number][] {
  const charsetPresets = presets || [
    { id: 'ascii', ranges: [[32, 126]] },
    { id: 'latin', ranges: [[32, 126], [160, 591]] },
    { id: 'cjk-basic', ranges: [[32, 126], [0x4E00, 0x9FFF]] },
    { id: 'custom', ranges: [] },
  ] as CharsetPreset[];

  if (charset === 'custom' && customChars) {
    // Convert custom characters to ranges
    const codePoints = Array.from(new Set(
      Array.from(customChars).map(c => c.codePointAt(0) || 0)
    )).sort((a, b) => a - b);
    
    if (codePoints.length === 0) return [[32, 126]];

    // Group consecutive code points into ranges
    const ranges: [number, number][] = [];
    let start = codePoints[0];
    let end = codePoints[0];
    
    for (let i = 1; i < codePoints.length; i++) {
      if (codePoints[i] === end + 1) {
        end = codePoints[i];
      } else {
        ranges.push([start, end]);
        start = codePoints[i];
        end = codePoints[i];
      }
    }
    ranges.push([start, end]);
    
    return ranges;
  }
  
  const preset = charsetPresets.find(p => p.id === charset);
  return (preset?.ranges || [[32, 126]]) as [number, number][];
}

/**
 * Count glyphs in charset
 */
export function countGlyphs(ranges: [number, number][]): number {
  return ranges.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
}

/**
 * Extract unique characters from text
 */
export function extractCharsFromText(text: string): string {
  const chars = new Set(text);
  // Always include basic ASCII printable characters
  for (let i = 32; i <= 126; i++) {
    chars.add(String.fromCharCode(i));
  }
  return Array.from(chars).sort().join('');
}

/**
 * Generate font C code header (placeholder structure)
 * Note: Actual glyph data generation requires bitmap rendering
 */
export function generateFontCCodeHeader(
  name: string,
  family: string,
  size: number,
  bpp: number,
  selection: CharsetSelection
): string {
  const glyphCount = charsetCodePoints(selection).size;
  const rangeStr = describeSelection(selection);

  return `/**
 * Font: ${name}
 * Family: ${family}
 * Size: ${size}px
 * BPP: ${bpp}
 * Glyph count: ${glyphCount}
 * Coverage: ${rangeStr}
 * Generated by EDT GUI Studio
 * 
 * NOTE: This is a header template. Full font conversion requires
 * lv_font_conv tool or equivalent bitmap font generator.
 */

#ifndef ${name.toUpperCase()}_H
#define ${name.toUpperCase()}_H

#include "lvgl.h"

LV_FONT_DECLARE(${name});

#endif /* ${name.toUpperCase()}_H */
`;
}

/**
 * Generate font conversion command for lv_font_conv.
 * Each size produces a separate output file.
 */
export function generateFontConvCommand(
  fontFile: string,
  outputName: string,
  sizes: number[],
  bpp: number,
  selection: CharsetSelection
): string {
  // Display only — the build runs this as argv, never through a shell, so that
  // authored text cannot break the quoting. See server/fontConv.ts.
  const rangeArgs = selection.ranges
    .split(',')
    .map((range) => range.trim())
    .filter(Boolean)
    .map((range) => `--range=${range}`)
    .join(' ');
  const symbolArg = selection.symbols ? ` \\\n  --symbols "${selection.symbols}"` : '';

  // lv_font_conv only accepts one --size per invocation
  const effectiveSizes = sizes.length > 0 ? sizes : [16];
  return effectiveSizes.map(sz =>
    `lv_font_conv \\
  --font "${fontFile}" \\
  --size=${sz} \\
  --bpp=${bpp} \\
  ${rangeArgs}${symbolArg} \\
  --format=lvgl \\
  --output="${outputName}_${sz}.c" \\
  --no-compress`
  ).join('\n\n');
}

/**
 * Decode base64 font data to Uint8Array
 */
function decodeBase64ToBytes(base64Data: string): Uint8Array {
  const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
  const binaryString = atob(raw);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Read uint16 big-endian from byte array
 */
function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

/**
 * Read uint32 big-endian from byte array
 */
function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

/**
 * Parse font file and extract metadata by reading the TTF/OTF name table.
 * Extracts nameID 1 (Font Family) and nameID 2 (Font Subfamily / Style).
 */
export async function parseFontMetadata(base64Data: string): Promise<{
  family: string;
  style: string;
  unitsPerEm: number;
}> {
  try {
    const bytes = decodeBase64ToBytes(base64Data);

    // Validate magic number
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const isValidFont = magic === '\x00\x01\x00\x00' || // TTF
                        magic === 'OTTO' ||              // OTF (CFF)
                        magic === 'true' ||              // TrueType (Apple)
                        magic === 'typ1';                // Type 1
    if (!isValidFont) {
      throw new Error('Invalid font file format');
    }

    const numTables = readUint16BE(bytes, 4);

    // Locate 'name' and 'head' tables from the table directory
    let nameTableOffset = 0;
    let headTableOffset = 0;

    for (let i = 0; i < numTables; i++) {
      const entryOffset = 12 + i * 16;
      const tag = String.fromCharCode(
        bytes[entryOffset], bytes[entryOffset + 1],
        bytes[entryOffset + 2], bytes[entryOffset + 3]
      );
      const tableOffset = readUint32BE(bytes, entryOffset + 8);

      if (tag === 'name') nameTableOffset = tableOffset;
      if (tag === 'head') headTableOffset = tableOffset;
    }

    // Parse unitsPerEm from head table
    let unitsPerEm = 1000;
    if (headTableOffset > 0 && headTableOffset + 18 + 2 <= bytes.length) {
      unitsPerEm = readUint16BE(bytes, headTableOffset + 18);
    }

    // Parse name table
    let family = 'Unknown';
    let style = 'Regular';

    if (nameTableOffset > 0) {
      const count = readUint16BE(bytes, nameTableOffset + 2);
      const stringOffset = readUint16BE(bytes, nameTableOffset + 4);
      const storageStart = nameTableOffset + stringOffset;

      // We'll collect candidates; prefer platformID 3 (Windows) with encodingID 1 (Unicode BMP)
      // Fall back to platformID 1 (Macintosh) with encodingID 0 (Roman)
      let familyWin = '';
      let styleWin = '';
      let familyMac = '';
      let styleMac = '';

      for (let i = 0; i < count; i++) {
        const recordOffset = nameTableOffset + 6 + i * 12;
        if (recordOffset + 12 > bytes.length) break;

        const platformID = readUint16BE(bytes, recordOffset);
        const encodingID = readUint16BE(bytes, recordOffset + 2);
        const nameID = readUint16BE(bytes, recordOffset + 6);
        const length = readUint16BE(bytes, recordOffset + 8);
        const offset = readUint16BE(bytes, recordOffset + 10);

        const strStart = storageStart + offset;
        if (strStart + length > bytes.length) continue;

        // Only care about nameID 1 (family) and nameID 2 (style)
        if (nameID !== 1 && nameID !== 2) continue;

        let decoded = '';

        if (platformID === 3 && encodingID === 1) {
          // Windows Unicode BMP — UTF-16BE
          const chars: string[] = [];
          for (let j = 0; j < length; j += 2) {
            chars.push(String.fromCharCode(readUint16BE(bytes, strStart + j)));
          }
          decoded = chars.join('');
        } else if (platformID === 1 && encodingID === 0) {
          // Macintosh Roman — single-byte
          const chars: string[] = [];
          for (let j = 0; j < length; j++) {
            chars.push(String.fromCharCode(bytes[strStart + j]));
          }
          decoded = chars.join('');
        } else {
          continue;
        }

        if (!decoded.trim()) continue;

        if (platformID === 3) {
          if (nameID === 1) familyWin = decoded;
          if (nameID === 2) styleWin = decoded;
        } else {
          if (nameID === 1) familyMac = decoded;
          if (nameID === 2) styleMac = decoded;
        }
      }

      family = familyWin || familyMac || 'Unknown';
      style = styleWin || styleMac || 'Regular';
    }

    return { family, style, unitsPerEm };
  } catch (error) {
    console.error('Failed to parse font:', error);
    return { family: 'Unknown', style: 'Regular', unitsPerEm: 1000 };
  }
}

/**
 * Generate a .c source file template for a converted LVGL font.
 * The template contains placeholder data structures with comments
 * explaining that lv_font_conv should fill in the actual bitmap data.
 */
export function generateFontSourceTemplate(
  cFontName: string,
  family: string,
  style: string,
  size: number,
  bpp: number,
  selection: CharsetSelection
): string {
  const glyphCount = charsetCodePoints(selection).size;
  const rangeStr = describeSelection(selection);
  const rangeArgs = selection.ranges
    .split(',')
    .map((range) => range.trim())
    .filter(Boolean)
    .map((range) => `--range=${range}`)
    .join(' ');

  const varName = `${cFontName}_${size}`;

  return `/**
 * @file ${varName}.c
 * @brief LVGL font source — ${family} ${style} ${size}px
 *
 * BPP:          ${bpp}
 * Glyph count:  ${glyphCount}
 * Coverage:     ${rangeStr}
 *
 * !! THIS IS A TEMPLATE !!
 * The actual glyph bitmaps and metrics must be generated by lv_font_conv.
 * Run the following command to produce the real file:
 *
 *   lv_font_conv --font "<your_font>.ttf" --size=${size} --bpp=${bpp} \\
 *     ${rangeArgs} \\
 *     --format=lvgl --output="${varName}.c"
 *
 * Generated by EDT GUI Studio
 */

#include "lvgl.h"

/*------------------------------------------------------------
 * Glyph bitmap data (placeholder)
 * lv_font_conv will fill this with actual bitmap bytes.
 *------------------------------------------------------------*/
static const uint8_t glyph_bitmap[] = {
    /* TODO: lv_font_conv output */
    0x00
};

/*------------------------------------------------------------
 * Glyph descriptors (placeholder)
 * Each entry maps a glyph to its bitmap offset, size, and bearing.
 *------------------------------------------------------------*/
static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {
    /* {.bitmap_index, .adv_w, .box_w, .box_h, .ofs_x, .ofs_y} */
    {0, 0, 0, 0, 0, 0}  /* placeholder */
};

/*------------------------------------------------------------
 * Character mapping (placeholder)
 * Maps Unicode code points to glyph descriptor indices.
 *------------------------------------------------------------*/
static const lv_font_fmt_txt_cmap_t cmaps[] = {
    {
        .range_start = 32,
        .range_length = ${glyphCount},
        .glyph_id_start = 0,
        .unicode_list = NULL,
        .glyph_id_ofs_list = NULL,
        .list_length = 0,
        .type = LV_FONT_FMT_TXT_CMAP_FORMAT0_TINY
    }
};

/*------------------------------------------------------------
 * Font descriptor
 *------------------------------------------------------------*/
static const lv_font_fmt_txt_dsc_t font_dsc = {
    .glyph_bitmap = glyph_bitmap,
    .glyph_dsc = glyph_dsc,
    .cmaps = cmaps,
    .kern_dsc = NULL,
    .kern_scale = 0,
    .cmap_num = 1,
    .bpp = ${bpp},
    .kern_classes = 0,
    .bitmap_format = 0
};

/*------------------------------------------------------------
 * Public font structure
 *------------------------------------------------------------*/
const lv_font_t ${varName} = {
    .get_glyph_dsc = lv_font_get_glyph_dsc_fmt_txt,
    .get_glyph_bitmap = lv_font_get_bitmap_fmt_txt,
    .line_height = ${size},
    .base_line = 0,
    .subpx = LV_FONT_SUBPX_NONE,
    .underline_position = -1,
    .underline_thickness = 1,
    .dsc = (void *)&font_dsc
};
`;
}

/**
 * Convert font file to base64
 */
export function fontFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read font file'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Default font conversion options
 */
export const DEFAULT_FONT_OPTIONS: FontConversionOptions = {
  sizes: [16],
  charset: 'ascii',
  bpp: 4,
  compress: false,
};

/**
 * Common font sizes for UI
 */
export const COMMON_FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64];

/**
 * Preview text for font display
 */
export const FONT_PREVIEW_TEXT = 'The quick brown fox jumps over the lazy dog. 0123456789';
export const FONT_PREVIEW_TEXT_CJK = 'CJK glyph preview: 漢字 日本語 한국어 Aa123';
