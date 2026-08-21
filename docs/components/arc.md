# Arc (arc) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/arc.md">繁體中文</a>
</p>

## 1. Name and summary

Arc is a ring-shaped display widget that shows a value as an angular span. It consists of a background arc and a foreground indicator arc, and is commonly used for gauges, dial indicators and circular progress. Unlike Bar's linear progress, Arc presents the data as a curve, which is more compact and often better looking.

## 2. Type identifier

```
type: 'arc'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| display | Display | 🔄 |

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 100 |
| defaultHeight | 100 |

Arc is normally square, so the curve stays centred and undistorted.

## 5. Container?

```
isContainer: false
```

Arc is a pure display widget and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- `obj` (Container)
- `btn` (Button)
- `tabview` (Tab View — inside one of the tab pages)
- `tileview` (Tile View — inside one of the tiles)
- `win` (Window — inside the content area)
- The screen root

### Can contain

Nothing. With `isContainer: false` it accepts no children.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| `startAngle` | `number` | `135` | Start angle of the background arc, in degrees; 0° points at 3 o'clock and angles increase clockwise |
| `endAngle` | `number` | `45` | End angle of the background arc, in degrees |
| `value` | `number` | `60` | Current value, within [min, max] |
| `min` | `number` | `0` | Minimum value (optional, defaults to 0) |
| `max` | `number` | `100` | Maximum value (optional, defaults to 100) |
| `mode` | `'normal' \| 'symmetrical' \| 'reverse'` | `'normal'` | Arc mode (optional extension) |

### Constraints

- `startAngle` and `endAngle` range from 0 to 360; when `startAngle > endAngle` the arc crosses the 0° position
- The default 135° → 45° gives roughly a 270° arc (from lower left over the top to lower right), the classic LVGL arc look
- `value` is clamped into `[min, max]`

### The angle system

```
         270° (12 o'clock)
          |
180° ----+---- 0° (3 o'clock)
(9 o'clock)|
          90° (6 o'clock)

Default: startAngle=135 → endAngle=45
The arc runs from 135° at lower left, through 180° → 270° → 0°, to 45° at lower right
Total sweep = 360 - 135 + 45 = 270°
```

## 8. Styles

### Default style (default state)

| Style property | Default | Description |
|----------|--------|------|
| `bgColor` | `transparent` | Transparent background (an arc needs no rectangular fill) |
| `borderColor` | `#2196F3` | Reused by the editor as the indicator arc's colour |
| `borderWidth` | `15` | Reused by the editor as the arc width |
| `borderRadius` | `0` | Not applicable (the curve is drawn with SVG/Canvas) |
| `textColor` | `#212121` | Colour of the centre value text |
| `opacity` | `1` | Fully opaque |
| `padding` | `0` | No padding |

### Part style mapping

| Part | Editor style mapping | LVGL default |
|------|---------------|-------------|
| `LV_PART_MAIN` | bgColor → bg_opa=TRANSP | No background fill |
| `LV_PART_INDICATOR` | borderColor → arc_color | `#2196F3` (color_primary) |
| `LV_PART_MAIN` (arc) | — | `#E0E0E0` (color_grey), the background arc |
| `LV_PART_KNOB` | — | Optional knob (hidden by default) |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always applied |
| `pressed` | Pressed (an arc can be made interactive) |
| `focused` | Focused |
| `disabled` | Disabled |

## 9. Supported events

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | Value changed (from a drag, or set from code) |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

> Note: an LVGL arc is interactive by default — the user can drag to change the value. The editor files it under "display" because it is mostly used read-only, but nothing stops interaction events being added.

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

```tsx
<div className="lvgl-arc" style={{
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
    {/* Background arc */}
    <circle cx="50" cy="50" r="40" fill="none"
      stroke="#e0e0e0" strokeWidth="8" />
    {/* Indicator arc */}
    <circle cx="50" cy="50" r="40" fill="none"
      stroke={defaultStyle.borderColor || '#2196F3'}
      strokeWidth="8"
      strokeDasharray={`${(props.value || 60) * 2.51} 251`}
      strokeLinecap="round"
      transform="rotate(-90 50 50)" />
  </svg>
</div>
```

Key points:
- Simulates arc progress with an SVG `<circle>` and `strokeDasharray`
- The background circle is grey `#e0e0e0`
- The indicator colour comes from `defaultStyle.borderColor` (default `#2196F3`)
- `strokeDasharray` maths: the circumference is about 2π×40 ≈ 251, so `value * 2.51` is the filled length
- `rotate(-90)` moves the start point to 12 o'clock

### Prototype (PreviewPanel.tsx — Canvas 2D)

```typescript
function drawArc(ctx, x, y, w, h, opts) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const radius = Math.min(w, h) / 2 - 5;
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  const startAngle = -Math.PI * 0.75;  // maps to 135°
  const endAngle = Math.PI * 0.75;     // maps to 45°
  const currentAngle = startAngle + (endAngle - startAngle) * progress;

  // Background arc
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.stroke();

  // Progress arc
  ctx.strokeStyle = '#2196f3';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, currentAngle);
  ctx.stroke();

  // Centre value
  ctx.fillStyle = '#333';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${opts.value}`, centerX, centerY);
}
```

Key points:
- Draws the curve with Canvas 2D `arc()`
- The default span is -135° → 135° (about 270°)
- Draws the current value in the centre of the arc
- `lineCap = 'round'` rounds the ends

### Simulator

**editorStateToJson.ts**: the props (startAngle, endAngle, value, min, max) are serialised directly.

**ui_from_json.c**:

```c
static lv_obj_t *create_arc(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *arc = lv_arc_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 75);
        lv_arc_set_range(arc, mn, mx);
        lv_arc_set_value(arc, val);
    }
    return arc;
}
```

Key points:
- Creates a real LVGL arc with `lv_arc_create`
- The current WASM implementation does not set `startAngle`/`endAngle` and falls back to LVGL's defaults; this could be extended
- Styles are applied by the shared `apply_styles` function

### Generated code (ui.c.ts)

```c
// Create
lv_obj_t *arc_1 = lv_arc_create(parent);
lv_obj_set_pos(arc_1, 50, 50);
lv_obj_set_size(arc_1, 100, 100);

