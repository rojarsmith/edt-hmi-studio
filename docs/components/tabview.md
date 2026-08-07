# Tab View (tabview) — Tabbed Container Widget

<p align="center">
  <strong>English</strong> · <a href="../../zh-TW/components/tabview.md">繁體中文</a>
</p>

## 1. Name and summary

Tab View is the editor's tabbed container, mapping to LVGL's `lv_tabview`. It provides a set of switchable tabs, each with its own content area; the user clicks the tab bar to switch between them. It suits settings pages, multi-function panels and step-by-step wizards.

Tab View has one of the most involved child-mounting schemes of any container: children are mapped onto their tab page through `tabChildMap` rather than being attached to the tabview itself.

## 2. Type identifier

```
type: 'tabview'
```

## 3. Category

```
category: 'container'  // container category, icon: 📁
```

The component panel shows it as **Tab View** with the 📑 icon.

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 250 |
| defaultHeight | 200 |

## 5. Container?

```
isContainer: true
```

Tab View is a container; children are assigned to individual tab pages through tabChildMap.

## 6. Parent/child rules

### Can be a child of

- The **screen (page root)**, directly
- Any widget with `isContainer=true`, including:
  - Container (obj)
  - Button (btn)
  - Another Tab View (nesting, not recommended)
  - Tile View (tileview) — mounted onto the matching tile
  - Window (win) — mounted onto the content area

### Can contain

Tab View accepts **every** widget type. Logically a child belongs to one tab page, and `tabChildMap` records which.

### How children are mounted (the core design)

This is one of the editor's central design points, built on the **tabChildMap mapping**:

```
child → tabChildMap → the matching tab page
```

#### The tabChildMap structure

```typescript
tabChildMap: Record<string, string[]>
// key: the tab index as a string ("0", "1", "2", ...)
// value: an array of child widget ids
```

For example:

```typescript
{
  tabChildMap: {
    "0": ["comp_id_1", "comp_id_2"],  // children of Tab 1
    "1": ["comp_id_3"],                // children of Tab 2
    "2": []                            // Tab 3 has none
  }
}
```

#### The mounting flow

1. **Adding a child** (`addComponent`):
   - The new widget is appended to the tabview's `children[]`
   - The store adds its id to `tabChildMap[activeTab]`
   - In other words, a new widget lands on the currently active tab page

   ```typescript
   // editorStore.ts - addComponent
   if (parent?.type === 'tabview') {
     const tabChildMap = { ...(parent.props?.tabChildMap || {}) };
     const activeTab = String(parent.props?.activeTab || 0);
     if (!tabChildMap[activeTab]) tabChildMap[activeTab] = [];
     tabChildMap[activeTab] = [...tabChildMap[activeTab], id];
     get().updateComponent(parentId, { props: { ...parent.props, tabChildMap } });
   }
   ```

2. **Reparenting** (`reparentComponent`):
   - The mapping is removed from the old parent's childMap
   - It is added to the new parent's `tabChildMap[activeTab]`, if that parent is a tabview

   ```typescript
   // editorStore.ts - reparentComponent
   // remove the old mapping
   if (oldParent?.type === 'tabview') {
     const tabChildMap = { ...(oldParent.props?.tabChildMap || {}) };
     for (const key of Object.keys(tabChildMap)) {
       tabChildMap[key] = tabChildMap[key].filter(cid => cid !== id);
     }
     get().updateComponent(comp.parentId, { props: { ...oldParent.props, tabChildMap } });
   }
   // add the new mapping
   if (newParent?.type === 'tabview') {
     const tabChildMap = { ...(newParent.props?.tabChildMap || {}) };
     const activeTab = String(newParent.props?.activeTab || 0);
     if (!tabChildMap[activeTab]) tabChildMap[activeTab] = [];
     tabChildMap[activeTab] = [...tabChildMap[activeTab], id];
     get().updateComponent(newParentId, { props: { ...newParent.props, tabChildMap } });
   }
   ```

3. **Deleting a child** (`deleteComponents`):
   - The deleted id is cleaned out of every tab in the parent's `tabChildMap`

   ```typescript
   // editorStore.ts - deleteComponents
   if (parent?.type === 'tabview') {
     const tabChildMap = { ...(parent.props?.tabChildMap || {}) };
     for (const key of Object.keys(tabChildMap)) {
       tabChildMap[key] = tabChildMap[key].filter(cid => cid !== id);
     }
     get().updateComponent(comp.parentId, { props: { ...parent.props, tabChildMap } });
   }
   ```

