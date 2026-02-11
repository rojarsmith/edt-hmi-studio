# Table (table) — Widget Design Document

## 1. Name and summary

Table presents structured data as a grid of rows and columns of text. It supports a configurable row and column count, cell contents, column widths, a header row and per-cell alignment. In embedded UIs it is commonly used for parameter lists, device information, configuration entries and log output.

## 2. Type identifier

```
type: 'table'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| display | Display | 📋 |

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 150 |

## 5. Container?

```
isContainer: false
```

Table is a pure display widget and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- `obj` (Container)
- `btn` (Button)
- `tabview` (Tab View — inside one of the tab pages)
- `tileview` (Tile View — inside one of the tiles)
- `win` (Window — inside the content area)
- The screen root

### Can contain

Nothing. With `isContainer: false` it accepts no children.

## 7. Properties (props)

| Name | Type | Default | Description |
|--------|------|--------|------|
| `rows` | `number` | `3` | Row count (including the header row) |
| `cols` | `number` | `3` | Column count |
| `cellData` | `string[][]` | `[['','',''],['','',''],['','','']]` | A 2D array where `cellData[row][col]` is the cell text |
| `columnWidths` | `number[]` | `[60, 60, 60]` | Width of each column in px; the array length should match `cols` |
| `headerRow` | `boolean` | `true` | Whether the first row is a header (bold, with a grey background) |
| `cellAligns` | `string[][]` | `[['left','left','left'],...]` | A 2D array of per-cell alignment: `'left'` / `'center'` / `'right'` |

### Constraints

- `cellData` should match `rows × cols`; missing entries are filled with empty strings
- `columnWidths` should be as long as `cols`; missing entries use the default width of 60
- `cellAligns` should match `rows × cols`; missing entries default to `'left'`
- When `rows` or `cols` changes, the editor should grow or trim `cellData`, `columnWidths` and `cellAligns` to match

## 8. Styles

### Default style (default state) — card style, without rounded corners

| Style property | Default | Description |
|----------|--------|------|
| `bgColor` | `#ffffff` | White background (card style) |
| `borderColor` | `#E0E0E0` | Grey border (color_grey) |
| `borderWidth` | `2` | Border width |
| `borderRadius` | `0` | No corner radius (tables are normally square-cornered) |
| `textColor` | `#212121` | Cell text colour |
| `opacity` | `1` | Fully opaque |
| `padding` | `0` | No outer padding (cells carry their own) |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always applied |
| `pressed` | Pressed (when a cell is clicked) |
| `focused` | Focused |
| `disabled` | Disabled |

### Header row styling

When `headerRow: true`, the first row is drawn with a distinct style:
- Background: `#f0f0f0` (light grey)
- Bold text: `fontWeight: 600`

These are hard-coded in the editor canvas and the preview. On the LVGL side the equivalent is achieved with cell control flags such as `LV_TABLE_CELL_CTRL_MERGE_RIGHT` and custom styling.

