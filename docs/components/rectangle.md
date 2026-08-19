# Rectangle (rectangle) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/rectangle.md">繁體中文</a>
</p>

## 1. Name and summary

Rectangle draws a filled, bordered box. It belongs to the **Shapes** category — decorative geometry rather than a control, beside [Line](line.md) — and is used for panels behind a group of widgets, frames, dividers, colour swatches and status blocks whose fill is repainted at runtime.

LVGL has no rectangle widget: a rectangle *is* a plain object wearing a fill, a border and a corner radius, which is exactly what `lv_obj_create` produces. Rectangle is not a container (`isContainer = false`) and cannot hold children — the Container (`obj`) widget is what holds children.

## 2. Type identifier

```
type: 'rectangle'
```

The palette lists it as **Rectangle**, but the property editor reports its **Type** as `Shape`: the widget is one shape among those this category holds, and the definition names that family through the optional `typeName` field — Line carries the same one. A new instance is named `Rectangle_1`, `Rectangle_2`, … by the shared `nextComponentName` rule, which reuses numbers freed by deletions.

## 3. Category

| Field | Value |
|---|---|
| Category id | `shape` |
| Category name | Shapes |
| Category icon | 🔷 |
| Widget icon | 🟦 |
| Family name (`typeName`) | Shape |

The category sits between Input and Containers in the palette.

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 120 |
| defaultHeight | 80 |

Wide enough to read as a rectangle rather than a square the moment it lands on the canvas, and small enough to fit a 480×272 panel several times over.

## 5. Container?

```
isContainer: false
```

Dropping a widget onto a rectangle mounts it on the rectangle's parent, not on the rectangle. A shape that needed children would be a Container.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Button (btn)** — as decoration inside a button
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing.

## 7. Properties (props)

```
defaultProps: {}
```

Rectangle carries **no props of its own**. Everything it draws — fill colour, gradient, border colour, width and side, corner radius, outline, shadow, opacity — is a style, and the shared Style section already edits all of them.

