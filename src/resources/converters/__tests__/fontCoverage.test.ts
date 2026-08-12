import { describe, it, expect } from 'vitest';
import { parseCmapFormat4, parseCmapFormat12, parseFontCoverage } from '../fontConverter';

/** Big-endian byte writer, so the fixtures read like the spec tables. */
class Writer {
  bytes: number[] = [];
  u8(v: number) { this.bytes.push(v & 0xff); return this; }
  u16(v: number) { this.bytes.push((v >> 8) & 0xff, v & 0xff); return this; }
  u32(v: number) { this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); return this; }
  tag(s: string) { for (const ch of s) this.u8(ch.charCodeAt(0)); return this; }
  get length() { return this.bytes.length; }
  toArray() { return new Uint8Array(this.bytes); }
}

/**
 * A format 4 subtable over the given segments, plus the mandatory 0xFFFF
 * terminator every real font carries.
 */
function format4(segments: { start: number; end: number; idDelta: number }[]): Uint8Array {
  const segs = [...segments, { start: 0xffff, end: 0xffff, idDelta: 1 }];
  const w = new Writer();
  w.u16(4).u16(0).u16(0);            // format, length (unused here), language
  w.u16(segs.length * 2);            // segCountX2
  w.u16(0).u16(0).u16(0);            // searchRange, entrySelector, rangeShift
  for (const s of segs) w.u16(s.end);
  w.u16(0);                          // reservedPad
  for (const s of segs) w.u16(s.start);
  for (const s of segs) w.u16(s.idDelta);
  for (const _ of segs) w.u16(0);    // idRangeOffset: 0 means use idDelta directly
  return w.toArray();
}

function format12(groups: { start: number; end: number; startGlyph: number }[]): Uint8Array {
  const w = new Writer();
  w.u16(12).u16(0);                  // format, reserved
  w.u32(0).u32(0);                   // length, language
  w.u32(groups.length);
  for (const g of groups) w.u32(g.start).u32(g.end).u32(g.startGlyph);
  return w.toArray();
}

/** idDelta that maps `cp` to `glyphId`, as the spec's modulo-65536 arithmetic. */
function deltaFor(cp: number, glyphId: number): number {
  return (glyphId - cp + 0x10000) & 0xffff;
}

describe('parseCmapFormat4', () => {
  it('covers a simple segment', () => {
    const table = format4([{ start: 0x41, end: 0x43, idDelta: deltaFor(0x41, 5) }]);
    expect([...parseCmapFormat4(table, 0)].sort((a, b) => a - b)).toEqual([0x41, 0x42, 0x43]);
  });

  it('ignores the 0xFFFF terminator segment', () => {
    const covered = parseCmapFormat4(format4([{ start: 0x41, end: 0x41, idDelta: deltaFor(0x41, 5) }]), 0);
    expect(covered.has(0xffff)).toBe(false);
  });

  // The reason glyph ids are resolved instead of segment bounds being trusted
  it('excludes code points inside a segment that map to glyph 0', () => {
    // 0x50 lands on glyph 0 (.notdef); 0x51 and 0x52 do not
    const table = format4([{ start: 0x50, end: 0x52, idDelta: deltaFor(0x50, 0) }]);
    const covered = parseCmapFormat4(table, 0);
    expect(covered.has(0x50)).toBe(false);
    expect(covered.has(0x51)).toBe(true);
    expect(covered.has(0x52)).toBe(true);
  });

  it('handles several segments', () => {
    const table = format4([
      { start: 0x41, end: 0x42, idDelta: deltaFor(0x41, 5) },
      { start: 0x4e00, end: 0x4e01, idDelta: deltaFor(0x4e00, 100) },
    ]);
    const covered = parseCmapFormat4(table, 0);
    expect(covered.has(0x41)).toBe(true);
    expect(covered.has(0x4e00)).toBe(true);
    expect(covered.has(0x4e02)).toBe(false);
  });

  it('reads from a non-zero offset', () => {
    const table = format4([{ start: 0x41, end: 0x41, idDelta: deltaFor(0x41, 5) }]);
    const padded = new Uint8Array(16 + table.length);
    padded.set(table, 16);
    expect(parseCmapFormat4(padded, 16).has(0x41)).toBe(true);
  });
});

