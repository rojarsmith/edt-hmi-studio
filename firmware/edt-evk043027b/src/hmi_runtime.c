#include "hmi_runtime.h"

/* For board_uart1_apply — see configure_uart, which is where this copy of the
   runtime departs from the other boards'. */
#include "board.h"
#include "modbus_rtu_async_client.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define HMI_RUNTIME_MAX_BINDINGS 128U

typedef struct {
    const hmi_binding_descriptor_t *descriptor;
    uint32_t next_poll_ms;
    float cached_value;
    bool cached_value_valid;
    bool suppress_event;
    bool write_pending;
    float pending_write_value;
} hmi_binding_state_t;

typedef enum {
    HMI_TRANSACTION_NONE = 0,
    HMI_TRANSACTION_READ,
    HMI_TRANSACTION_WRITE,
} hmi_transaction_kind_t;

typedef struct {
    bool active;
    hmi_transaction_kind_t kind;
    hmi_binding_state_t *state;
    float write_value;
    uint8_t retry_attempt;
} hmi_transaction_t;

static modbus_rtu_async_client_t g_modbus_client;
static const hmi_runtime_config_t *g_config;
static hmi_binding_state_t g_binding_states[HMI_RUNTIME_MAX_BINDINGS];
static size_t g_binding_count;
static size_t g_poll_cursor;
static size_t g_write_cursor;
static hmi_transaction_t g_transaction;
static hmi_runtime_status_t g_status;

__weak const hmi_runtime_config_t hmi_runtime_config = {
    .enabled = false,
    .unit_id = 1U,
    .baud_rate = 9600U,
    .parity = HMI_PARITY_NONE,
    .stop_bits = 1U,
    .timeout_ms = 250U,
    .retry_count = 0U,
    .default_poll_ms = 250U,
};

__weak const hmi_binding_descriptor_t hmi_binding_descriptors[1] = {{0}};
__weak const size_t hmi_binding_descriptor_count = 0U;

static bool access_is_readable(hmi_access_t access)
{
    return (access == HMI_ACCESS_READ) || (access == HMI_ACCESS_READWRITE);
}

static bool access_is_writable(hmi_access_t access)
{
    return (access == HMI_ACCESS_WRITE) || (access == HMI_ACCESS_READWRITE);
}

static uint16_t register_quantity_for_type(hmi_data_type_t data_type)
{
    switch (data_type) {
        case HMI_DATA_UINT32:
        case HMI_DATA_INT32:
        case HMI_DATA_FLOAT32:
            return 2U;
        default:
            return 1U;
    }
}

static float decode_register_value(
    hmi_data_type_t data_type,
    const uint16_t *registers)
{
    uint32_t wide_value;
    float float_value;

    switch (data_type) {
        case HMI_DATA_BOOL:
            return (registers[0] != 0U) ? 1.0f : 0.0f;
        case HMI_DATA_INT16:
            return (float)(int16_t)registers[0];
        case HMI_DATA_UINT32:
            wide_value =
                ((uint32_t)registers[0] << 16U) | registers[1];
            return (float)wide_value;
        case HMI_DATA_INT32:
            wide_value =
                ((uint32_t)registers[0] << 16U) | registers[1];
            return (float)(int32_t)wide_value;
        case HMI_DATA_FLOAT32:
            wide_value =
                ((uint32_t)registers[0] << 16U) | registers[1];
            memcpy(&float_value, &wide_value, sizeof(float_value));
            return float_value;
        case HMI_DATA_UINT16:
        default:
            return (float)registers[0];
    }
}

static bool start_binding_read(
    const hmi_binding_descriptor_t *descriptor)
{
    uint8_t function_code;
    uint16_t quantity;

    if (descriptor == NULL) {
        return false;
    }

    if ((descriptor->area == HMI_AREA_COIL) ||
        (descriptor->area == HMI_AREA_DISCRETE_INPUT)) {
        function_code =
            (descriptor->area == HMI_AREA_COIL) ? 0x01U : 0x02U;
        return modbus_rtu_async_start_read_bits(
            &g_modbus_client,
            g_config->unit_id,
            function_code,
            descriptor->address,
            1U);
    }

    function_code =
        (descriptor->area == HMI_AREA_HOLDING_REGISTER) ? 0x03U : 0x04U;
    quantity = register_quantity_for_type(descriptor->data_type);
    return modbus_rtu_async_start_read_registers(
        &g_modbus_client,
        g_config->unit_id,
        function_code,
        descriptor->address,
        quantity);
}

