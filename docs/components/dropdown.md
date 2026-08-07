# Dropdown — Selection List

<p align="center">
  <strong>English</strong> · <a href="../../zh-TW/components/dropdown.md">繁體中文</a>
</p>

## 1. Name and summary

**Dropdown** is a selection widget, mapping to LVGL's `lv_dropdown`. Clicking it expands a list of options from which one can be chosen. In embedded UIs it is commonly used on settings pages, in forms and for mode switching.

## 2. Type identifier

```
type: 'dropdown'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| `input` | Input | ✏️ |

Component panel icon: 📋

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 120 |
| defaultHeight | 36 |

## 5. Container?

```
isContainer: false
```

Dropdown is not a container and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area
- **Button (btn)** — technically possible, but not recommended

### Can contain

Nothing. Dropdown is a leaf widget and does not support children.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| `options` | `string[]` | `['Option 1', 'Option 2', 'Option 3']` | The option list; each element is one option's text |
| `selected` | `number` | `0` | Index of the selected option (zero-based) |
| `direction` | `string` | `undefined` | Expansion direction: `'down'` (default) or `'up'` |
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
defaultProps: { options: ['Option 1', 'Option 2', 'Option 3'], selected: 0 }
```

## 8. Styles

### Supported style states

| State | Selector | Description |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | Default state |
| `pressed` | `LV_STATE_PRESSED` | Pressed |
| `focused` | `LV_STATE_FOCUSED` | Focused |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

### Default style (default state)

Uses the LVGL default theme's **card style**, consistent with textarea, chart, table and the other card-like widgets.

| Style property | Type | Default | Description |
|----------|------|--------|------|
| `bgColor` | `string` | `'#ffffff'` | Background colour; card-style white |
| `borderColor` | `string` | `'#E0E0E0'` | Border colour; LVGL color_grey |
| `borderWidth` | `number` | `2` | Border width |
| `borderRadius` | `number` | `8` | Corner radius |
| `textColor` | `string` | `'#212121'` | Text colour; LVGL color_text |
| `opacity` | `number` | `1` | Opacity (0–1) |
| `padding` | `number` | `10` | Padding |

### Suggested focused style

```typescript
focused: {
  borderColor: '#2196F3',
  borderWidth: 2,
}
```

### Suggested disabled style

```typescript
disabled: {
  bgColor: '#F5F5F5',
  textColor: '#9E9E9E',
  opacity: 0.6,
}
```

## 9. Supported events

| LVGL event | Description |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | Fires when the selection changes (most common) |
| `LV_EVENT_CLICKED` | Fires on click |
| `LV_EVENT_PRESSED` | Fires on press |
| `LV_EVENT_RELEASED` | Fires on release |
| `LV_EVENT_FOCUSED` | Fires when focus is gained |
| `LV_EVENT_DEFOCUSED` | Fires when focus is lost |
| `LV_EVENT_READY` | Fires when the selection is confirmed |
| `LV_EVENT_CANCEL` | Fires when the selection is cancelled |

`LV_EVENT_VALUE_CHANGED` is the one usually wanted; it fires after the user picks a new option.

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

On the editor canvas the dropdown renders as a select box with an arrow, showing the currently selected option:

```tsx
<div className="lvgl-dropdown" style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  height: '100%',
  padding: '0 8px',
  backgroundColor: resolvedBgColor,
  border: !defaultStyle.borderWidth ? '1px solid #cccccc' : undefined,
  borderRadius: defaultStyle.borderRadius || 4,
  boxSizing: 'border-box',
  color: defaultStyle.textColor || '#333',
}}>
  <span>{props.options?.[props.selected || 0] || 'Select...'}</span>
  <span style={{ color: '#999', fontSize: '10px' }}>▼</span>
</div>
```

- The selected option's text sits on the left
- The dropdown arrow `▼` sits on the right
- It does not expand; it is a visual preview only
- A transparent background falls back to `#ffffff`

### Simple preview (PreviewPanel.tsx — Canvas 2D)

Drawn by `drawDropdown` on a 2D canvas:

```typescript
function drawDropdown(ctx, x, y, w, h, opts) {
  // 1. Draw the background rectangle (gradient supported)
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  // 2. Draw the selected option's text
  const selectedText = opts.options[opts.selected] || 'Select...';
  ctx.fillStyle = opts.textColor;
  ctx.fillText(selectedText, x + 10, y + h / 2);

  // 3. Draw the dropdown arrow (a triangle)
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(x + w - 20, y + h / 2 - 3);
  ctx.lineTo(x + w - 10, y + h / 2 - 3);
  ctx.lineTo(x + w - 15, y + h / 2 + 3);
  ctx.closePath();
  ctx.fill();
}
```

