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

const requireFrom = createRequire(import.meta.url);

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
