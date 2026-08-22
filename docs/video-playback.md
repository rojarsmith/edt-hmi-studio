# Video Playback — Reading a Film off the SD Card

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/video-playback.md">繁體中文</a>
</p>

Every other widget in this editor is made of things the project owns: a label's
text, an image's pixels, a chart's numbers. All of them are compiled into the
firmware image and flashed onto the board.

A video cannot work that way. A minute of 800×480 footage is around 200 MB — two
hundred times the internal Flash of the board that plays it. So the Video widget
is the one widget that names its content instead of holding it: you type the
name of a file, and the panel finds that file on its SD card at run time.

That single decision is what everything below follows from.

---

## 1. What the widget is

Drag **Video** out of the **Miscellaneous** category and it lands as a black
rectangle — the frame the picture will occupy. It has three properties and
nothing else:

| Property | Default | What it does |
| --- | --- | --- |
| **File name on the SD card** | *(empty)* | The file to play, as it is named in the root of the card — `intro.avi`. |
| **Auto Play** | On | Start playing as soon as the screen carrying the widget is loaded. |
| **Loop** | On | Start again from the first frame when the last one has been shown. |

There is no import step, no resource entry, and nothing added to the build. A
two-hour film costs the firmware image exactly as much as a two-second one:
nothing. Changing the video means swapping the card, not rebuilding.

The price is that the editor has never seen the file, and cannot check it. So it
checks the three things that are wrong whatever is on the card — no name, a path
where a name belongs, an extension that is not `.avi` — and leaves everything
else to the panel, which is the only thing that can actually look.

## 2. Which boards can play one

| Board | Video | Why |
| --- | --- | --- |
| **STM32H747I-DISCO** | ✅ | JPEG codec peripheral, and a 4-bit microSD socket on SDMMC1. |
| STM32F746G-DISCO | ❌ | No JPEG codec. The peripheral arrived with the F76x/F77x parts. |
| EDT EVK043027B | ❌ | The STM32U599 has no JPEG codec, and the board has no external RAM for the frame buffers. |

This is not a driver that has not been written yet. Decoding twenty-four
800×480 JPEGs a second is not something a Cortex-M7 does in software *while also
running a user interface* — there is no slower path to fall back to. A board
without the codec cannot play video at all, and saying so is the honest answer.

So it is treated exactly the way an unimplemented protocol and an undriveable
orientation already are: the widget can be placed, configured, previewed and
saved on any board, and a **project that uses one cannot be built** for a board
that has no codec. The Video section of the property editor says which it is,
and the Deploy tab refuses the build with the same explanation — before the
compiler, rather than as a message about a missing header file.

**Board capability lives in one place**: `BoardDefinition.video` in
[`src/types/hmi.ts`](../src/types/hmi.ts). Adding a fourth board that can play
video means filling that field in and giving the board a runtime; nothing else
in the editor has to change.