static float completed_read_value(
    const hmi_binding_descriptor_t *descriptor)
{
    uint16_t registers[2];

    if ((descriptor->area == HMI_AREA_COIL) ||
        (descriptor->area == HMI_AREA_DISCRETE_INPUT)) {
        return modbus_rtu_async_get_bits(&g_modbus_client, 0U) != 0U
                   ? 1.0f
                   : 0.0f;
    }

    registers[0] =
        modbus_rtu_async_get_register(&g_modbus_client, 0U);
    registers[1] =
        modbus_rtu_async_get_register(&g_modbus_client, 1U);
    return decode_register_value(descriptor->data_type, registers);
}

static int32_t rounded_i32(float value)
{
    if (value >= 0.0f) {
        return (int32_t)(value + 0.5f);
    }
    return (int32_t)(value - 0.5f);
}

static uint16_t encode_register_value(
    hmi_data_type_t data_type,
    float value,
    uint16_t *registers)
{
    uint32_t wide_value;

    switch (data_type) {
        case HMI_DATA_UINT32:
            wide_value = (uint32_t)value;
            break;
        case HMI_DATA_INT32:
            wide_value = (uint32_t)rounded_i32(value);
            break;
        case HMI_DATA_FLOAT32:
            memcpy(&wide_value, &value, sizeof(wide_value));
            break;
        case HMI_DATA_BOOL:
            registers[0] = (value != 0.0f) ? 1U : 0U;
            return 1U;
        case HMI_DATA_INT16:
        case HMI_DATA_UINT16:
        default:
            registers[0] = (uint16_t)rounded_i32(value);
            return 1U;
    }

    registers[0] = (uint16_t)(wide_value >> 16U);
    registers[1] = (uint16_t)wide_value;
    return 2U;
}

static float get_widget_value(const hmi_binding_state_t *state)
{
    const hmi_binding_descriptor_t *descriptor = state->descriptor;
    lv_obj_t *object;

    if ((descriptor == NULL) || (descriptor->object == NULL) ||
        (*descriptor->object == NULL)) {
        return 0.0f;
    }
    object = *descriptor->object;

    if (descriptor->value_reader != NULL) {
        return descriptor->value_reader(object);
    }
    if (descriptor->property == HMI_PROPERTY_CHECKED) {
        return lv_obj_has_state(object, LV_STATE_CHECKED) ? 1.0f : 0.0f;
    }
    if (descriptor->property == HMI_PROPERTY_SELECTED) {
        return (float)lv_dropdown_get_selected(object);
    }
    if (descriptor->property == HMI_PROPERTY_TEXT) {
        if (descriptor->widget == HMI_WIDGET_TEXTAREA) {
            return strtof(lv_textarea_get_text(object), NULL);
        }
        return 0.0f;
    }

    switch (descriptor->widget) {
        case HMI_WIDGET_SLIDER:
            return (float)lv_slider_get_value(object);
        case HMI_WIDGET_BAR:
            return (float)lv_bar_get_value(object);
        case HMI_WIDGET_ARC:
            return (float)lv_arc_get_value(object);
        case HMI_WIDGET_DROPDOWN:
            return (float)lv_dropdown_get_selected(object);
        case HMI_WIDGET_SWITCH:
        case HMI_WIDGET_CHECKBOX:
            return lv_obj_has_state(object, LV_STATE_CHECKED) ? 1.0f : 0.0f;
        default:
            return 0.0f;
    }
}

