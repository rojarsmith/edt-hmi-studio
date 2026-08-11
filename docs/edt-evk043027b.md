# EDT EVK043027B

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/edt-evk043027b.md">繁體中文</a>
</p>

> **Status.** Builds, flashes and boots. **The panel does not light yet** — the
> cause is not yet known, and §7 is the procedure for finding it. Build, flash
> and memory layout are verified; anything past the flasher is not.

The EVK043027B is the 4.3" member of EDT's EVKxxxx27B family, built on an
STM32U599NJH6Q. It is the first supported board that is not an ST Discovery kit,
and that difference shows up in three places: how it is programmed, how it
reaches a PC, and where its drivers come from.

## 1. What the board is

| Item | Value |
| --- | --- |
| MCU | STM32U599NJH6Q, Cortex-M33 at 160 MHz |
| Internal Flash | 2 MB — bank 1 of two; see §3 |
| SRAM | 2496 KB contiguous from `0x20000000` |
| Display | 480 × 272 parallel RGB, driven by the LTDC |
| Colour | ARGB8888, 32 bpp — see [color-depth.md](./color-depth.md) |
| Frame buffers | two, 510 KB each, in internal SRAM at `0x20000000` |
| Touch | Atmel maXTouch MXT336U on I²C2 (PH4/PH5) |
| Backlight | TIM3 CH3 PWM on PE5, ~320 Hz |
| External Flash | Macronix MX25LM51245G, 64 MB, OctoSPI1, mapped at `0x90000000` — mapped but unused, see §4 |
| Modbus link | **USART2 over RS-485**, driver-enable on PD4 |
| Programming | **standalone ST-LINK/V2** on the SWD header |

## 2. The two cables

This is the part that differs most from the Discovery boards, where one USB
cable does everything.

**Flashing** goes through a separate ST-LINK/V2 probe plugged into the board's
SWD header. That probe has no idea what it is connected to, so it reports no
board name — Windows Device Manager shows it as `STM32 STLink`, and
`STM32_Programmer_CLI -l st-link-only` leaves its `Board Name` field empty.

The editor's board-identity check accounts for this. `probeBoardPattern` is
`null` for this board in `src/types/hmi.ts`, and instead of matching a name the
flasher connects once without writing anything and compares the reported
**device ID** against `0x481` (STM32U59x/5Ax). That will not tell this board
from another STM32U599 design, and does not claim to; what it stops is an image
built for an F746 or an H747 landing here, where a wrong flash size and a wrong
external loader do lasting damage.

**The USB Type-C port** enumerates as `USB Serial Device (COMxx)` — the MCU's own
USB CDC, `STM32 Virtual ComPort`. **The HMI runtime does not use it.** It is the
vendor demo firmware's debug console, and once this firmware is flashed the port
stops appearing at all. Do not select it in the Communication tab.

## 3. Only bank 1 of the Flash

The STM32U599NJ has 4 MB of Flash arranged as two 2 MB banks. This template
links into bank 1 alone: `STM32U599NJHXQ_FLASH.ld` declares
`FLASH : ORIGIN = 0x08000000, LENGTH = 2048K`, and bank 2 is left erased and
outside the image. The vendor package's own linker script does the same.

Nothing here needs the space — a build with a full-screen image comes to about
484 KB, images included (§4). Adding bank 2 would mean deciding what belongs
there and teaching the flasher to program a second region, for storage nothing
currently asks for.

`server/hmi/imageLayout.ts` classifies `0x08000000`–`0x081FFFFF` as internal
flash, which is exactly bank 1, so the Image Placement view reports this board
correctly with no change.

## 4. Images stay in internal flash

Unlike the STM32H747I-DISCO, **this board does not put image resources in
external flash**, and `HMI_IMAGES_IN_EXTERNAL_FLASH` is not defined in its
`CMakeLists.txt`.

The H747I has no choice: 1 MB of internal flash, ~285 KB of it firmware, against
a single 800×480 ARGB8888 background of 1500 KB. Here the arithmetic is not
close:

| | Internal flash | Firmware | One full-screen background |
| --- | --- | --- | --- |
| STM32H747I-DISCO | 1 MB | ~285 KB | 1500 KB — does not fit |
| EDT EVK043027B | **2 MB** | ~285 KB | **510 KB** (480×272×4) |

