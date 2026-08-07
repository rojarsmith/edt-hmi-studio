# Tile View (tileview) — 圖磚檢視容器元件

<p align="center">
  <a href="../../components/tileview.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Tile View 是編輯器中的圖磚檢視容器元件，對應 LVGL 的 `lv_tileview`。它提供一個二維格狀版面，每個格子（tile）都是獨立的全尺寸內容區域，使用者可透過滑動手勢在 tile 之間切換。適用於智慧手錶介面、多畫面儀表板、滑動導覽頁面等情境。

Tile View 的子元件掛載機制與 Tab View 類似，透過 `tileChildMap` 將子元件對應到不同的 tile，但改用二維座標（row-col）作為 key。

## 2. 元件類型識別碼

```
type: 'tileview'
```

## 3. 所屬分類

```
category: 'container'  // 容器分類，圖示：📁
```

在元件面板中顯示名稱為 **Tile View**，圖示為 🔲。

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 200 |

## 5. 是否為容器

```
isContainer: true
```

Tile View 是容器元件，子元件透過 tileChildMap 分配到各個 tile。

## 6. 父子關係設計

### 可以作為以下元件的子項

- 可直接作為 **Screen（頁面根節點）** 的子項
- 可作為任何 `isContainer=true` 元件的子項，包括：
  - Container (obj)
  - Button (btn)
  - Tab View (tabview) — 掛載到對應的 tab page
  - 另一個 Tile View（巢狀，不建議）
  - Window (win) — 掛載到 content 區域

### 可以包含的子元件

Tile View 可以包含**所有類型**的元件。子元件在邏輯上屬於某個 tile，由 `tileChildMap` 記錄對應關係。

### 子元件掛載機制（核心設計）

Tile View 採用 **tileChildMap 對應機制**，設計思路與 Tab View 的 tabChildMap 一致，但以二維座標作為 key：

```
子元件 → tileChildMap 對應 → 對應的 tile (row-col)
```

#### tileChildMap 資料結構

```typescript
tileChildMap: Record<string, string[]>
// key："row-col" 格式的字串（如 "0-0"、"0-1"、"1-0"、"1-1"）
// value：子元件 ID 陣列
```

以 2×2 格狀為例：

```typescript
{
  tileChildMap: {
    "0-0": ["comp_id_1", "comp_id_2"],  // 第 0 列第 0 欄的子元件
    "0-1": ["comp_id_3"],                // 第 0 列第 1 欄的子元件
    "1-0": [],                            // 第 1 列第 0 欄沒有子元件
    "1-1": ["comp_id_4"]                 // 第 1 列第 1 欄的子元件
  }
}
```

#### 掛載流程

1. **加入子元件時**（`addComponent`）：
   - 新元件加入 tileview 的 `children[]` 陣列
   - Store 自動把新元件 ID 加進 `tileChildMap[currentRow-currentCol]`
   - 也就是說，新元件預設落在目前顯示的 tile

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

2. **重新掛載時**（`reparentComponent`）：
   - 從舊 parent 的 tileChildMap 所有 tile 中移除對應
   - 若新 parent 是 tileview，則加入其 `tileChildMap[currentRow-currentCol]`

   ```typescript
   // editorStore.ts - reparentComponent
   // 移除舊對應
   if (oldParent?.type === 'tileview') {
     const tileChildMap = { ...(oldParent.props?.tileChildMap || {}) };
     for (const key of Object.keys(tileChildMap)) {
       tileChildMap[key] = tileChildMap[key].filter(cid => cid !== id);
     }
     get().updateComponent(comp.parentId, { props: { ...oldParent.props, tileChildMap } });
   }
   // 加入新對應
   if (newParent?.type === 'tileview') {
     const tileChildMap = { ...(newParent.props?.tileChildMap || {}) };
     const key = `${newParent.props?.currentRow || 0}-${newParent.props?.currentCol || 0}`;
     if (!tileChildMap[key]) tileChildMap[key] = [];
     tileChildMap[key] = [...tileChildMap[key], id];
     get().updateComponent(newParentId, { props: { ...newParent.props, tileChildMap } });
   }
   ```

3. **刪除子元件時**（`deleteComponents`）：
   - 從 parent 的 `tileChildMap` 所有 tile 中清除被刪除的元件 ID

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

4. **Fallback 機制**：未登記在 `tileChildMap` 中的子元件，預設 fallback 到 `tile_0_0`（第 0 列第 0 欄）。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| rows | `number` | `2` | 列數，決定垂直方向的 tile 數量 |
| cols | `number` | `2` | 欄數，決定水平方向的 tile 數量 |
| currentRow | `number` | `0` | 目前顯示的 tile 列索引（從 0 開始） |
| currentCol | `number` | `0` | 目前顯示的 tile 欄索引（從 0 開始） |
| tileChildMap | `Record<string, string[]>` | `{}` | tile 與子元件的對應關係；key 為 "row-col" 格式，value 為子元件 ID 陣列 |

### rows／cols 屬性說明

