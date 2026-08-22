/*
 * Playing a video, and saying so when it cannot.
 *
 * The parts underneath this file each do one thing: hmi_sd.c mounts the card,
 * hmi_avi.c walks the file and hands back one compressed frame at a time, and
 * hmi_jpeg.c turns that frame into pixels using the JPEG codec and DMA2D. This
 * file is what makes them a widget: when to open the file, when to decode the
 * next frame, what to put on the screen while none of that has worked.
 *
 * Three decisions shape everything here.
 *
 * One player at a time. There is one JPEG codec and one frame buffer, and a
 * screen showing two videos at once is not a thing this hardware can do — so
 * the runtime plays the first video on the loaded screen and leaves any other
 * showing its message. Registering several is still useful and ordinary: one
 * per screen is the shape a project actually takes.
 *
 * Opened late, not at init. `hmi_video_attach` records the name and returns.
 * The card is touched the first time the widget is on the active screen, which
 * means a screen the user never opens costs nothing, a card pushed in after
 * boot is still found, and ui_init never blocks on a card that is not there.
 *
 * Decoded in the timer, synchronously. The whole runtime is one main loop; a
 * frame is read, decoded and shown inside one lv_timer callback, and the loop
 * carries on. That costs a few milliseconds against a 41 ms frame period at
 * 24 fps — see docs/video-playback.md §4 — and buys a module with no
 * concurrency in it at all.
 *
 * Shown on the display controller's second layer, not drawn by LVGL. A frame
 * handed to LVGL as an image is blitted into its frame buffer by the CPU and
 * then copied again to keep the second buffer in step — three megabytes of
 * SDRAM traffic a frame, which is most of the frame period on its own. The
 * LTDC composites its second layer over the first in hardware, so the frame
 * DMA2D wrote is the frame the panel scans, and nothing copies it. The cost
 * is that the layer is always on top: nothing LVGL draws can appear over a
 * playing video. See board_display.h.
 */

#include "hmi_video.h"

#include "board_display.h"
#include "hmi_avi.h"
#include "stm32h7xx_hal.h"
#include "hmi_jpeg.h"
#include "hmi_sd.h"

#include "ff.h"

#include <string.h>

/**
 * How many Video widgets a project can carry.
 *
 * Not a limit on video, which is one at a time whatever this says — a limit on
 * how many widgets may be registered across every screen. Four is past what
 * any screen design has needed and costs a handful of bytes each.
 */
#define HMI_VIDEO_MAX_WIDGETS 4U

/**
 * The most files a folder scan will collect, and the longest path each may be.
 *
 * A playlist bigger than this is not refused — the first this-many files, in
 * name order, are what plays. 64 clips is well past what a panel loops through,
 * and 96 characters holds a folder and a long file name with room to spare.
 * The pool is one shared buffer: only one video plays at a time, so only one
 * scan is ever live.
 */
#define HMI_VIDEO_MAX_LIST 64U
#define HMI_VIDEO_PATH_MAX 96U

/*
 * The largest picture this build decodes: the panel's own size. A frame bigger
 * than the screen has nowhere to go, and the buffers below are sized from
 * these two numbers.
 */
#define HMI_VIDEO_MAX_WIDTH 800U
#define HMI_VIDEO_MAX_HEIGHT 480U

/**
 * The biggest compressed frame the reader will accept.
 *
 * At the bit rate this is built for — around 27 Mbit/s, which is what a
 * high-quality 800x480 Motion JPEG runs at — a frame is roughly 140 KB. Half a
 * megabyte leaves room for a quality setting well past that before a file
 * stops playing, and a file that does exceed it says so rather than being
 * decoded from a truncated buffer.
 */
#define HMI_VIDEO_MAX_FRAME_BYTES (512U * 1024U)

/** Buffers of this size belong in the board's SDRAM, never in internal RAM. */
#define HMI_VIDEO_SDRAM __attribute__((section(".sdram"), aligned(32)))

/**
 * How often the runtime looks for something to do when nothing is playing.
 *
 * Slow on purpose. This is the tick that notices a screen with a video on it
 * has been loaded, and a fifth of a second is imperceptible against a screen
 * transition while costing nothing on a panel with no video in sight.
 */
#define HMI_VIDEO_IDLE_PERIOD_MS 200U

