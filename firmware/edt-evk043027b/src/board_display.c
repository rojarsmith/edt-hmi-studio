#include "board_display.h"

#include "board.h"
#include "edt_bsp_ctp.h"
#include "lvgl.h"
#include "main.h"

#include <stdint.h>
#include <string.h>

LTDC_HandleTypeDef hltdc;

/*
 * Set by HAL_LTDC_MspInit, which is a void callback and so has no other way to
 * report that it could not bring up PLL3 or the LTDC clock. Checked by
 * ltdc_init before it trusts anything HAL_LTDC_Init returned.
 */
static bool ltdc_clock_ready;

/*
 * Defined at the bottom of this file. Declared here because the HAL has no
 * prototype for it — it is a CubeMX convention, not a HAL callback, so without
 * this the call in backlight_init would not even be a compile error under C's
 * implicit-declaration rules on older standards.
 */
void HAL_TIM_MspPostInit(TIM_HandleTypeDef *timer);

#define HMI_LCD_LAYER 0U

#define HMI_FRAMEBUFFER_BYTES \
    (HMI_DISPLAY_WIDTH * HMI_DISPLAY_HEIGHT * HMI_DISPLAY_BYTES_PER_PIXEL)

/*
 * Two full frame buffers at the bottom of SRAM1. LVGL renders straight into the
 * one the LTDC is not scanning, and they are swapped during vertical blanking,
 * so a frame is never displayed while it is being drawn. Copying rendered bands
 * into the live frame buffer instead tears whenever the copy crosses the raster
 * beam — most visible on a control that redraws continuously, such as a slider
 * being dragged.
 *
 * These addresses are the FRAMEBUFFER region in STM32U599NJHXQ_FLASH.ld, which
 * reserves exactly this much and starts the application's RAM after it. The two
 * have to agree: overlap here is a frame buffer quietly scribbling over .bss.
 *
 * 480 x 272 x 4 = 510 KB each at ARGB8888. Unlike the H747I there is no external
 * SDRAM on this board and none is needed — the part carries 2496 KB of
 * contiguous SRAM, of which these two take 1020 KB.
 */
#define HMI_FRAMEBUFFER_0 0x20000000U
#define HMI_FRAMEBUFFER_1 (HMI_FRAMEBUFFER_0 + HMI_FRAMEBUFFER_BYTES)

/*
 * Portrait cannot use the direct mode above, and the reason is worth stating
 * because getting it wrong is silent. The ET043027 is a parallel RGB panel: no
 * MADCTL, no scan-direction register, and neither the LTDC nor DMA2D rotates.
 * That leaves LVGL's software rotation, which only runs in *partial* render
 * mode — set on a direct-mode display, lv_refr.c sizes the layer to the rotated
 * resolution while the LTDC goes on scanning the buffer 480 pixels wide, with
 * no warning and a sheared picture as the result. See
 * docs/display-orientation.md §8.2.
 *
 * So portrait renders into these instead, and display_flush turns each band on
 * its way to the frame buffer. One tenth of the logical screen each, which is
 * LVGL's own guidance: 272 x 48 x 4 = 51 KB, and LVGL derives exactly those 48
 * rows back out of the byte count (get_max_row, lv_refr.c). Two of them so the
 * next band can be drawn while this one is being rotated out.
 *
 * They cost the same 102 KB in landscape, where nothing reads them. That is
 * affordable and measured: the map file puts 437 KB free after the 1 MB LVGL
 * heap, against an 8 KB stack. Static rather than carved out at run time so
 * the linker accounts for them and a build that no longer fits says so.
 */
#define HMI_PARTIAL_LINES 48U
#define HMI_PARTIAL_BYTES \
    (HMI_DISPLAY_HEIGHT * HMI_PARTIAL_LINES * HMI_DISPLAY_BYTES_PER_PIXEL)

static uint8_t partial_buffer_0[HMI_PARTIAL_BYTES] __attribute__((aligned(4)));
static uint8_t partial_buffer_1[HMI_PARTIAL_BYTES] __attribute__((aligned(4)));

/*
 * Portrait only. Which frame buffer the LTDC is scanning, and which one the
 * rotated output is going into — the same alternation direct mode gets for
 * free, kept by hand because partial mode does not manage frame buffers.
 */
static uint32_t fb_scanning = HMI_FRAMEBUFFER_0;
static uint32_t fb_drawing = HMI_FRAMEBUFFER_1;

/*
 * Panel-space bounding box of everything rotated into fb_drawing since the last
 * swap. Partial mode redraws only what changed, so after a swap the buffer LVGL
 * is about to draw into holds the frame before last; copying this box across
 * brings it back up to date. Without it, every second frame shows the one
 * before it wherever nothing was invalidated.
 */
static lv_area_t dirty_area;
static bool dirty_valid;

