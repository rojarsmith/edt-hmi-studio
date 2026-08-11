#ifndef HMI_BOARD_DISPLAY_H
#define HMI_BOARD_DISPLAY_H

#include <stdbool.h>
#include <stdint.h>

#define HMI_DISPLAY_WIDTH  480U
#define HMI_DISPLAY_HEIGHT 272U

/*
 * ARGB8888. The LTDC can scan a packed 24 bpp layer on this board, and the
 * vendor's TouchGFX demo does exactly that (480*272*3), but this runtime is
 * LVGL and runs 32-bit colour: LV_COLOR_DEPTH 32 in lv_conf.h, an ARGB8888
 * LTDC layer, and LV_COLOR_FORMAT_ARGB8888 on the display. All four have to
 * agree — see docs/color-depth.md.
 */
#define HMI_DISPLAY_BYTES_PER_PIXEL 4U

#ifdef __cplusplus
extern "C" {
#endif

bool board_display_init(void);

/**
 * Backlight duty, 0-100. board_display_init leaves it at full; exposed so a
 * project can dim the panel without reaching into the timer.
 */
void board_display_set_backlight(uint8_t percent);

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_DISPLAY_H */
