#include "modbus_rtu_async_client.h"

#include "hmi_usb_cdc.h"

#include <string.h>

/*
 * Defined at the foot of this file, next to each other, because they are the
 * whole of what differs from the UART boards' copies of this client.
 */
static void consume_rx_byte(modbus_rtu_async_client_t *client, uint8_t byte);
static void begin_receiving(modbus_rtu_async_client_t *client);
static void drain_received_bytes(modbus_rtu_async_client_t *client);

static modbus_rtu_async_client_t *g_irq_client;

static bool time_reached(uint32_t now, uint32_t target)
{
    return (int32_t)(now - target) >= 0;
}

static uint32_t interframe_delay_ms(
    const modbus_rtu_async_client_t *client)
{
    const uint32_t baud_rate = client->baud_rate;

    if (baud_rate > 19200U) {
        return 2U;
    }
    if (baud_rate == 0U) {
        return 4U;
    }

    /* 3.5 characters, conservatively treating a character as 11 bits. */
    return (38500U + baud_rate - 1U) / baud_rate;
}

static uint32_t frame_budget_ms(
    const modbus_rtu_async_client_t *client,
    uint16_t frame_length)
{
    const uint32_t baud_rate = client->baud_rate;
    uint32_t duration_ms;

    if (baud_rate == 0U) {
        return 100U;
    }

    /* Twelve bits covers start/data/parity/two-stop-bit configurations. */
    duration_ms =
        ((uint32_t)frame_length * 12000U + baud_rate - 1U) /
        baud_rate;
    return duration_ms + 2U;
}

static uint32_t transmit_budget_ms(
    const modbus_rtu_async_client_t *client)
{
    return frame_budget_ms(client, client->tx_length);
}

static void append_crc(uint8_t *frame, uint16_t payload_length)
{
    const uint16_t crc = modbus_rtu_crc16(frame, payload_length);
    frame[payload_length] = (uint8_t)crc;
    frame[payload_length + 1U] = (uint8_t)(crc >> 8U);
}

static bool frame_crc_is_valid(const uint8_t *frame, uint16_t frame_length)
{
    uint16_t received_crc;

    if ((frame == NULL) || (frame_length < 4U)) {
        return false;
    }

    received_crc = frame[frame_length - 2U];
    received_crc |=
        (uint16_t)((uint16_t)frame[frame_length - 1U] << 8U);
    return modbus_rtu_crc16(frame, (uint16_t)(frame_length - 2U)) ==
           received_crc;
}

static void discard_stale_rx_data(void)
{
    hmi_usb_cdc_flush_rx();
}

static bool queue_request(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t request_length,
    modbus_rtu_async_operation_t operation,
    uint8_t expected_byte_count)
{
    uint32_t now;

    if ((client == NULL) ||
        (client->phase != MODBUS_RTU_ASYNC_IDLE) ||
        (unit_id == 0U) || (unit_id > 247U) ||
        (request_length > sizeof(client->tx_frame))) {
        return false;
    }

    append_crc(client->tx_frame, (uint16_t)(request_length - 2U));
    client->unit_id = unit_id;
    client->function_code = function_code;
    client->tx_length = request_length;
    client->operation = operation;
    client->expected_byte_count = expected_byte_count;
    client->rx_length = 0U;
    client->expected_rx_length = 0U;
    /*
     * The reply's own wire time. The response timeout counts from the end of
     * our request, and a full 64-register reply at 9600 baud takes longer
     * than half the default timeout just to arrive.
     */
    client->rx_budget_ms = frame_budget_ms(
        client,
        (operation == MODBUS_RTU_ASYNC_WRITE)
            ? 8U
            : (uint16_t)(5U + expected_byte_count));
    client->completed_result = MODBUS_CLIENT_BUSY;
    client->last_exception = 0U;

    now = HAL_GetTick();
    client->not_before_ms = client->last_frame_end_ms +
                            interframe_delay_ms(client);
    if ((client->last_frame_end_ms == 0U) ||
        time_reached(now, client->not_before_ms)) {
        client->not_before_ms = now;
    }
    client->phase = MODBUS_RTU_ASYNC_WAIT_GAP;
    return true;
}

static void finish_from_interrupt(
    modbus_rtu_async_client_t *client,
    modbus_client_result_t result)
{
    client->last_frame_end_ms = HAL_GetTick();
    client->completed_result = result;
    client->phase = MODBUS_RTU_ASYNC_FINISHED;
}