/* A frame is ~16 ms; well beyond that means the LTDC is not scanning and we
   must not block the main loop, which also drives Modbus. */
#define HMI_RELOAD_TIMEOUT_MS 100U

/* Vertical total, from the panel timings below. Named because ltdc_is_configured
   reads it back to prove the controller is clocked. */
#define HMI_LTDC_TOTAL_HEIGHT 291U

/*
 * Bring-up aid, off by default: paints colour bars straight into the frame
 * buffer, sweeps the backlight, and holds both for this many milliseconds
 * before LVGL takes over. Enable it by building with, say,
 * -DHMI_DISPLAY_BRINGUP_PATTERN_MS=10000.
 *
 * It stays here because it is the one test that separates the two halves of the
 * display path, and the next panel in this family will need it. Bars appear =>
 * LTDC, panel, backlight and the supply rail all work, and anything still wrong
 * is LVGL or the flush callback. No bars => the fault is below LVGL, and
 * nothing about the UI is worth looking at yet. Wrong colours or bars in the
 * wrong order => the pixel format is mismatched somewhere in the four places
 * docs/color-depth.md lists.
 */
#ifndef HMI_DISPLAY_BRINGUP_PATTERN_MS
#define HMI_DISPLAY_BRINGUP_PATTERN_MS 0U
#endif

/* Backlight PWM: TIM3 at 160 MHz / 2500 / 200 = 320 Hz, well above anything the
   eye or a camera picks up, with 200 steps of duty. */
#define HMI_BACKLIGHT_PRESCALER 2499U
#define HMI_BACKLIGHT_PERIOD 199U

/*
 * Geometry accessors the vendored touch driver calls while mapping a reading
 * onto the panel. In the vendor package these live in edt_bsp_lcd.c together
 * with a FreeRTOS idle-blanking task; see include/main.h for why that file is
 * not vendored.
 */
uint32_t EDT_LCD_GetXSize(void)
{
    return HMI_DISPLAY_WIDTH;
}

uint32_t EDT_LCD_GetYSize(void)
{
    return HMI_DISPLAY_HEIGHT;
}

/*
 * The same file's idle-blanking flags. EDT_TS_GetState reads and clears the
 * "did the panel blank itself" flag on every touch so the first tap after a
 * blank only wakes the display instead of also reaching the UI. Nothing blanks
 * the panel here, so the flag is always false and every touch reaches LVGL.
 */
bool EDT_Sleep_GetDetected(void)
{
    return false;
}

void EDT_Sleep_SetDetected(bool detected)
{
    (void)detected;
}

/** Stage a frame buffer address and hold until the LTDC has actually taken it. */
static void present(uint32_t framebuffer)
{
    uint32_t started_ms;

    /* Reloading was switched off at init, so this only stages the address. */
    (void)HAL_LTDC_SetAddress_NoReload(&hltdc, framebuffer, HMI_LCD_LAYER);
    (void)HAL_LTDC_Reload(&hltdc, LTDC_RELOAD_VERTICAL_BLANKING);

    /* Hold the buffer until the swap has actually happened, otherwise LVGL
       would start drawing into the frame still being scanned out. */
    started_ms = HAL_GetTick();
    while ((LTDC->SRCR & LTDC_SRCR_VBR) != 0U) {
        if ((HAL_GetTick() - started_ms) > HMI_RELOAD_TIMEOUT_MS) {
            break;
        }
    }
}

/** One rectangle, copied between the two frame buffers. Panel coordinates. */
static void copy_between_framebuffers(
    uint32_t from,
    uint32_t to,
    const lv_area_t *area)
{
    const uint32_t stride = HMI_DISPLAY_WIDTH * HMI_DISPLAY_BYTES_PER_PIXEL;
    const uint32_t offset = (stride * (uint32_t)area->y1)
        + (HMI_DISPLAY_BYTES_PER_PIXEL * (uint32_t)area->x1);
    const uint32_t row_bytes =
        (uint32_t)lv_area_get_width(area) * HMI_DISPLAY_BYTES_PER_PIXEL;
    const uint8_t *source = (const uint8_t *)from + offset;
    uint8_t *destination = (uint8_t *)to + offset;
    int32_t rows = lv_area_get_height(area);
    int32_t row;

    /* DMA2D is fitted and could do this without the CPU. Left as a straight
       copy so the cost shows up in a measurement before it is optimised away —
       see docs/display-orientation.md §8.5. */
    for (row = 0; row < rows; row++) {
        (void)memcpy(destination, source, row_bytes);
        source += stride;
        destination += stride;
    }
}

/**
 * Portrait: turn one rendered band into the frame buffer the LTDC is not
 * scanning, and swap once the last band of the refresh is in.
 */
