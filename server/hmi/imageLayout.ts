// Reads back where each image resource actually ended up, from the linker map
// the build produces.
//
// This is deliberately not a prediction. Alignment, link order and
// --gc-sections all move things, so the only trustworthy answer comes from the
// map that produced the image being flashed.

/** Address at which the QSPI NOR is mapped; see docs/images-external-flash.md. */
export const EXTERNAL_FLASH_BASE = 0x90000000;
export const EXTERNAL_FLASH_END = 0x98000000;

export type MemoryRegion = 'external-flash' | 'internal-flash' | 'other';

/** What a placed asset is, so a font can be told from an image at a glance. */
export type AssetKind = 'image' | 'font';

export interface ImagePlacement {
  /** The asset's C array name, which is also its generated file's stem. */
  cArrayName: string;
  kind: AssetKind;
  /** First byte. */
  address: number;
  /**
   * Last byte, inclusive — `address + size - 1`.
   *
   * Reported rather than left to the reader because the question this panel
   * answers is "does this asset start and end inside the QSPI window", and
   * two ends of one range answer it directly. A zero-size allocation would
   * make an inclusive end sit before its start, so it never reaches here:
   * `consider` drops those.
   */
  endAddress: number;
  size: number;
  region: MemoryRegion;
  /** Region the last byte lands in — the two differ only if a range straddles. */
  endRegion: MemoryRegion;
  /** Output section the linker placed it in, for the curious. */
  section: string;
  /**
   * Glyphs a font carries. Absent for an image, and for a font whose generated
   * source could not be read back — the count comes from that file, not from
   * the map.
   */
  glyphCount?: number;
}

export function regionOf(address: number): MemoryRegion {
  if (address >= EXTERNAL_FLASH_BASE && address < EXTERNAL_FLASH_END) {
    return 'external-flash';
  }
  if (address >= 0x08000000 && address < 0x08200000) return 'internal-flash';
  return 'other';
}

/**
 * GNU ld writes an input section as either
 *
 *   ` .rodata.foo    0x08040000  0x1c  path/to/foo.c.obj`
 *
 * or, when the section name is too long to fit the column, split across two
 * lines with the address on the second. Both forms appear in one map.
 */
const SAME_LINE = /^\s(\S+)\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S.*)$/i;
const NAME_ONLY = /^\s(\S+)$/;
const ADDRESS_ONLY = /^\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S.*)$/i;

/** `.../ui_img_logo.c.obj` -> `ui_img_logo`. Returns null for anything else. */
function cArrayNameFromObject(objectPath: string): string | null {
  const base = objectPath.trim().split(/[\\/]/).pop() ?? '';
  const match = /^(.+)\.c\.obj$/.exec(base);
  return match ? match[1] : null;
}

/**
 * Every input section contributed by a generated asset file, keyed by asset.
 *
 * A generated file contributes more than one section — for an image the pixel
 * array and the small `lv_image_dsc_t` descriptor, for a font the glyph
 * bitmaps plus descriptors, cmaps and the `lv_font_t` — along with empty
 * `.text`/`.data`/`.bss` stubs. The bulk array is by far the largest and is
 * the part that has to be programmed, so the largest allocation wins.
 *
 * `knownCArrayNames` maps each name to what it is. A name absent from it is
 * ignored, which is what keeps the firmware's own objects out of the table.
 */
export function parseImageLayout(
  mapText: string,
  knownCArrayNames: ReadonlyMap<string, AssetKind> | readonly string[],
): ImagePlacement[] {
  // Callers that only have images pass a plain list, as they always did
  const wanted: ReadonlyMap<string, AssetKind> = Array.isArray(knownCArrayNames)
    ? new Map(knownCArrayNames.map((name) => [name, 'image' as const]))
    : (knownCArrayNames as ReadonlyMap<string, AssetKind>);
  const best = new Map<string, ImagePlacement>();

  const consider = (section: string, address: number, size: number, object: string) => {
    if (size <= 0) return;
    const cArrayName = cArrayNameFromObject(object);
    if (!cArrayName) return;
    const kind = wanted.get(cArrayName);
    if (!kind) return;
    const existing = best.get(cArrayName);
    if (existing && existing.size >= size) return;
    const endAddress = address + size - 1;
    best.set(cArrayName, {
      cArrayName,
      kind,
      address,
      endAddress,
      size,
      region: regionOf(address),
      endRegion: regionOf(endAddress),
      section,
    });
  };

  const lines = mapText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const sameLine = SAME_LINE.exec(line);
    if (sameLine) {
      consider(
        sameLine[1],
        Number.parseInt(sameLine[2], 16),
        Number.parseInt(sameLine[3], 16),
        sameLine[4],
      );
      continue;
    }

    const nameOnly = NAME_ONLY.exec(line);
    if (nameOnly && i + 1 < lines.length) {
      const addressOnly = ADDRESS_ONLY.exec(lines[i + 1]);
      if (addressOnly) {
        consider(
          nameOnly[1],
          Number.parseInt(addressOnly[1], 16),
          Number.parseInt(addressOnly[2], 16),
          addressOnly[3],
        );
        i += 1;
      }
    }
  }

  return [...best.values()].sort((a, b) => a.address - b.address);
}
