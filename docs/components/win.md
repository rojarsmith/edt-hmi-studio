# Window (win) — Window Container Widget

<p align="center">
  <strong>English</strong> · <a href="../../zh-TW/components/win.md">繁體中文</a>
</p>

## 1. Name and summary

Window is the editor's window container, mapping to LVGL's `lv_win`. It provides a structure with a header and a content area, where the header can hold a title and action buttons such as a close button. It suits dialogs, settings panels, popups and information cards.

What makes its child mounting distinctive: children are not attached to the win object itself, but to the content area returned by `lv_win_get_content()`.

## 2. Type identifier

```
type: 'win'
```

## 3. Category

```
category: 'container'  // container category, icon: 📁
```

The component panel shows it as **Window** with the 🪟 icon.

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 250 |
| defaultHeight | 200 |

## 5. Container?

```
isContainer: true
```

Window is a container; children mount onto its internal content area.

## 6. Parent/child rules

### Can be a child of

- The **screen (page root)**, directly
- Any widget with `isContainer=true`, including:
  - Container (obj)
  - Button (btn)
  - Tab View (tabview) — mounted onto the matching tab page
  - Tile View (tileview) — mounted onto the matching tile
  - Another Window (nesting, not recommended)

### Can contain

Window accepts **every** widget type. At runtime the children are placed in the window's content area.

### How children are mounted (the core design)

Window uses **content-area mounting**:

```
child → lv_win_get_content(win) → the content area
```

#### The principle

An LVGL `lv_win` has two internal parts:
- **header**: the title bar, holding the title text and buttons, managed by `lv_win_add_title()` and `lv_win_add_btn()`
- **content**: the content area, obtained with `lv_win_get_content()`, where children should be created

In the editor, the Window's `children[]` array holds all the children, but during code generation and in the WASM preview their parent is not the win object — it is the win's content area.

#### The mounting flow

1. **Adding a child** (`addComponent`):
   - The new widget is appended to the win's `children[]`
   - Its `parentId` is set to the win's id
   - Window needs no extra childMap (unlike tabview/tileview), because every child belongs to the same content area

   ```typescript
   // editorStore.ts - addComponent
   // Window takes the generic path; no special handling needed
   addComponentToTree(page.components, newComponent, parentId)
   ```

2. **Reparenting** (`reparentComponent`):
   - The generic path: removed from the old parent, added to the win's children
   - If the old parent was a tabview or tileview, its childMap has to be cleaned up

3. **Deleting a child** (`deleteComponents`):
   - The generic path: removed from the win's children

#### How this differs from Container (obj)

The store-level operations look like Container's (both work directly on the children array), but code generation and the WASM preview differ fundamentally:

| Layer | Container (obj) | Window (win) |
|------|-----------------|--------------|
| Store | Children live in `children[]` | Children live in `children[]` |
| Code generation | `lv_xxx_create(container)` | `lv_xxx_create(win_content)` |
| WASM preview | parent = container_id | parent = `{win_id}__win_content` |

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| title | `string` | `'Window'` | The window title, shown in the header |
| headerHeight | `number` | `40` | Header height in pixels |
| showCloseBtn | `boolean` | `true` | Whether to show a close button (using the LV_SYMBOL_CLOSE icon) |
| headerButtons | `Array<{icon: string, width: number}>` | `[]` | Additional header buttons |

### About title

- Set with `lv_win_add_title(win, title)`
- Shown at the left of the header, or in the order things were added

### About headerHeight

- Controls the height of the header
- In LVGL v9 it is set after `lv_win_create(parent)`
- In LVGL v8 it is a parameter of `lv_win_create(parent, headerHeight)`

### About showCloseBtn

- When `true`, a close button is added to the header
- Generated as: `lv_win_add_btn(win, LV_SYMBOL_CLOSE, 40)`
- What the button actually does has to be wired up through an event binding

### About headerButtons

- An array of additional header buttons
- Each entry has an `icon` (an LVGL symbol constant such as `LV_SYMBOL_SETTINGS`) and a `width`
- Buttons are added to the header in array order

## 8. Styles

### Default state styles

