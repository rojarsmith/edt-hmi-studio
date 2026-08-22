#ifndef MODBUS_RTU_ASYNC_CLIENT_H
#define MODBUS_RTU_ASYNC_CLIENT_H

#include <stdbool.h>
#include <stdint.h>

#include "modbus_rtu_client.h"
#include "stm32u5xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

#define MODBUS_RTU_ASYNC_MAX_BITS            32U

/*
 * Registers one read may carry. 64 is 128 bytes of UTF-8 -- the widest span
 * a QrCode's string binding asks for -- and well inside the protocol's 125.
 * Writes stay at two: the widest value any widget writes is a 32-bit number,
 * so the request buffer need not grow with the response buffer.
 */
#define MODBUS_RTU_ASYNC_MAX_REGISTERS       64U
#define MODBUS_RTU_ASYNC_MAX_WRITE_REGISTERS 2U

/* Unit, function, byte count, the registers, CRC. */
#define MODBUS_RTU_ASYNC_RX_FRAME_SIZE \
    (5U + (2U * MODBUS_RTU_ASYNC_MAX_REGISTERS))

typedef enum {
    MODBUS_RTU_ASYNC_IDLE = 0,
    MODBUS_RTU_ASYNC_WAIT_GAP,
    MODBUS_RTU_ASYNC_TRANSMITTING,
    MODBUS_RTU_ASYNC_RECEIVING,
    MODBUS_RTU_ASYNC_FINISHED,
} modbus_rtu_async_phase_t;

typedef enum {
    MODBUS_RTU_ASYNC_NONE = 0,
    MODBUS_RTU_ASYNC_READ_BITS,
    MODBUS_RTU_ASYNC_READ_REGISTERS,
    MODBUS_RTU_ASYNC_WRITE,
} modbus_rtu_async_operation_t;

typedef struct {
    /*
     * Not a UART on this board: the transport is the Type-C USB virtual COM
     * port, see hmi_usb_cdc.h. The configured baud rate is kept because the RTU
     * inter-frame silence is still derived from it — USB has no baud rate of
     * its own, so this is what preserves the Protocol tab's framing settings.
     */
    uint32_t baud_rate;
    uint32_t timeout_ms;
    uint32_t last_frame_end_ms;
    uint32_t not_before_ms;
    volatile uint32_t deadline_ms;
    volatile modbus_rtu_async_phase_t phase;
    modbus_rtu_async_operation_t operation;
    uint8_t unit_id;
    uint8_t function_code;
    uint8_t expected_byte_count;
    uint8_t tx_frame[13];
    uint16_t tx_length;
    uint8_t rx_frame[MODBUS_RTU_ASYNC_RX_FRAME_SIZE];
    volatile uint16_t rx_length;
    volatile uint16_t expected_rx_length;
    /* Wire time of the longest response this request can draw. */
    uint32_t rx_budget_ms;
    uint8_t rx_byte;
    volatile modbus_client_result_t completed_result;
    uint16_t registers[MODBUS_RTU_ASYNC_MAX_REGISTERS];
    uint8_t bits[(MODBUS_RTU_ASYNC_MAX_BITS + 7U) / 8U];
    uint8_t last_exception;
} modbus_rtu_async_client_t;

void modbus_rtu_async_client_init(
    modbus_rtu_async_client_t *client,
    uint32_t baud_rate,
    uint32_t timeout_ms);

bool modbus_rtu_async_is_busy(const modbus_rtu_async_client_t *client);

/*
 * Advances one transaction without waiting.  MODBUS_CLIENT_BUSY means that
 * the request is still in flight; every other result completes the request.
 */
modbus_client_result_t modbus_rtu_async_poll(
    modbus_rtu_async_client_t *client);

/*
 * Cancels an in-flight poll immediately.  This is used to prioritize a
 * pending operator write over a slow or missing server response.
 */
void modbus_rtu_async_cancel(modbus_rtu_async_client_t *client);

bool modbus_rtu_async_start_read_bits(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity);

bool modbus_rtu_async_start_read_registers(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity);

bool modbus_rtu_async_start_write_single_coil(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    bool value);

bool modbus_rtu_async_start_write_single_register(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t value);

bool modbus_rtu_async_start_write_registers(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t quantity,
    const uint16_t *registers);

uint8_t modbus_rtu_async_get_bits(
    const modbus_rtu_async_client_t *client,
    uint16_t bit_index);

uint16_t modbus_rtu_async_get_register(
    const modbus_rtu_async_client_t *client,
    uint16_t register_index);

#ifdef __cplusplus
}
#endif

#endif /* MODBUS_RTU_ASYNC_CLIENT_H */
