#ifndef HMI_JPEG_H
#define HMI_JPEG_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    HMI_JPEG_OK = 0,
    /** The codec rejected the data, or did not finish in time. */
    HMI_JPEG_DECODE_FAILED,
    /**
     * A valid JPEG this path cannot convert: grayscale or CMYK, or a picture
     * whose size is not a whole number of MCU blocks. See hmi_jpeg.c.
     */
    HMI_JPEG_UNSUPPORTED,
    /** The frame is larger than the buffers the caller supplied. */
    HMI_JPEG_TOO_LARGE,
} hmi_jpeg_result_t;

/**
 * Bring up the JPEG codec peripheral. Idempotent.
 */
bool hmi_jpeg_init(void);

/**
 * One short line saying why the last call failed — "decode: HAL 3 err 0x4",
 * "4:2:2 612x400 not block-aligned", "DMA2D timeout". Drawn on the widget
 * under the message. Empty after a call that succeeded.
 */
const char *hmi_jpeg_detail(void);

/**
 * Decode one JPEG frame into RGB565, in hardware from end to end.
 *
 * `blocks` is scratch: the codec's own output, YCbCr in MCU-block order, which
 * DMA2D then reads directly. It has to be big enough for the picture at its
 * chroma sampling — three bytes per pixel covers every case this accepts.
 *
 * `rgb565` receives the picture at `stride_px` pixels per row, so a frame can
 * be written into the middle of a larger buffer. Pass 0 to have the rows
 * packed at the frame's own width, which is what a caller wants when the
 * destination holds nothing but this frame — and the only way to be certain
 * the stride matches a width the JPEG header decided rather than the caller.
 *
 * RGB565 rather than the ARGB8888 the rest of the display runs: the picture
 * goes to an LTDC layer the controller scans sixty times a second, and half
 * the bytes is half the SDRAM bandwidth that costs — on a bus LVGL's own
 * frame buffer is already drawing from. Sixteen bits is more than a camera
 * frame carries after JPEG has been at it.
 *
 * Nothing here touches the CPU cache: DMA2D writes the destination and the
 * LTDC reads it, and the CPU never does either.
 *
 * The frame's own size comes back through `width` and `height`, filled in
 * whenever the codec got far enough to read the header.
 */
hmi_jpeg_result_t hmi_jpeg_decode_to_rgb565(
    const uint8_t *jpeg,
    uint32_t jpeg_bytes,
    uint8_t *blocks,
    uint32_t blocks_capacity,
    uint16_t *rgb565,
    uint32_t stride_px,
    uint32_t max_width,
    uint32_t max_height,
    uint32_t *width,
    uint32_t *height);

#ifdef __cplusplus
}
#endif

#endif /* HMI_JPEG_H */
