#include "board_display.h"

#include "lvgl.h"
#include "stm32746g_discovery_lcd.h"
#include "stm32746g_discovery_ts.h"

#include <stdint.h>
#include <string.h>

#define HMI_DRAW_BUFFER_LINES 20U
#define HMI_FRAMEBUFFER_BYTES \
    (HMI_DISPLAY_WIDTH * HMI_DISPLAY_HEIGHT * sizeof(uint16_t))

static uint16_t g_draw_buffer_a[HMI_DISPLAY_WIDTH * HMI_DRAW_BUFFER_LINES]
    __attribute__((aligned(32)));
static uint16_t g_draw_buffer_b[HMI_DISPLAY_WIDTH * HMI_DRAW_BUFFER_LINES]
    __attribute__((aligned(32)));

static void clean_dcache_range(const void *address, size_t length)
{
    const uintptr_t cache_line_mask = 31U;
    const uintptr_t start = (uintptr_t)address & ~cache_line_mask;
    const uintptr_t end =
        ((uintptr_t)address + length + cache_line_mask) & ~cache_line_mask;

    __DSB();
    SCB_CleanDCache_by_Addr(
        (uint32_t *)start,
        (int32_t)(end - start));
    __DSB();
}

static void display_flush(
    lv_display_t *display,
    const lv_area_t *area,
    uint8_t *pixel_map)
{
    uint16_t *framebuffer = (uint16_t *)LCD_FB_START_ADDRESS;
    const uint16_t *source = (const uint16_t *)pixel_map;
    const uint32_t width = (uint32_t)(area->x2 - area->x1 + 1);
    int32_t row;

    for (row = area->y1; row <= area->y2; ++row) {
        uint16_t *destination =
            &framebuffer[((uint32_t)row * HMI_DISPLAY_WIDTH) +
                         (uint32_t)area->x1];
        memcpy(destination, source, width * sizeof(uint16_t));
        source += width;
    }

    clean_dcache_range(
        &framebuffer[((uint32_t)area->y1 * HMI_DISPLAY_WIDTH) +
                     (uint32_t)area->x1],
        (size_t)((((uint32_t)(area->y2 - area->y1) * HMI_DISPLAY_WIDTH) +
                  width) *
                 sizeof(uint16_t)));
    lv_display_flush_ready(display);
}

static void touch_read(lv_indev_t *indev, lv_indev_data_t *data)
{
    static int32_t last_x;
    static int32_t last_y;
    TS_StateTypeDef touch = {0};

    (void)indev;

    if ((BSP_TS_GetState(&touch) == TS_OK) &&
        (touch.touchDetected > 0U)) {
        last_x = (int32_t)touch.touchX[0];
        last_y = (int32_t)touch.touchY[0];
        data->state = LV_INDEV_STATE_PRESSED;
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }

    data->point.x = last_x;
    data->point.y = last_y;
}

bool board_display_init(void)
{
    lv_display_t *display;
    lv_indev_t *touch;
    void *framebuffer = (void *)LCD_FB_START_ADDRESS;

    if (BSP_LCD_Init() != LCD_OK) {
        return false;
    }

    BSP_LCD_LayerRgb565Init(0U, LCD_FB_START_ADDRESS);
    BSP_LCD_SelectLayer(0U);
    BSP_LCD_SetLayerVisible(0U, ENABLE);
    memset(framebuffer, 0, HMI_FRAMEBUFFER_BYTES);
    clean_dcache_range(framebuffer, HMI_FRAMEBUFFER_BYTES);
    BSP_LCD_DisplayOn();

    if (BSP_TS_Init(HMI_DISPLAY_WIDTH, HMI_DISPLAY_HEIGHT) != TS_OK) {
        return false;
    }

    display = lv_display_create(HMI_DISPLAY_WIDTH, HMI_DISPLAY_HEIGHT);
    if (display == NULL) {
        return false;
    }
    lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
    lv_display_set_flush_cb(display, display_flush);
    lv_display_set_buffers(
        display,
        g_draw_buffer_a,
        g_draw_buffer_b,
        sizeof(g_draw_buffer_a),
        LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_default(display);

    touch = lv_indev_create();
    if (touch == NULL) {
        return false;
    }
    lv_indev_set_type(touch, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(touch, touch_read);
    lv_indev_set_display(touch, display);

    return true;
}
