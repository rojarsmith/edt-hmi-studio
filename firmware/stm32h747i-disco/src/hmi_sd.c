/*
 * The SD card, as FatFs sees it and as the Video widget asks about it.
 *
 * Two things live here, because they are the same subject from two sides:
 * the disk_* functions FatFs calls down into, and the mount/state the runtime
 * calls up for. Both sit directly on the board's BSP_SD driver — SDMMC1, four
 * bits wide, polling.
 *
 * Polling rather than DMA, deliberately. A DMA read into SDRAM needs the
 * D-Cache maintained around every transfer and needs an unaligned FatFs
 * sector buffer bounced through an aligned one; the polled path has neither
 * problem because the CPU does the copying, and the cost is CPU time during a
 * read the runtime is waiting on anyway. A frame is ~140 KB at the bit rate
 * this is built for, read once per frame period. See docs/video-playback.md §4.
 *
 * Read-only: FF_FS_READONLY is 1 in ffconf.h, so disk_write is never called
 * and is not compiled. Nothing this firmware does can alter a card.
 */

#include "hmi_sd.h"

#include "ff.h"
#include "diskio.h"
#include "stm32h747i_discovery_sd.h"
#include "stm32h7xx_hal.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define HMI_SD_INSTANCE 0U
/** FatFs physical drive number. One volume, so it is always this one. */
#define HMI_SD_DRIVE 0U

/** Long enough for a stalled card to give up rather than hang the UI. */
#define HMI_SD_TRANSFER_TIMEOUT_MS 1000U

static bool sd_initialised;
static FATFS sd_filesystem;
static bool sd_mounted;

/** See hmi_sd_detail. Kept short: it is drawn on the widget. */
static char sd_detail[48];

const char *hmi_sd_detail(void)
{
    return sd_detail;
}

static bool wait_for_card_ready(uint32_t timeout_ms);

/**
 * Whether the bus has been dropped from High Speed to Default Speed.
 *
 * BSP_SD_Init ends by switching the card to High Speed — 50 MHz on the
 * SDMMC_CK — and ignores whether that worked. On this Discovery, with the
 * socket on the far side of the board from the MCU, 50 MHz is where some
 * cards' reads start failing their CRC now and then. 50 MHz is also twice
 * the throughput, and a frame's worth of reads is the largest single cost
 * in showing one. So the bus starts fast and drops to 25 MHz the first time
 * a read fails, for good: a card that has failed once at 50 MHz will do it
 * again, and a frame lost to finding that out is cheaper than a frame lost
 * every few seconds.
 */
static bool sd_slowed;

static bool card_init(void)
{
    const int32_t status = BSP_SD_Init(HMI_SD_INSTANCE);

    if (status != BSP_ERROR_NONE) {
        (void)snprintf(sd_detail, sizeof(sd_detail), "SD init failed (%ld)", (long)status);
        return false;
    }
    sd_slowed = false;
    return true;
}

/** After a failed read: halve the clock, once. Returns whether it did. */
static bool slow_down(void)
{
    if (sd_slowed) {
        return false;
    }
    sd_slowed = true;
    if (!wait_for_card_ready(HMI_SD_TRANSFER_TIMEOUT_MS)) {
        return false;
    }
    return HAL_SD_ConfigSpeedBusOperation(
        &hsd_sdmmc[HMI_SD_INSTANCE], SDMMC_SPEED_MODE_DEFAULT) == HAL_OK;
}

/**
 * One multi-block read, retried once at the lower bus speed if it fails.
 *
 * The retry is here rather than in the caller because this is the only place
 * that knows the failure was a read and not a missing card.
 */
static int32_t read_blocks(uint32_t *destination, uint32_t sector, uint32_t count)
{
    int32_t status = BSP_SD_ReadBlocks(HMI_SD_INSTANCE, destination, sector, count);

    if ((status != BSP_ERROR_NONE) && slow_down()) {
        status = BSP_SD_ReadBlocks(HMI_SD_INSTANCE, destination, sector, count);
    }
    return status;
}

