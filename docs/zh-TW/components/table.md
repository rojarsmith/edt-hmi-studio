# Table (table) — 表格元件設計文件

<p align="center">
  <a href="../../components/table.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Table（表格）以行列格狀呈現結構化的文字資料。它支援自訂行列數、儲存格內容、欄寬、表頭列與各儲存格的對齊方式。在嵌入式 UI 中常用於參數清單、裝置資訊呈現、設定項目管理、日誌記錄等情境。

## 2. 元件類型識別碼

```
type: 'table'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| display | 顯示 | 📋 |

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 150 |

## 5. 是否為容器

```
isContainer: false
```

Table 是純顯示元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- `obj`（Container）
- `btn`（Button）
- `tabview`（Tab View，放在某個分頁內）
- `tileview`（Tile View，放在某個圖磚內）
- `win`（Window，放在 content 區域內）
- 畫面根節點（Screen）

### 可以包含的子元件

無。`isContainer: false`，不接受任何子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| `rows` | `number` | `3` | 列數（含表頭列） |
| `cols` | `number` | `3` | 欄數 |
| `cellData` | `string[][]` | `[['','',''],['','',''],['','','']]` | 二維陣列，`cellData[row][col]` 為儲存格文字 |
| `columnWidths` | `number[]` | `[60, 60, 60]` | 每欄寬度（px），陣列長度應與 `cols` 一致 |
| `headerRow` | `boolean` | `true` | 是否將第一列作為表頭（視覺上加粗、灰色背景） |
| `cellAligns` | `string[][]` | `[['left','left','left'],...]` | 二維陣列，各儲存格的對齊方式：`'left'` / `'center'` / `'right'` |

### 屬性限制

- `cellData` 的維度應與 `rows × cols` 一致，不足處補空字串
- `columnWidths` 長度應與 `cols` 一致，不足處使用預設寬度 60
- `cellAligns` 維度應與 `rows × cols` 一致，不足處預設為 `'left'`
- 修改 `rows` 或 `cols` 時，編輯器應自動擴充或裁剪 `cellData`、`columnWidths`、`cellAligns`

## 8. 樣式設計（styles）

### 預設樣式（default 狀態）— card style，無圓角

| 樣式屬性 | 預設值 | 說明 |
|----------|--------|------|
| `bgColor` | `#ffffff` | 白色背景（card style） |
| `borderColor` | `#E0E0E0` | 灰色邊框（color_grey） |
| `borderWidth` | `2` | 邊框寬度 |
| `borderRadius` | `0` | 無圓角（表格通常為直角） |
| `textColor` | `#212121` | 儲存格文字顏色 |
| `opacity` | `1` | 完全不透明 |
| `padding` | `0` | 無外層內距（儲存格自帶內距） |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，一律套用 |
| `pressed` | 按下狀態（儲存格被點擊時） |
| `focused` | 取得焦點狀態 |
| `disabled` | 停用狀態 |

### 表頭列樣式

當 `headerRow: true` 時，第一列會以不同樣式繪製：
- 背景色：`#f0f0f0`（淺灰）
- 文字加粗：`fontWeight: 600`

這些在編輯器畫布與預覽中是寫死的。在 LVGL 端，對應的效果需透過 `LV_TABLE_CELL_CTRL_MERGE_RIGHT` 等儲存格控制旗標與自訂樣式達成。

## 9. 事件支援

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件（可取得被點擊儲存格的列與欄） |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | 值改變事件（選取的儲存格改變時） |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

### 儲存格點擊

LVGL table 可透過 `lv_table_get_selected_cell(table, &row, &col)` 取得被點擊儲存格的座標，可在事件回呼中使用。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

```tsx
<div className="lvgl-table" style={{
  width: '100%', height: '100%',
  display: 'grid',
  gridTemplateColumns: `repeat(${props.cols || 3}, 1fr)`,
  gridTemplateRows: `repeat(${props.rows || 3}, 1fr)`,
  gap: '1px',
  backgroundColor: '#ccc',  // 格線顏色
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

重點：
- 以 CSS Grid 模擬表格
- `gap: '1px'` 搭配灰色背景模擬格線
- 表頭列使用淺灰背景與加粗字體
- 儲存格內容取自 `cellData`，空值以序號作為佔位

### 簡易預覽繪製（PreviewPanel.tsx — Canvas 2D）

```typescript
function drawTable(ctx, x, y, w, h, opts) {
  // 白色背景
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = opts.borderColor;
  ctx.strokeRect(x, y, w, h);

  const cellW = w / opts.cols;
  const cellH = h / opts.rows;

  // 格線
  for (let r = 1; r < opts.rows; r++) { /* 水平線 */ }
  for (let c = 1; c < opts.cols; c++) { /* 垂直線 */ }

  // 表頭列背景
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 1, y + 1, w - 2, cellH - 1);

  // 儲存格文字
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

重點：
- 以等分方式繪製行列格線
- 表頭列填入淺灰背景
- 儲存格文字置中顯示
- 預覽中使用佔位文字（`Col N` / `r,c`）

### LVGL WASM 預覽繪製

**editorStateToJson.ts**：props（rows、cols、cellData、columnWidths、headerRow、cellAligns）完整序列化。

**ui_from_json.c**：

```c
static lv_obj_t *create_table(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *tbl = lv_table_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int rows = cjson_get_int(props, "rows", 3);
        int cols = cjson_get_int(props, "cols", 3);
        lv_table_set_row_count(tbl, rows);
        lv_table_set_column_count(tbl, cols);
        // 填入表頭佔位文字
        for (int c = 0; c < cols; c++) {
            char hdr[32];
            snprintf(hdr, sizeof(hdr), "Col %d", c + 1);
            lv_table_set_cell_value(tbl, 0, c, hdr);
        }
    }
    return tbl;
}
```

