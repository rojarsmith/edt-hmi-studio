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
 * Decode one JPEG frame into ARGB8888, in hardware from end to end.
 *
 * `blocks` is scratch: the codec's own output, YCbCr in MCU-block order, which
 * DMA2D then reads directly. It has to be big enough for the picture at its
 * chroma sampling — three bytes per pixel covers every case this accepts.
 *
 * `argb` receives the picture at `stride_px` pixels per row, so a frame can be
 * written into the middle of a larger buffer. Pass 0 to have the rows packed
 * at the frame's own width, which is what a caller wants when the destination
 * holds nothing but this frame — and the only way to be certain the stride
 * matches a width the JPEG header decided rather than the caller.
 *
 * The frame's own size comes back through `width` and `height`, filled in
 * whenever the codec got far enough to read the header.
 */
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
    uint32_t *height);

#ifdef __cplusplus
}
#endif

#endif /* HMI_JPEG_H */
