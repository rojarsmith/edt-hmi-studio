#ifndef HMI_BOARD_H
#define HMI_BOARD_H

#include <stdbool.h>

#include "stm32h7xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

extern UART_HandleTypeDef huart1;

bool board_init(void);

/**
 * Brings up the QSPI NOR and maps it at 0x90000000 so image resources linked
 * into .ext_flash_images can be read like ordinary memory. Called by
 * board_init; separate so it can be exercised on its own.
 */
bool board_external_flash_init(void);
bool board_uart1_apply(
    uint32_t baud_rate,
    uint32_t parity,
    uint32_t stop_bits);
void board_error_handler(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_H */
