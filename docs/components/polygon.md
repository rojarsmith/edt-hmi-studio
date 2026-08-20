# Polygon (polygon) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/polygon.md">繁體中文</a>
</p>

## 1. Name and summary

Polygon is the many-sided member of the **Shapes** category, beside [Rectangle](rectangle.md), [Line](line.md) and [Circle](circle.md). It draws a **closed run of points**: a diamond, a triangle, an arrow, a hexagon, a bevelled panel — any outline a list of corners describes.

**LVGL has no polygon widget and no filled-polygon primitive.** The outline is an `lv_line` whose first point is repeated at the end, and the fill is a fan of triangles drawn under it. That is the whole implementation, and it is what decides the one rule the widget carries: **a fan covers a convex outline only**, so a shape that turns back on itself is drawn unfilled — on the canvas, in both previews and on the panel alike.

Polygon is not a container (`isContainer = false`).

## 2. Type identifier

```
type: 'polygon'
```

The palette lists it as **Polygon** and instances are named `Polygon_1`, `Polygon_2`, …; the property editor reports its **Type** as `Shape`, the family the other three belong to.

## 3. Category

| Field | Value |
|---|---|
| Category id | `shape` |
| Category name | Shapes |
| Widget icon | 🔷 |
| Family name (`typeName`) | Shape |
| Position | Fourth, after Rectangle, Line and Circle |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 100 |

A diamond: four points, visibly not a rectangle, and convex, so the default shape can be filled.

The box is the points' extent and nothing more — no margin to select, style or drag. Dragging a handle scales the points; editing a point resizes the box. `applyPolygonGeometry` holds both directions, and every path that changes a polygon goes through it.

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
| `points` | `number[][]` | diamond | The corners, `[[x, y], …]`, in box-local coordinates. The run closes itself: the last point joins the first |
| `lineWidth` | `number` | `2` | Outline width. `0` draws no outline |
| `lineColor` | `string` | `'#212121'` | Outline colour |
| `lineRounded` | `boolean` | `false` | Rounds the corners of the outline by half its width |

```typescript
interface PolygonProps {
  points: number[][];
  lineWidth: number;
  lineColor: string;
  lineRounded: boolean;
}
```

**There is no fill property.** The fill is the Style section's `bgColor`, the same one a Rectangle fills with — a second colour field would be a second answer to one question. `transparent` leaves the outline alone.

**The first point is not repeated in storage.** The shape is closed by definition; the generated C repeats it because `lv_line_set_points` draws an open polyline.

**Coordinates are kept as written, fractions included.** `lv_point_precise_t` is a float only where a build sets `LV_USE_FLOAT`, and this firmware does not — so the editor keeps the precision a shape was drawn at, and the generated C rounds to whole pixels on the way out. Turning `LV_USE_FLOAT` on later is a one-line change to the generator, not to anyone's project file.

## 8. Styles

### Default state styles

| Style property | Type | Default | Description |
|---|---|---|---|
| `bgColor` | `string` | `'#E0E0E0'` | **The fill.** `transparent`, or a concave outline, leaves the shape unfilled |
| `borderColor` | `string` | `'transparent'` | Unused — the outline is `lineColor` |
| `borderWidth` | `number` | `0` | Unused — a border here would draw a rectangle around the shape |
| `borderRadius` | `number` | `0` | Unused |
| `opacity` | `number` | `1` | Opacity of the whole widget, fill included |

The palette is Rectangle's, so the four shapes look like a set.

The box styles are dropped at generation, exactly as a Line's are and for the same reason: the widget's box is not a thing that gets drawn. Older projects carrying those styles lose them on the way out rather than needing a migration.

## 9. Supported events

The same list every shape has — `LV_EVENT_CLICKED`, `PRESSED`, `RELEASED`, `LONG_PRESSED`, `FOCUSED`, `DEFOCUSED`. The hit area is the widget's rectangular box, not the outline inside it, which is what LVGL does for every widget.

## 10. UI layers

### 10.1 Geometry (utils/polygonGeometry.ts)

One module holds the rules the other layers draw from:

- `normalizePolygonPoints(value)` — stored points cleaned into usable pairs, fractions kept; fewer than three becomes the default
- `polygonBox(points)` / `pointsInPolygonBox(points)` — the box, and the shape moved into its corner
- `scalePolygonPoints(points, from, to)` — what dragging a handle does
- `isConvexPolygon(points)` — whether a fan can cover it, by the sign of the cross product at each corner
- `polygonFanTriangles(points)` — the fill, as the firmware draws it
- `applyPolygonGeometry(before, after)` — the two-way rule from §4

### 10.2 Editor canvas (CanvasComponent.tsx)

An SVG `<polygon>`, which closes itself the way the shape does:

```tsx
<polygon
  points={placed.map(([x, y]) => `${x},${y}`).join(' ')}
  fill={convex && bgColor !== 'transparent' ? bgColor : 'none'}
  stroke={lineWidth > 0 ? lineColor : 'none'}
  strokeWidth={lineWidth}
/>
```

A transparent copy underneath widens the click target for an unfilled outline — editor chrome, never drawn on the panel.

