import { describe, it, expect } from 'vitest';
import {
  encodeQrcode,
  normalizeQrcodeProps,
  planQrcode,
  qrcodeMinVersion,
  qrcodePixelSize,
  resolveQrcodeContent,
} from '../qrcodeModel';
import type { TextResource } from '../../types';

const texts: TextResource[] = [
  {
    id: 'text-1',
    key: 'siteUrl',
    values: { en: 'https://bitdove.net', 'zh-TW': 'https://bitdove.net/tw' },
  },
  {
    id: 'text-2',
    key: 'noEnglish',
    values: { 'zh-TW': '只有中文' },
  },
];

describe('reading a widget’s props into QR settings', () => {
  it('defaults to an empty literal with the standard knobs at their resting values', () => {
    const settings = normalizeQrcodeProps(undefined);
    expect(settings.source).toBe('literal');
    // No sample address: a new widget is blank until someone gives it content.
    expect(settings.literal).toBe('');
    expect(settings.version).toBe(0);
    expect(settings.scale).toBe(2);
    expect(settings.ecc).toBe('M');
  });

  it('clamps version and scale to the standard’s ranges', () => {
    expect(normalizeQrcodeProps({ version: 99 }).version).toBe(40);
    expect(normalizeQrcodeProps({ version: -3 }).version).toBe(0);
    expect(normalizeQrcodeProps({ scale: 0 }).scale).toBe(1);
    expect(normalizeQrcodeProps({ scale: 40 }).scale).toBe(8);
  });

  it('accepts only the four levels the standard defines', () => {
    expect(normalizeQrcodeProps({ ecc: 'H' }).ecc).toBe('H');
    expect(normalizeQrcodeProps({ ecc: 'X' }).ecc).toBe('M');
  });
});

describe('what the code encodes', () => {
  it('reads a text resource in English, whatever the panel speaks', () => {
    const settings = normalizeQrcodeProps({ source: 'text', textId: 'text-1' });
    expect(resolveQrcodeContent(settings, texts, ['zh-TW', 'en'])).toBe('https://bitdove.net');
  });

  it('falls back like every text reader when English is missing', () => {
    const settings = normalizeQrcodeProps({ source: 'text', textId: 'text-2' });
    expect(resolveQrcodeContent(settings, texts, ['zh-TW'])).toBe('只有中文');
  });

  it('is empty for a resource that no longer exists', () => {
    const settings = normalizeQrcodeProps({ source: 'text', textId: 'gone' });
    expect(resolveQrcodeContent(settings, texts, ['en'])).toBe('');
  });

  it('uses the literal as typed', () => {
    const settings = normalizeQrcodeProps({ source: 'literal', literal: 'HELLO' });
    expect(resolveQrcodeContent(settings, texts, ['en'])).toBe('HELLO');
  });
});

describe('encoding', () => {
  it('picks the smallest version that fits on auto', () => {
    const settings = normalizeQrcodeProps({ version: 0, ecc: 'M' });
    const { render } = encodeQrcode('https://bitdove.net', settings);
    expect(render).not.toBeNull();
    expect(render!.version).toBeGreaterThanOrEqual(1);
    expect(render!.moduleCount).toBe(17 + 4 * render!.version);
  });

  it('honours a pinned version', () => {
    const settings = normalizeQrcodeProps({ version: 10, ecc: 'L' });
    const { render } = encodeQrcode('https://bitdove.net', settings);
    expect(render!.version).toBe(10);
    expect(render!.moduleCount).toBe(57);
  });

  it('says when the content does not fit the pinned version', () => {
    const settings = normalizeQrcodeProps({ version: 1, ecc: 'H' });
    const { render, error } = encodeQrcode('https://bitdove.net/some/long/path/x', settings);
    expect(render).toBeNull();
    expect(error).toMatch(/does not fit version 1 at level H/);
  });

  it('treats no content as blank, not as an error', () => {
    const encoded = encodeQrcode('', normalizeQrcodeProps({}));
    expect(encoded.empty).toBe(true);
    expect(encoded.render).toBeNull();
    expect(encoded.error).toBeNull();
  });

  it('encodes Unicode as UTF-8 bytes, the way every phone scanner reads it', () => {
    // こんにちは is 15 UTF-8 bytes: too long for version 1 at M (14 bytes),
    // so a correct encoder needs version 2. The library's default byte
    // encoder truncated each character to its low byte — 5 bytes, version 1,
    // and a code that scanned as noise. This is the test that keeps it out.
    const { render } = encodeQrcode('こんにちは', normalizeQrcodeProps({ version: 0, ecc: 'M' }));
    expect(render).not.toBeNull();
    expect(render!.version).toBe(2);
  });

  it('fits Japanese into a pinned version by its UTF-8 byte count', () => {
    // 15 bytes fit version 2 at M (28 bytes) and do not fit version 1 at M.
    expect(encodeQrcode('こんにちは', normalizeQrcodeProps({ version: 2, ecc: 'M' })).render).not.toBeNull();
    expect(encodeQrcode('こんにちは', normalizeQrcodeProps({ version: 1, ecc: 'M' })).render).toBeNull();
  });

  it('counts the quiet zone into the pixel size, and leaves it out when off', () => {
    // 25 modules + 4 each side, at 3 px per module.
    expect(qrcodePixelSize(25, 3)).toBe(99);
    expect(qrcodePixelSize(25, 3, false)).toBe(75);
  });

  it('reads the quiet zone as on unless switched off', () => {
    expect(normalizeQrcodeProps({}).quietZone).toBe(true);
    expect(normalizeQrcodeProps({ quietZone: false }).quietZone).toBe(false);
  });
});