4. **Fallback**: a child with no entry in `tabChildMap` falls back to the tab page for `activeTab`.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| tabs | `string[]` | `['Tab 1', 'Tab 2']` | Tab names; each element is one tab's title |
| activeTab | `number` | `0` | The active tab index (zero-based) |
| tabPosition | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | Where the tab bar sits |
| tabChildMap | `Record<string, string[]>` | `{}` | Tab-to-children mapping; keys are tab index strings, values are arrays of child ids |
| tabBarSize | `number` | `50` | Tab bar height or width (depending on tabPosition) |

### About tabs

- The array length determines the number of tabs
- Each element is the label text for that tab
- Adding or removing a tab requires updating `tabChildMap` to match

### About tabChildMap

- This is Tab View's central property, holding the child-to-tab-page mapping
- The store maintains it automatically; the user does not normally edit it by hand
- Keys are tab indices as strings (`"0"`, `"1"`, ...)
- Values are the ids of every child on that tab
- Unmapped children fall back to activeTab

## 8. Styles

### Default state styles

Tab View uses the LVGL default theme's **screen style** with no padding:

| Style property | Type | Default | Description |
|----------|------|--------|------|
| bgColor | `string` | `'#F5F5F5'` | Background, light grey (LVGL color_scr) |
| borderColor | `string` | `'transparent'` | No border |
| borderWidth | `number` | `0` | Border width of 0 |
| borderRadius | `number` | `0` | No corner radius |
| textColor | `string` | `'#212121'` | Text colour |
| opacity | `number` | `1` | Fully opaque |
| padding | `number` | `0` | No padding (pad_zero) |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always present |
| `pressed` | Pressed (optional) |
| `focused` | Focused (optional) |
| `disabled` | Disabled (optional) |

Note: these styles apply to the container as a whole. The tab bar and the individual tab buttons are styled by LVGL's internal theme; the editor does not currently expose them.

## 9. Supported events

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | **Fires when the tab changes** — the most useful event here |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |
| `LV_EVENT_READY` | Ready |
| `LV_EVENT_CANCEL` | Cancelled |

`LV_EVENT_VALUE_CHANGED` is Tab View's most important event; it fires when the user switches tabs.

## 10. UI layers

### Editor canvas

On the canvas a Tab View renders as:

```
┌─────────────────────────────┐
│ [Tab 1] [Tab 2] [Tab 3]    │  ← tab bar (placed according to tabPosition)
├─────────────────────────────┤
│                             │
│   children of the active tab │  ← content area
│                             │
└─────────────────────────────┘
```

- The tab bar appears at the top, bottom, left or right per `tabPosition`
- Clicking a tab switches `activeTab`, and only that tab's children are shown
- Child visibility is decided by `tabChildMap[activeTab]`
- Children belonging to other tabs are hidden on the canvas

### Simple preview

Much like the canvas, minus the editing affordances. The tab bar is clickable and shows the matching tab's children.

### LVGL WASM preview

In `editorStateToJson.ts`, children are mapped onto tab pages through virtual ids:

```typescript
// virtual parent id format: {tabview_id}__tab__{tabIndex}
// e.g. "abc123__tab__0", "abc123__tab__1"

childToVirtualParent[childId] = `${parentComp.id}__tab__${tabIndex}`;
```

In the serialised JSON, a child's `parent` field points at the virtual id:

```json
[
  {
    "type": "tabview",
    "id": "abc123",
    "parent": null,
    "props": { "tabs": ["Tab 1", "Tab 2"], "activeTab": 0, "tabPosition": "top", "tabChildMap": {"0": ["child1"], "1": ["child2"]} }
  },
  {
    "type": "label",
    "id": "child1",
    "parent": "abc123__tab__0",
    "props": { "text": "Content 1" }
  },
  {
    "type": "label",
    "id": "child2",
    "parent": "abc123__tab__1",
    "props": { "text": "Content 2" }
  }
]
```

On the WASM side (`ui_from_json.c`):
1. Create the tabview: `lv_tabview_create(parent)`
2. Add tab pages: `lv_tabview_add_tab(tabview, "Tab 1")` returns the tab page object
3. Register each tab page in `id_map` under its virtual id (`id__tab__N`)
4. When a child is created, its virtual id finds the right tab page in `id_map` to use as parent

### Generated code

`ui.c.ts` produces:

```c
// Create tabview: TabView_xxxx
TabView_xxxx = lv_tabview_create(parent);
lv_obj_set_pos(TabView_xxxx, 0, 0);
lv_obj_set_size(TabView_xxxx, 250, 200);

// Tab bar position and size (LVGL v9)
lv_tabview_set_tab_bar_position(TabView_xxxx, LV_DIR_TOP);
lv_tabview_set_tab_bar_size(TabView_xxxx, 50);

// Add the tab pages
lv_obj_t * TabView_xxxx_tab_0 = lv_tabview_add_tab(TabView_xxxx, "Tab 1");
lv_obj_t * TabView_xxxx_tab_1 = lv_tabview_add_tab(TabView_xxxx, "Tab 2");

// Children are created on their tab page
// children in tabChildMap["0"] → parent TabView_xxxx_tab_0
child_1 = lv_label_create(TabView_xxxx_tab_0);
// children in tabChildMap["1"] → parent TabView_xxxx_tab_1
child_2 = lv_btn_create(TabView_xxxx_tab_1);

// Set the active tab (when it is not the first)
lv_tabview_set_active(TabView_xxxx, 1, LV_ANIM_OFF);
```

How the generator assigns each child's parent (`ui.c.ts`):

```typescript
// build a child → tab page variable name map
const childToTab: Record<string, string> = {};
for (const [tabIndex, childIds] of Object.entries(tabChildMap)) {
  for (const childId of childIds) {
    childToTab[childId] = `${varName}_tab_${tabIndex}`;
  }
}
// unmapped children fall back to activeTab
const defaultTab = `${varName}_tab_${component.props.activeTab || 0}`;
for (const child of component.children) {
  const tabParent = childToTab[child.id] || defaultTab;
  generateComponentCode(child, tabParent, ...);
}
```

## 11. LVGL API mapping

### Creation (LVGL v9)

```c
lv_obj_t * lv_tabview_create(lv_obj_t * parent);
```

Note: v8 has a different signature, `lv_tabview_create(parent, dir, tab_size)`. The editor adapts automatically in v8 mode.

### Key APIs

| API | Description |
|-----|------|
| `lv_tabview_create(parent)` | Create the tabview (v9) |
| `lv_tabview_add_tab(tabview, name)` | Add a tab page, returning the page object (`lv_obj_t *`) |
| `lv_tabview_set_active(tabview, index, anim)` | Set the active tab |
| `lv_tabview_set_tab_bar_position(tabview, dir)` | Set the tab bar position (v9); `LV_DIR_TOP/BOTTOM/LEFT/RIGHT` |
| `lv_tabview_set_tab_bar_size(tabview, size)` | Set the tab bar size (v9) |
| `lv_tabview_get_active(tabview)` | Read the active tab index |
| `lv_tabview_get_tab_bar(tabview)` | Get the tab bar object |
| `lv_tabview_get_content(tabview)` | Get the content area object |

### LVGL source reference

Tab View lives in `tools/lvgl/src/widgets/tabview/lv_tabview.c`. Its internal structure:

```
tabview (lv_obj)
├── tab_bar (lv_obj, holding the tab buttons)
│   ├── tab_btn_0 (lv_btn)
│   ├── tab_btn_1 (lv_btn)
│   └── ...
└── content (lv_obj, holding the tab pages)
    ├── tab_page_0 (lv_obj)
    ├── tab_page_1 (lv_obj)
    └── ...
```

## 12. Design notes

1. **tabChildMap is central**: child mounting depends on it entirely. The store maintains it across `addComponent`, `reparentComponent` and `deleteComponents`, which is what keeps the data consistent.

2. **Switching tabs while designing**: clicking a tab label on the canvas updates the `activeTab` property and changes which children are shown. This is purely an editor behaviour and does not affect runtime.

3. **Where new children land**: a widget dragged into a Tab View is assigned to the current `activeTab`. Switch to the target tab first, then add.

4. **Keeping tabs in sync**: adding or removing a tab requires updating `tabChildMap`. When a tab is deleted, its children must be moved to another tab or deleted.

5. **Virtual ids in the WASM preview**: the preview identifies tab pages with `{id}__tab__{N}` virtual ids. These are not real widget ids; they exist only for parent lookup on the WASM side.

6. **v8/v9 API differences**:
   - v9: `lv_tabview_create(parent)` plus `lv_tabview_set_tab_bar_position()` and `lv_tabview_set_tab_bar_size()`
   - v8: `lv_tabview_create(parent, dir, tab_size)` sets position and size at creation

7. **Performance**: every tab page is a full `lv_obj` and consumes memory even while hidden. Watch memory use with many tabs (more than about 10).

8. **Tab bar styling**: the editor does not expose the tab bar or tab button styles; their appearance comes from LVGL's default theme. Exposing them would be a reasonable future extension.

9. **Nesting**: a tab page can hold other containers (a Container, or even another Tab View), allowing complex layouts — though nested tab views are worth thinking about from a usability standpoint.
