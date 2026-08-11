#include "board.h"
#include "board_display.h"
#include "hmi_runtime.h"
#include "ui.h"
#include "ui_logic.h"

#include "lvgl.h"

int main(void)
{
    if (!board_init()) {
        board_error_handler();
    }

    lv_init();
    lv_tick_set_cb(HAL_GetTick);

    if (!board_display_init()) {
        board_error_handler();
    }

    ui_init();
    if (!hmi_runtime_init(
            &huart1,
            &hmi_runtime_config,
            hmi_binding_descriptors,
            hmi_binding_descriptor_count)) {
        board_error_handler();
    }
    ui_logic_init();

    board_init_stage = BOARD_STAGE_RUNNING;

    /*
     * A steady 1 Hz heartbeat on the board LED. Everything above it can succeed
     * while the panel stays dark — a backlight that never lights, a supply rail
     * that never switches — and in that state the LED is the only evidence that
     * the firmware got here at all. A slow even blink means the main loop is
     * turning; a repeating burst means board_error_handler, and the flash count
     * says which stage failed; nothing at all means it never reached main.
     */
    uint32_t last_heartbeat_ms = HAL_GetTick();
    bool heartbeat_on = false;

    for (;;) {
        (void)lv_timer_handler();
        hmi_runtime_task();

        if ((HAL_GetTick() - last_heartbeat_ms) >= 500U) {
            last_heartbeat_ms = HAL_GetTick();
            heartbeat_on = !heartbeat_on;
            board_status_led(heartbeat_on);
        }

        HAL_Delay(1U);
    }
}