describe('planning the widget around a string that is not its content', () => {
  const box = { width: 120, height: 120 };

  it('has nothing to say about an empty string', () => {
    expect(planQrcode('', normalizeQrcodeProps({}), box, null)).toBeNull();
  });

  it('counts characters and UTF-8 bytes separately, and says when they differ', () => {
    const ascii = planQrcode('https://bitdove.net', normalizeQrcodeProps({}), box, null)!;
    expect(ascii.characters).toBe(19);
    expect(ascii.bytes).toBe(19);
    expect(ascii.multibyte).toBe(false);

    // Five kana, fifteen bytes: what the code and the registers count.
    const japanese = planQrcode('こんにちは', normalizeQrcodeProps({}), box, null)!;
    expect(japanese.characters).toBe(5);
    expect(japanese.bytes).toBe(15);
    expect(japanese.multibyte).toBe(true);
  });

  it('finds the smallest version at every level, by the same encoder the code uses', () => {
    // Byte-mode capacities for version 1: L 17, M 14, Q 11, H 7; version 2:
    // L 32, M 26, Q 20, H 14; version 3 H holds 24.
    const plan = planQrcode('https://bitdove.net', normalizeQrcodeProps({ ecc: 'M' }), box, null)!;
    expect(plan.minVersionByLevel).toEqual({ L: 2, M: 2, Q: 2, H: 3 });
    expect(plan.minVersion).toBe(2);
    expect(plan.moduleCount).toBe(25);
    // (25 + 8) modules at scale 2.
    expect(plan.pixelSize).toBe(66);

    expect(qrcodeMinVersion('こんにちは', 'M')).toBe(2);
  });

  it('says nothing more when everything fits', () => {
    const plan = planQrcode('https://bitdove.net', normalizeQrcodeProps({}), box, null)!;
    expect(plan.advice).toEqual([]);
  });

  it('names the version to pin when the pinned one is too small', () => {
    const plan = planQrcode(
      'https://bitdove.net/order/12345/line/7',
      normalizeQrcodeProps({ version: 1 }),
      box,
      null,
    )!;
    expect(plan.advice[0]).toMatch(/pinned to 1.*set it to \d+ or higher, or to Auto/);
  });

  it('names the scale that fits, or the box to grow to, when the code outgrows the widget', () => {
    const settings = normalizeQrcodeProps({ scale: 6 });
    const plan = planQrcode('https://bitdove.net', settings, box, null)!;
    // 33 modules with margin at scale 6 = 198 px in a 120 px box; scale 3 = 99 fits.
    expect(plan.pixelSize).toBe(198);
    expect(plan.scaleThatFits).toBe(3);
    expect(plan.advice[0]).toMatch(/lower the scale to 3, or enlarge the widget to 198×198/);

    const tiny = planQrcode('https://bitdove.net', normalizeQrcodeProps({}), { width: 20, height: 20 }, null)!;
    expect(tiny.scaleThatFits).toBe(0);
    expect(tiny.advice[0]).toMatch(/enlarge the widget to at least 33×33/);
  });

  it('counts the registers communication needs, and checks them against the binding', () => {
    const plan = planQrcode('こんにちは', normalizeQrcodeProps({}), box, { stringRegisters: 6 })!;
    // 15 bytes, two per register, rounded up.
    expect(plan.registers).toBe(8);
    expect(plan.advice[0]).toMatch(/Length is 6 registers \(12 bytes\); this string needs 8/);

    const roomy = planQrcode('こんにちは', normalizeQrcodeProps({}), box, { stringRegisters: 8 })!;
    expect(roomy.advice).toEqual([]);
  });

  it('says when communication cannot carry the string at all', () => {
    const long = 'https://bitdove.net/' + 'x'.repeat(120);
    const plan = planQrcode(long, normalizeQrcodeProps({}), { width: 400, height: 400 }, { stringRegisters: 64 })!;
    expect(plan.bytes).toBe(140);
    expect(plan.advice.some((line) => /Longer than communication can carry: 140 bytes/.test(line))).toBe(true);
  });

  it('says when no version holds it', () => {
    const plan = planQrcode('x'.repeat(3000), normalizeQrcodeProps({ ecc: 'L' }), { width: 400, height: 400 }, null)!;
    expect(plan.minVersion).toBeNull();
    expect(plan.advice[0]).toMatch(/Too long for a QR code at level L: 3000 bytes/);
  });
});

describe('keeping the footprint fixed', () => {
  it('tells an Auto-version widget which version to pin', () => {
    const plan = planQrcode('https://bitdove.net', normalizeQrcodeProps({}), { width: 120, height: 120 }, null)!;
    expect(plan.footprintTip).toMatch(/Pin the version to 2 and every string up to this one draws at the same 25×25 modules/);
  });

  it('has nothing to add once the version is pinned', () => {
    const plan = planQrcode('https://bitdove.net', normalizeQrcodeProps({ version: 3 }), { width: 120, height: 120 }, null)!;
    expect(plan.footprintTip).toBeNull();
  });
});
