#include "board_display.h"

#include "lvgl.h"
#include "stm32h747i_discovery_lcd.h"
#include "stm32h747i_discovery_ts.h"

#include <stdint.h>
#include <string.h>

#define HMI_LCD_INSTANCE 0U
#define HMI_LCD_LAYER 0U

#define HMI_FRAMEBUFFER_BYTES \
    (HMI_DISPLAY_WIDTH * HMI_DISPLAY_HEIGHT * sizeof(uint32_t))

/*
 * Two full frame buffers in the board's SDRAM. LVGL renders straight into the
 * one the LTDC is not scanning, and they are swapped during vertical blanking,
 * so a frame is never displayed while it is being drawn. Copying rendered bands
 * into the live frame buffer instead tears whenever the copy crosses the raster
 * beam — most visible on a control that redraws continuously, such as a slider
 * being dragged.
 *
 * The addresses match the two layer slots the BSP configuration reserves: 2 MB
 * apart, against the 1500 KB an ARGB8888 frame needs. The margin is why moving
 * from RGB565 to ARGB8888 did not require relocating anything.
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

/*
 * Bring-up aid for a new panel. Touch orientation and scaling cannot be worked
 * out by reasoning about the datasheet — the controller's native axes, the
 * panel's rotation and the BSP's own transform all compound. Recording what
 * actually arrives lets a debugger read the mapping off the running board:
 * touch the four corners, then dump board_touch_log with
 *
 *   x/12dw &board_touch_log
 *
 * `min`/`max` bound the reachable range (they should approach 0 and the panel
 * size), and `recent` holds the last four points in the order they were seen.
 */
typedef struct {
    int32_t presses;
    int32_t min_x;
    int32_t max_x;
    int32_t min_y;
    int32_t max_y;
    int32_t recent[4][2];
} board_touch_log_t;

board_touch_log_t board_touch_log = {
    .min_x = INT32_MAX,
    .max_x = INT32_MIN,
    .min_y = INT32_MAX,
    .max_y = INT32_MIN,
};

static void record_touch(int32_t x, int32_t y)
{
    board_touch_log_t *log = &board_touch_log;

    if (x < log->min_x) log->min_x = x;
    if (x > log->max_x) log->max_x = x;
    if (y < log->min_y) log->min_y = y;
    if (y > log->max_y) log->max_y = y;

    log->recent[(uint32_t)log->presses & 3U][0] = x;
    log->recent[(uint32_t)log->presses & 3U][1] = y;
    log->presses++;
}

static void touch_read(lv_indev_t *indev, lv_indev_data_t *data)
{
    static int32_t last_x;
    static int32_t last_y;
    static bool was_pressed;
    TS_State_t touch = {0};

    (void)indev;

    if ((BSP_TS_GetState(HMI_LCD_INSTANCE, &touch) == BSP_ERROR_NONE) &&
        (touch.TouchDetected > 0U)) {
        last_x = (int32_t)touch.TouchX;
        last_y = (int32_t)touch.TouchY;
        /* One entry per press, not per poll, so the log stays readable. */
        if (!was_pressed) {
            record_touch(last_x, last_y);
            was_pressed = true;
        }
        data->state = LV_INDEV_STATE_PRESSED;
    } else {
        was_pressed = false;
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

    /* LCD_PIXEL_FORMAT_RGB888 is the BSP's name for a 24-bit DSI link driven
       from a 32-bit frame buffer: it configures the LTDC layer as
       LTDC_PIXEL_FORMAT_ARGB8888 and sets BppFactor to 4. There is no packed
       24 bpp path here, so this doubles both the SDRAM footprint and the
       bandwidth the LTDC needs per frame against RGB565. See
       docs/color-depth.md for the measurements.

       InitEx rather than Init because it takes the width and height; it brings
       up the SDRAM controller itself. */
    if (BSP_LCD_InitEx(
            HMI_LCD_INSTANCE,
            LCD_ORIENTATION_LANDSCAPE,
            LCD_PIXEL_FORMAT_RGB888,
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
     * Measured on the board by touching all four corners and reading
     * board_touch_log: the FT6X06 reports the panel's native *portrait* frame,
     * X spanning 0..480 and Y spanning 0..800. Both transforms are needed —
     * TS_SWAP_XY to put the 800-wide axis on screen X, and TS_SWAP_Y because
     * the remaining axis then runs bottom-to-top.
     *
     * Width/Height stay 800x480 and are matched by FT6X06_MAX_X/Y_LENGTH in
     * ft6x06_conf.h. Those look transposed against the raw ranges above, and
     * must: the BSP scales with Width/MaxX *after* swapping, so MaxX has to
     * describe the axis that ends up on X. Changing them to "match" the sensor
     * breaks the scaling.
     *
     * Getting only one of the two flags right fails in a way that hides the
     * other: with TS_SWAP_Y alone, `MaxY - rawY - 1` underflows for every
     * rawY > 479, and the unsigned result comes back as roughly 8947848 - k.
     * Those huge values in the log are the fingerprint of a missing TS_SWAP_XY.
     */
    touch_init.Width = HMI_DISPLAY_WIDTH;
    touch_init.Height = HMI_DISPLAY_HEIGHT;
    touch_init.Orientation = TS_SWAP_XY | TS_SWAP_Y;
    touch_init.Accuracy = 5U;
    if (BSP_TS_Init(HMI_LCD_INSTANCE, &touch_init) != BSP_ERROR_NONE) {
        return false;
    }

    display = lv_display_create(HMI_DISPLAY_WIDTH, HMI_DISPLAY_HEIGHT);
    if (display == NULL) {
        return false;
    }
    /* ARGB8888, not the XRGB8888 that LV_COLOR_DEPTH 32 makes LVGL's native
       format. The BSP configures both LTDC blending factors as PAxCA, so the
       per-pixel alpha byte is multiplied into the output rather than ignored,
       and XRGB8888 leaves that byte undefined by contract. A draw path that
       leaves it at zero would produce fully transparent pixels showing the
       layer's black backcolor — a failure a build cannot catch. */
    lv_display_set_color_format(display, LV_COLOR_FORMAT_ARGB8888);
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