## 9. Supported events

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click (the clicked cell's row and column can be read) |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | Value changed (when the selected cell changes) |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

### Cell clicks

An LVGL table exposes the clicked cell through `lv_table_get_selected_cell(table, &row, &col)`, which can be called from the event callback.

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

```tsx
<div className="lvgl-table" style={{
  width: '100%', height: '100%',
  display: 'grid',
  gridTemplateColumns: `repeat(${props.cols || 3}, 1fr)`,
  gridTemplateRows: `repeat(${props.rows || 3}, 1fr)`,
  gap: '1px',
  backgroundColor: '#ccc',  // the grid line colour
  border: '1px solid #ccc',
  borderRadius: defaultStyle.borderRadius || 4,
  overflow: 'hidden',
}}>
  {Array.from({ length: (props.rows || 3) * (props.cols || 3) }).map((_, i) => {
    const row = Math.floor(i / (props.cols || 3));
    const col = i % (props.cols || 3);
    const isHeader = row === 0 && props.headerRow !== false;
    return (
      <div key={i} style={{
        backgroundColor: isHeader ? '#f0f0f0' : '#fff',
        padding: '4px',
        fontSize: '10px',
        fontWeight: isHeader ? 600 : 400,
        color: '#333',
      }}>
        {props.cellData?.[row]?.[col] || (i + 1)}
      </div>
    );
  })}
</div>
```

Key points:
- Simulates the table with CSS Grid
- `gap: '1px'` over a grey background stands in for the grid lines
- The header row gets a light grey background and bold text
- Cell text comes from `cellData`; an empty cell shows its index as a placeholder

### Simple preview (PreviewPanel.tsx — Canvas 2D)

```typescript
function drawTable(ctx, x, y, w, h, opts) {
  // white background
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = opts.borderColor;
  ctx.strokeRect(x, y, w, h);

  const cellW = w / opts.cols;
  const cellH = h / opts.rows;

  // grid lines
  for (let r = 1; r < opts.rows; r++) { /* horizontal */ }
  for (let c = 1; c < opts.cols; c++) { /* vertical */ }

  // header row background
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 1, y + 1, w - 2, cellH - 1);

  // cell text
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const label = r === 0 ? `Col ${c + 1}` : `${r},${c}`;
      ctx.fillText(label, x + cellW * c + cellW / 2, y + cellH * r + cellH / 2);
    }
  }
}
```

Key points:
- Draws an evenly divided grid
- Fills the header row with a light grey background
- Centres the cell text
- Uses placeholder text (`Col N` / `r,c`) in the preview

### LVGL WASM preview

**editorStateToJson.ts**: the props (rows, cols, cellData, columnWidths, headerRow, cellAligns) are serialised in full.

**ui_from_json.c**:

```c
static lv_obj_t *create_table(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *tbl = lv_table_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int rows = cjson_get_int(props, "rows", 3);
        int cols = cjson_get_int(props, "cols", 3);
        lv_table_set_row_count(tbl, rows);
        lv_table_set_column_count(tbl, cols);
        // fill in placeholder headers
        for (int c = 0; c < cols; c++) {
            char hdr[32];
            snprintf(hdr, sizeof(hdr), "Col %d", c + 1);
            lv_table_set_cell_value(tbl, 0, c, hdr);
        }
    }
    return tbl;
}
```

Key points:
- Creates a real LVGL table with `lv_table_create`
- Sets the row and column counts
- The current WASM implementation only writes placeholder header text and does not parse `cellData` — this could be extended

### Generated code (ui.c.ts)

```c
// Create
lv_obj_t *table_1 = lv_table_create(parent);
lv_obj_set_pos(table_1, 10, 10);
lv_obj_set_size(table_1, 200, 150);

// Styles (card style, square corners)
lv_obj_set_style_bg_color(table_1, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_bg_opa(table_1, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(table_1, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(table_1, 2, 0);
lv_obj_set_style_radius(table_1, 0, 0);

// Row and column counts
lv_table_set_row_cnt(table_1, 3);
lv_table_set_col_cnt(table_1, 3);

// Column widths
lv_table_set_col_width(table_1, 0, 60);
lv_table_set_col_width(table_1, 1, 60);
lv_table_set_col_width(table_1, 2, 60);

// Cell data (non-empty cells only)
lv_table_set_cell_value(table_1, 0, 0, "Name");
lv_table_set_cell_value(table_1, 0, 1, "Value");
lv_table_set_cell_value(table_1, 1, 0, "Temp");
lv_table_set_cell_value(table_1, 1, 1, "25°C");
```

Key points:
- Generation emits `lv_table_set_row_cnt` and `lv_table_set_col_cnt` with no version branch — the same names for both v8 and v9
- Column widths are set one column at a time
- `lv_table_set_cell_value` is emitted only for non-empty cells
- Empty cells are skipped, which keeps the generated code smaller

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_table_create(parent)` |

### Key APIs

| API | Description |
|-----|------|
| `lv_table_set_row_cnt(table, cnt)` | Set the row count — the name the generator emits |
| `lv_table_set_col_cnt(table, cnt)` | Set the column count — the name the generator emits |
| `lv_table_set_row_count(table, cnt)` | Set the row count — the name used by the WASM preview |
| `lv_table_set_column_count(table, cnt)` | Set the column count — the name used by the WASM preview |
| `lv_table_set_cell_value(table, row, col, text)` | Set a cell's text |
| `lv_table_set_col_width(table, col, width)` | Set a column's width |
| `lv_table_get_selected_cell(table, &row, &col)` | Read the selected cell's coordinates |
| `lv_table_get_cell_value(table, row, col)` | Read a cell's text |
| `lv_table_set_cell_value_fmt(table, row, col, fmt, ...)` | Set a cell's text with formatting |
| `lv_table_add_cell_ctrl(table, row, col, ctrl)` | Add a cell control flag |

### Cell control flags

| Flag | Description |
|------|------|
| `LV_TABLE_CELL_CTRL_MERGE_RIGHT` | Merge with the cell to the right |
| `LV_TABLE_CELL_CTRL_TEXT_CROP` | Crop the text instead of wrapping |
| `LV_TABLE_CELL_CTRL_CUSTOM_1` – `4` | Custom flags |

### LVGL parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The table background |
| `LV_PART_ITEMS` | The cells |

### Default theme styling (lv_theme_default)

- **MAIN part**: card style — `bg_color=#FFFFFF, border_color=#E0E0E0, border_width=2, radius=0, pad=0`
- **ITEMS part**: `border_color=color_grey, border_width=1, border_side=BOTTOM|RIGHT, text_color=color_text`

## 12. Design notes

1. **borderRadius = 0**: a table has no corner radius by default, unlike the other card-style widgets (which use 8). Grid lines look wrong against rounded corners, and LVGL's own default theme also sets a table's radius to 0.

2. **Keeping cellData in sync**: when the user changes `rows` or `cols` in the property panel, the store should resize `cellData`, `columnWidths` and `cellAligns` accordingly — padding with empty values when growing, trimming from the end when shrinking.

3. **The header row is not a real concept**:
   - Editor canvas and preview: distinguished with CSS/Canvas styling (grey background, bold)
   - LVGL: there is no native "header" idea; it has to be built with `lv_table_add_cell_ctrl` or custom styling
   - Code generation: no header styling is emitted, so handle it in custom code

4. **Column widths versus total width**: the sum of `columnWidths` need not equal the widget width. LVGL renders the columns at their configured widths and scrolls the overflow. A "distribute evenly" button in the property panel would help.

5. **Cell alignment**: `cellAligns` is not yet implemented in code generation. LVGL cell alignment needs either control characters prefixed to the text or `lv_table_add_cell_ctrl`.

6. **Large tables**: LVGL's table has no virtual scrolling — every cell is created. Many rows (over about 50) can cause memory and rendering problems. The property panel could warn about the row count.

7. **Extending the WASM preview**: `ui_from_json.c` does not parse `cellData` or `columnWidths`. To reproduce the design exactly, extend the C side to walk the `cellData` 2D JSON array calling `lv_table_set_cell_value`, and `columnWidths` calling `lv_table_set_col_width`.

8. **API naming**: LVGL v8 and v9 name these functions differently (`set_row_cnt` versus `set_row_count`). The generator and the WASM preview currently use different names, and neither branches on the version — worth confirming against the LVGL version being targeted.
