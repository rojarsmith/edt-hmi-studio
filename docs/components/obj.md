# Container (obj) — Generic Container Widget

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/obj.md">繁體中文</a>
</p>

## 1. Name and summary

Container is the most basic container in the editor, mapping to LVGL's `lv_obj` (the base object). It is the base class of every LVGL widget, and as a container it provides a rectangular area that can hold any children. It uses the card style by default — white background, grey border and rounded corners — which suits layout grouping, panels and cards.

## 2. Type identifier

```
type: 'obj'
```

## 3. Category

```
category: 'container'  // container category, icon: 📁
```

The component panel shows it as **Container** with the 📦 icon.

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 150 |

## 5. Container?

```
isContainer: true
```

Container is a container widget and can hold children.

## 6. Parent/child rules

### Can be a child of

- The **screen (page root)**, directly
- Any widget with `isContainer=true`, including:
  - Another Container (obj)
  - Button (btn)
  - Tab View (tabview) — mounted onto the matching tab page
  - Tile View (tileview) — mounted onto the matching tile
  - Window (win) — mounted onto the content area

### Can contain

Container accepts **every** widget type:
- Basic: Button, Label, Image, Line
- Input: Textarea, Dropdown, Checkbox, Switch, Slider
- Container: Container (nested), Tab View, Tile View, Window
- Display: Progress Bar, Arc, Spinner, Chart, Table, Calendar

### How children are mounted

Container uses the simplest scheme, **direct mounting**:

```
Children are created straight onto the Container (lv_obj_create(container))
```

In detail:

1. **Adding a child**: `addComponent(type, x, y, containerId)` → the new widget's `parentId` is set to the Container's id and it is pushed into the Container's `children[]`.
2. **Reparenting**: `reparentComponent(childId, containerId)` → removed from the old parent's `children[]`, added to the Container's, and `parentId` updated.
3. **Deleting**: `deleteComponents([childId])` → removed from the Container's `children[]`.

Container needs no extra childMap (unlike tabview's `tabChildMap` or tileview's `tileChildMap`), because every child belongs to the same container space.

**Store operations** (`editorStore.ts`):

```typescript
// addComponent: append directly to the parent's children
addComponentToTree(page.components, newComponent, parentId)

// reparentComponent: move to a new parent
moveComponentToParent(page.components, id, newParentId)

// deleteComponents: remove from the tree
deleteComponentFromTree(page.components, ids)
```

## 7. Properties (props)

Container's `defaultProps` is an empty object `{}` — it has no widget-specific properties. It does support these optional layout properties:

| Name | Type | Default | Description |
|--------|------|--------|------|
| layout | `'flex' \| 'grid'` | none (free positioning) | Layout mode. `'flex'` enables flex layout, `'grid'` enables grid layout |
| scrollDir | `'none' \| 'hor' \| 'ver' \| 'all'` | none | Restricts the scroll direction |

### Flex properties (when `layout='flex'`)

| Name | Type | Default | Description |
|--------|------|--------|------|
| flexDirection | `'row' \| 'column' \| 'row-reverse' \| 'column-reverse'` | `'row'` | Main axis direction |
| flexWrap | `boolean` | `false` | Whether to wrap |
| justifyContent | `string` | `'flex-start'` | Alignment along the main axis |
| alignItems | `string` | `'flex-start'` | Alignment along the cross axis |
| alignContent | `string` | `'flex-start'` | Alignment of multiple lines |
| gap | `number` | none | Gap between children (sets both row and column gap) |

### Grid properties (when `layout='grid'`)

| Name | Type | Default | Description |
|--------|------|--------|------|
| gridColumns | `string` | none | Column track definition, e.g. `"1fr 1fr"` or `"100 200"` |
| gridRows | `string` | none | Row track definition, e.g. `"1fr 1fr"` |
| gridColumnGap | `number` | none | Column gap |
| gridRowGap | `number` | none | Row gap |

## 8. Styles

### Default state styles

