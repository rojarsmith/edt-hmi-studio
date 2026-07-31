#include "modbus_rtu_client.h"

#include <string.h>

#define MODBUS_RTU_MAX_BITS      32U
#define MODBUS_RTU_MAX_REGISTERS 2U

static void append_crc(uint8_t *frame, uint16_t payload_length)
{
    const uint16_t crc = modbus_rtu_crc16(frame, payload_length);
    frame[payload_length] = (uint8_t)(crc & 0xFFU);
    frame[payload_length + 1U] = (uint8_t)(crc >> 8U);
}

static bool frame_crc_is_valid(const uint8_t *frame, uint16_t frame_length)
{
    uint16_t received_crc;

    if ((frame == NULL) || (frame_length < 4U)) {
        return false;
    }

    received_crc = (uint16_t)frame[frame_length - 2U];
    received_crc |= (uint16_t)((uint16_t)frame[frame_length - 1U] << 8U);
    return modbus_rtu_crc16(frame, (uint16_t)(frame_length - 2U)) == received_crc;
}

static uint32_t interframe_delay_ms(const modbus_rtu_client_t *client)
{
    uint32_t baud_rate;
    uint32_t delay_ms;

    baud_rate = client->uart->Init.BaudRate;
    if (baud_rate > 19200U) {
        return 2U;
    }
    if (baud_rate == 0U) {
        return 4U;
    }

    /* 3.5 characters, conservatively treating a character as 11 bits. */
    delay_ms = (38500U + baud_rate - 1U) / baud_rate;
    return (delay_ms == 0U) ? 1U : delay_ms;
}

static void wait_for_interframe_gap(modbus_rtu_client_t *client)
{
    const uint32_t required_ms = interframe_delay_ms(client);
    const uint32_t elapsed_ms = HAL_GetTick() - client->last_frame_end_ms;

    if ((client->last_frame_end_ms != 0U) && (elapsed_ms < required_ms)) {
        HAL_Delay(required_ms - elapsed_ms);
    }
}

static void discard_stale_rx_data(UART_HandleTypeDef *uart)
{
    __HAL_UART_CLEAR_OREFLAG(uart);
    while (__HAL_UART_GET_FLAG(uart, UART_FLAG_RXNE) != RESET) {
        __HAL_UART_FLUSH_DRREGISTER(uart);
    }
}

static modbus_client_result_t transmit_request(
    modbus_rtu_client_t *client,
    const uint8_t *request,
    uint16_t request_length)
{
    wait_for_interframe_gap(client);
    discard_stale_rx_data(client->uart);

    if (HAL_UART_Transmit(
            client->uart,
            (uint8_t *)request,
            request_length,
            client->timeout_ms) != HAL_OK) {
        client->last_frame_end_ms = HAL_GetTick();
        return MODBUS_CLIENT_IO_ERROR;
    }

    return MODBUS_CLIENT_OK;
}

static modbus_client_result_t receive_exact(
    modbus_rtu_client_t *client,
    uint8_t *data,
    uint16_t length)
{
    const HAL_StatusTypeDef status =
        HAL_UART_Receive(client->uart, data, length, client->timeout_ms);

    if (status == HAL_TIMEOUT) {
        client->last_frame_end_ms = HAL_GetTick();
        return MODBUS_CLIENT_TIMEOUT;
    }
    if (status != HAL_OK) {
        client->last_frame_end_ms = HAL_GetTick();
        return MODBUS_CLIENT_IO_ERROR;
    }
    return MODBUS_CLIENT_OK;
}

static modbus_client_result_t validate_common_response(
    modbus_rtu_client_t *client,
    const uint8_t *frame,
    uint16_t frame_length,
    uint8_t unit_id,
    uint8_t function_code)
{
    client->last_frame_end_ms = HAL_GetTick();

    if (!frame_crc_is_valid(frame, frame_length)) {
        return MODBUS_CLIENT_CRC_ERROR;
    }
    if (frame[0] != unit_id) {
        return MODBUS_CLIENT_BAD_RESPONSE;
    }
    if (frame[1] == (uint8_t)(function_code | 0x80U)) {
        client->last_exception = frame[2];
        return MODBUS_CLIENT_EXCEPTION;
    }
    if (frame[1] != function_code) {
        return MODBUS_CLIENT_BAD_RESPONSE;
    }

    client->last_exception = 0U;
    return MODBUS_CLIENT_OK;
}

