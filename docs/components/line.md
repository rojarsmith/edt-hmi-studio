# Line (line) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/line.md">繁體中文</a>
</p>

## 1. Name and summary

Line draws straight segments. In LVGL a line object (`lv_line`) is defined by an array of point coordinates and supports properties such as line width and colour. Lines are commonly used for separators and decoration.

It belongs to the **Shapes** category, beside [Rectangle](rectangle.md): drawn geometry rather than a control. It was a Basic widget until the category existed.

Line is not a container (`isContainer = false`) and cannot hold children.

## 2. Type identifier

```
type: 'line'
```

The palette lists it as **Line**, and the property editor reports its **Type** as `Shape` — the family it belongs to, named by the definition's optional `typeName`. Instances are still called `Line_1`, `Line_2`, … after the palette name.

## 3. Category

| Field | Value |
|---|---|
| Category id | `shape` |
| Category name | Shapes |
| Category icon | 🔷 |
| Widget icon | 📏 |
| Family name (`typeName`) | Shape |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 2 |

The height is the stroke, not a hit area: **a line has no area beyond the line itself**. Its box is the extent of its points, opened up to `lineWidth` on the axis it does not travel along, and the editor keeps it that way — see §7.1. The canvas gives the stroke a wider transparent target to click, which is editor chrome and never part of the widget.

## 5. Container?

```
isContainer: false
```

Line is a pure display widget and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Button (btn)** — as a decorative line inside a button
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing. Line is not a container and cannot hold any children.

## 7. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `points` | `number[][]` | `[[0,0],[100,0]]` | The segment's point coordinates; each point is `[x, y]` |
| `lineWidth` | `number` | `2` | Stroke width in pixels — `line_width` |
| `lineColor` | `string` | `'#212121'` | Stroke colour — `line_color` |
| `lineRounded` | `boolean` | `false` | Rounds both ends by half the stroke width — `line_rounded` |
| `lineDashWidth` | `number` | `0` | Dash length; `0` draws a solid line — `line_dash_width` |
| `lineDashGap` | `number` | `0` | Gap between dashes, falling back to the dash length — `line_dash_gap` |

### props type

```typescript
interface LineProps {
  points: number[][];  // [[x1,y1], [x2,y2], ...]
  lineWidth?: number;
  lineColor?: string;
  lineRounded?: boolean;
  lineDashWidth?: number;
  lineDashGap?: number;
}
```

Everything a line draws is one of these. There is deliberately nothing else: the box styles a widget usually carries would paint a rectangle around the stroke, which is the one thing a line must not have, so the property editor hides them (§8).

The **Line** section edits them as Direction, Length, Line Width, Line Color, Rounded Ends and Dash Length/Gap, with the raw point list underneath for the polyline case.

### 7.1 About points, and the box they define

`points` is the shape; the widget's box follows it. `src/utils/lineGeometry.ts` holds the rule and every path that changes a line goes through it:

- **The box is the points' extent**, never thinner than `lineWidth` on an axis the line does not travel along. A 100px horizontal 2px line is 100×2; the same line at 8px is 100×8; a vertical one is 8×100.
- **Dragging the box scales the points**, so a resize lengthens the line rather than adding empty space around it.
- **A drag across the line's own stroke does nothing** — the rule puts the box straight back — so the canvas does not draw those handles at all. A horizontal line offers left and right, a vertical one top and bottom, a diagonal all eight.
- **Editing the points resizes the box**, which is how the Direction control turns a line on its side: it rewrites the points and the box follows.
- The extent is centred in the box, so the stroke sits on the box's middle rather than hanging off its top edge. The canvas, the preview and the generated code all place it with `pointsInBox`, so all three agree.

The default `[[0,0],[100,0]]` is a horizontal line running left to right. Several points (a polyline) are supported by the data, by the canvas and by code generation; the WASM preview reads up to 8.

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
| `bgColor` | `string` | `'transparent'` | No fill — there is no box to fill |
| `borderColor` | `string` | `'transparent'` | No border, for the same reason |
| `borderWidth` | `number` | `0` | No border |
| `borderRadius` | `number` | `0` | Unused |
| `textColor` | `string` | `'#212121'` | Unused by the line itself |
| `opacity` | `number` | `1` | Opacity of the whole widget |
| `padding` | `number` | `0` | No padding |

### The Style section shows one row

Fill, border, corner radius, border sides, text colour and padding are all hidden for a line: each of them paints a box, and a line has none. **Opacity** is the only shared style row it keeps, plus the Transform and Blend Mode sections. Everything else it draws is a `line_*` style, edited in the Line section.