// Styles
lv_obj_set_style_bg_opa(arc_1, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(arc_1, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_border_width(arc_1, 15, 0);

// Props
lv_arc_set_bg_angles(arc_1, 135, 45);
lv_arc_set_range(arc_1, 0, 100);
lv_arc_set_value(arc_1, 60);
```

Optional mode:

```c
// the mode property
lv_arc_set_mode(arc_1, LV_ARC_MODE_NORMAL);       // default
lv_arc_set_mode(arc_1, LV_ARC_MODE_SYMMETRICAL);  // symmetrical
lv_arc_set_mode(arc_1, LV_ARC_MODE_REVERSE);      // reversed
```

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_arc_create(parent)` |

### Key APIs

| API | Description |
|-----|------|
| `lv_arc_set_range(arc, min, max)` | Set the range |
| `lv_arc_set_value(arc, value)` | Set the current value |
| `lv_arc_set_bg_angles(arc, start, end)` | Set the background arc's start and end angles |
| `lv_arc_set_angles(arc, start, end)` | Set the indicator arc's angles directly |
| `lv_arc_set_mode(arc, mode)` | Set the mode: NORMAL / SYMMETRICAL / REVERSE |
| `lv_arc_set_rotation(arc, deg)` | Set an overall rotation offset |
| `lv_arc_get_value(arc)` | Read the current value |
| `lv_arc_get_angle_start(arc)` | Read the indicator's start angle |
| `lv_arc_get_angle_end(arc)` | Read the indicator's end angle |

### LVGL parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The background arc (track) |
| `LV_PART_INDICATOR` | The foreground indicator arc |
| `LV_PART_KNOB` | The knob (a circular handle at the end of the arc) |

### Default theme styling (lv_theme_default)

- **MAIN part (arc track)**: `arc_color = color_grey` (`#E0E0E0`); `arc_width` follows the widget size
- **INDICATOR part**: `arc_color = color_primary` (`#2196F3`)
- **KNOB part**: hidden by default, can be enabled through styles

## 12. Design notes

1. **Angle systems differ**: LVGL puts 0° at 3 o'clock with angles increasing clockwise. The editor's SVG/Canvas rendering has to convert: Canvas 2D also starts at 3 o'clock, while the SVG uses `rotate(-90)` to move the start to 12 o'clock.

2. **borderColor/borderWidth are reused**: `StyleProps` has no dedicated `arcColor`/`arcWidth`, so `borderColor` and `borderWidth` stand in for the arc's colour and width. Code generation has to treat this specially — it should not emit `lv_obj_set_style_border_*`, but map onto `lv_obj_set_style_arc_color` and `lv_obj_set_style_arc_width`.

3. **Transparent background**: `bgColor` defaults to `transparent`, which is correct — an arc needs no rectangular fill. `resolvedBgColor` keeps arcs transparent on the canvas with no fallback.

4. **Keep it square**: an arc distorts in a non-square box. A "keep square" constraint in the property panel, or locking the aspect ratio while resizing, would help.

5. **Interactivity**: an LVGL arc is interactive by default (the knob can be dragged). For display-only use, clear `LV_OBJ_FLAG_CLICKABLE` in the code, or configure `lv_arc_set_mode` appropriately.

6. **Relationship to Spinner**: Spinner is essentially an Arc with a permanent rotation animation. They share the same defaults (`bgColor=transparent`, `borderColor=#2196F3`, `borderWidth=15`), but Spinner does not expose value or angle properties.

7. **Angles in the WASM preview**: `create_arc` in `ui_from_json.c` does not set `startAngle`/`endAngle` and uses LVGL's defaults. To reproduce the design exactly, extend the WASM side to read those two properties and call `lv_arc_set_bg_angles`.
