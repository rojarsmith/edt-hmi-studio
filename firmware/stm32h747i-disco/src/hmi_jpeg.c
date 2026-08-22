/*
 * One frame, decoded by silicon.
 *
 * Two peripherals, no CPU in the pixel path. The JPEG codec turns the
 * compressed frame into YCbCr laid out in MCU blocks — the order the codec
 * emits, not raster order — and DMA2D reads exactly that layout, converts to
 * ARGB8888 and writes it out in raster order. The two were designed as a pair
 * on this part, which is the whole reason this board is the one that can play
 * video: nothing here is a software decode with hardware assistance, it is a
 * hardware decode.
 *
 * Polling rather than interrupts or MDMA. The caller is an LVGL timer that has
 * to wait for the frame anyway before it can show it, so an asynchronous
 * decode would buy nothing but a state machine. A 800x480 frame is a few
 * milliseconds of JPEG codec time against a 41 ms frame period at 24 fps —
 * see docs/video-playback.md §4 for the budget.
 *
 * Two things this deliberately will not do:
 *
 *   - Grayscale and CMYK JPEGs. DMA2D's YCbCr input mode covers 4:4:4, 4:2:2
 *     and 4:2:0 and nothing else, and neither of the others is what a camera
 *     or an encoder produces for video.
 *   - Pictures that are not a whole number of MCU blocks wide and high. The
 *     block-ordered source only lines up with a raster destination when it
 *     divides exactly; handling the ragged edge means a DMA2D transfer per MCU
 *     row and a partial-block copy, which is a real cost on every frame to
 *     rescue a video nobody produces. 800x480 — the panel's own size — divides
 *     exactly at every sampling this accepts.
 */

#include "hmi_jpeg.h"

#include "stm32h7xx_hal.h"

#include <stdio.h>

/**
 * How long the codec gets for one frame before it is called failed.
 *
 * Far past the few milliseconds a frame actually takes. It is not a
 * performance limit — it is what stops a malformed frame from taking the main
 * loop with it, so a bad video shows as a stopped video rather than a dead
 * panel.
 */
#define HMI_JPEG_TIMEOUT_MS 200U
#define HMI_DMA2D_TIMEOUT_MS 100U

static JPEG_HandleTypeDef hmi_jpeg;
static DMA2D_HandleTypeDef hmi_jpeg_dma2d;
static bool jpeg_ready;

/** See hmi_jpeg_detail. */
static char jpeg_detail[48];

const char *hmi_jpeg_detail(void)
{
    return jpeg_detail;
}

static const char *sampling_name(uint32_t subsampling)
{
    switch (subsampling) {
    case JPEG_444_SUBSAMPLING: return "4:4:4";
    case JPEG_422_SUBSAMPLING: return "4:2:2";
    case JPEG_420_SUBSAMPLING: return "4:2:0";
    default: return "4:?:?";
    }
}

/*
 * Where the codec is writing, tracked across the HAL's data-ready callbacks.
 *
 * The polled HAL hands the output back in instalments: every time the buffer
 * it was given fills up it calls HAL_JPEG_DataReadyCallback and resets its own
 * counter to zero, so without advancing the pointer here the second instalment
 * would overwrite the first. Giving it the whole buffer up front means that
 * normally happens exactly once, at the end — but "normally" is not a thing to
 * build on when the input is a file from an SD card.
 */
static uint8_t *jpeg_output_base;
static uint32_t jpeg_output_capacity;
static uint32_t jpeg_output_used;

static uint32_t cache_line_floor(uintptr_t address)
{
    return (uint32_t)(address & ~((uintptr_t)31U));
}

static void clean_dcache_range(const void *address, uint32_t length)
{
    const uint32_t start = cache_line_floor((uintptr_t)address);
    const uint32_t end =
        (uint32_t)(((uintptr_t)address + length + 31U) & ~((uintptr_t)31U));

    __DSB();
    SCB_CleanDCache_by_Addr((uint32_t *)start, (int32_t)(end - start));
    __DSB();
}

