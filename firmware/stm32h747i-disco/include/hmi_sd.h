#ifndef HMI_SD_H
#define HMI_SD_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Why the card is not usable, in the terms the Video widget reports.
 *
 * Split from "the file is missing" on purpose: a card that is not in the slot
 * and a card that has no such file on it are different mistakes, and telling
 * someone their video is missing when they simply forgot to push the card in
 * sends them looking in the wrong place. See docs/video-playback.md §6.
 */
typedef enum {
    HMI_SD_READY = 0,
    /** Nothing in the slot. The socket has a detect pin and this is it. */
    HMI_SD_NO_CARD,
    /** A card is there, but it did not initialise or FatFs found no volume. */
    HMI_SD_UNREADABLE,
} hmi_sd_state_t;

/**
 * Bring the card up and mount it, or report why not.
 *
 * Cheap to call repeatedly: once mounted it returns HMI_SD_READY without
 * touching the hardware, and once it has failed it retries — a card pushed in
 * after the panel booted is the ordinary case, not an error to latch.
 */
hmi_sd_state_t hmi_sd_mount(void);

/** Drop the mount, so the next hmi_sd_mount starts from the card again. */
void hmi_sd_unmount(void);

/** Whether a card is physically in the slot, straight from the detect pin. */
bool hmi_sd_present(void);

#ifdef __cplusplus
}
#endif

#endif /* HMI_SD_H */