static void display_flush_rotated(
    lv_display_t *display,
    const lv_area_t *area,
    uint8_t *pixel_map)
{
    const uint32_t stride = HMI_DISPLAY_WIDTH * HMI_DISPLAY_BYTES_PER_PIXEL;
    const int32_t width = lv_area_get_width(area);
    const int32_t height = lv_area_get_height(area);
    lv_area_t panel = *area;
    uint8_t *first_pixel;

    /* LVGL hands out areas in the rotated frame the UI is laid out in; the
       frame buffer is the panel's. This is the one conversion between them. */
    lv_display_rotate_area(display, &panel);
    first_pixel = (uint8_t *)fb_drawing
        + (stride * (uint32_t)panel.y1)
        + (HMI_DISPLAY_BYTES_PER_PIXEL * (uint32_t)panel.x1);

    lv_draw_sw_rotate(
        pixel_map,
        first_pixel,
        width,
        height,
        width * (int32_t)HMI_DISPLAY_BYTES_PER_PIXEL,
        (int32_t)stride,
        LV_DISPLAY_ROTATION_90,
        LV_COLOR_FORMAT_ARGB8888);

    if (dirty_valid) {
        if (panel.x1 < dirty_area.x1) dirty_area.x1 = panel.x1;
        if (panel.y1 < dirty_area.y1) dirty_area.y1 = panel.y1;
        if (panel.x2 > dirty_area.x2) dirty_area.x2 = panel.x2;
        if (panel.y2 > dirty_area.y2) dirty_area.y2 = panel.y2;
    } else {
        dirty_area = panel;
        dirty_valid = true;
    }

    /* More bands of this refresh still to come; the frame is not showable. */
    if (!lv_display_flush_is_last(display)) {
        lv_display_flush_ready(display);
        return;
    }

    present(fb_drawing);

    {
        const uint32_t previous = fb_scanning;
        fb_scanning = fb_drawing;
        fb_drawing = previous;
    }

    if (dirty_valid) {
        copy_between_framebuffers(fb_scanning, fb_drawing, &dirty_area);
        dirty_valid = false;
    }

    lv_display_flush_ready(display);
}

static void display_flush(
    lv_display_t *display,
    const lv_area_t *area,
    uint8_t *pixel_map)
{
    if (lv_display_get_rotation(display) != LV_DISPLAY_ROTATION_0) {
        display_flush_rotated(display, area, pixel_map);
        return;
    }

    (void)area;

    /* In direct mode LVGL reports every rendered area but the buffer only
       becomes displayable once the last one is in. */
    if (!lv_display_flush_is_last(display)) {
        lv_display_flush_ready(display);
        return;
    }

    /* No cache maintenance: the Cortex-M33 in this part has no data cache, and
       DCACHE1 covers the external memories rather than SRAM. The LTDC therefore
       sees what LVGL wrote as soon as it is written. */

    /* In direct mode LVGL rendered straight into a frame buffer, so the buffer
       to show is the one it handed back. */
    present((uint32_t)pixel_map);

    lv_display_flush_ready(display);
}

/*
 * Bring-up aid for a new panel. Touch orientation and scaling cannot be worked
 * out by reasoning about the datasheet — the controller's native axes, the
 * panel's rotation and the driver's own transform all compound. Recording what
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

/*
 * Whether the maXTouch answers on the bus at all.
 *
 * This gate exists because the vendored driver is not safe to poll blind.
 * MXT336U_Read_Multi_Buf uses a 1000 ms timeout on both its transmit and its
 * receive, LVGL polls the input device roughly every 30 ms, and a failed read
 * additionally tears the I2C down and re-initialises it. A controller that is
 * absent or held in reset therefore does not degrade touch — it stalls the
 * whole HMI loop for seconds at a time, which shows up as the heartbeat
 * stuttering from 1 Hz to once every several seconds.
 *
 * Two tries at 50 ms is far below anything the driver itself would wait, and
 * either the part ACKs its address or it does not.
 */
static bool touch_is_present(void)
{
    return HAL_I2C_IsDeviceReady(
        &hi2c2, MXT336U_I2C_SLAVE_ADDRESS, 2U, 50U) == HAL_OK;
}