static void set_widget_value(hmi_binding_state_t *state, float value)
{
    const hmi_binding_descriptor_t *descriptor = state->descriptor;
    lv_obj_t *object;
    char text[32];
    const int32_t integer_value = rounded_i32(value);

    if ((descriptor == NULL) || (descriptor->object == NULL) ||
        (*descriptor->object == NULL)) {
        return;
    }
    object = *descriptor->object;
    state->suppress_event = true;

    if (descriptor->value_writer != NULL) {
        descriptor->value_writer(object, value);
    } else if (descriptor->property == HMI_PROPERTY_CHECKED) {
        if (value != 0.0f) {
            lv_obj_add_state(object, LV_STATE_CHECKED);
        } else {
            lv_obj_remove_state(object, LV_STATE_CHECKED);
        }
    } else if (descriptor->property == HMI_PROPERTY_SELECTED) {
        lv_dropdown_set_selected(object, (uint32_t)integer_value);
    } else if (descriptor->property == HMI_PROPERTY_TEXT) {
        (void)snprintf(text, sizeof(text), "%ld", (long)integer_value);
        if (descriptor->widget == HMI_WIDGET_TEXTAREA) {
            lv_textarea_set_text(object, text);
        } else {
            lv_label_set_text(object, text);
        }
    } else {
        switch (descriptor->widget) {
            case HMI_WIDGET_SLIDER:
                lv_slider_set_value(object, integer_value, LV_ANIM_OFF);
                break;
            case HMI_WIDGET_BAR:
                lv_bar_set_value(object, integer_value, LV_ANIM_OFF);
                break;
            case HMI_WIDGET_ARC:
                lv_arc_set_value(object, integer_value);
                break;
            case HMI_WIDGET_DROPDOWN:
                lv_dropdown_set_selected(object, (uint32_t)integer_value);
                break;
            case HMI_WIDGET_SWITCH:
            case HMI_WIDGET_CHECKBOX:
                if (value != 0.0f) {
                    lv_obj_add_state(object, LV_STATE_CHECKED);
                } else {
                    lv_obj_remove_state(object, LV_STATE_CHECKED);
                }
                break;
            default:
                break;
        }
    }

    state->suppress_event = false;
}

static bool start_binding_write(
    hmi_binding_state_t *state,
    float engineering_value)
{
    const hmi_binding_descriptor_t *descriptor = state->descriptor;
    uint16_t registers[2] = {0U, 0U};
    uint16_t quantity;
    float raw_value = engineering_value;

    if (descriptor->scale != 0.0f) {
        raw_value /= descriptor->scale;
    }

    if (descriptor->area == HMI_AREA_COIL) {
        return modbus_rtu_async_start_write_single_coil(
            &g_modbus_client,
            g_config->unit_id,
            descriptor->address,
            raw_value != 0.0f);
    }
    if (descriptor->area != HMI_AREA_HOLDING_REGISTER) {
        return false;
    }

    quantity = encode_register_value(
        descriptor->data_type,
        raw_value,
        registers);
    if (quantity == 1U) {
        return modbus_rtu_async_start_write_single_register(
            &g_modbus_client,
            g_config->unit_id,
            descriptor->address,
            registers[0]);
    }

    return modbus_rtu_async_start_write_registers(
        &g_modbus_client,
        g_config->unit_id,
        descriptor->address,
        quantity,
        registers);
}

static void record_transaction_result(modbus_client_result_t result)
{
    if (result == MODBUS_CLIENT_OK) {
        g_status.communication_ok = true;
        ++g_status.successful_transactions;
        g_status.last_exception = 0U;
    } else {
        g_status.communication_ok = false;
        ++g_status.failed_transactions;
        g_status.last_exception = g_modbus_client.last_exception;
    }
}

static float latest_commanded_value(
    const hmi_binding_state_t *state,
    float fallback)
{
    if (state->write_pending) {
        return state->pending_write_value;
    }
    if (g_transaction.active &&
        (g_transaction.kind == HMI_TRANSACTION_WRITE) &&
        (g_transaction.state == state)) {
        return g_transaction.write_value;
    }
    if (state->cached_value_valid) {
        return state->cached_value;
    }
    return fallback;
}