A project with a full-screen image builds to about 484 KB, or 23% of bank 1.
Several more would still fit. Reaching for external flash here would buy nothing
and would make every flash depend on an external loader.

The NOR is still fitted, and `board_external_flash_init` still maps it at
`0x90000000`, so a project that genuinely outgrows internal flash has somewhere
to go. Two things have to change together to use it: `externalFlash` on the
board definition in `src/types/hmi.ts`, and the `HMI_IMAGES_IN_EXTERNAL_FLASH`
define in `CMakeLists.txt`. Then
[images-external-flash.md](./images-external-flash.md) applies unchanged.

**Before doing that, the loader problem has to be solved.** ST's
`MX25LM51245G_STM32U599J-DK.stldr`, which ships with CubeProgrammer, is the
obvious candidate and does not work here:

```
Erasing external memory sectors [0 2]
Error: failed to erase memory
```

What has been ruled out: the copy in the vendor EVK package under
`STM32CubeIDE/` is **byte-identical** to CubeProgrammer's (same MD5), so it is
not a stale-file problem. Disassembling the loader shows it references GPIOA,
GPIOC and GPIOF — the same ports this board's OctoSPI uses — and it does carry
`MX25LM51245G_ResetEnable` / `ResetMemory` / `OSPI_NOR_ExitOPIMode`, so it is not
defeated by the part being left in octal SOPI mode by a previous run. What
differs between the two boards, and is the remaining suspect, is the clock
configuration the loader sets up for itself: this board runs a 25 MHz HSE in
**bypass** (a powered oscillator, not a crystal), which the DK does not.

Bringing the NOR up from our own firmware is the fiddly part, and
`board_external_flash_init` in `firmware/edt-evk043027b/src/board.c` says why at
each step. In short: the part wakes in 1-1-1 SPI, has to be reset in all three
protocols it might already be in, then told its dummy-cycle count **before**
being switched to octal STR mode, and only then memory-mapped. Reads before that
return bus faults, not data.

## 5. Modbus RTU over RS-485

The Discovery boards speak Modbus over a UART wired to their on-board ST-LINK's
virtual COM port, so a PC sees it directly. This board has no such path: USART2
goes to an RS-485 transceiver, which is the field wiring Modbus RTU is for.

**A PC therefore needs a USB-to-RS-485 adapter to talk to it.** The workflow is
otherwise unchanged — the Communication tab's COM port is the adapter's, and
`tools\modbus-rtu-test-server.ps1` runs on it the same way.

One consequence is worth stating plainly, because it has no local symptom.
PD4 is the transceiver's driver-enable, and the USART drives it itself once
`HAL_RS485Ex_Init` has set the DEM bit. `HAL_UART_Init` rewrites CR3 wholesale
and clears that bit. The shared `hmi_runtime.c` re-initialises the UART when it
applies the project's baud rate and parity, so **this board's copy of
`configure_uart` routes through `board_uart1_apply` instead** — the one place
that knows this USART is RS-485. Undo that and the firmware transmits happily
into a transceiver that never enables, and every transaction simply times out.

## 6. Where the drivers come from

There is no `stm32XXX-disco-bsp` repository for this board, so
`scripts/bootstrap-deps.ps1` is much shorter than the Discovery boards'. It
fetches only what is genuinely upstream:

| Dependency | Pin | Why that version |
| --- | --- | --- |
| STM32U5 HAL | v1.6.2 | what the vendor EVK package ships |
| CMSIS Device U5 | v1.4.2 | what the vendor EVK package ships |
| CMSIS Core | v5.6.0 | first release with `core_cm33.h`; the other boards' v5.4.0 has no Armv8-M header |
| LVGL | v9.5.0 | same pin as every other board |

The panel, touch and NOR drivers are carried in
`firmware/edt-evk043027b/vendor/`, verbatim, so a later drop from the firmware
department can replace the directory wholesale. `vendor/README.md` explains the
rules; the short version is that `include/main.h` is the seam between the
vendor's CubeMX-shaped expectations and this runtime, and edits belong there
rather than in the vendored files.

