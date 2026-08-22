import { describe, it, expect } from 'vitest';
import {
  encodeQrcode,
  normalizeQrcodeProps,
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
  it('defaults to a literal with the standard knobs at their resting values', () => {
    const settings = normalizeQrcodeProps(undefined);
    expect(settings.source).toBe('literal');
    expect(settings.literal).toBe('https://bitdove.net');
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

  it('says when there is nothing to encode', () => {
    const { error } = encodeQrcode('', normalizeQrcodeProps({}));
    expect(error).toMatch(/Nothing to encode/);
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
