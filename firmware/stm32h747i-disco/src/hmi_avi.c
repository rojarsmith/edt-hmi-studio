/*
 * Just enough AVI to play one.
 *
 * An AVI is a RIFF file: a tree of four-character chunks, each with a 32-bit
 * length, padded to an even byte. Two parts of that tree matter here — the
 * `hdrl` list, which says how big the picture is and how fast it runs, and the
 * `movi` list, which is the frames themselves laid end to end. Everything else
 * in the file, including the `idx1` index at the end, is walked past.
 *
 * Streaming rather than indexing is a deliberate limit. It gives up seeking to
 * an arbitrary frame, which nothing in the product asks for, and gets in
 * return a reader whose memory does not grow with the length of the film: a
 * two-hour video costs exactly what a two-second one does.
 *
 * See docs/video-playback.md §3 for the layout this walks, and §7 for what is
 * deliberately not handled.
 */

#include "hmi_avi.h"

#include <stdio.h>
#include <string.h>

/** 'RIFF', 'LIST', 'avih' and friends, as the little-endian words they are. */
#define FOURCC(a, b, c, d) \
    ((uint32_t)(a) | ((uint32_t)(b) << 8) | ((uint32_t)(c) << 16) | ((uint32_t)(d) << 24))

#define FCC_RIFF FOURCC('R', 'I', 'F', 'F')
#define FCC_AVI  FOURCC('A', 'V', 'I', ' ')
#define FCC_LIST FOURCC('L', 'I', 'S', 'T')
#define FCC_HDRL FOURCC('h', 'd', 'r', 'l')
#define FCC_MOVI FOURCC('m', 'o', 'v', 'i')
#define FCC_AVIH FOURCC('a', 'v', 'i', 'h')
#define FCC_STRL FOURCC('s', 't', 'r', 'l')
#define FCC_STRH FOURCC('s', 't', 'r', 'h')
#define FCC_VIDS FOURCC('v', 'i', 'd', 's')

/** Sizes the RIFF format fixes. */
#define AVI_HEADER_MIN_BYTES 56U
#define AVI_STREAM_HEADER_MIN_BYTES 32U
#define CHUNK_HEADER_BYTES 8U

/** A frame period this far outside sanity means a header we cannot trust. */
#define AVI_MIN_FRAME_PERIOD_US 4000U      /* 250 fps */
#define AVI_MAX_FRAME_PERIOD_US 1000000U   /* 1 fps */
#define AVI_DEFAULT_FRAME_PERIOD_US 41667U /* 24 fps, the rate this targets */

/** A card sector. The unit reads are aligned to — see hmi_avi_next_frame. */
#define SECTOR_BYTES 512U

static uint32_t read_u32(const uint8_t *bytes)
{
    return (uint32_t)bytes[0] |
           ((uint32_t)bytes[1] << 8) |
           ((uint32_t)bytes[2] << 16) |
           ((uint32_t)bytes[3] << 24);
}

/** The last FatFs result that was not FR_OK, so a failure can be named. */
static FRESULT last_result;

static bool read_exact(FIL *file, void *destination, uint32_t bytes)
{
    UINT read = 0U;
    const FRESULT result = f_read(file, destination, bytes, &read);

    if (result != FR_OK) {
        last_result = result;
        return false;
    }
    if (read != bytes) {
        /* Past the end of the file: FatFs reports that as a short read rather
           than as an error, so it needs a code of its own here. */
        last_result = FR_INVALID_OBJECT;
        return false;
    }
    return true;
}

static bool seek_to(FIL *file, FSIZE_t offset)
{
    const FRESULT result = f_lseek(file, offset);

    if (result != FR_OK) {
        last_result = result;
        return false;
    }
    return true;
}

static void set_detail(hmi_avi_t *avi, const char *what)
{
    (void)snprintf(avi->detail, sizeof(avi->detail), "%s", what);
}

static void set_detail_fr(hmi_avi_t *avi, const char *what)
{
    (void)snprintf(avi->detail, sizeof(avi->detail), "%s (FR %d)", what, (int)last_result);
}

/**
 * The compressor a stream carries, as a four-character code.
 *
 * Motion JPEG has never had one spelling. `MJPG` is what almost everything
 * writes, but the same frames turn up as `mjpg`, as `MJPA`/`MJPB` from Apple's
 * encoders, as `AVRn` from Avid, and as `jpeg` or `dmb1` from older tools —
 * all of them ordinary JPEG frames the codec here decodes without knowing the
 * difference. Refusing a file over the spelling of its tag would be a
 * distinction with no consequence.
 */