static void touch_read(lv_indev_t *indev, lv_indev_data_t *data)
{
    static int32_t last_x;
    static int32_t last_y;
    static bool was_pressed;
    TS_StateTypeDef touch = {0};

    (void)indev;

    if ((EDT_TS_GetState(&touch) == TS_OK) && (touch.touchDetected > 0U)) {
        /*
         * The vendor driver maps a reading onto the panel's own landscape
         * frame, and is left doing exactly that in both orientations — it is
         * vendored code, and EDT_LCD_GetXSize/GetYSize below still answer with
         * the panel. The rotation is undone here instead.
         *
         * LVGL does not rotate input at all: lv_indev.c has no notion of
         * display rotation, so a driver on a turned display must hand it
         * already-turned coordinates. This is the inverse of what
         * lv_display_rotate_area does to an area for ROTATION_90 — that maps
         * logical to panel as (x, y) -> (y, ver_res - x - 1), so panel to
         * logical is (x, y) -> (ver_res - y - 1, x).
         */
        if (lv_display_get_rotation(lv_display_get_default())
                != LV_DISPLAY_ROTATION_0) {
            last_x = (int32_t)HMI_DISPLAY_HEIGHT - 1 - (int32_t)touch.touchY[0];
            last_y = (int32_t)touch.touchX[0];
        } else {
            last_x = (int32_t)touch.touchX[0];
            last_y = (int32_t)touch.touchY[0];
        }
        /* One entry per press, not per poll, so the log stays readable. The
           *raw* reading, deliberately: the log exists to work out the mapping,
           and recording what the transform above already produced would hide
           the very thing being checked. */
        if (!was_pressed) {
            record_touch((int32_t)touch.touchX[0], (int32_t)touch.touchY[0]);
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

/*
 * ET043027 panel timings, from the vendor package's MX_LTDC_Init.
 *
 * The HAL wants these accumulated rather than as separate porches: HSync 4,
 * HBP 40, active 480, HFP 8 gives TotalWidth 531 with everything counted from
 * zero. Same for the vertical side: VSync 4, VBP 8, active 272, VFP 8.
 *
 * At 531 x 291 = 154,521 pixel clocks a frame, the 9.33 MHz PLL3 output below
 * refreshes the panel at 60 Hz.
 */
/*
 * Confirms the LTDC actually took the configuration, by reading back registers
 * we just wrote.
 *
 * The HAL does not do this. HAL_LTDC_Init and HAL_LTDC_ConfigLayer write and
 * return HAL_OK without checking anything, so with the peripheral clock off
 * every write lands in the void and both report success — which is
 * indistinguishable, from the firmware's side, from a working display. Reading
 * a value back is the only way to tell, and it costs four register reads once
 * at start-up.
 */
static bool ltdc_is_configured(void)
{
    if ((LTDC->GCR & LTDC_GCR_LTDCEN) == 0U) {
        return false;
    }
    /* Something we wrote, and which is never zero on a configured controller.
       A discarded write reads back as 0. */
    if ((LTDC->TWCR & LTDC_TWCR_TOTALH) != HMI_LTDC_TOTAL_HEIGHT) {
        return false;
    }
    if ((LTDC_LAYER(&hltdc, HMI_LCD_LAYER)->CR & LTDC_LxCR_LEN) == 0U) {
        return false;
    }
    return LTDC_LAYER(&hltdc, HMI_LCD_LAYER)->CFBAR == HMI_FRAMEBUFFER_0;
}

/*
 * Confirms the raster is actually moving.
 *
 * Everything ltdc_is_configured reads lives on the LTDC's *bus* clock, and that
 * is a different clock from the pixel clock PLL3 feeds. With PLL3 stopped the
 * controller still accepts and returns every register write, the layer still
 * reads as enabled, and CFBAR still points at the frame buffer — while the
 * panel is sent no DCLK, no HSYNC and no DE at all. The two states are
 * identical from the register side and completely different on the connector,
 * which is exactly the failure that hides behind "configured fine, screen
 * black".
 *
 * CPSR is the raster's current position and only advances while the pixel clock
 * runs, so watching it change is the one direct test.
 */
static bool ltdc_is_scanning(void)
{
    uint32_t first;
    uint32_t started_ms;

    /* Necessary but not sufficient — the mux from PLL3R to the LTDC could
       still be wrong — so this only sharpens the report, it does not replace
       the check below. */
    if ((RCC->CR & RCC_CR_PLL3RDY) == 0U) {
        return false;
    }

    first = LTDC->CPSR;
    started_ms = HAL_GetTick();
    /* One frame is ~16 ms at 60 Hz; 50 ms is three of them. */
    while ((HAL_GetTick() - started_ms) < 50U) {
        if (LTDC->CPSR != first) {
            return true;
        }
    }
    return false;
}

static bool ltdc_init(void)
{
    LTDC_LayerCfgTypeDef layer = {0};

    ltdc_clock_ready = false;

    hltdc.Instance = LTDC;
    hltdc.Init.HSPolarity = LTDC_HSPOLARITY_AL;
    hltdc.Init.VSPolarity = LTDC_VSPOLARITY_AL;
    hltdc.Init.DEPolarity = LTDC_DEPOLARITY_AL;
    hltdc.Init.PCPolarity = LTDC_PCPOLARITY_IPC;
    hltdc.Init.HorizontalSync = 3U;
    hltdc.Init.VerticalSync = 3U;
    hltdc.Init.AccumulatedHBP = 43U;
    hltdc.Init.AccumulatedVBP = 11U;
    hltdc.Init.AccumulatedActiveW = 523U;
    hltdc.Init.AccumulatedActiveH = 283U;
    hltdc.Init.TotalWidth = 531U;
    hltdc.Init.TotalHeigh = HMI_LTDC_TOTAL_HEIGHT;
    hltdc.Init.Backcolor.Red = 0U;
    hltdc.Init.Backcolor.Green = 0U;
    hltdc.Init.Backcolor.Blue = 0U;

    if (HAL_LTDC_Init(&hltdc) != HAL_OK) {
        return false;
    }
    /* HAL_LTDC_Init reports success whether or not MspInit could clock the
       peripheral, so the flag it set is the real result of the call. */
    if (!ltdc_clock_ready) {
        return false;
    }
    board_init_stage = BOARD_STAGE_LTDC_CLOCK;

    layer.WindowX0 = 0U;
    layer.WindowX1 = HMI_DISPLAY_WIDTH;
    layer.WindowY0 = 0U;
    layer.WindowY1 = HMI_DISPLAY_HEIGHT;
    /* 32 bpp, matching LV_COLOR_DEPTH 32 in lv_conf.h and
       LV_COLOR_FORMAT_ARGB8888 below. All three have to agree; a mismatch shows
       as a picture that is the right shape but the wrong colour and skewed by a
       fraction of a pixel per line. */
    layer.PixelFormat = LTDC_PIXEL_FORMAT_ARGB8888;
    layer.Alpha = 255U;
    layer.Alpha0 = 0U;
    /* Constant alpha on both factors, not per-pixel. With Alpha at 255 this
       makes BF1 = 1 and BF2 = 0, so the layer is opaque and the per-pixel alpha
       byte is ignored — which is why the H747I's warning about XRGB8888
       leaving that byte undefined does not bite here. LVGL is still told
       ARGB8888 rather than XRGB8888 so the byte is defined either way. */
    layer.BlendingFactor1 = LTDC_BLENDING_FACTOR1_CA;
    layer.BlendingFactor2 = LTDC_BLENDING_FACTOR2_CA;
    layer.FBStartAdress = HMI_FRAMEBUFFER_0;
    layer.ImageWidth = HMI_DISPLAY_WIDTH;
    layer.ImageHeight = HMI_DISPLAY_HEIGHT;
    layer.Backcolor.Red = 0U;
    layer.Backcolor.Green = 0U;
    layer.Backcolor.Blue = 0U;

    if (HAL_LTDC_ConfigLayer(&hltdc, &layer, HMI_LCD_LAYER) != HAL_OK) {
        return false;
    }

    /* Only now is it safe to believe any of the above. */
    if (!ltdc_is_configured()) {
        return false;
    }
    board_init_stage = BOARD_STAGE_LTDC_CONFIG;

    if (!ltdc_is_scanning()) {
        return false;
    }
    board_init_stage = BOARD_STAGE_LTDC;
    return true;
}

static bool backlight_init(void)
{
    TIM_OC_InitTypeDef channel = {0};

    htim3.Instance = TIM3;
    htim3.Init.Prescaler = HMI_BACKLIGHT_PRESCALER;
    htim3.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim3.Init.Period = HMI_BACKLIGHT_PERIOD;
    htim3.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim3.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;

    if (HAL_TIM_PWM_Init(&htim3) != HAL_OK) {
        return false;
    }

    channel.OCMode = TIM_OCMODE_PWM1;
    channel.Pulse = 0U;
    channel.OCPolarity = TIM_OCPOLARITY_HIGH;
    channel.OCFastMode = TIM_OCFAST_DISABLE;
    if (HAL_TIM_PWM_ConfigChannel(
            &htim3, &channel, TIM_CHANNEL_3) != HAL_OK) {
        return false;
    }

    /*
     * Nothing in the HAL calls HAL_TIM_MspPostInit — it is a CubeMX convention,
     * invoked by the generated MX_TIM3_Init, and the split exists because the
     * timer's *pins* must not go to alternate function until the channel has an
     * output level to drive. Leave this call out and PE5 stays in its reset
     * state: the backlight driver receives no PWM and the panel is simply dark,
     * with LVGL and the LTDC running correctly behind it and nothing reporting
     * an error anywhere.
     */
    HAL_TIM_MspPostInit(&htim3);

    return HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_3) == HAL_OK;
}

void board_display_set_backlight(uint8_t percent)
{
    uint32_t duty = (percent > 100U) ? 100U : percent;

    __HAL_TIM_SET_COMPARE(
        &htim3,
        TIM_CHANNEL_3,
        (duty * (HMI_BACKLIGHT_PERIOD + 1U)) / 100U);
}

/*
 * The panel's own enable lines, both on port H. LCD_RESET is the panel reset;
 * LCD_CTRL gates its supply. Held low from reset, released here once the LTDC
 * is already scanning a cleared frame buffer, so the first thing the panel ever
 * shows is black rather than whatever the SRAM powered up with.
 */
static void panel_power_init(void)
{
    GPIO_InitTypeDef gpio = {0};

    __HAL_RCC_GPIOH_CLK_ENABLE();
    __HAL_RCC_GPIOI_CLK_ENABLE();

    /*
     * The board's switched supply rail, enabled high, with over-current
     * feedback on PI14 that nothing here reads. The vendor's MX_GPIO_Init
     * asserts it unconditionally before touching the panel and this matches
     * that; leaving it alone leaves whatever hangs off the switch unpowered.
     */
    HAL_GPIO_WritePin(FS_PW_SW_GPIO_Port, FS_PW_SW_Pin, GPIO_PIN_SET);
    gpio.Pin = FS_PW_SW_Pin;
    gpio.Mode = GPIO_MODE_OUTPUT_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(FS_PW_SW_GPIO_Port, &gpio);

    HAL_GPIO_WritePin(
        GPIOH, LCD_RESET_Pin | LCD_CTRL_Pin, GPIO_PIN_RESET);

    gpio.Pin = LCD_RESET_Pin | LCD_CTRL_Pin;
    gpio.Mode = GPIO_MODE_OUTPUT_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOH, &gpio);

    /*
     * The touch controller's reset. Driven low first and then released, rather
     * than simply parked high: on a warm reset the part is already running and
     * would otherwise never be reset at all, and the maXTouch needs its
     * configuration re-read from a known state before it answers reliably.
     */
    HAL_GPIO_WritePin(CTP_RST_GPIO_Port, CTP_RST_Pin, GPIO_PIN_RESET);
    gpio.Pin = CTP_RST_Pin;
    gpio.Mode = GPIO_MODE_OUTPUT_PP;
    gpio.Pull = GPIO_PULLDOWN;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(CTP_RST_GPIO_Port, &gpio);
    HAL_Delay(10U);
    HAL_GPIO_WritePin(CTP_RST_GPIO_Port, CTP_RST_Pin, GPIO_PIN_SET);
    /* Datasheet start-up time before the controller will ACK its address. */
    HAL_Delay(100U);
}

static void panel_power_on(void)
{
    HAL_GPIO_WritePin(LCD_CTRL_GPIO_Port, LCD_CTRL_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(LCD_RESET_GPIO_Port, LCD_RESET_Pin, GPIO_PIN_SET);
}

#if HMI_DISPLAY_BRINGUP_PATTERN_MS > 0U
/*
 * Four vertical bars, written as ARGB8888 words straight into the frame buffer
 * the LTDC is scanning. Deliberately not drawn through LVGL — the point is to
 * exercise everything below it and nothing above.
 */
static void fill_bringup_pattern(uint32_t framebuffer)
{
    static const uint32_t bars[4] = {
        0xFFFF0000U, /* red */
        0xFF00FF00U, /* green */
        0xFF0000FFU, /* blue */
        0xFFFFFFFFU, /* white */
    };
    uint32_t *pixels = (uint32_t *)framebuffer;

    for (uint32_t y = 0U; y < HMI_DISPLAY_HEIGHT; y++) {
        for (uint32_t x = 0U; x < HMI_DISPLAY_WIDTH; x++) {
            pixels[(y * HMI_DISPLAY_WIDTH) + x] =
                bars[(x * 4U) / HMI_DISPLAY_WIDTH];
        }
    }
}

/*
 * Ramps the backlight up and down a few times before the pattern is held.
 *
 * A backlit panel showing black and an unlit panel look nearly the same across
 * a room, which is the ambiguity that makes "no picture" so hard to act on. A
 * panel that visibly pulses does not: if anything at all brightens and dims
 * here, PE5, TIM3 and the backlight driver are all working and the fault is
 * further up. If nothing moves, it is the backlight or the panel's power.
 */
static void bringup_backlight_sweep(void)
{
    for (uint32_t pass = 0U; pass < 3U; pass++) {
        for (uint32_t duty = 0U; duty <= 100U; duty += 5U) {
            board_display_set_backlight((uint8_t)duty);
            HAL_Delay(10U);
        }
        for (uint32_t duty = 100U; duty > 0U; duty -= 5U) {
            board_display_set_backlight((uint8_t)duty);
            HAL_Delay(10U);
        }
    }
    board_display_set_backlight(100U);
}
#endif

bool board_display_init(void)
{
    lv_display_t *display;
    lv_indev_t *touch_device;

    const bool portrait =
        hmi_display_config.orientation == HMI_DISPLAY_ORIENTATION_PORTRAIT;

    panel_power_init();
    board_init_stage = BOARD_STAGE_PANEL_POWER;

    if (!ltdc_init()) {
        return false;
    }

    /* Clear both buffers before the panel goes live, otherwise the LTDC scans
       out whatever the SRAM powered up with — a burst of noise on every reset. */
    memset((void *)HMI_FRAMEBUFFER_0, 0, HMI_FRAMEBUFFER_BYTES);
    memset((void *)HMI_FRAMEBUFFER_1, 0, HMI_FRAMEBUFFER_BYTES);

    if (!backlight_init()) {
        return false;
    }
    panel_power_on();
    board_display_set_backlight(100U);
    board_init_stage = BOARD_STAGE_BACKLIGHT;

    /* From here on every layer-address write is staged and committed by
       display_flush during vertical blanking. */
    (void)HAL_LTDC_Reload(&hltdc, LTDC_RELOAD_IMMEDIATE);

#if HMI_DISPLAY_BRINGUP_PATTERN_MS > 0U
    /* Both buffers, because nothing here controls which one the LTDC settles
       on and a pattern in only one of them would be a coin toss. */
    fill_bringup_pattern(HMI_FRAMEBUFFER_0);
    fill_bringup_pattern(HMI_FRAMEBUFFER_1);
    {
        uint32_t started_ms = HAL_GetTick();

        /* Repeat until the budget is spent rather than sweeping once: this has
           to be long enough to walk over to the board and watch it. */
        while ((HAL_GetTick() - started_ms) < HMI_DISPLAY_BRINGUP_PATTERN_MS) {
            bringup_backlight_sweep();
        }
    }
    board_display_set_backlight(100U);
#endif

    /*
     * The maXTouch driver takes its I2C handle by value, so board.c brings the
     * bus up and this hands it over. EDT_TS_Init then walks the controller's
     * object table, which is why it needs the panel size: the T9/T100 objects
     * report in their own resolution and the driver scales from it.
     *
     * Orientation is fixed inside the vendored driver at TS_SWAP_Y, which is
     * what the vendor package selects for this panel. If a future panel needs
     * something else, board_touch_log above is how to work out which.
     */
    EDT_TS_Set_Handle(hi2c2);
    board_touch_ready = touch_is_present();
    if (board_touch_ready) {
        (void)EDT_TS_Init(HMI_DISPLAY_WIDTH, HMI_DISPLAY_HEIGHT);
    }
    board_init_stage = BOARD_STAGE_TOUCH;

    display = lv_display_create(HMI_DISPLAY_WIDTH, HMI_DISPLAY_HEIGHT);
    if (display == NULL) {
        return false;
    }
    lv_display_set_color_format(display, LV_COLOR_FORMAT_ARGB8888);
    lv_display_set_flush_cb(display, display_flush);
    if (portrait) {
        /*
         * The panel's resolution goes in either way — LVGL keeps it as the
         * original and swaps only what the UI sees, so the screens come out
         * 272 x 480 while the frame buffers stay 480 x 272.
         *
         * Rotation before buffers, because set_buffers derives the partial
         * buffer's row count from the byte count and the colour format, and
         * reading it back afterwards is how the two stay consistent.
         */
        lv_display_set_rotation(display, LV_DISPLAY_ROTATION_90);
        lv_display_set_buffers(
            display,
            partial_buffer_0,
            partial_buffer_1,
            sizeof(partial_buffer_0),
            LV_DISPLAY_RENDER_MODE_PARTIAL);
    } else {
        lv_display_set_buffers(
            display,
            (void *)HMI_FRAMEBUFFER_0,
            (void *)HMI_FRAMEBUFFER_1,
            HMI_FRAMEBUFFER_BYTES,
            LV_DISPLAY_RENDER_MODE_DIRECT);
    }
    lv_display_set_default(display);

    /* No input device at all when the controller did not answer, rather than
       one whose read callback stalls the loop. A panel with no touch is a
       degraded HMI; a panel whose UI freezes for seconds at a time is a broken
       one, and the second is what registering it anyway would produce. */
    if (board_touch_ready) {
        touch_device = lv_indev_create();
        if (touch_device == NULL) {
            return false;
        }
        lv_indev_set_type(touch_device, LV_INDEV_TYPE_POINTER);
        lv_indev_set_read_cb(touch_device, touch_read);
        lv_indev_set_display(touch_device, display);
    }

    board_init_stage = BOARD_STAGE_DISPLAY;
    return true;
}

/*
 * PLL3 exists to clock the LTDC and nothing else. 25 MHz / 5 x 28 = 140 MHz in
 * the VCO, divided by 15 for a 9.33 MHz pixel clock — the rate the panel timings
 * in ltdc_init are built around.
 */
void HAL_LTDC_MspInit(LTDC_HandleTypeDef *ltdc)
{
    GPIO_InitTypeDef gpio = {0};
    RCC_PeriphCLKInitTypeDef periph_clock = {0};

    if ((ltdc == NULL) || (ltdc->Instance != LTDC)) {
        return;
    }

    periph_clock.PeriphClockSelection = RCC_PERIPHCLK_LTDC;
    periph_clock.LtdcClockSelection = RCC_LTDCCLKSOURCE_PLL3;
    periph_clock.PLL3.PLL3Source = RCC_PLLSOURCE_HSE;
    periph_clock.PLL3.PLL3M = 5U;
    periph_clock.PLL3.PLL3N = 28U;
    periph_clock.PLL3.PLL3P = 2U;
    periph_clock.PLL3.PLL3Q = 5U;
    periph_clock.PLL3.PLL3R = 15U;
    periph_clock.PLL3.PLL3RGE = RCC_PLLVCIRANGE_0;
    periph_clock.PLL3.PLL3FRACN = 0U;
    periph_clock.PLL3.PLL3ClockOut = RCC_PLL3_DIVR;
    if (HAL_RCCEx_PeriphCLKConfig(&periph_clock) != HAL_OK) {
        /*
         * Cannot report this by return value — the HAL calls MspInit through a
         * void callback — and it must not be swallowed. Without PLL3 the LTDC
         * has no pixel clock and, below, no bus clock either; every register
         * write HAL_LTDC_Init then makes is discarded, and it still returns
         * HAL_OK because it never reads anything back. The panel would simply
         * stay dark with every function on the way reporting success.
         */
        ltdc_clock_ready = false;
        return;
    }

    __HAL_RCC_LTDC_CLK_ENABLE();
    __HAL_RCC_GPIOD_CLK_ENABLE();
    __HAL_RCC_GPIOE_CLK_ENABLE();
    __HAL_RCC_GPIOF_CLK_ENABLE();

    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    gpio.Alternate = GPIO_AF8_LTDC;

    /* PE0 HSYNC, PE2/PE3 R0-R1, PE7-PE8 B6-B7, PE9-PE11 G2-G4,
       PE12-PE14 G5-G7, PE15 R2 */
    gpio.Pin = GPIO_PIN_0 | GPIO_PIN_2 | GPIO_PIN_3 | GPIO_PIN_7
             | GPIO_PIN_8 | GPIO_PIN_9 | GPIO_PIN_10 | GPIO_PIN_11
             | GPIO_PIN_12 | GPIO_PIN_13 | GPIO_PIN_14 | GPIO_PIN_15;
    HAL_GPIO_Init(GPIOE, &gpio);

    /* PD0-PD1 B4-B5, PD3 CLK, PD8-PD12 R3-R7, PD13 VSYNC, PD14 B2, PD15 B3 */
    gpio.Pin = GPIO_PIN_0 | GPIO_PIN_1 | GPIO_PIN_3 | GPIO_PIN_8
             | GPIO_PIN_9 | GPIO_PIN_10 | GPIO_PIN_11 | GPIO_PIN_12
             | GPIO_PIN_13 | GPIO_PIN_14 | GPIO_PIN_15;
    HAL_GPIO_Init(GPIOD, &gpio);

    /* PF11 DE, PF12-PF13 B0-B1, PF14-PF15 G0-G1 */
    gpio.Pin = GPIO_PIN_11 | GPIO_PIN_12 | GPIO_PIN_13 | GPIO_PIN_14
             | GPIO_PIN_15;
    HAL_GPIO_Init(GPIOF, &gpio);

    HAL_NVIC_SetPriority(LTDC_IRQn, 5U, 0U);
    HAL_NVIC_EnableIRQ(LTDC_IRQn);

    ltdc_clock_ready = true;
}

void HAL_LTDC_MspDeInit(LTDC_HandleTypeDef *ltdc)
{
    if ((ltdc == NULL) || (ltdc->Instance != LTDC)) {
        return;
    }

    __HAL_RCC_LTDC_CLK_DISABLE();
    HAL_NVIC_DisableIRQ(LTDC_IRQn);
}

void HAL_TIM_PWM_MspInit(TIM_HandleTypeDef *timer)
{
    if ((timer == NULL) || (timer->Instance != TIM3)) {
        return;
    }

    __HAL_RCC_TIM3_CLK_ENABLE();
}

/*
 * The backlight pin. Kept apart from HAL_TIM_PWM_MspInit so PE5 only goes to
 * alternate function once the channel has an output level to drive; see the
 * call site in backlight_init, which is what invokes this — the HAL does not.
 */
void HAL_TIM_MspPostInit(TIM_HandleTypeDef *timer)
{
    GPIO_InitTypeDef gpio = {0};

    if ((timer == NULL) || (timer->Instance != TIM3)) {
        return;
    }

    __HAL_RCC_GPIOE_CLK_ENABLE();

    gpio.Pin = LCD_BL_PWM_Pin;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    gpio.Alternate = GPIO_AF2_TIM3;
    HAL_GPIO_Init(LCD_BL_PWM_GPIO_Port, &gpio);
}

void HAL_TIM_PWM_MspDeInit(TIM_HandleTypeDef *timer)
{
    if ((timer == NULL) || (timer->Instance != TIM3)) {
        return;
    }

    __HAL_RCC_TIM3_CLK_DISABLE();
}