Older projects carry a `#212121` 1px border from when a line was a Basic widget. Nothing migrates them — the editor no longer paints those styles, and code generation drops them (§10.4) — so a line that used to be drawn inside a rectangle stops being.

> Historical note: a line's colour and width used to be read from `borderColor` and `borderWidth`. The canvas still falls back to `borderColor` when `props.lineColor` is absent, so a project written before `lineColor` existed keeps its colour.

### Extended style properties

Line supports these shared extended styles:

- Transform: `transformAngle`, `transformZoomX`, `transformZoomY`, `transformPivotX`, `transformPivotY`
- Blend mode: `blendMode`

## 9. Supported events

| Event | Description |
|---|---|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

> Note: the widget is only as big as its stroke, so the canvas draws a wider transparent target over it to make it selectable. That is editor chrome; on the device the touch area is the stroke, which is why events are rarely bound to a line in practice.

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

The canvas draws the widget's own points as an SVG polyline, so a vertical, dashed or diagonal line looks like what LVGL will draw:

```tsx
const points = normalizeLinePoints(props.points);
const box = lineBox(points, stroke);
const placed = pointsInBox(points, box);
<svg viewBox={`0 0 ${box.width} ${box.height}`} preserveAspectRatio="none">
  {/* a transparent 10px stroke, so a 2px line is still clickable */}
  <polyline points={path} stroke="transparent" strokeWidth={Math.max(stroke, 10)} />
  <polyline
    points={path}
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap={props.lineRounded ? 'round' : 'butt'}
    strokeDasharray={dash}
  />
</svg>
```

Key behaviour:
- The polyline is the points, placed by `pointsInBox`, so the drawing fills the box exactly
- Width, colour, rounded ends and dashes all render as they will on the panel
- The colour comes from `props.lineColor`, falling back to `borderColor` for projects written before it existed
- **No box styles are applied to the wrapper**: no fill, border, radius or padding, because a line has no box
- Selection, hover and dragging work as for any widget; the resize handles are only the ones the line can use

### 10.2 Prototype (PreviewPanel.tsx)

The Canvas 2D preview strokes the same points:

```typescript
function drawLine(ctx, x, y, w, h, opts) {
  const placed = pointsInBox(normalizeLinePoints(opts.points), { width: w, height: h });
  ctx.strokeStyle = opts.lineColor;
  ctx.lineWidth = Math.max(1, opts.lineWidth);
  ctx.lineCap = opts.rounded ? 'round' : 'butt';
  ctx.setLineDash(opts.dashWidth > 0 ? [opts.dashWidth, opts.dashGap || opts.dashWidth] : []);
  ctx.beginPath();
  placed.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(x + px, y + py) : ctx.lineTo(x + px, y + py)));
  ctx.stroke();
}
```

Key behaviour:
- Every point is drawn, in the same places the canvas puts them
- Caps follow `lineRounded` rather than always being round
- Dashes follow `lineDashWidth` / `lineDashGap`
- Supports animation state on top

### 10.3 Simulator

#### JSON serialisation (editorStateToJson.ts)

The line is serialised as a flattened JSON node:

```json
{
  "type": "line",
  "id": "comp-xxx",
  "parent": null,
  "x": 10, "y": 50,
  "width": 100, "height": 2,
  "props": {
    "points": [[0, 1], [100, 1]],
    "lineWidth": 2,
    "lineColor": "#212121",
    "lineRounded": false,
    "lineDashWidth": 0,
    "lineDashGap": 0
  },
  "styles": { "default": { "bgColor": "transparent", "borderWidth": 0, "opacity": 1 } }
}
```

#### Creation on the C side (ui_from_json.c)

`create_line` reads every point (up to eight) and applies the `line_*` styles, which `apply_styles` does not touch:

```c
static lv_obj_t *create_line(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *line = lv_line_create(parent);
    int slot = line_pool_used < LINE_POOL_LINES ? line_pool_used++ : LINE_POOL_LINES - 1;
    lv_point_precise_t *points = line_point_pool[slot];
    /* ... read props.points into points, falling back to a horizontal line ... */
    lv_line_set_points(line, points, count);
    /* ... lv_obj_set_style_line_width / _color / _rounded / _dash_width / _dash_gap ... */
    return line;
}
```

Key behaviour:
- `lv_line_set_points` keeps the pointer it is given rather than copying, so the points must outlive the widget. Each line takes a slot from a pool that is emptied on every load — **one shared `static` array used to make every line on the screen draw the last one's points**
- Falls back to a horizontal line spanning the widget's width when the points are missing or malformed
- Width, colour, rounded ends and dashes are applied here, since the shared style pass knows nothing about `line_*`