/**
 * How long a widget waits before trying the card again after a card-class
 * failure — no card, a card that would not mount, a read that failed.
 *
 * These are the failures that fix themselves: a card pushed in, a card that
 * answers on the second attempt, a CRC error on one read. Retrying them is
 * what makes "push the card in and it starts" true, and what keeps one bad
 * read from ending playback for good. A file-class failure — no such file, a
 * codec that is not Motion JPEG — is not retried, because nothing on the panel
 * is going to change it; leaving the screen and coming back does.
 */
#define HMI_VIDEO_RETRY_PERIOD_MS 1000U

/** What the panel says, in the panel's words. */
#define HMI_VIDEO_MSG_NOT_FOUND "Video not found"
#define HMI_VIDEO_MSG_NO_CARD "No SD card"
#define HMI_VIDEO_MSG_CARD_UNREADABLE "SD card unreadable"
#define HMI_VIDEO_MSG_FORMAT "Video format not supported"
#define HMI_VIDEO_MSG_BUSY "Another video is playing"
/* Nothing at all: the black frame with no words on it. */
#define HMI_VIDEO_MSG_BLANK ""

/** The message plus its detail line, as drawn. */
#define HMI_VIDEO_TEXT_MAX 112U

typedef enum {
    /** Registered, never opened. The state every widget starts in. */
    VIDEO_IDLE = 0,
    VIDEO_PLAYING,
    VIDEO_PAUSED,
    /** Ran to the end of a file that does not loop. Last frame stays up. */
    VIDEO_ENDED,
    /** Could not be played. The message on its face says why. */
    VIDEO_FAILED,
} video_state_t;

typedef struct {
    lv_obj_t *frame;
    /** Carries the message. Hidden while a picture is showing. */
    lv_obj_t *message;
    /** The screen the frame was created on, whose unload hides the overlay. */
    lv_obj_t *screen;

    /* What this widget plays. A file-scope const from generated code, so the
       pointer is kept rather than the contents copied. */
    const hmi_video_playlist_t *playlist;
    bool auto_play;
    bool loop;
    bool shuffle;

    video_state_t state;
    /** Whether this widget is the one holding the open file and the buffers. */
    bool holds_session;
    /**
     * What the label currently says, so the timer does not re-set the same
     * text on every tick — lv_label_set_text reallocates and invalidates
     * whether or not the words changed.
     */
    char shown[HMI_VIDEO_TEXT_MAX];
    /**
     * When a card-class failure may be tried again, as an lv_tick_get value.
     * Zero when nothing is waiting. See HMI_VIDEO_RETRY_PERIOD_MS.
     */
    uint32_t retry_at;
} video_widget_t;

static video_widget_t widgets[HMI_VIDEO_MAX_WIDGETS];
static uint32_t widget_count;

/** The one open file, and the one player it belongs to. */
static hmi_avi_t session;
static video_widget_t *session_owner;

/*
 * The playlist being played, resolved to a flat list of paths and a position
 * in it. Shared, like the session it belongs to, because only one video plays
 * at a time. For a named list the paths point into the widget's generated
 * table; for a folder scan they point into scanned_paths below.
 */
typedef struct {
    const char *const *entries; /* the paths, whichever store they live in */
    uint16_t count;
    uint16_t current;           /* index open now */
    uint16_t played;            /* files shown this run, for shuffle without loop */
    uint16_t last;              /* index shown before this one, so shuffle can avoid it */
    uint32_t rng;               /* seeded per run, so no two runs pick alike */
} playlist_cursor_t;

static playlist_cursor_t cursor;
static char scanned_paths[HMI_VIDEO_MAX_LIST][HMI_VIDEO_PATH_MAX];
static const char *scanned_index[HMI_VIDEO_MAX_LIST];
static uint16_t scanned_count;

static lv_timer_t *video_timer;

/*
 * The big buffers, all in external SDRAM. Shared rather than per-widget,
 * because only one widget can be decoding at a time — see the file comment.
 *
 * Two picture buffers, because the LTDC is scanning one of them while DMA2D
 * writes the next. Decoding into the one on screen would tear: the top of the
 * panel would show the new frame and the bottom the old, on every frame. The
 * swap is staged and lands at vertical blanking.
 */
static HMI_VIDEO_SDRAM uint16_t frame_pixels[2][HMI_VIDEO_MAX_WIDTH * HMI_VIDEO_MAX_HEIGHT];
static uint32_t frame_back;
/* Three bytes a pixel: the worst case is 4:4:4, where nothing is subsampled. */
static HMI_VIDEO_SDRAM uint8_t frame_blocks[HMI_VIDEO_MAX_WIDTH * HMI_VIDEO_MAX_HEIGHT * 3U];
static HMI_VIDEO_SDRAM uint8_t frame_compressed[HMI_VIDEO_MAX_FRAME_BYTES];