static modbus_client_result_t validate_response(
    modbus_rtu_async_client_t *client)
{
    const uint8_t *frame = client->rx_frame;
    const uint16_t frame_length = client->rx_length;
    uint16_t index;

    if (!frame_crc_is_valid(frame, frame_length)) {
        return MODBUS_CLIENT_CRC_ERROR;
    }
    if (frame[0] != client->unit_id) {
        return MODBUS_CLIENT_BAD_RESPONSE;
    }
    if (frame[1] == (uint8_t)(client->function_code | 0x80U)) {
        if (frame_length != 5U) {
            return MODBUS_CLIENT_BAD_RESPONSE;
        }
        client->last_exception = frame[2];
        return MODBUS_CLIENT_EXCEPTION;
    }
    if (frame[1] != client->function_code) {
        return MODBUS_CLIENT_BAD_RESPONSE;
    }

    if ((client->operation == MODBUS_RTU_ASYNC_READ_BITS) ||
        (client->operation == MODBUS_RTU_ASYNC_READ_REGISTERS)) {
        if ((frame_length !=
             (uint16_t)(5U + client->expected_byte_count)) ||
            (frame[2] != client->expected_byte_count)) {
            return MODBUS_CLIENT_BAD_RESPONSE;
        }

        if (client->operation == MODBUS_RTU_ASYNC_READ_BITS) {
            memcpy(
                client->bits,
                &frame[3],
                client->expected_byte_count);
        } else {
            for (index = 0U;
                 index < (uint16_t)(client->expected_byte_count / 2U);
                 ++index) {
                const uint16_t offset = (uint16_t)(3U + (index * 2U));
                client->registers[index] =
                    (uint16_t)(((uint16_t)frame[offset] << 8U) |
                               frame[offset + 1U]);
            }
        }
        return MODBUS_CLIENT_OK;
    }

    if ((frame_length != 8U) ||
        (memcmp(client->tx_frame, frame, 6U) != 0)) {
        return MODBUS_CLIENT_BAD_RESPONSE;
    }
    return MODBUS_CLIENT_OK;
}

void modbus_rtu_async_client_init(
    modbus_rtu_async_client_t *client,
    uint32_t baud_rate,
    uint32_t timeout_ms)
{
    if (client == NULL) {
        return;
    }

    memset(client, 0, sizeof(*client));
    client->baud_rate = baud_rate;
    client->timeout_ms = (timeout_ms == 0U) ? 1000U : timeout_ms;
    client->phase = MODBUS_RTU_ASYNC_IDLE;
    g_irq_client = client;
}

bool modbus_rtu_async_is_busy(const modbus_rtu_async_client_t *client)
{
    return (client != NULL) &&
           (client->phase != MODBUS_RTU_ASYNC_IDLE);
}

modbus_client_result_t modbus_rtu_async_poll(
    modbus_rtu_async_client_t *client)
{
    uint32_t now;
    modbus_client_result_t result;

    if (client == NULL) {
        return MODBUS_CLIENT_INVALID_ARGUMENT;
    }

    drain_received_bytes(client);

    now = HAL_GetTick();
    if ((client->phase == MODBUS_RTU_ASYNC_WAIT_GAP) &&
        time_reached(now, client->not_before_ms)) {
        discard_stale_rx_data();
        client->deadline_ms =
            now + transmit_budget_ms(client) + client->timeout_ms;
        client->phase = MODBUS_RTU_ASYNC_TRANSMITTING;
        if (hmi_usb_cdc_write(client->tx_frame, client->tx_length)) {
            /*
             * USB delivers or it does not; there is no partial send and no
             * line to wait on. Once the frame is queued the transaction is in
             * the receive phase, which is what HAL_UART_TxCpltCallback does on
             * the other boards.
             */
            begin_receiving(client);
        } else {
            finish_from_interrupt(client, MODBUS_CLIENT_IO_ERROR);
        }
    }

    if ((client->phase == MODBUS_RTU_ASYNC_TRANSMITTING) &&
        time_reached(now, client->deadline_ms)) {
        finish_from_interrupt(client, MODBUS_CLIENT_TIMEOUT);
    }

    if ((client->phase == MODBUS_RTU_ASYNC_RECEIVING) &&
        time_reached(now, client->deadline_ms)) {
        finish_from_interrupt(client, MODBUS_CLIENT_TIMEOUT);
    }

    if (client->phase != MODBUS_RTU_ASYNC_FINISHED) {
        return MODBUS_CLIENT_BUSY;
    }

    result = client->completed_result;
    if (result == MODBUS_CLIENT_OK) {
        result = validate_response(client);
    }
    client->completed_result = result;
    client->phase = MODBUS_RTU_ASYNC_IDLE;
    return result;
}