static void invalidate_dcache_range(const void *address, uint32_t length)
{
    const uint32_t start = cache_line_floor((uintptr_t)address);
    const uint32_t end =
        (uint32_t)(((uintptr_t)address + length + 31U) & ~((uintptr_t)31U));

    __DSB();
    SCB_InvalidateDCache_by_Addr((uint32_t *)start, (int32_t)(end - start));
    __DSB();
}

void HAL_JPEG_MspInit(JPEG_HandleTypeDef *handle)
{
    if (handle->Instance == JPEG) {
        __HAL_RCC_JPGDECEN_CLK_ENABLE();
    }
}

void HAL_JPEG_MspDeInit(JPEG_HandleTypeDef *handle)
{
    if (handle->Instance == JPEG) {
        __HAL_RCC_JPGDECEN_CLK_DISABLE();
    }
}

void HAL_JPEG_GetDataCallback(JPEG_HandleTypeDef *handle, uint32_t decoded)
{
    (void)decoded;
    /* The whole frame was handed over in one piece, so being asked for more
       means the frame was truncated. A zero-length buffer is how the HAL is
       told there is nothing left; it stops rather than waiting. */
    (void)HAL_JPEG_ConfigInputBuffer(handle, NULL, 0U);
}

void HAL_JPEG_DataReadyCallback(
    JPEG_HandleTypeDef *handle,
    uint8_t *data,
    uint32_t length)
{
    (void)data;

    jpeg_output_used += length;
    if (jpeg_output_used < jpeg_output_capacity) {
        (void)HAL_JPEG_ConfigOutputBuffer(
            handle,
            &jpeg_output_base[jpeg_output_used],
            jpeg_output_capacity - jpeg_output_used);
    }
}

bool hmi_jpeg_init(void)
{
    if (jpeg_ready) {
        return true;
    }

    hmi_jpeg.Instance = JPEG;
    if (HAL_JPEG_Init(&hmi_jpeg) != HAL_OK) {
        (void)snprintf(
            jpeg_detail, sizeof(jpeg_detail), "JPEG init failed (err 0x%lx)",
            (unsigned long)hmi_jpeg.ErrorCode);
        return false;
    }

    __HAL_RCC_DMA2D_CLK_ENABLE();

    jpeg_ready = true;
    return true;
}

/**
 * The MCU block size for a chroma sampling, and the DMA2D mode that reads it.
 *
 * These two always travel together: the block size decides whether the picture
 * divides exactly, and the mode tells DMA2D how the chroma planes are packed.
 * Returning them from one place is what keeps them from disagreeing.
 */
static bool sampling_geometry(
    uint32_t subsampling,
    uint32_t *mcu_width,
    uint32_t *mcu_height,
    uint32_t *dma2d_css,
    uint32_t *bytes_per_pixel_numerator)
{
    switch (subsampling) {
    case JPEG_444_SUBSAMPLING:
        *mcu_width = 8U;
        *mcu_height = 8U;
        *dma2d_css = DMA2D_NO_CSS;
        /* Y, Cb and Cr at full resolution: three bytes a pixel. */
        *bytes_per_pixel_numerator = 3U;
        return true;
    case JPEG_422_SUBSAMPLING:
        *mcu_width = 16U;
        *mcu_height = 8U;
        *dma2d_css = DMA2D_CSS_422;
        /* Chroma at half width: two bytes a pixel. */
        *bytes_per_pixel_numerator = 2U;
        return true;
    case JPEG_420_SUBSAMPLING:
        *mcu_width = 16U;
        *mcu_height = 16U;
        *dma2d_css = DMA2D_CSS_420;
        /* Chroma at half width and half height: 1.5 bytes a pixel. Rounded
           up to 2 so the capacity check stays integer arithmetic, and errs
           towards demanding more room than the frame will use. */
        *bytes_per_pixel_numerator = 2U;
        return true;
    default:
        return false;
    }
}