bool hmi_sd_present(void)
{
    return BSP_SD_IsDetected(HMI_SD_INSTANCE) == SD_PRESENT;
}

/**
 * Wait for the card to leave its busy state after a transfer.
 *
 * BSP_SD_ReadBlocks returns as soon as the last block is in, but the card may
 * still be finishing internally, and starting the next read then fails. The
 * timeout is what stops a card that has stopped answering from taking the main
 * loop with it — a stalled read shows as a stopped video, not a stopped panel.
 */
static bool wait_for_card_ready(uint32_t timeout_ms)
{
    const uint32_t started = HAL_GetTick();

    while (BSP_SD_GetCardState(HMI_SD_INSTANCE) != SD_TRANSFER_OK) {
        if ((HAL_GetTick() - started) > timeout_ms) {
            return false;
        }
    }
    return true;
}

hmi_sd_state_t hmi_sd_mount(void)
{
    if (sd_mounted) {
        /* A card pulled out while mounted leaves FatFs holding a volume that
           is no longer there; every read would fail one at a time. Catching it
           here turns that into the one honest answer. */
        if (!hmi_sd_present()) {
            hmi_sd_unmount();
            return HMI_SD_NO_CARD;
        }
        return HMI_SD_READY;
    }

    if (!sd_initialised) {
        if (!card_init()) {
            /* Init fails for an empty slot too, so ask the detect pin which
               of the two it was before naming it. */
            return hmi_sd_present() ? HMI_SD_UNREADABLE : HMI_SD_NO_CARD;
        }
        sd_initialised = true;
    }

    if (!hmi_sd_present()) {
        return HMI_SD_NO_CARD;
    }

    /* Mount now (opt = 1) rather than on first access, so a card with no file
       system is reported here instead of surfacing as a failed f_open, which
       would read as "the video is missing". */
    {
        const FRESULT mounted = f_mount(&sd_filesystem, "", 1U);

        if (mounted != FR_OK) {
            (void)snprintf(sd_detail, sizeof(sd_detail), "mount failed (FR %d)", (int)mounted);
            return HMI_SD_UNREADABLE;
        }
    }
    sd_detail[0] = 0;

    sd_mounted = true;
    return HMI_SD_READY;
}

void hmi_sd_unmount(void)
{
    if (sd_mounted) {
        (void)f_mount(NULL, "", 0U);
        sd_mounted = false;
    }
    /* The BSP stays initialised: re-running BSP_SD_Init on every retry costs a
       full card identification sequence, and the card the slot lost is the
       thing that changed, not the controller. */
}

/* ------------------------------------------------------------------ */
/*  FatFs disk interface                                               */
/* ------------------------------------------------------------------ */

DSTATUS disk_initialize(BYTE pdrv)
{
    if (pdrv != HMI_SD_DRIVE) {
        return STA_NOINIT;
    }
    if (!hmi_sd_present()) {
        return STA_NOINIT | STA_NODISK;
    }
    if (!sd_initialised) {
        if (!card_init()) {
            return STA_NOINIT;
        }
        sd_initialised = true;
    }
    return 0U;
}

DSTATUS disk_status(BYTE pdrv)
{
    if (pdrv != HMI_SD_DRIVE) {
        return STA_NOINIT;
    }
    if (!hmi_sd_present()) {
        return STA_NOINIT | STA_NODISK;
    }
    if (!sd_initialised) {
        return STA_NOINIT;
    }
    /* Always STA_PROTECT: this build cannot write, and saying so lets FatFs
       reject a write path that should never have been reachable anyway. */
    return STA_PROTECT;
}

