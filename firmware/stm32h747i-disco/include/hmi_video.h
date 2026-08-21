#ifndef HMI_VIDEO_H
#define HMI_VIDEO_H

#include <stdbool.h>

#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * The Video widget's runtime.
 *
 * This is the header generated code includes. `ui.c` creates the widget as a
 * plain black box — the frame the picture will occupy — and hands it here with
 * the name of a file on the SD card; everything after that, including what the
 * widget says when the file is not there, belongs to this module.
 *
 * Named rather than imported: the file never enters the firmware image, so a
 * two-hour film costs the build nothing and can be changed by swapping the
 * card. See docs/video-playback.md.
 */

/**
 * Bind a widget to a file in the root of the SD card.
 *
 * `file_name` is a name, not a path — `intro.avi`, as typed in the property
 * editor. An empty name is not an error to reject here: the widget shows the
 * same "Video not found" a wrong name shows, because from where the person
 * looking at the panel stands those are the same mistake.
 *
 * Nothing is opened at this point. The card is read the first time the widget
 * is actually on screen, so a screen the user never visits costs no card
 * access, and a card pushed in after the panel booted is still found.
 */
void hmi_video_attach(
    lv_obj_t *frame,
    const char *file_name,
    bool auto_play,
    bool loop);

/**
 * Start, hold, or return to the first frame.
 *
 * Available for an event or a logic graph to call. A widget whose file could
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