> This is the deliberate difference from Line. Line carries `lineWidth` and `lineColor` because LVGL's `line_width` / `line_color` styles are reachable no other way in the editor; a rectangle's `bg_*` and `border_*` styles are reachable directly, so mirroring them into props would create a second place to set the same value. `points` has no meaning for a rectangle at all.

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
| `bgColor` | `string` | `'#E0E0E0'` | Fill colour (LVGL's `color_grey`) |
| `borderColor` | `string` | `'#212121'` | Border colour (`color_text`) |
| `borderWidth` | `number` | `1` | Border width — a hairline outline |
| `borderRadius` | `number` | `0` | Square corners, or it would not be the rectangle it is named after |
| `textColor` | `string` | `'#212121'` | Text colour, unused by the shape itself |
| `opacity` | `number` | `1` | Opacity of the whole widget |
| `padding` | `number` | `0` | No padding — a shape has no content to inset |

### Where the defaults come from

There is no LVGL theme style to inherit: a shape is drawn, not themed. The defaults borrow the theme's palette so a rectangle sits comfortably next to the other widgets — `color_grey` (`#E0E0E0`) for the fill under a `color_text` (`#212121`) hairline — while keeping square corners and zero padding, which is what distinguishes a shape from the card-styled Container.

### Extended style sections

Rectangle enables every style section that paints a box:

- Shadow: `shadowColor`, `shadowWidth`, `shadowOffsetX/Y`, `shadowSpread`, `shadowOpacity`
- Gradient: `bgGradColor`, `bgGradDir`, `bgGradStop`
- Outline: `outlineColor`, `outlineWidth`, `outlinePad`
- Transform: `transformAngle`, `transformZoomX/Y`, `transformPivotX/Y`
- Blend mode: `blendMode`
- Border side and per-corner radius, from the shared Style section

The Scrollbar and Text sections stay hidden: a rectangle neither scrolls nor draws text.

> Transform is the one section with a cost on the device. A rotated or scaled widget is rendered through a layer — one contiguous ARGB8888 buffer the size of the widget, `(w + 10) × (h + 10) × 4` bytes, taken from LVGL's heap and never split into strips. A 200×200 rectangle asks for 179 KB of it. The boards' heaps are sized for this ([LVGL Configuration §1.4](../lvgl-configuration.md)), and the failure mode if one ever does not fit is silent: LVGL cannot finish the frame at all, so the panel freezes on what it was showing rather than dropping the shape.

## 9. Supported events

| Event | Description |
|---|---|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

`lv_obj_create` objects are clickable by default, so a rectangle is a usable touch target the moment it is placed — a hit area over a region of the screen, or a tappable colour block. `LV_EVENT_VALUE_CHANGED` has no meaning: a shape holds no value. For the same reason Rectangle is not offered in the Modbus binding editor; to drive a shape from a register, read the register in a logic graph and set the shape's style there.

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

```tsx
case 'rectangle':
  return null;
```

The wrapper `<div>` every canvas component already renders paints the fill, gradient, border, border radius, shadow, outline and transform from the widget's styles — which is the whole of a rectangle. There is no inner content to draw.

`resolveFallbackBackground` returns `'transparent'` for a rectangle: clearing the fill is how an outline-only shape is drawn, so the canvas must not helpfully fill it back in.

### 10.2 Simple preview (PreviewPanel.tsx)

The rectangle shares the panel drawing path:

```typescript
case 'rectangle':
case 'obj':
case 'panel':
case 'container':
  drawPanel(ctx, x, y, w, h, {
    bgColor: bgColorStyle,
    borderColor,
    borderWidth,
    borderRadius,
    gradientFill: getGradientFill(),
    borderSide: styles.borderSide,
  });
  break;
```

`drawPanel` fills a rounded rect and then strokes the requested border sides — the same box a panel draws.

> The style fallbacks feeding this switch are nullish (`??`), not falsy (`||`): a shape asking for `borderRadius: 0` or `borderWidth: 0` means zero, and the editor canvas has always honoured that.

### 10.3 LVGL WASM preview

The widget is serialised like any other node:

```json
{
  "type": "rectangle",
  "id": "comp-xxx",
  "parent": null,
  "x": 100, "y": 20,
  "width": 120, "height": 80,
  "props": {},
  "styles": {
    "default": {
      "bgColor": "#E0E0E0",
      "borderColor": "#212121",
      "borderWidth": 1,
      "borderRadius": 0,
      "textColor": "#212121",
      "opacity": 1,
      "padding": 0
    }
  }
}
```

On the C side `rectangle` maps to the shared object creator:

```c
{ "rectangle", create_obj },
```

`apply_styles` then paints it. An unknown type falls back to `lv_obj_create` in `ui_from_json`, so a rectangle rendered correctly even before the table entry existed; the entry makes the mapping deliberate rather than accidental, and reaches the shipped binary the next time `wasm/build.sh` runs.

### 10.4 Generated code (ui.c.ts)

```c
// Create rectangle: frame
ui_frame = lv_obj_create(ui_screen_main);
lv_obj_set_pos(ui_frame, 100, 20);
lv_obj_set_size(ui_frame, 120, 80);
lv_obj_set_style_bg_color(ui_frame, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_bg_opa(ui_frame, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(ui_frame, lv_color_hex(0x212121), 0);
lv_obj_set_style_border_width(ui_frame, 1, 0);
lv_obj_set_style_radius(ui_frame, 0, 0);
lv_obj_set_style_pad_all(ui_frame, 0, 0);
```

`getCreateFunction` maps `rectangle` to `lv_obj_create`; there is no case in `generatePropsCode`, because there are no props. Every visible attribute comes out of the shared style generator, which emits an explicit value for each style the widget defines — including `radius: 0`, so the generated rectangle keeps its square corners against the theme's rounded default.

## 11. LVGL API mapping

### Creation

| Version | API |
|---|---|
| LVGL v9 | `lv_obj_create(parent)` |
| LVGL v8 | `lv_obj_create(parent)` |

### Key APIs

| API | Description |
|---|---|
| `lv_obj_create(parent)` | Create the object the shape is drawn as |
| `lv_obj_set_style_bg_color(obj, color, sel)` | Fill colour |
| `lv_obj_set_style_bg_opa(obj, opa, sel)` | Fill opacity — `LV_OPA_TRANSP` for an outline-only shape |
| `lv_obj_set_style_bg_grad_color(obj, color, sel)` | Gradient end colour |
| `lv_obj_set_style_border_color(obj, color, sel)` | Border colour |
| `lv_obj_set_style_border_width(obj, w, sel)` | Border width |
| `lv_obj_set_style_border_side(obj, side, sel)` | Which sides are drawn |
| `lv_obj_set_style_radius(obj, r, sel)` | Corner radius |
| `lv_obj_set_style_outline_width(obj, w, sel)` | Outline width |
| `lv_obj_set_style_shadow_width(obj, w, sel)` | Shadow width |
| `lv_obj_set_pos(obj, x, y)` | Position |
| `lv_obj_set_size(obj, w, h)` | Size |

## 12. Design notes

1. **A shape is styles, nothing else.** The whole widget is its style set, which is why it has no props and why its property editor shows the shared sections only. Adding `fillColor`-style props would duplicate the Style section and leave two places to set one value.

2. **Rectangle vs Container.** Both are `lv_obj_create` underneath. Container is a card-styled box with `padding: 16` that accepts children; Rectangle is a square-cornered shape with `padding: 0` that does not. Keeping them apart keeps the hierarchy honest: a rectangle in the tree is decoration, never a parent.

3. **Square by default.** `borderRadius: 0` is the one default a rectangle cannot compromise on. Both the canvas and the generated code emit the explicit `0`; the Canvas 2D preview's radius fallback was made nullish so it agrees with them.

4. **Clickable by default.** LVGL's base object carries `LV_OBJ_FLAG_CLICKABLE`, so events bind to a rectangle without ceremony — unlike Line, whose 4px hit area makes event binding impractical. Clear the Clickable flag to let touches pass through to whatever sits underneath.

5. **A family, not a one-off.** `typeName: 'Shape'` exists so the property editor can report the family while the palette names the specific shape. Line carries it too, and a future Circle or Triangle is a new definition in the same category with the same `typeName`, not a variant prop on this one.

6. **No Modbus binding.** The binding editor lists widgets that hold a value. A shape does not, so it is deliberately absent; drive a rectangle's appearance from a logic graph instead.
