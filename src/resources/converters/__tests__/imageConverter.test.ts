// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_OPTIONS,
  generateImageCCode,
  resolveEmittedFormat,
} from '../imageConverter';
import type { ImageFormat } from '../../types';

/**
 * Build a 2x1 image: pixel 0 opaque red, pixel 1 with the given alpha.
 */
function makeImageData(secondPixelAlpha: number): ImageData {
  return {
    width: 2,
    height: 1,
    data: Uint8ClampedArray.from([
      255, 0, 0, 255,
      0, 0, 255, secondPixelAlpha,
    ]),
  } as ImageData;
}

function convert(format: ImageFormat, alpha: number, version: '8' | '9' = '9') {
  return generateImageCCode(
    'ui_img_test',
    makeImageData(alpha),
    { ...DEFAULT_IMAGE_OPTIONS, format },
    version,
  );
}

/**
 * Parse the hex byte literals out of the generated data array.
 */
function dataBytes(cCode: string): number[] {
  const body = cCode.slice(
    cCode.indexOf('_data[] = {') + '_data[] = {'.length,
    cCode.indexOf('};'),
  );
  return [...body.matchAll(/0x([0-9A-F]{2})/g)].map((m) => parseInt(m[1], 16));
}

describe('resolveEmittedFormat', () => {
  it('leaves the requested format alone for opaque sources', () => {
    expect(resolveEmittedFormat('RGB565', false, '9')).toBe('RGB565');
    expect(resolveEmittedFormat('RGB888', false, '9')).toBe('RGB888');
    expect(resolveEmittedFormat('ARGB8888', false, '9')).toBe('ARGB8888');
  });

  it('promotes alpha-less formats when the source is transparent', () => {
    expect(resolveEmittedFormat('RGB565', true, '9')).toBe('RGB565A8');
    expect(resolveEmittedFormat('RGB888', true, '9')).toBe('ARGB8888');
    expect(resolveEmittedFormat('ARGB8888', true, '9')).toBe('ARGB8888');
  });

  it('falls back to ARGB8888 on v8, whose alpha layout is color-depth dependent', () => {
    expect(resolveEmittedFormat('RGB565', true, '8')).toBe('ARGB8888');
    expect(resolveEmittedFormat('RGB888', true, '8')).toBe('ARGB8888');
  });
});

describe('generateImageCCode', () => {
  it('keeps RGB565 for a fully opaque source', () => {
    const result = convert('RGB565', 255);
    expect(result.format).toBe('RGB565');
    expect(result.formatUpgraded).toBe(false);
    expect(result.dataSize).toBe(4);
    expect(result.cCode).toContain('.cf = LV_COLOR_FORMAT_RGB565');
    expect(result.cCode).toContain('.stride = 4');
  });

  it('emits planar RGB565A8 rather than dropping alpha', () => {
    const result = convert('RGB565', 0x40);
    expect(result.format).toBe('RGB565A8');
    expect(result.formatUpgraded).toBe(true);
    // 2 pixels: 2 bytes of colour each, then 1 byte of alpha each.
    expect(result.dataSize).toBe(6);
    expect(result.cCode).toContain('.cf = LV_COLOR_FORMAT_RGB565A8');
    // LVGL derives the alpha-plane stride as half the reported stride, so the
    // descriptor must report the colour plane's stride (w * 2), not w * 3.
    expect(result.cCode).toContain('.stride = 4');
    expect(result.cCode).toContain('.data_size = 6');

    const bytes = dataBytes(result.cCode);
    expect(bytes).toHaveLength(6);
    // Colour plane: red then blue, RGB565 little-endian.
    expect(bytes.slice(0, 4)).toEqual([0x00, 0xF8, 0x1F, 0x00]);
    // Alpha plane follows the whole colour plane.
    expect(bytes.slice(4)).toEqual([0xFF, 0x40]);
  });

  it('promotes RGB888 to ARGB8888 rather than dropping alpha', () => {
    const result = convert('RGB888', 0x80);
    expect(result.format).toBe('ARGB8888');
    expect(result.formatUpgraded).toBe(true);
    expect(result.dataSize).toBe(8);
    expect(result.cCode).toContain('.cf = LV_COLOR_FORMAT_ARGB8888');
    expect(result.cCode).toContain('.stride = 8');
    expect(dataBytes(result.cCode).slice(4)).toEqual([0xFF, 0x00, 0x00, 0x80]);
  });

  it('records the promotion in the generated header comment', () => {
    expect(convert('RGB565', 0x10).cCode).toContain(
      'Format: RGB565A8 (requested RGB565, promoted to keep the alpha channel)',
    );
  });

  it('promotes to ARGB8888 on LVGL v8', () => {
    const result = convert('RGB565', 0x10, '8');
    expect(result.format).toBe('ARGB8888');
    expect(result.cCode).toContain('.cf = LV_IMG_CF_TRUE_COLOR_ALPHA');
  });

  it('keeps LV_IMG_CF_TRUE_COLOR for opaque v8 images', () => {
    const result = convert('RGB565', 255, '8');
    expect(result.format).toBe('RGB565');
    expect(result.cCode).toContain('.cf = LV_IMG_CF_TRUE_COLOR');
    expect(result.cCode).not.toContain('LV_IMG_CF_TRUE_COLOR_ALPHA');
  });
});
