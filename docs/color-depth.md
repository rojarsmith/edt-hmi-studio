# Color Depth

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/color-depth.md">繁體中文</a>
</p>

> **Status on this branch.** `feat/h747-32bit-color` moves the STM32H747I-DISCO
> to 32-bit ARGB8888. It builds, and the change is confirmed present in the
> image by disassembly (§4.1), but **it has not been run on hardware**. The
> bandwidth analysis in §4.3 and §5 is the reason that matters — see §7 for what
> to watch for. `main` remains on 16-bit.

This document records what each board runs, what moving the STM32H747I-DISCO to
32-bit costs, and what the "ARGB8888 via DMA2D" line in ST's material does and
does not mean.

## 1. What each board runs

| Board | Panel | `LV_COLOR_DEPTH` | LTDC layer format | Frame buffer |
| --- | --- | --- | --- | --- |
| STM32F746G-DISCO | 480×272 | 16 | RGB565 | 2 × 255 KB |
| STM32H747I-DISCO | 800×480 | **32** | **ARGB8888** | **2 × 1500 KB** |

For the H747I this is set in three places, and all three have to agree:

| Location | Setting |
| --- | --- |
| `firmware/stm32h747i-disco/include/lv_conf.h` | `LV_COLOR_DEPTH 32` |
| `firmware/stm32h747i-disco/src/board_display.c` | `BSP_LCD_InitEx(..., LCD_PIXEL_FORMAT_RGB888, ...)` |
| `firmware/stm32h747i-disco/src/board_display.c` | `lv_display_set_color_format(display, LV_COLOR_FORMAT_ARGB8888)` |

`src/types/hmi.ts` carries a matching `colorDepth: 32, colorFormat: 'ARGB8888'`
on the board definition. That copy is descriptive for the firmware, but it does
drive the WASM preview — see §6.

Neither setting is a default. `board_display.c` passes the format to
`BSP_LCD_InitEx` explicitly, and `LV_COLOR_DEPTH` is 32 rather than 24 for the
reason in §7.

## 2. "24-bit" on this board means 32 bits per pixel

The BSP offers exactly two pixel formats, and its RGB888 mode does not give a
packed 24 bpp frame buffer. From `stm32h747i_discovery_lcd.c`:

```c
else /* LCD_PIXEL_FORMAT_RGB888 */
{
  ltdc_pixel_format = LTDC_PIXEL_FORMAT_ARGB8888;
  dsi_pixel_format  = DSI_RGB888;
  Lcd_Ctx[Instance].BppFactor = 4U;
}
```

The DSI link carries 24-bit color; the frame buffer is **ARGB8888, 4 bytes per
pixel**. `BppFactor = 4U` is the BSP saying so. There is no packed-24 path short
of bypassing the BSP and configuring `LTDC_PIXEL_FORMAT_RGB888` directly.

So the real choice is 16 bpp or 32 bpp. Asking for "24-bit" gets 32.

## 3. What DMA2D is, and what it is not

ST's material describes the part as supporting *ARGB8888 (32-bpp) via DMA2D*.
Both halves are true, but they are separate facts and the phrasing invites a
wrong conclusion.

**Confirmed from the headers in this tree:**

- The DMA2D peripheral outputs ARGB8888, RGB888, RGB565 and ARGB1555
  (`stm32h7xx_hal_dma2d.h:222`).
- The LTDC layer is what determines the scanned-out format. ARGB8888 support
  comes from the LTDC, not from DMA2D.
- LVGL v9.5 ships a DMA2D draw unit at `src/draw/dma2d`, gated by
  `LV_USE_DRAW_DMA2D`, which **defaults to 0**. This project does not enable it.
- That unit's default `LV_DRAW_DMA2D_HAL_INCLUDE` is literally
  `"stm32h7xx_hal.h"` — it is written for this family.
- It handles D-cache coherency itself (`lv_draw_dma2d_clean_cache` /
  `lv_draw_dma2d_invalidate_cache`), which matters because this project types the
  SDRAM window as cacheable write-back (§5).
- It accelerates output in ARGB8888, XRGB8888, RGB888 **and RGB565**.

Two conclusions follow, and they are the useful part of this section:

**DMA2D does not enable 32-bit color.** The LTDC already does. DMA2D is an
accelerator that can convert and blend in those formats.

**DMA2D does not reduce memory bandwidth.** It moves the same bytes the CPU
would have moved; what it saves is CPU time. It therefore does not answer the
bandwidth objection in §4.

