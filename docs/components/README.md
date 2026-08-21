# EDT HMI Studio — Widget Design Documents

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/README.md">繁體中文</a>
</p>

This directory holds the detailed design document for every widget in EDT HMI Studio. Each one covers the property design, the style system, parent/child rules, the UI rendering layers, code generation and the LVGL API mapping.

---

## Overview

The editor supports **22 widgets** in 6 categories:

| Category | Icon | Count | Purpose |
|------|------|--------|------|
| Basic (basic) | 📦 | 4 | The building blocks of an interface |
| Input (input) | ✏️ | 5 | Controls the user interacts with |
| Shapes (shape) | 🔷 | 3 | Decorative geometry, drawn rather than operated |
| Container (container) | 📁 | 4 | Layout containers that hold children |
| Display (display) | 📊 | 5 | Data display and visualisation |
| Miscellaneous (misc) | 🧩 | 1 | What belongs to no family above |

---

## Basic widgets

| Widget | Type | Icon | Default size | Container | Description | Document |
|------|------|------|----------|------|------|------|
| Button | `btn` | 🔘 | 100×40 | ✅ | A button; a Label child is created inside it automatically to show the text. Supports click interaction, and is the only basic widget with `isContainer=true` | [btn.md](btn.md) |
| Label | `label` | 🏷️ | 80×24 | ❌ | A text label for static or dynamic text. Transparent background, inherits the parent's text colour | [label.md](label.md) |
| Image | `img` | 🖼️ | 100×100 | ❌ | Displays an image. v9 uses `lv_image_create`, v8 uses `lv_img_create` | [img.md](img.md) |
| Spinner | `spinner` | ⏳ | 50×50 | ❌ | A spinning loading indicator built on the Arc widget, with configurable speed | [spinner.md](spinner.md) |

---

## Input widgets

| Widget | Type | Icon | Default size | Container | Description | Document |
|------|------|------|----------|------|------|------|
| Textarea | `textarea` | 📝 | 150×80 | ❌ | A multi-line text input area with placeholder support. Uses the card style (white background, grey border) | [textarea.md](textarea.md) |
| Dropdown | `dropdown` | 📋 | 120×36 | ❌ | A dropdown selector, with configurable options and a default selection | [dropdown.md](dropdown.md) |
| Checkbox | `checkbox` | ☑️ | 120×28 | ❌ | A checkbox with a tick mark and a text label. The checked state is controlled by `LV_STATE_CHECKED` | [checkbox.md](checkbox.md) |
| Switch | `switch` | 🔀 | 50×26 | ❌ | A toggle switch with a rounded capsule shape. The on state is controlled by `LV_STATE_CHECKED` | [switch.md](switch.md) |
| Slider | `slider` | 🎚️ | 150×20 | ❌ | A slider with minimum, maximum and current value | [slider.md](slider.md) |

---

## Shape widgets

Shapes are drawn, not operated. Each one is named for itself in the palette and reported in the property editor as the `Shape` type, which is the family they belong to.

| Widget | Type | Icon | Default size | Container | Description | Document |
|------|------|------|----------|------|------|------|
| Rectangle | `rectangle` | 🟦 | 120×80 | ❌ | A filled, bordered box built on `lv_obj_create`. Square corners and no padding | [rectangle.md](rectangle.md) |
| Line | `line` | 📏 | 100×2 | ❌ | A line, defined by an array of points. Built on `lv_line_create`; its box is the points' extent, never wider than the stroke | [line.md](line.md) |
| Circle | `circle` | 🔵 | 100×100 | ❌ | A disc, ring, sector or annular sector. `lv_obj_create` with a circular radius, or `lv_arc_create` for a sector. Circular only — the software renderer has no elliptical primitive | [circle.md](circle.md) |
| Polygon | `polygon` | 🔷 | 100×100 | ❌ | A closed run of points. `lv_line_create` for the outline and a fan of `lv_draw_triangle` for the fill; a concave outline is drawn unfilled, because a fan cannot cover one | [polygon.md](polygon.md) |

---

## Container widgets

Containers are the most complex part of the editor; the core of the design is **how children are mounted**.

| Widget | Type | Icon | Default size | How children mount | Description | Document |
|------|------|------|----------|----------------|------|------|
| Container | `obj` | 📦 | 200×150 | Directly | The generic container: children are created straight onto it. The most basic container type | [obj.md](obj.md) |
| Tab View | `tabview` | 📑 | 250×200 | via tabChildMap | A tabbed view; children are mapped onto the matching tab page through `tabChildMap` | [tabview.md](tabview.md) |
| Tile View | `tileview` | 🔲 | 200×200 | via tileChildMap | A tiled view; children are mapped onto the matching tile through `tileChildMap` (key format `"row-col"`) | [tileview.md](tileview.md) |
| Window | `win` | 🪟 | 250×200 | content area | A window container; children mount onto the content area returned by `lv_win_get_content()` | [win.md](win.md) |

### How container children are mounted

The store layer (`editorStore.ts`) maintains each container's childMap automatically:

- **addComponent** — when a widget is added to a tabview or tileview, its id is inserted into the childMap entry for the current activeTab or currentTile
- **reparentComponent** — when a widget is moved, its id is removed from the old parent's childMap and added to the new parent's
- **deleteComponents** — when a widget is deleted, its id is cleaned out of the parent's childMap

