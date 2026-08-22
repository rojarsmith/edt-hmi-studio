#ifndef HMI_RUNTIME_H
#define HMI_RUNTIME_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "lvgl.h"
#include "stm32u5xx_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    HMI_PARITY_NONE = 0,
    HMI_PARITY_EVEN,
    HMI_PARITY_ODD,
} hmi_parity_t;

typedef enum {
    HMI_AREA_COIL = 0,
    HMI_AREA_DISCRETE_INPUT,
    HMI_AREA_HOLDING_REGISTER,
    HMI_AREA_INPUT_REGISTER,
} hmi_area_t;

typedef enum {
    HMI_DATA_BOOL = 0,
    HMI_DATA_UINT16,
    HMI_DATA_INT16,
    HMI_DATA_UINT32,
    HMI_DATA_INT32,
    HMI_DATA_FLOAT32,
    /**
     * ASCII text carried in consecutive holding or input registers, two
     * characters per register, high byte first, ended by a NUL or by the
     * end of the block. `string_registers` on the descriptor says how many
     * registers the block spans. Read-only: nothing in the runtime writes
     * text back to the server.
     */
    HMI_DATA_STRING,
} hmi_data_type_t;

typedef enum {
    HMI_ACCESS_READ = 0,
    HMI_ACCESS_WRITE,
    HMI_ACCESS_READWRITE,
} hmi_access_t;

typedef enum {
    HMI_WIDGET_GENERIC = 0,
    HMI_WIDGET_BUTTON,
    HMI_WIDGET_IMAGE_BUTTON,
    HMI_WIDGET_SWITCH,
    HMI_WIDGET_CHECKBOX,
    HMI_WIDGET_SLIDER,
    HMI_WIDGET_BAR,
    HMI_WIDGET_ARC,
    HMI_WIDGET_TEXTAREA,
    HMI_WIDGET_LABEL,
    HMI_WIDGET_DROPDOWN,
} hmi_widget_t;

typedef enum {
    HMI_PROPERTY_CHECKED = 0,
    HMI_PROPERTY_VALUE,
    HMI_PROPERTY_TEXT,
    HMI_PROPERTY_SELECTED,
} hmi_property_t;

typedef enum {
    HMI_WRITE_WIDGET_VALUE = 0,
    HMI_WRITE_SET,
    HMI_WRITE_TOGGLE,
    HMI_WRITE_INCREMENT,
    HMI_WRITE_DECREMENT,
} hmi_write_behavior_t;

typedef float (*hmi_widget_value_reader_t)(lv_obj_t *object);
typedef void (*hmi_widget_value_writer_t)(lv_obj_t *object, float value);
typedef void (*hmi_widget_text_writer_t)(lv_obj_t *object, const char *text);

typedef struct {
    bool enabled;
    uint8_t unit_id;
    uint32_t baud_rate;
    hmi_parity_t parity;
    uint8_t stop_bits;
    uint32_t timeout_ms;
    uint8_t retry_count;
    uint32_t default_poll_ms;
} hmi_runtime_config_t;

/*
 * This descriptor is the stable ABI consumed by generated
 * hmi_bindings_generated.c. Addresses are zero-based Modbus PDU addresses.
 */
typedef struct {
    lv_obj_t **object;
    hmi_area_t area;
    hmi_data_type_t data_type;
    hmi_access_t access;
    hmi_widget_t widget;
    hmi_property_t property;
    hmi_write_behavior_t write_behavior;
    uint16_t address;
    float scale;
    uint32_t poll_ms;
    float write_value;
    hmi_widget_value_reader_t value_reader;
    hmi_widget_value_writer_t value_writer;
    /** Receives HMI_DATA_STRING reads. NULL on every numeric binding. */
    hmi_widget_text_writer_t text_writer;
    /** Registers an HMI_DATA_STRING block spans. Zero on numeric bindings. */
    uint16_t string_registers;
} hmi_binding_descriptor_t;

typedef struct {
    bool initialized;
    bool communication_ok;
    uint32_t successful_transactions;
    uint32_t failed_transactions;
    uint8_t last_exception;
} hmi_runtime_status_t;

/*
 * Generated projects provide strong definitions for these symbols. The
 * runtime supplies disabled weak defaults so a UI with no bindings still
 * links.
 */
extern const hmi_runtime_config_t hmi_runtime_config;
extern const hmi_binding_descriptor_t hmi_binding_descriptors[];
extern const size_t hmi_binding_descriptor_count;

/*
 * No UART parameter, unlike the other boards: the Modbus transport here is the
 * Type-C USB virtual COM port, brought up by board_init. See hmi_usb_cdc.h.
 */
bool hmi_runtime_init(
    const hmi_runtime_config_t *config,
    const hmi_binding_descriptor_t *descriptors,
    size_t descriptor_count);

void hmi_runtime_task(void);
const hmi_runtime_status_t *hmi_runtime_get_status(void);

/*
 * Read the most recent background-polled value for a zero-based Modbus
 * Holding Register address. This function never blocks; false means that no
 * successful response has populated the cache yet.
 */
bool hmi_runtime_read_holding_register(
    uint16_t address,
    uint16_t *value);

/*
 * Queue a write onto the writable binding descriptor matching a zero-based
 * Modbus address. The value is the engineering value: the descriptor's
 * scale divides it and its data type encodes it, exactly as a widget write
 * does. Never blocks; false means the runtime is not initialized or no
 * writable descriptor carries that address.
 */
bool hmi_runtime_write_holding_register(uint16_t address, float value);
bool hmi_runtime_write_coil(uint16_t address, bool value);

#ifdef __cplusplus
}
#endif

#endif /* HMI_RUNTIME_H */