hmi_jpeg_result_t hmi_jpeg_decode_to_argb(
    const uint8_t *jpeg,
    uint32_t jpeg_bytes,
    uint8_t *blocks,
    uint32_t blocks_capacity,
    uint32_t *argb,
    uint32_t stride_px,
    uint32_t max_width,
    uint32_t max_height,
    uint32_t *width,
    uint32_t *height)
{
    JPEG_ConfTypeDef info;
    uint32_t mcu_width;
    uint32_t mcu_height;
    uint32_t css;
    uint32_t bytes_per_pixel;
    uint32_t needed;

    if (!jpeg_ready || (jpeg == NULL) || (blocks == NULL) || (argb == NULL) ||
        (width == NULL) || (height == NULL) || (jpeg_bytes < 4U)) {
        (void)snprintf(jpeg_detail, sizeof(jpeg_detail), "decode: bad arguments");
        return HMI_JPEG_DECODE_FAILED;
    }

    *width = 0U;
    *height = 0U;

    jpeg_output_base = blocks;
    jpeg_output_capacity = blocks_capacity;
    jpeg_output_used = 0U;

    /* Cast away const: the HAL takes a non-const input pointer and only ever
       reads through it. */
    {
        const HAL_StatusTypeDef decoded = HAL_JPEG_Decode(
            &hmi_jpeg,
            (uint8_t *)(uintptr_t)jpeg,
            jpeg_bytes,
            blocks,
            blocks_capacity,
            HMI_JPEG_TIMEOUT_MS);

        if (decoded != HAL_OK) {
            /* HAL 3 is a timeout: the codec never reached end-of-conversion,
               which is what a truncated or non-baseline frame looks like. The
               error code names the rest — 0x2 is a bad Huffman table, 0x4 a
               timeout, 0x80 a DMA fault. */
            (void)snprintf(
                jpeg_detail, sizeof(jpeg_detail), "decode: HAL %d err 0x%lx out %lu",
                (int)decoded, (unsigned long)hmi_jpeg.ErrorCode,
                (unsigned long)jpeg_output_used);
            return HMI_JPEG_DECODE_FAILED;
        }
    }

    if (HAL_JPEG_GetInfo(&hmi_jpeg, &info) != HAL_OK) {
        (void)snprintf(jpeg_detail, sizeof(jpeg_detail), "decode: no header info");
        return HMI_JPEG_DECODE_FAILED;
    }

    *width = info.ImageWidth;
    *height = info.ImageHeight;

    if ((info.ColorSpace != JPEG_YCBCR_COLORSPACE) ||
        !sampling_geometry(
            info.ChromaSubsampling, &mcu_width, &mcu_height, &css,
            &bytes_per_pixel)) {
        (void)snprintf(
            jpeg_detail, sizeof(jpeg_detail), "colour space %lu %s not YCbCr",
            (unsigned long)info.ColorSpace, sampling_name(info.ChromaSubsampling));
        return HMI_JPEG_UNSUPPORTED;
    }
    if (((info.ImageWidth % mcu_width) != 0U) ||
        ((info.ImageHeight % mcu_height) != 0U)) {
        (void)snprintf(
            jpeg_detail, sizeof(jpeg_detail), "%s %lux%lu not block-aligned",
            sampling_name(info.ChromaSubsampling),
            (unsigned long)info.ImageWidth, (unsigned long)info.ImageHeight);
        return HMI_JPEG_UNSUPPORTED;
    }
    if ((info.ImageWidth > max_width) || (info.ImageHeight > max_height)) {
        (void)snprintf(
            jpeg_detail, sizeof(jpeg_detail), "%lux%lu larger than %lux%lu",
            (unsigned long)info.ImageWidth, (unsigned long)info.ImageHeight,
            (unsigned long)max_width, (unsigned long)max_height);
        return HMI_JPEG_TOO_LARGE;
    }
    /* A stride of zero means "pack the rows", which is what a caller wants
       when the destination exists only to hold this one frame — and it is the
       only way to be sure the stride matches a width the JPEG header, rather
       than the caller, decided. */
    if (stride_px == 0U) {
        stride_px = info.ImageWidth;
    } else if (info.ImageWidth > stride_px) {
        (void)snprintf(jpeg_detail, sizeof(jpeg_detail), "wider than the stride");
        return HMI_JPEG_TOO_LARGE;
    }

    needed = info.ImageWidth * info.ImageHeight * bytes_per_pixel;
    if ((needed > blocks_capacity) || (jpeg_output_used == 0U)) {
        (void)snprintf(
            jpeg_detail, sizeof(jpeg_detail), "codec wrote %lu of %lu bytes",
            (unsigned long)jpeg_output_used, (unsigned long)needed);
        return HMI_JPEG_TOO_LARGE;
    }

    /* The codec's output was written through the D-Cache; DMA2D reads SDRAM. */
    clean_dcache_range(blocks, jpeg_output_used);

    hmi_jpeg_dma2d.Instance = DMA2D;
    hmi_jpeg_dma2d.Init.Mode = DMA2D_M2M_PFC;
    hmi_jpeg_dma2d.Init.ColorMode = DMA2D_OUTPUT_ARGB8888;
    hmi_jpeg_dma2d.Init.OutputOffset = stride_px - info.ImageWidth;
    hmi_jpeg_dma2d.Init.AlphaInverted = DMA2D_REGULAR_ALPHA;
    hmi_jpeg_dma2d.Init.RedBlueSwap = DMA2D_RB_REGULAR;

    /* Alpha is replaced rather than carried: a JPEG has none, and the LTDC on
       this board multiplies the alpha byte into the output, so a frame left at
       zero would be an invisible frame over the layer's black. */
    hmi_jpeg_dma2d.LayerCfg[1].AlphaMode = DMA2D_REPLACE_ALPHA;
    hmi_jpeg_dma2d.LayerCfg[1].InputAlpha = 0xFFU;
    hmi_jpeg_dma2d.LayerCfg[1].InputColorMode = DMA2D_INPUT_YCBCR;
    hmi_jpeg_dma2d.LayerCfg[1].ChromaSubSampling = css;
    hmi_jpeg_dma2d.LayerCfg[1].InputOffset = 0U;
    hmi_jpeg_dma2d.LayerCfg[1].RedBlueSwap = DMA2D_RB_REGULAR;
    hmi_jpeg_dma2d.LayerCfg[1].AlphaInverted = DMA2D_REGULAR_ALPHA;

    if (HAL_DMA2D_Init(&hmi_jpeg_dma2d) != HAL_OK) {
        (void)snprintf(jpeg_detail, sizeof(jpeg_detail), "DMA2D init failed");
        return HMI_JPEG_DECODE_FAILED;
    }
    if (HAL_DMA2D_ConfigLayer(&hmi_jpeg_dma2d, 1U) != HAL_OK) {
        (void)snprintf(jpeg_detail, sizeof(jpeg_detail), "DMA2D layer failed");
        return HMI_JPEG_DECODE_FAILED;
    }
    if (HAL_DMA2D_Start(
            &hmi_jpeg_dma2d,
            (uint32_t)(uintptr_t)blocks,
            (uint32_t)(uintptr_t)argb,
            info.ImageWidth,
            info.ImageHeight) != HAL_OK) {
        (void)snprintf(jpeg_detail, sizeof(jpeg_detail), "DMA2D start failed");
        return HMI_JPEG_DECODE_FAILED;
    }
    if (HAL_DMA2D_PollForTransfer(&hmi_jpeg_dma2d, HMI_DMA2D_TIMEOUT_MS) !=
        HAL_OK) {
        (void)snprintf(
            jpeg_detail, sizeof(jpeg_detail), "DMA2D err 0x%lx",
            (unsigned long)hmi_jpeg_dma2d.ErrorCode);
        return HMI_JPEG_DECODE_FAILED;
    }

    /* DMA2D wrote SDRAM behind the cache; LVGL reads those pixels through it. */
    invalidate_dcache_range(argb, stride_px * info.ImageHeight * 4U);

    jpeg_detail[0] = 0;
    return HMI_JPEG_OK;
}
