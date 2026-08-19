# Circle (circle) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/circle.md">繁體中文</a>
</p>

## 1. Name and summary

Circle is the round member of the **Shapes** category, beside [Rectangle](rectangle.md) and [Line](line.md). It draws a **disc**, a **ring**, a **sector** (a pie slice) or an **annular sector** — a status dot, a progress-style gauge face, a segment of a dial.

**It is called Circle, not Ellipse, because circular is all LVGL can draw.** The software renderer has no elliptical primitive: a rounded rectangle's radius is clamped to half its shorter side (`lv_draw_sw_fill.c`), so a wide box with a circular radius comes out a pill rather than an ellipse, and `lv_draw_arc_dsc_t` carries a single `radius`, so every arc is a circular one. A true ellipse — and with it the elliptical sector — needs the vector pipeline (`LV_USE_VECTOR_GRAPHIC`), which needs ThorVG or a vector GPU; none of the three boards has either. The name says what the widget does rather than what it might one day do; §12.1 records the routes to an ellipse for when one is worth taking.

The widget keeps a **square box** for the same reason: the canvas never shows a shape the panel cannot draw.

Circle is not a container (`isContainer = false`).

## 2. Type identifier

```
type: 'circle'
```

The palette lists it as **Circle** and instances are named `Circle_1`, `Circle_2`, …, the convention every widget follows; the property editor reports its **Type** as `Shape`, the family Rectangle and Line also belong to, named by the definition's optional `typeName`.

## 3. Category

| Field | Value |
|---|---|
| Category id | `shape` |
| Category name | Shapes |
| Category icon | 🔷 |
| Widget icon | 🔵 |
| Family name (`typeName`) | Shape |
| Position | Third, after Rectangle and Line |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 100 |

Square, and it stays square: a resize drag squares the box in `resizeGeometry.ts`, where the handle is known — a side handle leads with its own axis, a corner with the larger of the two — and `squareBox` in `circleGeometry.ts` holds the same rule for edits that arrive any other way. A corner drag takes the larger of the two sides. The floor is 8px.

> The two have to agree on *which* side leads. A rule that asks "which side changed?" answers differently on the frame after it has squared the box, and the widget flickers between two sizes for as long as the drag lasts. The handle decides, and a box that is already square is left alone.

## 5. Container?

```
isContainer: false
```

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)**, **Button (btn)**, **Container (obj)**, **Tab View**, **Tile View**, **Window** — the same list every shape has

### Can contain

Nothing.

## 7. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `shape` | `'circle' \| 'sector'` | `'circle'` | Which of the two implementations draws it — see §10.4 |
| `startAngle` | `number` | `0` | Sector only. 0° is 3 o'clock, growing clockwise — LVGL's convention |
| `endAngle` | `number` | `270` | Sector only. A sweep of a full turn draws the whole ring |
| `thickness` | `number` | `0` | Sector only. `0` fills the wedge to the centre; anything smaller than the radius leaves a ring |

```typescript
interface CircleProps {
  shape: 'circle' | 'sector';
  startAngle?: number;
  endAngle?: number;
  thickness?: number;
}
```

The four shapes come out of two props:

