# Tile View (tileview) — Tiled Container Widget

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/tileview.md">繁體中文</a>
</p>

## 1. Name and summary

Tile View is the editor's tiled container, mapping to LVGL's `lv_tileview`. It lays out a two-dimensional grid where each cell (a tile) is its own full-size content area, and the user swipes between them. It suits smartwatch interfaces, multi-screen dashboards and swipe-navigated pages.

Its child-mounting scheme mirrors Tab View's: children are mapped onto tiles through `tileChildMap`, but the key is a two-dimensional coordinate (row-col).

## 2. Type identifier

```
type: 'tileview'
```

## 3. Category

```
category: 'container'  // container category, icon: 📁
```

The component panel shows it as **Tile View** with the 🔲 icon.

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 200 |

## 5. Container?

```
isContainer: true
```

Tile View is a container; children are assigned to individual tiles through tileChildMap.

## 6. Parent/child rules

### Can be a child of

- The **screen (page root)**, directly
- Any widget with `isContainer=true`, including:
  - Container (obj)
  - Button (btn)
  - Tab View (tabview) — mounted onto the matching tab page
  - Another Tile View (nesting, not recommended)
  - Window (win) — mounted onto the content area

### Can contain

Tile View accepts **every** widget type. Logically a child belongs to one tile, and `tileChildMap` records which.

### How children are mounted (the core design)

Tile View uses the **tileChildMap mapping**, following the same idea as Tab View's tabChildMap but keyed by a two-dimensional coordinate:

```
child → tileChildMap → the matching tile (row-col)
```

#### The tileChildMap structure

```typescript
tileChildMap: Record<string, string[]>
// key: a "row-col" string (e.g. "0-0", "0-1", "1-0", "1-1")
// value: an array of child widget ids
```

For a 2×2 grid:

```typescript
{
  tileChildMap: {
    "0-0": ["comp_id_1", "comp_id_2"],  // children of row 0, column 0
    "0-1": ["comp_id_3"],                // children of row 0, column 1
    "1-0": [],                            // row 1, column 0 has none
    "1-1": ["comp_id_4"]                 // children of row 1, column 1
  }
}
```

#### The mounting flow

1. **Adding a child** (`addComponent`):
   - The new widget is appended to the tileview's `children[]`
   - The store adds its id to `tileChildMap[currentRow-currentCol]`
   - In other words, a new widget lands on the tile currently being shown

   ```typescript
   // editorStore.ts - addComponent
   if (parent?.type === 'tileview') {
     const tileChildMap = { ...(parent.props?.tileChildMap || {}) };
     const key = `${parent.props?.currentRow || 0}-${parent.props?.currentCol || 0}`;
     if (!tileChildMap[key]) tileChildMap[key] = [];
     tileChildMap[key] = [...tileChildMap[key], id];
     get().updateComponent(parentId, { props: { ...parent.props, tileChildMap } });
   }
   ```

2. **Reparenting** (`reparentComponent`):
   - The mapping is removed from every tile in the old parent's tileChildMap
   - It is added to the new parent's `tileChildMap[currentRow-currentCol]`, if that parent is a tileview

   ```typescript
   // editorStore.ts - reparentComponent
   // remove the old mapping
   if (oldParent?.type === 'tileview') {
     const tileChildMap = { ...(oldParent.props?.tileChildMap || {}) };
     for (const key of Object.keys(tileChildMap)) {
       tileChildMap[key] = tileChildMap[key].filter(cid => cid !== id);
     }
     get().updateComponent(comp.parentId, { props: { ...oldParent.props, tileChildMap } });
   }
   // add the new mapping
   if (newParent?.type === 'tileview') {
     const tileChildMap = { ...(newParent.props?.tileChildMap || {}) };
     const key = `${newParent.props?.currentRow || 0}-${newParent.props?.currentCol || 0}`;
     if (!tileChildMap[key]) tileChildMap[key] = [];
     tileChildMap[key] = [...tileChildMap[key], id];
     get().updateComponent(newParentId, { props: { ...newParent.props, tileChildMap } });
   }
   ```

3. **Deleting a child** (`deleteComponents`):
   - The deleted id is cleaned out of every tile in the parent's `tileChildMap`

   ```typescript
   // editorStore.ts - deleteComponents
   if (parent?.type === 'tileview') {
     const tileChildMap = { ...(parent.props?.tileChildMap || {}) };
     for (const key of Object.keys(tileChildMap)) {
       tileChildMap[key] = tileChildMap[key].filter(cid => cid !== id);
     }
     get().updateComponent(comp.parentId, { props: { ...parent.props, tileChildMap } });
   }
   ```

