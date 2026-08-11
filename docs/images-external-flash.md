# Images in External Flash

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/images-external-flash.md">繁體中文</a>
</p>

On the STM32H747I-DISCO, the pixel data of every image a project uses is linked
into the board's QSPI NOR instead of the 1 MB internal flash. This document
records why, how the pieces fit, and what is verified.

## 1. Why

The internal flash is 1 MB and the firmware already occupies roughly 285 KB,
leaving about 740 KB for everything else. A single 800×480 ARGB8888 background
is 1500 KB — it does not fit even on its own. See
[Color Depth](./color-depth.md) §4.2 for where that figure comes from.

The board carries an **MT25TL01G**: two MT25QL512 dies driven as one 128 MB
device, reachable at `0x90000000` once memory mapped mode is on. That is roughly
170× the space, and because it is memory mapped, LVGL needs no changes at all —
an `lv_image_dsc_t.data` pointer into `0x9xxxxxxx` reads like any other pointer.

## 2. How the pieces fit

| Piece | What it does |
| --- | --- |
| `imageConverter.ts` | Emits `LV_ATTRIBUTE_IMG_<NAME> HMI_IMAGE_ATTRIBUTE`, which expands to a `section(".ext_flash_images")` attribute when `HMI_IMAGES_IN_EXTERNAL_FLASH` is defined and to nothing otherwise |
| `CMakeLists.txt` | Defines `HMI_IMAGES_IN_EXTERNAL_FLASH`, and compiles the QSPI HAL, BSP and MT25TL01G driver |
| `STM32H747XIHx_FLASH.ld` | Adds an `EXTFLASH` region at `0x90000000` and places `.ext_flash_images` in it |
| `board.c` | An MPU region typing the window as Normal, cacheable, read-only, and `board_external_flash_init()` which brings up the QSPI and enables memory mapped mode |
| `CMakeLists.txt` post-build | Splits the ELF into `firmware.bin`/`.hex` (external section removed) and `firmware_extflash.bin` (that section alone) |
| `service.ts` | Programs `firmware_extflash.bin` at `0x90000000` through the external loader, then the internal image |

Only images the project actually uses are emitted at all —
`collectUsedImageResources` in `projectSource.ts` already walked the screens for
that, and it predates this change.

`--gc-sections` still applies. An image whose data nothing references is
dropped by the linker rather than occupying external flash, which is why the
descriptor has to be reachable from live code for its pixels to survive.

## 3. Two things that are easy to get wrong

**The descriptor stays in internal flash; only the pixel data moves.** The
`lv_image_dsc_t` struct is a few bytes of header and a pointer, and it is
`const` without the attribute, so it lands in `.rodata` as before. This is
intended: the small metadata stays fast to reach, and the bulk moves.

**The ELF can no longer be flashed directly.** It carries a section at
`0x90000000`, which STM32CubeProgrammer cannot write without the external
loader — it fails with `failed to download Sector[0]`. Flash `firmware.hex`,
which has that section removed. The Deploy tab already does.

## 4. MPU

The QSPI window defaults to Device memory, exactly like the SDRAM window
described in [STM32H747I-DISCO Dual Core](./stm32h747i-disco-dual-core.md).
Left that way, every image byte LVGL reads is an unbuffered single access down
the QSPI bus. Region 1 re-types it as Normal, cacheable, read-only, so the
D-Cache can hold image data and the controller can burst.

Read-only is deliberate: nothing writes it at run time. The contents are
programmed by the flasher.

## 5. Dummy cycles, and why a wrong value looks like a corrupt image

`MT25TL01G_DUMMY_CYCLES_READ` is the value the QSPI controller uses for the
`QUAD_INOUT_FAST_READ` (0xEB) command, both in `MT25TL01G_ReadSTR` and in the
memory mapped configuration. ST's `mt25tl01g_conf_template.h` sets it to 8.
**On this board it has to be 10**, and `include/mt25tl01g_conf.h` overrides it.

Nothing programs the die's volatile configuration register —
`CONF_QSPI_DUMMY_CLOCK` exists in the template but is referenced by no code in
the BSP or the component driver — so the flash keeps its factory default of 10
dummy clocks for 0xEB, and the controller has to agree with it.

With 8, the controller starts sampling two clocks early. In dual-flash QPI the
two dies present eight data lines, so one clock carries one byte, and every
memory mapped read comes back displaced by exactly two bytes.

The failure is worth recognising because of how it presents:

- The flash contents are **correct**. Reading through the external loader
  returns the file byte for byte.
- Only the CPU's memory mapped view is wrong.
- So the firmware runs, images are found at the right addresses, and the panel
  shows a recognisably structured but scrambled picture rather than nothing.

A repeating test pattern will not catch it. A displaced read of `11 22 33 FF`
repeated is still `11 22 33 FF` repeated, rotated. Comparing a real image's
bytes against the file through the CPU path is what exposes it — reading
through `-el` does not, because that uses the loader's own read routine rather
than the memory mapped window.

## 6. Verification status

Measured on the board, not inferred:

| Check | Result |
| --- | --- |
| Section placement | `.ext_flash_images`, 16384 bytes, at `0x90000000`, `CONTENTS, ALLOC, LOAD` |
| Pixel data symbol | `ui_img_probe_map` at `90000000` |
| Descriptor symbol | `ui_img_probe` at `080409b0` — internal, as intended |
| `firmware.bin` | 285704 bytes, not padded across the gap to `0x90000000` |
| `firmware_extflash.bin` | exactly 16384 bytes |
| Programming | `Download verified successfully` through `MT25TL01G_STM32H747I-DISCO.stldr` |
| Read-back at `0x90000000` | `FF332211` — the probe's `11 22 33 FF` pattern |
| Read-back at `0x90004000` | `FFFFFFFF` — erased, so exactly 16 KB was written |
| Runtime | Three PC samples after reset, all differing and none in `board_error_handler`, so `board_external_flash_init()` succeeded and the main loop runs |
| CPU memory mapped read | With `MT25TL01G_DUMMY_CYCLES_READ` at 10, seven offsets spread across a real 198 KB image match the file exactly. At 8 every read was displaced by two bytes. |

A real project — 35 images, 198 KB of them — has been built, flashed and shown
on the panel. Images render, buttons work and screen switching works.

## Related

- [Color Depth](./color-depth.md) — where the flash budget figures come from.
- [STM32H747I-DISCO Dual Core](./stm32h747i-disco-dual-core.md) — the MPU and
  clock configuration this builds on.
