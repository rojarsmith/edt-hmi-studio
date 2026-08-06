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

    for (;;) {
        (void)lv_timer_handler();
        hmi_runtime_task();
        HAL_Delay(1U);
    }
}