void modbus_rtu_async_cancel(modbus_rtu_async_client_t *client)
{
    if ((client == NULL) ||
        (client->phase == MODBUS_RTU_ASYNC_IDLE)) {
        return;
    }

    discard_stale_rx_data();
    client->last_frame_end_ms = HAL_GetTick();
    client->completed_result = MODBUS_CLIENT_TIMEOUT;
    client->phase = MODBUS_RTU_ASYNC_IDLE;
}

bool modbus_rtu_async_start_read_bits(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity)
{
    if ((client == NULL) ||
        (client->phase != MODBUS_RTU_ASYNC_IDLE) ||
        ((function_code != 0x01U) && (function_code != 0x02U)) ||
        (quantity == 0U) || (quantity > MODBUS_RTU_ASYNC_MAX_BITS)) {
        return false;
    }

    client->tx_frame[0] = unit_id;
    client->tx_frame[1] = function_code;
    client->tx_frame[2] = (uint8_t)(address >> 8U);
    client->tx_frame[3] = (uint8_t)address;
    client->tx_frame[4] = (uint8_t)(quantity >> 8U);
    client->tx_frame[5] = (uint8_t)quantity;
    return queue_request(
        client,
        unit_id,
        function_code,
        8U,
        MODBUS_RTU_ASYNC_READ_BITS,
        (uint8_t)((quantity + 7U) / 8U));
}

bool modbus_rtu_async_start_read_registers(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity)
{
    if ((client == NULL) ||
        (client->phase != MODBUS_RTU_ASYNC_IDLE) ||
        ((function_code != 0x03U) && (function_code != 0x04U)) ||
        (quantity == 0U) ||
        (quantity > MODBUS_RTU_ASYNC_MAX_REGISTERS)) {
        return false;
    }

    client->tx_frame[0] = unit_id;
    client->tx_frame[1] = function_code;
    client->tx_frame[2] = (uint8_t)(address >> 8U);
    client->tx_frame[3] = (uint8_t)address;
    client->tx_frame[4] = (uint8_t)(quantity >> 8U);
    client->tx_frame[5] = (uint8_t)quantity;
    return queue_request(
        client,
        unit_id,
        function_code,
        8U,
        MODBUS_RTU_ASYNC_READ_REGISTERS,
        (uint8_t)(quantity * 2U));
}

static bool start_write_single(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t value)
{
    if ((client == NULL) ||
        (client->phase != MODBUS_RTU_ASYNC_IDLE)) {
        return false;
    }

    client->tx_frame[0] = unit_id;
    client->tx_frame[1] = function_code;
    client->tx_frame[2] = (uint8_t)(address >> 8U);
    client->tx_frame[3] = (uint8_t)address;
    client->tx_frame[4] = (uint8_t)(value >> 8U);
    client->tx_frame[5] = (uint8_t)value;
    return queue_request(
        client,
        unit_id,
        function_code,
        8U,
        MODBUS_RTU_ASYNC_WRITE,
        0U);
}

bool modbus_rtu_async_start_write_single_coil(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    bool value)
{
    return start_write_single(
        client,
        unit_id,
        0x05U,
        address,
        value ? 0xFF00U : 0x0000U);
}

bool modbus_rtu_async_start_write_single_register(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t value)
{
    return start_write_single(
        client,
        unit_id,
        0x06U,
        address,
        value);
}

