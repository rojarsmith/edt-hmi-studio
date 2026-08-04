#include "board_display.h"

#include "lvgl.h"
#include "stm32746g_discovery_lcd.h"
#include "stm32746g_discovery_ts.h"

#include <stdint.h>
#include <string.h>

#define HMI_FRAMEBUFFER_BYTES \
    (HMI_DISPLAY_WIDTH * HMI_DISPLAY_HEIGHT * sizeof(uint16_t))

/*
 * Two full frame buffers in SDRAM. LVGL renders straight into the one the LTDC
 * is not scanning, and they are swapped during vertical blanking, so a frame is
 * never displayed while it is being drawn. The previous single-buffer driver
 * copied each rendered band into the live frame buffer, which tore whenever the
 * copy crossed the raster beam — most visible on a control that redraws
 * continuously, such as a slider being dragged.
 */
#define HMI_FRAMEBUFFER_0 ((uint32_t)LCD_FB_START_ADDRESS)
#define HMI_FRAMEBUFFER_1 (HMI_FRAMEBUFFER_0 + (uint32_t)HMI_FRAMEBUFFER_BYTES)

/* A frame is ~16 ms; well beyond that means the LTDC is not scanning and we
   must not block the main loop, which also drives Modbus. */
#define HMI_RELOAD_TIMEOUT_MS 100U

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
    uint32_t started_ms;

    (void)area;

    /* In direct mode LVGL reports every rendered area but the buffer only
       becomes displayable once the last one is in. */
    if (!lv_display_flush_is_last(display)) {
        lv_display_flush_ready(display);
        return;
    }

    /* LVGL drew through the D-Cache; the LTDC reads SDRAM directly. */
    clean_dcache_range(pixel_map, HMI_FRAMEBUFFER_BYTES);

    LTDC_Layer1->CFBAR = (uint32_t)pixel_map;
    LTDC->SRCR = LTDC_SRCR_VBR;

    /* Hold the buffer until the swap has actually happened, otherwise LVGL
       would start drawing into the frame still being scanned out. */
    started_ms = HAL_GetTick();
    while ((LTDC->SRCR & LTDC_SRCR_VBR) != 0U) {
        if ((HAL_GetTick() - started_ms) > HMI_RELOAD_TIMEOUT_MS) {
            break;
        }
    }

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
    void *framebuffers = (void *)HMI_FRAMEBUFFER_0;

    if (BSP_LCD_Init() != LCD_OK) {
        return false;
    }

    BSP_LCD_LayerRgb565Init(0U, HMI_FRAMEBUFFER_0);
    BSP_LCD_SelectLayer(0U);

    /* Clear both buffers before the layer goes live, otherwise the LTDC scans
       out whatever the SDRAM powered up with — a burst of noise on every reset. */
    memset(framebuffers, 0, HMI_FRAMEBUFFER_BYTES * 2U);
    clean_dcache_range(framebuffers, HMI_FRAMEBUFFER_BYTES * 2U);

    BSP_LCD_SetLayerVisible(0U, ENABLE);
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
        (void *)HMI_FRAMEBUFFER_0,
        (void *)HMI_FRAMEBUFFER_1,
        HMI_FRAMEBUFFER_BYTES,
        LV_DISPLAY_RENDER_MODE_DIRECT);
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