DRESULT disk_read(BYTE pdrv, BYTE *buff, LBA_t sector, UINT count)
{
    if (pdrv != HMI_SD_DRIVE) {
        return RES_PARERR;
    }
    if (!sd_initialised) {
        return RES_NOTRDY;
    }
    if (!wait_for_card_ready(HMI_SD_TRANSFER_TIMEOUT_MS)) {
        return RES_NOTRDY;
    }

    /* BSP_SD_ReadBlocks takes a uint32_t*, and FatFs hands out a BYTE* that is
       word-aligned for its own buffers but need not be for a caller's. The
       polled HAL path copies through the SDMMC FIFO a word at a time and does
       assume alignment, so an odd address is bounced rather than trusted.
       Bounced in runs, not sectors: every command costs the card a few
       hundred microseconds before the first byte moves, so sixteen sectors
       a command is the difference between a slow read and a stalled one.
       The video reader aligns its own reads and never comes this way; this
       is for FatFs's own structures and for anyone else. */
    if ((((uintptr_t)buff) & 3U) == 0U) {
        const int32_t read = read_blocks(
            (uint32_t *)(void *)buff, (uint32_t)sector, count);

        if (read != BSP_ERROR_NONE) {
            (void)snprintf(
                sd_detail, sizeof(sd_detail), "read failed (%ld) at %lu x%u",
                (long)read, (unsigned long)sector, (unsigned)count);
            return RES_ERROR;
        }
    } else {
#define BOUNCE_SECTORS 16U
        static uint32_t bounce[(BOUNCE_SECTORS * FF_MAX_SS) / sizeof(uint32_t)];
        UINT done = 0U;

        while (done < count) {
            const UINT run = ((count - done) < BOUNCE_SECTORS) ? (count - done) : BOUNCE_SECTORS;
            const int32_t read = read_blocks(bounce, (uint32_t)sector + done, run);

            if (read != BSP_ERROR_NONE) {
                (void)snprintf(
                    sd_detail, sizeof(sd_detail), "read failed (%ld) at %lu x%u",
                    (long)read, (unsigned long)(sector + done), (unsigned)run);
                return RES_ERROR;
            }
            if (!wait_for_card_ready(HMI_SD_TRANSFER_TIMEOUT_MS)) {
                return RES_NOTRDY;
            }
            memcpy(&buff[done * FF_MAX_SS], bounce, run * FF_MAX_SS);
            done += run;
        }
        return RES_OK;
    }

    if (!wait_for_card_ready(HMI_SD_TRANSFER_TIMEOUT_MS)) {
        return RES_NOTRDY;
    }
    return RES_OK;
}

DRESULT disk_ioctl(BYTE pdrv, BYTE cmd, void *buff)
{
    BSP_SD_CardInfo info;

    if (pdrv != HMI_SD_DRIVE) {
        return RES_PARERR;
    }
    if (!sd_initialised) {
        return RES_NOTRDY;
    }

    switch (cmd) {
    case CTRL_SYNC:
        /* Nothing is ever written, so nothing is ever pending. */
        return RES_OK;

    case GET_SECTOR_COUNT:
        if (BSP_SD_GetCardInfo(HMI_SD_INSTANCE, &info) != BSP_ERROR_NONE) {
            return RES_ERROR;
        }
        *(LBA_t *)buff = (LBA_t)info.LogBlockNbr;
        return RES_OK;

    case GET_SECTOR_SIZE:
        if (BSP_SD_GetCardInfo(HMI_SD_INSTANCE, &info) != BSP_ERROR_NONE) {
            return RES_ERROR;
        }
        *(WORD *)buff = (WORD)info.LogBlockSize;
        return RES_OK;

    /* GET_BLOCK_SIZE and CTRL_TRIM belong to formatting and to freeing space,
       both of which are compiled out — FF_USE_MKFS and FF_USE_TRIM are 0. A
       call here would mean ffconf.h and this file had drifted apart, so it
       falls through and is rejected rather than answered with a guess. */
    default:
        return RES_PARERR;
    }
}