`edt_bsp_lcd.c` is deliberately *not* vendored — it drives a FreeRTOS task that
blanks the panel on an idle timeout, and this runtime has no scheduler.
`src/board_display.c` supplies the four functions the touch driver actually
reaches into it for.

## 7. First run on hardware: what to check, in order

**Start with the LED on PB14.** It is the only output that does not depend on
the panel, its backlight or the switched supply rail, which makes it the one
thing that separates "the firmware is not running" from "the firmware is running
and the display is misconfigured" — no debugger needed:

| What the LED does | What it means |
| --- | --- |
| **Steady 1 Hz blink** | The main loop is turning. The firmware is fine; the fault is in the panel, the backlight or the LTDC — go to step 1 |
| **Repeating burst of N flashes** | `board_error_handler`. Count the flashes: N = `board_init_stage` + 1, so 1 flash is `BOARD_STAGE_RESET`, 5 is `BOARD_STAGE_CACHE`, and so on |
| **Nothing at all** | Never reached `main`. Suspect the flash itself, the option bytes, or the clock/power config before the LED is even set up |

That third case is worth ruling out first, because everything below assumes the
firmware runs.

With a debugger, `board_init_stage` is the same information exactly. Halt the
core and `p board_init_stage`:

| Flashes | Value | Meaning |
| --- | --- | --- |
| 1 | `_RESET` | never got out of reset |
| **2** | `_HAL` | **`HAL_PWREx_ConfigSupply` failed — see below** |
| 3–4 | `_POWER`, `_CLOCK` | supply committed but the 160 MHz PLL failed |
| 5 | `_CACHE` | reached the caches; if the board is dead here an image fetch faulted |
| 6–8 | `_EXTERNAL_FLASH`, `_TOUCH_BUS`, `_UART` | past the display-independent hardware |
| 9 | `_PANEL_POWER` | panel enables and the supply rail are driven |
| 10 | `_LTDC_CLOCK` | PLL3 configured and the LTDC **bus** clock enabled |
| 11 | `_LTDC_CONFIG` | LTDC registers read back as written |
| 12 | `_LTDC` | **raster confirmed scanning** — the pixel clock is real |
| 13–14 | `_BACKLIGHT`, `_TOUCH` | backlight PWM running, maXTouch answered |
| 15 | `_DISPLAY` | LVGL bound to the display |
| 16 | `_RUNNING` | in the main loop |

**Two flashes means the PWR peripheral has no clock.** On the STM32U5, PWR is
gated by `RCC_AHB3ENR_PWREN`; with that clock off, every PWR register write is
discarded and every read returns zero, so `HAL_PWREx_ConfigSupply` polls
`PWR->SVMSR` for a bit that can never change and returns `HAL_TIMEOUT`.
`board_init` then stops at its first step — the clock tree, the OctoSPI and the
whole display are never reached, and the only outward symptom is a dark panel.

Nothing supplies that clock unless the board does: `HAL_Init` calls
`HAL_MspInit`, which is **weak and empty in the HAL**. The vendor package's
`stm32u5xx_hal_msp.c` is where it lives for them, and `HAL_MspInit` in
`src/board.c` is the port of it. It is three lines, it has no other purpose, and
without it nothing on this board works at all.

Stages 10 to 12 exist because the HAL cannot be trusted here either, and because
the LTDC has two clocks that fail independently.

`HAL_LTDC_Init` and `HAL_LTDC_ConfigLayer` write registers and return `HAL_OK`
without reading anything back, so **with the bus clock off every write is
discarded and both still report success** — a dark panel with no error anywhere.
`HAL_LTDC_MspInit` is a `void` callback and cannot report a failed PLL3 either.
So `ltdc_clock_ready` carries that result out by hand, and `ltdc_is_configured`
re-reads `GCR`, `TWCR`, the layer `CR` and `CFBAR` to make the controller prove
it took the configuration.

That still is not enough, which is what stage 12 is for. Every register above
lives on the **bus** clock; the panel is driven by the **pixel** clock from
PLL3R. With the pixel clock stopped the controller accepts and returns every
write, reads back as enabled, and points at the right frame buffer, while the
connector gets no DCLK, no HSYNC and no DE whatsoever. The two states are
indistinguishable from the register side. `ltdc_is_scanning` watches `CPSR`,
the raster's current position, which only advances while the pixel clock runs.