static void binding_event_cb(lv_event_t *event)
{
    hmi_binding_state_t *state =
        (hmi_binding_state_t *)lv_event_get_user_data(event);
    const hmi_binding_descriptor_t *descriptor;
    float value;

    if ((state == NULL) || state->suppress_event || (g_config == NULL) ||
        !g_config->enabled) {
        return;
    }

    descriptor = state->descriptor;
    if ((descriptor == NULL) || !access_is_writable(descriptor->access)) {
        return;
    }

    switch (descriptor->write_behavior) {
        case HMI_WRITE_SET:
            value = descriptor->write_value;
            break;
        case HMI_WRITE_TOGGLE:
            value =
                (latest_commanded_value(
                     state,
                     get_widget_value(state)) == 0.0f)
                    ? 1.0f
                    : 0.0f;
            break;
        case HMI_WRITE_INCREMENT:
            value =
                latest_commanded_value(state, 0.0f) +
                descriptor->write_value;
            break;
        case HMI_WRITE_DECREMENT:
            value =
                latest_commanded_value(state, 0.0f) -
                descriptor->write_value;
            break;
        case HMI_WRITE_WIDGET_VALUE:
        default:
            value = get_widget_value(state);
            break;
    }

    /*
     * LVGL callbacks must never wait for a serial response.  Last-value-wins
     * queuing also coalesces a fast slider drag instead of flooding the RTU
     * link with obsolete writes.
     */
    state->pending_write_value = value;
    state->write_pending = true;
}

static lv_event_code_t write_event_for_widget(hmi_widget_t widget)
{
    switch (widget) {
        case HMI_WIDGET_BUTTON:
            return LV_EVENT_CLICKED;
        case HMI_WIDGET_IMAGE_BUTTON:
            return LV_EVENT_VALUE_CHANGED;
        case HMI_WIDGET_TEXTAREA:
            return LV_EVENT_READY;
        default:
            return LV_EVENT_VALUE_CHANGED;
    }
}

/*
 * Applies the project's serial settings to the Modbus USART.
 *
 * This one differs from the other board templates' copies of hmi_runtime.c,
 * which set uart->Init directly and call HAL_UART_Init. On this board the
 * Modbus link is RS-485, and HAL_UART_Init rewrites CR3 wholesale — including
 * the driver-enable bit that board_init set with HAL_RS485Ex_Init. The transmit
 * path would still look healthy from the firmware's side while the transceiver
 * never actually drove the bus, which is a fault with no local symptom at all:
 * every transaction simply times out.
 *
 * Going back through board_uart1_apply keeps the knowledge that this USART is
 * RS-485 in board.c, where the rest of the wiring lives, rather than in two
 * places that have to agree.
 */
static bool configure_uart(
    UART_HandleTypeDef *uart,
    const hmi_runtime_config_t *config)
{
    uint32_t parity = UART_PARITY_NONE;

    if (HAL_UART_DeInit(uart) != HAL_OK) {
        return false;
    }

    if (config->parity == HMI_PARITY_EVEN) {
        parity = UART_PARITY_EVEN;
    } else if (config->parity == HMI_PARITY_ODD) {
        parity = UART_PARITY_ODD;
    }

    return board_uart1_apply(
        config->baud_rate,
        parity,
        (config->stop_bits == 2U) ? UART_STOPBITS_2 : UART_STOPBITS_1);
}