[§10](#10-how-hard-the-hardware-dependency-is) takes the dependency apart layer
by layer, says which parts of this travel to another board and which do not, and
spells out what it means for the EVK043027B.

## 3. The format, and the file

The panel plays **Motion JPEG in an AVI container**. Every frame is a complete
JPEG; there are no inter-frame references at all.

That is not a compromise, it is the point. It is the only common video format
whose per-frame work is exactly what the STM32H7's JPEG codec does in hardware,
and its lack of inter-frame prediction means playback can start at any frame,
loop instantly, and survive a corrupt frame by showing the next one.

To produce a file:

```bash
ffmpeg -i source.mp4 -vf "scale=800:480,fps=24" -c:v mjpeg -q:v 3 -an intro.avi
```

`-an` drops the audio — see [§7](#7-what-this-deliberately-does-not-do). Copy the
result into the **root** of a FAT32 or exFAT card, and type its name into the
widget.

### The AVI the reader walks

An AVI is a RIFF file: a tree of four-character chunks, each with a 32-bit
length, padded to an even byte. Two branches matter.

```
RIFF 'AVI '
├── LIST 'hdrl'                   ← read once, at open
│   ├── 'avih'                    ← frame period, width, height, frame count
│   └── LIST 'strl' (per stream)
│       └── 'strh'                ← 'vids' + 'MJPG' identifies the video track
├── LIST 'movi'                   ← streamed, one chunk at a time
│   ├── '00dc' <jpeg frame>
│   ├── '01wb' <audio>            ← skipped
│   └── ...
└── 'idx1'                        ← never read
```

The reader ([`hmi_avi.c`](../firmware/stm32h747i-disco/src/hmi_avi.c)) parses
`hdrl` once and then walks `movi` in file order, returning one compressed frame
per call. **The index is never read.** Streaming gives up seeking to an
arbitrary frame — which nothing in the product asks for — and gets in return a
reader whose memory does not grow with the length of the film, and which a
corrupt index cannot stop.

Motion JPEG has never had one spelling, so `MJPG`, `mjpg`, `MJPA`, `MJPB`,
`AVRn`, `jpeg` and `dmb1` are all accepted. They are ordinary JPEG frames and
the codec cannot tell them apart; refusing a file over the spelling of its tag
would be a distinction with no consequence.

## 4. How a frame becomes pixels

Two peripherals, and no CPU in the pixel path:

```
SD card ──f_read──► compressed frame ──JPEG codec──► YCbCr, in MCU blocks
                                                            │
                                                          DMA2D
                                                            │
                                                            ▼
                                RGB565, raster order ──► LTDC layer 1 ──► panel
                                                                 ▲
                                          LVGL's screen ──► LTDC layer 0
```

The JPEG codec and DMA2D were designed as a pair on this part: DMA2D's YCbCr
input mode reads exactly the MCU-block layout the codec emits, converts it, and
writes raster RGB565. Nothing here is a software decode with hardware
assistance — it is a hardware decode.

**And the frame never passes through LVGL.** The display controller has two
hardware layers; LVGL draws on the first, and the decoded frame is handed to
the second, which the LTDC composites over the UI on its way to the panel.
Before this, the frame went to LVGL as an image: the CPU blitted 1.5 MB into
the frame buffer and then copied it again to keep the second buffer in step —
three megabytes of SDRAM traffic per frame, which was most of the frame period
on its own. Now nothing copies the frame at all. The price is in
[§7](#7-what-this-deliberately-does-not-do): the layer is always on top.

Two picture buffers alternate, so DMA2D writes the frame the panel is *not*
scanning; the swap is staged and lands at vertical blanking, the same way
LVGL's own frames do.

Both stages are **polled**, and the whole thing runs inside one `lv_timer`
callback. The caller has to wait for the frame before it can show it, so an
asynchronous decode would buy nothing but a state machine.

### The budget

At 24 fps a frame period is 41.7 ms. A 800×480 frame costs a few milliseconds of
codec time and roughly 140 KB of card reads at the ~27 Mbit/s this is built for.
The main loop keeps running Modbus and touch between frames.

The largest single cost is now the **card read**, and it is sensitive to how
the read is made. A frame starts wherever the muxer left it — any byte of any
sector — and a read that starts there makes FatFs copy the first partial sector
through its own buffer and hand the card a destination that is no longer
word-aligned, which the SD layer can only serve one sector per command. In
`city.avi`, 634 of 1347 frames land that way; each cost ~280 card commands
instead of ~5, and the video crawled. The reader now backs up to the sector
boundary before the frame and reads from there into a word-aligned buffer, so
every sector goes straight from the card into place. The bus also starts at
50 MHz High Speed and drops to 25 MHz the first time a read fails, for good —
see [§6](#the-sd-bus-starts-fast-and-slows-down-once).

The picture is not scaled — the LTDC cannot — so it is shown at its own size,
centred in the widget and clipped to it. **Size the Video widget to the
video.** A widget larger than the picture shows black around it; a smaller one
shows the middle.

### Measuring it

There is no console on this firmware. `hmi_video_stats` is a global the
debugger can read — pause and `p hmi_video_stats` — with the last frame's read,
decode and show times in microseconds, the worst frame so far, and the frame
count. Anything over the period (41 667 µs at 24 fps) is a dropped frame.

### The buffers

| Buffer | Size at 800×480 | Written by | Read by |
| --- | --- | --- | --- |
| Compressed frame | 512 KB | `f_read` | JPEG codec |
| YCbCr MCU blocks | 1152 KB | JPEG codec | DMA2D |
| RGB565 picture × 2 | 2 × 768 KB | DMA2D | LTDC |

All of them live in the board's external SDRAM, in the `.sdram` section, above
LVGL's own 4 MB heap. They are **shared, not per-widget**, because only one
video can decode at a time ([§5](#5-one-player-at-a-time)). RGB565 rather than
the ARGB8888 the rest of the display runs: the LTDC scans this buffer sixty
times a second on the same SDRAM bus LVGL's frame buffer is scanned from, and
half the bytes is half that bandwidth.

A project with no Video widget pays none of it. `--gc-sections` drops the
runtime and its buffers entirely when nothing calls `hmi_video_attach`; measured
on this board, a screen with a video costs **+20 KB of Flash and 3.1 MB of
SDRAM** against the same screen without one, and a project that has no video is
byte-for-byte what it was before this existed.

D-Cache is maintained at the one hand-off that needs it: the codec's output is
written by the CPU and cleaned before DMA2D reads it. The converted frame needs
nothing — DMA2D writes it and the LTDC reads it, and the CPU never touches it.
Cards are read by polling rather than DMA, which sidesteps the same problem on
that side at the cost of CPU time the runtime is spending waiting anyway.

## 5. One player at a time

There is one JPEG codec and one set of buffers, so the runtime plays **the first
Video widget on the loaded screen** and leaves any other showing *Another video
is playing*. One video per screen is the shape a project actually takes;
registering several across several screens is ordinary and works.

The widget the project styles is the black frame. The runtime puts one child
inside it — an **`lv_label`**, centred, which carries whatever the panel has to
say — and shows the picture itself on the overlay layer, positioned over the
frame's box. The label inherits the frame's text colour, so the message is
styled by the widget's own **Text Color** row rather than hard-coded.

Leaving the screen takes the overlay down at once, from the screen's own
unload event, rather than at the next timer tick: a layer that sits above
LVGL would otherwise be painted over the top of the screen that replaced it.

**Nothing is opened at `ui_init`.** `hmi_video_attach` records the name and
returns; the card is first touched when the widget is actually on the active
screen. So a screen the user never opens costs no card access, boot never blocks
on a card that is not in the slot, and a card pushed in after the panel started
is still found. Leaving a screen releases the file; coming back opens it again
from the first frame, which is also what gives a failed widget another go.

## 6. What the panel says, and when

| On the widget | What happened |
| --- | --- |
| **Video not found** | No file of that name in the root of the card — or the widget names no file at all. |
| **No SD card** | Nothing in the slot. The socket's detect pin said so. |
| **SD card unreadable** | A card is there, but it would not initialise or carries no file system. |
| **Video format not supported** | The file is not an AVI, its video track is not Motion JPEG, its frames are larger than the buffers, or the picture is one the codec path cannot convert. |
| **Another video is playing** | A second Video widget on the same screen. See [§5](#5-one-player-at-a-time). |

These stay separate deliberately. To a player, "the file is missing" and "the
card is not in the slot" are the same failure; to the person holding the card
they are completely different, and telling someone their video is missing when
they simply forgot to push the card in sends them looking in the wrong place.

### The line under the message

Every message carries a second line saying **which step failed and what it
reported** — `mount failed (FR 13)`, `read failed (-4) at 8192 x64`,
`codec H264 is not MJPEG`, `decode: HAL 3 err 0x4 out 0`, `4:2:2 612x400 not
block-aligned`. The headline is for the person in front of the panel; the
detail is for whoever has to fix it. *SD card unreadable* on its own cannot be
acted on by anyone, and a panel that says only that is a panel that has to be
put under a debugger to be understood.

The codes are the underlying layer's own: `FR n` is a FatFs `FRESULT`, a bare
negative number is a BSP error, `HAL n err 0x…` is the HAL status and the JPEG
handle's `ErrorCode`.

### What is retried, and what is not

Failures split by whether anything on the panel could change them:

| Class | Messages | What happens |
| --- | --- | --- |
| **Card** | *No SD card*, *SD card unreadable*, *Video not found* | Shown now, **tried again every second**. A card pushed in starts playing; a file copied onto the card and reinserted is found; one read that fails its CRC costs a frame, not the film. |
| **File** | *Video format not supported* | Shown and left. Nothing on the panel will turn an H.264 file into Motion JPEG. Leaving the screen and coming back tries again. |

### The SD bus starts fast and slows down once

The BSP ends card initialisation by switching to High Speed — 50 MHz on
`SDMMC_CK` — and does not check whether that worked. On this Discovery the
socket is on the far side of the board from the MCU, and 50 MHz is where some
cards' reads start failing their CRC now and then. It is also twice the
throughput, and a frame's worth of reads is the largest single cost in showing
one. So the bus **starts at 50 MHz and drops to 25 MHz the first time a read
fails**, for good: a card that failed once there will do it again, and one
frame lost to finding that out is cheaper than one lost every few seconds.

### In the editor, and in the Preview

Neither the design canvas nor the Preview nor the Emulator plays anything. None
of them has the panel's card reader, and none has ever seen the file.

So all three draw the frame the picture will occupy, with the file name across
it, rather than inventing a still. The Emulator says *Not played in the
Emulator* in the widget itself. Showing **Video not found** there would be a
different claim — that the card was looked at and came back empty — and only the
panel can say that.

## 7. What this deliberately does not do

**Audio is not played.** The runtime demuxes past the audio stream without
decoding it. An MP3 or AAC track needs a decoder library, the WM8994 codec
brought up on SAI, and a buffer discipline that keeps sound in step with a video
clock — a second project's worth of work, and one nothing in the widget's
configuration currently asks for. Use `-an` when producing the file; the frames
are the same either way, and the audio stream is only making it bigger.

**Nothing can be drawn over a playing video.** The picture is on the display
controller's second layer, which the LTDC composites *above* everything LVGL
draws. A label placed over the widget in the editor will be under the video on
the panel. That is the price of not copying the frame, and it is the right
price: the alternative costs most of the frame period. A caption goes beside
the video, not on it.

**The picture is not scaled.** The LTDC cannot, so a 800×480 video in a
400×240 widget shows its middle 400×240. Size the widget to the video, or
encode the video at the widget's size.

**No seeking, and no transport controls.** The widget has Auto Play and Loop.
`hmi_video_play`, `hmi_video_pause` and `hmi_video_stop` exist in the runtime for
an event or a logic graph to call, but no editor action is bound to them yet.

**Pictures must be a whole number of MCU blocks.** 8×8 at 4:4:4, 16×8 at 4:2:2,
16×16 at 4:2:0. The block-ordered source only lines up with a raster destination
when it divides exactly; handling the ragged edge means a DMA2D transfer per MCU
row on every frame to rescue a video nobody produces. 800×480 — the panel's own
size — divides exactly at all three.

**Grayscale and CMYK JPEGs are refused.** DMA2D's YCbCr input mode covers 4:4:4,
4:2:2 and 4:2:0 and nothing else, and neither of the others is what an encoder
produces for video.

**Frames larger than 512 KB are refused.** At the bit rate this targets a frame
is around 140 KB, so the ceiling is well past any sane quality setting — and a
file that does exceed it says so rather than being decoded from a truncated
buffer.

**The file lives in the root of the card.** The name typed in the editor is a
name, not a path. The property editor says so when it sees a separator.

## 8. Where the code is

| Piece | File |
| --- | --- |
| Widget definition, category | [`src/utils/componentDefinitions.ts`](../src/utils/componentDefinitions.ts) |
| Props | `VideoProps` in [`src/types/index.ts`](../src/types/index.ts) |
| Board capability | `BoardDefinition.video` in [`src/types/hmi.ts`](../src/types/hmi.ts) |
| Property editor | `VideoEditor` in [`PropertyEditor.tsx`](../src/components/PropertyEditor/PropertyEditor.tsx), [`videoModel.ts`](../src/components/PropertyEditor/videoModel.ts) |
| Design canvas | `CanvasVideoContent` in [`CanvasComponent.tsx`](../src/components/Canvas/CanvasComponent.tsx) |
| Preview | `drawVideo` in [`PreviewPanel.tsx`](../src/components/Preview/PreviewPanel.tsx) |
| Emulator | `create_video` in [`ui_from_json.c`](../wasm/src/ui_from_json.c) |
| Code generation | `getCreateFunction` and `generatePropsCode` in [`ui.c.ts`](../src/codegen/templates/ui.c.ts) |
| Build gate | [`DeployPanel.tsx`](../src/components/DeployPanel/DeployPanel.tsx), [`videoWidgets.ts`](../src/utils/videoWidgets.ts) |
| Runtime — widget and playback | [`hmi_video.c`](../firmware/stm32h747i-disco/src/hmi_video.c) |
| Runtime — AVI demuxer | [`hmi_avi.c`](../firmware/stm32h747i-disco/src/hmi_avi.c) |
| Runtime — JPEG + DMA2D | [`hmi_jpeg.c`](../firmware/stm32h747i-disco/src/hmi_jpeg.c) |
| Runtime — SD card and FatFs | [`hmi_sd.c`](../firmware/stm32h747i-disco/src/hmi_sd.c), [`ffconf.h`](../firmware/stm32h747i-disco/include/ffconf.h) |

FatFs is pinned in
[`bootstrap-deps.ps1`](../firmware/stm32h747i-disco/scripts/bootstrap-deps.ps1)
like every other dependency. Only `ff.c` and `ffunicode.c` are compiled; the
`disk_*` interface is implemented directly against the board's BSP in
`hmi_sd.c`, and the build is **read-only** — `FF_FS_READONLY` is 1, so nothing
this firmware does can alter a card.

## 9. Widget reference

See [docs/components/video.md](./components/video.md) for the widget's own
reference page: properties, styles, events, the rendering layers and the LVGL
API mapping.

## 10. How hard the hardware dependency is

Video is the only widget in the editor whose feasibility is a property of the
chip. Every other widget is LVGL drawing in software; moving it to a new board
means writing a display driver. Video is not like that, and it is worth being
precise about *which* parts of it are not.

### 10.1 The four layers

| Layer | Depends on | How hard |
| --- | --- | --- |
| **Decoding** | The JPEG codec peripheral | **Absolute.** No codec, no video — see [§10.2](#102-why-there-is-no-software-fallback). |
| **Colour conversion** | DMA2D's YCbCr input mode | Absolute in principle, but every STM32 that has the codec also has this. |
| **Reading the file** | SDMMC and a microSD socket | Soft. USB mass storage or a QSPI NOR would do; only [`hmi_sd.c`](../firmware/stm32h747i-disco/src/hmi_sd.c) changes. |
| **Memory** | 3.1 MB for the three buffers in [§4](#the-buffers) | Firm. Needs external RAM; no STM32's internal SRAM holds this beside two frame buffers and an LVGL heap. |

Which parts have the codec is a fact of the silicon, read from each part's
device header (`JPEG_BASE` is either defined or it is not):

| Part | `JPEG_BASE` | External RAM on the board | Verdict |
| --- | --- | --- | --- |
| STM32H747XI (H747I-DISCO) | defined | 32 MB SDRAM | ✅ Plays |
| STM32F746NG (F746G-DISCO) | absent — arrived with the F76x/F77x | 8 MB SDRAM | ❌ No codec |
| STM32U599NJ (EVK043027B) | absent — only a DCMI capture-mode bit of the same name | none; 2496 KB internal SRAM | ❌ No codec, and nowhere to put the buffers |

The U599 does carry SDMMC1 and SDMMC2 and DMA2D. Neither helps: the layer it
is missing is the one with no substitute.

### 10.2 Why there is no software fallback

The obvious question is whether a board without the codec could decode in
software, slower. It could, and the result would not be a video.

A 800×480 baseline JPEG through libjpeg-turbo or TJpgDec on a Cortex-M7 at
400 MHz takes in the region of 150–300 ms — **3 to 6 frames a second**, against
the 24 this format is encoded at. And for every one of those milliseconds the
CPU is the decoder: LVGL does not draw, touch is not read, Modbus does not
poll. A slideshow that freezes the panel between slides is not a slower
version of the feature; it is a different and worse feature wearing its name.

Dropping the resolution changes the arithmetic but not the conclusion.
320×240 at 10 fps is reachable in software on the F746, and the panel would
still stall for most of every frame period. That is a decision for a product
that wants it, with its own widget and its own honest name — not a fallback to
slip under this one.

So the runtime has no software path, on purpose. A board that lacks the codec
says *cannot be built* rather than building something that looks like it works
in the editor and stutters on the bench.

### 10.3 What travels, and what does not

Most of the implementation is portable. Only one file is welded to the part.

| Piece | Portable? | Notes |
| --- | --- | --- |
| Editor: category, widget, property editor, canvas, Prototype, Emulator, code generation | **Yes, entirely.** | Knows nothing about the board beyond `BoardDefinition.video`. |
| The build gate (Deploy tab, Video section) | **Yes.** | Reads the same field. A new board is one entry in [`src/types/hmi.ts`](../src/types/hmi.ts). |
| [`hmi_avi.c`](../firmware/stm32h747i-disco/src/hmi_avi.c) — AVI demuxer | **Yes.** | Plain C over FatFs. No peripheral in it. |
| [`hmi_sd.c`](../firmware/stm32h747i-disco/src/hmi_sd.c), [`ffconf.h`](../firmware/stm32h747i-disco/include/ffconf.h) | Mostly. | The `disk_*` functions call the board's BSP; a different storage device means rewriting those five functions and nothing above them. |
| [`hmi_video.c`](../firmware/stm32h747i-disco/src/hmi_video.c) — the widget runtime | Mostly. | Pure LVGL except for the `.sdram` section attribute on its three buffers, which a board with different memory would place differently. |
| [`hmi_jpeg.c`](../firmware/stm32h747i-disco/src/hmi_jpeg.c) — JPEG codec + DMA2D | **No.** | This is the file that is the hardware. Moving to an F769 or an H7B3 means re-checking its clock enable, its MCU-block geometry and its cache maintenance — a day's work on a part that has the codec, and not possible on one that does not. |

Adding a board that *has* the codec — an F769I-DISCO, an H7B3I-DK, an
H750-based custom board — is therefore: one `video` entry in the board
definition, a copy of the four `hmi_*` runtime files with `hmi_jpeg.c` and
`hmi_sd.c` re-pointed at that board's BSP, FatFs pinned in its
`bootstrap-deps.ps1`, and the HAL JPEG/SD sources in its `CMakeLists.txt`.

### 10.4 What it means for the EVK043027B

This is the part worth stating plainly. The EVK043027B is EDT's own evaluation
kit, and **this widget will never run on it**: the STM32U599 has no JPEG codec
and the board has no external RAM, and neither is something a driver can
supply. A project that places a Video widget cannot be built for it, and the
Deploy tab says so.

If the product line expects video on a U599 panel, the choices are these, and
they are product decisions rather than engineering ones:

1. **Treat video as a feature of the H7-class boards.** This is what the
   editor does today. The widget is there for every board to design with; it
   builds for the ones that can play it.
2. **A separate, smaller widget with an honest name** — a software-decoded
   *Slideshow* or *Animated Image* at 320×240 and a handful of frames a
   second, stalling the UI while it decodes. Possible on the U599; not this
   widget, and not to be sold as video.
3. **Next hardware revision on a part with the codec** — an STM32H7 (H743,
   H750, H7A3/H7B3) or an F76x/F77x — with external SDRAM or the H7B3's
   1.4 MB of internal SRAM to hold the buffers.

Nothing in the editor or the firmware needs to change for any of the three:
the gate already says *cannot be built* in the right place, and a board that
gains the codec is one entry away.