/**
 * What the last frames cost, for reading off the running board.
 *
 * There is no console on this firmware, so this is how the question "where
 * does the time go" gets answered: pause the debugger and print it —
 *
 *   p hmi_video_stats
 *
 * Microseconds, from the Cortex-M7 cycle counter. `frame_us` is the whole
 * timer callback for the last frame; the three stages inside it should add
 * up to most of it. Anything over the period (41 667 us at 24 fps) is a
 * dropped frame. `frames` counts shown frames since the widget started.
 */
typedef struct {
    uint32_t frames;
    uint32_t read_us;
    uint32_t decode_us;
    uint32_t show_us;
    uint32_t frame_us;
    uint32_t worst_frame_us;
    uint32_t compressed_bytes;
} hmi_video_stats_t;

hmi_video_stats_t hmi_video_stats;

static void cycle_counter_start(void)
{
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
}

static uint32_t cycles_to_us(uint32_t cycles)
{
    return cycles / (SystemCoreClock / 1000000U);
}

static void video_timer_cb(lv_timer_t *timer);

/* ------------------------------------------------------------------ */
/*  What the widget shows                                              */
/* ------------------------------------------------------------------ */

/**
 * Put a message on the widget, with the reason under it when there is one.
 *
 * The headline is for the person in front of the panel: *Video not found*,
 * *No SD card*. The detail line is for whoever has to fix it, and says which
 * step failed and what it reported — "mount failed (FR 13)", "decode: HAL 3
 * err 0x4". Without it the headline is all there is, and "SD card unreadable"
 * on its own cannot be acted on by anyone.
 */
static void show_message(video_widget_t *widget, const char *text, const char *detail)
{
    char combined[HMI_VIDEO_TEXT_MAX];

    if ((detail != NULL) && (detail[0] != 0) && (text[0] != 0)) {
        (void)lv_snprintf(combined, sizeof(combined), "%s\n%s", text, detail);
    } else {
        (void)lv_snprintf(combined, sizeof(combined), "%s", text);
    }

    if (strcmp(widget->shown, combined) == 0) {
        return;
    }
    (void)lv_strlcpy(widget->shown, combined, sizeof(widget->shown));

    if (widget->message != NULL) {
        lv_label_set_text(widget->message, combined);
        lv_obj_remove_flag(widget->message, LV_OBJ_FLAG_HIDDEN);
    }
    /* The overlay sits above everything LVGL draws, the message included. */
    board_display_overlay_hide();
}

/**
 * Put the decoded frame on screen: centred in the widget's box, at its own
 * size, clipped to the box. Not scaled — the LTDC cannot, and a widget sized
 * to the video is the design to aim for anyway.
 */
static bool show_picture(video_widget_t *widget, const uint16_t *pixels, uint32_t w, uint32_t h)
{
    lv_area_t box;
    board_overlay_t overlay;

    widget->shown[0] = 0;
    if (widget->message != NULL) {
        lv_obj_add_flag(widget->message, LV_OBJ_FLAG_HIDDEN);
    }

    lv_obj_get_coords(widget->frame, &box);
    overlay.pixels = pixels;
    overlay.width = w;
    overlay.height = h;
    overlay.x = box.x1 + ((lv_area_get_width(&box) - (int32_t)w) / 2);
    overlay.y = box.y1 + ((lv_area_get_height(&box) - (int32_t)h) / 2);
    overlay.clip_x1 = box.x1;
    overlay.clip_y1 = box.y1;
    overlay.clip_x2 = box.x2;
    overlay.clip_y2 = box.y2;
    return board_display_overlay_show(&overlay);
}

/** A failure nothing on the panel will change. Stays until the screen is left. */
static void fail(video_widget_t *widget, const char *text, const char *detail)
{
    widget->state = VIDEO_FAILED;
    widget->retry_at = 0U;
    show_message(widget, text, detail);
}

/** A failure that may clear itself. Shown now, tried again in a second. */
static void retry_later(video_widget_t *widget, const char *text, const char *detail)
{
    widget->state = VIDEO_IDLE;
    widget->retry_at = lv_tick_get() + HMI_VIDEO_RETRY_PERIOD_MS;
    if (widget->retry_at == 0U) {
        widget->retry_at = 1U;
    }
    show_message(widget, text, detail);
}

/* ------------------------------------------------------------------ */
/*  The playlist                                                       */
/* ------------------------------------------------------------------ */

