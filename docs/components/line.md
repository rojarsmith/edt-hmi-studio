# Line (line) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../../zh-TW/components/line.md">繁體中文</a>
</p>

## 1. Name and summary

Line draws straight segments. In LVGL a line object (`lv_line`) is defined by an array of point coordinates and supports properties such as line width and colour. Lines are commonly used for separators and decoration.

Line is not a container (`isContainer = false`) and cannot hold children.

## 2. Type identifier

```
type: 'line'
```

## 3. Category

| Field | Value |
|---|---|
| Category id | `basic` |
| Category name | Basic |
| Category icon | 📦 |
| Widget icon | 📏 |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 4 |

> Note: the default height is 4px to give the editor a large enough hit area. When LVGL actually renders, the visible thickness comes from `lineWidth`.

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
| `lineWidth` | `number` | `2` | Line width in pixels, mapped to LVGL's `line_width` style |
| `lineColor` | `string` | `undefined` | Line colour (optional; overrides `borderColor` from the styles) |

### props type

```typescript
interface LineProps {
  points: number[][];  // [[x1,y1], [x2,y2], ...]
  lineWidth?: number;
  lineColor?: string;
}
```

### About points

- The default `[[0,0],[100,0]]` is a horizontal line running left to right
- Coordinates are relative to the line object's own origin
- Several points (a polyline) are supported, but the editor uses only two by default (a straight segment)
- The WASM preview handles at most 2 points

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
| `bgColor` | `string` | `'transparent'` | Background colour (transparent) |
| `borderColor` | `string` | `'#212121'` | Border colour (used as the reference for the line colour; the LVGL theme's `color_text`) |
| `borderWidth` | `number` | `1` | Border width (mapped onto LVGL's `line_width`) |
| `borderRadius` | `number` | `0` | Corner radius (unused for a line) |
| `textColor` | `string` | `'#212121'` | Text colour |
| `opacity` | `number` | `1` | Opacity |
| `padding` | `number` | `0` | Padding |

### Where the defaults come from

The line's default styles come from LVGL's default theme:
- Line colour (`line_color`) uses `color_text` (`#212121`)
- Line width (`line_width`) defaults to 1
- Transparent background

> Note: in the editor's style system, a line's colour and width are stored in the `borderColor` and `borderWidth` fields, but in LVGL they map onto the `line_color` and `line_width` style properties. `props.lineColor` and `props.lineWidth` offer more direct control.

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

> Note: a line is not clickable by default. Because its hit area is so small, events are rarely bound to a line in practice.

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

On the editor canvas the line is rendered with React DOM:

```tsx
<div className="lvgl-line" style={{
  width: '100%',
  height: '2px',
  backgroundColor: defaultStyle.borderColor || defaultStyle.textColor || '#333',
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
}} />
```

Key behaviour:
- A `div` stands in for the line, at a fixed 2px height
- Centred vertically in the widget area (`top: 50%` plus `translateY(-50%)`)
- The colour comes from `borderColor`, falling back to `textColor`
- Always rendered horizontal; the angle is not derived from `points`
- Supports selection highlight, hover, dragging and resize handles

### 10.2 Simple preview (PreviewPanel.tsx)

In the Canvas 2D simple preview the line is drawn by `drawLine()`:

```typescript
drawLine(ctx, x, y, w, h, {
  lineColor: comp.props.lineColor || bgColorStyle,
  lineWidth: comp.props.lineWidth || 2,
});
```

The implementation:

```typescript
function drawLine(ctx, x, y, w, h, opts) {
  ctx.strokeStyle = opts.lineColor;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
}
```

Key behaviour:
- Strokes the segment with Canvas 2D
- The line is centred vertically in the widget area
- Round line caps (`lineCap = 'round'`)
- The colour comes from `props.lineColor`, falling back to the style's `bgColor`
- The width comes from `props.lineWidth`, defaulting to 2px
- Supports animation state on top

### 10.3 LVGL WASM preview

#### JSON serialisation (editorStateToJson.ts)

The line is serialised as a flattened JSON node:

```json
{
  "type": "line",
  "id": "comp-xxx",
  "parent": null,
  "x": 10, "y": 50,
  "width": 100, "height": 4,
  "props": { "points": [[0,0],[100,0]] },
  "styles": {
    "default": {
      "bgColor": "transparent",
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

#### Creation on the C side (ui_from_json.c)

```c
static lv_obj_t *create_line(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *line = lv_line_create(parent);
    static lv_point_precise_t line_points[2];
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    int w = cjson_get_int(comp, "width", 100);
    line_points[0].x = 0; line_points[0].y = 0;
    line_points[1].x = w; line_points[1].y = 0;

    if (props) {
        cJSON *pts = cJSON_GetObjectItemCaseSensitive(props, "points");
        if (cJSON_IsArray(pts) && cJSON_GetArraySize(pts) >= 2) {
            cJSON *p0 = cJSON_GetArrayItem(pts, 0);
            cJSON *p1 = cJSON_GetArrayItem(pts, 1);
            if (cJSON_IsArray(p0) && cJSON_IsArray(p1)) {
                line_points[0].x = cJSON_GetArrayItem(p0, 0)->valueint;
                line_points[0].y = cJSON_GetArrayItem(p0, 1)->valueint;
                line_points[1].x = cJSON_GetArrayItem(p1, 0)->valueint;
                line_points[1].y = cJSON_GetArrayItem(p1, 1)->valueint;
            }
        }
    }
    lv_line_set_points(line, line_points, 2);
    return line;
}
```

Key behaviour:
- Creates the line with `lv_line_create()`
- Parses `props.points` for the two endpoints
- Uses a `static` point array (LVGL requires the point data to stay valid for the line's lifetime)
- Falls back to a horizontal line (`[0,0]` to `[width,0]`)
- Calls `lv_line_set_points()` to set the coordinates
- Applies position, size and styles

### 10.4 Generated code (ui.c.ts)

```c
// Create line: my_line
my_line = lv_line_create(parent);
lv_obj_set_pos(my_line, 10, 50);
lv_obj_set_size(my_line, 100, 4);
lv_obj_set_style_bg_opa(my_line, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(my_line, lv_color_hex(0x212121), 0);
lv_obj_set_style_border_width(my_line, 1, 0);

// Custom line width (when props.lineWidth is not the default)
lv_obj_set_style_line_width(my_line, 3, 0);

// Custom line colour (when props.lineColor is set)
lv_obj_set_style_line_color(my_line, lv_color_hex(0xFF0000), 0);
```

Key behaviour:
- Creates with `lv_line_create`
- Maps `props.lineWidth` onto `lv_obj_set_style_line_width` (emitted only when it differs from the default of 2)
- Maps `props.lineColor` onto `lv_obj_set_style_line_color`
- The point data has to exist as a `static` array in the code; the generator does not emit one and relies on the default behaviour

> Note: the generator (`generatePropsCode`) does not currently emit `lv_line_set_points` for the `points` property. This is a known simplification: lines fall back to the default horizontal behaviour.

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

1. **Point data lifetime**: `lv_line_set_points` does not copy the point data, it stores the pointer. The array must therefore be `static` or global and stay valid for the line object's entire lifetime. The WASM preview does this with `static lv_point_precise_t line_points[2]`.

2. **Editor simplification**: the editor canvas and the simple preview always render the line horizontally, ignoring the actual coordinates in `points`. This is a deliberate simplification, because editing segment endpoints precisely in a visual editor needs a much more involved interaction design.

3. **Style mapping**: a line's colour and width are stored as `borderColor` and `borderWidth` in the editor's style system, but LVGL uses the `line_color` and `line_width` style properties. `props.lineColor` and `props.lineWidth` give more precise control and take precedence over the style fields.

4. **Default height**: the default height is 4px rather than 1px, to give the editor a usable hit area for selecting, dragging and resizing. The visible thickness when rendered comes from the line width.

5. **Incomplete code generation**: the generator does not currently emit the `lv_line_set_points` call or the accompanying `static` point array. As a result, a line in the generated code draws no segment, and the user has to add the point data by hand. This is a known gap.

6. **Polylines**: although `points` supports more than two points, the editor UI only edits a two-point straight segment, and the WASM preview only handles the first two points.

7. **v8/v9 point type**: v9 uses `lv_point_precise_t` (floating point capable), v8 uses `lv_point_t` (integers). Generation must pick the right type for the target version.
