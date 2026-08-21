# Display orientation — Landscape and Portrait — evaluation

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/display-orientation.md">繁體中文</a>
</p>

Status: **evaluated, then built.** §1–§13 are the evaluation as written before
any code existed; §14 records what was implemented and where the evaluation was
wrong. Verified against the source and against one real linker map, not from
memory.

The proposal: the New Project dialog gains a **Display Orientation** field next
to Hardware Model Number, offering **Landscape** and **Portrait**. Landscape is
the default when the board says nothing; both `EDT EVK043027B` and
`STM32H747I-DISCO` default to Landscape. Portrait turns the design canvas 90°
clockwise about its centre — for a rectangle that is a width/height swap, for a
round panel it is nothing at all (§10).

Verdict up front, in two halves:

- **The editor half is nearly free**, and one invariant is why (§2). About forty
  call sites already read the canvas size from one place; if that place holds
  the *rotated* size, all forty are correct without being touched. Four places
  are not free, and one of them is an active bug waiting to happen (§4.1).
- **The firmware half is not one job but three**, and the three boards give
  three different answers. On the **H747I it is free** — that panel rotates
  itself in hardware and the BSP already has the switch (§8.1). On the **F746G
  and the EDT it is not**, because their panels are parallel RGB with no scan
  rotation, LVGL's software rotation is incompatible with the render mode all
  three boards use, and on the EDT the memory budget forbids the obvious way out
  (§8.4). The measured figure is **437 KB of SRAM free** against a 510 KB
  buffer.

So the honest shape of the work is: cheap in the editor, cheap on one board, and
a real display-driver rewrite on the other two.

---

## 1. What is being asked, precisely

Four separate things hide inside "orientation", and they cost wildly different
amounts. Naming them first keeps the rest of this document from sliding between
them.

| | Meaning | Where it bites |
|---|---|---|
| **Logical resolution** | The coordinate space the designer lays widgets out in. 272×480 for a portrait EDT. | Editor, previews |
| **Physical resolution** | What the panel scans. Always 480×272 on the EDT, whatever the project says. | Firmware, frame buffers |
| **Rotation** | The transform between the two. | Display driver |
| **Touch transform** | The *same* rotation applied to input, in the opposite direction. | Display driver |

The editor only ever needs the first. The firmware needs all four, and the third
and fourth are where the cost lives.

One more thing this is *not*: rotating an existing project's widgets. At
creation time the canvas is empty, which removes the hardest part of the feature
entirely. §6 is about whether to give that part back later.

## 2. The invariant that decides the editor cost

There are two ways to store this, and only one of them is cheap.

**(A) `display.width`/`display.height` hold the logical, post-rotation size.** A
portrait EDT project stores `480×272` on the board and `272×480` on the project.
Nothing downstream knows rotation exists.

**(B) They hold the panel's physical size, and every consumer swaps on read.**

The cheapness of (A) is measurable. Every canvas consumer in the editor reads
`canvas.width`/`canvas.height` out of `editorStore`, which is loaded from
`config.display` at exactly three points (`App.tsx:101`, `App.tsx:297`,
`ProjectListPage.tsx:116`). Under (A) those three lines are the *only* places
that need to know, and they already do the right thing. Under (B), every one of
these becomes a site that can be wrong:

| Consumer | Reads | Under (A) |
|---|---|---|
| Design canvas | `Canvas.tsx:870`, `:978` | free |
| Canvas centring / Ctrl+0 | `Canvas.tsx:830` → `canvasView.ts` | free |
| Align & distribute, 10 sites | `AlignToolbar.tsx:53`–`:231` | free |
| Quick Preview | `PreviewPanel.tsx:1121`, `:1144` | free |
| Build & Run | `CompilePreview.tsx:211` | free |
| Screen transitions (slide distance) | `PreviewPanel` transition code | free |
| Card thumbnail | `ProjectCard.tsx:102` | free |
| Rubber-band, drag clamping, parent sizing | `Canvas.tsx:930` | free |

**Recommendation: (A).** Write the invariant down where `DisplayConfig` is
declared, because it is the kind of thing that gets quietly violated:

> `ProjectConfig.display.width/height` is the **logical** resolution — what the
> designer draws in and what LVGL is told the display is.
> `BoardDefinition.display.width/height` is the **physical** panel. They differ
> exactly when the orientation is not the board's native one.

## 3. Where the new state lives

`DisplayConfig` already has a rotation field, and it is dead:

```ts
// src/store/projectStore.ts:36
export interface DisplayConfig {
  width: number;
  height: number;
  colorDepth: 16 | 24 | 32;
  rotation: 0 | 90 | 180 | 270;   // written as 0 in four places, read in none
}
```

Written at `projectStore.ts:133`, `:714`, `NewProjectDialog.tsx:45` and one test
fixture. Never read. `grep -rn "display.rotation"` returns nothing; the only
live `rotation` in the codebase is the *image widget's* (`ui.c.ts:852`), which
is unrelated.

Three options:

1. **Give `rotation` a meaning** and derive orientation from it. Rejected: 180°
   is landscape, so `orientation` and `rotation` would be two fields that can
   disagree, and disagreement is the thing this codebase keeps designing out
   (see the board-derived display settings in `ProjectSettings.tsx:31`).
2. **Add `orientation` beside `rotation`.** Same problem, plus a dead field.
3. **Replace `rotation` with `orientation`.** Nothing reads it, so nothing
   breaks.