### LVGL WASM preview (ui_from_json.c)

Passed to the WASM side as JSON, where `create_dropdown` builds the real LVGL widget:

```c
static lv_obj_t *create_dropdown(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *dd = lv_dropdown_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        // Join the array of options into a newline-separated string
        cJSON *options = cJSON_GetObjectItemCaseSensitive(props, "options");
        if (cJSON_IsArray(options)) {
            char buf[512] = {0};
            int first = 1;
            cJSON *opt;
            cJSON_ArrayForEach(opt, options) {
                if (cJSON_IsString(opt)) {
                    if (!first) strncat(buf, "\n", sizeof(buf) - strlen(buf) - 1);
                    strncat(buf, opt->valuestring, sizeof(buf) - strlen(buf) - 1);
                    first = 0;
                }
            }
            lv_dropdown_set_options(dd, buf);
        }
        int sel = cjson_get_int(props, "selected", 0);
        lv_dropdown_set_selected(dd, (uint32_t)sel);
    }
    return dd;
}
```

LVGL's dropdown takes its options as a single `\n`-separated string, so the WASM side has to convert the JSON array into that format.

### Generated code (ui.c.ts)

```c
// Create dropdown: my_dropdown
my_dropdown = lv_dropdown_create(parent);
lv_obj_set_pos(my_dropdown, 10, 20);
lv_obj_set_size(my_dropdown, 120, 36);

// Styles
lv_obj_set_style_bg_color(my_dropdown, lv_color_hex(0xffffff), 0);
lv_obj_set_style_bg_opa(my_dropdown, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(my_dropdown, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(my_dropdown, 2, 0);
lv_obj_set_style_radius(my_dropdown, 8, 0);
lv_obj_set_style_text_color(my_dropdown, lv_color_hex(0x212121), 0);
lv_obj_set_style_pad_all(my_dropdown, 10, 0);

// Props
lv_dropdown_set_options(my_dropdown, "Option 1\nOption 2\nOption 3");
lv_dropdown_set_selected(my_dropdown, 0);
```

The options array is joined with `\n` into a single C string during generation. The extended property that is generated:
- `direction` → `lv_dropdown_set_dir()`

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_dropdown_create(parent)` |

### Key APIs

| Function | Description |
|----------|------|
| `lv_dropdown_set_options(dd, opts)` | Set the option list (a `\n`-separated string) |
| `lv_dropdown_add_option(dd, opt, pos)` | Insert an option at a position |
| `lv_dropdown_set_selected(dd, idx)` | Set the selected index |
| `lv_dropdown_get_selected(dd)` | Read the selected index |
| `lv_dropdown_get_selected_str(dd, buf, len)` | Read the selected option's text |
| `lv_dropdown_set_dir(dd, dir)` | Set the expansion direction (LV_DIR_BOTTOM / LV_DIR_TOP) |
| `lv_dropdown_open(dd)` | Open the list programmatically |
| `lv_dropdown_close(dd)` | Close the list programmatically |
| `lv_dropdown_set_text(dd, text)` | Set fixed display text that does not follow the selection |

### Style parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The dropdown body (the button area when closed) |
| `LV_PART_INDICATOR` | The arrow icon |
| `LV_PART_ITEMS` | The items in the expanded list |
| `LV_PART_SELECTED` | The currently selected item in the expanded list |
| `LV_PART_SCROLLBAR` | The list's scrollbar |

## 12. Design notes

1. **Option format conversion**: the editor stores options as a `string[]`, but the LVGL API takes a single `\n`-separated string. Both code generation and the WASM preview have to convert between them.

2. **The expanded list**: when an LVGL dropdown opens, it creates a floating list that LVGL manages as a separate object. Neither the editor canvas nor the simple preview simulates the open state.

3. **Option count limit**: the WASM side joins the options into a 512-byte buffer, so a very long list may be truncated. Keeping each option under about 50 characters and the list under about 20 options is recommended.

4. **Background fallback**: on the editor canvas, a `bgColor` of transparent falls back to `#ffffff`.

5. **Expansion direction**: the list opens downwards by default. For a widget near the bottom of the screen, set `direction: 'up'` so the list is not clipped.

6. **Styling the list**: the expanded list is styled through `LV_PART_ITEMS` and `LV_PART_SELECTED`. The editor does not currently expose those parts, so add the styles by hand in the generated code.

7. **Changing options at runtime**: `lv_dropdown_set_options()` replaces the whole list; `lv_dropdown_add_option()` adds them one at a time.

8. **Arrow rendering**: the editor canvas uses the Unicode character `▼`, the simple preview draws a triangle path, and LVGL itself uses the `LV_SYMBOL_DOWN` symbol font. The three differ slightly in appearance.
