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
 */

#include "hmi_video.h"

#include "hmi_avi.h"
#include "hmi_jpeg.h"
#include "hmi_sd.h"

/* lvgl.h does not pull the image cache in, and dropping the cached decode of
   the frame descriptor is the only way to tell LVGL that the pixels behind an
   unchanged pointer are different ones. */
#include "misc/cache/instance/lv_image_cache.h"

#include <string.h>

/**
 * How many Video widgets a project can carry.
 *
 * Not a limit on video, which is one at a time whatever this says — a limit on
 * how many widgets may be registered across every screen. Four is past what
 * any screen design has needed and costs a handful of bytes each.
 */
#define HMI_VIDEO_MAX_WIDGETS 4U

/** The longest file name the widget will hold, including the terminator. */
#define HMI_VIDEO_MAX_NAME 64U

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
    /** Fills with the decoded picture. Hidden until the first frame lands. */
    lv_obj_t *picture;
    /** Carries the message. Hidden while a picture is showing. */
    lv_obj_t *message;

    char file_name[HMI_VIDEO_MAX_NAME];
    bool auto_play;
    bool loop;

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

static lv_timer_t *video_timer;

/** The image descriptor LVGL draws from, pointed at the decoded frame. */
static lv_image_dsc_t frame_descriptor;

/* The three big buffers, all in external SDRAM. Shared rather than per-widget,
   because only one widget can be decoding at a time — see the file comment. */
static HMI_VIDEO_SDRAM uint32_t frame_pixels[HMI_VIDEO_MAX_WIDTH * HMI_VIDEO_MAX_HEIGHT];
/* Three bytes a pixel: the worst case is 4:4:4, where nothing is subsampled. */
static HMI_VIDEO_SDRAM uint8_t frame_blocks[HMI_VIDEO_MAX_WIDTH * HMI_VIDEO_MAX_HEIGHT * 3U];
static HMI_VIDEO_SDRAM uint8_t frame_compressed[HMI_VIDEO_MAX_FRAME_BYTES];

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
    if (widget->picture != NULL) {
        lv_obj_add_flag(widget->picture, LV_OBJ_FLAG_HIDDEN);
    }
}

