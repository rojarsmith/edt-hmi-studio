#ifndef HMI_BOARD_DISPLAY_H
#define HMI_BOARD_DISPLAY_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define HMI_DISPLAY_WIDTH  480U
#define HMI_DISPLAY_HEIGHT 272U

bool board_display_init(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_DISPLAY_H */