/** A small, self-contained PRNG, so shuffle does not perturb any other. */
static uint32_t next_rand(void)
{
    uint32_t x = cursor.rng;

    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    cursor.rng = (x != 0U) ? x : 0xA5A5A5A5U;
    return cursor.rng;
}

static const char *entry_path(uint16_t index)
{
    return cursor.entries[index];
}

static bool has_avi_extension(const char *name)
{
    const size_t length = strlen(name);

    if (length < 4U) {
        return false;
    }
    return (name[length - 4U] == '.') &&
           ((name[length - 3U] == 'a') || (name[length - 3U] == 'A')) &&
           ((name[length - 2U] == 'v') || (name[length - 2U] == 'V')) &&
           ((name[length - 1U] == 'i') || (name[length - 1U] == 'I'));
}

/**
 * Read every .avi in a folder on the card into scanned_paths, in name order.
 *
 * Returns false only for a card that could not be read — a folder with no
 * video in it is a valid, empty scan, which the caller turns into "Video not
 * found". Sorted here because f_readdir hands entries back in the order the
 * file system stored them, and a playlist a person can predict is one in name
 * order.
 */
static bool scan_folder(const char *folder)
{
    DIR dir;
    FILINFO info;
    const char *path = (folder != NULL && folder[0] != 0) ? folder : "/";

    scanned_count = 0U;

    if (f_opendir(&dir, path) != FR_OK) {
        return false;
    }

    while (scanned_count < HMI_VIDEO_MAX_LIST) {
        if (f_readdir(&dir, &info) != FR_OK) {
            (void)f_closedir(&dir);
            return false;
        }
        if (info.fname[0] == 0) {
            break; /* end of directory */
        }
        if ((info.fattrib & AM_DIR) != 0U) {
            continue; /* folders are not files to play */
        }
        if (!has_avi_extension(info.fname)) {
            continue;
        }

        /* Store the full path, so opening a scanned file is no different from
           opening a named one. */
        if (folder != NULL && folder[0] != 0) {
            (void)lv_snprintf(
                scanned_paths[scanned_count], HMI_VIDEO_PATH_MAX, "%s/%s", folder, info.fname);
        } else {
            (void)lv_strlcpy(scanned_paths[scanned_count], info.fname, HMI_VIDEO_PATH_MAX);
        }
        scanned_count++;
    }
    (void)f_closedir(&dir);

    /* Insertion sort by path. A handful of entries, so the simplest thing that
       is stable is the right one. */
    for (uint16_t i = 1U; i < scanned_count; ++i) {
        char key[HMI_VIDEO_PATH_MAX];
        int16_t j = (int16_t)i - 1;

        (void)lv_strlcpy(key, scanned_paths[i], HMI_VIDEO_PATH_MAX);
        while ((j >= 0) && (strcmp(scanned_paths[j], key) > 0)) {
            (void)lv_strlcpy(scanned_paths[j + 1], scanned_paths[j], HMI_VIDEO_PATH_MAX);
            j--;
        }
        (void)lv_strlcpy(scanned_paths[j + 1], key, HMI_VIDEO_PATH_MAX);
    }

    for (uint16_t i = 0U; i < scanned_count; ++i) {
        scanned_index[i] = scanned_paths[i];
    }
    return true;
}

typedef enum {
    RESOLVE_OK = 0,
    RESOLVE_EMPTY,   /* nothing to play — no files named, or none in the folder */
    RESOLVE_CARD,    /* the folder could not be read */
} resolve_result_t;

/**
 * Turn the widget's playlist into a flat list of paths and a starting index.
 */
static resolve_result_t resolve_playlist(video_widget_t *widget)
{
    const hmi_video_playlist_t *playlist = widget->playlist;

    cursor.rng = DWT->CYCCNT | 1U; /* per run, so no two runs pick alike */
    cursor.played = 0U;
    cursor.last = 0xFFFFU;

    if (playlist->folder != NULL) {
        if (!scan_folder(playlist->folder)) {
            return RESOLVE_CARD;
        }
        cursor.entries = scanned_index;
        cursor.count = scanned_count;
    } else {
        cursor.entries = playlist->files;
        cursor.count = playlist->count;
    }

    if (cursor.count == 0U) {
        return RESOLVE_EMPTY;
    }
    cursor.current = widget->shuffle
        ? (uint16_t)(next_rand() % cursor.count)
        : 0U;
    return RESOLVE_OK;
}