**Recommendation: (3).** A 180° mount is a genuinely different concern — it is
about how the panel is screwed into the enclosure, not about how the UI is laid
out — and it can arrive later as its own field, on its own evidence, without
having pre-emptively muddled this one.

```ts
export type DisplayOrientation = 'landscape' | 'portrait';
```

And on the board, so a future portrait-native panel can say so:

```ts
// src/types/hmi.ts — BoardDefinition.display
/** Which way up this board's UI is designed when the project does not say.
    Absent means landscape. */
defaultOrientation?: DisplayOrientation;
/** Orientations the firmware can actually drive. Absent means both. */
orientations?: readonly DisplayOrientation[];
```

Neither existing board needs to set `defaultOrientation` — absent already means
landscape, which is what both want. That is the field earning its keep by
staying empty.

`orientations` is not decoration. §8 ends with the EDT and the F746G needing a
driver rewrite before portrait works there at all, and until that lands the
dialog must not offer an orientation that produces a build which compiles and
then renders garbage. This is the same shape as `ProtocolDefinition.implemented`
(`hmi.ts:19`), which exists for exactly this reason.

## 4. What the editor does *not* get for free

Four places. The first is the one that matters.

### 4.1 Project Settings silently un-rotates the project

`ProjectSettings.tsx:44` re-derives the display from the board on every save:

```ts
const display = {
  ...config.display,
  width: board.display.width,     // ← 480, always
  height: board.display.height,   // ← 272, always
  colorDepth: board.display.colorDepth,
};
// ...
setCanvasSize(display.width, display.height);
```

That re-derive is deliberate and good — it repairs projects created before a
board definition changed, and the comment above it says so. But under invariant
(A) it takes a portrait project, writes the panel's landscape numbers over the
logical ones, and resizes the canvas underneath the widgets. The user opens
Project Settings to rename the project and the layout is destroyed.

The fix is one line of intent: re-derive *through* the orientation.

```ts
const { width, height } = logicalResolution(board, config.display.orientation);
```

Worth extracting as a single exported function in `types/hmi.ts` and using it
everywhere the pair is computed — the New Project dialog, Project Settings, and
the import path — so there is one definition of "what size is this project"
rather than three that agree today.

### 4.2 Existing projects need a default, and `normalizeProjectConfig` is where it goes

`projectStore.ts:212` already does exactly this job for `protocol`,
`communication` and `canBus`, with the reasoning written down: projects created
before a field existed carry no value, and there is a correct answer for all of
them. Orientation is the same case — every project that exists today is
landscape. One more line in that function, no migration step, no version bump.

The import path at `projectStore.ts:711` needs the same fallback, and
`ProjectFile.display` in `resources/types.ts:176` needs the field so exports
round-trip. `exportProject` writes `display: config.display` wholesale
(`projectStore.ts:697`) so that half is already done.

Note that `ProjectFile.canvasSize` (`:661`) is written from `config.display`
and, under (A), is *already* the logical size — which is what a field called
`canvasSize` should mean. It needs no change, and that is a small piece of
evidence that (A) is the right model.

### 4.3 Hardware Information conflates the board with the project

`HardwareInfoDialog.tsx:77` shows `board.display.width × board.display.height`
under "Resolution". For a portrait project that is true of the panel and false
of the project, and the dialog gives no clue which it meant. It should show
both, which is more informative than what it shows today even in landscape:

```
Panel          480 × 272 (landscape)
Design canvas  272 × 480 (portrait)
```

`frameBufferBytes` at `:61` is correct as-is — the frame buffer is a property of
the panel and does not change size when the content is rotated. Worth a comment
saying so, because it looks like an oversight.

The same split applies to the New Project dialog's hint line
(`NewProjectDialog.tsx:118`), which should show the resolution the user is about
to *design in*, updating live as the orientation select changes. That is the
field's entire feedback loop and it is two string interpolations.

And to the project card (`ProjectCard.tsx:163`), where `272 × 480` is the right
thing to print — it is what the card's thumbnail is showing. The thumbnail
itself needs nothing: `.project-card-thumb-img` is `object-fit: contain`
(`ProjectCard.css:36`), so a portrait sketch letterboxes correctly in the 140 px
band.

### 4.4 The LVGL Preview is already wrong, and portrait makes it visible

`wasm/src/main.c:35`:

```c
display = lv_sdl_window_create(480, 320);
```

480×320 is not any of the three boards. And the hook that would fix it is a stub
(`main.c:22`):

```c
EMSCRIPTEN_KEEPALIVE
void set_screen_size(int w, int h) {
    /* For now we just recreate the display at the requested size.
       A full implementation would resize the SDL window. */
    (void)w; (void)h;
}
```

The canvas size *is* sent to it — `editorStateToJson` puts it in the payload
(`editorStateToJson.ts:141`) — and it is ignored on arrival.

This is a pre-existing defect, not one this feature creates.
[preview-ladder.md](./preview-ladder.md) §3 says of this rung that it proves
"real LVGL agrees about the widgets"; it has been proving that at the wrong
resolution the whole time. But today the error is a modest one (480×320 versus
480×272 — same orientation, close enough to look plausible), and portrait turns
it into a screen that is visibly the wrong shape. **This feature does not have
to fix it, but it will be blamed for it.** Worth fixing in the same change, or
worth an explicit note in the Preview tab that this rung does not honour the
project's resolution.