static bool is_motion_jpeg(uint32_t handler)
{
    switch (handler) {
    case FOURCC('M', 'J', 'P', 'G'):
    case FOURCC('m', 'j', 'p', 'g'):
    case FOURCC('M', 'J', 'P', 'A'):
    case FOURCC('M', 'J', 'P', 'B'):
    case FOURCC('A', 'V', 'R', 'n'):
    case FOURCC('j', 'p', 'e', 'g'):
    case FOURCC('J', 'P', 'E', 'G'):
    case FOURCC('d', 'm', 'b', '1'):
        return true;
    default:
        return false;
    }
}

/**
 * Whether a chunk id names a frame of the video stream.
 *
 * Chunk ids inside `movi` are two ASCII digits of stream number followed by a
 * two-letter kind: `dc` for compressed video, `db` for uncompressed, `wb` for
 * audio. Only the video stream's frames are of interest, and only compressed
 * ones exist in a Motion JPEG file — but `db` is accepted on the same stream
 * because some muxers write it and the payload is identical.
 */
static bool is_video_chunk(uint32_t id, uint8_t stream)
{
    const uint8_t tens = (uint8_t)('0' + (stream / 10U));
    const uint8_t units = (uint8_t)('0' + (stream % 10U));

    if (((uint8_t)(id & 0xFFU) != tens) ||
        ((uint8_t)((id >> 8) & 0xFFU) != units)) {
        return false;
    }
    if ((uint8_t)((id >> 16) & 0xFFU) != (uint8_t)'d') {
        return false;
    }
    return (((uint8_t)((id >> 24) & 0xFFU) == (uint8_t)'c') ||
            ((uint8_t)((id >> 24) & 0xFFU) == (uint8_t)'b'));
}

/**
 * Walk the `hdrl` list, filling in geometry, frame rate and which stream is
 * the video one.
 *
 * `hdrl` holds one `avih` followed by a `strl` list per stream, in stream
 * order — which is what makes the stream number countable here rather than
 * something to look up.
 */
static hmi_avi_result_t parse_header_list(
    hmi_avi_t *avi,
    FSIZE_t list_start,
    uint32_t list_bytes)
{
    FSIZE_t at = list_start;
    const FSIZE_t end = list_start + list_bytes;
    uint8_t stream_index = 0U;
    bool have_main = false;
    bool have_video = false;

    while ((at + CHUNK_HEADER_BYTES) <= end) {
        uint8_t header[CHUNK_HEADER_BYTES];
        uint32_t id;
        uint32_t size;
        FSIZE_t body;

        if (!seek_to(&avi->file, at) ||
            !read_exact(&avi->file, header, CHUNK_HEADER_BYTES)) {
            set_detail_fr(avi, "header read");
            return HMI_AVI_UNREADABLE;
        }
        id = read_u32(&header[0]);
        size = read_u32(&header[4]);
        body = at + CHUNK_HEADER_BYTES;

        if (id == FCC_AVIH) {
            uint8_t main_header[AVI_HEADER_MIN_BYTES];

            if ((size < AVI_HEADER_MIN_BYTES) ||
                !read_exact(&avi->file, main_header, AVI_HEADER_MIN_BYTES)) {
                set_detail(avi, "avih chunk short");
                return HMI_AVI_UNREADABLE;
            }
            avi->frame_period_us = read_u32(&main_header[0]);
            avi->frame_count = read_u32(&main_header[16]);
            avi->width = read_u32(&main_header[32]);
            avi->height = read_u32(&main_header[36]);
            have_main = true;
        } else if (id == FCC_LIST) {
            uint8_t list_type[4];

            if (!read_exact(&avi->file, list_type, sizeof(list_type))) {
                set_detail_fr(avi, "hdrl list read");
                return HMI_AVI_UNREADABLE;
            }
            if (read_u32(list_type) == FCC_STRL) {
                uint8_t stream_header[AVI_STREAM_HEADER_MIN_BYTES];
                uint8_t inner[CHUNK_HEADER_BYTES];
                uint32_t inner_id;
                uint32_t inner_size;

                /* The first chunk of a strl is always its strh. */
                if (!read_exact(&avi->file, inner, CHUNK_HEADER_BYTES)) {
                    set_detail_fr(avi, "strh read");
                    return HMI_AVI_UNREADABLE;
                }
                inner_id = read_u32(&inner[0]);
                inner_size = read_u32(&inner[4]);
                if ((inner_id == FCC_STRH) &&
                    (inner_size >= AVI_STREAM_HEADER_MIN_BYTES) &&
                    read_exact(
                        &avi->file, stream_header, AVI_STREAM_HEADER_MIN_BYTES)) {
                    const uint32_t type = read_u32(&stream_header[0]);
                    const uint32_t handler = read_u32(&stream_header[4]);

                    if ((type == FCC_VIDS) && !have_video) {
                        if (!is_motion_jpeg(handler)) {
                            (void)snprintf(
                                avi->detail, sizeof(avi->detail),
                                "codec %c%c%c%c is not MJPEG",
                                (int)(handler & 0xFFU), (int)((handler >> 8) & 0xFFU),
                                (int)((handler >> 16) & 0xFFU), (int)((handler >> 24) & 0xFFU));
                            return HMI_AVI_NOT_MJPEG;
                        }
                        avi->video_stream = stream_index;
                        have_video = true;
                    }
                }
                stream_index++;
            }
        }

        /* Chunks are padded to an even length; the pad byte is not counted in
           the size, so skipping it is the caller's job on every hop. */
        at = body + size + (size & 1U);
    }

    if (!have_main) {
        set_detail(avi, "no avih in hdrl");
        return HMI_AVI_UNREADABLE;
    }
    if (!have_video) {
        set_detail(avi, "no video stream");
        return HMI_AVI_UNREADABLE;
    }
    if ((avi->width == 0U) || (avi->height == 0U)) {
        set_detail(avi, "zero-sized picture");
        return HMI_AVI_UNREADABLE;
    }
    if ((avi->frame_period_us < AVI_MIN_FRAME_PERIOD_US) ||
        (avi->frame_period_us > AVI_MAX_FRAME_PERIOD_US)) {
        /* A header that claims an impossible rate is a header to distrust
           rather than a file to refuse: the frames are still frames, and 24 fps
           is what this format is written at. */
        avi->frame_period_us = AVI_DEFAULT_FRAME_PERIOD_US;
    }
    return HMI_AVI_OK;
}