### 10.3 Simple preview (PreviewPanel.tsx)

`drawPolygon` traces the same points, `closePath`s them, fills when the outline is convex and strokes the outline. One path rather than the firmware's fan: over a convex outline the two cover the same pixels, and a path has no seams between triangles.

### 10.4 LVGL WASM preview and generated code

Both do the same two things, because both are LVGL.

```c
static lv_point_precise_t ui_shape_1_points[5] = {{50, 0}, {100, 50}, {50, 100}, {0, 50}, {50, 0}};

static const ui_polygon_fill_t ui_shape_1_fill = { ui_shape_1_points, 4, 0xE0E0E0 };

ui_shape_1 = lv_line_create(ui_screen_home);
lv_obj_set_size(ui_shape_1, 100, 100);
lv_line_set_points(ui_shape_1, ui_shape_1_points, 5);
lv_obj_set_style_line_color(ui_shape_1, lv_color_hex(0x212121), 0);
lv_obj_add_event_cb(ui_shape_1, ui_polygon_fill_cb, LV_EVENT_DRAW_MAIN_BEGIN, (void *)&ui_shape_1_fill);
```

The array is five points and the fill record says four: the closing repeat is the outline's, and a fan has no use for it.

One callback serves every filled polygon in the project, each handing it a record of its points and colour through the event's user data:

```c
static void ui_polygon_fill_cb(lv_event_t *e) {
    lv_obj_t *obj = lv_event_get_target(e);
    lv_layer_t *layer = lv_event_get_layer(e);
    const ui_polygon_fill_t *fill = lv_event_get_user_data(e);

    lv_area_t area;
    lv_obj_get_coords(obj, &area);
    int32_t x_ofs = area.x1 - lv_obj_get_scroll_x(obj);
    int32_t y_ofs = area.y1 - lv_obj_get_scroll_y(obj);

    lv_draw_triangle_dsc_t dsc;
    lv_draw_triangle_dsc_init(&dsc);
    dsc.color = lv_color_hex(fill->color);
    dsc.opa = lv_obj_get_style_opa(obj, LV_PART_MAIN);

    for (uint32_t i = 1; i + 1 < fill->point_cnt; i++) {
        /* … three corners, each offset by x_ofs/y_ofs … */
        lv_draw_triangle(layer, &dsc);
    }
}
```

Three details are load-bearing:

- **`LV_EVENT_DRAW_MAIN_BEGIN`**, not `DRAW_MAIN`. The line widget strokes itself on `DRAW_MAIN`, so a fill drawn there would cover its own outline.
- **The same origin `lv_line` uses** — `area.x1 - lv_obj_get_scroll_x(obj)`, copied from `lv_line.c`. Any other origin lets the fill and the outline drift apart inside a scrolled parent.
- **The colour travels as a plain integer**, because a static initialiser cannot call `lv_color_hex()`.

> The WASM preview's `create_polygon` does the same and reaches the preview on the next `wasm/build.sh`; the committed `public/wasm` binary predates it.

## 11. LVGL API mapping

| API | Used for |
|---|---|
| `lv_line_create(parent)` | The widget |
| `lv_line_set_points(obj, points, n)` | The closed outline |
| `lv_obj_set_style_line_width / _color / _rounded` | How the outline is stroked |
| `lv_draw_triangle_dsc_init(&dsc)` / `lv_draw_triangle(layer, &dsc)` | Each triangle of the fill |
| `lv_event_get_layer(e)` | The layer to draw the fill on |
| `lv_obj_add_event_cb(obj, cb, LV_EVENT_DRAW_MAIN_BEGIN, data)` | Getting the fill drawn under the outline |

## 12. Design notes

### 12.1 Why a concave polygon is not filled

A triangle fan from point 0 covers a convex outline exactly. On a concave one — an arrow, a star, a chevron — a fan spans the dent, so the fill would bulge outside the shape.

Three ways out, and none of them is worth taking here:

| Route | The catch |
|---|---|
| **Ear clipping** | A real triangulation, ~150 lines of generated or library C, plus the degenerate cases. Worth doing when someone needs a concave fill; nothing is in the way of adding it later |
| **Vector graphics** (`LV_USE_VECTOR_GRAPHIC`) | Needs `LV_USE_MATRIX` plus a vector-capable draw unit: ThorVG (C++, sizeable) or a vector GPU. No board here has one |
| **Fill it anyway** | The editor would show a shape the panel cannot draw |

So the shape is drawn unfilled, and the property editor says why where the setting is. The rule this follows is the one the whole tool follows: **what the canvas shows is what the panel draws**.

### 12.2 The rest

1. **The outline is a widget; the fill is a callback.** Reusing `lv_line` gets stroke width, colour and rounded corners as ordinary styles, editable at runtime, rather than reimplementing them in a draw callback.

2. **The closing repeat lives in the generated code, not the project.** A stored list that repeats its first point invites an edit that moves one copy and not the other.

3. **Points are floats in the editor and whole pixels in the firmware.** The two are allowed to differ because one of them is a design and the other is a build; §7 has the detail.

4. **Adding a corner puts it on the closing edge**, between the last point and the first, because that is the edge the point list does not show.
