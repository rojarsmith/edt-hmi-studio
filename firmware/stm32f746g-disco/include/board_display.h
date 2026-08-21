#ifndef HMI_BOARD_DISPLAY_H
#define HMI_BOARD_DISPLAY_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define HMI_DISPLAY_WIDTH  480U
#define HMI_DISPLAY_HEIGHT 272U

/*
 * Which way up the UI was designed. Set by the generated
 * hmi_display_generated.c, which overrides the __weak default in
 * board_display.c. Every board declares this because the generator emits that
 * file for every build; this one can only drive landscape, and
 * board_display_init refuses anything else rather than rendering it wrong.
 * See docs/display-orientation.md §8.2.
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
