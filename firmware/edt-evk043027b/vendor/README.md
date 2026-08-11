# Vendored drivers

Every other board template in this repository fetches its drivers with a pinned
commit in `scripts/bootstrap-deps.ps1`. This one cannot fetch all of them.

The EVK043027B is not an ST Discovery kit, so there is no `stm32XXX-disco-bsp`
repository holding the panel, touch and flash drivers for it. They come from the
board vendor's own package instead, and the two that are not published anywhere
fetchable are carried here.

## What is here

| Path | Origin | Why it is vendored |
| --- | --- | --- |
| `edt/edt_bsp_ctp.[ch]` | `Drivers/Vendor/Driver/` of the EVK043027B package | EDT's own code; not published upstream |
| `edt/ctp/mxt336u.[ch]` | `Drivers/Vendor/Device/ctp/` of the same package | EDT's own code; not published upstream |
| `edt/Common/ts.h` | `Drivers/Vendor/Device/Common/` of the same package | Interface the two above share |
| `st/mx25lm51245g.[ch]` | `Drivers/Vendor/Device/mx25lm51245g/` of the same package | See below |

`mx25lm51245g.c` *is* ST's component driver and *is* published, as
`STMicroelectronics/stm32-mx25lm51245g`. It is carried here anyway: the copy in
the vendor package is the one the board was brought up against, and it is what
`board_external_flash_init` in `../src/board.c` is written to — the published
driver has since moved to the newer XSPI HAL, whose entry points this OctoSPI
code does not call.

## Rules

**These files are carried verbatim, and are meant to stay that way.** A later
drop from the firmware department should be able to replace the directory
wholesale. Two consequences:

- They are compiled with `-w` (see `../CMakeLists.txt`). They do not build clean
  under this repository's `-Wall -Wextra`, and quieting them file by file would
  make the next vendor drop a merge instead of a copy.
- Everything they expect from the surrounding CubeMX project is supplied by
  `../include/main.h` rather than by editing them. That header is the seam; if a
  vendor drop needs something new, add it there.

The one thing deliberately *not* vendored is `edt_bsp_lcd.c`. It drives a
FreeRTOS task that blanks the panel after an idle timeout, and this runtime has
no scheduler. `../src/board_display.c` provides the four functions
`edt_bsp_ctp.c` actually reaches into it for.
