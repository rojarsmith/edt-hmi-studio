#include "lvgl.h"
#include "ui_from_json.h"
#include <emscripten.h>
#include <emscripten/html5.h>

static lv_display_t *display;

static uint32_t tick_get_cb(void) {
    return (uint32_t)emscripten_get_now();
}

static void main_loop(void) {
    lv_timer_handler();
}

EMSCRIPTEN_KEEPALIVE
void load_ui_json(const char *json_str) {
    lv_obj_clean(lv_screen_active());
    ui_from_json(json_str);
}

/*
 * Resize the preview to the project's design canvas.
 *
 * The editor calls this on every load, so the size below is only ever what is
 * shown before the first project arrives. It matters more than it looks: this
 * rung of the preview ladder exists to show what *real LVGL* does with the
 * layout, and a display of the wrong shape moves every widget that is anchored
 * to an edge or centred. A portrait project makes that obvious; a landscape one
 * merely made it plausible, which is how the hard-coded 480x320 survived so
 * long. See docs/display-orientation.md §4.4.
 */
EMSCRIPTEN_KEEPALIVE
void set_screen_size(int w, int h) {
    if (display == NULL || w <= 0 || h <= 0) {
        return;
    }
    /* Moves both the SDL window's texture and LVGL's own resolution — the
       driver listens for LV_EVENT_RESOLUTION_CHANGED and reallocates. */
    lv_sdl_window_set_size(display, w, h);
}

int main(int argc, char *argv[]) {
    (void)argc; (void)argv;

    lv_init();
    lv_tick_set_cb(tick_get_cb);

    /* The default board's panel, so an unconfigured preview is at least a real
       display. set_screen_size replaces it as soon as a project loads. */
    display = lv_sdl_window_create(480, 272);
    lv_sdl_mouse_create();

    emscripten_set_main_loop(main_loop, 0, 1);

    return 0;
}
