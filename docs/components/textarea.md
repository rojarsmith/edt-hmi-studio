# Textarea — Text Input Area

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/textarea.md">繁體中文</a>
</p>

## 1. Name and summary

**Textarea** is a multi-line text input widget, mapping to LVGL's `lv_textarea`. The user types and edits text in it, and it supports placeholder text. In embedded UIs it is commonly used for form fields, text editing and search boxes.

## 2. Type identifier

```
type: 'textarea'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| `input` | Input | ✏️ |

Component panel icon: 📝

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 150 |
| defaultHeight | 80 |

## 5. Container?

```
isContainer: false
```

Textarea is not a container and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area
- **Button (btn)** — technically possible, but not recommended

### Can contain

Nothing. Textarea is a leaf widget and does not support children.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| `text` | `string` | `''` | The text in the field. When empty, the placeholder is shown |
| `placeholder` | `string` | `'Enter text...'` | Placeholder text, shown in grey while `text` is empty |
| `fontSize` | `number` | `14` | Text size (optional; maps to a built-in Montserrat size) |
| `fontResource` | `string` | `undefined` | Custom font resource name (optional; takes precedence over fontSize). The font must first be uploaded in the resource manager with its sizes configured |
| `maxLength` | `number` | `undefined` | Maximum number of characters; unlimited when unset |
| `password` | `boolean` | `false` | Password mode; typed characters render as dots |
| `oneLine` | `boolean` | `false` | Single-line mode; line breaks are disallowed |

### Font selection

The property panel offers a font dropdown supporting:
- **Default**: the LVGL default font
- **Built-in fonts**: the built-in Montserrat family, montserrat_14 through montserrat_32 and others
- **Uploaded fonts**: custom fonts (TTF/OTF) uploaded in the resource manager

When a custom font is selected, the size dropdown lists only the sizes configured for that font, because custom fonts are compiled per size. When a built-in font is selected, all available built-in sizes are listed.

When `fontResource` is set, the generator emits `lv_obj_set_style_text_font(obj, &{fontResource}_{fontSize}, 0)`; otherwise it uses the built-in `lv_font_montserrat_{fontSize}`.

### Definition (componentDefinitions.ts)

```typescript
defaultProps: { text: '', placeholder: 'Enter text...' }
```

## 8. Styles

### Supported style states

| State | Selector | Description |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | Default state |
| `pressed` | `LV_STATE_PRESSED` | Pressed (on touch or click) |
| `focused` | `LV_STATE_FOCUSED` | Focused (keyboard navigation, or activated by a click) |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

### Default style (default state)

Uses the LVGL default theme's **card style** (white background with a grey border), consistent with dropdown, chart, table and the other card-like widgets.

| Style property | Type | Default | Description |
|----------|------|--------|------|
| `bgColor` | `string` | `'#ffffff'` | Background colour; card-style white |
| `borderColor` | `string` | `'#E0E0E0'` | Border colour; LVGL color_grey |
| `borderWidth` | `number` | `2` | Border width |
| `borderRadius` | `number` | `8` | Corner radius |
| `textColor` | `string` | `'#212121'` | Text colour; LVGL color_text |
| `opacity` | `number` | `1` | Opacity (0–1) |
| `padding` | `number` | `10` | Padding, matching LVGL's pad_small |

### Suggested focused style

```typescript
focused: {
  borderColor: '#2196F3',  // the border takes the theme colour when focused
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
| `LV_EVENT_VALUE_CHANGED` | Fires when the text changes |
| `LV_EVENT_FOCUSED` | Fires when focus is gained |
| `LV_EVENT_DEFOCUSED` | Fires when focus is lost |
| `LV_EVENT_READY` | Fires when the user presses Enter or confirm (common in single-line mode) |
| `LV_EVENT_CANCEL` | Fires when the user cancels input |
| `LV_EVENT_CLICKED` | Fires on click |
| `LV_EVENT_PRESSED` | Fires on press |
| `LV_EVENT_RELEASED` | Fires on release |

The two usually wanted are `LV_EVENT_VALUE_CHANGED` (watch the text) and `LV_EVENT_READY` (input finished).

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

On the editor canvas the textarea renders as a bordered rectangle showing either the text or the placeholder:

```tsx
<div className="lvgl-textarea" style={{
  width: '100%',
  height: '100%',
  fontSize: '12px',
  color: '#999',
  backgroundColor: resolvedBgColor,
  border: !defaultStyle.borderWidth ? '1px solid #cccccc' : undefined,
  borderRadius: defaultStyle.borderRadius || 4,
  padding: '6px 8px',
  boxSizing: 'border-box',
}}>
  {props.text || props.placeholder || 'Enter text...'}
</div>
```

- Shows `placeholder` in grey `#999` while `text` is empty
- Uses `resolvedBgColor` so the widget stays visible on the canvas (transparent falls back to `#ffffff`)
- Not editable; it is a visual preview only

### Prototype (PreviewPanel.tsx — Canvas 2D)

Drawn by `drawTextarea` on a 2D canvas:

```typescript
function drawTextarea(ctx, x, y, w, h, opts) {
  // 1. Draw the background rectangle (gradient supported)
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  // 2. Draw the text or the placeholder
  const displayText = opts.text || opts.placeholder;
  ctx.fillStyle = opts.text ? opts.textColor : '#999';
  ctx.fillText(displayText, x + 8, y + 8);
}
```

- Supports background gradients (bgGradDir / bgGradColor)
- Renders the text with `textColor` when present, and the placeholder in grey otherwise

### Simulator (ui_from_json.c)

Serialised to JSON and passed to the WASM side, where `create_textarea` builds the real LVGL widget:

```c
static lv_obj_t *create_textarea(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *ta = lv_textarea_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text && text[0]) lv_textarea_set_text(ta, text);
        const char *ph = cjson_get_string(props, "placeholder");
        if (ph) lv_textarea_set_placeholder_text(ta, ph);
    }
    return ta;
}
```

The JSON comes from `flattenTree` in `editorStateToJson.ts`, which flattens the widget tree while keeping the parent references.

### Generated code (ui.c.ts)

```c
// Create textarea: my_textarea
my_textarea = lv_textarea_create(parent);
lv_obj_set_pos(my_textarea, 10, 20);
lv_obj_set_size(my_textarea, 150, 80);

// Styles
lv_obj_set_style_bg_color(my_textarea, lv_color_hex(0xffffff), 0);
lv_obj_set_style_bg_opa(my_textarea, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(my_textarea, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(my_textarea, 2, 0);
lv_obj_set_style_radius(my_textarea, 8, 0);
lv_obj_set_style_text_color(my_textarea, lv_color_hex(0x212121), 0);
lv_obj_set_style_pad_all(my_textarea, 10, 0);

// Props
lv_textarea_set_placeholder_text(my_textarea, "Enter text...");
lv_textarea_set_text(my_textarea, "Hello");
```

The extended properties that are generated:
- `maxLength` → `lv_textarea_set_max_length()`
- `password` → `lv_textarea_set_password_mode()`
- `oneLine` → `lv_textarea_set_one_line()` (both v8 and v9)

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_textarea_create(parent)` |

### Key APIs

| Function | Description |
|----------|------|
| `lv_textarea_set_text(ta, text)` | Set the text |
| `lv_textarea_set_placeholder_text(ta, text)` | Set the placeholder |
| `lv_textarea_get_text(ta)` | Read the current text |
| `lv_textarea_set_max_length(ta, len)` | Set the maximum character count |
| `lv_textarea_set_password_mode(ta, en)` | Set password mode |
| `lv_textarea_set_one_line(ta, en)` | Set single-line mode |
| `lv_textarea_add_char(ta, c)` | Append one character |
| `lv_textarea_add_text(ta, text)` | Append text |
| `lv_textarea_del_char(ta)` | Delete the character before the cursor |
| `lv_textarea_set_cursor_pos(ta, pos)` | Set the cursor position |

### Style parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The text area body (background, border) |
| `LV_PART_TEXTAREA_PLACEHOLDER` | The placeholder text style |
| `LV_PART_CURSOR` | The cursor style |
| `LV_PART_SCROLLBAR` | The scrollbar style |

## 12. Design notes

1. **Keyboard integration**: on an embedded device a textarea usually needs a virtual keyboard (`lv_keyboard`) alongside it. The editor does not generate the keyboard wiring; handle it by hand in `ui_events.c`.

2. **Placeholder colour**: LVGL styles the placeholder through the `LV_PART_TEXTAREA_PLACEHOLDER` part. The editor canvas simulates it with a fixed grey `#999`, matching LVGL's default.

3. **No cursor**: neither the editor canvas nor the simple preview draws a cursor; only the WASM preview renders one, natively.

4. **Multi-line versus single-line**: multi-line is the default. With `oneLine` set to true the widget behaves like a single-line field, and a height of 36–40px is recommended.

5. **Scrolling**: LVGL scrolls automatically when the text exceeds the visible area. The editor canvas simulates the clipping with `overflow: hidden`.

6. **Password mode**: LVGL replaces the typed characters with dots (`•`). The editor canvas does not simulate this; it is visible only in the WASM preview.

7. **Background fallback**: on the editor canvas, a `bgColor` of transparent falls back to `#ffffff`, so the widget stays visible and clickable while designing.

8. **Font limits**: LVGL font sizes are fixed at compile time. The `fontSize` property is a reference; the font file for that size has to be enabled in the project.