/** Point the frame timer at the open file's rate. */
static void apply_frame_period(void)
{
    uint32_t period_ms = session.frame_period_us / 1000U;

    if (video_timer != NULL) {
        lv_timer_set_period(video_timer, (period_ms == 0U) ? 1U : period_ms);
    }
}

/**
 * Open the file at `cursor.current`, or the next readable one after it.
 *
 * A single bad file in a list is skipped, not fatal: a playlist is a set of
 * separate videos, and one that will not open is one to pass over rather than
 * a reason to blank the widget. Only when every file fails does the caller
 * hear about it.
 */
static bool open_current_file(void)
{
    for (uint16_t tries = 0U; tries < cursor.count; ++tries) {
        if (hmi_avi_open(&session, entry_path(cursor.current)) == HMI_AVI_OK) {
            if ((session.width <= HMI_VIDEO_MAX_WIDTH) &&
                (session.height <= HMI_VIDEO_MAX_HEIGHT)) {
                apply_frame_period();
                return true;
            }
            hmi_avi_close(&session);
        }
        /* Skip to the next file to look for a readable one. */
        cursor.current = (uint16_t)((cursor.current + 1U) % cursor.count);
    }
    return false;
}

/**
 * Move the cursor to the next file to play, or report that the playlist is
 * done. Does not open anything.
 */
static bool next_file(video_widget_t *widget)
{
    /* Finite playback ends once as many files have been shown as the list
       holds — one pass for a sequential list, that many picks for a shuffled
       one. */
    if (!widget->loop && (cursor.played >= cursor.count)) {
        return false;
    }

    if (cursor.count <= 1U) {
        /* One file: loop replays it, and !loop was caught above. */
        cursor.played++;
        return true;
    }

    if (widget->shuffle) {
        /* A random index that is never the current one: pick in a range one
           short, and step past current. Never repeats the file just played. */
        uint16_t pick = (uint16_t)(next_rand() % (cursor.count - 1U));

        if (pick >= cursor.current) {
            pick++;
        }
        cursor.last = cursor.current;
        cursor.current = pick;
    } else {
        cursor.current = (uint16_t)((cursor.current + 1U) % cursor.count);
    }
    cursor.played++;
    return true;
}

/* ------------------------------------------------------------------ */
/*  The session                                                        */
/* ------------------------------------------------------------------ */

static void close_session(void)
{
    board_display_overlay_hide();
    if (session_owner != NULL) {
        hmi_avi_close(&session);
        if (session_owner->state == VIDEO_PLAYING) {
            session_owner->state = VIDEO_IDLE;
        }
        session_owner->holds_session = false;
        session_owner = NULL;
    }
}

/**
 * Open the file this widget names and take the shared session for it.
 *
 * Every failure ends with a message on the widget's face rather than a return
 * code the caller has to interpret, because there is exactly one thing to do
 * with any of them: say so on the panel. The distinctions the messages keep
 * are the ones that change what the user should go and do — a card that is not
 * in the slot sends them somewhere different from a name that is misspelled.
 */
static bool open_session(video_widget_t *widget)
{
    close_session();

    if (widget->playlist == NULL) {
        fail(widget, HMI_VIDEO_MSG_NOT_FOUND, "no playlist set");
        return false;
    }

    switch (hmi_sd_mount()) {
    case HMI_SD_NO_CARD:
        retry_later(widget, HMI_VIDEO_MSG_NO_CARD, NULL);
        return false;
    case HMI_SD_UNREADABLE:
        retry_later(widget, HMI_VIDEO_MSG_CARD_UNREADABLE, hmi_sd_detail());
        return false;
    case HMI_SD_READY:
    default:
        break;
    }

    if (!hmi_jpeg_init()) {
        fail(widget, HMI_VIDEO_MSG_FORMAT, hmi_jpeg_detail());
        return false;
    }

    switch (resolve_playlist(widget)) {
    case RESOLVE_OK:
        break;
    case RESOLVE_CARD:
        retry_later(widget, HMI_VIDEO_MSG_CARD_UNREADABLE, hmi_sd_detail());
        return false;
    case RESOLVE_EMPTY:
    default:
        /* Retried, not final: the usual fix is to copy files onto the card and
           push it back in, and the detect pin will see that happen. */
        retry_later(
            widget, HMI_VIDEO_MSG_NOT_FOUND,
            widget->playlist->folder != NULL ? "no .avi in the folder" : "no files listed");
        return false;
    }

    if (!open_current_file()) {
        /* Every file in the playlist failed to open or parse. */
        fail(widget, HMI_VIDEO_MSG_FORMAT, session.detail);
        return false;
    }
    /* The first file is the first play; finite playback counts from here. */
    cursor.played = 1U;

    session_owner = widget;
    widget->holds_session = true;
    widget->state = widget->auto_play ? VIDEO_PLAYING : VIDEO_PAUSED;

    /* Paused before the first frame has anything to show, so the widget stays
       on its black frame rather than on a stale picture from another file. */
    if (widget->state == VIDEO_PAUSED) {
        show_message(widget, HMI_VIDEO_MSG_BLANK, NULL);
    }
    return true;
}

