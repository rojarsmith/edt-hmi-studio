// Browser-side @font-face registration for uploaded fonts.
//
// The editor holds a font as base64 TTF/OTF; injecting a @font-face rule lets
// the canvas and the font panel render real glyphs from it. Shared here so the
// design canvas shows the same face the panel previews.

import type { FontResource } from './types';

/** Rules already injected, so a font is registered once per session. */
const loadedFontFaces = new Set<string>();

/**
 * Ensure the browser can render `font`, returning its CSS family name.
 */
export function ensureFontFaceLoaded(font: FontResource): string {
  const faceName = `ui-font-${font.id}`;
  if (loadedFontFaces.has(faceName)) return faceName;

  const format = font.data.startsWith('data:font/opentype') || font.name.toLowerCase().endsWith('.otf')
    ? 'opentype' : 'truetype';

  const rule = `@font-face { font-family: "${faceName}"; src: url("${font.data}") format("${format}"); font-display: swap; }`;
  const style = document.createElement('style');
  style.textContent = rule;
  document.head.appendChild(style);
  loadedFontFaces.add(faceName);
  return faceName;
}
