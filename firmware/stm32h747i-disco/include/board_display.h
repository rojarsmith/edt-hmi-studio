#ifndef HMI_BOARD_DISPLAY_H
#define HMI_BOARD_DISPLAY_H

#include <stdbool.h>

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

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_DISPLAY_H */