hmi_avi_result_t hmi_avi_open(hmi_avi_t *avi, const char *file_name)
{
    uint8_t riff[12];
    FSIZE_t at;
    FSIZE_t file_end;
    FRESULT opened;
    hmi_avi_result_t header_result = HMI_AVI_UNREADABLE;
    bool have_movi = false;

    if ((avi == NULL) || (file_name == NULL) || (file_name[0] == 0)) {
        return HMI_AVI_NO_FILE;
    }

    memset(avi, 0, sizeof(*avi));
    last_result = FR_OK;

    opened = f_open(&avi->file, file_name, FA_READ);
    if (opened != FR_OK) {
        /* Only these two mean "there is no such file". Anything else — a card
           that stopped answering mid-open, a volume that lost its mount — is a
           card problem, and saying "video not found" for it would send the user
           looking for a file that is sitting right there. */
        (void)snprintf(avi->detail, sizeof(avi->detail), "open failed (FR %d)", (int)opened);
        return ((opened == FR_NO_FILE) || (opened == FR_NO_PATH))
            ? HMI_AVI_NO_FILE
            : HMI_AVI_UNREADABLE;
    }
    avi->open = true;

    if (!read_exact(&avi->file, riff, sizeof(riff))) {
        set_detail_fr(avi, "RIFF read");
        hmi_avi_close(avi);
        return HMI_AVI_UNREADABLE;
    }
    if ((read_u32(&riff[0]) != FCC_RIFF) || (read_u32(&riff[8]) != FCC_AVI)) {
        set_detail(avi, "not a RIFF/AVI file");
        hmi_avi_close(avi);
        return HMI_AVI_UNREADABLE;
    }

    file_end = f_size(&avi->file);
    at = sizeof(riff);

    while ((at + CHUNK_HEADER_BYTES) <= file_end) {
        uint8_t header[CHUNK_HEADER_BYTES];
        uint32_t id;
        uint32_t size;
        FSIZE_t body;

        if (!seek_to(&avi->file, at) ||
            !read_exact(&avi->file, header, CHUNK_HEADER_BYTES)) {
            set_detail_fr(avi, "chunk read");
            hmi_avi_close(avi);
            return HMI_AVI_UNREADABLE;
        }
        id = read_u32(&header[0]);
        size = read_u32(&header[4]);
        body = at + CHUNK_HEADER_BYTES;

        if (id == FCC_LIST) {
            uint8_t list_type[4];
            uint32_t type;

            /* A LIST always carries at least its own four-character type. A
               size below that is a corrupt header, and the subtraction below
               would wrap into a length of four billion. */
            if (size < 4U) {
                set_detail(avi, "LIST chunk too short");
                hmi_avi_close(avi);
                return HMI_AVI_UNREADABLE;
            }
            if (!read_exact(&avi->file, list_type, sizeof(list_type))) {
                set_detail_fr(avi, "LIST read");
                hmi_avi_close(avi);
                return HMI_AVI_UNREADABLE;
            }
            type = read_u32(list_type);
            if (type == FCC_HDRL) {
                header_result = parse_header_list(avi, body + 4U, size - 4U);
                if (header_result != HMI_AVI_OK) {
                    hmi_avi_close(avi);
                    return header_result;
                }
            } else if (type == FCC_MOVI) {
                avi->movi_start = body + 4U;
                avi->movi_end = body + size;
                if (avi->movi_end > file_end) {
                    /* A file cut short mid-write still plays as far as it got;
                       clamping is what makes that true rather than a read
                       error at the end. */
                    avi->movi_end = file_end;
                }
                have_movi = true;
                /* The frames are streamed from here, so there is nothing to
                   gain by walking further — and `idx1` sits past this. */
                break;
            }
        }

        at = body + size + (size & 1U);
    }

    if (header_result != HMI_AVI_OK) {
        set_detail(avi, "no hdrl list");
        hmi_avi_close(avi);
        return HMI_AVI_UNREADABLE;
    }
    if (!have_movi) {
        set_detail(avi, "no movi list");
        hmi_avi_close(avi);
        return HMI_AVI_UNREADABLE;
    }

    avi->next_chunk = avi->movi_start;
    avi->detail[0] = 0;
    return HMI_AVI_OK;
}