static void show_picture(video_widget_t *widget)
{
    widget->shown[0] = 0;
    if (widget->message != NULL) {
        lv_obj_add_flag(widget->message, LV_OBJ_FLAG_HIDDEN);
    }
    if (widget->picture != NULL) {
        lv_obj_remove_flag(widget->picture, LV_OBJ_FLAG_HIDDEN);
    }
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
/*  The session                                                        */
/* ------------------------------------------------------------------ */

static void close_session(void)
{
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
    hmi_avi_result_t opened;

    close_session();

    if (widget->file_name[0] == 0) {
        fail(widget, HMI_VIDEO_MSG_NOT_FOUND, "no file name set");
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

    opened = hmi_avi_open(&session, widget->file_name);
    switch (opened) {
    case HMI_AVI_OK:
        break;
    case HMI_AVI_NO_FILE:
        /* Retried, not final: the usual fix is to copy the file onto the card
           and push it back in, and the detect pin will see that happen. */
        retry_later(widget, HMI_VIDEO_MSG_NOT_FOUND, session.detail);
        return false;
    case HMI_AVI_NOT_MJPEG:
        fail(widget, HMI_VIDEO_MSG_FORMAT, session.detail);
        return false;
    case HMI_AVI_UNREADABLE:
    default:
        /* The card mounted a moment ago, so a file that will not parse is the
           file's problem rather than the card's. */
        fail(widget, HMI_VIDEO_MSG_FORMAT, session.detail);
        return false;
    }

    if ((session.width > HMI_VIDEO_MAX_WIDTH) ||
        (session.height > HMI_VIDEO_MAX_HEIGHT)) {
        char detail[48];

        (void)lv_snprintf(
            detail, sizeof(detail), "%lux%lu larger than %ux%u",
            (unsigned long)session.width, (unsigned long)session.height,
            (unsigned)HMI_VIDEO_MAX_WIDTH, (unsigned)HMI_VIDEO_MAX_HEIGHT);
        hmi_avi_close(&session);
        fail(widget, HMI_VIDEO_MSG_FORMAT, detail);
        return false;
    }

    session_owner = widget;
    widget->holds_session = true;
    widget->state = widget->auto_play ? VIDEO_PLAYING : VIDEO_PAUSED;

    if (video_timer != NULL) {
        uint32_t period_ms = session.frame_period_us / 1000U;

        if (period_ms == 0U) {
            period_ms = 1U;
        }
        lv_timer_set_period(video_timer, period_ms);
    }

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
    uint32_t compressed_bytes = 0U;
    uint32_t decoded_width = 0U;
    uint32_t decoded_height = 0U;
    hmi_avi_result_t read;
    hmi_jpeg_result_t decoded;

    read = hmi_avi_next_frame(
        &session, frame_compressed, sizeof(frame_compressed), &compressed_bytes);

    if (read == HMI_AVI_END) {
        if (!widget->loop) {
            /* The last frame stays on screen. Stopping to black would look
               like a failure, and the video did exactly what it was asked. */
            widget->state = VIDEO_ENDED;
            return false;
        }
        hmi_avi_rewind(&session);
        read = hmi_avi_next_frame(
            &session, frame_compressed, sizeof(frame_compressed),
            &compressed_bytes);
        if (read == HMI_AVI_END) {
            /* A file whose movi list holds no video chunks at all. Looping it
               would spin this timer forever finding nothing. */
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

    /* The HAL hands the codec whole words and drops the last one to three
       bytes of an odd-length frame — which is where the EOI marker lives.
       Padding with zeros past the end is harmless to the decoder and keeps
       the marker in. The buffer has room: the reader refuses any frame that
       would not leave it. */
    while (((compressed_bytes & 3U) != 0U) &&
           (compressed_bytes < sizeof(frame_compressed))) {
        frame_compressed[compressed_bytes] = 0U;
        compressed_bytes++;
    }

    decoded = hmi_jpeg_decode_to_argb(
        frame_compressed,
        compressed_bytes,
        frame_blocks,
        sizeof(frame_blocks),
        frame_pixels,
        /* Packed at the frame's own width, so the descriptor's stride below
           cannot disagree with what DMA2D actually wrote — the AVI header's
           idea of the size and the JPEG's need not match. */
        0U,
        HMI_VIDEO_MAX_WIDTH,
        HMI_VIDEO_MAX_HEIGHT,
        &decoded_width,
        &decoded_height);

    if (decoded != HMI_JPEG_OK) {
        fail(widget, HMI_VIDEO_MSG_FORMAT, hmi_jpeg_detail());
        return false;
    }

    frame_descriptor.header.magic = LV_IMAGE_HEADER_MAGIC;
    frame_descriptor.header.cf = LV_COLOR_FORMAT_ARGB8888;
    frame_descriptor.header.flags = 0U;
    frame_descriptor.header.w = (uint16_t)decoded_width;
    frame_descriptor.header.h = (uint16_t)decoded_height;
    frame_descriptor.header.stride = (uint16_t)(decoded_width * 4U);
    frame_descriptor.data = (const uint8_t *)frame_pixels;
    frame_descriptor.data_size = decoded_width * decoded_height * 4U;

    /* The pixels behind the descriptor changed while the descriptor did not,
       so LVGL has to be told to forget what it decoded from it last time. */
    lv_image_cache_drop(&frame_descriptor);
    lv_image_set_src(widget->picture, &frame_descriptor);
    show_picture(widget);
    lv_obj_invalidate(widget->picture);
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
    widget->picture = NULL;
    widget->message = NULL;
    widget->state = VIDEO_IDLE;
    widget->retry_at = 0U;
}

void hmi_video_attach(
    lv_obj_t *frame,
    const char *file_name,
    bool auto_play,
    bool loop)
{
    video_widget_t *widget;

    if (frame == NULL) {
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
    widget->auto_play = auto_play;
    widget->loop = loop;
    widget->state = VIDEO_IDLE;

    if (file_name != NULL) {
        (void)lv_strlcpy(widget->file_name, file_name, HMI_VIDEO_MAX_NAME);
    }

    /* The picture keeps its aspect ratio inside whatever box the widget was
       given. Sizing the widget to the video's own resolution is the fast path
       and the one to design for: at 1:1 LVGL blits the frame, and at any other
       size it scales every frame in software. See docs/video-playback.md §4. */
    widget->picture = lv_image_create(frame);
    lv_obj_remove_flag(widget->picture, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(widget->picture, lv_pct(100), lv_pct(100));
    lv_image_set_inner_align(widget->picture, LV_IMAGE_ALIGN_CONTAIN);
    lv_obj_center(widget->picture);
    lv_obj_add_flag(widget->picture, LV_OBJ_FLAG_HIDDEN);

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
        /* Playing something that has ended starts it again — the only reading
           of "play" that does anything from here. */
        if (widget->holds_session) {
            hmi_avi_rewind(&session);
        }
    }
    widget->state = VIDEO_PLAYING;
    if (widget->holds_session && (video_timer != NULL)) {
        uint32_t period_ms = session.frame_period_us / 1000U;

        lv_timer_set_period(video_timer, (period_ms == 0U) ? 1U : period_ms);
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
    if (widget->holds_session) {
        hmi_avi_rewind(&session);
    }
    widget->state = VIDEO_PAUSED;
    /* Back to the black frame: a stopped video showing its last frame would be
       indistinguishable from a paused one. */
    show_message(widget, HMI_VIDEO_MSG_BLANK, NULL);
}