static modbus_client_result_t receive_read_response(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint8_t expected_byte_count,
    uint8_t *frame,
    uint16_t frame_capacity,
    uint16_t *frame_length)
{
    modbus_client_result_t result;
    uint16_t remaining;

    result = receive_exact(client, frame, 3U);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    if (frame[1] == (uint8_t)(function_code | 0x80U)) {
        remaining = 2U;
    } else {
        if (frame[2] != expected_byte_count) {
            client->last_frame_end_ms = HAL_GetTick();
            return MODBUS_CLIENT_BAD_RESPONSE;
        }
        remaining = (uint16_t)frame[2] + 2U;
    }

    if ((uint16_t)(3U + remaining) > frame_capacity) {
        client->last_frame_end_ms = HAL_GetTick();
        return MODBUS_CLIENT_BAD_RESPONSE;
    }

    result = receive_exact(client, &frame[3], remaining);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    *frame_length = (uint16_t)(3U + remaining);
    return validate_common_response(
        client,
        frame,
        *frame_length,
        unit_id,
        function_code);
}

void modbus_rtu_client_init(
    modbus_rtu_client_t *client,
    UART_HandleTypeDef *uart,
    uint32_t timeout_ms)
{
    if (client == NULL) {
        return;
    }

    client->uart = uart;
    client->timeout_ms = (timeout_ms == 0U) ? 1000U : timeout_ms;
    client->last_frame_end_ms = 0U;
    client->last_exception = 0U;
}

uint16_t modbus_rtu_crc16(const uint8_t *data, uint16_t length)
{
    uint16_t crc = 0xFFFFU;
    uint16_t index;

    for (index = 0U; index < length; ++index) {
        uint8_t bit;
        crc ^= data[index];
        for (bit = 0U; bit < 8U; ++bit) {
            if ((crc & 0x0001U) != 0U) {
                crc = (uint16_t)((crc >> 1U) ^ 0xA001U);
            } else {
                crc >>= 1U;
            }
        }
    }

    return crc;
}

modbus_client_result_t modbus_rtu_read_bits(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity,
    uint8_t *bits)
{
    uint8_t request[8];
    uint8_t response[16];
    uint16_t response_length = 0U;
    uint8_t expected_bytes;
    modbus_client_result_t result;

    if ((client == NULL) || (client->uart == NULL) || (bits == NULL) ||
        ((function_code != 0x01U) && (function_code != 0x02U)) ||
        (unit_id == 0U) || (unit_id > 247U) ||
        (quantity == 0U) || (quantity > MODBUS_RTU_MAX_BITS)) {
        return MODBUS_CLIENT_INVALID_ARGUMENT;
    }

    expected_bytes = (uint8_t)((quantity + 7U) / 8U);
    request[0] = unit_id;
    request[1] = function_code;
    request[2] = (uint8_t)(address >> 8U);
    request[3] = (uint8_t)address;
    request[4] = (uint8_t)(quantity >> 8U);
    request[5] = (uint8_t)quantity;
    append_crc(request, 6U);

    result = transmit_request(client, request, sizeof(request));
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    result = receive_read_response(
        client,
        unit_id,
        function_code,
        expected_bytes,
        response,
        sizeof(response),
        &response_length);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    (void)response_length;
    memcpy(bits, &response[3], expected_bytes);
    return MODBUS_CLIENT_OK;
}

modbus_client_result_t modbus_rtu_read_registers(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity,
    uint16_t *registers)
{
    uint8_t request[8];
    uint8_t response[16];
    uint16_t response_length = 0U;
    uint16_t index;
    modbus_client_result_t result;

    if ((client == NULL) || (client->uart == NULL) || (registers == NULL) ||
        ((function_code != 0x03U) && (function_code != 0x04U)) ||
        (unit_id == 0U) || (unit_id > 247U) ||
        (quantity == 0U) || (quantity > MODBUS_RTU_MAX_REGISTERS)) {
        return MODBUS_CLIENT_INVALID_ARGUMENT;
    }

    request[0] = unit_id;
    request[1] = function_code;
    request[2] = (uint8_t)(address >> 8U);
    request[3] = (uint8_t)address;
    request[4] = (uint8_t)(quantity >> 8U);
    request[5] = (uint8_t)quantity;
    append_crc(request, 6U);

    result = transmit_request(client, request, sizeof(request));
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    result = receive_read_response(
        client,
        unit_id,
        function_code,
        (uint8_t)(quantity * 2U),
        response,
        sizeof(response),
        &response_length);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    (void)response_length;
    for (index = 0U; index < quantity; ++index) {
        const uint16_t offset = (uint16_t)(3U + (index * 2U));
        registers[index] =
            (uint16_t)(((uint16_t)response[offset] << 8U) |
                       response[offset + 1U]);
    }

    return MODBUS_CLIENT_OK;
}