bool modbus_rtu_async_start_write_registers(
    modbus_rtu_async_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t quantity,
    const uint16_t *registers)
{
    uint16_t index;
    uint16_t request_length;

    if ((client == NULL) ||
        (client->phase != MODBUS_RTU_ASYNC_IDLE) ||
        (registers == NULL) ||
        (quantity == 0U) ||
        (quantity > MODBUS_RTU_ASYNC_MAX_WRITE_REGISTERS)) {
        return false;
    }

    client->tx_frame[0] = unit_id;
    client->tx_frame[1] = 0x10U;
    client->tx_frame[2] = (uint8_t)(address >> 8U);
    client->tx_frame[3] = (uint8_t)address;
    client->tx_frame[4] = (uint8_t)(quantity >> 8U);
    client->tx_frame[5] = (uint8_t)quantity;
    client->tx_frame[6] = (uint8_t)(quantity * 2U);
    for (index = 0U; index < quantity; ++index) {
        const uint16_t offset = (uint16_t)(7U + (index * 2U));
        client->tx_frame[offset] = (uint8_t)(registers[index] >> 8U);
        client->tx_frame[offset + 1U] = (uint8_t)registers[index];
    }
    request_length = (uint16_t)(9U + (quantity * 2U));
    return queue_request(
        client,
        unit_id,
        0x10U,
        request_length,
        MODBUS_RTU_ASYNC_WRITE,
        0U);
}

uint8_t modbus_rtu_async_get_bits(
    const modbus_rtu_async_client_t *client,
    uint16_t bit_index)
{
    if ((client == NULL) || (bit_index >= MODBUS_RTU_ASYNC_MAX_BITS)) {
        return 0U;
    }
    return (uint8_t)(
        (client->bits[bit_index / 8U] >> (bit_index % 8U)) & 0x01U);
}

uint16_t modbus_rtu_async_get_register(
    const modbus_rtu_async_client_t *client,
    uint16_t register_index)
{
    if ((client == NULL) ||
        (register_index >= MODBUS_RTU_ASYNC_MAX_REGISTERS)) {
        return 0U;
    }
    return client->registers[register_index];
}

/*
 * One received byte, from the CDC ring buffer.
 *
 * Body-for-body what HAL_UART_RxCpltCallback does on the UART boards: grow the
 * frame, work out how long the response should be as soon as the function code
 * and byte count are known, and finish when it is complete. Only where the byte
 * comes from has changed.
 */
static void consume_rx_byte(modbus_rtu_async_client_t *client, uint8_t byte)
{
    uint16_t expected_length;

    if (client->rx_length >= sizeof(client->rx_frame)) {
        finish_from_interrupt(client, MODBUS_CLIENT_BAD_RESPONSE);
        return;
    }
    client->rx_frame[client->rx_length++] = byte;

    expected_length = client->expected_rx_length;
    if (client->rx_length >= 2U) {
        const uint8_t received_function = client->rx_frame[1];

        if (received_function ==
            (uint8_t)(client->function_code | 0x80U)) {
            expected_length = 5U;
        } else if (received_function != client->function_code) {
            /* A malformed/noisy frame is bounded instead of filling RAM. */
            expected_length = 5U;
        } else if (client->operation == MODBUS_RTU_ASYNC_WRITE) {
            expected_length = 8U;
        } else if (client->rx_length >= 3U) {
            expected_length =
                (uint16_t)(5U + client->rx_frame[2]);
            if (expected_length > sizeof(client->rx_frame)) {
                finish_from_interrupt(
                    client,
                    MODBUS_CLIENT_BAD_RESPONSE);
                return;
            }
        }
        client->expected_rx_length = expected_length;
    }

    if ((expected_length != 0U) &&
        (client->rx_length >= expected_length)) {
        finish_from_interrupt(client, MODBUS_CLIENT_OK);
    }
}

static void begin_receiving(modbus_rtu_async_client_t *client)
{
    client->rx_length = 0U;
    client->expected_rx_length = 0U;
    client->deadline_ms =
        HAL_GetTick() + client->timeout_ms + client->rx_budget_ms;
    client->phase = MODBUS_RTU_ASYNC_RECEIVING;
}

/*
 * Moves whatever the host has sent into the frame under construction.
 *
 * Stops as soon as consume_rx_byte completes a frame, so trailing bytes are
 * left where they are rather than being folded into the next transaction; the
 * flush at the start of each request discards them. A UART gets this for free
 * by not re-arming its receive.
 */
static void drain_received_bytes(modbus_rtu_async_client_t *client)
{
    uint8_t buffer[64];
    uint16_t count;

    if (client->phase != MODBUS_RTU_ASYNC_RECEIVING) {
        return;
    }

    count = hmi_usb_cdc_read(buffer, (uint16_t)sizeof(buffer));
    for (uint16_t index = 0U;
         (index < count) && (client->phase == MODBUS_RTU_ASYNC_RECEIVING);
         index++) {
        consume_rx_byte(client, buffer[index]);
    }
}