For contrast, **Build & Run needs nothing**: it passes `canvas.width` and
`canvas.height` straight through to `generateMainWrapper`
(`CompilePreview.tsx:211` → `vite-plugin-compile.ts:197`), which substitutes
them into a `lv_display_create(disp_width, disp_height)`
(`vite-plugin-compile.ts:289`) and sizes the framebuffer readback from the same
pair. That rung is correct on day one, which makes it the rung that proves
portrait works before any firmware is touched.

## 5. The code generator needs nothing, and that is not luck

Two properties of the generated C make orientation invisible to it:

1. **Screens are created with `lv_obj_create(NULL)`** (`ui.c.ts:1808`), which
   sizes the object to whatever LVGL believes the display is. Nothing in the
   generated code states a screen size, so nothing can disagree with the driver.
2. **Widget geometry is absolute and already in logical coordinates**
   (`ui.c.ts:1476`). `lv_obj_set_pos` / `lv_obj_set_size` on a rotated display
   are in the rotated frame, which is the frame the editor stored.

So `generateCode()` is untouched, and every generated `.c` for a portrait
project is byte-identical in structure to a landscape one. The rotation lives
entirely in the display driver, which is the correct place for it: it is a
property of how the pixels reach the glass, not of what the UI is.

The one thing the generator *does* need to emit is the orientation itself — §9.

## 6. Should orientation be changeable after creation?

**Recommendation: no.** Fix it at creation, exactly as the protocol is fixed
(`NewProjectDialog.tsx:125` — "Fixed for the life of the project"). Two reasons,
one weak and one strong.

The weak one: rotating the *bounding boxes* is trivial. A design surface going
from W×H to H×W clockwise maps

```
x' = H - y - h      y' = x      w' = h      h' = w
```

and that is twenty lines including the undo entry.

The strong one: **that transform is wrong for the widget contents.** It rotates
the boxes and leaves everything inside them upright — a 200×40 label becomes
40×200 with its text still running left-to-right through a column 40 px wide,
which is not what anyone rotating a design means. Arc start/end angles, image
`rotation` props (`ui.c.ts:852`), chart axes and text alignment all have a
rotational meaning the box transform does not touch. A correct "rotate this
project" command is a design job about what each of the sixteen widget types
should do, not a geometry job — and it is a separate feature that happens to
share a word with this one.

Recording the box transform here is still worth it, because when that feature is
asked for, this is the part that was already settled.

Two consequences to accept and state in the UI: the orientation select sits in
**New Project only**, not Project Settings; and switching boards inside the New
Project dialog must re-clamp the orientation the way it already re-clamps the
protocol (`NewProjectDialog.tsx:107`), in case the new board's `orientations`
does not include the current choice.

## 7. Editor summary

| Change | Size |
|---|---|
| `DisplayOrientation` type, `orientations` / `defaultOrientation` on the board, `logicalResolution()` helper | small, `types/hmi.ts` |
| `DisplayConfig.rotation` → `orientation` | small, 4 write sites + 1 fixture |
| New Project dialog: select, live hint, board-switch clamp | small |
| `normalizeProjectConfig` default + import fallback + `ProjectFile.display` | small |
| **Project Settings re-derive through orientation** | small, **required, §4.1** |
| Hardware Info: panel vs design canvas | small |
| WASM preview honours the sent resolution | medium, pre-existing, §4.4 |
| Code generator | **none**, §5 |

Everything above is a day or two, and Build & Run gives it a working end-to-end
demonstration without any firmware at all.

## 8. The firmware, board by board

This is the rest of the estimate.

### 8.1 STM32H747I-DISCO — free, and the switch is already there

The panel is an OTM8009A over DSI, and it is **natively portrait**. The BSP
turns it into a landscape display by writing the panel's own MADCTR register,
and the constant for not doing that already exists:

```c
/* firmware/stm32h747i-disco/src/board_display.c:170 */
BSP_LCD_InitEx(HMI_LCD_INSTANCE,
               LCD_ORIENTATION_LANDSCAPE,   /* LCD_ORIENTATION_PORTRAIT is 0x00 */
               LCD_PIXEL_FORMAT_RGB888,
               HMI_DISPLAY_WIDTH, HMI_DISPLAY_HEIGHT);
```

`BSP_LCD_InitEx` passes `Orientation` down to `OTM8009A_Probe` →
`OTM8009A_Init`, which selects `OTM8009A_MADCTR_MODE_PORTRAIT` or
`..._LANDSCAPE`. That is the panel's memory-access-control: **the scan direction
changes inside the display module**. The LTDC, the DSI host and LVGL all just
work in 480×800 and no pixel is ever moved by the CPU.

So portrait here is: pass `LCD_ORIENTATION_PORTRAIT`, pass `480, 800` as the
width and height, create the LVGL display 480×800. Frame buffers stay the same
number of bytes and stay in SDRAM. Render mode stays `DIRECT`. Cost: **zero CPU,
zero RAM.**

The touch transform gets *simpler*, which is the tell that this is the panel's
native mode. `board_display.c:215`:

```c
touch_init.Orientation = TS_SWAP_XY | TS_SWAP_Y;
```

