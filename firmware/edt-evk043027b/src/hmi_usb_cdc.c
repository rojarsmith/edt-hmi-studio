#include "hmi_usb_cdc.h"

#include "usbd_cdc.h"
#include "usbd_conf.h"
#include "usbd_core.h"
#include "usbd_desc.h"

#include <string.h>

/*
 * Modbus RTU over a USB virtual COM port.
 *
 * Two things differ from a UART and both shape this file.
 *
 * There is no baud rate. The host sets one with SET_LINE_CODING and it is
 * meaningless on the wire; bytes cross as USB transfers at USB's own pace. The
 * setting is still honoured in the sense that the Modbus client keeps using it
 * to compute the RTU inter-frame silence, which is what keeps the Protocol
 * tab's baud rate a real setting rather than a dead control.
 *
 * There is no per-byte interrupt. A UART hands the client one byte at a time;
 * USB hands over whole packets, and a Modbus response may arrive as one packet
 * or be split across several. So bytes are buffered here and the client drains
 * them from its poll function, which leaves its framing logic — count the bytes
 * it expects, then check the CRC — working exactly as it does on a UART.
 */

/* One high-speed bulk packet, which is the largest single delivery the host can
   make, times four so a burst cannot overrun while the main loop is busy
   redrawing. Modbus frames are at most 256 bytes. */
#define HMI_CDC_RX_RING_SIZE 2048U

/* Endpoint packet buffers. Must be at least the endpoint's max packet size,
   which is 512 bytes at high speed. */
#define HMI_CDC_EP_BUFFER_SIZE 512U

static USBD_HandleTypeDef usbd_device;

static uint8_t cdc_rx_packet[HMI_CDC_EP_BUFFER_SIZE];
static uint8_t cdc_tx_packet[HMI_CDC_EP_BUFFER_SIZE];

static uint8_t rx_ring[HMI_CDC_RX_RING_SIZE];
static volatile uint16_t rx_head;
static volatile uint16_t rx_tail;
static volatile bool rx_overrun;

static bool usb_started;

/*
 * The host's line coding. Stored and echoed back because Windows expects
 * GET_LINE_CODING to return what it set, and a device that answers with
 * something else makes some terminal software refuse to open the port. Nothing
 * here acts on the values.
 */
static uint8_t line_coding[7] = {
    0x00, 0xC2, 0x01, 0x00, /* 115200 */
    0x00,                   /* 1 stop bit */
    0x00,                   /* no parity */
    0x08,                   /* 8 data bits */
};

static int8_t cdc_init(void);
static int8_t cdc_deinit(void);
static int8_t cdc_control(uint8_t cmd, uint8_t *pbuf, uint16_t length);
static int8_t cdc_receive(uint8_t *buf, uint32_t *len);
static int8_t cdc_transmit_complete(uint8_t *buf, uint32_t *len, uint8_t epnum);

static USBD_CDC_ItfTypeDef cdc_interface = {
    cdc_init,
    cdc_deinit,
    cdc_control,
    cdc_receive,
    cdc_transmit_complete,
};

static int8_t cdc_init(void)
{
    USBD_CDC_SetTxBuffer(&usbd_device, cdc_tx_packet, 0U);
    USBD_CDC_SetRxBuffer(&usbd_device, cdc_rx_packet);
    return USBD_OK;
}

static int8_t cdc_deinit(void)
{
    return USBD_OK;
}

static int8_t cdc_control(uint8_t cmd, uint8_t *pbuf, uint16_t length)
{
    switch (cmd) {
        case CDC_SET_LINE_CODING:
            if (length >= sizeof(line_coding)) {
                memcpy(line_coding, pbuf, sizeof(line_coding));
            }
            break;

        case CDC_GET_LINE_CODING:
            if (length >= sizeof(line_coding)) {
                memcpy(pbuf, line_coding, sizeof(line_coding));
            }
            break;

        /*
         * Everything else is answered successfully and ignored. A CDC device
         * must not stall these — a stalled SET_CONTROL_LINE_STATE in
         * particular makes Windows fail the port open, which presents as a COM
         * port that exists but cannot be used.
         */
        default:
            break;
    }
    return USBD_OK;
}

static int8_t cdc_receive(uint8_t *buf, uint32_t *len)
{
    const uint16_t count = (uint16_t)*len;

    for (uint16_t index = 0U; index < count; index++) {
        const uint16_t next = (uint16_t)((rx_head + 1U) % HMI_CDC_RX_RING_SIZE);

        if (next == rx_tail) {
            /* Dropping the tail of a frame would corrupt it silently; the CRC
               check downstream turns this into a clean retry instead. */
            rx_overrun = true;
            break;
        }
        rx_ring[rx_head] = buf[index];
        rx_head = next;
    }

    /* Re-arm only after the packet has been copied out. Doing it first, as
       CubeMX's template does, lets the next packet land in the same buffer
       while it is still being read. */
    USBD_CDC_SetRxBuffer(&usbd_device, cdc_rx_packet);
    (void)USBD_CDC_ReceivePacket(&usbd_device);
    return USBD_OK;
}

static int8_t cdc_transmit_complete(uint8_t *buf, uint32_t *len, uint8_t epnum)
{
    UNUSED(buf);
    UNUSED(len);
    UNUSED(epnum);
    return USBD_OK;
}

bool hmi_usb_cdc_init(void)
{
    if (USBD_Init(&usbd_device, &HMI_CDC_Desc, DEVICE_HS) != USBD_OK) {
        return false;
    }
    if (USBD_RegisterClass(&usbd_device, &USBD_CDC) != USBD_OK) {
        return false;
    }
    if (USBD_CDC_RegisterInterface(&usbd_device, &cdc_interface) != USBD_OK) {
        return false;
    }
    if (USBD_Start(&usbd_device) != USBD_OK) {
        return false;
    }

    usb_started = true;
    return true;
}

bool hmi_usb_cdc_is_ready(void)
{
    return usb_started && (usbd_device.dev_state == USBD_STATE_CONFIGURED);
}

bool hmi_usb_cdc_tx_busy(void)
{
    const USBD_CDC_HandleTypeDef *hcdc =
        (const USBD_CDC_HandleTypeDef *)usbd_device.pClassDataCmsit[0];

    return (hcdc != NULL) && (hcdc->TxState != 0U);
}

bool hmi_usb_cdc_write(const uint8_t *data, uint16_t length)
{
    if ((data == NULL) || (length == 0U) ||
        (length > sizeof(cdc_tx_packet)) ||
        !hmi_usb_cdc_is_ready() || hmi_usb_cdc_tx_busy()) {
        return false;
    }

    memcpy(cdc_tx_packet, data, length);
    USBD_CDC_SetTxBuffer(&usbd_device, cdc_tx_packet, length);
    return USBD_CDC_TransmitPacket(&usbd_device) == USBD_OK;
}

uint16_t hmi_usb_cdc_read(uint8_t *out, uint16_t capacity)
{
    uint16_t copied = 0U;

    if (out == NULL) {
        return 0U;
    }

    while ((copied < capacity) && (rx_tail != rx_head)) {
        out[copied++] = rx_ring[rx_tail];
        rx_tail = (uint16_t)((rx_tail + 1U) % HMI_CDC_RX_RING_SIZE);
    }
    return copied;
}

void hmi_usb_cdc_flush_rx(void)
{
    rx_tail = rx_head;
    rx_overrun = false;
}
