import { describe, it, expect } from 'vitest';
import { SUPPORTED_BOARDS, formatMemSize } from '../hmi';

describe('formatMemSize', () => {
  it('reads whole megabytes as megabytes', () => {
    expect(formatMemSize(4096)).toBe('4 MB');
    expect(formatMemSize(1024)).toBe('1 MB');
  });

  it('keeps kilobytes when that is what the number is', () => {
    expect(formatMemSize(96)).toBe('96 KB');
    expect(formatMemSize(1536)).toBe('1536 KB');
  });
});

describe('board LVGL heaps', () => {
  // The heap has to hold one transform layer for the largest widget the panel
  // can show: (w + 10) x (h + 10) x 4 bytes, allocated whole. A board whose
  // heap cannot cover that freezes the display instead of dropping the widget
  // — see docs/lvgl-configuration.md §1.4.
  it('covers a full-screen transform layer on every board', () => {
    for (const board of SUPPORTED_BOARDS) {
      const layerBytes =
        (board.display.width + 10) * (board.display.height + 10) * 4;
      expect(
        board.lvgl.memSizeKb * 1024,
        `${board.name} heap is smaller than one full-screen transform layer`,
      ).toBeGreaterThan(layerBytes);
    }
  });
});
