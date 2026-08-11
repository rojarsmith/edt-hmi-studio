/*
 * Compatibility header for the vendored EDT board drivers.
 *
 * `vendor/edt/` is copied from the EVK043027B package unmodified so a later
 * vendor drop can replace it wholesale, and every file in it includes "main.h"
 * — the header CubeMX generates for the vendor's own demo project. That project
 * is a FreeRTOS + TouchGFX application, none of which exists here, so this file
 * supplies the small part the drivers actually reach for: the HAL, the pin
 * names, and the display geometry.
 *
 * If you are looking for the HMI runtime's own entry point, it is src/main.c;
 * nothing here corresponds to it.
 */

#ifndef HMI_MAIN_H
#define HMI_MAIN_H

#include <stdbool.h>
#include <stdint.h>

#include "stm32u5xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Panel geometry. The vendor package selects these through `BoardPN`, which
 * picks one of four displays in the EVKxxxx27B family; this template is the
 * 4.3" EVK043027B, so the choice is made once, here.
 */
#define TFT_WIDTH  ((uint16_t)480)
#define TFT_HEIGHT ((uint16_t)272)

/* Selects the maXTouch variant in vendor/edt/edt_bsp_ctp.h. The 4.3" and 5.0"
   panels carry the MXT336U; the 5.7" and 7.0" ones carry the MXT640U. */
#define MXT336U

/* Board pins, named as the vendor's schematic and drivers name them. */
#define CTP_RST_Pin        GPIO_PIN_6
#define CTP_RST_GPIO_Port  GPIOH
#define LCD_RESET_Pin      GPIO_PIN_15
#define LCD_RESET_GPIO_Port GPIOH
#define LCD_CTRL_Pin       GPIO_PIN_13
#define LCD_CTRL_GPIO_Port GPIOH
#define LCD_BL_PWM_Pin     GPIO_PIN_5
#define LCD_BL_PWM_GPIO_Port GPIOE
#define CAN_STB_Pin        GPIO_PIN_5
#define CAN_STB_GPIO_Port  GPIOB
#define FS_PW_SW_Pin       GPIO_PIN_15
#define FS_PW_SW_GPIO_Port GPIOI
#define FS_OV_Current_Pin  GPIO_PIN_14
#define FS_OV_Current_GPIO_Port GPIOI

/*
 * vendor/edt/edt_bsp_ctp.c calls these four while reading a touch. In the
 * vendor package they belong to edt_bsp_lcd.c, which drives a FreeRTOS task
 * that blanks the panel after an idle timeout. That file is not vendored — the
 * HMI runtime is a single loop with no scheduler — so board_display.c provides
 * the geometry accessors and stubs the sleep flags.
 */
uint32_t EDT_LCD_GetXSize(void);
uint32_t EDT_LCD_GetYSize(void);
bool     EDT_Sleep_GetDetected(void);
void     EDT_Sleep_SetDetected(bool detected);

#ifdef __cplusplus
}
#endif

#endif /* HMI_MAIN_H */
