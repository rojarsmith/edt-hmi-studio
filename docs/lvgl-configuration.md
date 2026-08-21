# LVGL Configuration

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/lvgl-configuration.md">繁體中文</a>
</p>

A project carries an `lvglConfig` block describing how LVGL itself should be
built for the target — as opposed to the widgets you draw, which are described
by the screen tree.

**The New Project dialog does not ask for any of it.** Every one of these
settings is a property of the hardware, so picking a **Hardware Model Number**
fixes them one-to-one. The values live in `SUPPORTED_BOARDS` in
`src/types/hmi.ts`.

| Setting | Project key | LVGL macro | Source |
| --- | --- | --- | --- |
| Color depth | `colorFormat` | `LV_COLOR_DEPTH` | `board.display.colorFormat` |
| Large font support | `fontLarge` | `LV_FONT_FMT_TXT_LARGE` | `board.lvgl.fontLarge` |
| Default font | `defaultFont` | `LV_FONT_DEFAULT` | `board.lvgl.defaultFont` |
| Memory size | `memSize` | `LV_MEM_SIZE` | `board.lvgl.memSizeKb` — **not currently applied, see §1.2** |

Current boards:

| Board | Display | `fontLarge` | `defaultFont` | `memSizeKb` | Heap lives in |
| --- | --- | --- | --- | --- | --- |
| STM32F746G-DISCO | 480×272 RGB565 | `true` | `montserrat_14` | 4096 | External SDRAM |
| STM32H747I-DISCO | 800×480 ARGB8888 | `true` | `montserrat_14` | 4096 | External SDRAM |
| EDT EVK043027B | 480×272 ARGB8888 | `true` | `montserrat_14` | 1024 | Internal SRAM |

`board.lvgl` mirrors `firmware/<board>/include/lv_conf.h`, which is what the
firmware is actually compiled against. **The two are not generated from one
another — keep them in step by hand when either changes.**

Projects created before this became board-derived keep whatever was stored at
the time; the board definition is applied at creation, not retroactively.

---

## 1. Memory Size

### 1.1 What this memory is

`memSize` is meant to configure **`LV_MEM_SIZE`: the size of LVGL's own internal
heap.** It is not the MCU's total RAM, not the flash/program size, and not the
framebuffer.

LVGL v9 can obtain memory in one of two ways, selected by `LV_USE_STDLIB_MALLOC`:

- **`LV_STDLIB_BUILTIN`** — LVGL manages a single fixed-size byte pool of its
  own and allocates from it with `lv_malloc()` / `lv_free()`. `LV_MEM_SIZE` is
  the size of that pool. It is reserved up front as a static array, so it costs
  that much RAM whether or not the UI ever fills it, and it cannot grow: once
  the pool is exhausted, allocations fail and LVGL logs an out-of-memory error.
- **`LV_STDLIB_CLIB`** — LVGL calls the C library's `malloc()` / `free()`
  instead. `LV_MEM_SIZE` is **ignored entirely** in this mode.

What comes out of that pool is LVGL's *bookkeeping*, roughly:

- widget objects (`lv_obj_t` and each widget type's extra data)
- local styles and style property arrays
- animation descriptors, timers, event handler lists
- text layout caches, and the image/font decoder caches
- intermediate draw buffers such as layers created by `lv_obj_set_style_opa()`
  on a container, or transformed/rotated content

What does **not** come out of it: the display framebuffer and the draw buffers
you hand to `lv_display_set_buffers()`. Those are allocated by the board
integration code, which is why a 480×272 RGB565 panel needs ~255 KB per
framebuffer regardless of what `LV_MEM_SIZE` says.

### 1.2 Current status: stored but not applied

**`memSize` does not currently affect anything that gets built.** It is saved
with the project and round-trips through export/import, but no build path reads
it:

- **WASM preview** — `generateCustomLvConf()` in `vite-plugin-emulator.ts`
  substitutes only `LV_COLOR_DEPTH`, `LV_FONT_FMT_TXT_LARGE` and
  `LV_FONT_DEFAULT` into the template. `LV_MEM_SIZE` is never written. It would
  have no effect anyway: `wasm/lv_conf.h` sets
  `LV_USE_STDLIB_MALLOC LV_STDLIB_CLIB`, so that build uses the C library
  allocator and ignores `LV_MEM_SIZE` by definition.
- **Firmware** — each board's checked-in `lv_conf.h` hardcodes the value and
  nothing rewrites it from the project. All three boards set
  `LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN`, so `LV_MEM_SIZE` is the live setting
  there — it just comes from the file.

Because the project value and the firmware value now come from the same board
definition, they agree; the project copy is simply not the thing the compiler
sees.

One side effect is real: `memSize` is part of the config hash in
`hashLvglConfig()`, so a project whose stored value differs from another's gets
a separate cached LVGL static library even though the output is identical.

**To change the heap for a firmware build, edit that board's `lv_conf.h` — and
update `board.lvgl.memSizeKb` to match.**

### 1.3 Choosing a value for a new board

- Budget by widget count, not by screen count. Screens that are built but not
  displayed still hold their objects in the pool.
- 32–64 KB suits a simple UI of a few dozen widgets. Dense screens with tables,
  charts or tab views want 96–256 KB.
- **Then check §1.4.** A single transformed widget can want more than all of
  that together, and it is the number that actually sizes these boards' heaps.
- Watch for `lv_malloc` failure logs and use `lv_mem_monitor()` to read back
  peak usage rather than guessing.
- Oversizing is not free where the pool sits in internal RAM: it is a static
  reservation that permanently denies that RAM to the rest of the firmware. A
  pool in external SDRAM costs almost nothing by comparison, which is why two
  of the three boards put it there.

### 1.4 Transform layers, and why the heaps are megabytes

A rotated or scaled widget is not drawn in place. LVGL renders it into a
**transform layer** — `lv_obj_style.c` returns `LV_LAYER_TYPE_TRANSFORM` as
soon as `transform_rotation` is non-zero or either scale is not 256 — and that
layer is a single contiguous **ARGB8888** buffer the size of the widget, taken
from the heap this section is about.

Two properties of it decide everything:

- **It cannot be split.** `lv_refr.c` subdivides only `LV_LAYER_TYPE_SIMPLE`
  layers, into strips of `LV_DRAW_LAYER_SIMPLE_BUF_SIZE` (8 KB here). That is
  why a screen-load fade or a container's `opa` costs nothing in comparison: it
  is a simple layer. A transformed one is allocated whole or not at all.
- **It is always 4 bytes per pixel**, whatever `LV_COLOR_DEPTH` says. The layer
  area is the widget plus a 5px margin, and that margin is not covered by the
  widget, so `alpha_test_area_on_obj()` asks for alpha.

So the worst case is `(w + 10) × (h + 10) × 4` for the widget's own size:

| Board | Full-screen widget | 200×200 widget |
| --- | --- | --- |
| STM32F746G-DISCO (480×272) | 553 KB | 179 KB |
| STM32H747I-DISCO (800×480) | 1.5 MB | 179 KB |
| EDT EVK043027B (480×272) | 553 KB | 179 KB |

**What happens when it does not fit is the reason this section exists.** The
allocation failure is not reported and does not degrade: `lv_draw_layer_alloc_buf()`
returns NULL, the software draw unit answers `LV_DRAW_UNIT_IDLE`, and
`lv_draw_dispatch()` simply queues the task again — forever. The frame never
finishes, so the panel never receives another flush and **the whole screen
stays as it was**, every other widget with it. With `LV_USE_LOG` off it happens
in complete silence: no log, no assert, no crash, just a display frozen on
whatever it was showing — usually the blank fill from startup.

That is what a 256 KB heap did to a 200×200 rotated rectangle. The heaps are
now sized so that any widget on the panel can be transformed:

- **F746G and H747I** — the pool moved out of internal RAM into the board's
  external SDRAM, through `LV_ATTRIBUTE_LARGE_RAM_ARRAY` and the `.sdram`
  section. Both linker scripts start their SDRAM region **above** the frame
  buffers, which the BSPs place at fixed addresses the linker knows nothing
  about; without that offset the heap would be laid out straight on top of the
  picture.
- **EDT EVK043027B** — no external RAM exists on this board, so the pool grew
  inside internal SRAM to 1 MB of the 1472 KB left after the frame buffers.
  Overshooting it is a link-time region overflow, not a runtime surprise.

The SDRAM pool is CPU-only memory — no DMA reads it — so it needs no cache
maintenance; it does share FMC bandwidth with the LTDC, which is the price of
a transform being possible at all.

`LV_DRAW_TRANSFORM_USE_MATRIX` would avoid the layer entirely, but it needs a
rendering engine that can do 3×3 matrix transforms and the software renderer
cannot. All three boards run `LV_USE_DRAW_SW`, so the layer is the only path.

---

## 2. The other settings

These three are substituted into the generated `lv_conf.h` for the WASM preview
and do take effect there.

### 2.1 Color depth

`LV_COLOR_DEPTH`, from the board's `display.colorFormat`: RGB565 → 16,
RGB888 → 24, ARGB8888 → 32. Must match what the panel and its driver expect.
The New Project dialog shows it read-only for confirmation.

The F746G runs RGB565; the H747I runs ARGB8888. [Color Depth](./color-depth.md)
covers what that costs, what is still unverified on hardware, and why the
Project Settings control for this does not currently reach the firmware.

### 2.2 Large font support

`LV_FONT_FMT_TXT_LARGE` widens the internal offsets in LVGL's compressed font
format. Needed once a converted font's glyph data grows past the 16-bit range —
large point sizes, or a wide CJK glyph set. Leaving it on costs a small amount
of font-table size; leaving it off with an oversized font produces corrupted
glyphs. Both boards enable it. See [Font Integration](./font-integration.md).

### 2.3 Default font

`LV_FONT_DEFAULT`, the font used by any widget that does not set one of its own.
Both boards use LVGL's built-in `montserrat_14`. Custom uploaded fonts are
assigned per widget instead, so this is only the fallback.
