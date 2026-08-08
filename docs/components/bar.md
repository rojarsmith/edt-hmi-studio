# Progress Bar (bar) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/bar.md">繁體中文</a>
</p>

## 1. Name and summary

Progress Bar is a read-only display widget showing how far a value sits within a range. It consists of a background track and a fill indicator, with the fill proportion determined by `value`, `min` and `max`. In embedded UIs it is commonly used for download progress, battery level and loading state.

## 2. Type identifier

```
type: 'bar'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| display | Display | 📊 |

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 150 |
| defaultHeight | 20 |

## 5. Container?

```
isContainer: false
```

Progress Bar is a pure display widget and cannot hold children.

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
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `value` | `number` | `60` | Current value, within [min, max] |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Orientation (optional extension); vertical is achieved by rotating 90° |

### Constraints

- `min` must be less than `max`
- `value` is clamped into `[min, max]`
- Fill percentage: `percent = (value - min) / (max - min) * 100`

## 8. Styles

### Default style (default state)

| Style property | Default | Description |
|----------|--------|------|
| `bgColor` | `#D3EAFD` | Background track colour (LVGL primary muted = primary at 20% over white) |
| `borderColor` | `transparent` | No border |
| `borderWidth` | `0` | No border |
| `borderRadius` | `9999` | Fully rounded (capsule shape), matching LVGL's default circle style for a bar |
| `textColor` | `#212121` | Text colour (a bar shows no text itself, but child labels inherit it) |
| `opacity` | `1` | Fully opaque |
| `padding` | `0` | No padding |

### Indicator style

In LVGL the filled portion is `LV_PART_INDICATOR`, coloured `color_primary` (`#2196F3`). The editor canvas and the preview hard-code the indicator colour to `#2196F3`.

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always applied |
| `pressed` | Pressed (a bar is usually not interactive, but the style can still be overridden) |
| `focused` | Focused (keyboard or encoder navigation) |
| `disabled` | Disabled, usually with reduced opacity |

Every state can override all the properties defined in `StyleProps` (bgColor, borderColor, borderWidth, borderRadius, textColor, opacity, padding, shadow*, transform*, outline* and so on).

## 9. Supported events

Bar is a read-only display widget. The LVGL events it supports:

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click (when the clickable flag is set) |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | Value changed (fires when the value is set from code) |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

### Built-in actions

An `EventBinding` can attach these built-in actions:

- `navigate` — go to a page
- `setProperty` — set a property on a target widget
- `show` / `hide` — show or hide a target widget
- `enable` / `disable` — enable or disable a target widget
- `setText` / `setValue` — set a target widget's text or value

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

```tsx
// Compute the fill percentage
const barMin = props.min ?? 0;
const barMax = props.max ?? 100;
const barVal = props.value ?? 60;
const barPercent = barMax > barMin
  ? Math.max(0, Math.min(100, (barVal - barMin) / (barMax - barMin) * 100))
  : 0;

// Structure: an outer background track with an inner fill bar
<div className="lvgl-bar" style={{
  width: '100%', height: '100%',
  backgroundColor: '#e0e0e0',
  borderRadius: defaultStyle.borderRadius,
  overflow: 'hidden',
}}>
  <div style={{
    width: `${barPercent}%`, height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: defaultStyle.borderRadius,
    transition: 'width 0.15s',
  }} />
</div>
```

Key points:
- The outer div is the background track, in grey `#e0e0e0`
- The inner div is the fill indicator, in theme blue `#2196F3`
- `borderRadius` is inherited from the styles; the default of 9999 gives the capsule shape
- The `transition` animates the width smoothly when the value is changed in the property panel

### Simple preview (PreviewPanel.tsx — Canvas 2D)

```typescript
function drawBar(ctx, x, y, w, h, opts) {
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  // Background track
  ctx.fillStyle = '#e0e0e0';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  // Fill indicator
  ctx.fillStyle = '#2196f3';
  roundRect(ctx, x, y, w * progress, h, 4);
  ctx.fill();
}
```

Key points:
- Uses the `roundRect` helper to draw rounded rectangles on a 2D canvas
- Draws the grey background first, then the blue fill
- Fill width = total width × progress

