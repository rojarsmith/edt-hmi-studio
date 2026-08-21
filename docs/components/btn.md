# Button (btn) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/btn.md">繁體中文</a>
</p>

## 1. Name and summary

Button is one of the most fundamental interactive widgets in EDT HMI Studio. It triggers a user action and automatically contains a centred text label. In LVGL a button is a special container object (`lv_button`) that is clickable by default and comes with built-in visual feedback for the pressed state.

Button is a container widget (`isContainer = true`): besides its built-in text label it can hold other children (an icon, an extra label, ...) for more elaborate button layouts.

## 2. Type identifier

```
type: 'btn'
```

## 3. Category

| Field | Value |
|---|---|
| Category id | `basic` |
| Category name | Basic |
| Category icon | 📦 |
| Widget icon | 🔘 |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 40 |

## 5. Container?

```
isContainer: true
```

Button is a container. An internal `lv_label` is created automatically, but the user can also drag other widgets into it.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

As a container, a button can hold:

- **Label (label)** — an additional text label
- **Image (img)** — an icon or picture
- **Line (line)** — a decorative line
- **Spinner (spinner)** — a loading indicator

> Note: a button automatically gets a centred internal label showing `props.text`. That label is managed by the code generator and does not appear in the widget tree. Children the user adds are drawn on top of it inside the button.