| Wanted | `shape` | Angles | `thickness` |
|---|---|---|---|
| Disc | `circle` | — | — |
| Ring | `sector` | 0–360 | the ring's width |
| Sector (pie slice) | `sector` | e.g. 0–270 | `0` |
| Annular sector | `sector` | e.g. 0–270 | the ring's width |
| Ring **with an outline** | `circle` | — | — (no fill, border width = the ring's width) |
| Ring **with an outline** | `circle` | — | — (no fill, border width = the ring's width) |

A **circle** is a plain object with a circular radius, which is why it keeps a fill *and* a border. A **sector** is an arc, which has neither — only a colour, its angles and its width — so the property editor drops the border rows the moment the shape changes and says where they went (§8).

## 8. Styles

### Supported style states

| State | Selector | Description |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | Default/normal state |
| `pressed` | `LV_STATE_PRESSED` | Pressed |
| `focused` | `LV_STATE_FOCUSED` | Focused |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

### Default state styles

| Style property | Type | Default | Description |
|---|---|---|---|
| `bgColor` | `string` | `'#E0E0E0'` | Fill. For a sector this becomes the arc's colour |
| `borderColor` | `string` | `'#212121'` | Border colour — circle only |
| `borderWidth` | `number` | `1` | Border width — circle only |
| `borderRadius` | `number` | `0` | Unused: the shape *is* the radius |
| `textColor` | `string` | `'#212121'` | Unused by the shape |
| `opacity` | `number` | `1` | Opacity of the whole widget |
| `padding` | `number` | `0` | No padding |

The palette is Rectangle's, so the three shapes look like a set.

### Which rows the Style section shows

| Row | Circle | Sector |
|---|---|---|
| Background Color | ✅ (fill) | ✅ (the arc's colour) |
| Border Color / Width | ✅ | ❌ — an arc has no border |
| Corner Radius | ❌ — the shape is the radius | ❌ |
| Border Sides | ❌ | ❌ |
| Opacity | ✅ | ✅ |
| Text Color, Padding | ❌ | ❌ |

Shadow, Transform, Gradient, Outline and Blend Mode follow the same visibility table the other shapes use.

### Borders, and the sector

A disc's border is LVGL's own: `border_width` and `border_color` on an object whose radius is circular — crisp, and editable at runtime.

An arc has no outline at all, so a sector has none to give. The property editor says so where the rows would have been, and points at the shape that covers most of what a bordered ring is wanted for: **a ring is a disc with no fill and a thick border**, which is native and needs no sector at all. Only the straight radial edges of a partial wedge are beyond it — outlining those needs the vector renderer.

### Borders, and the sector

A disc's border is LVGL's own: `border_width` and `border_color` on an object whose radius is circular, drawn crisply and editable at runtime.

An arc has no outline at all, so a sector has no border to give. The property editor says so where the rows would have been, and points at the one shape that covers most of what people want a bordered ring for: **a ring is a disc with no fill and a thick border**, which is native, crisp and needs no sector. Only the straight radial edges of a partial wedge are beyond it — outlining those needs the vector renderer.

## 9. Supported events

| Event | Description |
|---|---|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

Both implementations are clickable, so a disc makes a usable touch target — a round button face that is decoration rather than a Button. The hit area is the widget's square box, not the circle inside it. `LV_EVENT_VALUE_CHANGED` has no meaning: a shape holds no value, and the sector's arc is stripped of the parts that would make it a control (§10.4).

## 10. UI layers

### 10.1 Geometry (utils/circleGeometry.ts)

One module holds the rules the other layers draw from:

- `normalizeSweep(start, end)` — start and sweep in LVGL's terms, with a full turn kept as a full turn rather than collapsing to zero
- `innerRadius(size, thickness)` — `0` for a wedge filled to the centre, otherwise the ring's inner edge
- `sectorPath(size, thickness, start, end)` — the SVG path both the canvas and the 2D preview draw
- `squareBox(before, after)` — the box rule from §4

### 10.2 Editor canvas (CanvasComponent.tsx)

A **circle** is the wrapper itself: the widget's box with `border-radius: 50%`, so fill, border, gradient and shadow are the shared style code, exactly as for Rectangle.

A **sector** is the path, and the wrapper paints no box behind it:

```tsx
<svg viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none">
  <path d={sectorPath(size, thickness, startAngle, endAngle)} fill={fill} fillRule="evenodd" />
</svg>
```

`evenodd` is what makes a ring a ring: the inner circle is wound the other way, so the fill leaves the hole.

### 10.3 Simple preview (PreviewPanel.tsx)

`drawCircle` strokes the same two cases: `ctx.arc` for the disc, with the border when it has one, and `ctx.fill(new Path2D(sectorPath(...)), 'evenodd')` for the sector — literally the path the canvas draws, so the two cannot disagree.

### 10.4 LVGL WASM preview and generated code

Both pick the implementation from `props.shape`:

**Circle** — `lv_obj_create` plus `lv_obj_set_style_radius(obj, LV_RADIUS_CIRCLE, 0)`. The radius is clamped to half the shorter side, which is exactly a circle in a square box. The stored `borderRadius` is dropped at generation, since the shape sets it.

```c
ui_dot = lv_obj_create(ui_screen_main);
lv_obj_set_size(ui_dot, 60, 60);
lv_obj_set_style_bg_color(ui_dot, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(ui_dot, 1, 0);
lv_obj_set_style_radius(ui_dot, LV_RADIUS_CIRCLE, 0);
```

**Sector** — `lv_arc_create`, drawn by the arc's *background* part with a width thick enough to close the wedge:

```c
ui_gauge = lv_arc_create(ui_screen_main);
lv_obj_set_size(ui_gauge, 80, 80);
lv_obj_set_style_bg_opa(ui_gauge, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_width(ui_gauge, 0, 0);
lv_obj_remove_style(ui_gauge, NULL, LV_PART_KNOB);
lv_obj_set_style_arc_opa(ui_gauge, LV_OPA_TRANSP, LV_PART_INDICATOR);
lv_arc_set_bg_angles(ui_gauge, 135, 45);
lv_obj_set_style_arc_width(ui_gauge, 12, LV_PART_MAIN);
lv_obj_set_style_arc_rounded(ui_gauge, false, LV_PART_MAIN);
lv_obj_set_style_arc_color(ui_gauge, lv_color_hex(0x2196F3), LV_PART_MAIN);
```

Key behaviour:
- **A thickness of 0, or one at least the radius, becomes the radius**, which closes the ring into a solid wedge
- **The knob and the indicator are removed**, because an arc is a control and this one is a decoration. Without that a drag would move a knob across the shape
- **The end angle is wrapped before it is emitted.** LVGL subtracts a single turn from an angle over 360 (`lv_arc_set_bg_start_angle`), so `start + sweep` would misbehave for a late start; a full turn is emitted as `0, 360`, which is how an arc says "all the way round"
- The box styles are dropped for a sector: an arc draws no fill or border, and the colour reaches it as `arc_color`

> The WASM preview's `create_ellipse` does the same and reaches the preview on the next `wasm/build.sh`; the committed `public/wasm` binary predates it.

## 11. LVGL API mapping

| API | Used for |
|---|---|
| `lv_obj_create(parent)` | The disc |
| `lv_obj_set_style_radius(obj, LV_RADIUS_CIRCLE, sel)` | Making it round |
| `lv_arc_create(parent)` | The sector |
| `lv_arc_set_bg_angles(arc, start, end)` | The wedge |
| `lv_obj_set_style_arc_width(arc, w, LV_PART_MAIN)` | Ring width, or the radius for a solid wedge |
| `lv_obj_set_style_arc_color(arc, color, LV_PART_MAIN)` | Its colour |
| `lv_obj_set_style_arc_rounded(arc, en, LV_PART_MAIN)` | Rounded wedge ends |
| `lv_obj_remove_style(arc, NULL, LV_PART_KNOB)` | Removing the control parts |

## 12. Design notes

### 12.1 Why it is not an Ellipse

Four routes to a true ellipse exist, and none of them is free:

| Route | Quality | Flash | Heap | The catch |
|---|---|---|---|---|
| **A8 bitmap mask** | Perfect, antialiased | w × h bytes per ellipse (200×100 = 20 KB) | 8 KB strips — `bitmap_mask_src` makes a **simple** layer (`lv_obj_style.c`), which `lv_refr.c` subdivides | The size is fixed at build time; a border cannot follow the ellipse |
| **A pre-drawn image** | Perfect | ARGB8888, 200×100 = 80 KB | none | Colour fixed too. Works today with the Image widget |
| **A transform** | Soft edges, uneven border | none | A **whole** transform layer per redraw (200×100 → 160 KB) | The same mechanism that froze a panel once; the drawing stops matching the widget's box |
| **ThorVG vector** | Perfect, scalable | ~200 KB+ | moderate | A C++ toolchain and a library on every board |

The mask is the one worth taking if the widget ever grows an elliptical mode: the fill stays an ordinary style, so colour is still editable at runtime, and the layer it forces is the cheap kind.

Until then the widget is circular and its box is square, which is the honest version: the canvas shows what the panel will draw, and the name says so.

### 12.2 The rest

1. **One widget, two implementations.** `shape` picks between an object and an arc. Keeping them behind one palette entry means the disc and the sector share an identity, a property panel and a name; a future elliptical mode is another value of the same prop rather than a new widget and a project migration.

2. **A sector is a decoration, not a control.** The arc's knob and indicator are removed at creation. Everything the shape draws lives in `LV_PART_MAIN`.

3. **The angles are LVGL's, not the canvas's.** 0° is 3 o'clock and they grow clockwise, which is what SVG and Canvas 2D also do with y pointing down, so no layer has to convert.

4. **The box is the hit area.** A disc's square box means the corners outside the circle are still clickable. That is what LVGL does too — the object's area is the touch area, whatever the radius draws.