with the comment above it recording the measurement: the FT6X06 "reports the
panel's native *portrait* frame, X spanning 0..480 and Y spanning 0..800". In
portrait that is already the frame LVGL wants, so both swaps come off —
`TS_SWAP_NONE`. Which should be verified on the board rather than trusted from
here, because that comment exists precisely because reasoning about it from the
datasheet had failed.

**This board is where portrait should be proven first.** It is the cheapest and
it is the one whose result is trustworthy.

### 8.2 What LVGL 9.5 will and will not do for the other two

The F746G's RK043FN48H and the EDT's ET043027 are parallel RGB panels driven
straight from the LTDC. There is no MADCTL, no scan-direction register, no
panel-side rotation of any kind. Neither the LTDC nor DMA2D (Chrom-ART) can
rotate. So the rotation has to happen in software, and LVGL's support for that
has a hard constraint that all three of this repo's drivers currently fall on
the wrong side of.

**All three boards render in `LV_DISPLAY_RENDER_MODE_DIRECT`** with two full
frame buffers — `edt:620`, `f746:133`, `h747:238`. That choice is deliberate and
well-argued in the EDT driver's comment: LVGL draws into the buffer the LTDC is
not scanning and they swap during vertical blanking, so a frame is never
displayed while it is being drawn.

LVGL 9.5 offers two rotation mechanisms, and **neither works in DIRECT mode with
the software renderer**:

| Mechanism | Requires | Available here? |
|---|---|---|
| `lv_display_set_rotation` + `lv_draw_sw_rotate` in the flush callback | `LV_DISPLAY_RENDER_MODE_PARTIAL` | **No** — all three are DIRECT |
| `lv_display_set_matrix_rotation` | `LV_DRAW_TRANSFORM_USE_MATRIX`, which needs a renderer with 3×3 matrix support | **No** — `LV_DRAW_TRANSFORM_USE_MATRIX 0` in all three `lv_conf.h`, and `grep -rl matrix src/draw/sw/` finds only the letter and vector units. The SW renderer cannot do it; VG-Lite and NanoVG can. |

And the failure mode of getting this wrong is bad. In DIRECT mode with matrix
rotation off, `lv_refr.c` sets the layer's buffer area to the **rotated**
resolution:

```c
/* lv_refr.c:875 — "In direct mode and full mode the buffer area is always
   the whole screen, not considering rotation" */
layer->buf_area.x2 = lv_display_get_horizontal_resolution(disp_refr) - 1;
```

So LVGL renders as if the 510 KB buffer were 272 px wide while the LTDC scans it
as 480 px wide. There is **no warning and no error** — `lv_display_set_rotation`
does not check the render mode. The result is a sheared image, and it looks like
a driver bug rather than a configuration one. Anyone who tries `set_rotation` as
a first experiment will lose an afternoon to this; that is the single most
useful sentence in this document for whoever builds it.

The reference implementation is LVGL's own ST driver, `lv_st_ltdc.c`, and it
confirms the shape: rotation is handled only in the partial-mode path
(`lv_st_ltdc_create_partial`, `lv_draw_sw_rotate` at line 216), and its direct
path does not rotate at all.

### 8.3 What the F746G and EDT drivers would become

```
   LVGL display: 272 × 480, PARTIAL mode
        │
        ├─ renders into a partial buffer (a horizontal band)
        │
   flush_cb: lv_draw_sw_rotate(band → frame buffer, ROTATION_90)
        │
   frame buffer: 480 × 272, what the LTDC scans
```

Concretely, per board:

- `lv_display_create(272, 480)` and `lv_display_set_rotation(disp,
  LV_DISPLAY_ROTATION_90)`.
- `lv_display_set_buffers(..., LV_DISPLAY_RENDER_MODE_PARTIAL)` with two
  *partial* render buffers, which are new memory that does not exist today.
- A flush callback that calls `lv_display_rotate_area` to find where the band
  lands, then `lv_draw_sw_rotate(px_map, first_pixel, w, h, src_stride,
  fb_stride, rotation, cf)`. Both `LV_COLOR_FORMAT_ARGB8888` (EDT) and
  `LV_COLOR_FORMAT_RGB565` (F746G) are supported by that function.
- A touch transform, because **LVGL does not rotate input**. `lv_indev.c`
  contains no display-rotation handling at all; the driver's read callback must
  hand LVGL already-rotated coordinates.
- Tear avoidance, which is the part that is not mechanical (§8.5).

The rotation itself is a scalar per-pixel loop with a strided read
(`lv_draw_sw_utils.c`, `rotate90_argb8888`):

```c
for(int32_t x = 0; x < src_width; ++x) {
    int32_t dstIndex = (src_width - x - 1);
    int32_t srcIndex = x;
    for(int32_t y = 0; y < src_height; ++y) {
        dst[dstIndex * dst_stride + y] = src[srcIndex];
        srcIndex += src_stride;                      /* walks down a column */
    }
}
```

A full-screen redraw on the EDT is 130,560 pixels through that loop. At an
estimated 6–10 cycles per pixel on the 160 MHz Cortex-M33 that is roughly **5–8
ms**, against a 16 ms frame — an estimate, not a measurement, and the first
thing to measure if this is built. Typical HMI updates are far smaller than full
screen, so the steady-state cost is much lower; the number that matters is the
worst case on a screen change.

