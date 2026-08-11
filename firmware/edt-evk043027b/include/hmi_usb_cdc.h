#ifndef HMI_USB_CDC_H
#define HMI_USB_CDC_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * The Type-C virtual COM port: a USB CDC device that Windows binds to its inbox
 * usbser.sys driver and presents as "USB Serial Device (COMxx)".
 *
 * This is the transport the Modbus RTU client runs over on this board. It is
 * not a UART and does not pretend to be one — the interface below is the whole
 * of what the client needs, and the differences that matter are documented at
 * each function.
 */
bool hmi_usb_cdc_init(void);

/** Whether the host has configured the device, i.e. the COM port exists. */
bool hmi_usb_cdc_is_ready(void);

/**
 * Queues a frame for transmission. Returns false when a previous frame is
 * still in flight or the host is not listening.
 *
 * There is no partial write: a Modbus frame is at most 256 bytes and fits in a
 * single transfer, so either the whole frame is accepted or none of it is.
 */
bool hmi_usb_cdc_write(const uint8_t *data, uint16_t length);

/** Whether a queued frame has yet to reach the host. */
bool hmi_usb_cdc_tx_busy(void);

/**
 * Drains up to `capacity` received bytes. Returns how many were copied.
 *
 * Bytes arrive in USB interrupt context and are buffered; this is the only
 * place they are consumed, and it is safe to call from the main loop.
 */
uint16_t hmi_usb_cdc_read(uint8_t *out, uint16_t capacity);

/** Discards anything buffered, so a new transaction starts from silence. */
void hmi_usb_cdc_flush_rx(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_USB_CDC_H */