Window uses the LVGL default theme's **clip_corner** style, with a grey header and a screen-styled content area:

| Style property | Type | Default | Description |
|----------|------|--------|------|
| bgColor | `string` | `'#F5F5F5'` | Background, light grey (LVGL color_scr, applied to the content area) |
| borderColor | `string` | `'#E0E0E0'` | Border, light grey |
| borderWidth | `number` | `2` | Border width |
| borderRadius | `number` | `8` | Corner radius (the clip_corner effect) |
| textColor | `string` | `'#212121'` | Text colour |
| opacity | `number` | `1` | Fully opaque |
| padding | `number` | `0` | No padding (the content area has its own) |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always present |
| `pressed` | Pressed (optional) |
| `focused` | Focused (optional) |
| `disabled` | Disabled (optional) |

Note: these styles apply to the container as a whole. The header's background comes from the LVGL theme (`color_grey = #E0E0E0` by default), and the editor does not expose header styling separately.

## 9. Supported events

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | Value changed |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |
| `LV_EVENT_READY` | Ready |
| `LV_EVENT_CANCEL` | Cancelled |

The most common case for a Window is the close button's click event. The close button is a separate button object added by `lv_win_add_btn()`, so its event has to be bound to that object.

## 10. UI layers

### Editor canvas

On the canvas a Window renders as:

```
┌─────────────────────────────┐
│ Window Title          [✕]   │  ← header area (grey background)
├─────────────────────────────┤
│                             │
│   the children              │  ← content area
│                             │
│                             │
└─────────────────────────────┘
```

- The header shows the title text and the button icons
- The content area shows the children
- The header height comes from `headerHeight`
- A child's y coordinate is relative to the top of the content area, excluding the header

### Simple preview

Much like the canvas, minus the editing affordances. It shows the full window structure (header plus content) with the children rendered inside the content area.

### LVGL WASM preview

In `editorStateToJson.ts`, children are mapped onto the content area through a virtual id:

```typescript
// virtual parent id format: {win_id}__win_content
// e.g. "abc123__win_content"

// every child maps to the same content virtual id
for (const comp of components) {
  childToVirtualParent[comp.id] = `${parentComp.id}__win_content`;
}
```

In the serialised JSON, a child's `parent` field points at the virtual id:

```json
[
  {
    "type": "win",
    "id": "abc123",
    "parent": null,
    "props": { "title": "Window", "headerHeight": 40, "showCloseBtn": true, "headerButtons": [] }
  },
  {
    "type": "label",
    "id": "child1",
    "parent": "abc123__win_content",
    "props": { "text": "Content" }
  }
]
```

On the WASM side (`ui_from_json.c`):
1. Create the win: `lv_win_create(parent)`
2. Add the title: `lv_win_add_title(win, "Window")`
3. Add the buttons: `lv_win_add_btn(win, LV_SYMBOL_CLOSE, 40)`
4. Get the content: `lv_win_get_content(win)` returns the content object
5. Register the content in `id_map` under its virtual id (`id__win_content`)
6. When a child is created, its virtual id finds the content area in `id_map` to use as parent

### Generated code

`ui.c.ts` produces:

```c
// Create win: Window_xxxx
Window_xxxx = lv_win_create(parent);
lv_obj_set_pos(Window_xxxx, 0, 0);
lv_obj_set_size(Window_xxxx, 250, 200);

// Styles
lv_obj_set_style_bg_color(Window_xxxx, lv_color_hex(0xF5F5F5), 0);
lv_obj_set_style_bg_opa(Window_xxxx, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(Window_xxxx, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(Window_xxxx, 2, 0);
lv_obj_set_style_radius(Window_xxxx, 8, 0);

// Add the title
lv_win_add_title(Window_xxxx, "Window");

// Add the close button
lv_win_add_btn(Window_xxxx, LV_SYMBOL_CLOSE, 40);

// Get the content area; children are created on it
lv_obj_t * Window_xxxx_content = lv_win_get_content(Window_xxxx);

// Children take the content as their parent
child_1 = lv_label_create(Window_xxxx_content);
child_2 = lv_btn_create(Window_xxxx_content);
```

How the generator assigns each child's parent (`ui.c.ts`):

