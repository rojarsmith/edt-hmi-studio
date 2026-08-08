# Label (label) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/label.md">繁體中文</a>
</p>

## 1. Name and summary

Label is the most basic text-display widget in the LVGL editor. It shows static or dynamic text and is one of the core building blocks of a UI. In LVGL a label object (`lv_label`) has a transparent background by default, draws only its text, and supports long-text modes (wrap, scroll, ellipsis, clip).

Label is not a container (`isContainer = false`) and cannot hold children.

## 2. Type identifier

```
type: 'label'
```

## 3. Category

| Field | Value |
|---|---|
| Category id | `basic` |
| Category name | Basic |
| Category icon | 📦 |
| Widget icon | 🏷️ |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 80 |
| defaultHeight | 24 |

## 5. Container?

```
isContainer: false
```

Label is a pure display widget and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Button (btn)** — as extra text on a button (a button already has its own built-in label)
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing. Label is not a container and cannot hold any children.

## 7. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `text` | `string` | `'Label'` | The text the label displays |
| `longMode` | `string` | `undefined` | Long-text mode: `'wrap'` / `'scroll'` / `'dot'` (ellipsis) / `'clip'` |
| `fontSize` | `number` | `14` | Text size (optional) |
| `textAlign` | `string` | `undefined` | Text alignment: `'left'` / `'center'` / `'right'` |
| `fontResource` | `string` | `undefined` | Custom font resource name (optional; takes precedence over fontSize). The font must first be uploaded in the resource manager with its sizes configured |

### Font selection

The property panel offers a font dropdown supporting:
- **Default**: the LVGL default font
- **Built-in fonts**: the built-in Montserrat family, montserrat_14 through montserrat_32 and others
- **Uploaded fonts**: custom fonts (TTF/OTF) uploaded in the resource manager

When a custom font is selected, the size dropdown lists only the sizes configured for that font, because custom fonts are compiled per size. When a built-in font is selected, all available built-in sizes are listed.

When `fontResource` is set, the generator emits `lv_obj_set_style_text_font(obj, &{fontResource}_{fontSize}, 0)`; otherwise it uses the built-in `lv_font_montserrat_{fontSize}`.

### props type

```typescript
interface LabelProps {
  text: string;
  longMode?: 'wrap' | 'scroll' | 'dot' | 'clip';
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  fontResource?: string;
}
```

## 8. Styles

### Supported style states

| State | Selector | Description |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | Default/normal state |
| `pressed` | `LV_STATE_PRESSED` | Pressed (a label usually does not respond to presses, but it can be styled) |
| `focused` | `LV_STATE_FOCUSED` | Focused |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

### Default state styles

