#ifndef HMI_USBD_DESC_H
#define HMI_USBD_DESC_H

#include "usbd_def.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Descriptor callbacks for the Type-C virtual COM port; see usbd_desc.c. */
extern USBD_DescriptorsTypeDef HMI_CDC_Desc;

#ifdef __cplusplus
}
#endif

#endif /* HMI_USBD_DESC_H */
