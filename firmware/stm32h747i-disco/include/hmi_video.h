#ifndef HMI_VIDEO_H
#define HMI_VIDEO_H

#include <stdbool.h>
#include <stdint.h>

#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * The Video widget's runtime.
 *
 * This is the header generated code includes. `ui.c` creates the widget as a
 * plain black box — the frame the picture will occupy — and hands it here with
 * a playlist of files on the SD card; everything after that, including what
 * the widget says when a file is not there, belongs to this module.
 *
 * Named rather than imported: the files never enter the firmware image, so a
 * two-hour film costs the build nothing and can be changed by swapping the
 * card. See docs/video-playback.md.
 */

/**
 * What a widget plays. Generated code keeps one of these per widget at file
 * scope, and hmi_video_attach keeps the pointer rather than copying — so the
 * table has to outlive the widget, which a static const does.
 *
 * Two shapes. A *list* names its files in play order, each with any folder in
 * front of it, forward slashes, no leading slash: `intro.avi`,
 * `clips/morning.avi`. A *folder scan* names no files — `files` is NULL — and
 * the runtime reads every `.avi` in `folder` off the card when the widget
 * first plays, in name order; `""` is the card's root.
 */
typedef struct {
    const char *const *files;
    uint16_t count;
    const char *folder;
    /** Start playing as soon as the screen carrying the widget is loaded. */
    bool auto_play;
    /** After the last file, start the list again rather than stopping. */
    bool loop;
    /**
     * Random order: the next file is drawn from a software random sequence,
     * and is never the one that just played. With `loop` off, as many files
     * are played as the list holds, then it stops.
     */
    bool shuffle;
} hmi_video_playlist_t;

/**
 * Bind a widget to a playlist.
 *
 * An empty list is not an error to reject here: the widget shows the same
 * "Video not found" a wrong name shows, because from where the person looking
 * at the panel stands those are the same mistake.
 *
 * Nothing is opened at this point. The card is read the first time the widget
 * is actually on screen, so a screen the user never visits costs no card
 * access, and a card pushed in after the panel booted is still found.
 */
void hmi_video_attach(lv_obj_t *frame, const hmi_video_playlist_t *playlist);

/**
 * Start, hold, or return to the first file's first frame.
 *
 * Available for an event or a logic graph to call. A widget whose files could
 * not be opened ignores all three: there is nothing to play, and the message
 * on its face is the answer.
 */
void hmi_video_play(lv_obj_t *frame);
void hmi_video_pause(lv_obj_t *frame);
void hmi_video_stop(lv_obj_t *frame);

#ifdef __cplusplus
}
#endif

#endif /* HMI_VIDEO_H */
