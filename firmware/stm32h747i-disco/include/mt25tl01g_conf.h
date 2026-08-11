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
#define CONF_QSPI_DUMMY_CLOCK                 8U

#define MT25TL01G_DUMMY_CYCLES_READ_QUAD      8U
#define MT25TL01G_DUMMY_CYCLES_READ           8U
#define MT25TL01G_DUMMY_CYCLES_READ_DTR       6U
#define MT25TL01G_DUMMY_CYCLES_READ_QUAD_DTR  8U

#ifdef __cplusplus
}
#endif

#endif /* MT25TL01G_CONF_H */
