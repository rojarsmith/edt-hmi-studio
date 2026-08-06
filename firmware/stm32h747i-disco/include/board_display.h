#ifndef HMI_BOARD_DISPLAY_H
#define HMI_BOARD_DISPLAY_H

#include <stdbool.h>

#define HMI_DISPLAY_WIDTH  800U
#define HMI_DISPLAY_HEIGHT 480U

#ifdef __cplusplus
extern "C" {
#endif

bool board_display_init(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_DISPLAY_H */
