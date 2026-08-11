/*
 * Configuration for ST's USB Device Library on this board.
 *
 * The library is fetched by scripts/bootstrap-deps.ps1; everything that knows
 * about *this* board — the descriptors, the low-level glue and the CDC data
 * path — lives in src/ alongside it.
 */

#ifndef HMI_USBD_CONF_H
#define HMI_USBD_CONF_H

#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "stm32u5xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Device instance ids. Not part of the library — CubeMX emits these and the
 * glue in usbd_conf.c switches on them. This board has one USB peripheral,
 * USB_OTG_HS, so only DEVICE_HS is ever used.
 */
#define DEVICE_FS 0
#define DEVICE_HS 1

/* One CDC interface: two data endpoints plus one interrupt endpoint for the
   notifications the class must expose but this application never sends. */
#define USBD_MAX_NUM_INTERFACES     2U
#define USBD_MAX_NUM_CONFIGURATION  1U
#define USBD_MAX_STR_DESC_SIZ       512U
#define USBD_DEBUG_LEVEL            0U
#define USBD_LPM_ENABLED            0U
#define USBD_SELF_POWERED           0U

/*
 * Static allocation, not malloc. The runtime links --specs=nano.specs with no
 * heap to speak of, and a class handle that fails to allocate at enumeration
 * time would fail somewhere unhelpful; this way the storage is accounted for at
 * link time like everything else on this board.
 */
void *USBD_static_malloc(uint32_t size);
void USBD_static_free(void *p);

#define USBD_malloc  USBD_static_malloc
#define USBD_free    USBD_static_free
#define USBD_memset  memset
#define USBD_memcpy  memcpy
#define USBD_Delay   HAL_Delay

/* The library logs through these. Nothing on this board has a console, so they
   are compiled out rather than pulling printf into the image. */
#define USBD_UsrLog(...)
#define USBD_ErrLog(...)
#define USBD_DbgLog(...)

#ifdef __cplusplus
}
#endif

#endif /* HMI_USBD_CONF_H */
