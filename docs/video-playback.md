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
| EDT EVK043027B | ❌ | The STM32U599 has no JPEG codec, and the kit brings out no SD socket. |

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
                                       ARGB8888, raster order ──► lv_image
```

The JPEG codec and DMA2D were designed as a pair on this part: DMA2D's YCbCr
input mode reads exactly the MCU-block layout the codec emits, converts it, and
writes raster ARGB8888. Nothing here is a software decode with hardware
assistance — it is a hardware decode.

Both stages are **polled**, and the whole thing runs inside one `lv_timer`
callback. The caller has to wait for the frame before it can show it, so an
asynchronous decode would buy nothing but a state machine.

### The budget

At 24 fps a frame period is 41.7 ms. A 800×480 frame costs a few milliseconds of
codec time and roughly 140 KB of card reads at the ~27 Mbit/s this is built for.
The main loop keeps running Modbus and touch between frames.

The one thing that can spend that budget badly is **scaling**. The picture is
drawn with `LV_IMAGE_ALIGN_CONTAIN`, so it keeps its aspect ratio inside
whatever box the widget was given — and when the widget is exactly the video's
own resolution, LVGL blits the frame with no scaling at all. **Size the Video
widget to the video.** At any other size every frame is resized in software, on
the CPU, at frame rate.

### The buffers

| Buffer | Size at 800×480 | Written by | Read by |
| --- | --- | --- | --- |
| Compressed frame | 512 KB | `f_read` | JPEG codec |
| YCbCr MCU blocks | 1152 KB | JPEG codec | DMA2D |
| ARGB8888 picture | 1500 KB | DMA2D | LVGL |

All three live in the board's external SDRAM, in the `.sdram` section, above
LVGL's own 4 MB heap. They are **shared, not per-widget**, because only one
video can decode at a time ([§5](#5-one-player-at-a-time)).

A project with no Video widget pays none of it. `--gc-sections` drops the
runtime and its buffers entirely when nothing calls `hmi_video_attach`; measured
on this board, a screen with a video costs **+20 KB of Flash and 3.1 MB of
SDRAM** against the same screen without one, and a project that has no video is
byte-for-byte what it was before this existed.

D-Cache is maintained around each hand-off: the codec's output is cleaned before
DMA2D reads it, and the converted frame is invalidated before LVGL does. Cards
are read by polling rather than DMA, which sidesteps the same problem on that
side at the cost of CPU time the runtime is spending waiting anyway.

## 5. One player at a time

There is one JPEG codec and one set of buffers, so the runtime plays **the first
Video widget on the loaded screen** and leaves any other showing *Another video
is playing*. One video per screen is the shape a project actually takes;
registering several across several screens is ordinary and works.

The widget the project styles is the black frame. The runtime puts two children
inside it:

- an **`lv_image`**, which the decoded frame is set on, hidden until the first
  frame lands;
- an **`lv_label`**, centred, which carries whatever the panel has to say.

The label inherits the frame's text colour, so the message is styled by the
widget's own **Text Color** row rather than hard-coded.

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

A widget that fails says its piece once and stops — retrying every frame period
would hammer a card that is not there. Leaving the screen and coming back
retries.

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