The flip side is the actionable finding: because the DMA2D unit works at RGB565
too, **enabling it is an independent win available at the current 16-bit depth**,
with no increase in bandwidth at all. If the motivation for 32-bit is "the UI
feels slow", try `LV_USE_DRAW_DMA2D 1` first — it is the cheaper experiment by a
wide margin.

Note that the BSP's own DMA2D use is currently switched off as well:
`USE_DMA2D_TO_FILL_RGB_RECT 0` in `include/stm32h747i_discovery_conf.h`. The HAL
module is compiled in (`stm32h7xx_hal_dma2d.c` is in `CMakeLists.txt`), but no
code in this project drives the peripheral today.

## 4. Cost of moving the H747I to 32 bpp

### 4.1 On-chip cost is zero — measured

The change was applied, built with CubeCLT 1.22.0, verified by disassembly, and
reverted. Flash and internal RAM did not move at all:

| | 16 bpp | 32 bpp |
| --- | --- | --- |
| text | 281344 | 281344 |
| data | 812 | 812 |
| bss | 279516 | 279516 |

Identical totals are not a stale build. The two binaries differ, and the
disassembly of `board_display_init` confirms the change took effect:

| Evidence | 16 bpp | 32 bpp |
| --- | --- | --- |
| `BSP_LCD_InitEx` PixelFormat argument | `#2` (`LCD_PIXEL_FORMAT_RGB565`) | `#1` (`LCD_PIXEL_FORMAT_RGB888`) |
| `HMI_FRAMEBUFFER_BYTES` literal | `0x000BB800` = 768,000 | `0x00177000` = 1,536,000 |

The footprint does not move because the frame buffers live in external SDRAM,
and because `lv_conf.h` enables every `LV_DRAW_SW_SUPPORT_*` format regardless of
`LV_COLOR_DEPTH`, so the same blend paths are compiled either way.

### 4.2 SDRAM capacity is fine

800 × 480 = 384,000 pixels.

| | Per buffer | Two buffers |
| --- | --- | --- |
| RGB565 | 750 KB | 1.5 MB |
| ARGB8888 | 1.5 MB | 3 MB |

The two layer slots are `LCD_LAYER_0_ADDRESS = 0xD0000000` and
`LCD_LAYER_1_ADDRESS = 0xD0200000` — 2 MB apart, so a 1.5 MB buffer still fits
without moving anything. The board carries 32 MB of SDRAM.

### 4.3 Bandwidth is the real constraint

The clock chain, read from `src/board.c` and the BSP:

- HSE 25 MHz, `PLLM 5` → 5 MHz, `PLLN 160` → 800 MHz VCO, `PLLP 2` → 400 MHz SYSCLK
- `AHBCLKDivider = RCC_HCLK_DIV2` → 200 MHz AXI/AHB
- `FMC_SDRAM_CLOCK_PERIOD_2` → SDCLK = HCLK/2 = **100 MHz**
- `FMC_SDRAM_MEM_BUS_WIDTH_32`, CAS latency 3, read burst enabled

Theoretical peak is 100 MHz × 4 bytes = **400 MB/s**. Refresh, row
activate/precharge and CAS latency all come off that; a realistic sustained
figure for streaming access is **roughly 200–280 MB/s**. That range is an
estimate, not a measurement.

Scan-out is unconditional — the LTDC reads the whole frame buffer every frame
whether or not anything changed. At ~60 Hz (the flush path's own timeout comment
puts a frame at ~16 ms):

| | Per frame | Scan-out |
| --- | --- | --- |
| RGB565 | 750 KB | ~46 MB/s |
| ARGB8888 | 1.5 MB | **~92 MB/s** |

LVGL renders in `LV_DISPLAY_RENDER_MODE_DIRECT`, straight into the frame buffer,
so rendering writes double as well. Worst case is a continuous full-screen
redraw — an animation, or a slider being dragged:

| | Scan-out + full-screen redraw at 60 Hz |
| --- | --- |
| RGB565 | ~92 MB/s |
| ARGB8888 | **~184 MB/s** |

Against an estimated 200–280 MB/s ceiling, and before counting the M7's own
accesses to SDRAM, 32 bpp leaves very little headroom.

## 5. Why the bandwidth margin is known to be thin

This is not a theoretical concern on this board. `src/board.c` documents a bug
already hit and fixed at **16 bpp**:

> the FMC SDRAM window is typed as Device memory... costs far more FMC bandwidth
> than it should, starving the LTDC and letting its FIFO underrun — which shows
> on the panel as tearing and warped lines while anything redraws continuously.

The fix was an MPU region re-typing the SDRAM as cacheable write-back, with
`board_display.c` cleaning the cache before the LTDC reads a frame. The design
therefore already operates close enough to the FMC bandwidth limit that an
addressing-attribute mistake was visible on the panel. Doubling bytes per pixel
spends the margin that fix bought back.

## 6. Risks that only appear on hardware

**Per-pixel alpha participates in blending.** `MX_LTDC_ConfigLayer` sets
`BlendingFactor1/2 = LTDC_BLENDING_FACTOR_PAxCA` — pixel alpha × constant alpha.
With `LV_COLOR_DEPTH 32`, LVGL's native format is `XRGB8888`, where the top byte
is "don't care" by contract. Any draw path that leaves it at 0 produces fully
transparent pixels, showing the layer's black backcolor instead. Using
`LV_COLOR_FORMAT_ARGB8888` for the display sidesteps this, but the failure mode
is invisible in a build and only shows on the panel.

**Image resources double in flash, or cost conversion time.** The editor emits
image C arrays as RGB565 by default. On a 32 bpp display LVGL converts them at
blit time, or they have to be re-emitted as ARGB8888 — which doubles their flash
footprint. The current image uses 281 KB of the 1 MB bank, so there is room, but
an image-heavy project will feel it.

**Simple layers cover half the area.** `LV_DRAW_LAYER_SIMPLE_BUF_SIZE` is 8 KB.
At 16 bpp that is 4096 pixels; at 32 bpp it is 2048. Widgets that need a layer —
anything with opacity or a transform — get split into roughly twice as many
chunks.

**The editor's Color Depth control does not reach the firmware.** Project
Settings offers 16/24/32 bit and the selection is stored, but each board's
`lv_conf.h` is checked in and nothing rewrites it from the project. Only the WASM
preview substitutes `LV_COLOR_DEPTH` — see
[LVGL Configuration](./lvgl-configuration.md) §1.2 for the same problem with
`memSize`. Changing color depth there today makes the preview and the board
disagree silently. Any real move to 32 bpp should fix that at the same time, or
the setting becomes actively misleading.

## 7. What this branch changed

Three firmware edits, plus the editor side:

1. `include/lv_conf.h` — `LV_COLOR_DEPTH` 16 → **32**. Not 24: LVGL maps
   `LV_COLOR_DEPTH 24` to packed `RGB888`, which is exactly the format the BSP
   cannot scan out.
2. `src/board_display.c` — `HMI_FRAMEBUFFER_BYTES` to `sizeof(uint32_t)`,
   `LCD_PIXEL_FORMAT_RGB888`, and `LV_COLOR_FORMAT_ARGB8888`.
3. `src/types/hmi.ts` — the board definition's `colorDepth` / `colorFormat`.

## 8. What still has to be checked on hardware

Nothing below can be settled by a build, which is why this branch is not a
finished change.

**Tearing and warped lines.** Run a screen that redraws continuously — drag a
slider, or play an animation. That is the LTDC FIFO underrun signature described
in §5, and it is the specific failure the bandwidth doubling in §4.3 risks.

**Transparent or missing content.** If anything renders as black holes or
whole widgets vanish, suspect the alpha byte (§6). The display is configured as
`ARGB8888` rather than LVGL's native `XRGB8888` specifically to avoid this, but
it can only be confirmed on the panel.

**Colour of existing projects.** A project created before this change still
carries `colorDepth: 16` in its stored `lvglConfig`, and that stored value is
what the WASM preview uses. Such a project will preview at 16-bit while its
firmware runs 32-bit. New projects pick up 32 from the board definition.

If it does not hold up, the fallback is not "tune it" — it is §3. Revert to
RGB565 and enable `LV_USE_DRAW_DMA2D` instead, which buys CPU time at no
bandwidth cost at all and works at either depth.

## Related

- [LVGL Configuration](./lvgl-configuration.md) — what each `lv_conf.h` setting
  does, and which project settings actually reach a build.
- [LVGL Version](./lvgl-version.md) — the pinned LVGL release and its build options.
- [STM32H747I-DISCO Dual Core](./stm32h747i-disco-dual-core.md) — the MPU and
  clock configuration referenced above, and the board's recovery procedures.