Two escape hatches exist if that turns out to hurt. LVGL provides an override
hook, `LV_DRAW_SW_ROTATE90_ARGB8888`, which defaults to `LV_RESULT_INVALID` and
falls through to the loop above — an accelerated implementation drops in there
with no LVGL changes. And **the STM32U599 has a GPU2D (NeoChrom)** —
`GPU2D_BASE`, `GPU2D_IRQn` and `stm32u5xx_hal_gpu2d.h` are all present in the
vendored CubeU5 — which can do rotation in hardware. Neither is needed to ship;
both are worth knowing exist before anyone concludes portrait is too slow on
this part.

### 8.4 The EDT memory budget is the binding constraint

The obvious way to keep DIRECT mode is a third buffer: render portrait into it,
rotate into the landscape frame buffer. On the EDT that does not fit, and the
margin is not close.

From the linker script (`STM32U599NJHXQ_FLASH.ld:30`) and a real build's map
file:

```
FRAMEBUFFER   0x20000000  1024 KB   two 480×272×4 buffers = 1020 KB    4 KB spare
RAM           0x20100000  1472 KB
  .data + .bss                       1036 KB  (of which LVGL's pool is 1024 KB)
  free to _estack                      437 KB  ← measured, firmware.map
```

A third full-screen ARGB8888 buffer is **510 KB**. It does not fit in the 4 KB
left in FRAMEBUFFER, and it does not fit in the 437 KB left in RAM — which also
has to hold the stack. Shrinking the LVGL heap to make room trades one ceiling
for another: `hmi.ts:231` records that this board's 1 MB heap is already "the
lowest of the three" and is what limits transformed widgets.

Partial mode fits comfortably, because it makes the *second frame buffer*
unnecessary — the LTDC only ever scans one. That frees 510 KB in the FRAMEBUFFER
region for partial render buffers, which need nowhere near it. Two half-screen
bands are 2 × 255 KB; LVGL's own guidance of one tenth of the screen would be 2
× 52 KB.

The other two boards have no memory problem at all. The F746G has 7 MB of SDRAM
above its frame buffers with a 4 MB LVGL heap in it
(`STM32F746NGHx_FLASH.ld:28`), and the H747I does not need any of this (§8.1).
One F746G-specific optimisation worth noting: its partial buffers are small
enough (480×34×2 = 32 KB each at RGB565) to live in the **internal 240 KB RAM**
rather than SDRAM, which matters because the rotate loop's strided read is close
to the worst access pattern SDRAM has.

### 8.5 Tearing is the design decision, not the rotation

Losing DIRECT mode means losing the tear-free swap the EDT driver's comment
specifically defends:

> "Copying rendered bands into the live frame buffer instead tears whenever the
> copy crosses the raster beam — most visible on a control that redraws
> continuously, such as a slider being dragged."

That comment describes exactly what naive partial mode does. Three ways out, in
increasing order of cost:

1. **Accept it.** Wrong for a product whose main gesture is dragging a slider.
2. **Sync the blit.** The LTDC's `CPSR` register gives the raster's live
   position and `ltdc_is_scanning` already reads it (`board_display.c:293`) —
   the machinery for waiting on the beam is present. Cheap in memory, adds
   latency, and gets fiddly when a band spans the beam.
3. **Keep both frame buffers and replay.** Rotate the band into the back buffer,
   swap at vertical blanking as today, then copy the same rotated rectangle into
   the other buffer so both stay current. Cost: one rotate plus one straight
   rectangle copy, and DMA2D can do the second at no CPU cost. Memory: both
   frame buffers stay, and the partial buffers come out of the 437 KB of RAM — 2
   × 100 KB leaves 237 KB, which is enough but should be checked against the
   stack's high-water mark.

**Recommendation: (3).** It preserves the property the current driver was built
around, and it is the option whose failure mode is a performance number rather
than a visible artefact. It is also the most work.

### 8.6 Firmware summary

| Board | Mechanism | CPU | RAM | Work |
|---|---|---|---|---|
| STM32H747I-DISCO | Panel MADCTR via `LCD_ORIENTATION_PORTRAIT` | none | none | **hours** — one constant, a width/height swap, re-verify touch |
| STM32F746G-DISCO | PARTIAL + `lv_draw_sw_rotate` | per-flush rotate | 2 small buffers, fits in internal RAM | **days** — display driver rewrite |
| EDT EVK043027B | PARTIAL + `lv_draw_sw_rotate` | per-flush rotate, est. 5–8 ms worst case | fits only by restructuring, §8.4 | **days** — display driver rewrite + tearing strategy |

## 9. How the orientation reaches the firmware

The firmware is a checked-in template per board; the project contributes
generated `.c` files. So the orientation has to cross that line, and this repo
already has the right pattern for it.

`hmi_runtime.c:48` declares a weak default that the generated code overrides
with a strong definition:

```c
__weak const hmi_runtime_config_t hmi_runtime_config = { .enabled = false, ... };
```

and `hmiBindingGenerator.ts:241` emits the strong one. A project that generates
nothing still links and runs.

**Recommendation: the same pattern.** A `hmi_display_config_t` carrying the
orientation, weak-defaulted to landscape in `board_display.c`, strongly defined
by the generator. Three properties make this better than the alternatives:

- **A firmware template with no generated source still builds and runs** — the
  same reason `hmi_runtime_config` is weak.
- **It is data, not preprocessor state,** so the two frame-buffer layouts and
  the two flush paths are both compiled and both testable, rather than one of
  them being invisible to the compiler in any given build.