static modbus_client_result_t write_single(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t value)
{
    uint8_t request[8];
    uint8_t response[8];
    uint16_t response_length;
    modbus_client_result_t result;

    if ((client == NULL) || (client->uart == NULL) ||
        (unit_id == 0U) || (unit_id > 247U)) {
        return MODBUS_CLIENT_INVALID_ARGUMENT;
    }

    request[0] = unit_id;
    request[1] = function_code;
    request[2] = (uint8_t)(address >> 8U);
    request[3] = (uint8_t)address;
    request[4] = (uint8_t)(value >> 8U);
    request[5] = (uint8_t)value;
    append_crc(request, 6U);

    result = transmit_request(client, request, sizeof(request));
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    result = receive_exact(client, response, 2U);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }
    response_length =
        (response[1] == (uint8_t)(function_code | 0x80U)) ? 5U : 8U;
    result = receive_exact(
        client,
        &response[2],
        (uint16_t)(response_length - 2U));
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }
    result = validate_common_response(
        client,
        response,
        response_length,
        unit_id,
        function_code);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    if ((response_length != sizeof(response)) ||
        (memcmp(request, response, 6U) != 0)) {
        return MODBUS_CLIENT_BAD_RESPONSE;
    }
    return MODBUS_CLIENT_OK;
}

modbus_client_result_t modbus_rtu_write_single_coil(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    bool value)
{
    return write_single(
        client,
        unit_id,
        0x05U,
        address,
        value ? 0xFF00U : 0x0000U);
}

modbus_client_result_t modbus_rtu_write_single_register(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t value)
{
    return write_single(client, unit_id, 0x06U, address, value);
}

modbus_client_result_t modbus_rtu_write_registers(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t quantity,
    const uint16_t *registers)
{
    uint8_t request[13];
    uint8_t response[8];
    uint16_t request_length;
    uint16_t response_length;
    uint16_t index;
    modbus_client_result_t result;

    if ((client == NULL) || (client->uart == NULL) || (registers == NULL) ||
        (unit_id == 0U) || (unit_id > 247U) ||
        (quantity == 0U) || (quantity > MODBUS_RTU_MAX_REGISTERS)) {
        return MODBUS_CLIENT_INVALID_ARGUMENT;
    }

    request[0] = unit_id;
    request[1] = 0x10U;
    request[2] = (uint8_t)(address >> 8U);
    request[3] = (uint8_t)address;
    request[4] = (uint8_t)(quantity >> 8U);
    request[5] = (uint8_t)quantity;
    request[6] = (uint8_t)(quantity * 2U);
    for (index = 0U; index < quantity; ++index) {
        const uint16_t offset = (uint16_t)(7U + (index * 2U));
        request[offset] = (uint8_t)(registers[index] >> 8U);
        request[offset + 1U] = (uint8_t)registers[index];
    }
    request_length = (uint16_t)(9U + (quantity * 2U));
    append_crc(request, (uint16_t)(request_length - 2U));

    result = transmit_request(client, request, request_length);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    result = receive_exact(client, response, 2U);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }
    response_length =
        (response[1] == (uint8_t)(0x10U | 0x80U)) ? 5U : 8U;
    result = receive_exact(
        client,
        &response[2],
        (uint16_t)(response_length - 2U));
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }
    result = validate_common_response(
        client,
        response,
        response_length,
        unit_id,
        0x10U);
    if (result != MODBUS_CLIENT_OK) {
        return result;
    }

    if ((response_length != sizeof(response)) ||
        (memcmp(request, response, 6U) != 0)) {
        return MODBUS_CLIENT_BAD_RESPONSE;
    }
    return MODBUS_CLIENT_OK;
}