hmi_avi_result_t hmi_avi_next_frame(
    hmi_avi_t *avi,
    uint8_t *buffer,
    uint32_t capacity,
    const uint8_t **frame,
    uint32_t *length)
{
    if ((avi == NULL) || !avi->open || (buffer == NULL) || (frame == NULL) ||
        (length == NULL)) {
        return HMI_AVI_UNREADABLE;
    }

    *frame = NULL;
    *length = 0U;

    while ((avi->next_chunk + CHUNK_HEADER_BYTES) <= avi->movi_end) {
        uint8_t header[CHUNK_HEADER_BYTES];
        uint32_t id;
        uint32_t size;
        FSIZE_t body;

        if (!seek_to(&avi->file, avi->next_chunk) ||
            !read_exact(&avi->file, header, CHUNK_HEADER_BYTES)) {
            set_detail_fr(avi, "frame header read");
            return HMI_AVI_UNREADABLE;
        }
        id = read_u32(&header[0]);
        size = read_u32(&header[4]);
        body = avi->next_chunk + CHUNK_HEADER_BYTES;

        if (id == FCC_LIST) {
            /* A `rec ` list groups the chunks of one frame interval. Step into
               it rather than over it: its children are the frames. A list too
               short to hold its own type is corrupt; stepping past its header
               is what keeps the walk moving rather than reading it as one. */
            avi->next_chunk = body + ((size < 4U) ? 0U : 4U);
            continue;
        }

        avi->next_chunk = body + size + (size & 1U);

        if (!is_video_chunk(id, avi->video_stream)) {
            /* Audio, subtitles, padding — walked past without decoding. */
            continue;
        }
        if (size == 0U) {
            /* A dropped frame: the muxer wrote the chunk and no payload,
               meaning "show the previous frame again". */
            continue;
        }
        {
            /* Back up to the sector boundary, read from there. */
            const uint32_t skew = (uint32_t)(body % SECTOR_BYTES);
            const uint32_t padded = (size + 3U) & ~3U;
            uint32_t pad;

            if ((skew + padded) > capacity) {
                (void)snprintf(
                    avi->detail, sizeof(avi->detail), "frame %lu bytes > buffer",
                    (unsigned long)size);
                return HMI_AVI_FRAME_TOO_LARGE;
            }
            if (!seek_to(&avi->file, body - skew) ||
                !read_exact(&avi->file, buffer, skew + size)) {
                set_detail_fr(avi, "frame read");
                return HMI_AVI_UNREADABLE;
            }
            for (pad = size; pad < padded; ++pad) {
                buffer[skew + pad] = 0U;
            }

            *frame = &buffer[skew];
            *length = size;
        }
        avi->detail[0] = 0;
        return HMI_AVI_OK;
    }

    return HMI_AVI_END;
}

void hmi_avi_rewind(hmi_avi_t *avi)
{
    if ((avi != NULL) && avi->open) {
        avi->next_chunk = avi->movi_start;
    }
}

void hmi_avi_close(hmi_avi_t *avi)
{
    if ((avi != NULL) && avi->open) {
        (void)f_close(&avi->file);
        avi->open = false;
    }
}