## 7. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `text` | `string` | `'Button'` | The text shown by the button's internal label |
| `fontSize` | `number` | `14` | Text size (optional; maps to the internal label's font size) |
| `textAlign` | `string` | `'center'` | Text alignment: `'left'` / `'center'` / `'right'` |
| `fontResource` | `string` | `undefined` | Custom font resource name (optional; takes precedence over fontSize). The font must first be uploaded in the resource manager with its sizes configured |

### Font selection

The property panel offers a font dropdown supporting:
- **Default**: the LVGL default font
- **Built-in fonts**: the built-in Montserrat family, montserrat_14 through montserrat_32 and others
- **Uploaded fonts**: custom fonts (TTF/OTF) uploaded in the resource manager

When a custom font is selected, the size dropdown lists only the sizes configured for that font, because custom fonts are compiled per size. When a built-in font is selected, all available built-in sizes are listed.

When `fontResource` is set, the generator emits `lv_obj_set_style_text_font(label, &{fontResource}_{fontSize}, 0)`; otherwise it uses the built-in `lv_font_montserrat_{fontSize}`.

### props type

```typescript
interface BtnProps {
  text: string;
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
| `pressed` | `LV_STATE_PRESSED` | Pressed |
| `focused` | `LV_STATE_FOCUSED` | Focused (keyboard or encoder navigation) |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

### Default state styles

| Style property | Type | Default | Description |
|---|---|---|---|
| `bgColor` | `string` | `'#2196F3'` | Background colour (Material Blue 500, the LVGL theme's primary colour) |
| `borderColor` | `string` | `'transparent'` | Border colour (no border by default) |
| `borderWidth` | `number` | `0` | Border width |
| `borderRadius` | `number` | `8` | Corner radius |
| `textColor` | `string` | `'#ffffff'` | Text colour (white) |
| `opacity` | `number` | `1` | Opacity (0–1) |
| `padding` | `number` | `10` | Padding (uniform on all four sides) |

### Where the defaults come from

The button's default styles come from LVGL's default theme (`lv_theme_default.c`):
- Background uses `color_primary` (`lv_palette_main(LV_PALETTE_BLUE)` = `#2196F3`)
- Text uses white (`lv_color_white()`)
- No border (`border_width = 0`)
- 8px corner radius

### Extended style properties

Button also supports the shared extended styles inherited from `StyleProps`:

- Shadow: `shadowColor`, `shadowWidth`, `shadowOffsetX`, `shadowOffsetY`, `shadowSpread`, `shadowOpacity`
- Gradient: `bgGradColor`, `bgGradDir`, `bgGradStop`
- Outline: `outlineColor`, `outlineWidth`, `outlinePad`
- Transform: `transformAngle`, `transformZoomX`, `transformZoomY`, `transformPivotX`, `transformPivotY`
- Per-side padding: `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight`
- Per-corner radius: `borderRadiusTopLeft`, `borderRadiusTopRight`, `borderRadiusBottomLeft`, `borderRadiusBottomRight`
- Border sides: `borderSide` (`'full'` / `'top'` / `'bottom'` / `'left'` / `'right'` / `'top_bottom'` / `'left_right'` / `'none'`)
- Text decoration: `textDecor` (`'none'` / `'underline'` / `'strikethrough'`)
- Blend mode: `blendMode` (`'normal'` / `'additive'` / `'subtractive'` / `'multiply'`)
- Font: `textFont`, `textFontSize`, `textLetterSpace`, `textLineSpace`

## 9. Supported events

| Event | Description |
|---|---|
| `LV_EVENT_CLICKED` | Click (press then release) |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | Value changed (when the button is checkable) |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

### Handler types

- **builtin**: `navigate` (go to a page), `show`/`hide`, `enable`/`disable`, `setText`, `setValue`, `setProperty`
- **custom**: a C snippet written by the user

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

On the editor canvas the button is rendered with React DOM:

```tsx
<div className="lvgl-btn" style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  color: defaultStyle.textColor || '#ffffff',
  fontSize: props.fontSize || 13,
}}>
  {props.text || 'Button'}
</div>
```

Key behaviour:
- A `div` with flexbox centres the text
- The background colour maps straight to the outer container's `backgroundColor`
- Supports selection highlight, hover, dragging and resize handles
- A transparent background falls back to `#2196F3`, so the button stays visible on the canvas
- Supports `borderSide` for partial borders
- Supports `textDecor`

### 10.2 Prototype (PreviewPanel.tsx)

In the Canvas 2D simple preview the button is drawn by `drawButton()`:

```typescript
drawButton(ctx, x, y, w, h, {
  bgColor: isHovered ? lightenColor(bgColorStyle, 20) : bgColorStyle,
  borderColor, borderWidth, borderRadius,
  text: comp.props.text || 'Button',
  textColor,
  gradientFill: isHovered ? undefined : getGradientFill(),
  textDecor: styles.textDecor,
  borderSide: styles.borderSide,
});
```

Key behaviour:
- Draws a rounded rectangle background with Canvas 2D `roundRect`
- Centres the text (`textAlign: 'center'`, `textBaseline: 'middle'`)
- Lightens the background by 20% on hover
- Supports gradient fills, text decoration and partial borders
- Supports animation state on top (translation, scale, opacity)
- Supports shadow, transform (rotate/scale) and outline

### 10.3 Simulator

#### JSON serialisation (editorStateToJson.ts)

The button is serialised as a flattened JSON node:

```json
{
  "type": "btn",
  "id": "comp-xxx",
  "parent": null,
  "x": 50, "y": 50,
  "width": 100, "height": 40,
  "props": { "text": "Button" },
  "styles": {
    "default": {
      "bgColor": "#2196F3",
      "borderColor": "transparent",
      "borderWidth": 0,
      "borderRadius": 8,
      "textColor": "#ffffff",
      "opacity": 1,
      "padding": 10
    }
  }
}
```

#### Creation on the C side (ui_from_json.c)

```c
static lv_obj_t *create_btn(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *btn = lv_button_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) {
            lv_obj_t *lbl = lv_label_create(btn);
            lv_label_set_text(lbl, text);
            lv_obj_center(lbl);
        }
    }
    return btn;
}
```

Key behaviour:
- Creates the button with `lv_button_create()`
- Reads `props.text` and creates a centred internal `lv_label`
- Applies position, size and styles (including the extra states)
- Applies the flags (hidden, clickable, scrollable)

### 10.4 Generated code (ui.c.ts)

```c
// Create btn: my_button
my_button = lv_btn_create(parent);
lv_obj_set_pos(my_button, 50, 50);
lv_obj_set_size(my_button, 100, 40);
lv_obj_set_style_bg_color(my_button, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_bg_opa(my_button, LV_OPA_COVER, 0);
lv_obj_set_style_radius(my_button, 8, 0);
lv_obj_set_style_text_color(my_button, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_pad_all(my_button, 10, 0);

// Create label inside button
lv_obj_t *my_button_label = lv_label_create(my_button);
lv_label_set_text(my_button_label, "Button");
lv_obj_center(my_button_label);
```

Key behaviour:
- Creates with `lv_btn_create` (note: code generation uses `lv_btn_create` while the WASM preview uses `lv_button_create`; they are equivalent in LVGL v9)
- Generates the internal label automatically
- Names the internal label `{varName}_label`
- Maps `fontSize`, `textAlign` and `fontResource` onto the internal label
- Emits the extra state styles (pressed/focused/disabled with the matching `LV_STATE_*` selector)
- Emits the event binding code

## 11. LVGL API mapping

### Creation

| Version | API |
|---|---|
| LVGL v9 | `lv_button_create(parent)` / `lv_btn_create(parent)` |
| LVGL v8 | `lv_btn_create(parent)` |

### Key APIs

| API | Description |
|---|---|
| `lv_label_create(btn)` | Create the text label inside the button |
| `lv_label_set_text(label, text)` | Set the label text |
| `lv_obj_center(label)` | Centre the label in the button |
| `lv_obj_set_pos(btn, x, y)` | Set the position |
| `lv_obj_set_size(btn, w, h)` | Set the size |
| `lv_obj_set_style_bg_color(btn, color, sel)` | Set the background colour |
| `lv_obj_set_style_bg_opa(btn, opa, sel)` | Set the background opacity |
| `lv_obj_set_style_radius(btn, r, sel)` | Set the corner radius |
| `lv_obj_set_style_text_color(btn, color, sel)` | Set the text colour |
| `lv_obj_set_style_pad_all(btn, pad, sel)` | Set the padding |
| `lv_obj_set_style_border_width(btn, w, sel)` | Set the border width |
| `lv_obj_set_style_border_color(btn, color, sel)` | Set the border colour |
| `lv_obj_add_event_cb(btn, handler, event, data)` | Add an event callback |
| `lv_obj_add_state(btn, LV_STATE_DISABLED)` | Disable it |
| `lv_obj_add_flag(btn, LV_OBJ_FLAG_HIDDEN)` | Hide it |

## 12. Design notes

1. **Internal label**: the button's `text` property is implemented through an automatically created internal `lv_label`. In generated code the label variable is `{btnVarName}_label`, so watch for naming collisions.

2. **Container behaviour**: the button is a container (`isContainer = true`), so children can be added to it and are created with the button as their parent. Note that the automatic internal label is not part of the widget tree, so user-added children may overlap it.

3. **Transparent borders**: the defaults are `borderColor = 'transparent'` and `borderWidth = 0`. When `borderColor` is transparent, no border colour code is generated.

4. **v8/v9 compatibility**:
   - Code generation uses `lv_btn_create` (valid in both v8 and v9)
   - The WASM preview uses `lv_button_create` (the v9 name)
   - They are equivalent in v9

5. **Canvas visibility**: when `bgColor` is transparent, the editor canvas falls back to `#2196F3`, so a button is always visible and clickable while designing.

6. **Hover feedback**: the simple preview lightens the background by 20% on hover to simulate interaction feedback; the editor canvas does it with a CSS hover class.

7. **Font properties**: `fontSize`, `textAlign` and `fontResource` are applied to the internal label rather than to the button itself. A custom font resource (`fontResource`) takes precedence over `fontSize`.

8. **Cross-page name collisions**: when buttons on different pages share a name, the generator prefixes the page name (for example `page1_my_button`) to avoid clashing C variable names.
