# Slider

<p align="center">
  <strong>English</strong> · <a href="../../zh-TW/components/slider.md">繁體中文</a>
</p>

## 1. Name and summary

**Slider** maps to LVGL's `lv_slider`. The user drags a knob to pick a value within a range. In embedded UIs it is commonly used for volume, brightness and parameter adjustment.

## 2. Type identifier

```
type: 'slider'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| `input` | Input | ✏️ |

Component panel icon: 🎚️

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 150 |
| defaultHeight | 20 |

## 5. Container?

```
isContainer: false
```

Slider is not a container and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Container (obj)** — placed inside a generic container (a common pattern: paired with a Label showing the current value)
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing. Slider is a leaf widget and does not support children.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `value` | `number` | `50` | Current value; must lie within [min, max] |
| `step` | `number` | `undefined` | Step size; unset means continuous sliding |
| `orientation` | `string` | `undefined` | Orientation: horizontal by default, `'vertical'` for vertical |

### Definition (componentDefinitions.ts)

```typescript
defaultProps: { min: 0, max: 100, value: 50 }
```

## 8. Styles

### Supported style states

| State | Selector | Description |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | Default state |
| `pressed` | `LV_STATE_PRESSED` | While the knob is being dragged |
| `focused` | `LV_STATE_FOCUSED` | Focused |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

### Default style (default state)

The track uses the LVGL theme's `color_primary_muted` (the theme colour at 20% over white), fully rounded.

| Style property | Type | Default | Description |
|----------|------|--------|------|
| `bgColor` | `string` | `'#D3EAFD'` | Track background; LVGL color_primary_muted |
| `borderColor` | `string` | `'transparent'` | Border colour; no border by default |
| `borderWidth` | `number` | `0` | Border width |
| `borderRadius` | `number` | `9999` | Corner radius; 9999 means fully rounded |
| `textColor` | `string` | `'#212121'` | Text colour (Slider has no text of its own; kept for consistency) |
| `opacity` | `number` | `1` | Opacity |
| `padding` | `number` | `0` | Padding |

### Part styling in the LVGL theme

In LVGL's default theme:
- **Track (MAIN)**: `bgColor = #D3EAFD` (primary_muted), fully rounded
- **Indicator (INDICATOR)**: `bgColor = #2196F3` (primary), fully rounded, showing the selected portion
- **Knob (KNOB)**: `bgColor = #2196F3` (primary), circular, with a shadow

### Suggested disabled style

```typescript
disabled: {
  bgColor: '#E0E0E0',
  opacity: 0.5,
}
```

## 9. Supported events

| LVGL event | Description |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | Fires as the value changes (continuously while dragging; most common) |
| `LV_EVENT_PRESSED` | Fires when the knob is pressed |
| `LV_EVENT_RELEASED` | Fires when the knob is released |
| `LV_EVENT_CLICKED` | Fires on click |
| `LV_EVENT_FOCUSED` | Fires when focus is gained |
| `LV_EVENT_DEFOCUSED` | Fires when focus is lost |

`LV_EVENT_VALUE_CHANGED` is the one usually wanted; it fires continuously while the user drags. Read the value with `lv_slider_get_value(slider)`.

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

On the editor canvas the slider renders as a horizontal track, a fill bar and a circular knob:

```tsx
<div className="lvgl-slider" style={{
  width: '100%',
  height: '100%',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
}}>
  {/* Track */}
  <div style={{
    width: '100%',
    height: '4px',
    backgroundColor: '#e0e0e0',
    borderRadius: '2px',
    position: 'relative',
  }}>
    {/* Fill bar (the selected range) */}
    <div style={{
      width: `${percentage}%`,
      height: '100%',
      backgroundColor: '#2196F3',
      borderRadius: '2px',
    }} />
  </div>
  {/* Knob */}
  <div style={{
    position: 'absolute',
    left: `calc(${percentage}% - 8px)`,
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#2196F3',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  }} />
</div>
```

where `percentage` is:
```
percentage = ((value - min) / (max - min)) * 100
```

- The track is a fixed 4px high, vertically centred
- The fill runs from the left to the knob, in theme blue
- The knob is a 16px circle with a shadow

### Simple preview (PreviewPanel.tsx — Canvas 2D)

Drawn by `drawSlider` on a 2D canvas:

```typescript
function drawSlider(ctx, x, y, w, h, opts) {
  const trackHeight = 6;
  const trackY = y + (h - trackHeight) / 2;
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  const knobX = x + progress * w;

  // 1. Draw the track background
  ctx.fillStyle = '#e0e0e0';
  roundRect(ctx, x, trackY, w, trackHeight, 3);
  ctx.fill();

  // 2. Draw the fill bar
  ctx.fillStyle = '#2196f3';
  roundRect(ctx, x, trackY, w * progress, trackHeight, 3);
  ctx.fill();

  // 3. Draw the knob
  ctx.fillStyle = '#2196f3';
  ctx.beginPath();
  ctx.arc(knobX, y + h / 2, 8, 0, Math.PI * 2);
  ctx.fill();
}
```