/**
 * Read, decode and show one frame.
 *
 * Returns false when playback stopped, for whatever reason — the widget has
 * already been told what to say by then.
 */
static bool advance_frame(video_widget_t *widget)
{
    const uint8_t *compressed = NULL;
    uint32_t compressed_bytes = 0U;
    uint32_t decoded_width = 0U;
    uint32_t decoded_height = 0U;
    hmi_avi_result_t read;
    hmi_jpeg_result_t decoded;
    uint16_t *pixels;
    uint32_t t0;
    uint32_t t1;
    uint32_t t2;
    uint32_t t3;

    t0 = DWT->CYCCNT;
    read = hmi_avi_next_frame(
        &session, frame_compressed, sizeof(frame_compressed), &compressed,
        &compressed_bytes);

    if (read == HMI_AVI_END) {
        /* This file is done. Move to the next in the playlist — a different
           file, the same one again for a single-file loop, or nowhere when a
           finite playlist has run out. */
        if (!next_file(widget)) {
            /* The last frame of the last file stays on screen. Stopping to
               black would look like a failure, and the playlist did exactly
               what it was asked. */
            widget->state = VIDEO_ENDED;
            return false;
        }
        hmi_avi_close(&session);
        if (!open_current_file()) {
            fail(widget, HMI_VIDEO_MSG_FORMAT, session.detail);
            return false;
        }
        read = hmi_avi_next_frame(
            &session, frame_compressed, sizeof(frame_compressed), &compressed,
            &compressed_bytes);
        if (read == HMI_AVI_END) {
            /* A file whose movi list holds no video chunks at all. */
            fail(widget, HMI_VIDEO_MSG_FORMAT, "no video frames in file");
            return false;
        }
    }

    if (read == HMI_AVI_FRAME_TOO_LARGE) {
        fail(widget, HMI_VIDEO_MSG_FORMAT, session.detail);
        return false;
    }
    if (read != HMI_AVI_OK) {
        /* The card stopped answering mid-file — or one read failed its CRC.
           Dropping the mount means the next attempt starts from the card
           again rather than from a volume that is no longer there, and
           retrying is what turns one bad read into a skipped frame rather
           than the end of the film. */
        char detail[48];

        (void)lv_strlcpy(
            detail,
            (hmi_sd_detail()[0] != 0) ? hmi_sd_detail() : session.detail,
            sizeof(detail));
        close_session();
        hmi_sd_unmount();
        retry_later(widget, HMI_VIDEO_MSG_CARD_UNREADABLE, detail);
        return false;
    }

    t1 = DWT->CYCCNT;

    /* Into the buffer the panel is not scanning. The reader has already
       padded the frame to a word boundary, so the HAL's whole-word input
       drops nothing that matters. */
    pixels = frame_pixels[frame_back];
    decoded = hmi_jpeg_decode_to_rgb565(
        compressed,
        (compressed_bytes + 3U) & ~3U,
        frame_blocks,
        sizeof(frame_blocks),
        pixels,
        /* Packed at the frame's own width, so the overlay's pitch cannot
           disagree with what DMA2D actually wrote — the AVI header's idea of
           the size and the JPEG's need not match. */
        0U,
        HMI_VIDEO_MAX_WIDTH,
        HMI_VIDEO_MAX_HEIGHT,
        &decoded_width,
        &decoded_height);

    if (decoded != HMI_JPEG_OK) {
        fail(widget, HMI_VIDEO_MSG_FORMAT, hmi_jpeg_detail());
        return false;
    }
    t2 = DWT->CYCCNT;

    if (!show_picture(widget, pixels, decoded_width, decoded_height)) {
        fail(widget, HMI_VIDEO_MSG_FORMAT, "overlay refused the frame");
        return false;
    }
    frame_back ^= 1U;
    t3 = DWT->CYCCNT;

    hmi_video_stats.frames++;
    hmi_video_stats.compressed_bytes = compressed_bytes;
    hmi_video_stats.read_us = cycles_to_us(t1 - t0);
    hmi_video_stats.decode_us = cycles_to_us(t2 - t1);
    hmi_video_stats.show_us = cycles_to_us(t3 - t2);
    hmi_video_stats.frame_us = cycles_to_us(t3 - t0);
    if (hmi_video_stats.frame_us > hmi_video_stats.worst_frame_us) {
        hmi_video_stats.worst_frame_us = hmi_video_stats.frame_us;
    }
    return true;
}