describe('parseCmapFormat12', () => {
  it('covers a group', () => {
    const covered = parseCmapFormat12(format12([{ start: 0x4e00, end: 0x4e02, startGlyph: 10 }]), 0);
    expect([...covered].sort((a, b) => a - b)).toEqual([0x4e00, 0x4e01, 0x4e02]);
  });

  it('covers code points beyond the BMP, which format 4 cannot express', () => {
    const covered = parseCmapFormat12(format12([{ start: 0x20000, end: 0x20001, startGlyph: 7 }]), 0);
    expect(covered.has(0x20000)).toBe(true);
    expect(covered.has(0x20001)).toBe(true);
  });

  it('handles several groups', () => {
    const covered = parseCmapFormat12(format12([
      { start: 0x41, end: 0x41, startGlyph: 3 },
      { start: 0x4e00, end: 0x4e00, startGlyph: 9 },
    ]), 0);
    expect(covered.has(0x41)).toBe(true);
    expect(covered.has(0x4e00)).toBe(true);
    expect(covered.has(0x42)).toBe(false);
  });
});

/** A whole font file: table directory with one `cmap` holding the given subtables. */
function fontWith(subtables: { platformId: number; encodingId: number; data: Uint8Array }[]): string {
  const cmapHeader = new Writer();
  cmapHeader.u16(0).u16(subtables.length); // version, numTables
  const recordsSize = subtables.length * 8;
  let running = 4 + recordsSize;
  for (const sub of subtables) {
    cmapHeader.u16(sub.platformId).u16(sub.encodingId).u32(running);
    running += sub.data.length;
  }
  const cmapBody: number[] = [...cmapHeader.bytes];
  for (const sub of subtables) cmapBody.push(...sub.data);

  const dir = new Writer();
  dir.u32(0x00010000).u16(1).u16(0).u16(0).u16(0); // sfnt version, numTables=1, ...
  const cmapOffset = 12 + 16;
  dir.tag('cmap').u32(0).u32(cmapOffset).u32(cmapBody.length);

  const all = new Uint8Array([...dir.bytes, ...cmapBody]);
  let binary = '';
  for (const byte of all) binary += String.fromCharCode(byte);
  return `data:font/ttf;base64,${btoa(binary)}`;
}

describe('parseFontCoverage', () => {
  it('reads coverage through the table directory', async () => {
    const font = fontWith([
      { platformId: 3, encodingId: 1, data: format4([{ start: 0x41, end: 0x42, idDelta: deltaFor(0x41, 5) }]) },
    ]);
    const covered = await parseFontCoverage(font);
    expect(covered?.has(0x41)).toBe(true);
    expect(covered?.has(0x43)).toBe(false);
  });

  it('prefers the full-Unicode subtable over the BMP one', async () => {
    const font = fontWith([
      { platformId: 3, encodingId: 1, data: format4([{ start: 0x41, end: 0x41, idDelta: deltaFor(0x41, 5) }]) },
      { platformId: 3, encodingId: 10, data: format12([{ start: 0x20000, end: 0x20000, startGlyph: 7 }]) },
    ]);
    const covered = await parseFontCoverage(font);
    // Only the format 12 table was read, so the astral code point is the tell
    expect(covered?.has(0x20000)).toBe(true);
    expect(covered?.has(0x41)).toBe(false);
  });

  it('returns null when there is no cmap, so callers can say "cannot tell"', async () => {
    const dir = new Writer();
    dir.u32(0x00010000).u16(0).u16(0).u16(0).u16(0);
    let binary = '';
    for (const byte of dir.toArray()) binary += String.fromCharCode(byte);
    expect(await parseFontCoverage(`data:font/ttf;base64,${btoa(binary)}`)).toBeNull();
  });

  it('returns null rather than throwing on rubbish input', async () => {
    expect(await parseFontCoverage('data:font/ttf;base64,AAAA')).toBeNull();
  });
});