### LVGL WASM preview (ui_from_json.c)

Passed to the WASM side as JSON, where `create_slider` builds the real LVGL widget:

```c
static lv_obj_t *create_slider(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *slider = lv_slider_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 50);
        lv_slider_set_range(slider, mn, mx);
        lv_slider_set_value(slider, val, LV_ANIM_OFF);
    }
    return slider;
}
```

The slider is fully interactive in the WASM preview: the knob can be dragged to change the value.

### Generated code (ui.c.ts)

```c
// Create slider: my_slider
my_slider = lv_slider_create(parent);
lv_obj_set_pos(my_slider, 10, 20);
lv_obj_set_size(my_slider, 150, 20);

// Styles
lv_obj_set_style_bg_color(my_slider, lv_color_hex(0xD3EAFD), 0);
lv_obj_set_style_bg_opa(my_slider, LV_OPA_COVER, 0);
lv_obj_set_style_radius(my_slider, 9999, 0);

// Props
lv_slider_set_range(my_slider, 0, 100);
lv_slider_set_value(my_slider, 50, LV_ANIM_OFF);
```

The extended properties that are generated:
- `step` → needs custom stepping logic in the event callback (a comment is emitted as a hint)
- `orientation: 'vertical'` → `lv_obj_set_style_transform_rotation(slider, 900, 0)` (v9) / `lv_obj_set_style_transform_angle(slider, 900, 0)` (v8)

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_slider_create(parent)` |

### Key APIs

| Function | Description |
|----------|------|
| `lv_slider_set_value(slider, val, anim)` | Set the current value |
| `lv_slider_get_value(slider)` | Read the current value |
| `lv_slider_set_range(slider, min, max)` | Set the range |
| `lv_slider_set_left_value(slider, val, anim)` | Set the left value (range mode) |
| `lv_slider_get_left_value(slider)` | Read the left value (range mode) |
| `lv_slider_set_mode(slider, mode)` | Set the mode (NORMAL / SYMMETRICAL / RANGE) |
| `lv_slider_is_dragged(slider)` | Query whether it is being dragged |

### Style parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The track background |
| `LV_PART_INDICATOR` | The fill indicator (the coloured span from the minimum to the current value) |
| `LV_PART_KNOB` | The knob (the draggable circular handle) |

Common combinations:
- `LV_PART_MAIN | LV_STATE_DEFAULT` — track colour and corner radius
- `LV_PART_INDICATOR` — fill colour
- `LV_PART_KNOB` — knob size, colour and shadow
- `LV_PART_KNOB | LV_STATE_PRESSED` — how the knob changes while dragging

## 12. Design notes

1. **Range validation**: the editor should keep `value` within `[min, max]`. Rendering clamps the percentage with `Math.max(0, Math.min(100, ...))` so the knob cannot leave the track.

2. **Slider versus Bar**: the two look very similar, but a slider is interactive (it has a knob) while a bar only displays. They share the same track-plus-indicator structure; the slider adds `LV_PART_KNOB`.

3. **Vertical orientation**: LVGL has no native vertical slider; it is achieved by rotating 90°. Generation uses `transform_rotation(900)` or `transform_angle(900)`. The editor canvas does not yet render vertically.

4. **Step size**: LVGL has no built-in step property. To get stepping, snap the value to the grid inside the `LV_EVENT_VALUE_CHANGED` callback; generation adds a comment as a reminder.

5. **Fully rounded**: `borderRadius: 9999` gives the track and indicator their capsule shape, the standard look for a slider and consistent with Bar.

6. **Knob size**: the editor canvas fixes the knob at 16px across. In LVGL the knob's size is controlled by the padding on `LV_PART_KNOB` — more padding makes a bigger knob.

7. **Dragging**: the editor canvas and the simple preview show a static state and cannot be dragged. The WASM preview is fully interactive.

8. **Height**: the default 20px leaves room for the knob. The track itself is only 4–6px high with the knob centred on it. Below about 16px the knob starts to be clipped.

9. **Colour layers**: a slider uses three:
   - Track background: `#D3EAFD` (light blue, primary_muted)
   - Fill indicator: `#2196F3` (theme blue)
   - Knob: `#2196F3` (theme blue) plus a shadow

   Both the editor canvas and the simple preview reproduce this layering.

10. **Range mode**: LVGL supports `LV_SLIDER_MODE_RANGE` (two knobs selecting a span), which the editor does not expose. Add it by hand in the generated code if needed.