/**
 * Put every widget that is not on the loaded screen back to its resting state.
 *
 * This is what makes leaving a screen and coming back retry: a widget that
 * failed keeps its message only while it is being looked at, and is opened
 * again from scratch the next time it appears. It is also what releases the
 * card, so a video on the screen being loaded starts from its own first frame
 * rather than waiting for another screen's file to be closed.
 */
static void release_offscreen_widgets(const lv_obj_t *screen)
{
    for (uint32_t index = 0U; index < widget_count; ++index) {
        video_widget_t *widget = &widgets[index];

        if (widget->frame == NULL) {
            continue;
        }
        if (lv_obj_get_screen(widget->frame) == screen) {
            continue;
        }
        if (widget->holds_session) {
            close_session();
        }
        widget->state = VIDEO_IDLE;
        widget->retry_at = 0U;
        widget->shown[0] = 0;
    }
}

/**
 * The widget that should be playing: the first registered one that is on the
 * loaded screen and not hidden.
 *
 * Registration order rather than anything cleverer, because it is the order
 * the widgets appear in the project and therefore the one a user can predict.
 */
static video_widget_t *active_widget(const lv_obj_t *screen)
{
    for (uint32_t index = 0U; index < widget_count; ++index) {
        video_widget_t *widget = &widgets[index];

        if (widget->frame == NULL) {
            continue;
        }
        if (lv_obj_get_screen(widget->frame) != screen) {
            continue;
        }
        if (lv_obj_has_flag(widget->frame, LV_OBJ_FLAG_HIDDEN)) {
            continue;
        }
        return widget;
    }
    return NULL;
}

/** Back to the slow tick, for whenever nothing is decoding. */
static void idle_tick(void)
{
    if (video_timer != NULL) {
        lv_timer_set_period(video_timer, HMI_VIDEO_IDLE_PERIOD_MS);
    }
}

static void video_timer_cb(lv_timer_t *timer)
{
    const lv_obj_t *screen = lv_screen_active();
    video_widget_t *widget;

    (void)timer;

    if (screen == NULL) {
        return;
    }

    release_offscreen_widgets(screen);

    widget = active_widget(screen);
    if (widget == NULL) {
        idle_tick();
        return;
    }

    /* Every other video on this screen says why it is dark, rather than
       sitting as an unexplained black rectangle. There is one codec. */
    for (uint32_t index = 0U; index < widget_count; ++index) {
        video_widget_t *other = &widgets[index];

        if ((other == widget) || (other->frame == NULL)) {
            continue;
        }
        if (lv_obj_get_screen(other->frame) == screen) {
            if (other->holds_session) {
                close_session();
            }
            other->state = VIDEO_IDLE;
            show_message(other, HMI_VIDEO_MSG_BUSY, NULL);
        }
    }

    if (widget->state == VIDEO_FAILED) {
        /* Said its piece. Retrying every frame period would hammer a card that
           is not there; release_offscreen_widgets is what gives it another go,
           when the screen has been left and come back to. */
        idle_tick();
        return;
    }

    if ((widget->retry_at != 0U) && !widget->holds_session) {
        /* A card-class failure, waiting its second out. */
        if ((int32_t)(lv_tick_get() - widget->retry_at) < 0) {
            idle_tick();
            return;
        }
        widget->retry_at = 0U;
    }

    if (!widget->holds_session && !open_session(widget)) {
        idle_tick();
        return;
    }

    if (widget->state != VIDEO_PLAYING) {
        idle_tick();
        return;
    }

    if (!advance_frame(widget)) {
        idle_tick();
    }
}

/* ------------------------------------------------------------------ */
/*  What generated code calls                                          */
/* ------------------------------------------------------------------ */

static video_widget_t *find_widget(const lv_obj_t *frame)
{
    for (uint32_t index = 0U; index < widget_count; ++index) {
        if (widgets[index].frame == frame) {
            return &widgets[index];
        }
    }
    return NULL;
}