- `rows × cols` 決定 tile 總數（例如 2×2 = 4 個 tile）
- 修改 rows／cols 時需同步更新 `tileChildMap`，清除超出範圍的項目
- 每個 tile 的尺寸等同於 tileview 本身（全尺寸 tile）

### tileChildMap 屬性說明

- key 格式為 `"row-col"`，如 `"0-0"`、`"0-1"`、`"1-0"`、`"1-1"`
- 由 Store 層自動維護，使用者一般不需要手動編輯
- 未對應的子元件會 fallback 到 `tile_0_0`

### currentRow／currentCol 屬性說明

- 決定編輯器目前顯示哪一個 tile 的內容
- 設計時透過切換 currentRow／currentCol 來編輯不同 tile 的子元件
- 執行時對應 `lv_obj_set_tile_id()` 設定的初始位置

## 8. 樣式設計（styles）

### 預設樣式狀態（default）

Tile View 採用 LVGL 預設主題的 **screen 樣式**：

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| bgColor | `string` | `'#F5F5F5'` | 背景色，淺灰（LVGL color_scr） |
| borderColor | `string` | `'transparent'` | 無邊框 |
| borderWidth | `number` | `0` | 邊框寬度為 0 |
| borderRadius | `number` | `0` | 無圓角 |
| textColor | `string` | `'#212121'` | 文字顏色 |
| opacity | `number` | `1` | 完全不透明 |
| padding | `number` | `0` | 無內距 |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，必須存在 |
| `pressed` | 按下狀態（選用） |
| `focused` | 取得焦點狀態（選用） |
| `disabled` | 停用狀態（選用） |

注意：這些樣式作用於整體容器。各個 tile 由 LVGL 內部管理，編輯器目前不另外開放其樣式。

## 9. 事件支援

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | **切換 tile 時觸發**，是這裡最常用的事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |
| `LV_EVENT_READY` | 就緒事件 |
| `LV_EVENT_CANCEL` | 取消事件 |

`LV_EVENT_VALUE_CHANGED` 是 Tile View 最重要的事件，在使用者滑動切換 tile 時觸發。

## 10. UI 層設計

### 編輯器畫布繪製

在畫布中，Tile View 繪製為：

```
┌─────────────────────────────┐
│                             │
│  目前 tile（currentRow,     │
│  currentCol）的子元件        │
│                             │
│  [0,0] [0,1]               │  ← tile 導覽指示器（選用）
│  [1,0] [1,1]               │
└─────────────────────────────┘
```

- 只顯示目前 `currentRow`-`currentCol` 對應 tile 的子元件
- 子元件的可見性由 `tileChildMap[currentRow-currentCol]` 決定
- 設計時可透過修改 currentRow／currentCol 切換要編輯的 tile
- 不屬於目前 tile 的子元件在畫布中會隱藏

### 簡易預覽繪製

與畫布繪製類似，但移除編輯互動。顯示目前 tile 的子元件，並可切換 tile。

### LVGL WASM 預覽繪製

在 `editorStateToJson.ts` 中，子元件透過虛擬 ID 對應到 tile：

```typescript
// 虛擬 parent ID 格式：{tileview_id}__tile__{row-col}
// 例如："abc123__tile__0-0"、"abc123__tile__0-1"、"abc123__tile__1-0"

childToVirtualParent[childId] = `${parentComp.id}__tile__${tileKey}`;
```

序列化後的 JSON 中，子元件的 `parent` 欄位指向虛擬 ID：

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

在 WASM 端（`ui_from_json.c`）：
1. 建立 tileview：`lv_tileview_create(parent)`
2. 加入 tile：`lv_tileview_add_tile(tileview, col, row, LV_DIR_ALL)` 回傳 tile 物件
3. 將 tile 以虛擬 ID（`id__tile__R-C`）註冊到 `id_map`
4. 建立子元件時，透過虛擬 ID 在 `id_map` 中找到對應的 tile 作為 parent

### 程式碼生成輸出

`ui.c.ts` 產生的 C 程式碼：

```c
// Create tileview: TileView_xxxx
TileView_xxxx = lv_tileview_create(parent);
lv_obj_set_pos(TileView_xxxx, 0, 0);
lv_obj_set_size(TileView_xxxx, 200, 200);

// 加入所有 tile（走訪 rows × cols）
lv_obj_t * TileView_xxxx_tile_0_0 = lv_tileview_add_tile(TileView_xxxx, 0, 0, LV_DIR_ALL);
lv_obj_t * TileView_xxxx_tile_0_1 = lv_tileview_add_tile(TileView_xxxx, 1, 0, LV_DIR_ALL);
lv_obj_t * TileView_xxxx_tile_1_0 = lv_tileview_add_tile(TileView_xxxx, 0, 1, LV_DIR_ALL);
lv_obj_t * TileView_xxxx_tile_1_1 = lv_tileview_add_tile(TileView_xxxx, 1, 1, LV_DIR_ALL);

// 設定初始的 tile 位置
lv_obj_set_tile_id(TileView_xxxx, 0, 0, LV_ANIM_OFF);

// 子元件建立在對應的 tile 上
// tileChildMap["0-0"] 中的子元件 → parent 為 TileView_xxxx_tile_0_0
child_1 = lv_label_create(TileView_xxxx_tile_0_0);
// tileChildMap["1-0"] 中的子元件 → parent 為 TileView_xxxx_tile_1_0
child_2 = lv_btn_create(TileView_xxxx_tile_1_0);
```

