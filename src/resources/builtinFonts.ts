// Which Montserrat sizes actually exist in a build.
//
// LVGL ships Montserrat at every even size from 8 to 48, but each one is behind
// an `LV_FONT_MONTSERRAT_N` switch in lv_conf.h and only the sizes switched on
// are compiled. Referring to a size that is off does not degrade — the symbol
// simply does not exist, and the firmware fails to link with
// `'lv_font_montserrat_22' undeclared`, thousands of lines into a full LVGL
// build.
//
// So the editor must only offer what the targets enable. As
// docs/lvgl-configuration.md notes, these files are not generated from one
// another and have to be kept in step by hand:
//
//   firmware/stm32h747i-disco/include/lv_conf.h
//   firmware/stm32f746g-disco/include/lv_conf.h
//   firmware/edt-evk043027b/include/lv_conf.h
//   wasm/lv_conf.h
//
// All four enable exactly the set below. Adding a size here without adding it
// to all four brings back the undeclared-symbol failure.

/** Montserrat sizes every target's lv_conf.h switches on. */
export const BUILTIN_FONT_SIZES = [12, 14, 16, 20, 24, 28, 32] as const;

/** `montserrat_24` and friends, in the order the size list gives them. */
export const BUILTIN_FONTS = BUILTIN_FONT_SIZES.map((size) => `montserrat_${size}`);

/** Is this a built-in font name rather than a converted font's C symbol? */
export function isBuiltinFont(fontResource: string): boolean {
  return /^montserrat_\d+$/.test(fontResource);
}

/** The built-in size in `montserrat_24`, or undefined for a custom font. */
export function builtinFontSize(fontResource: string): number | undefined {
  const match = fontResource.match(/^montserrat_(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

/**
 * The nearest size a build actually has. Ties round up, so 18 becomes 20 rather
 * than 16 — a size asked for and not available is likelier meant as "about
 * this, and no smaller".
 */
export function nearestBuiltinSize(size: number): number {
  // `<=` over an ascending list is what rounds a tie up: on equal distance the
  // later, larger candidate replaces the earlier one
  return BUILTIN_FONT_SIZES.reduce((best, candidate) =>
    Math.abs(candidate - size) <= Math.abs(best - size) ? candidate : best,
  );
}

/**
 * A built-in font name for a size, snapped to one that exists.
 *
 * Every path that writes `montserrat_N` goes through here, which is what keeps
 * an unbuildable size from being stored in the first place.
 */
export function builtinFontFor(size: number): string {
  return `montserrat_${nearestBuiltinSize(size)}`;
}

/** A typography's stored font, and its per-language overrides. */
interface FontBearing {
  fontResource: string;
  fontSize: number;
  languageFonts?: Record<string, { fontResource: string; fontSize: number }>;
}

/** Snap one font choice onto a size the build has. Custom fonts pass through. */
function snapOne<T extends { fontResource: string; fontSize: number }>(entry: T): T {
  const size = builtinFontSize(entry.fontResource);
  if (size === undefined) return entry;
  const snapped = nearestBuiltinSize(size);
  return snapped === size
    ? entry
    : { ...entry, fontResource: `montserrat_${snapped}`, fontSize: snapped };
}

/**
 * Bring stored typographies onto sizes that exist, per-language overrides too.
 *
 * Projects written while the editor offered all 21 Montserrat sizes can carry
 * one the targets never compiled — `montserrat_22` and the like. Nothing about
 * such a project works: it fails at the link step every time.
 */
export function normalizeBuiltinSizes<T extends FontBearing>(entries: T[]): T[] {
  return entries.map((entry) => {
    const base = snapOne(entry);
    if (!entry.languageFonts) return base;

    const languageFonts = Object.fromEntries(
      Object.entries(entry.languageFonts).map(([code, override]) => [code, snapOne(override)]),
    );
    return { ...base, languageFonts };
  });
}