| Style property | Type | Default | Description |
|---|---|---|---|
| `bgColor` | `string` | `'transparent'` | Background colour (transparent; `bg_opa = LV_OPA_TRANSP` in LVGL) |
| `borderColor` | `string` | `'transparent'` | Border colour (no border) |
| `borderWidth` | `number` | `0` | Border width |
| `borderRadius` | `number` | `0` | Corner radius |
| `textColor` | `string` | `'#212121'` | Text colour (the LVGL theme's `color_text` = `lv_palette_darken(GREY, 4)`) |
| `opacity` | `number` | `1` | Opacity |
| `padding` | `number` | `0` | Padding |

### Where the defaults come from

The label's default styles come from LVGL's default theme:
- Transparent background (`bg_opa = LV_OPA_TRANSP`)
- Text colour inherited from the parent, or `color_text` (`#212121`)
- No border, no corner radius, no padding

### Extended style properties

Label supports the shared extended styles inherited from `StyleProps`:

- Shadow: `shadowColor`, `shadowWidth`, `shadowOffsetX`, `shadowOffsetY`, `shadowSpread`, `shadowOpacity`
- Gradient: `bgGradColor`, `bgGradDir`, `bgGradStop`
- Outline: `outlineColor`, `outlineWidth`, `outlinePad`
- Transform: `transformAngle`, `transformZoomX`, `transformZoomY`, `transformPivotX`, `transformPivotY`
- Per-side padding: `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight`
- Text decoration: `textDecor` (`'none'` / `'underline'` / `'strikethrough'`)
- Font: `textFont`, `textFontSize`, `textLetterSpace`, `textLineSpace`
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

> Note: a label is not clickable by default (`LV_OBJ_FLAG_CLICKABLE` is not set). To respond to clicks, set `clickable = true` in the flags.

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

On the editor canvas the label is rendered with React DOM:

```tsx
<span className="lvgl-label" style={{
  color: defaultStyle.textColor || '#333333',
  fontSize: props.fontSize || 13,
}}>
  {props.text || 'Label'}
</span>
```

Key behaviour:
- A `<span>` displays the text directly
- The background stays transparent (`resolvedBgColor` returns `'transparent'` for the label type)
- Text colour and size map straight through
- Supports selection highlight, hover, dragging and resize handles
- Supports `textDecor` via the outer element's `textDecoration` CSS property

### 10.2 Simple preview (PreviewPanel.tsx)

In the Canvas 2D simple preview the label is drawn by `drawLabel()`:

```typescript
drawLabel(ctx, x, y, w, h, {
  text: comp.props.text || 'Label',
  textColor,
  fontSize: comp.props.fontSize || 14,
  textDecor: styles.textDecor,
});
```

Key behaviour:
- Draws the text with Canvas 2D `fillText`
- Alignment: `textAlign = 'left'`, `textBaseline = 'top'`
- Draws no background rectangle (transparent background)
- Supports text decoration (underline / strikethrough)
- Supports animation state on top

### 10.3 LVGL WASM preview

#### JSON serialisation (editorStateToJson.ts)

The label is serialised as a flattened JSON node:

```json
{
  "type": "label",
  "id": "comp-xxx",
  "parent": null,
  "x": 10, "y": 10,
  "width": 80, "height": 24,
  "props": { "text": "Label" },
  "styles": {
    "default": {
      "bgColor": "transparent",
      "borderColor": "transparent",
      "borderWidth": 0,
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
static lv_obj_t *create_label(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *lbl = lv_label_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) lv_label_set_text(lbl, text);
    }
    return lbl;
}
```

Key behaviour:
- Creates the label with `lv_label_create()`
- Reads `props.text` and sets it
- Applies position, size and styles
- A style with `bgColor = "transparent"` results in `lv_obj_set_style_bg_opa(obj, LV_OPA_TRANSP, sel)`

### 10.4 Generated code (ui.c.ts)

```c
// Create label: my_label
my_label = lv_label_create(parent);
lv_obj_set_pos(my_label, 10, 10);
lv_obj_set_size(my_label, 80, 24);
lv_obj_set_style_bg_opa(my_label, LV_OPA_TRANSP, 0);
lv_obj_set_style_text_color(my_label, lv_color_hex(0x212121), 0);
lv_label_set_text(my_label, "Label");
```

Key behaviour:
- Creates with `lv_label_create`
- Sets the text on the label object directly (`lv_label_set_text`)
- Maps `longMode` onto `lv_label_set_long_mode`
- Maps `fontSize` onto `lv_obj_set_style_text_font` (using the built-in Montserrat fonts)
- Maps `textAlign` onto `lv_obj_set_style_text_align`
- A custom font resource (`fontResource`) takes precedence over `fontSize`

## 11. LVGL API mapping

### Creation

| Version | API |
|---|---|
| LVGL v9 | `lv_label_create(parent)` |
| LVGL v8 | `lv_label_create(parent)` |

### Key APIs

| API | Description |
|---|---|
| `lv_label_create(parent)` | Create the label |
| `lv_label_set_text(label, text)` | Set the text |
| `lv_label_set_long_mode(label, mode)` | Set the long-text mode |
| `lv_obj_set_pos(label, x, y)` | Set the position |
| `lv_obj_set_size(label, w, h)` | Set the size |
| `lv_obj_set_style_text_color(label, color, sel)` | Set the text colour |
| `lv_obj_set_style_text_font(label, font, sel)` | Set the font |
| `lv_obj_set_style_text_align(label, align, sel)` | Set the text alignment |
| `lv_obj_set_style_text_letter_space(label, space, sel)` | Set the letter spacing |
| `lv_obj_set_style_text_line_space(label, space, sel)` | Set the line spacing |
| `lv_obj_set_style_text_decor(label, decor, sel)` | Set the text decoration |
| `lv_obj_set_style_bg_opa(label, LV_OPA_TRANSP, sel)` | Make the background transparent |

### Long-text mode constants

| Mode | LVGL constant | Description |
|---|---|---|
| `wrap` | `LV_LABEL_LONG_WRAP` | Wrap automatically |
| `scroll` | `LV_LABEL_LONG_SCROLL` | Scroll horizontally |
| `dot` | `LV_LABEL_LONG_DOT` | Ellipsis at the end |
| `clip` | `LV_LABEL_LONG_CLIP` | Clip the overflow |

## 12. Design notes

1. **Transparent background**: a label's background is transparent by default, expressed in LVGL as `bg_opa = LV_OPA_TRANSP`. The editor canvas keeps it transparent and applies no visibility fallback (unlike Button).

2. **Text colour inheritance**: in LVGL a label's text colour can be inherited from its parent. The editor defaults to `#212121` (the theme's `color_text`), but the colour at runtime may differ depending on the parent's styles.

3. **Size versus text**: the default size (80×24) is a fixed value. In real LVGL a label's size is usually driven by its content (`LV_SIZE_CONTENT`); the editor can simulate that by setting `widthMode` / `heightMode` to `'content'`.

4. **Long-text mode**: `longMode` decides what happens when the text exceeds the label's size. It is unset by default (LVGL itself defaults to `LV_LABEL_LONG_WRAP`), and code is only generated when the user sets it explicitly.

5. **Font size limits**: LVGL font sizes are fixed at compile time. Code generation maps `fontSize` onto a built-in Montserrat font (for example `lv_font_montserrat_14`). If the requested size has no compiled font, a comment is generated as a hint.

6. **Not clickable**: a label is not clickable by default. To respond to events, set `clickable = true` in the flags, and generation emits `lv_obj_add_flag(label, LV_OBJ_FLAG_CLICKABLE)`.

7. **C string escaping**: the text is passed through `escapeCString()` during generation, so quotes, backslashes, newlines and other special characters are escaped correctly.

8. **Cross-page name collisions**: as with Button, labels of the same name on different pages are automatically prefixed with the page name.