4. **Fallback**: a child with no entry in `tileChildMap` falls back to `tile_0_0` (row 0, column 0).

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| rows | `number` | `2` | Row count, giving the number of tiles vertically |
| cols | `number` | `2` | Column count, giving the number of tiles horizontally |
| currentRow | `number` | `0` | Row index of the tile being shown (zero-based) |
| currentCol | `number` | `0` | Column index of the tile being shown (zero-based) |
| tileChildMap | `Record<string, string[]>` | `{}` | Tile-to-children mapping; keys are "row-col" strings, values are arrays of child ids |

### About rows and cols

- `rows × cols` gives the total tile count (2×2 = 4 tiles, for example)
- Changing rows or cols requires updating `tileChildMap` and clearing entries that fall outside the new range
- Each tile is the same size as the tileview itself (full-size tiles)

### About tileChildMap

- Keys are `"row-col"` strings such as `"0-0"`, `"0-1"`, `"1-0"`, `"1-1"`
- The store maintains it automatically; the user does not normally edit it by hand
- Unmapped children fall back to `tile_0_0`

### About currentRow and currentCol

- They decide which tile's contents the editor shows
- Changing them while designing is how a different tile's children are edited
- At runtime they correspond to the initial position set by `lv_obj_set_tile_id()`

## 8. Styles

### Default state styles

Tile View uses the LVGL default theme's **screen style**:

| Style property | Type | Default | Description |
|----------|------|--------|------|
| bgColor | `string` | `'#F5F5F5'` | Background, light grey (LVGL color_scr) |
| borderColor | `string` | `'transparent'` | No border |
| borderWidth | `number` | `0` | Border width of 0 |
| borderRadius | `number` | `0` | No corner radius |
| textColor | `string` | `'#212121'` | Text colour |
| opacity | `number` | `1` | Fully opaque |
| padding | `number` | `0` | No padding |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always present |
| `pressed` | Pressed (optional) |
| `focused` | Focused (optional) |
| `disabled` | Disabled (optional) |

Note: these styles apply to the container as a whole. The individual tiles are managed by LVGL internally, and the editor does not expose their styles separately.

## 9. Supported events

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | **Fires when the tile changes** — the most useful event here |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |
| `LV_EVENT_READY` | Ready |
| `LV_EVENT_CANCEL` | Cancelled |

`LV_EVENT_VALUE_CHANGED` is Tile View's most important event; it fires when the user swipes to another tile.

## 10. UI layers

### Editor canvas

On the canvas a Tile View renders as:

```
┌─────────────────────────────┐
│                             │
│  children of the current    │
│  tile (currentRow,          │
│  currentCol)                │
│                             │
│  [0,0] [0,1]               │  ← tile navigation indicator (optional)
│  [1,0] [1,1]               │
└─────────────────────────────┘
```

- Only the children of the `currentRow`-`currentCol` tile are shown
- Child visibility is decided by `tileChildMap[currentRow-currentCol]`
- Changing currentRow/currentCol while designing switches which tile is edited
- Children belonging to other tiles are hidden on the canvas

### Prototype

Much like the canvas, minus the editing affordances. It shows the current tile's children and allows switching between tiles.

### Simulator

In `editorStateToJson.ts`, children are mapped onto tiles through virtual ids:

```typescript
// virtual parent id format: {tileview_id}__tile__{row-col}
// e.g. "abc123__tile__0-0", "abc123__tile__0-1", "abc123__tile__1-0"

childToVirtualParent[childId] = `${parentComp.id}__tile__${tileKey}`;
```

In the serialised JSON, a child's `parent` field points at the virtual id:

```json
[
  {
    "type": "tileview",
    "id": "abc123",
    "parent": null,
    "props": { "rows": 2, "cols": 2, "currentRow": 0, "currentCol": 0, "tileChildMap": {"0-0": ["child1"], "1-0": ["child2"]} }
  },
  {
    "type": "label",
    "id": "child1",
    "parent": "abc123__tile__0-0",
    "props": { "text": "Tile 0,0 Content" }
  },
  {
    "type": "label",
    "id": "child2",
    "parent": "abc123__tile__1-0",
    "props": { "text": "Tile 1,0 Content" }
  }
]
```

On the WASM side (`ui_from_json.c`):
1. Create the tileview: `lv_tileview_create(parent)`
2. Add tiles: `lv_tileview_add_tile(tileview, col, row, LV_DIR_ALL)` returns the tile object
3. Register each tile in `id_map` under its virtual id (`id__tile__R-C`)
4. When a child is created, its virtual id finds the right tile in `id_map` to use as parent

### Generated code

`ui.c.ts` produces:

```c
// Create tileview: TileView_xxxx
TileView_xxxx = lv_tileview_create(parent);
lv_obj_set_pos(TileView_xxxx, 0, 0);
lv_obj_set_size(TileView_xxxx, 200, 200);

// Add every tile (iterating rows × cols)
lv_obj_t * TileView_xxxx_tile_0_0 = lv_tileview_add_tile(TileView_xxxx, 0, 0, LV_DIR_ALL);
lv_obj_t * TileView_xxxx_tile_0_1 = lv_tileview_add_tile(TileView_xxxx, 1, 0, LV_DIR_ALL);
lv_obj_t * TileView_xxxx_tile_1_0 = lv_tileview_add_tile(TileView_xxxx, 0, 1, LV_DIR_ALL);
lv_obj_t * TileView_xxxx_tile_1_1 = lv_tileview_add_tile(TileView_xxxx, 1, 1, LV_DIR_ALL);

// Set the initial tile
lv_obj_set_tile_id(TileView_xxxx, 0, 0, LV_ANIM_OFF);

// Children are created on their tile
// children in tileChildMap["0-0"] → parent TileView_xxxx_tile_0_0
child_1 = lv_label_create(TileView_xxxx_tile_0_0);
// children in tileChildMap["1-0"] → parent TileView_xxxx_tile_1_0
child_2 = lv_btn_create(TileView_xxxx_tile_1_0);
```

How the generator assigns each child's parent (`ui.c.ts`):

```typescript
// build a child → tile variable name map
const childToTile: Record<string, string> = {};
for (const [tileKey, childIds] of Object.entries(tileChildMap)) {
  const [r, c] = tileKey.split('-');
  for (const childId of childIds) {
    childToTile[childId] = `${varName}_tile_${r}_${c}`;
  }
}
// unmapped children fall back to tile_0_0
const defaultTile = `${varName}_tile_0_0`;
for (const child of component.children) {
  const tileParent = childToTile[child.id] || defaultTile;
  generateComponentCode(child, tileParent, ...);
}
```

## 11. LVGL API mapping

### Creation (LVGL v9)

```c
lv_obj_t * lv_tileview_create(lv_obj_t * parent);
```

### Key APIs

| API | Description |
|-----|------|
| `lv_tileview_create(parent)` | Create the tileview |
| `lv_tileview_add_tile(tileview, col, row, dir)` | Add a tile, returning the tile object (`lv_obj_t *`). `col` is the column index, `row` the row index, `dir` the swipe directions allowed |
| `lv_obj_set_tile_id(tileview, col, row, anim)` | Set the visible tile by column/row index |
| `lv_obj_set_tile(tileview, tile_obj, anim)` | Set the visible tile by object |
| `lv_tileview_get_tile_active(tileview)` | Get the currently active tile object |

### lv_tileview_add_tile parameters

```c
lv_obj_t * lv_tileview_add_tile(
    lv_obj_t * tv,    // the tileview
    uint8_t col,       // column index (horizontal position)
    uint8_t row,       // row index (vertical position)
    lv_dir_t dir       // directions that can be swiped from this tile
);
```

`dir` controls which directions can be swiped from that tile:
- `LV_DIR_ALL` — every direction
- `LV_DIR_HOR` — horizontal only
- `LV_DIR_VER` — vertical only
- `LV_DIR_LEFT | LV_DIR_RIGHT` — a combination

### LVGL internal structure

```
tileview (lv_obj, a scrollable container)
├── tile_0_0 (lv_obj, at col=0, row=0)
├── tile_0_1 (lv_obj, at col=1, row=0)
├── tile_1_0 (lv_obj, at col=0, row=1)
└── tile_1_1 (lv_obj, at col=1, row=1)
```

A tileview is essentially a scrollable container in which each tile is a child the same size as the tileview, with snapping providing page-level swiping.

## 12. Design notes

1. **tileChildMap is central**: as with Tab View's tabChildMap, child mounting depends on it entirely. The store maintains it across `addComponent`, `reparentComponent` and `deleteComponents`.

2. **Coordinate key order**: tileChildMap keys are `"row-col"` (`"0-0"`, `"1-2"`) — **row first, column second**. The LVGL API `lv_tileview_add_tile(tv, col, row, dir)` takes them the other way round, **column first**. Generation has to swap them.

3. **Switching tiles while designing**: change the `currentRow` and `currentCol` properties to edit a different tile. Newly added children are assigned to whichever tile is current.

4. **Changing rows/cols**:
   - Adding a row or column: the new tiles start with empty tileChildMap entries
   - Removing one: the children on the removed tiles have to be moved or deleted

5. **Swipe direction**: generated code currently uses `LV_DIR_ALL` for every tile. Per-tile swipe directions would be a reasonable extension.

6. **Fallback goes to tile_0_0**: unmapped children fall back to the first tile (0-0), not to the current one. This differs from Tab View, which falls back to activeTab.

7. **Full-size tiles**: every tile is the same size as the tileview. LVGL switches between them with snap scrolling, and partially visible tiles are not supported.

8. **Performance**: all `rows × cols` tiles are created and consume memory. Watch memory and rendering cost on a large grid (5×5 = 25 tiles, for example).

9. **Compared with Tab View**:
   - Tab View: one-dimensional switching (a tab index), driven by clicking the tab bar
   - Tile View: two-dimensional switching (row, col), driven by swipe gestures
   - The childMap mechanism is the same in both; only the key format differs
