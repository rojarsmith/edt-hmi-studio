// Browser-side loading of bundled font files. Kept out of bundledFonts.ts so
// that module stays importable from the dev server, which has no fetch base
// URL and reads public/ from disk instead.

import { BUNDLED_FONT_DIR } from './bundledFonts';

/** btoa takes a binary string, and 4.5MB of it must be built in chunks. */
function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunk)));
  }
  return btoa(parts.join(''));
}

/**
 * Fetch a bundled font from the app's own static files.
 * Returns a data URL in the same shape an upload produces, so everything
 * downstream (canvas @font-face, coverage parsing, conversion) is unchanged.
 */
export async function loadBundledFontData(
  file: string,
): Promise<{ data: string; size: number }> {
  const base = import.meta.env?.BASE_URL ?? '/';
  const response = await fetch(`${base}${BUNDLED_FONT_DIR}/${file}`);
  if (!response.ok) {
    throw new Error(`Bundled font ${file} not found (HTTP ${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return {
    data: `data:font/opentype;base64,${bytesToBase64(new Uint8Array(buffer))}`,
    size: buffer.byteLength,
  };
}