重點：
- 以 `lv_table_create` 建立真正的 LVGL table
- 設定行列數
- 目前 WASM 實作只寫入表頭佔位文字，尚未解析 `cellData`（可再擴充）

### 程式碼生成輸出（ui.c.ts）

```c
// 建立
lv_obj_t *table_1 = lv_table_create(parent);
lv_obj_set_pos(table_1, 10, 10);
lv_obj_set_size(table_1, 200, 150);

// 樣式（card style，直角）
lv_obj_set_style_bg_color(table_1, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_bg_opa(table_1, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(table_1, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(table_1, 2, 0);
lv_obj_set_style_radius(table_1, 0, 0);

// 行列數
lv_table_set_row_cnt(table_1, 3);
lv_table_set_col_cnt(table_1, 3);

// 欄寬
lv_table_set_col_width(table_1, 0, 60);
lv_table_set_col_width(table_1, 1, 60);
lv_table_set_col_width(table_1, 2, 60);

// 儲存格資料（僅非空的儲存格）
lv_table_set_cell_value(table_1, 0, 0, "Name");
lv_table_set_cell_value(table_1, 0, 1, "Value");
lv_table_set_cell_value(table_1, 1, 0, "Temp");
lv_table_set_cell_value(table_1, 1, 1, "25°C");
```

重點：
- 生成器輸出的是 `lv_table_set_row_cnt` 與 `lv_table_set_col_cnt`，沒有版本分支 —— v8 與 v9 都用同樣的名稱
- 欄寬逐欄設定
- 只為非空的儲存格產生 `lv_table_set_cell_value` 呼叫
- 空字串的儲存格會被略過，減少生成的程式碼量

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_table_create(parent)` |

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_table_set_row_cnt(table, cnt)` | 設定列數 —— 生成器輸出的名稱 |
| `lv_table_set_col_cnt(table, cnt)` | 設定欄數 —— 生成器輸出的名稱 |
| `lv_table_set_row_count(table, cnt)` | 設定列數 —— WASM 預覽使用的名稱 |
| `lv_table_set_column_count(table, cnt)` | 設定欄數 —— WASM 預覽使用的名稱 |
| `lv_table_set_cell_value(table, row, col, text)` | 設定儲存格文字 |
| `lv_table_set_col_width(table, col, width)` | 設定欄寬 |
| `lv_table_get_selected_cell(table, &row, &col)` | 取得選取儲存格的座標 |
| `lv_table_get_cell_value(table, row, col)` | 取得儲存格文字 |
| `lv_table_set_cell_value_fmt(table, row, col, fmt, ...)` | 以格式化方式設定儲存格文字 |
| `lv_table_add_cell_ctrl(table, row, col, ctrl)` | 加入儲存格控制旗標 |

### 儲存格控制旗標

| 旗標 | 說明 |
|------|------|
| `LV_TABLE_CELL_CTRL_MERGE_RIGHT` | 與右側儲存格合併 |
| `LV_TABLE_CELL_CTRL_TEXT_CROP` | 裁切文字（不換行） |
| `LV_TABLE_CELL_CTRL_CUSTOM_1` ～ `4` | 自訂旗標 |

### LVGL Parts

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 表格背景 |
| `LV_PART_ITEMS` | 儲存格 |

### 預設主題樣式（lv_theme_default）

- **MAIN part**：card style — `bg_color=#FFFFFF, border_color=#E0E0E0, border_width=2, radius=0, pad=0`
- **ITEMS part**：`border_color=color_grey, border_width=1, border_side=BOTTOM|RIGHT, text_color=color_text`

## 12. 設計注意事項

1. **borderRadius = 0**：表格預設無圓角，與其他 card style 元件（圓角 8）不同。格線在圓角處會產生視覺問題，LVGL 預設主題同樣把 table 的 radius 設為 0。

2. **cellData 的動態維護**：當使用者在屬性面板修改 `rows` 或 `cols` 時，store 應同步調整 `cellData`、`columnWidths`、`cellAligns` 的維度 —— 增加時補空值，減少時從尾端裁剪。

3. **表頭列並非原生概念**：
   - 編輯器畫布／預覽：以 CSS／Canvas 樣式區分（灰色背景加粗體）
   - LVGL：沒有原生的「表頭」概念，需以 `lv_table_add_cell_ctrl` 或自訂樣式實作
   - 程式碼生成：目前不會產生表頭樣式，需在自訂程式碼中處理

4. **欄寬與總寬度**：`columnWidths` 的總和不一定等於元件寬度。LVGL 會依設定的欄寬繪製，超出部分可捲動。屬性面板可提供「平均分配」按鈕。

5. **儲存格對齊**：`cellAligns` 在程式碼生成中尚未實作。LVGL 的儲存格對齊需在文字前加入控制字元，或使用 `lv_table_add_cell_ctrl`。

6. **大量資料**：LVGL table 不支援虛擬捲動，所有儲存格都會被建立。列數過多（超過約 50）可能造成記憶體與繪製效能問題，屬性面板可提示列數上限。

7. **擴充 WASM 預覽**：目前 `ui_from_json.c` 未解析 `cellData` 與 `columnWidths`。要完整還原編輯器的設計，需在 C 端走訪 `cellData` 二維 JSON 陣列並呼叫 `lv_table_set_cell_value`，以及走訪 `columnWidths` 呼叫 `lv_table_set_col_width`。

8. **API 命名**：LVGL v8 與 v9 對這幾個函式的命名不同（`set_row_cnt` 與 `set_row_count`）。生成器與 WASM 預覽目前用的是不同名稱，兩者都沒有依版本分支 —— 值得對照實際使用的 LVGL 版本確認一次。