生成器分配子元件 parent 的邏輯（`ui.c.ts`）：

```typescript
// 建立 child → tile 變數名稱的對應
const childToTile: Record<string, string> = {};
for (const [tileKey, childIds] of Object.entries(tileChildMap)) {
  const [r, c] = tileKey.split('-');
  for (const childId of childIds) {
    childToTile[childId] = `${varName}_tile_${r}_${c}`;
  }
}
// 未對應的 fallback 到 tile_0_0
const defaultTile = `${varName}_tile_0_0`;
for (const child of component.children) {
  const tileParent = childToTile[child.id] || defaultTile;
  generateComponentCode(child, tileParent, ...);
}
```

## 11. LVGL API 對應

### 建立函式（LVGL v9）

```c
lv_obj_t * lv_tileview_create(lv_obj_t * parent);
```

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_tileview_create(parent)` | 建立 tileview |
| `lv_tileview_add_tile(tileview, col, row, dir)` | 加入一個 tile，回傳該 tile 物件（`lv_obj_t *`）。`col` 為欄索引，`row` 為列索引，`dir` 為允許的滑動方向 |
| `lv_obj_set_tile_id(tileview, col, row, anim)` | 以欄／列索引設定目前顯示的 tile |
| `lv_obj_set_tile(tileview, tile_obj, anim)` | 以 tile 物件設定目前顯示的 tile |
| `lv_tileview_get_tile_active(tileview)` | 取得目前作用中的 tile 物件 |

### lv_tileview_add_tile 參數說明

```c
lv_obj_t * lv_tileview_add_tile(
    lv_obj_t * tv,    // tileview 物件
    uint8_t col,       // 欄索引（水平位置）
    uint8_t row,       // 列索引（垂直位置）
    lv_dir_t dir       // 允許從此 tile 滑出的方向
);
```

`dir` 控制可從該 tile 滑往哪些方向：
- `LV_DIR_ALL` — 所有方向
- `LV_DIR_HOR` — 僅水平
- `LV_DIR_VER` — 僅垂直
- `LV_DIR_LEFT | LV_DIR_RIGHT` — 組合方向

### LVGL 內部結構

```
tileview (lv_obj，可捲動容器)
├── tile_0_0 (lv_obj，位於 col=0, row=0)
├── tile_0_1 (lv_obj，位於 col=1, row=0)
├── tile_1_0 (lv_obj，位於 col=0, row=1)
└── tile_1_1 (lv_obj，位於 col=1, row=1)
```

Tileview 本質上是一個可捲動的容器，每個 tile 是與 tileview 同尺寸的子物件，透過 snap 機制達成頁面級的滑動切換。

## 12. 設計注意事項

1. **tileChildMap 是核心**：與 Tab View 的 tabChildMap 相同，Tile View 的子元件掛載完全依賴它。Store 層在 `addComponent`、`reparentComponent`、`deleteComponents` 三個操作中自動維護。

2. **二維座標 key 的順序**：tileChildMap 的 key 格式為 `"row-col"`（如 `"0-0"`、`"1-2"`），是**列在前、欄在後**；而 LVGL API `lv_tileview_add_tile(tv, col, row, dir)` 的參數順序是**欄在前、列在後**，生成程式碼時必須轉換。

3. **設計時切換 tile**：在編輯器中透過修改 `currentRow` 與 `currentCol` 屬性切換目前編輯的 tile，新加入的子元件會自動歸屬到目前的 tile。

4. **修改 rows／cols**：
   - 增加列／欄：新 tile 的 tileChildMap 項目為空
   - 減少列／欄：需處理被移除 tile 上的子元件（遷移或刪除）

5. **滑動方向**：目前生成的程式碼中，所有 tile 的滑動方向一律為 `LV_DIR_ALL`。未來可考慮為每個 tile 單獨設定允許的滑動方向。

6. **Fallback 到 tile_0_0**：未對應的子元件會 fallback 到第一個 tile（0-0），而非目前的 tile。這與 Tab View fallback 到 activeTab 的行為不同。

7. **全尺寸 tile**：每個 tile 的尺寸等同於 tileview。LVGL 透過 snap 捲動實現切換效果，不支援部分可見的 tile。

8. **效能考量**：`rows × cols` 個 tile 都會被建立並佔用記憶體。大型格狀（例如 5×5 = 25 個 tile）需留意記憶體與繪製效能。

9. **與 Tab View 的對比**：
   - Tab View：一維切換（tab 索引），透過點擊標籤列切換
   - Tile View：二維切換（row, col），透過滑動手勢切換
   - 兩者的 childMap 機制設計一致，只有 key 格式不同
