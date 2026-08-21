# Video (video) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/video.md">繁體中文</a>
</p>

## 1. Name and summary

Video plays a film from the panel's SD card. It is the only widget whose content
the project does not own: the file is **named** here rather than imported, and
nothing about it enters the firmware image. A two-hour clip costs the build
exactly as much as a two-second one — nothing — and changing it means swapping
the card, not rebuilding.

The format is **Motion JPEG in an AVI container**, decoded frame by frame by the
board's JPEG codec peripheral with DMA2D doing the colour conversion. That is
not a preference: nothing else is playable at 24 fps on a Cortex-M7 that is also
drawing a user interface. See [docs/video-playback.md](../video-playback.md) for
the whole design.

Video is not a container (`isContainer = false`) and cannot hold children — the
runtime puts its own image and message label inside it.

## 2. Type identifier

```
type: 'video'
```

## 3. Category

| Field | Value |
|---|---|
| Category id | `misc` |
| Category name | Miscellaneous |
| Category icon | 🧩 |
| Widget icon | 🎬 |

Miscellaneous is the category for widgets that belong to no family above it. A
video is not a control, not a shape and not a chart — it is a panel showing
something the firmware plays.

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 400 |
| defaultHeight | 240 |

> Half of 800×480: the panel's own aspect ratio, at a size that leaves room on
> the canvas to place something beside it.
>
> **Size the widget to the video's own resolution.** At 1:1 LVGL blits each
> frame; at any other size it resizes every frame in software, on the CPU, at
> frame rate. See [§12](#12-design-notes).

## 5. Container?

```
isContainer: false
```

Nothing can be dropped into it. The runtime creates two children of its own — an
`lv_image` for the decoded frames and an `lv_label` for whatever the panel has to
say — and a third child from the editor would land on top of the picture.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — the ordinary case, usually filling it
- **Container (obj)** — inside a panel, with a caption beside it
- **Tab View (tabview)** — in a tab's content area
- **Tile View (tileview)** — in a tile
- **Window (win)** — in the window content area

### Can contain

Nothing.

> **One per screen.** There is one JPEG codec and one set of buffers, so the
> runtime plays the first Video widget on the loaded screen and leaves any other
> reading *Another video is playing*. One per screen across several screens is
> ordinary and works.

## 7. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `fileName` | `string` | `''` | The file to play, as it is named in the **root** of the SD card. A name, not a path. |
| `autoPlay` | `boolean` | `true` | Start playing as soon as the screen carrying the widget is loaded. |
| `loop` | `boolean` | `true` | Start again from the first frame when the last one has been shown. |

### props type

```typescript
interface VideoProps {
  fileName: string;
  autoPlay: boolean;
  loop: boolean;
}
```

### About the properties

- `fileName` is typed, not picked. The editor has no way to read the SD card, so
  there is nothing to browse — and no resource is created, which is the whole
  reason a film of any length is free.
- An **empty** `fileName` is not blocked. The widget behaves exactly as a
  misspelled one does: the panel draws *Video not found*. From where the person
  looking at the panel stands, those are the same mistake.
- `autoPlay` off leaves the widget on its black frame until something calls
  `hmi_video_play`. No editor action is bound to that yet — see
  [docs/video-playback.md §7](../video-playback.md#7-what-this-deliberately-does-not-do).
- `loop` off leaves the **last frame on screen** when the file ends. Going to
  black would look like a failure, and the video did exactly what it was asked.

### What the editor checks

Advisory, never blocking — only the things that are wrong whatever is on the
card:

| Typed | Warning |
|---|---|
| *(empty)* | No file named yet. Type the name as it appears in the root of the SD card. |
| `clips/intro.avi` | The runtime opens the file from the root of the card, so this is a name rather than a path. |
| `intro.mp4` | Only an AVI container is read. |

Everything else — a name that matches nothing there, a file whose video track is
not Motion JPEG — waits for the panel.

## 8. Styles

### Supported style states

| State | Selector | Description |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | Default/normal state |

The runtime never puts the widget into a pressed, focused or disabled state, so
only the resting one has any effect.

### Default state styles

| Style property | Type | Default | Description |
|---|---|---|---|
| `bgColor` | `string` | `'#000000'` | The empty frame. Black, because that is what an empty video frame is. |
| `borderColor` | `string` | `'transparent'` | No border |
| `borderWidth` | `number` | `0` | No border, so the widget is exactly the picture |
| `borderRadius` | `number` | `0` | Square corners |
| `textColor` | `string` | `'#ffffff'` | **The colour the panel writes its messages in** |
| `opacity` | `number` | `1` | Opaque |
| `padding` | `number` | `0` | None, so the picture reaches the edges |

### Where the defaults come from

Not from the LVGL theme. A video frame is not a card and not a control — it is a
picture, and the box behind a picture that has not filled it is black. Letting
the theme's white through a letterboxed frame is the one thing these defaults
exist to prevent.

`textColor` is not decoration here: the message label the runtime creates is a
child of this widget and inherits it, so **Text Color** is how *Video not found*
is styled.

### Extended style properties

None. The widget is not in any of the shadow, transform, gradient, outline,
scrollbar, text-style or blend-mode sets, so the property editor hides all of
them. A transform on a widget whose content is replaced 24 times a second would
rebuild its layer on every frame.

## 9. Supported events

| Event | Description |
|---|---|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |

> A video is not a control and is not clickable by default. Binding a click to
> it — to move to the next screen when a title sequence is tapped, say — works
> the way it does on any other widget.

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

`CanvasVideoContent` draws the frame the picture will occupy, with a play glyph,
the file name, and badges for what the widget will do when the screen loads:

```tsx
<CanvasVideoContent
  fileName={props.fileName}
  autoPlay={props.autoPlay !== false}
  loop={props.loop !== false}
  textColor={defaultStyle.textColor || '#ffffff'}
/>
```

Key behaviour:

- No still is invented. The editor has never seen the file, and a made-up
  thumbnail would be the one thing on the canvas not derived from the project.
- A widget pointed at nothing reads **No file named** and takes an `unnamed`
  class — the one failure the editor can catch before the panel does.
- The badges read `AUTO · LOOP`, dropping either as it is switched off.
- `resolveFallbackBackground('video')` returns `'transparent'`: the widget ships
  with a black fill it owns, and clearing that fill is a deliberate choice the
  canvas must not paint back in.

### 10.2 Prototype (PreviewPanel.tsx)

`drawVideo` draws the same thing on the Canvas 2D preview: the black frame, a
play triangle sized off the shorter side, the file name, and the badges.

```typescript
drawVideo(ctx, x, y, w, h, {
  fileName: comp.props.fileName,
  autoPlay: comp.props.autoPlay !== false,
  loop: comp.props.loop !== false,
  bgColor: bgColorStyle,
  textColor,
});
```

The prototype does not play anything, and deliberately does not pretend to.

### 10.3 Simulator

#### JSON serialisation (editorStateToJson.ts)

Props pass through unchanged:

```json
{
  "type": "video",
  "id": "comp-xxx",
  "parent": null,
  "x": 0, "y": 0,
  "width": 800, "height": 480,
  "props": { "fileName": "intro.avi", "autoPlay": true, "loop": true },
  "styles": { "default": { "bgColor": "#000000", "textColor": "#ffffff" } }
}
```

#### Creation on the C side (ui_from_json.c)

```c
static lv_obj_t *create_video(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *frame = lv_obj_create(parent);
    lv_obj_remove_flag(frame, LV_OBJ_FLAG_SCROLLABLE);
    /* ... */
    lv_label_set_text_fmt(text, LV_SYMBOL_VIDEO " %s\nNot played in the Emulator", file);
}
```

The Emulator runs real LVGL against the real screen definition, but the one
thing a browser tab cannot have is the panel's card reader. Showing *Video not
found* there would be a different claim — that the card was looked at and came
back empty — and only the panel can say that.

### 10.4 Generated code (ui.c.ts)

```c
// Create video: Intro Clip
ui_intro_clip = lv_obj_create(ui_screen_main);
lv_obj_set_pos(ui_intro_clip, 0, 0);
lv_obj_set_size(ui_intro_clip, 800, 480);
lv_obj_set_style_bg_color(ui_intro_clip, lv_color_hex(0x000000), 0);
lv_obj_set_style_bg_opa(ui_intro_clip, LV_OPA_COVER, 0);
lv_obj_set_style_border_width(ui_intro_clip, 0, 0);
lv_obj_set_style_radius(ui_intro_clip, 0, 0);
lv_obj_set_style_text_color(ui_intro_clip, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_pad_all(ui_intro_clip, 0, 0);
lv_obj_remove_flag(ui_intro_clip, LV_OBJ_FLAG_SCROLLABLE);
hmi_video_attach(ui_intro_clip, "intro.avi", true, true);
```

And, only for a project that has a video anywhere:

```c
#include "hmi_video.h"
```

Key behaviour:

- The widget is a plain `lv_obj` — the black frame. What fills it belongs to the
  runtime, not to the generator.
- Scrolling is cleared: the picture fills the box exactly, and a stray drag on a
  touch panel must not slide it.
- The file name is escaped into a C string literal and handed over. Nothing is
  linked; the runtime is what looks for it.
- A widget pointed at nothing still generates `hmi_video_attach(obj, "", …)`, so
  the panel is the thing that reports it.
- The `hmi_video.h` include is emitted **only** when a screen carries a video, so
  a project without one acquires no dependency on hardware it never asked for.

## 11. LVGL API mapping

### Creation

| Version | API | Notes |
|---|---|---|
| LVGL v9 | `lv_obj_create(parent)` | Then `hmi_video_attach` |
| LVGL v8 | `lv_obj_create(parent)` | Same; the runtime targets v9 |

### The runtime interface

Declared in `firmware/stm32h747i-disco/include/hmi_video.h`:

| API | Description |
|---|---|
| `hmi_video_attach(frame, file_name, auto_play, loop)` | Bind a widget to a file in the root of the card. Opens nothing — the card is read the first time the widget is on the active screen. |
| `hmi_video_play(frame)` | Start, or restart one that has ended |
| `hmi_video_pause(frame)` | Hold on the current frame |
| `hmi_video_stop(frame)` | Back to the first frame, and to the black frame |

### What the runtime uses inside the widget

| API | Description |
|---|---|
| `lv_image_create` / `lv_image_set_src` | The decoded frame, as an `lv_image_dsc_t` over the ARGB8888 buffer |
| `lv_image_set_inner_align(LV_IMAGE_ALIGN_CONTAIN)` | Keeps the aspect ratio inside the widget's box |
| `lv_image_cache_drop` | Tells LVGL the pixels behind an unchanged descriptor are different ones |
| `lv_label_create` / `lv_label_set_text` | The message, inheriting the widget's text colour |
| `lv_timer_create` / `lv_timer_set_period` | One timer, its period set from the AVI header's frame interval |

## 12. Design notes

1. **Named, not imported.** This is the widget's whole shape. Everything else —
   no browse button, no resource entry, the panel being the thing that reports a
   missing file — follows from it.

2. **Size the widget to the video.** `LV_IMAGE_ALIGN_CONTAIN` means a 800×480
   video in a 800×480 widget is blitted with no scaling. Any other size resizes
   every frame in software at frame rate, which is the one way to spend the
   41 ms frame budget badly.

3. **One player at a time.** One codec, one set of buffers. The runtime picks
   the first Video widget on the loaded screen, in registration order — the
   order they appear in the project, and therefore the one a user can predict.

4. **The board decides whether it can be built.** Only the STM32H747I-DISCO has
   a JPEG codec and an SD socket. A project using this widget cannot be built for
   the other two boards, and the Video section and the Deploy tab both say so.
   See [docs/video-playback.md §2](../video-playback.md#2-which-boards-can-play-one).

5. **Nothing opens at init.** A screen the user never visits costs no card
   access, boot never blocks on a missing card, and a card pushed in afterwards
   is still found. Leaving a screen and returning is also what retries a widget
   that failed.

6. **Costs nothing when unused.** `--gc-sections` drops the runtime and its
   3.1 MB of SDRAM buffers when no `hmi_video_attach` call exists. Measured on
   this board: **+20 KB of Flash** for a project that has a video, and
   byte-for-byte no change for one that does not.

7. **No audio.** The audio stream is demuxed past, not decoded. Produce files
   with `ffmpeg … -an`; the frames are identical either way and the audio track
   is only making the file bigger. See
   [docs/video-playback.md §7](../video-playback.md#7-what-this-deliberately-does-not-do).

8. **Three previews, none of them playing.** Canvas, Preview and Emulator all
   draw the frame and name the file. That is not a gap to close later — none of
   them has a card reader, and inventing a still would be the only fabrication in
   an editor whose previews are otherwise all derived from the project.