- **It stays inside the existing build contract.** The alternative — a CMake
  `-DHMI_DISPLAY_ROTATION=90` threaded through `build.ps1`
  (`scripts/build.ps1:51`) and `service.ts` — adds a parameter to a pipeline
  that currently passes only paths, and would need the same addition in three
  build scripts and the service that invokes them.

The one thing to get right: `board_display_init` must read it *before* creating
the LVGL display, which means it must be a compile-time-initialised const, not
something set later. It is.

## 10. Round panels

The request mentions a circular canvas rotating about its centre. None of the
three supported boards is round — the `circle.md` in `docs/components/` is the
circle *widget*, not a display shape — so there is nothing to implement here
today.

Worth writing down what it would mean, because it is not "the same but round".
Rotating a circle 90° about its centre yields the same circle, so **the design
surface does not change shape at all**. What changes is only which edge is "up":
the widget coordinates, the touch transform and the panel's scan direction all
rotate exactly as they do for a rectangle, while the canvas outline stays put.
Which means a round panel would need a *third* piece of state the rectangular
boards do not — a display **shape** on the board definition — before orientation
means anything visible for it. That is a separate feature and this one should
not try to anticipate it beyond leaving `orientation` a string rather than a
boolean.

## 11. What I would build, in what order

1. **The editor, all of §7, plus the H747I firmware change (§8.1).** This is the
   whole feature for one board, end to end, in about the same time as the editor
   work alone. Build & Run (§4.4) proves the editor half independently of any
   board, so a failure is unambiguous about which half is wrong.
2. **`orientations` gating from day one (§3),** so the EDT and F746G offer
   Landscape only until their drivers land. A project that builds and renders
   garbage is worse than a select box with one option in it.
3. **Fix or label the WASM preview (§4.4)** in the same change, because it will
   be the first thing that looks broken.
4. **The EDT driver (§8.3–§8.5),** as its own piece of work with its own
   measurement of the rotate cost before committing to the tearing strategy.
5. **F746G last,** as a straight port of whatever the EDT work concluded.

Steps 4 and 5 are the ones to scope separately. Nothing in steps 1–3 depends on
them, and steps 1–3 are what makes the feature real for a user.

## 12. Documents that go stale

- [lvgl-configuration.md](./lvgl-configuration.md) — gains a rotation section;
  the render-mode claim becomes board- and orientation-dependent.
- [color-depth.md](./color-depth.md) — its "all four have to agree" list gains a
  fifth item, since the LVGL display resolution must now match the panel's
  *rotated* geometry rather than its literal one.
- [preview-ladder.md](./preview-ladder.md) — §3's account of what the LVGL
  Preview proves is already wrong about resolution (§4.4) and gets more wrong.
- [edt-evk043027b.md](./edt-evk043027b.md) — the memory budget in §8.4 belongs
  next to that board's existing SRAM accounting.
- `README.md` / `README.zh-TW.md` — the feature list.
- `CHANGELOG.md` / `CHANGELOG.zh-TW.md`.

Every one of these has a `docs/zh-TW/` mirror that changes with it.

## 13. Open questions

1. **Does the H747I's touch really need `TS_SWAP_NONE` in portrait?** Reasoned
   from a comment that itself exists because reasoning failed. Must be measured
   on the board with `board_touch_log`, which is already built for this
   (`board_display.c:173` has the EDT equivalent).
2. **What does the rotate loop actually cost on the U599?** §8.3's 5–8 ms is an
   estimate. It decides whether §8.5's option (3) is affordable.
3. **Does the ET043027 panel have a scan-direction pin?** Some parallel RGB
   panels expose horizontal/vertical flip on hardware strapping. It would not
   give 90°, but it would settle whether a 180° mount is free here — which is
   the field §3 deliberately deferred.
4. **Is 437 KB of free RAM enough for two partial buffers plus the stack on the
   EDT?** The map gives the static figure; the stack's high-water mark under
   load is not in it.

## 14. What was built, and where §1–§13 were wrong

Implemented on `feat/display-orientation`. Two of the recommendations above did
not survive contact, and both were reversed on the user's instruction rather
than on new evidence.

### 14.1 Orientation is changeable after creation — §6 was overruled

§6 recommended fixing it at creation, on the grounds that rotating boxes leaves
widget *contents* upright. The requirement was to allow it in Project Settings
anyway, so it is allowed.

The argument in §6 is still correct, and the implementation does not pretend
otherwise. `utils/rotateLayout.ts` turns boxes and only boxes; the dialog shows
a warning listing what does not turn *before* the save rather than after it; and
the whole rotation is one `saveToHistory()` entry, so Ctrl+Z takes it back. The
recursive part is the piece §6 did not mention: a child's coordinates are
relative to its parent, so each subtree turns inside its parent's
*pre-rotation* box, not inside the canvas. Eight tests in
`utils/__tests__/rotateLayout.test.ts` pin that down, including the round trip.

One thing the transform must do that was not obvious: **drop `align`**. An
aligned widget is positioned by LVGL from an anchor rather than from x/y, so
turning its box while leaving the anchor set moves it twice.

### 14.2 Both orientations are always offered — §3's gate moved

§3 had `orientations` deciding what the New Project dialog *shows*, so the EDT
and the F746G would have offered Landscape alone. That is wrong for the same
reason the protocol design already knew about: the design side has no hardware
in it, and a project can usefully be laid out and previewed in an orientation
whose firmware does not exist yet.