Code generation and the WASM preview use **virtual ids** to mount children onto the correct internal container:
- Tab View: `{parentId}__tab__{tabIndex}`
- Tile View: `{parentId}__tile__{row}-{col}`
- Window: `{parentId}__win_content`

---

## Display widgets

| Widget | Type | Icon | Default size | Container | Description | Document |
|------|------|------|----------|------|------|------|
| Progress Bar | `bar` | 📊 | 150×20 | ❌ | A progress bar with a configurable range and current value. Rounded capsule shape | [bar.md](bar.md) |
| Arc | `arc` | 🔄 | 100×100 | ❌ | An arc control with start and end angles and a current value | [arc.md](arc.md) |
| Chart | `chart` | 📈 | 200×150 | ❌ | A chart supporting line and bar plots, multiple series, and configurable axes and grid | [chart.md](chart.md) |
| Table | `table` | 📋 | 200×150 | ❌ | A table with configurable rows and columns, cell data, column widths and alignment | [table.md](table.md) |
| Calendar | `calendar` | 📅 | 220×220 | ❌ | A calendar showing a year and month, with a today marker, highlighted dates and range selection | [calendar.md](calendar.md) |

---

## Miscellaneous widgets

Widgets that belong to none of the families above.

| Widget | Type | Icon | Default size | Container | Description | Document |
|------|------|------|----------|------|------|------|
| Video | `video` | 🎬 | 400×240 | ❌ | Plays a Motion JPEG AVI from the panel's SD card, decoded by the board's JPEG codec. The one widget that *names* its content rather than holding it, so a film of any length costs the build nothing | [video.md](video.md) |

> Video is the only widget whose feasibility depends on the board: it needs a
> JPEG codec and an SD interface, so a project using it can only be built for the
> STM32H747I-DISCO. See [docs/video-playback.md](../video-playback.md).

---

## Shared design

### Style system

Every widget supports 4 style states:

| State | LVGL selector | Purpose |
|------|-------------|------|
| `default` | `LV_PART_MAIN \| LV_STATE_DEFAULT` | Default state |
| `pressed` | `LV_PART_MAIN \| LV_STATE_PRESSED` | Pressed state |
| `focused` | `LV_PART_MAIN \| LV_STATE_FOCUSED` | Focused state |
| `disabled` | `LV_PART_MAIN \| LV_STATE_DISABLED` | Disabled state |

The shared style properties (`StyleProps`) cover background colour, border, corner radius, text colour, opacity, padding, shadow, gradient, outline, transform and more. See each widget's document for details.

### Event system

The LVGL event types the editor supports:

| Event | Meaning | Typical widgets |
|------|------|----------|
| `LV_EVENT_CLICKED` | Clicked | btn, checkbox, switch |
| `LV_EVENT_PRESSED` | Pressed | btn |
| `LV_EVENT_RELEASED` | Released | btn |
| `LV_EVENT_LONG_PRESSED` | Long pressed | btn |
| `LV_EVENT_VALUE_CHANGED` | Value changed | slider, arc, dropdown, switch, checkbox, tabview |
| `LV_EVENT_FOCUSED` | Gained focus | textarea, dropdown |
| `LV_EVENT_DEFOCUSED` | Lost focus | textarea, dropdown |
| `LV_EVENT_READY` | Ready | textarea |
| `LV_EVENT_CANCEL` | Cancelled | textarea |

### UI rendering layers

Each widget has 4 rendering implementations in the editor:

1. **Editor canvas** (`CanvasComponent.tsx`) — a React/HTML approximation supporting drag, selection and resize
2. **Prototype** (`PreviewPanel.tsx`) — lightweight Canvas 2D drawing
3. **Simulator** (`ui_from_json.c`) — the real LVGL runtime, fed the widget tree as JSON
4. **Code generation** (`ui.c.ts`) — compilable C for LVGL v8 and v9

### LVGL version compatibility

The editor targets the LVGL v9 API by default. The main differences:

| Feature | v8 | v9 |
|------|----|----|
| Create an image | `lv_img_create` | `lv_image_create` |
| Set the image source | `lv_img_set_src` | `lv_image_set_src` |
| Create a tabview | `lv_tabview_create(parent, dir, size)` | `lv_tabview_create(parent)` |
| Set the active tab | `lv_tabview_set_act` | `lv_tabview_set_active` |
| Create a window | `lv_win_create(parent, height)` | `lv_win_create(parent)` |
| Coordinate type | `lv_coord_t` | `int32_t` |
| Rotation property | `transform_angle` | `transform_rotation` |

---

## File layout

```
docs/components/
├── README.md          ← this file (widget index)
├── btn.md             ← Button
├── label.md           ← Label
├── img.md             ← Image
├── spinner.md         ← Spinner
├── textarea.md        ← Textarea
├── dropdown.md        ← Dropdown
├── checkbox.md        ← Checkbox
├── switch.md          ← Switch
├── slider.md          ← Slider
├── rectangle.md       ← Rectangle
├── line.md            ← Line
├── circle.md          ← Circle
├── polygon.md         ← Polygon
├── obj.md             ← Container
├── tabview.md         ← Tab View
├── tileview.md        ← Tile View
├── win.md             ← Window
├── bar.md             ← Progress Bar
├── arc.md             ← Arc
├── chart.md           ← Chart
├── table.md           ← Table
├── calendar.md        ← Calendar
└── video.md           ← Video
```