**So an image that reaches stage 12 is genuinely driving the panel.** If it does
and the screen is still blank, stop looking at the LTDC.

Then, in order:

1. **Turn on the colour bars.** Rebuild with
   `-DHMI_DISPLAY_BRINGUP_PATTERN_MS=10000` — it is **off by default**, so a
   normal build boots straight into the UI. `board_display_init` then paints
   red / green / blue / white bars straight into the frame buffer — not through
   LVGL — and holds them for that long before handing over. This is the single
   most useful test on the board, because it cuts the display path in half:

   | What you see | What it means |
   | --- | --- |
   | Correct bars, then the UI | Everything below LVGL works |
   | Correct bars, then nothing | LTDC, panel and backlight are fine; the fault is LVGL or `display_flush` |
   | Wrong colours or wrong order | Pixel format mismatch — see step 2 |
   | Nothing at all | The fault is below LVGL: backlight, panel enables, or the LTDC. Nothing about the UI is worth looking at yet |

   Immediately before holding the bars, the backlight is **ramped up and down
   three times** over about 1.3 seconds. This exists because a backlit panel
   showing black and an unlit panel look nearly identical across a room, which
   is the ambiguity that makes "no picture" so hard to act on:

   | During that ramp | What it means |
   | --- | --- |
   | The panel visibly brightens and dims | PE5, TIM3 and the backlight driver all work — the fault is the LTDC data path or the panel's own supply |
   | Nothing changes at all | The backlight or the panel's power is the fault. Check LCD_CTRL (PH13), LCD_RESET (PH15) and the switched rail FS_PW_SW (PI15), then PE5 with a scope |

   Both the bars and the ramp live behind the same switch, and both are off in a
   normal build — they exist for the next panel in this family, not for
   shipping firmware.

   The trap here has bitten once already, and it is silent.
   `HAL_TIM_MspPostInit` — the function that puts PE5 into AF2 — is **a CubeMX
   convention, not a HAL callback**. Nothing in the HAL calls it; the generated
   `MX_TIM3_Init` does, explicitly, and `backlight_init` in `board_display.c`
   has to do the same. Leave that call out and the HAL reports success at every
   step, LVGL renders, the LTDC scans, and the panel is simply black, because
   PE5 never left its reset state and the backlight driver never saw a PWM edge.
   The HAL also declares no prototype for it, so the definition just sits there
   as dead code the linker drops. `arm-none-eabi-nm firmware.elf | grep
   MspPostInit` is the one-line check that it is in the image.
2. **Is the picture the right shape but wrong colour, or skewed a fraction of a
   pixel per line?** Then `LTDC_PIXEL_FORMAT_ARGB8888`, `LV_COLOR_DEPTH 32`,
   `LV_COLOR_FORMAT_ARGB8888` and `HMI_DISPLAY_BYTES_PER_PIXEL` have drifted
   apart. All four have to agree — see [color-depth.md](./color-depth.md) §1.
3. **Does touch land in the wrong place?** `board_touch_log` in
   `board_display.c` records what the controller actually reports. Touch the
   four corners and dump it with `x/12dw &board_touch_log`; the orientation is
   fixed at `TS_SWAP_Y` inside the vendored driver, which is the vendor
   package's choice for this panel.
4. **Do images show as noise?** Images live in internal flash (§4), so this is
   not an OctoSPI problem — suspect the colour format in step 2 instead.
   `board_external_flash_ready` reports whether the NOR came up, but nothing
   reads it while `HMI_IMAGES_IN_EXTERNAL_FLASH` is off, so a false there is
   currently harmless.
5. **Do Modbus transactions all time out?** Check the DE line on PD4 with a
   scope before anything else — see §5.

## See also

- [images-external-flash.md](./images-external-flash.md) — how image resources
  are linked, split out and programmed
- [color-depth.md](./color-depth.md) — what each board runs, and why
- [lvgl-configuration.md](./lvgl-configuration.md) — `LV_MEM_SIZE` and friends