So `orientations` now gates **building**, not designing — exactly
`ProtocolDefinition.implemented`'s split. Both orientations appear in both
dialogs; an undrivable one is labelled "— no firmware support yet", the hint
says the project can still be designed and previewed, and the Deploy tab
refuses the build with a specific reason. `boardCanDriveOrientation()` is the
predicate; `getDrivableOrientations()` is what it reads.

This also corrected `normalizeOrientation`, which in the first cut downgraded a
portrait project to landscape when the board could not drive it. That would
have silently resized the author's canvas on load — the one thing §2's invariant
exists to prevent.

### 14.3 What §4.1's fix actually looks like

Confirmed as predicted: `ProjectSettings.handleSave` re-derived width and height
straight from the board and would have flattened every portrait project on a
rename. It now goes through `logicalResolution(boardId, orientation)`, which is
the single definition §4.1 asked for and is used by the New Project dialog and
Project Settings alike.

### 14.4 The firmware contract

As designed in §9: `hmi_display_config_t` declared in each board's
`board_display.h`, weak-defaulted in each `board_display.c`, and strongly
defined by a generated `hmi_display_generated.c` from
`codegen/displayConfigGenerator.ts`. A template with no generated source still
links and boots in landscape.

The H747I acts on it (§8.1) — `LCD_ORIENTATION_PORTRAIT`, a swapped
width/height into `BSP_LCD_InitEx`, and `lv_display_create` at the turned
resolution, with the render mode and the frame buffers untouched. The F746G and
the EDT **refuse**: `board_display_init` returns false for anything but
landscape, so a config that should not exist produces a dead display that leads
straight to that line, rather than a sheared screen that looks like an LVGL bug.

One correction to §8.1: the touch change is *only* the orientation flags.
`touch_init.Width`/`Height` must stay 800x480 in both orientations, because the
BSP uses them solely as the numerators of a scale whose denominators are the
fixed `FT6X06_MAX_X/Y_LENGTH` — not as a clamp, which is what they look like.
Making them follow the orientation would squash every touch into the left half
of the screen. The flag choice itself (`TS_SWAP_NONE` in portrait) is still
reasoned rather than measured; §13's first open question stands.

### 14.5 The WASM preview

§4.4 offered "fix it or label it". Both, because `emcc` is not available here
and `public/wasm/lvgl_wasm.wasm` is a checked-in binary that cannot be rebuilt
in this environment:

- `wasm/src/main.c` now implements `set_screen_size` with
  `lv_sdl_window_set_size` and creates the display at 480x272 rather than the
  480x320 that matched no board. A rebuild picks this up.
- `_set_screen_size` was **already exported** by the checked-in binary, so
  `wasm/shell.html` and the built host page could both be wired to a new
  `set-screen-size` message without a rebuild.
- `WasmPreview.tsx` measures the iframe's canvas after sending the size and
  says plainly in the footer when the runtime ignored it. That notice clears
  itself the moment a rebuilt `.wasm` is dropped in, so it cannot go stale.

### 14.6 Verified with the ARM toolchain

The evaluation was written believing the firmware could only be reasoned about;
`C:\ST\STM32CubeCLT_1.22.0` is installed on this machine, so all of it was
actually built:

| Check | Result |
|---|---|
| EDT builds with a generated landscape config | 293,032 B text, links clean |
| The generated strong definition wins | `hmi_display_config` resolves to `hmi_display_generated.c.obj` |
| A template with *no* generated config still links | resolves to `board_display.c.obj`, same image size |
| H747I builds with a **portrait** config | 283,952 B text, no warnings from `board_display.c` under `-Wall -Wextra` |

So §9's contract holds in both directions, which was the part most able to fail
silently. What is still unverified is behaviour, not linkage: nothing here says
the H747I actually comes up in portrait, and §13's touch question is untouched
by a successful build.

### 14.7 Still not done

- **The EDT and F746G display drivers** (§8.3–§8.5). Portrait is designable and
  previewable on both and buildable on neither. This is the large remaining
  piece and nothing above depends on it.
- **A rebuilt `lvgl_wasm.wasm`**, which needs `emcc`.
- **The H747I portrait touch mapping**, which needs the board.

## 15. The EDT driver, and the bug that nearly shipped with it

The partial-mode portrait path of §8.3 is built. Two things came out of doing it
that the evaluation did not predict, and the first is the important one.

### 15.1 A `__weak const` read from its own translation unit is folded away

§9 chose the `hmi_runtime_config` pattern — a `__weak` default in the board's own
file, overridden by a strong definition in generated code — and put the default
in `board_display.c`, next to the code that reads it. That is wrong, and wrong in
the worst way available: **it compiles, it links, the linker map shows the strong
definition winning, and the firmware ignores it completely.**

GCC may read a `const` object's value out of its own initialiser when the
definition is visible in the same translation unit, and it does so here despite
`__weak`. So while compiling `board_display.c`:

```c
const bool portrait =
    hmi_display_config.orientation == HMI_DISPLAY_ORIENTATION_PORTRAIT;
```

folded to `false`, the entire rotated path became dead code, `--gc-sections` then
discarded the two 51 KB render buffers it referenced, and the portrait image came
out **byte-for-byte identical to the landscape one**.

It was caught only because the partial buffers gave it a visible tell: they
appeared under *Discarded input sections* in the map. Nothing else about the
build looked wrong.

