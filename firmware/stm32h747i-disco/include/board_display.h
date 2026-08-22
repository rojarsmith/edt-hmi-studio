#ifndef HMI_BOARD_DISPLAY_H
#define HMI_BOARD_DISPLAY_H

#include <stdbool.h>
#include <stdint.h>

/*
 * The panel's geometry in its landscape scan order. Not necessarily the
 * resolution LVGL is given — see hmi_display_config below.
 *
 * The frame buffer is sized from these and does not change with the
 * orientation: the same 800 x 480 pixels are scanned either way, only in a
 * different order, and that order is inside the display module rather than in
 * memory.
 */
#define HMI_DISPLAY_WIDTH  800U
#define HMI_DISPLAY_HEIGHT 480U

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Which way up the UI was designed. Set by the generated
 * hmi_display_generated.c, which overrides the __weak default in
 * board_display.c; a firmware image built with no generated source at all
 * still links and runs, in landscape. See docs/display-orientation.md §9.
 */
typedef enum {
    HMI_DISPLAY_ORIENTATION_LANDSCAPE = 0,
    HMI_DISPLAY_ORIENTATION_PORTRAIT = 1,
} hmi_display_orientation_t;

typedef struct {
    hmi_display_orientation_t orientation;
} hmi_display_config_t;

extern const hmi_display_config_t hmi_display_config;

bool board_display_init(void);

/*
 * The overlay: the LTDC's second hardware layer, composited over LVGL's
 * screen by the display controller itself.
 *
 * LVGL owns layer 0 and never sees this. A picture shown here costs no CPU
 * per frame — no blit into LVGL's frame buffer, no copy to keep its second
 * buffer in step — which is what makes a video at the panel's own resolution
 * possible on this part. The price is that it is always on top: nothing LVGL
 * draws can appear over a region the overlay covers. See
 * docs/video-playback.md §4.
 */
typedef struct {
    /** RGB565, `width` pixels per row, written by DMA2D or anything else that
        bypasses the CPU cache. The LTDC reads it directly from SDRAM. */
    const uint16_t *pixels;
    uint32_t width;
    uint32_t height;
    /** Where the picture's top-left corner goes, in screen coordinates. A
        picture that runs off the screen is clipped, not refused. */
    int32_t x;
    int32_t y;
    /** Clip box, in screen coordinates, inclusive. The widget's own box: a
        picture larger than it shows the middle and not the edges. */
    int32_t clip_x1;
    int32_t clip_y1;
    int32_t clip_x2;
    int32_t clip_y2;
} board_overlay_t;

/**
 * Show a picture on the overlay, or move it. The change lands at the next
 * vertical blanking, the same moment LVGL's own frames do, so a frame is
 * never half-swapped.
 */
bool board_display_overlay_show(const board_overlay_t *overlay);

/** Take the overlay down. Idempotent. */
void board_display_overlay_hide(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_DISPLAY_H */
