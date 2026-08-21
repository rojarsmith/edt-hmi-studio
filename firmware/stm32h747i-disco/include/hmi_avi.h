#ifndef HMI_AVI_H
#define HMI_AVI_H

#include <stdbool.h>
#include <stdint.h>

#include "ff.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * How an AVI operation ended.
 *
 * The distinctions here are the ones the panel has to be able to explain. "The
 * file is not on the card" and "the file is there but its video track is H.264"
 * are the same failure to a player and completely different failures to the
 * person holding the card, so they never collapse into one code.
 */
typedef enum {
    HMI_AVI_OK = 0,
    /** No file of that name in the root of the card. */
    HMI_AVI_NO_FILE,
    /** The card could not be read, or the file is not a RIFF/AVI at all. */
    HMI_AVI_UNREADABLE,
    /** A valid AVI whose video track is not Motion JPEG. */
    HMI_AVI_NOT_MJPEG,
    /** A frame is larger than the buffer this build reserves for one. */
    HMI_AVI_FRAME_TOO_LARGE,
    /** The last frame has been returned; the caller loops or stops. */
    HMI_AVI_END,
} hmi_avi_result_t;

/**
 * An open AVI, positioned at the next frame.
 *
 * Streamed rather than indexed: the runtime walks the chunks of the `movi`
 * list in file order and never needs to seek to an arbitrary frame, so the
 * `idx1` index at the end of the file is not read at all. That is what lets a
 * film of any length play out of a fixed amount of RAM — and it is why a
 * corrupt index cannot stop playback.
 */
typedef struct {
    FIL file;
    bool open;

    /** First chunk header inside `movi`, which is also where a loop restarts. */
    FSIZE_t movi_start;
    /** One past the last byte of `movi`. */
    FSIZE_t movi_end;
    /** Offset of the next chunk header to read. */
    FSIZE_t next_chunk;

    /** Frame geometry, from the AVI main header. */
    uint32_t width;
    uint32_t height;
    /** Nominal time between frames, in microseconds, from the main header. */
    uint32_t frame_period_us;
    /** Total frames the header claims. Advisory: playback ends at `movi_end`. */
    uint32_t frame_count;
    /** Which stream number carries the video, as `NNdc` names it. */
    uint8_t video_stream;
} hmi_avi_t;

/**
 * Open a file in the root of the mounted card and parse its headers.
 *
 * On success the reader is positioned at the first frame. On any failure the
 * file is closed again, so a failed open never leaves a handle behind.
 */
hmi_avi_result_t hmi_avi_open(hmi_avi_t *avi, const char *file_name);

/**
 * Read the next video frame into `buffer`.
 *
 * Audio and any other stream in the file is skipped over, not decoded — see
 * docs/video-playback.md §7. Returns HMI_AVI_END once the `movi` list is
 * exhausted, leaving the reader where it is; call hmi_avi_rewind to loop.
 */
hmi_avi_result_t hmi_avi_next_frame(
    hmi_avi_t *avi,
    uint8_t *buffer,
    uint32_t capacity,
    uint32_t *length);

/** Put the reader back at the first frame. */
void hmi_avi_rewind(hmi_avi_t *avi);

void hmi_avi_close(hmi_avi_t *avi);

#ifdef __cplusplus
}
#endif

#endif /* HMI_AVI_H */
