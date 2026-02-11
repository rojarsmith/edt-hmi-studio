# Switch

## 1. Name and summary

**Switch** is a toggle control, mapping to LVGL's `lv_switch` widget. It presents a sliding on/off control that the user toggles by clicking or dragging. In embedded UIs it is commonly used for feature toggles, mode switching, and Wi-Fi or Bluetooth on/off.

## 2. Type identifier

```
type: 'switch'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| `input` | Input | ✏️ |

Component panel icon: 🔀

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 50 |
| defaultHeight | 26 |

## 5. Container?

```
isContainer: false
```

Switch is not a container and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Container (obj)** — placed inside a generic container (a common pattern: paired with a Label to form a settings row)
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing. Switch is a leaf widget and does not support children.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| `checked` | `boolean` | `false` | Whether the switch is on. When on, the knob slides right and the track takes the theme colour |

### Definition (componentDefinitions.ts)

```typescript
defaultProps: { checked: false }
```

## 8. Styles

### Supported style states

| State | Selector | Description |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | Default (off) state |
| `pressed` | `LV_STATE_PRESSED` | Pressed |
| `focused` | `LV_STATE_FOCUSED` | Focused |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

Note: `LV_STATE_CHECKED` is a built-in LVGL state, applied automatically when the switch is on.

### Default style (default state)

When off, the track is grey and fully rounded (a pill shape).

| Style property | Type | Default | Description |
|----------|------|--------|------|
| `bgColor` | `string` | `'#E0E0E0'` | Track background colour when off; LVGL color_grey |
| `borderColor` | `string` | `'transparent'` | Border colour; no border by default |
| `borderWidth` | `number` | `0` | Border width |
| `borderRadius` | `number` | `9999` | Corner radius; 9999 means fully rounded (pill shape) |
| `textColor` | `string` | `'#212121'` | Text colour (Switch has no text of its own; kept for consistency) |
| `opacity` | `number` | `1` | Opacity |
| `padding` | `number` | `0` | Padding |

### The checked state in the LVGL theme

In LVGL's default theme, when a switch is on:
- The track background becomes `color_primary` (`#2196F3`)
- The knob stays white

The editor canvas simulates this by switching the colour on `props.checked`.

### Suggested disabled style

```typescript
disabled: {
  bgColor: '#F5F5F5',
  opacity: 0.5,
}
```

## 9. Supported events

| LVGL event | Description |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | Fires when the switch state changes (most common) |
| `LV_EVENT_CLICKED` | Fires on click |
| `LV_EVENT_PRESSED` | Fires on press |
| `LV_EVENT_RELEASED` | Fires on release |
| `LV_EVENT_FOCUSED` | Fires when focus is gained |
| `LV_EVENT_DEFOCUSED` | Fires when focus is lost |

`LV_EVENT_VALUE_CHANGED` is the one usually wanted; it fires after the user toggles the switch. The current state can be read with `lv_obj_has_state(sw, LV_STATE_CHECKED)`.

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

On the editor canvas a Switch renders as a rounded track plus a circular knob:

```tsx
<div className="lvgl-switch" style={{
  width: '100%',
  height: '100%',
  borderRadius: defaultStyle.borderRadius || 13,
  backgroundColor: props.checked ? '#2196F3' : '#ccc',
  position: 'relative',
  minHeight: '20px',
}}>
  <div style={{
    position: 'absolute',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    top: '50%',
    marginTop: '-10px',
    left: props.checked ? 'calc(100% - 23px)' : '3px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transition: 'left 0.2s',
  }} />
</div>
```

- When on, the track is blue `#2196F3` and the knob sits right
- When off, the track is grey `#ccc` and the knob sits left
- The knob carries a shadow for depth
- A CSS transition animates the knob (visible in the editor only)

### Simple preview (PreviewPanel.tsx — Canvas 2D)

Drawn by `drawSwitch` on a 2D canvas:

```typescript
function drawSwitch(ctx, x, y, w, h, opts) {
  const trackWidth = Math.min(w, 50);
  const trackHeight = 24;
  const trackX = x + (w - trackWidth) / 2;
  const trackY = y + (h - trackHeight) / 2;

  // 1. Draw the track
  ctx.fillStyle = opts.checked ? '#4caf50' : '#ccc';
  roundRect(ctx, trackX, trackY, trackWidth, trackHeight, trackHeight / 2);
  ctx.fill();

  // 2. Draw the knob
  const knobRadius = trackHeight / 2 - 2;
  const knobX = opts.checked
    ? trackX + trackWidth - knobRadius - 2
    : trackX + knobRadius + 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(knobX, trackY + trackHeight / 2, knobRadius, 0, Math.PI * 2);
  ctx.fill();
}
```

Note: the simple preview uses green `#4caf50` (Material Green) for the on state, slightly different from the canvas's blue.

### LVGL WASM preview (ui_from_json.c)

Passed to the WASM side as JSON, where `create_switch` builds the real LVGL widget:

```c
static lv_obj_t *create_switch(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *sw = lv_switch_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int checked = cjson_get_bool(props, "checked", 0);
        if (checked) lv_obj_add_state(sw, LV_STATE_CHECKED);
    }
    return sw;
}
```

### Generated code (ui.c.ts)

```c
// Create switch: my_switch
my_switch = lv_switch_create(parent);
lv_obj_set_pos(my_switch, 10, 20);
lv_obj_set_size(my_switch, 50, 26);

// Styles
lv_obj_set_style_bg_color(my_switch, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_bg_opa(my_switch, LV_OPA_COVER, 0);
lv_obj_set_style_radius(my_switch, 9999, 0);

// Props (emitted only when checked = true)
lv_obj_add_state(my_switch, LV_STATE_CHECKED);
```

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_switch_create(parent)` |

### Key APIs

| Function | Description |
|----------|------|
| `lv_switch_create(parent)` | Create the switch |
| `lv_obj_add_state(sw, LV_STATE_CHECKED)` | Turn it on |
| `lv_obj_clear_state(sw, LV_STATE_CHECKED)` | Turn it off |
| `lv_obj_has_state(sw, LV_STATE_CHECKED)` | Query whether it is on |
| `lv_obj_add_state(sw, LV_STATE_DISABLED)` | Disable it |

Switch has no dedicated set/get functions; its state is controlled entirely through LVGL's generic state API.

### Style parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The track |
| `LV_PART_INDICATOR` | The fill indicator (the coloured area when on) |
| `LV_PART_KNOB` | The knob (the circular slider) |

Common combinations:
- `LV_PART_MAIN | LV_STATE_DEFAULT` — the track style when off
- `LV_PART_INDICATOR | LV_STATE_CHECKED` — the indicator colour when on
- `LV_PART_KNOB` — the knob's size, colour and shadow

## 12. Design notes

1. **No text property**: unlike Checkbox, Switch carries no text label. To show explanatory text beside it, pair it with a Label, usually laid out horizontally inside the same Container.

2. **State management**: like Checkbox, the on/off state is managed through `LV_STATE_CHECKED`. The editor maps it to the `props.checked` boolean.

3. **Fully rounded by design**: `borderRadius: 9999` gives the track its pill shape, which is the standard look for a switch. Changing it changes the whole appearance.

4. **Inconsistent colours**: the three rendering layers use slightly different colours for the on state:
   - Editor canvas: `#2196F3` (blue)
   - Simple preview: `#4caf50` (green)
   - LVGL WASM: whatever the theme says (blue by default)

   Standardising on the theme colour `#2196F3` is recommended.

5. **Size constraints**: the default 50×26 is a touch-friendly size. Anything much smaller makes the knob hard to make out; a width of at least 40px and a height of at least 20px are recommended.

6. **Knob shadow**: the editor canvas gives the knob a `boxShadow` for depth. The same effect can be achieved in LVGL through the shadow style properties on `LV_PART_KNOB`.

7. **Animation**: the editor canvas uses a CSS `transition` to animate the knob. LVGL also animates state changes natively, controlled by `lv_obj_set_style_anim_time()`.

8. **No padding**: Switch defaults to `padding: 0` because LVGL manages its internal layout (track plus knob) itself and needs no extra room.