**This invalidates part of §14.4.** The H747I check recorded there — "the
generated strong definition wins, `hmi_display_config` resolves to
`hmi_display_generated.c.obj`" — was true and did not mean what it was taken to
mean. The symbol did resolve to the generated object; the *reads inside
`board_display.c`* had already been folded against the local weak definition at
compile time, so that firmware would have come up landscape whatever the project
said. Rebuilding after the fix grew the H747I's `.text` by 32 bytes: the portrait
branch, back from the dead.

The fix is structural rather than clever. The weak default moved to a file of its
own, `src/board_display_config.c`, on all three boards; `board_display.c` now
sees only the `extern` declaration from `board_display.h` and has no initialiser
to fold against. `hmi_runtime_config` escapes the same trap by accident — its
readers reach it through a pointer `main.c` passes in.

**The general lesson, worth carrying to any future weak-symbol contract here: a
link-time symbol check does not prove the value was read at link time.** The
thing to verify is that the two configurations produce *different* firmware.

### 15.2 What the EDT driver does

`lv_display_create` still takes the panel's 480x272 — LVGL keeps that as the
original and swaps only what the UI sees, so the screens come out 272x480 while
the frame buffers stay the panel's shape. Then `LV_DISPLAY_ROTATION_90` and
`LV_DISPLAY_RENDER_MODE_PARTIAL` with two 272x48x4 render buffers, which is one
tenth of the logical screen and exactly the 48 rows LVGL derives back out of the
byte count in `get_max_row`.

Each flush turns one band into the frame buffer the LTDC is *not* scanning, using
`lv_display_rotate_area` for the position and `lv_draw_sw_rotate` for the pixels.
On the last band of a refresh the buffers swap at vertical blanking, and the box
just written is copied across so both hold the same picture — §8.5's option (3),
taken because partial mode redraws only what changed and the buffer LVGL draws
into next would otherwise hold the frame before last. So the tear-free property
the direct-mode driver was built around is preserved.

Touch is turned in `touch_read` rather than in the vendored driver, which goes on
mapping onto the panel's own frame in both orientations. LVGL rotates no input at
all — `lv_indev.c` has no notion of display rotation — so the driver owes it
already-turned coordinates. The transform is the inverse of
`lv_display_rotate_area`'s: panel `(x, y)` becomes logical `(271 - y, x)`. The
bring-up log deliberately records the **raw** reading, since recording the
transformed one would hide the thing it exists to check.

### 15.3 Cost, measured where it can be

| | Value |
|---|---|
| `.text` | 294,792 B |
| `.bss` | 1,173,940 B (+104,448 for the two render buffers) |
| RAM free to `_estack` | 334.7 KB, against an 8 KB stack |

The two 51 KB render buffers are static, so they cost the same 102 KB in
landscape, where nothing reads them. That was a deliberate trade against the
alternative — giving up the second frame buffer to free 510 KB in the frame
buffer region — which would have made portrait free but reintroduced tearing.
334.7 KB still free says the trade is affordable.

### 15.4 What the board said, and the one number that was wrong

Measured on hardware, full-screen refresh, cycles from DWT at 160 MHz:

| | cycles | ms |
|---|---|---|
| Rotation (`lv_draw_sw_rotate`, 130,560 px) | 976,238 | **6.1** |
| Reconcile copy (522,240 B) | 3,283,727 | **20.5** |

The rotation landed inside §8.3's 5–8 ms estimate. The copy did not, and it was
never estimated at all — it was written as "a straight copy so the cost shows up
in a measurement", and the measurement is 6.3 cycles **per byte**.

The cause is `--specs=nano.specs`: newlib-nano is built with
`PREFER_SIZE_OVER_SPEED`, so its `memcpy` is a byte-at-a-time loop.

Replacing it with a word copy, unrolled four at a time, was measured on the same
board:

| | before | after |
|---|---|---|
| Reconcile | 3,283,727 cycles (20.5 ms) | **530,517 cycles (3.32 ms)** |
| Per byte | 6.29 cycles | **1.02 cycles** |
| Worst refresh, rotate included | 26.6 ms | **9.5 ms** |

Which puts a full-screen portrait refresh back inside its own 16.6 ms frame,
with room left over. The rotation was unchanged and re-measured at 982,985
cycles (6.14 ms), so it is now the larger of the two costs and the next thing
DMA2D or the part's GPU2D would take — a decision that can now be made against
numbers rather than a guess.

This matters beyond the frame rate. A refresh costing 6.1 + 20.5 ms overruns its
own 16.6 ms frame, and everything else in the main loop waits — including LVGL's
input polling. **A display too slow to poll its own touch screen presents as a
touch screen that needs pressing twice**, which is where this investigation
started, and nothing about the touch path was wrong.

The touch log confirmed that separately: 358 presses recorded, panel X spanning
4..466 and Y spanning 18..260, and every logical point exactly the transform of
its panel point — a press at panel (23, 220) arriving as logical (51, 23), which
is `271 - 220` and `23`. The mapping was right the whole time.

**What is not measured is anything that runs.** The rotate loop's cost per
refresh (§8.3 estimated 5–8 ms worst case), whether the swap-and-reconcile keeps
up at 60 Hz, and whether the touch transform is right, all need the board. The
EDT now offers Portrait in the editor precisely so that can be tried.
