import { describe, expect, it } from 'vitest';
import {
  BUILD_PHASES,
  FLASH_PHASES,
  describeBuildLine,
  describeFlashLine,
  parseProgress,
} from '../deployPhases';

/** Everything the Work pane is allowed to say about a line in progress. */
const ALLOWED = [
  ...Object.values(BUILD_PHASES),
  ...Object.values(FLASH_PHASES),
];

/**
 * Words that would tell a panel designer which toolchain is underneath. None of
 * them may reach the Work pane. See docs/work-progress.md §3.
 */
const FORBIDDEN = /lvgl|cmake|ninja|gcc|gnu|clang|\.obj|\.elf|\.hex|\.c\b|linker|linking|compiler|arm-none|st-link|swd|\.dir|object/i;

describe('build phases', () => {
  it('never lets a raw line through, whatever it is', () => {
    const lines = [
      '[132/585] Building C object lvgl/CMakeFiles/lvgl.dir/src/draw/sw/lv_draw_sw_blur.c.obj',
      '-- The ASM compiler identification is GNU',
      '-- Configuring done (2.1s)',
      'Generated project source: ui.c, ui_events.c, ui_logic.c',
      '[585/585] Linking C executable firmware.elf',
      'Firmware artifacts:',
      '  C:\\builds\\1\\firmware.hex (801073 bytes)',
      'text data bss dec hex filename',
      'some line nobody predicted, mentioning lvgl and .obj',
    ];

    for (const line of lines) {
      const { label } = describeBuildLine(line);
      if (label === undefined) continue;
      expect(ALLOWED).toContain(label);
      expect(label).not.toMatch(FORBIDDEN);
    }
  });

  it("calls the engine's own font and image files the engine", () => {
    // Real lines from a real build. Matching on the filename first reported
    // "Compiling images" here, while nothing of the author's was involved at
    // all - location has to decide before name.
    const engineLines = [
      '[30/585] Building C object lvgl/CMakeFiles/lvgl.dir/src/draw/dma2d/lv_draw_dma2d_img.c.obj',
      '[39/585] Building C object lvgl/CMakeFiles/lvgl.dir/src/draw/eve/lv_draw_eve_image.c.obj',
      '[235/585] Building C object lvgl/CMakeFiles/lvgl.dir/src/font/font_manager/lv_font_manager.c.obj',
      '[583/585] Linking CXX static library lvgl\\lib\\liblvgl.a',
    ];

    for (const line of engineLines) {
      expect(describeBuildLine(line).label).toBe(BUILD_PHASES.engine);
    }
  });

  it("separates the panel's own software from the author's", () => {
    expect(describeBuildLine(
      '[530/585] Building C object CMakeFiles/firmware.dir/src/board.c.obj',
    ).label).toBe(BUILD_PHASES.board);
    expect(describeBuildLine(
      '[544/585] Building C object CMakeFiles/firmware.dir/.hmi-cache/Drivers/STM32H7xx_HAL_Driver/Src/stm32h7xx_hal.c.obj',
    ).label).toBe(BUILD_PHASES.board);

    expect(describeBuildLine(
      '[539/585] Building C object CMakeFiles/firmware.dir/C_/my/build/.hmi-builds/e517/project-source/ui.c.obj',
    ).label).toBe(BUILD_PHASES.screens);
    expect(describeBuildLine(
      '[541/585] Building C object CMakeFiles/firmware.dir/C_/my/build/.hmi-builds/e517/project-source/ui_logic.c.obj',
    ).label).toBe(BUILD_PHASES.screens);
  });

  it('names the phase by what is being compiled', () => {
    expect(describeBuildLine(
      '[132/585] Building C object lvgl/CMakeFiles/lvgl.dir/src/draw/sw/lv_draw_sw_blur.c.obj',
    ).label).toBe(BUILD_PHASES.engine);

    expect(describeBuildLine(
      '[566/585] Building C object CMakeFiles/firmware.dir/x/project-source/ui_img_logo.c.obj',
    ).label).toBe(BUILD_PHASES.images);

    expect(describeBuildLine(
      '[570/585] Building C object CMakeFiles/firmware.dir/x/project-source/ui_font_montserrat_14.c.obj',
    ).label).toBe(BUILD_PHASES.fonts);

    expect(describeBuildLine(
      '[584/585] Linking C executable C:\\builds\\e517\\firmware.elf',
    ).label).toBe(BUILD_PHASES.assembling);
  });

  it('recognises the phases either side of compiling', () => {
    expect(describeBuildLine('Generated project source: ui.c').label)
      .toBe(BUILD_PHASES.preparing);
    expect(describeBuildLine('-- Configuring done (2.1s)').label)
      .toBe(BUILD_PHASES.configuring);
    expect(describeBuildLine('Firmware artifacts:').label)
      .toBe(BUILD_PHASES.packaging);
  });

  it('says nothing rather than something wrong about a line it does not know', () => {
    // The phase then holds at whatever it was, which is why an unrecognised
    // line can never surface in the pane.
    expect(describeBuildLine('text data bss dec hex filename').label).toBeUndefined();
    expect(describeBuildLine('  284560   828 4211768').label).toBeUndefined();
  });

  it('still reads the count out of a line whose phase it reports', () => {
    expect(describeBuildLine('[263/585] Building C object x.c.obj').progress)
      .toEqual({ done: 263, total: 585 });
  });
});

describe('flash phases', () => {
  it('never lets a raw line through', () => {
    const lines = [
      'ST-LINK SN : 0670FF...',
      'Device ID : 0x450',
      'Memory Programming ...',
      'Erasing memory corresponding to segment 0:',
      'Download in Progress: 30%',
      'File download complete',
      'Verifying ...',
      'MCU Reset',
      'External loader MT25TL01G_STM32H747I-DISCO.stldr',
    ];

    for (const line of lines) {
      const { label } = describeFlashLine(line);
      if (label === undefined) continue;
      expect(ALLOWED).toContain(label);
      expect(label).not.toMatch(FORBIDDEN);
    }
  });

  it('names the steps of installing', () => {
    expect(describeFlashLine('ST-LINK SN : 0670FF...').label).toBe(FLASH_PHASES.connecting);
    expect(describeFlashLine('Erasing memory ...').label).toBe(FLASH_PHASES.erasing);
    expect(describeFlashLine('Download in Progress: 30%').label).toBe(FLASH_PHASES.writing);
    expect(describeFlashLine('Verifying ...').label).toBe(FLASH_PHASES.verifying);
    expect(describeFlashLine('MCU Reset').label).toBe(FLASH_PHASES.restarting);
  });
});

describe('parseProgress', () => {
  it('reads a counter', () => {
    expect(parseProgress('[1/585] Building')).toEqual({ done: 1, total: 585 });
    expect(parseProgress('  [585/585] Linking')).toEqual({ done: 585, total: 585 });
  });

  it('ignores anything that is not one', () => {
    expect(parseProgress('Firmware build complete')).toBeNull();
    expect(parseProgress('[stderr]')).toBeNull();
    expect(parseProgress('[0/0] nothing to do')).toBeNull();
  });

  it('will not report more done than there is', () => {
    expect(parseProgress('[600/585] Building')).toEqual({ done: 585, total: 585 });
  });
});