/**
 * A widget that goes away takes its registration with it.
 *
 * Screens are rebuilt — a language switch alone is enough — and a stale
 * lv_obj_t pointer here would be dereferenced by the next timer tick.
 */
static void frame_deleted_cb(lv_event_t *event)
{
    video_widget_t *widget = (video_widget_t *)lv_event_get_user_data(event);

    if (widget == NULL) {
        return;
    }
    if (widget->holds_session) {
        close_session();
    }
    widget->frame = NULL;
    widget->message = NULL;
    widget->screen = NULL;
    widget->state = VIDEO_IDLE;
    widget->retry_at = 0U;
}

/**
 * The screen is going: take the overlay down *now*, not at the next tick.
 *
 * The layer sits above LVGL, so a video left up for the 200 ms until the
 * timer notices would be painted over the top of the screen that replaced
 * it. The session goes with it; the widget is reopened from its first frame
 * if the screen comes back.
 */
static void screen_unload_cb(lv_event_t *event)
{
    video_widget_t *widget = (video_widget_t *)lv_event_get_user_data(event);

    if ((widget != NULL) && widget->holds_session) {
        close_session();
    }
    board_display_overlay_hide();
}

void hmi_video_attach(lv_obj_t *frame, const hmi_video_playlist_t *playlist)
{
    video_widget_t *widget;

    if ((frame == NULL) || (playlist == NULL)) {
        return;
    }

    /* A slot freed by a deleted widget is reused before the array grows, so
       rebuilding a screen many times cannot run the registry out. */
    widget = NULL;
    for (uint32_t index = 0U; index < widget_count; ++index) {
        if (widgets[index].frame == NULL) {
            widget = &widgets[index];
            break;
        }
    }
    if ((widget == NULL) && (widget_count < HMI_VIDEO_MAX_WIDGETS)) {
        widget = &widgets[widget_count];
        widget_count++;
    }
    if (widget == NULL) {
        return;
    }

    memset(widget, 0, sizeof(*widget));
    widget->frame = frame;
    widget->screen = lv_obj_get_screen(frame);
    widget->playlist = playlist;
    widget->auto_play = playlist->auto_play;
    widget->loop = playlist->loop;
    widget->shuffle = playlist->shuffle;
    widget->state = VIDEO_IDLE;

    cycle_counter_start();

    /* Inherits the widget's text colour, which is the row the property editor
       calls Text Color — so the message is styled with the widget rather than
       hard-coded here. */
    widget->message = lv_label_create(frame);
    /* Wrapped, not dotted: the detail line under a message is the part that
       says what to fix, and it must not be the part that gets cut off. */
    lv_label_set_long_mode(widget->message, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_width(widget->message, lv_pct(90));
    lv_obj_set_style_text_align(widget->message, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(widget->message, "");
    lv_obj_center(widget->message);

    lv_obj_add_event_cb(frame, frame_deleted_cb, LV_EVENT_DELETE, widget);
    if (widget->screen != NULL) {
        lv_obj_add_event_cb(
            widget->screen, screen_unload_cb, LV_EVENT_SCREEN_UNLOAD_START, widget);
    }

    if (video_timer == NULL) {
        video_timer = lv_timer_create(
            video_timer_cb, HMI_VIDEO_IDLE_PERIOD_MS, NULL);
    }
}

void hmi_video_play(lv_obj_t *frame)
{
    video_widget_t *widget = find_widget(frame);

    if ((widget == NULL) || (widget->state == VIDEO_FAILED)) {
        return;
    }
    if (widget->state == VIDEO_ENDED) {
        /* A playlist that ran out plays again from the top: drop the session
           so the next tick opens it fresh. */
        close_session();
    }
    widget->state = VIDEO_PLAYING;
    if (widget->holds_session) {
        apply_frame_period();
    }
}

void hmi_video_pause(lv_obj_t *frame)
{
    video_widget_t *widget = find_widget(frame);

    if ((widget != NULL) && (widget->state == VIDEO_PLAYING)) {
        widget->state = VIDEO_PAUSED;
    }
}

void hmi_video_stop(lv_obj_t *frame)
{
    video_widget_t *widget = find_widget(frame);

    if ((widget == NULL) || (widget->state == VIDEO_FAILED)) {
        return;
    }
    /* Drop the session so play starts the playlist from the top, and go back
       to the black frame: a stopped video showing its last frame would be
       indistinguishable from a paused one. */
    close_session();
    widget->state = VIDEO_PAUSED;
    show_message(widget, HMI_VIDEO_MSG_BLANK, NULL);
}
