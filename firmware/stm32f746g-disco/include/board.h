#ifndef HMI_BOARD_H
#define HMI_BOARD_H

#include <stdbool.h>

#include "stm32f7xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

extern UART_HandleTypeDef huart1;

bool board_init(void);
bool board_uart1_apply(
    uint32_t baud_rate,
    uint32_t parity,
    uint32_t stop_bits);
void board_error_handler(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_H */
