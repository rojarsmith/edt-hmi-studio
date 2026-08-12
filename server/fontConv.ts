/**
 * Building the lv_font_conv invocation.
 *
 * Split out from the compile plugin so the argument list can be tested without
 * a toolchain, and so it is expressed as argv rather than assembled into a
 * shell string. See docs/charset-trimming-design.md §5 for why that matters:
 * once the collected characters travel as `--symbols`, authored text reaches
 * the command line, and a label containing a double quote is enough to break
 * the invocation and take `--output` with it.
 */

import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const requireFrom = createRequire(import.meta.url);

/**
 * Converted fonts, keyed by font content plus the exact glyph set.
 *
 * Survives dev-server restarts, which matters because a CJK conversion is tens
 * of seconds. The key includes the glyph set, so editing one label invalidates
 * that font — expected, but it means hit rates while actively editing text are
 * lower than they look.
 */
export const FONT_CACHE_DIR = join(tmpdir(), 'edt-gui-studio-font-cache');

/** What the conversion has always fallen back to when nothing else is given. */
export const FALLBACK_RANGE = '0x20-0x7E';

export interface FontConvSpec {
  /** Path to the .ttf/.otf written for this run. */
  fontFile: string;
  /** Path the .c should be written to. */
  outFile: string;
  size: number;
  bpp: number;
  /** Comma-separated ranges, e.g. `"0x20-0x7e,0x4e00-0x4eff"`. May be empty. */
  ranges: string;
  /** Literal characters to include. May be empty. */
  symbols?: string;
}

/**
 * The argv for one lv_font_conv run, excluding the script path itself.
 *
 * Every value is its own array element, so nothing is ever quoted or escaped.
 */
export function buildFontConvArgs(spec: FontConvSpec): string[] {
  const ranges = spec.ranges
    .split(',')
    .map((range) => range.trim())
    .filter(Boolean);
  const symbols = spec.symbols ?? '';

  // Neither given: keep the ASCII default rather than converting an empty font
  if (ranges.length === 0 && symbols === '') {
    ranges.push(FALLBACK_RANGE);
  }

  const args = [
    '--font', spec.fontFile,
    '--size', String(spec.size),
    '--bpp', String(spec.bpp),
  ];

  for (const range of ranges) {
    args.push('--range', range);
  }
  if (symbols !== '') {
    args.push('--symbols', symbols);
  }

  args.push('--format', 'lvgl', '--output', spec.outFile, '--no-compress');
  return args;
}

export interface FontCacheKeySpec {
  /** Digest of the font file itself, hashed once per font rather than per size. */
  fontHash: string;
  /**
   * The C variable name.
   *
   * Part of the key because lv_font_conv names the global it emits after the
   * output file, so the same glyphs under a different name are a different
   * file — reusing one for the other would produce C that declares a font
   * nothing refers to.
   */
  cFontName: string;
  size: number;
  bpp: number;
  ranges: string;
  symbols?: string;
}

/**
 * Cache key for one converted font variant.
 *
 * The glyph set is normalised first, so a reordering that means nothing to the
 * output does not miss the cache: symbols are deduplicated and sorted, ranges
 * trimmed, lowercased and sorted.
 */
export function fontCacheKey(spec: FontCacheKeySpec): string {
  const ranges = spec.ranges
    .split(',')
    .map((range) => range.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
  const symbols = [...new Set([...(spec.symbols ?? '')])].sort().join('');

  return createHash('sha256')
    .update(spec.fontHash).update('\0')
    .update(spec.cFontName).update('\0')
    .update(String(spec.size)).update('\0')
    .update(String(spec.bpp)).update('\0')
    .update(ranges).update('\0')
    .update(symbols)
    .digest('hex')
    .slice(0, 32);
}

/** Digest of the font file bytes. Computed once per font, reused for each size. */
export function hashFontData(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Absolute path to lv_font_conv's JS entry point.
 *
 * Resolved rather than shelling out to the `lv_font_conv` command: the package
 * ships only a `bin`, and on Windows spawning the `.cmd` shim without a shell
 * fails EINVAL under Node's CVE-2024-27980 mitigation. Spawning node against
 * this path sidesteps both, and makes the conversion work without a global
 * install.
 */
export function resolveLvFontConvEntry(): string {
  return requireFrom.resolve('lv_font_conv/lv_font_conv.js');
}

/** Run a Node script as argv, with no shell in between. */
function runNode(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        code: err ? (err as NodeJS.ErrnoException & { status?: number }).status ?? 1 : 0,
      });
    });
  });
}

/** One font to convert, as it arrives from the client or a project file. */
export interface FontConversionRequest {
  /** base64 data URI of the TTF/OTF. */
  data: string;
  cFontName: string;
  ranges: string;
  variants: { size: number; symbols?: string }[];
  bpp: number;
}

/**
 * Convert fonts to LVGL C sources, one file per size.
 *
 * Shared by the WASM compile preview and the firmware build so the two cannot
 * disagree about which glyphs exist — see docs/charset-trimming-design.md §8.
 * Returns a map of file name → C source.
 */
export async function convertFonts(
  fonts: FontConversionRequest[],
  workDir: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (fonts.length === 0) return result;

  const lvFontConvEntry = resolveLvFontConvEntry();

  for (const font of fonts) {
    const raw = font.data.replace(/^data:[^;]+;base64,/, '');
    const fontBytes = Buffer.from(raw, 'base64');

    const ext = font.data.includes('font/opentype') || font.data.includes('.otf') ? '.otf' : '.ttf';
    const fontFile = join(workDir, `${font.cFontName}${ext}`);
    await mkdir(workDir, { recursive: true });
    await writeFile(fontFile, fontBytes);

    // Hashed once per font: the file is megabytes and every size shares it
    const fontHash = hashFontData(fontBytes);

    for (const variant of font.variants ?? []) {
      const outName = `${font.cFontName}_${variant.size}`;
      const outFile = join(workDir, `${outName}.c`);

      const cacheKey = fontCacheKey({
        fontHash,
        cFontName: font.cFontName,
        size: variant.size,
        bpp: font.bpp,
        ranges: font.ranges,
        symbols: variant.symbols,
      });
      const cachePath = join(FONT_CACHE_DIR, `${cacheKey}.c`);

      if (existsSync(cachePath)) {
        result[`${outName}.c`] = await readFile(cachePath, 'utf-8');
        continue;
      }

      // argv, not a shell string: the symbols carry authored text, and a label
      // holding a double quote would otherwise swallow --output
      const args = buildFontConvArgs({
        fontFile,
        outFile,
        size: variant.size,
        bpp: font.bpp,
        ranges: font.ranges,
        symbols: variant.symbols,
      });

      const convResult = await runNode([lvFontConvEntry, ...args], workDir);
      if (convResult.code !== 0) {
        throw new Error(
          `lv_font_conv failed for ${outName}: ${convResult.stderr || convResult.stdout}`,
        );
      }

      const cContent = await readFile(outFile, 'utf-8');
      result[`${outName}.c`] = cContent;

      // Populate the cache last, so a failed run never leaves a usable entry.
      // Written via a unique temp name and renamed, so a second build
      // converting the same font cannot expose a half-written file.
      try {
        await mkdir(FONT_CACHE_DIR, { recursive: true });
        const staging = `${cachePath}.${randomUUID()}.tmp`;
        await writeFile(staging, cContent, 'utf-8');
        await rename(staging, cachePath);
      } catch (err) {
        // A cache that cannot be written is slow, not broken
        console.warn(`[fontConv] could not cache ${outName}:`, err);
      }
    }
  }

  return result;
}
