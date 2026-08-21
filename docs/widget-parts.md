# Widget Parts — Styling the Pieces LVGL Draws

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/widget-parts.md">繁體中文</a>
</p>

A slider is not one thing. LVGL draws it as three: the groove, the length
already travelled, and the handle. Each is a **part**, and a style reaches
exactly one of them through a part selector.

The editor used to write every style to `LV_PART_MAIN`. A project could paint
the groove and never the fill, so every slider, switch, progress bar and
spinner kept the stock theme's blue however warm the rest of the screen was —
and there was no way to say otherwise short of editing the generated C.

The Style section now has a **part switcher** above its state switcher, listing
the parts that widget actually has.

## 1. Which widgets have parts

| Widget | Parts, as the switcher names them |
| --- | --- |
| Slider | Track · Fill · Knob |
| Progress Bar | Track · Fill |
| Switch | Off · **On** · Knob |
| Checkbox | Label · **Box** |
| Dropdown | Box · Arrow |
| Arc | Track · Value · Knob |
| Spinner | Track · Arc |

Everything else has a single part and shows no switcher — the Style section is
what it always was.

The names are the widget's own, not LVGL's. `LV_PART_INDICATOR` means the
filled part of a slider, the On colour of a switch and the tick box of a
checkbox; nobody should have to hold that mapping in their head to change a
colour. The catalogue is `widgetParts()` in
[src/utils/widgetParts.ts](../src/utils/widgetParts.ts), and it is the one
place the mapping lives — the property editor, both renderers and the code
generator all read it.

## 2. The Checked state

`LV_STATE_CHECKED` is now one of the style states, alongside Pressed, Focused
and Disabled. It is not a nicety:

> A switch's on colour, and a checkbox's ticked box, can **only** be set in the
> Checked state.

LVGL's default theme sets the primary colour on
`LV_PART_INDICATOR | LV_STATE_CHECKED`, and a style carrying a state selector
beats one without it whatever order the two were added in. A switch styled in
its resting state alone therefore looks right until it is switched on, and then
turns blue.

Choosing the **On** part jumps the state switcher to Checked for exactly this
reason — the friendly label would otherwise be a lie about where the colour has
to go.

## 3. What a part style can say

Most parts are drawn as a box and take the properties a box takes: fill,
gradient, border, corner radius, padding, shadow, opacity. They go through the
same `generateStyleCode` the main part does, with a different selector:

```c
lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0xF0A94C), LV_PART_INDICATOR);
lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0xF7F2ED), LV_PART_KNOB);
lv_obj_set_style_bg_color(ui_eco, lv_color_hex(0x4FD1A5), LV_PART_INDICATOR | LV_STATE_CHECKED);
```

### Arcs are the exception

An **Arc** and a **Spinner** draw their Track and their Value as arcs, and an
arc has no fill, border or corners — it has a colour and a thickness. Those two
rows are read for what the shape actually has:

| Style row | On an arc part |
| --- | --- |
| Background Color | `arc_color` |
| Border Width | `arc_width` |
| Opacity | `arc_opa` |

The property editor hides the rows that would do nothing, the same way it does
for a Line or a Circle sector. A Knob is a real box and is not one of these.

This is not a new convention. `componentDefinitions.ts` has always given Arc
and Spinner a `borderColor` meaning "the arc's colour", and the editor canvas
has always drawn it that way. What is new is that **the firmware agrees**:
before, those rows were taken literally and a spinner given an accent colour
came out as a square frame around the ring.

For the same reason, an arc-shaped widget's own Border Color still stands in
for its Value colour when no Value part is set — that is what existing projects
mean by it. Setting the Value part wins, because parts are emitted last.

## 4. Where it is honoured

All three renderers read the same part styles through the same helpers, so they
cannot drift apart:

| Layer | Reads parts through |
| --- | --- |
| Editor canvas | `partColor` / `partStyle` in `CanvasComponent.tsx` |
| Prototype (2D) | `partColor` / `partStyle` in `PreviewPanel.tsx` |
| Emulator and firmware | `generatePartStyleCode` in `ui.c.ts` |

A part a project says nothing about emits nothing and keeps the theme's own
styling — which is what every project written before parts existed does, and
how it keeps rendering.

## 5. Shape on disk

```jsonc
"styles": {
  "default":  { "bgColor": "#3A2E25" },     // LV_PART_MAIN, resting
  "pressed":  { "bgColor": "#2E2620" },     // LV_STATE_PRESSED
  "parts": {
    "indicator": { "checked": { "bgColor": "#4FD1A5" } },
    "knob":      { "default": { "bgColor": "#F7F2ED" } }
  }
}
```

`parts` is absent from every project written before this existed, and absent
means "leave them to the theme". Nothing has to be rewritten on disk.

## 6. What is not here yet

- **Parts beyond these three.** LVGL also exposes a textarea's cursor, a
  table's and a chart's items, a roller's selected row and every widget's
  scrollbar. Adding one is a row in `PARTS_BY_TYPE` plus the renderers knowing
  how to draw it.
- **Arc caps.** `arc_rounded` has no row of its own, so an arc's ends are
  always square.
- **A slider's own knob size.** In LVGL that is padding on `LV_PART_KNOB`; the
  editor canvas draws it at a fixed 16px whatever the padding says.
