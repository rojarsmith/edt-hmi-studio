# EDT EVK043027B

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/edt-evk043027b.md">繁體中文</a>
</p>

> **Status.** Working on hardware: builds, flashes, boots, the panel lights, and
> the Type-C port enumerates as a COM port carrying Modbus. Confirmed by eye on
> a board — the colour bars of §7 came up in the right order, which also
> verifies the 32-bit pixel format end to end.
>
> Not yet exercised: a full Modbus round trip against a PC-side server, and
> touch. §7 remains the procedure when something does not come up.

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
| Modbus link | **USB CDC on the Type-C port** — a virtual COM port; see §5 |
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
USB CDC, reporting as `STM32 Virtual ComPort` on VID 0x0483 / PID 0x5740. **This
is the Modbus link**, and it is the port to pick in the Communication tab. It
needs no driver: Windows binds its inbox `usbser.sys` to that identity.

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

## 5. Modbus RTU over the USB virtual COM port

The Discovery boards speak Modbus over a UART wired to their on-board ST-LINK's
virtual COM port, so a PC sees it directly. This board has no such path: its
ST-LINK is a separate probe. What it does have is a USB device peripheral of its
own, so **the Type-C port is the virtual COM port**, and that is what carries
Modbus.

The workflow is therefore the same as the Discovery boards': plug the Type-C
cable in, pick the port in the Communication tab, and run
`tools\modbus-rtu-test-server.ps1` on it. No adapter, no driver.

| | Value |
| --- | --- |
| Peripheral | USB_OTG_HS, embedded HS PHY, PA11/PA12 = D-/D+ |
| Identity | VID 0x0483, PID 0x5740, `STM32 Virtual ComPort` |
| Windows driver | inbox `usbser.sys`, bound by that VID/PID |
| Appears as | `USB Serial Device (COMxx)` |

Three things in `HAL_PCD_MspInit` are each individually fatal to enumeration and
have no equivalent elsewhere in this firmware: the PHY needs its own kernel
clock *and* a reference-clock selection, VDDUSB is an isolated supply domain
that reads as dead until enabled, and the HS transceiver has a further supply
plus a SYSCFG enable of its own. All are taken from the vendor package.

### What a USB transport does not have

**A baud rate.** The host sets one with `SET_LINE_CODING` and nothing on the
wire honours it — bytes cross as USB transfers, at USB's pace. The Protocol
tab's baud rate is still used, as the number the RTU **inter-frame silence** is
derived from, so it remains a real setting rather than a dead control. Parity
and stop bits are stored, echoed back to the host, and otherwise ignored.

**A per-byte interrupt.** A UART hands the client one byte at a time; USB hands
over whole packets, and a response may arrive in one packet or several. So
`hmi_usb_cdc.c` buffers received bytes in a ring and
`modbus_rtu_async_poll` drains them. The client's framing logic — count the
bytes the response should have, then check the CRC — is unchanged from the UART
boards, which is why `consume_rx_byte` is body-for-body their
`HAL_UART_RxCpltCallback`.

**Back pressure.** A queued frame either goes or does not; there is no partial
write. `hmi_usb_cdc_write` refuses while a previous frame is in flight, and the
client treats that as an I/O error and retries.

The panel does not require a host. With nothing plugged in, `board_usb_ready` is
still true, the HMI runs normally, and Modbus transactions time out — the same
behaviour as an RS-485 bus with nothing on the other end.

### The RS-485 transceiver

Still fitted, on USART2 with its driver-enable on PD4, and **still brought up at
boot**: `board_init` calls `board_uart1_apply(115200, 8N1)`, which opens the port
through `HAL_RS485Ex_Init` rather than `HAL_UART_Init` — so the USART raises DE
around each transmitted frame itself — and then disables the FIFOs, so the
client sees inter-frame gaps as they actually fall. `USART2_IRQHandler` is
vectored into `HAL_UART_IRQHandler(&huart1)` alongside it.

What the port does not have is a **protocol client**. `g_modbus_client`'s
transport on this board is the USB CDC ring, and nothing else in the firmware
reads or writes `huart1`. So a project that needs the field bus rather than a PC
link is one binding away rather than a bring-up away: the transport primitives —
declared at the head of `modbus_rtu_async_client.c` and defined at its foot,
which is the whole of what differs from the Discovery boards' copies — are the
place to reconnect, and git history before this change has them wired to the
UART. Why that distinction decides how a second link gets added is
[protocol-coexistence.md](./protocol-coexistence.md) §12.2.

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
5. **Do Modbus transactions all time out?** Check that Windows lists
   `USB Serial Device (COMxx)` and that `board_usb_ready` is true. No COM port
   means USB did not come up (§5), which is not a Modbus problem at all.

## See also

- [images-external-flash.md](./images-external-flash.md) — how image resources
  are linked, split out and programmed
- [color-depth.md](./color-depth.md) — what each board runs, and why
- [lvgl-configuration.md](./lvgl-configuration.md) — `LV_MEM_SIZE` and friends
