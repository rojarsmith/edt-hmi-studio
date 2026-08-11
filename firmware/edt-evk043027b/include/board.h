#ifndef HMI_BOARD_H
#define HMI_BOARD_H

#include <stdbool.h>

#include "stm32u5xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * The Modbus RTU link. USART2 on this board is wired to an RS-485 transceiver,
 * with the driver-enable line on PD4 driven by the USART itself — see
 * board_uart_apply.
 */
extern UART_HandleTypeDef huart1;

/** I2C2, shared with the vendored maXTouch driver through EDT_TS_Set_Handle. */
extern I2C_HandleTypeDef hi2c2;

/** TIM3 channel 3, the panel's backlight PWM on PE5. */
extern TIM_HandleTypeDef htim3;

/** OCTOSPI1, driving the MX25LM51245G that holds image resources. */
extern OSPI_HandleTypeDef hospi1;

/**
 * How far start-up got. A board that stops before the panel lights has no way
 * to say why, so board_init records each step here as it passes it: halt the
 * core and read it with `p board_init_stage` to get the answer in one step
 * rather than by bisecting the start-up path.
 */
typedef enum {
    BOARD_STAGE_RESET = 0,      /*  1 flash */
    BOARD_STAGE_HAL,            /*  2 */
    BOARD_STAGE_POWER,          /*  3 */
    BOARD_STAGE_CLOCK,          /*  4 */
    BOARD_STAGE_CACHE,          /*  5 */
    BOARD_STAGE_EXTERNAL_FLASH, /*  6 */
    BOARD_STAGE_TOUCH_BUS,      /*  7 */
    BOARD_STAGE_UART,           /*  8 */
    BOARD_STAGE_PANEL_POWER,    /*  9 */
    BOARD_STAGE_LTDC_CLOCK,     /* 10 — PLL3 and the LTDC bus clock enable */
    BOARD_STAGE_LTDC_CONFIG,    /* 11 — LTDC registers read back as written */
    BOARD_STAGE_LTDC,           /* 12 — raster confirmed scanning */
    BOARD_STAGE_BACKLIGHT,      /* 13 */
    BOARD_STAGE_TOUCH,          /* 14 */
    BOARD_STAGE_DISPLAY,        /* 15 — LVGL bound to the display */
    BOARD_STAGE_RUNNING,        /* 16 */
} board_stage_t;

extern volatile board_stage_t board_init_stage;

/**
 * Whether the OctoSPI NOR came up and is memory mapped. False means image
 * resources cannot be read: a project that uses none runs normally, and one
 * that uses images faults on the first pixel fetch. See board_init.
 */
extern volatile bool board_external_flash_ready;

/**
 * Whether the maXTouch answered on I2C2 at start-up. False leaves LVGL with no
 * input device at all — see touch_is_present in board_display.c for why that is
 * better than registering one that blocks.
 */
extern volatile bool board_touch_ready;

/**
 * Whether the USB device stack started, i.e. whether the Type-C port can
 * enumerate as a virtual COM port. False means Modbus has no transport and
 * every transaction will time out; the HMI itself still runs.
 */
extern volatile bool board_usb_ready;

bool board_init(void);

/**
 * Brings up the OctoSPI NOR and maps it at 0x90000000 so image resources linked
 * into .ext_flash_images can be read like ordinary memory. Called by
 * board_init; separate so it can be exercised on its own.
 */
bool board_external_flash_init(void);

/**
 * Reconfigures the Modbus USART. Named for the UART the other board templates
 * expose so the shared HMI runtime needs no per-board branch, even though the
 * instance here is USART2 rather than USART1.
 */
bool board_uart1_apply(
    uint32_t baud_rate,
    uint32_t parity,
    uint32_t stop_bits);

/**
 * The board's LED on PB14, open drain.
 *
 * This is the only output the firmware has that does not depend on the panel,
 * its backlight or its supply rail, which makes it the one way to tell "the
 * firmware is not running" from "the firmware is running and the display is
 * misconfigured" without a debugger. board_init brings it up early, before
 * anything that can fail.
 */
void board_status_led_init(void);
void board_status_led(bool on);

/**
 * Blinks board_init_stage + 1 times, pauses, and repeats, forever. Count the
 * flashes against board_stage_t to see how far start-up got — one flash is
 * BOARD_STAGE_RESET, two is BOARD_STAGE_HAL, and so on.
 */
void board_error_handler(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_BOARD_H */