bool hmi_runtime_init(
    UART_HandleTypeDef *uart,
    const hmi_runtime_config_t *config,
    const hmi_binding_descriptor_t *descriptors,
    size_t descriptor_count)
{
    size_t index;

    memset(&g_status, 0, sizeof(g_status));
    memset(g_binding_states, 0, sizeof(g_binding_states));
    g_config = config;
    g_binding_count = 0U;
    g_poll_cursor = 0U;
    g_write_cursor = 0U;
    memset(&g_transaction, 0, sizeof(g_transaction));

    if ((uart == NULL) || (config == NULL) ||
        ((descriptor_count > 0U) && (descriptors == NULL)) ||
        (descriptor_count > HMI_RUNTIME_MAX_BINDINGS) ||
        (config->unit_id == 0U) || (config->unit_id > 247U) ||
        (config->baud_rate == 0U)) {
        return false;
    }

    if (!configure_uart(uart, config)) {
        return false;
    }
    modbus_rtu_async_client_init(
        &g_modbus_client,
        uart,
        config->timeout_ms);

    g_binding_count = descriptor_count;
    for (index = 0U; index < descriptor_count; ++index) {
        lv_obj_t *object = NULL;
        g_binding_states[index].descriptor = &descriptors[index];
        g_binding_states[index].next_poll_ms = HAL_GetTick();

        if (descriptors[index].object != NULL) {
            object = *descriptors[index].object;
        }
        if ((object != NULL) && access_is_writable(descriptors[index].access) &&
            (descriptors[index].area != HMI_AREA_DISCRETE_INPUT) &&
            (descriptors[index].area != HMI_AREA_INPUT_REGISTER)) {
            lv_obj_add_event_cb(
                object,
                binding_event_cb,
                write_event_for_widget(descriptors[index].widget),
                &g_binding_states[index]);
        }
    }

    g_status.initialized = true;
    g_status.communication_ok = !config->enabled;
    return true;
}

static bool any_write_pending(void)
{
    size_t index;

    for (index = 0U; index < g_binding_count; ++index) {
        if (g_binding_states[index].write_pending) {
            return true;
        }
    }
    return false;
}

static bool restart_active_transaction(void)
{
    if ((g_transaction.state == NULL) ||
        (g_transaction.state->descriptor == NULL)) {
        return false;
    }

    if (g_transaction.kind == HMI_TRANSACTION_READ) {
        return start_binding_read(g_transaction.state->descriptor);
    }
    if (g_transaction.kind == HMI_TRANSACTION_WRITE) {
        return start_binding_write(
            g_transaction.state,
            g_transaction.write_value);
    }
    return false;
}

static void finish_active_transaction(modbus_client_result_t result)
{
    hmi_binding_state_t *state = g_transaction.state;

    record_transaction_result(result);
    if ((result == MODBUS_CLIENT_OK) && (state != NULL)) {
        if (g_transaction.kind == HMI_TRANSACTION_READ) {
            const hmi_binding_descriptor_t *descriptor =
                state->descriptor;
            const float raw_value = completed_read_value(descriptor);
            const float scale =
                (descriptor->scale == 0.0f) ? 1.0f : descriptor->scale;

            state->cached_value = raw_value * scale;
            state->cached_value_valid = true;
            /*
             * Do not overwrite an operator edit that is queued to be sent
             * immediately after this just-completed read.
             */
            if (!state->write_pending) {
                set_widget_value(state, state->cached_value);
            }
        } else if (g_transaction.kind == HMI_TRANSACTION_WRITE) {
            state->cached_value = g_transaction.write_value;
            state->cached_value_valid = true;
        }
    }

    memset(&g_transaction, 0, sizeof(g_transaction));
}

static bool start_pending_write(void)
{
    size_t scanned;

    for (scanned = 0U; scanned < g_binding_count; ++scanned) {
        hmi_binding_state_t *state =
            &g_binding_states[g_write_cursor];
        const float value = state->pending_write_value;

        g_write_cursor = (g_write_cursor + 1U) % g_binding_count;
        if (!state->write_pending) {
            continue;
        }

        g_transaction.active = true;
        g_transaction.kind = HMI_TRANSACTION_WRITE;
        g_transaction.state = state;
        g_transaction.write_value = value;
        g_transaction.retry_attempt = 0U;
        if (!restart_active_transaction()) {
            memset(&g_transaction, 0, sizeof(g_transaction));
            record_transaction_result(MODBUS_CLIENT_IO_ERROR);
            return false;
        }

        /*
         * Clear only after the request has been accepted.  An LVGL event
         * arriving while it is in flight can set this flag again and queue
         * the newer value.
         */
        state->write_pending = false;
        return true;
    }
    return false;
}