Container uses the LVGL default theme's **card style**:

| Style property | Type | Default | Description |
|----------|------|--------|------|
| bgColor | `string` | `'#ffffff'` | Background, white (LVGL color_card) |
| borderColor | `string` | `'#E0E0E0'` | Border, light grey (LVGL color_grey) |
| borderWidth | `number` | `2` | Border width |
| borderRadius | `number` | `8` | Corner radius |
| textColor | `string` | `'#212121'` | Text colour (LVGL color_text) |
| opacity | `number` | `1` | Opacity (1 = fully opaque) |
| padding | `number` | `16` | Padding |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always present |
| `pressed` | Pressed (optional), maps to `LV_STATE_PRESSED` |
| `focused` | Focused (optional), maps to `LV_STATE_FOCUSED` |
| `disabled` | Disabled (optional), maps to `LV_STATE_DISABLED` |

### Full style property list

Every state supports the following, as defined by the `StyleProps` type:

| Group | Properties | Description |
|------|------|------|
| Basic | bgColor, borderColor, borderWidth, borderRadius, textColor, opacity, padding | Base appearance |
| Padding | paddingTop, paddingBottom, paddingLeft, paddingRight | Per-side padding |
| Radius | borderRadiusTopLeft, borderRadiusTopRight, borderRadiusBottomLeft, borderRadiusBottomRight | Per-corner radius |
| Border | borderSide | Which sides are drawn (full/top/bottom/left/right/top_bottom/left_right/none) |
| Gradient | bgGradColor, bgGradDir, bgGradStop | Background gradient |
| Outline | outlineColor, outlineWidth, outlinePad | Outer outline |
| Shadow | shadowColor, shadowWidth, shadowOffsetX, shadowOffsetY, shadowSpread, shadowOpacity | Shadow |
| Transform | transformAngle, transformZoomX, transformZoomY, transformPivotX, transformPivotY | Rotation and scale |
| Text | textFont, textFontSize, textLetterSpace, textLineSpace, textDecor | Text styling |
| Scrollbar | scrollbarMode, scrollbarWidth, scrollbarColor | Scrollbar styling |
| Blend | blendMode | Blend mode |

## 9. Supported events

Container supports every LVGL event type defined in `LvglEventType`:

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

Event bindings support two handler kinds:
- **builtin**: navigate, setProperty, show, hide, enable, disable, setText, setValue
- **custom**: a C snippet

## 10. UI layers

### Editor canvas

In `CanvasComponent.tsx` the Container renders as a `<div>` with the styles mapped directly:

```
- Background colour → CSS background-color (linear-gradient when a gradient is set)
- Border → CSS border
- Corner radius → CSS border-radius
- Padding → CSS padding
- Shadow → CSS box-shadow
- Transform → CSS transform (rotate + scale)
- Children → rendered recursively as nested <div>s
```

It appears as a white card on the canvas with children absolutely positioned inside it. When selected it gets a blue outline and 8 resize handles.

### Simple preview

`PreviewPanel.tsx` renders it much like the canvas, minus the editing affordances (selection box, drag handles), keeping only the visuals. Children render recursively.

### LVGL WASM preview

`editorStateToJson.ts` serialises the Container as:

```json
{
  "type": "obj",
  "id": "xxx",
  "parent": "screen or parent_id",
  "x": 0, "y": 0,
  "width": 200, "height": 150,
  "props": {},
  "styles": { "default": { "bgColor": "#ffffff", ... } }
}
```

On the WASM side (`ui_from_json.c`) it is created with `lv_obj_create(parent)`, then position, size and styles are applied. A child's `parent` field points straight at the Container's id.

### Generated code

`ui.c.ts` produces:

```c
// Create obj: Container_xxxx
Container_xxxx = lv_obj_create(parent);
lv_obj_set_pos(Container_xxxx, 0, 0);
lv_obj_set_size(Container_xxxx, 200, 150);
lv_obj_set_style_bg_color(Container_xxxx, lv_color_hex(0xffffff), 0);
lv_obj_set_style_bg_opa(Container_xxxx, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(Container_xxxx, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(Container_xxxx, 2, 0);
lv_obj_set_style_radius(Container_xxxx, 8, 0);
lv_obj_set_style_pad_all(Container_xxxx, 16, 0);

// Children are created with Container_xxxx as their parent
child_xxxx = lv_label_create(Container_xxxx);
```

With flex layout:

```c
lv_obj_set_layout(Container_xxxx, LV_LAYOUT_FLEX);
lv_obj_set_flex_flow(Container_xxxx, LV_FLEX_FLOW_ROW);
lv_obj_set_flex_align(Container_xxxx, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
```

With grid layout:

```c
lv_obj_set_layout(Container_xxxx, LV_LAYOUT_GRID);
static int32_t Container_xxxx_col_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST};
static int32_t Container_xxxx_row_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST};
lv_obj_set_grid_dsc_array(Container_xxxx, Container_xxxx_col_dsc, Container_xxxx_row_dsc);
```

## 11. LVGL API mapping

### Creation (LVGL v9)

```c
lv_obj_t * lv_obj_create(lv_obj_t * parent);
```

### Key APIs

| API | Description |
|-----|------|
| `lv_obj_create(parent)` | Create the base object |
| `lv_obj_set_pos(obj, x, y)` | Set the position |
| `lv_obj_set_size(obj, w, h)` | Set the size |
| `lv_obj_set_width(obj, w)` / `lv_obj_set_height(obj, h)` | Set width or height separately |
| `lv_obj_set_style_bg_color(obj, color, selector)` | Set the background colour |
| `lv_obj_set_style_border_color(obj, color, selector)` | Set the border colour |
| `lv_obj_set_style_border_width(obj, width, selector)` | Set the border width |
| `lv_obj_set_style_radius(obj, radius, selector)` | Set the corner radius |
| `lv_obj_set_style_pad_all(obj, pad, selector)` | Set the padding |
| `lv_obj_set_layout(obj, LV_LAYOUT_FLEX)` | Enable flex layout |
| `lv_obj_set_layout(obj, LV_LAYOUT_GRID)` | Enable grid layout |
| `lv_obj_set_flex_flow(obj, flow)` | Set the flex flow |
| `lv_obj_set_flex_align(obj, main, cross, track)` | Set the flex alignment |
| `lv_obj_set_grid_dsc_array(obj, col_dsc, row_dsc)` | Set the grid descriptors |
| `lv_obj_set_scroll_dir(obj, dir)` | Set the scroll direction |
| `lv_obj_add_flag(obj, flag)` | Add a flag |
| `lv_obj_clear_flag(obj, flag)` | Clear a flag |
| `lv_obj_add_event_cb(obj, cb, event, user_data)` | Add an event callback |

## 12. Design notes

1. **The most basic container**: `obj` is the base class of every LVGL widget, and as a container it is the simplest and most general. The other containers (tabview, tileview, win) are specialisations of it.

2. **Child positioning**: children use **absolute positioning** by default (x and y relative to the Container's content area). Once flex or grid layout is enabled, the layout engine takes over.

3. **Nesting depth**: nesting is unlimited, but deep nesting costs LVGL rendering performance. Keeping it under about 5 levels is recommended.

4. **Scrolling**: an LVGL obj is scrollable by default (`LV_OBJ_FLAG_SCROLLABLE`), so a scrollbar appears when children overflow the Container. Disable it with `flags.scrollable = false`.

5. **Where the card style comes from**: the defaults come from the card style in LVGL's default theme (`lv_theme_default.c`), shared with textarea, dropdown, chart, table and calendar.

6. **Switching layout**: moving from free positioning to flex or grid makes the layout engine ignore the children's x and y. Switching back means repositioning them.

7. **Container versus Button**: Button is also `isContainer=true`, but it has a default pressed style and a primary-colour background. Container is the better choice for pure layout.
