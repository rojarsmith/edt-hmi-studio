/**
 * MT25TL01G QSPI NOR configuration for the STM32H747I-DISCO.
 *
 * The board fits two MT25QL512 dies driven as one 128 MB device in dual-flash
 * mode. Image resources are linked into it at 0x90000000 through the memory
 * mapped mode; see docs/images-external-flash.md.
 *
 * Values follow ST's template for this board. The dummy cycle counts are tied
 * to the read command the driver issues and to the QSPI clock, so they are not
 * free to tune independently.
 */
#ifndef MT25TL01G_CONF_H
#define MT25TL01G_CONF_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stm32h7xx_hal.h"

/* Memory mapped reads use the plain quad read command rather than the
   performance enhanced one, which needs the mode byte held across transfers. */
#define CONF_MT25TL01G_READ_ENHANCE           0

#define CONF_QSPI_ODS                         MT25TL01G_CR_ODS_15
/* Defined by ST's template but referenced by nothing in the BSP or the
   component driver, so it does not program the device. Kept for parity. */
#define CONF_QSPI_DUMMY_CLOCK                 8U

#define MT25TL01G_DUMMY_CYCLES_READ_QUAD      8U
/*
 * 10, not the 8 in ST's template.
 *
 * This is the value the controller uses for QUAD_INOUT_FAST_READ (0xEB), both
 * for MT25TL01G_ReadSTR and for the memory mapped configuration. Nothing writes
 * the device's volatile configuration register, so the die keeps its factory
 * default of 10 dummy clocks for that command. Telling the controller 8 makes
 * it start sampling two clocks early, and in dual-flash QPI eight data lines
 * carry one byte per clock — so every read comes back displaced by exactly two
 * bytes, which renders images as garbage while leaving the flash contents
 * perfectly correct. See docs/images-external-flash.md.
 */
#define MT25TL01G_DUMMY_CYCLES_READ           10U
#define MT25TL01G_DUMMY_CYCLES_READ_DTR       6U
#define MT25TL01G_DUMMY_CYCLES_READ_QUAD_DTR  8U

#ifdef __cplusplus
}
#endif

#endif /* MT25TL01G_CONF_H */
