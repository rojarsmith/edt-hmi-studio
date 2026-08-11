/*
 * USB descriptors for the Type-C virtual COM port.
 *
 * Identity is deliberately ST's own CDC pair, VID 0x0483 / PID 0x5740, exactly
 * as the vendor demo firmware reports. That is what makes Windows bind its
 * inbox usbser.sys driver with no .inf and no signing, so the board comes up as
 * "USB Serial Device (COMxx)" the moment it is plugged in. A private VID/PID
 * would be more correct for a product and would cost a driver package, which is
 * a decision for whoever ships this rather than for the HMI runtime.
 */

#include "usbd_desc.h"

#include "usbd_conf.h"
#include "usbd_core.h"
#include "usbd_def.h"

#define USBD_VID          0x0483
#define USBD_PID          0x5740
#define USBD_LANGID       0x0409 /* en-US */
#define USBD_MANUFACTURER "STMicroelectronics"
#define USBD_PRODUCT      "STM32 Virtual ComPort"
#define USBD_CONFIGURATION "CDC Config"
#define USBD_INTERFACE    "CDC Interface"

/* 12 hex digits of the 96-bit unique ID, as UTF-16, plus the 2 byte header. */
#define USBD_SERIAL_LENGTH 26

static void Get_SerialNum(void);
static void IntToUnicode(uint32_t value, uint8_t *pbuf, uint8_t len);

static uint8_t *device_descriptor(USBD_SpeedTypeDef speed, uint16_t *length);
static uint8_t *lang_id_descriptor(USBD_SpeedTypeDef speed, uint16_t *length);
static uint8_t *manufacturer_descriptor(USBD_SpeedTypeDef speed, uint16_t *length);
static uint8_t *product_descriptor(USBD_SpeedTypeDef speed, uint16_t *length);
static uint8_t *serial_descriptor(USBD_SpeedTypeDef speed, uint16_t *length);
static uint8_t *configuration_descriptor(USBD_SpeedTypeDef speed, uint16_t *length);
static uint8_t *interface_descriptor(USBD_SpeedTypeDef speed, uint16_t *length);

USBD_DescriptorsTypeDef HMI_CDC_Desc = {
    device_descriptor,
    lang_id_descriptor,
    manufacturer_descriptor,
    product_descriptor,
    serial_descriptor,
    configuration_descriptor,
    interface_descriptor,
};

__ALIGN_BEGIN static uint8_t device_desc[USB_LEN_DEV_DESC] __ALIGN_END = {
    USB_LEN_DEV_DESC,           /* bLength */
    USB_DESC_TYPE_DEVICE,       /* bDescriptorType */
    0x00, 0x02,                 /* bcdUSB 2.00 */
    0x02,                       /* bDeviceClass: CDC */
    0x02,                       /* bDeviceSubClass */
    0x00,                       /* bDeviceProtocol */
    USB_MAX_EP0_SIZE,           /* bMaxPacketSize0 */
    LOBYTE(USBD_VID), HIBYTE(USBD_VID),
    LOBYTE(USBD_PID), HIBYTE(USBD_PID),
    0x00, 0x02,                 /* bcdDevice 2.00 */
    USBD_IDX_MFC_STR,           /* iManufacturer */
    USBD_IDX_PRODUCT_STR,       /* iProduct */
    USBD_IDX_SERIAL_STR,        /* iSerialNumber */
    USBD_MAX_NUM_CONFIGURATION, /* bNumConfigurations */
};

__ALIGN_BEGIN static uint8_t lang_id_desc[USB_LEN_LANGID_STR_DESC] __ALIGN_END = {
    USB_LEN_LANGID_STR_DESC,
    USB_DESC_TYPE_STRING,
    LOBYTE(USBD_LANGID),
    HIBYTE(USBD_LANGID),
};

__ALIGN_BEGIN static uint8_t string_desc[USBD_MAX_STR_DESC_SIZ] __ALIGN_END;
__ALIGN_BEGIN static uint8_t serial_desc[USBD_SERIAL_LENGTH] __ALIGN_END = {
    USBD_SERIAL_LENGTH,
    USB_DESC_TYPE_STRING,
};

static uint8_t *device_descriptor(USBD_SpeedTypeDef speed, uint16_t *length)
{
    UNUSED(speed);
    *length = sizeof(device_desc);
    return device_desc;
}

static uint8_t *lang_id_descriptor(USBD_SpeedTypeDef speed, uint16_t *length)
{
    UNUSED(speed);
    *length = sizeof(lang_id_desc);
    return lang_id_desc;
}

static uint8_t *manufacturer_descriptor(USBD_SpeedTypeDef speed, uint16_t *length)
{
    UNUSED(speed);
    USBD_GetString((uint8_t *)USBD_MANUFACTURER, string_desc, length);
    return string_desc;
}

static uint8_t *product_descriptor(USBD_SpeedTypeDef speed, uint16_t *length)
{
    UNUSED(speed);
    USBD_GetString((uint8_t *)USBD_PRODUCT, string_desc, length);
    return string_desc;
}

/*
 * Derived from the MCU's 96-bit unique ID, so two boards plugged into the same
 * PC enumerate as two different devices and keep their own COM numbers. A fixed
 * serial makes Windows reassign the port whenever the other board is attached.
 */
static uint8_t *serial_descriptor(USBD_SpeedTypeDef speed, uint16_t *length)
{
    UNUSED(speed);
    *length = USBD_SERIAL_LENGTH;
    Get_SerialNum();
    return serial_desc;
}

static uint8_t *configuration_descriptor(USBD_SpeedTypeDef speed, uint16_t *length)
{
    UNUSED(speed);
    USBD_GetString((uint8_t *)USBD_CONFIGURATION, string_desc, length);
    return string_desc;
}

static uint8_t *interface_descriptor(USBD_SpeedTypeDef speed, uint16_t *length)
{
    UNUSED(speed);
    USBD_GetString((uint8_t *)USBD_INTERFACE, string_desc, length);
    return string_desc;
}

static void Get_SerialNum(void)
{
    uint32_t device_serial0 = *(uint32_t *)UID_BASE;
    uint32_t device_serial1 = *(uint32_t *)(UID_BASE + 4U);
    const uint32_t device_serial2 = *(uint32_t *)(UID_BASE + 8U);

    device_serial0 += device_serial2;

    if (device_serial0 != 0U) {
        IntToUnicode(device_serial0, &serial_desc[2], 8U);
        IntToUnicode(device_serial1, &serial_desc[18], 4U);
    }
}

static void IntToUnicode(uint32_t value, uint8_t *pbuf, uint8_t len)
{
    for (uint8_t index = 0U; index < len; index++) {
        const uint8_t nibble = (uint8_t)((value >> 28) & 0x0FU);

        pbuf[2U * index] = (nibble < 0x0AU)
            ? (uint8_t)(nibble + '0')
            : (uint8_t)(nibble + ('A' - 10));
        pbuf[(2U * index) + 1U] = 0U;
        value <<= 4;
    }
}
