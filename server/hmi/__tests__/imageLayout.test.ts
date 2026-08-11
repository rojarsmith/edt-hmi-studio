import { describe, expect, it } from 'vitest';
import { parseImageLayout, regionOf } from '../imageLayout';

/**
 * Taken verbatim from a firmware.map produced by the real build, including the
 * two-line form GNU ld uses when a section name is too long for the column.
 */
const MAP = String.raw`
Linker script and memory map

 .rodata.ui_img_probe
                0x080409b0       0x1c CMakeFiles/firmware.dir/C_/tmp/src/ui_img_probe.c.obj
                0x080409b0                ui_img_probe
 .rodata.CSWTCH.1
                0x080409cc        0x8 CMakeFiles/firmware.dir/.hmi-cache/Drivers/STM32H7xx_HAL_Driver/Src/stm32h7xx_hal_ltdc.c.obj
 .text          0x00000000        0x0 CMakeFiles/firmware.dir/C_/tmp/src/ui_img_probe.c.obj
 .bss           0x00000000        0x0 CMakeFiles/firmware.dir/C_/tmp/src/ui_img_probe.c.obj

.ext_flash_images
                0x90000000     0x4000
                0x90000000                        __ext_flash_images_start = .
 *(.ext_flash_images)
 .ext_flash_images
                0x90000000     0x4000 CMakeFiles/firmware.dir/C_/tmp/src/ui_img_probe.c.obj
 .ext_flash_images
                0x90004000      0x800 CMakeFiles/firmware.dir/C_/tmp/src/ui_img_icon.c.obj
`;

describe('regionOf', () => {
  it('recognises the QSPI window', () => {
    expect(regionOf(0x90000000)).toBe('external-flash');
    expect(regionOf(0x97ffffff)).toBe('external-flash');
  });

  it('recognises internal flash', () => {
    expect(regionOf(0x08040000)).toBe('internal-flash');
  });

  it('does not claim SDRAM', () => {
    expect(regionOf(0xd0000000)).toBe('other');
  });
});

describe('parseImageLayout', () => {
  const names = ['ui_img_probe', 'ui_img_icon'];

  it('reports the pixel data, not the small descriptor', () => {
    const layout = parseImageLayout(MAP, names);
    const probe = layout.find((e) => e.cArrayName === 'ui_img_probe');
    // 0x1c is the lv_image_dsc_t in .rodata; 0x4000 is the pixel array.
    expect(probe?.size).toBe(0x4000);
    expect(probe?.address).toBe(0x90000000);
    expect(probe?.region).toBe('external-flash');
    expect(probe?.section).toBe('.ext_flash_images');
  });

  it('finds every generated image', () => {
    expect(parseImageLayout(MAP, names).map((e) => e.cArrayName))
      .toEqual(['ui_img_probe', 'ui_img_icon']);
  });

  it('sorts by address', () => {
    const layout = parseImageLayout(MAP, names);
    expect(layout.map((e) => e.address)).toEqual([0x90000000, 0x90004000]);
  });

  it('ignores object files that are not generated images', () => {
    // The HAL contributes .rodata from stm32h7xx_hal_ltdc.c.obj.
    expect(parseImageLayout(MAP, names).some((e) => e.cArrayName.includes('ltdc')))
      .toBe(false);
  });

  it('ignores images the project does not know about', () => {
    expect(parseImageLayout(MAP, ['ui_img_probe']).map((e) => e.cArrayName))
      .toEqual(['ui_img_probe']);
  });

  it('skips zero-sized contributions', () => {
    // .text and .bss for the image object are both 0x0.
    const layout = parseImageLayout(MAP, names);
    expect(layout.every((e) => e.size > 0)).toBe(true);
  });

  it('returns nothing when the map has no images', () => {
    expect(parseImageLayout('Linker script and memory map\n', names)).toEqual([]);
  });
});
