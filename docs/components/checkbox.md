# Checkbox

## 1. Name and summary

**Checkbox** maps to LVGL's `lv_checkbox`. It consists of a square marker and a text label; clicking it toggles between checked and unchecked. In embedded UIs it is commonly used for settings toggles, multi-select lists and terms-acceptance prompts.

## 2. Type identifier

```
type: 'checkbox'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| `input` | Input | ✏️ |

Component panel icon: ☑️

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 120 |
| defaultHeight | 28 |

## 5. Container?

```
isContainer: false
```

Checkbox is not a container and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Container (obj)** — placed inside a generic container (the most common pattern: several checkboxes in one container forming an option group)
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing. Checkbox is a leaf widget and does not support children.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| `text` | `string` | `'Checkbox'` | The label beside the checkbox |
| `checked` | `boolean` | `false` | Whether it is checked. When checked, the marker fills with the theme colour and shows a tick |
| `fontSize` | `number` | `14` | Text size (optional; maps to a built-in Montserrat size) |
| `fontResource` | `string` | `undefined` | Custom font resource name (optional; takes precedence over fontSize). The font must first be uploaded in the resource manager with its sizes configured |

### Font selection

The property panel offers a font dropdown supporting:
- **Default**: the LVGL default font
- **Built-in fonts**: the built-in Montserrat family, montserrat_14 through montserrat_32 and others
- **Uploaded fonts**: custom fonts (TTF/OTF) uploaded in the resource manager

When a custom font is selected, the size dropdown lists only the sizes configured for that font, because custom fonts are compiled per size. When a built-in font is selected, all available built-in sizes are listed.

When `fontResource` is set, the generator emits `lv_obj_set_style_text_font(obj, &{fontResource}_{fontSize}, 0)`; otherwise it uses the built-in `lv_font_montserrat_{fontSize}`.

### Definition (componentDefinitions.ts)

```typescript
defaultProps: { text: 'Checkbox', checked: false }
```

## 8. Styles

### Supported style states

| State | Selector | Description |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | Default, unchecked state |
| `pressed` | `LV_STATE_PRESSED` | Pressed |
| `focused` | `LV_STATE_FOCUSED` | Focused |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

Note: `LV_STATE_CHECKED` is a built-in LVGL state, set through `lv_obj_add_state`, and is not configured separately in the editor's style panel.

### Default style (default state)

The checkbox as a whole has a transparent background, and the border colour is the theme colour (used by the marker), matching LVGL's default theme.

| Style property | Type | Default | Description |
|----------|------|--------|------|
| `bgColor` | `string` | `'transparent'` | The overall background is transparent |
| `borderColor` | `string` | `'#2196F3'` | Border colour; LVGL color_primary (used for the marker's border) |
| `borderWidth` | `number` | `2` | Border width |
| `borderRadius` | `number` | `4` | Corner radius (of the marker) |
| `textColor` | `string` | `'#212121'` | Text colour |
| `opacity` | `number` | `1` | Opacity |
| `padding` | `number` | `10` | Padding (a reference for the gap between marker and text) |

### Suggested disabled style

```typescript
disabled: {
  textColor: '#9E9E9E',
  borderColor: '#BDBDBD',
  opacity: 0.6,
}
```

## 9. Supported events

| LVGL event | Description |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | Fires when the checked state changes (most common) |
| `LV_EVENT_CLICKED` | Fires on click |
| `LV_EVENT_PRESSED` | Fires on press |
| `LV_EVENT_RELEASED` | Fires on release |
| `LV_EVENT_FOCUSED` | Fires when focus is gained |
| `LV_EVENT_DEFOCUSED` | Fires when focus is lost |

`LV_EVENT_VALUE_CHANGED` is the one usually wanted; it fires after the user toggles the checkbox. The current state can be read with `lv_obj_has_state(cb, LV_STATE_CHECKED)`.

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

On the editor canvas the checkbox renders as a square marker beside a text label:

```tsx
<div className="lvgl-checkbox" style={{
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: defaultStyle.textColor || '#333',
}}>
  <div style={{
    width: '16px',
    height: '16px',
    border: '2px solid #666',
    borderRadius: '2px',
    backgroundColor: props.checked ? '#2196F3' : '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }}>
    {props.checked && <span style={{ color: '#fff', fontSize: '12px' }}>✓</span>}
  </div>
  <span style={{ fontSize: 13 }}>{props.text || 'Checkbox'}</span>
</div>
```

- When checked, the marker fills with theme blue `#2196F3` and shows a white tick `✓`
- When unchecked, the marker is white with a grey border
- The overall background stays transparent on the canvas, with no fallback

### Simple preview (PreviewPanel.tsx — Canvas 2D)

Drawn by `drawCheckbox` on a 2D canvas:

```typescript
function drawCheckbox(ctx, x, y, w, h, opts) {
  const boxSize = 18;
  const boxY = y + (h - boxSize) / 2;

  // 1. Draw the square marker
  ctx.fillStyle = opts.checked ? '#2196f3' : '#fff';
  roundRect(ctx, x, boxY, boxSize, boxSize, 3);
  ctx.fill();
  ctx.stroke();

  // 2. Draw the tick when checked
  if (opts.checked) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, boxY + boxSize / 2);
    ctx.lineTo(x + boxSize / 2 - 1, boxY + boxSize - 5);
    ctx.lineTo(x + boxSize - 4, boxY + 5);
    ctx.stroke();
  }

  // 3. Draw the text label
  ctx.fillStyle = opts.textColor;
  ctx.fillText(opts.text, x + boxSize + 8, y + h / 2);
}
```

### LVGL WASM preview (ui_from_json.c)

Passed to the WASM side as JSON, where `create_checkbox` builds the real LVGL widget:

```c
static lv_obj_t *create_checkbox(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *cb = lv_checkbox_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) lv_checkbox_set_text(cb, text);
        int checked = cjson_get_bool(props, "checked", 0);
        if (checked) lv_obj_add_state(cb, LV_STATE_CHECKED);
    }
    return cb;
}
```

### Generated code (ui.c.ts)

```c
// Create checkbox: my_checkbox
my_checkbox = lv_checkbox_create(parent);
lv_obj_set_pos(my_checkbox, 10, 20);
lv_obj_set_size(my_checkbox, 120, 28);

// Styles
lv_obj_set_style_bg_opa(my_checkbox, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(my_checkbox, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_border_width(my_checkbox, 2, 0);
lv_obj_set_style_radius(my_checkbox, 4, 0);
lv_obj_set_style_text_color(my_checkbox, lv_color_hex(0x212121), 0);
lv_obj_set_style_pad_all(my_checkbox, 10, 0);

// Props
lv_checkbox_set_text(my_checkbox, "Checkbox");
lv_obj_add_state(my_checkbox, LV_STATE_CHECKED);  // emitted only when checked = true
```

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_checkbox_create(parent)` |

### Key APIs

| Function | Description |
|----------|------|
| `lv_checkbox_set_text(cb, text)` | Set the label |
| `lv_checkbox_get_text(cb)` | Read the label |
| `lv_obj_add_state(cb, LV_STATE_CHECKED)` | Check it |
| `lv_obj_clear_state(cb, LV_STATE_CHECKED)` | Uncheck it |
| `lv_obj_has_state(cb, LV_STATE_CHECKED)` | Query whether it is checked |
| `lv_obj_add_state(cb, LV_STATE_DISABLED)` | Disable it |

### Style parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The whole area (background, text) |
| `LV_PART_INDICATOR` | The square marker |

The marker's styling (its background and border when checked, and so on) is controlled through `LV_PART_INDICATOR` combined with a state selector:
- `LV_PART_INDICATOR | LV_STATE_DEFAULT` — the marker when unchecked
- `LV_PART_INDICATOR | LV_STATE_CHECKED` — the marker when checked

## 12. Design notes

1. **Checked state**: the checked state is managed through LVGL's `LV_STATE_CHECKED` flag rather than a dedicated property. The editor maps `props.checked` onto it.

2. **Marker styling is separate**: in LVGL the marker is styled through the `LV_PART_INDICATOR` part, independently of `LV_PART_MAIN`. The editor's `borderColor` and `borderRadius` mainly affect how the marker looks.

3. **Transparent background**: a checkbox has a transparent background by default, which is LVGL's standard behaviour. The editor canvas keeps it transparent with no fallback, so it may be hard to spot against a light background.

4. **Text position**: LVGL always places the text to the right of the marker, and this is not configurable. All three rendering layers follow that layout.

5. **Grouping**: several checkboxes are usually placed in one Container (obj) with a flex layout to form a vertical option group. The editor supports this, but the container layout has to be set by hand.

6. **Size and text**: the real width depends on the label length. The default 120px suits short text; longer labels need a manual width or `widthMode: 'content'`.

7. **Touch area**: on a device the whole widget is clickable, including the text, not just the marker. Clicking anywhere in the widget selects it on the editor canvas too.

8. **No checkable flag needed**: unlike Button, a checkbox does not need `LV_OBJ_FLAG_CHECKABLE` set by hand; LVGL handles it internally.
