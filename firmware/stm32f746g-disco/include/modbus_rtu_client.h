#ifndef MODBUS_RTU_CLIENT_H
#define MODBUS_RTU_CLIENT_H

#include <stdbool.h>
#include <stdint.h>

#include "stm32f7xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    MODBUS_CLIENT_OK = 0,
    MODBUS_CLIENT_TIMEOUT,
    MODBUS_CLIENT_IO_ERROR,
    MODBUS_CLIENT_BAD_RESPONSE,
    MODBUS_CLIENT_CRC_ERROR,
    MODBUS_CLIENT_EXCEPTION,
    MODBUS_CLIENT_INVALID_ARGUMENT,
    MODBUS_CLIENT_BUSY,
} modbus_client_result_t;

typedef struct {
    UART_HandleTypeDef *uart;
    uint32_t timeout_ms;
    uint32_t last_frame_end_ms;
    uint8_t last_exception;
} modbus_rtu_client_t;

void modbus_rtu_client_init(
    modbus_rtu_client_t *client,
    UART_HandleTypeDef *uart,
    uint32_t timeout_ms);

uint16_t modbus_rtu_crc16(const uint8_t *data, uint16_t length);

modbus_client_result_t modbus_rtu_read_bits(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity,
    uint8_t *bits);

modbus_client_result_t modbus_rtu_read_registers(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint8_t function_code,
    uint16_t address,
    uint16_t quantity,
    uint16_t *registers);

modbus_client_result_t modbus_rtu_write_single_coil(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    bool value);

modbus_client_result_t modbus_rtu_write_single_register(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t value);

modbus_client_result_t modbus_rtu_write_registers(
    modbus_rtu_client_t *client,
    uint8_t unit_id,
    uint16_t address,
    uint16_t quantity,
    const uint16_t *registers);

#ifdef __cplusplus
}
#endif

#endif /* MODBUS_RTU_CLIENT_H */
