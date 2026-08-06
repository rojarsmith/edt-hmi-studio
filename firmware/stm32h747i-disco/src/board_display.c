#include "board_display.h"

#include "lvgl.h"
#include "stm32h747i_discovery_lcd.h"
#include "stm32h747i_discovery_ts.h"

#include <stdint.h>
#include <string.h>

#define HMI_LCD_INSTANCE 0U
#define HMI_LCD_LAYER 0U

#define HMI_FRAMEBUFFER_BYTES \
    (HMI_DISPLAY_WIDTH * HMI_DISPLAY_HEIGHT * sizeof(uint16_t))

/*
 * Two full frame buffers in the board's SDRAM. LVGL renders straight into the
 * one the LTDC is not scanning, and they are swapped during vertical blanking,
 * so a frame is never displayed while it is being drawn. Copying rendered bands
 * into the live frame buffer instead tears whenever the copy crosses the raster
 * beam — most visible on a control that redraws continuously, such as a slider
 * being dragged.
 *
 * The addresses match the two layer slots the BSP configuration reserves, which
 * leaves 2 MB per buffer against the 768 KB actually needed.
 */
#define HMI_FRAMEBUFFER_0 ((uint32_t)LCD_LAYER_0_ADDRESS)
#define HMI_FRAMEBUFFER_1 ((uint32_t)LCD_LAYER_1_ADDRESS)

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

    /* Reloading was switched off at init, so this only stages the address. */
    (void)BSP_LCD_SetLayerAddress(
        HMI_LCD_INSTANCE, HMI_LCD_LAYER, (uint32_t)pixel_map);
    (void)BSP_LCD_Reload(HMI_LCD_INSTANCE, BSP_LCD_RELOAD_VERTICAL_BLANKING);

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
    TS_State_t touch = {0};

    (void)indev;

    if ((BSP_TS_GetState(HMI_LCD_INSTANCE, &touch) == BSP_ERROR_NONE) &&
        (touch.TouchDetected > 0U)) {
        last_x = (int32_t)touch.TouchX;
        last_y = (int32_t)touch.TouchY;
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
    lv_indev_t *touch_device;
    TS_Init_t touch_init = {0};

    /* InitEx rather than Init: the plain entry point defaults to RGB888, and a
       16-bit frame buffer halves both the SDRAM footprint and the bandwidth the
       LTDC needs per frame. It brings up the SDRAM controller itself. */
    if (BSP_LCD_InitEx(
            HMI_LCD_INSTANCE,
            LCD_ORIENTATION_LANDSCAPE,
            LCD_PIXEL_FORMAT_RGB565,
            HMI_DISPLAY_WIDTH,
            HMI_DISPLAY_HEIGHT) != BSP_ERROR_NONE) {
        return false;
    }

    /* Clear both buffers before the layer goes live, otherwise the LTDC scans
       out whatever the SDRAM powered up with — a burst of noise on every reset. */
    memset((void *)HMI_FRAMEBUFFER_0, 0, HMI_FRAMEBUFFER_BYTES);
    memset((void *)HMI_FRAMEBUFFER_1, 0, HMI_FRAMEBUFFER_BYTES);
    clean_dcache_range((void *)HMI_FRAMEBUFFER_0, HMI_FRAMEBUFFER_BYTES);
    clean_dcache_range((void *)HMI_FRAMEBUFFER_1, HMI_FRAMEBUFFER_BYTES);

    (void)BSP_LCD_SetLayerAddress(
        HMI_LCD_INSTANCE, HMI_LCD_LAYER, HMI_FRAMEBUFFER_0);
    (void)BSP_LCD_SetLayerVisible(HMI_LCD_INSTANCE, HMI_LCD_LAYER, ENABLE);
    (void)BSP_LCD_DisplayOn(HMI_LCD_INSTANCE);

    /* From here on every layer-address write is staged and committed by
       display_flush during vertical blanking. */
    (void)BSP_LCD_Reload(HMI_LCD_INSTANCE, BSP_LCD_RELOAD_NONE);

    /*
     * The FT6X06 on this panel already reports landscape coordinates: its X
     * spans the 800-pixel axis and its Y the 480-pixel one, matching the
     * display. Asking the BSP to swap them feeds the 0..800 raw X into the
     * 480-tall Y axis, so anything pressed right of x=480 maps off-screen and
     * appears to do nothing at all.
     */
    touch_init.Width = HMI_DISPLAY_WIDTH;
    touch_init.Height = HMI_DISPLAY_HEIGHT;
    touch_init.Orientation = TS_SWAP_NONE;
    touch_init.Accuracy = 5U;
    if (BSP_TS_Init(HMI_LCD_INSTANCE, &touch_init) != BSP_ERROR_NONE) {
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

    touch_device = lv_indev_create();
    if (touch_device == NULL) {
        return false;
    }
    lv_indev_set_type(touch_device, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(touch_device, touch_read);
    lv_indev_set_display(touch_device, display);

    return true;
}