> These C changes reach the preview the next time `wasm/build.sh` is run; the committed `public/wasm` binary predates them.

### 10.4 Generated code (ui.c.ts)

```c
/* file scope, beside the object pointer */
lv_obj_t *ui_divider;
static lv_point_precise_t ui_divider_points[2] = {{0, 1}, {120, 1}};

/* in the screen's init */
ui_divider = lv_line_create(ui_screen_main);
lv_obj_set_pos(ui_divider, 20, 40);
lv_obj_set_size(ui_divider, 120, 2);
lv_obj_set_style_bg_opa(ui_divider, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_width(ui_divider, 0, 0);
lv_line_set_points(ui_divider, ui_divider_points, 2);
lv_obj_set_style_line_width(ui_divider, 6, 0);       /* when it is not the default 2 */
lv_obj_set_style_line_color(ui_divider, lv_color_hex(0xFF0000), 0);
lv_obj_set_style_line_rounded(ui_divider, true, 0);  /* when lineRounded */
lv_obj_set_style_line_dash_width(ui_divider, 8, 0);  /* when lineDashWidth > 0 */
lv_obj_set_style_line_dash_gap(ui_divider, 4, 0);
```

Key behaviour:
- **The points array is emitted at file scope** and passed to `lv_line_set_points`, because LVGL stores the pointer. `lv_point_precise_t` for v9, `lv_point_t` for v8. Until this existed a generated line drew nothing at all
- The points are placed by `pointsInBox`, so the panel draws exactly what the canvas showed
- The box styles are dropped for a line (`withoutBoxStyles`): a fill, a border or a radius would draw a rectangle around the stroke, including for older projects that still carry one
- `line_width` is emitted only when it differs from the default 2; colour, rounded and dash whenever they are set

## 11. LVGL API mapping

### Creation

| Version | API |
|---|---|
| LVGL v9 | `lv_line_create(parent)` |
| LVGL v8 | `lv_line_create(parent)` |

### Key APIs

| API | Description |
|---|---|
| `lv_line_create(parent)` | Create the line object |
| `lv_line_set_points(line, points, count)` | Set the point array |
| `lv_obj_set_style_line_width(line, width, sel)` | Set the line width |
| `lv_obj_set_style_line_color(line, color, sel)` | Set the line colour |
| `lv_obj_set_style_line_rounded(line, en, sel)` | Set whether the ends are rounded |
| `lv_obj_set_style_line_dash_width(line, w, sel)` | Set the dash length |
| `lv_obj_set_style_line_dash_gap(line, gap, sel)` | Set the dash gap |
| `lv_obj_set_pos(line, x, y)` | Set the position |
| `lv_obj_set_size(line, w, h)` | Set the size |

### Point type

| Version | Type | Description |
|---|---|---|
| LVGL v9 | `lv_point_precise_t` | Precise coordinates (floating point capable) |
| LVGL v8 | `lv_point_t` | Integer coordinates |

## 12. Design notes

1. **A line has no area beyond the line.** The box is the points' extent, opened up to the stroke width and no further, and the rule is enforced on every path that can change a line (`applyLineGeometry`). Dragging across the stroke cannot add empty space, the Size field for that axis will not take a value, and the handles that would try are not drawn. This is what makes a line feel like a line rather than a rectangle with a rule inside it.

2. **Point data lifetime.** `lv_line_set_points` stores the pointer rather than copying, so the array must outlive the widget. Generated code emits one at file scope per line; the WASM preview hands each line a slot from a pool. A single shared array — which is what the preview used to have — makes every line draw the last one's points.

3. **Points are the shape, the box follows.** Direction and Length are conveniences that rewrite the points; the box is derived from them afterwards. That is why turning a line vertical also turns its box, and why a diagonal line gets a box on both axes.

4. **The box styles are not a line's to have.** Fill, border, radius, border sides and padding are hidden in the editor and dropped at generation. LVGL would happily draw all of them around the stroke, and a border in particular is exactly the rectangle a line must not be.

5. **The hit area is editor chrome.** A 2px line is 2px to click, so the canvas paints a transparent 10px stroke over it. It never leaves the editor: the widget stays 2px in the project file, in the preview and on the panel.

6. **Polylines.** More than two points work in the data, on the canvas, in the 2D preview and in generated code. The Direction and Length controls only describe axis-aligned lines and read as `Custom` for anything else, which is edited through the point list.

7. **v8/v9 point type.** v9 uses `lv_point_precise_t` (floating point capable), v8 uses `lv_point_t` (integers). Generation picks the right type for the target version.
