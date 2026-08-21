/*
 * FatFs configuration for the Video widget's SD card reader.
 *
 * Derived from ffconf_template.h of the pinned stm32_mw_fatfs (see
 * scripts/bootstrap-deps.ps1). Everything here is set for one job: opening a
 * named file in the root of a removable card and reading it start to finish.
 * Nothing in this firmware writes to a card, creates one, or walks it, and the
 * options below say so — a read-only build is both smaller and incapable of
 * damaging a card someone hands it.
 *
 * FF_FS_REENTRANT stays 0 and no ffsystem_*.c is compiled: the whole runtime
 * runs from one main loop, and the only caller is hmi_video.c.
 * See docs/video-playback.md §4.
 */
#ifndef FFCONF_H
#define FFCONF_H

#define FFCONF_DEF	80286	/* Revision ID */

/*---------------------------------------------------------------------------/
/ Function Configurations
/---------------------------------------------------------------------------*/

/* Read-only. Nothing in this firmware writes to the card, so f_write, f_sync,
   f_unlink and the whole allocation path are compiled out — and with them
   get_fattime(), which would otherwise have to be supplied by a board with no
   real-time clock configured. */
#define FF_FS_READONLY	1

/* Full API: f_lseek is what a video seek would need, and f_stat is how the
   runtime tells "no such file" apart from "cannot read the card". */
#define FF_FS_MINIMIZE	0

#define FF_USE_FIND		0
#define FF_USE_MKFS		0
/* The runtime reads forwards from the first frame and never seeks about, so
   the cluster-link map fast-seek buys nothing and costs a table per file. */
#define FF_USE_FASTSEEK	0
#define FF_USE_EXPAND	0
#define FF_USE_CHMOD	0
#define FF_USE_LABEL	0
#define FF_USE_FORWARD	0
#define FF_USE_STRFUNC	0
#define FF_PRINT_LLI	0
#define FF_PRINT_FLOAT	0
#define FF_STRF_ENCODE	0

/*---------------------------------------------------------------------------/
/ Locale and Namespace Configurations
/---------------------------------------------------------------------------*/

/* U.S. — the code page decides how a non-ASCII short file name is read back,
   and this build compares names the user typed in the editor, which are the
   ones ASCII covers. */
#define FF_CODE_PAGE	437

/* Long file names, in a static buffer. A video is named by hand in the
   property editor and "product-demo-loop.avi" is an ordinary thing to type;
   without this it would have to be an 8.3 name, which is a rule from 1980 to
   explain to someone drawing a screen. Static rather than on the stack or the
   heap: there is one reader, and 255 characters of BSS is cheaper than either
   alternative is to reason about. */
#define FF_USE_LFN		1
#define FF_MAX_LFN		255
#define FF_LFN_UNICODE	0
#define FF_LFN_BUF		255
#define FF_SFN_BUF		12

/* No current directory: every path this runtime opens is absolute, because the
   file name comes from the editor and is documented as living in the root. */
#define FF_FS_RPATH		0

/*---------------------------------------------------------------------------/
/ Drive/Volume Configurations
/---------------------------------------------------------------------------*/

/* One volume, the card. hmi_sd.c is the only disk driver linked. */
#define FF_VOLUMES		1
#define FF_STR_VOLUME_ID	0
#define FF_VOLUME_STRS		"SD"
#define FF_MULTI_PARTITION	0
#define FF_MIN_SS		512
#define FF_MAX_SS		512
/* Needed by exFAT below, and true of the cards this is for: a 64 GB card is
   past the 32-bit sector count only in theory, but exFAT requires it. */
#define FF_LBA64		1
#define FF_MIN_GPT		0x10000000
#define FF_USE_TRIM		0

/*---------------------------------------------------------------------------/
/ System Configurations
/---------------------------------------------------------------------------*/

/* Not tiny: the per-file sector buffer is 512 bytes against a decode path that
   already owns megabytes, and tiny mode re-reads the FAT on every access. */
#define FF_FS_TINY		0

/* exFAT, because of what this is for. A card big enough to hold video is
   usually bigger than 32 GB, and every card over that ships exFAT-formatted
   from the factory — refusing them would mean telling the user to reformat a
   card before it can hold a film. Costs code size and requires FF_USE_LFN and
   FF_LBA64 above. */
#define FF_FS_EXFAT		1

/* No RTC on this board's build. Read-only anyway: timestamps are only ever
   read back, never written. */
#define FF_FS_NORTC		1
#define FF_NORTC_MON	1
#define FF_NORTC_MDAY	1
#define FF_NORTC_YEAR	2026

#define FF_FS_NOFSINFO	0
#define FF_FS_LOCK		0
/* One main loop, one reader. Nothing to serialise, and no OS to serialise
   with — which is also why no ffsystem_*.c is compiled. */
#define FF_FS_REENTRANT	0
#define FF_FS_TIMEOUT	1000

#endif /* FFCONF_H */