```typescript
// a Window's children all go on the content area
if (component.type === 'win') {
  if (component.children.length > 0) {
    lines.push(`${indent}lv_obj_t * ${varName}_content = lv_win_get_content(${varName});`);
    for (const child of component.children) {
      lines.push(...generateComponentCode(child, `${varName}_content`, ...));
    }
  }
}
```

## 11. LVGL API mapping

### Creation (LVGL v9)

```c
lv_obj_t * lv_win_create(lv_obj_t * parent);
```

Note: v8 has a different signature, `lv_win_create(parent, header_height)`. The editor adapts automatically in v8 mode.

### Key APIs

| API | Description |
|-----|------|
| `lv_win_create(parent)` | Create the window (v9) |
| `lv_win_add_title(win, title)` | Add the title text to the header |
| `lv_win_add_btn(win, icon, width)` | Add a button to the header; `icon` is an LVGL symbol (such as `LV_SYMBOL_CLOSE`), `width` is the button width |
| `lv_win_get_content(win)` | Get the content area object (`lv_obj_t *`), where children should be created |
| `lv_win_get_header(win)` | Get the header object |

### LVGL internal structure

```
win (lv_obj, the whole container)
├── header (lv_obj, the title bar, flex layout)
│   ├── title (lv_label, the title text)
│   ├── btn_close (lv_btn, the close button)
│   └── btn_xxx (lv_btn, other buttons)
└── content (lv_obj, the content area)
    ├── child_1 (a user widget)
    ├── child_2 (a user widget)
    └── ...
```

A Window uses flex layout internally:
- The whole thing is a vertical flex (header on top, content below)
- The header is a horizontal flex (title and buttons in a row)
- The content area is scrollable by default

### LVGL symbol constants (for headerButtons)

| Symbol | Meaning |
|------|------|
| `LV_SYMBOL_CLOSE` | Close ✕ |
| `LV_SYMBOL_SETTINGS` | Settings ⚙ |
| `LV_SYMBOL_HOME` | Home 🏠 |
| `LV_SYMBOL_LEFT` | Left arrow ← |
| `LV_SYMBOL_RIGHT` | Right arrow → |
| `LV_SYMBOL_REFRESH` | Refresh 🔄 |
| `LV_SYMBOL_EDIT` | Edit ✏ |
| `LV_SYMBOL_SAVE` | Save 💾 |

## 12. Design notes

1. **The content area is the key**: a Window's children must be created on the content area returned by `lv_win_get_content()`, not on the win object itself. This is the biggest difference from Container, and the editor handles the mapping automatically in code generation and the WASM preview.

2. **No childMap needed**: unlike Tab View and Tile View, Window needs no childMap, because every child belongs to the same content area. The store's addComponent, reparentComponent and deleteComponents take the generic path.

3. **The header is not editable**: in the current design, the header's contents (title and buttons) are configured through props; custom children cannot be placed in it. Everything dragged in goes to the content area.

4. **headerHeight differs between v8 and v9**:
   - v9: set after `lv_win_create(parent)`, through styles or the internal mechanism
   - v8: specified at creation with `lv_win_create(parent, headerHeight)`
   - Code generation adapts automatically

5. **Close button behaviour**: `showCloseBtn=true` only adds a button with a close icon to the header; it does not implement closing or hiding. Wire that up through an event binding (for example `lv_obj_add_flag(win, LV_OBJ_FLAG_HIDDEN)`).

6. **A single virtual id**: Window uses one `{id}__win_content` virtual id, unlike tabview which needs one per tab page, because a window has only one content area.

7. **The content area scrolls**: it is scrollable by default, so a scrollbar appears when the children overflow it.

8. **Style scope**: the styles configured in the editor apply to the win container as a whole. The header's background (grey by default) and the content's background come from the LVGL theme. Exposing header and content styling separately would be a reasonable future extension.

9. **Windows as dialogs**: LVGL has no separate dialog widget. A Window combined with `lv_obj_add_flag(win, LV_OBJ_FLAG_FLOATING)` gives a floating dialog. The editor does not expose the floating flag directly, but it could be added through the flags property.