### LVGL WASM preview

**editorStateToJson.ts**: flattens the widget tree into JSON; the bar's props (min, max, value) are serialised directly.

**ui_from_json.c**:

```c
static lv_obj_t *create_bar(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *bar = lv_bar_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 50);
        lv_bar_set_range(bar, mn, mx);
        lv_bar_set_value(bar, val, LV_ANIM_OFF);
    }
    return bar;
}
```

Key points:
- Creates a real LVGL bar with `lv_bar_create`
- Reads min, max and value from the JSON props and applies them
- Styles are applied by the shared `apply_styles` function

### Generated code (ui.c.ts)

```c
// Create
lv_obj_t *bar_1 = lv_bar_create(parent);
lv_obj_set_pos(bar_1, 10, 50);
lv_obj_set_size(bar_1, 150, 20);

// Styles
lv_obj_set_style_bg_color(bar_1, lv_color_hex(0xD3EAFD), 0);
lv_obj_set_style_bg_opa(bar_1, LV_OPA_COVER, 0);
lv_obj_set_style_radius(bar_1, 9999, 0);

// Props
lv_bar_set_range(bar_1, 0, 100);
lv_bar_set_value(bar_1, 60, LV_ANIM_OFF);
```

Vertical orientation:

```c
// when orientation === 'vertical'
lv_obj_set_style_transform_rotation(bar_1, 900, 0);  // LVGL v9
// or
lv_obj_set_style_transform_angle(bar_1, 900, 0);     // LVGL v8
```

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_bar_create(parent)` |

### Key APIs

| API | Description |
|-----|------|
| `lv_bar_set_range(bar, min, max)` | Set the range |
| `lv_bar_set_value(bar, value, LV_ANIM_OFF)` | Set the current value |
| `lv_bar_set_start_value(bar, value, LV_ANIM_OFF)` | Set the start value (for range mode) |
| `lv_bar_set_mode(bar, mode)` | Set the mode: `LV_BAR_MODE_NORMAL` / `LV_BAR_MODE_SYMMETRICAL` / `LV_BAR_MODE_RANGE` |
| `lv_bar_get_value(bar)` | Read the current value |
| `lv_bar_get_min_value(bar)` | Read the minimum |
| `lv_bar_get_max_value(bar)` | Read the maximum |

### LVGL parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The background track |
| `LV_PART_INDICATOR` | The fill indicator |

### Default theme styling (lv_theme_default)

- **MAIN part**: `bg_color = color_primary_muted` (`#D3EAFD`), `radius = LV_RADIUS_CIRCLE`
- **INDICATOR part**: `bg_color = color_primary` (`#2196F3`), `radius = LV_RADIUS_CIRCLE`

## 12. Design notes

1. **Read-only versus interactive**: Bar is read-only, unlike Slider. A slider lets the user drag to change the value; a bar's value can only be set from code, so the editor needs no drag interaction for it.

2. **The indicator colour is not configurable**: the editor's `StyleProps` currently apply only to `LV_PART_MAIN`. The indicator colour (`LV_PART_INDICATOR`) is hard-coded to `#2196F3` on the canvas and in the preview. An `indicatorColor` prop would be a natural extension.

3. **What borderRadius = 9999 means**: both CSS and LVGL clamp an oversized radius to half the shorter side, producing the capsule shape. That is the default look for an LVGL bar.

4. **Vertical orientation**: LVGL has no native vertical bar; it is achieved by rotating 90°. Generation uses `transform_rotation` (v9) or `transform_angle` (v8) with a value of 900 (0.1° units).

5. **Animated transitions**: the third argument to `lv_bar_set_value` can be `LV_ANIM_ON` for a smooth transition. The editor generates `LV_ANIM_OFF`; change it in custom code if wanted.

6. **Range validation**: the property panel should keep `min < max` and `value` within `[min, max]`, clamping anything out of range.

7. **Consistency with Slider**: Bar and Slider share the same background styling in LVGL's default theme (`color_primary_muted` plus a circle radius), which keeps them visually consistent.