static bool start_due_read(uint32_t now)
{
    size_t scanned;

    for (scanned = 0U; scanned < g_binding_count; ++scanned) {
        hmi_binding_state_t *state = &g_binding_states[g_poll_cursor];
        const hmi_binding_descriptor_t *descriptor = state->descriptor;
        uint32_t poll_ms;

        g_poll_cursor = (g_poll_cursor + 1U) % g_binding_count;
        if ((descriptor == NULL) ||
            !access_is_readable(descriptor->access) ||
            ((int32_t)(now - state->next_poll_ms) < 0)) {
            continue;
        }

        poll_ms =
            (descriptor->poll_ms != 0U)
                ? descriptor->poll_ms
                : g_config->default_poll_ms;
        if (poll_ms == 0U) {
            poll_ms = 250U;
        }
        state->next_poll_ms = now + poll_ms;

        g_transaction.active = true;
        g_transaction.kind = HMI_TRANSACTION_READ;
        g_transaction.state = state;
        g_transaction.retry_attempt = 0U;
        if (!restart_active_transaction()) {
            memset(&g_transaction, 0, sizeof(g_transaction));
            record_transaction_result(MODBUS_CLIENT_IO_ERROR);
            return false;
        }
        return true;
    }
    return false;
}

void hmi_runtime_task(void)
{
    modbus_client_result_t result;
    const uint32_t now = HAL_GetTick();

    if (!g_status.initialized || (g_config == NULL) || !g_config->enabled ||
        (g_binding_count == 0U)) {
        return;
    }

    /*
     * A pending operator command preempts a background read.  HAL_UART_Abort
     * only resets peripheral state; it does not wait for a serial timeout.
     */
    if (g_transaction.active &&
        (g_transaction.kind == HMI_TRANSACTION_READ) &&
        any_write_pending()) {
        modbus_rtu_async_cancel(&g_modbus_client);
        memset(&g_transaction, 0, sizeof(g_transaction));
    }

    if (g_transaction.active) {
        result = modbus_rtu_async_poll(&g_modbus_client);
        if (result == MODBUS_CLIENT_BUSY) {
            return;
        }

        if ((result != MODBUS_CLIENT_OK) &&
            (g_transaction.retry_attempt < g_config->retry_count)) {
            ++g_transaction.retry_attempt;
            if (restart_active_transaction()) {
                return;
            }
            result = MODBUS_CLIENT_IO_ERROR;
        }

        finish_active_transaction(result);
        return;
    }

    /* Writes have priority; otherwise start at most one due background read. */
    if (!start_pending_write()) {
        (void)start_due_read(now);
    }
}

const hmi_runtime_status_t *hmi_runtime_get_status(void)
{
    return &g_status;
}

bool hmi_runtime_read_holding_register(
    uint16_t address,
    uint16_t *value)
{
    hmi_binding_state_t *fallback = NULL;
    size_t index;

    if ((value == NULL) || !g_status.initialized) {
        return false;
    }

    for (index = 0U; index < g_binding_count; ++index) {
        hmi_binding_state_t *state = &g_binding_states[index];
        const hmi_binding_descriptor_t *descriptor = state->descriptor;

        if ((descriptor == NULL) ||
            (descriptor->area != HMI_AREA_HOLDING_REGISTER) ||
            (descriptor->address != address) ||
            !access_is_readable(descriptor->access) ||
            !state->cached_value_valid) {
            continue;
        }

        /*
         * Logic-only descriptors have no LVGL object and use raw uint16
         * values. Prefer them over a potentially scaled widget binding.
         */
        if ((descriptor->object == NULL) &&
            (descriptor->data_type == HMI_DATA_UINT16) &&
            (descriptor->scale == 1.0f)) {
            const int32_t integer_value =
                rounded_i32(state->cached_value);
            *value = (uint16_t)(
                (integer_value < 0)
                    ? 0
                    : ((integer_value > 65535) ? 65535 : integer_value));
            return true;
        }

        if (fallback == NULL) {
            fallback = state;
        }
    }

    if (fallback != NULL) {
        const int32_t integer_value =
            rounded_i32(fallback->cached_value);
        *value = (uint16_t)(
            (integer_value < 0)
                ? 0
                : ((integer_value > 65535) ? 65535 : integer_value));
        return true;
    }

    return false;
}
