# Tab View (tabview) — 分頁檢視容器元件

<p align="center">
  <a href="../../components/tabview.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Tab View 是編輯器中的分頁檢視容器元件，對應 LVGL 的 `lv_tabview`。它提供一組可切換的分頁（tab），每個分頁是獨立的內容區域，使用者可透過點擊標籤列切換顯示不同內容。適用於設定頁面、多功能面板、分步精靈等情境。

Tab View 是容器元件中子元件掛載機制最複雜的之一：子元件是透過 `tabChildMap` 對應到各個 tab page，而不是直接掛在 tabview 自身上。

## 2. 元件類型識別碼

```
type: 'tabview'
```

## 3. 所屬分類

```
category: 'container'  // 容器分類，圖示：📁
```

在元件面板中顯示名稱為 **Tab View**，圖示為 📑。

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 250 |
| defaultHeight | 200 |

## 5. 是否為容器

```
isContainer: true
```

Tab View 是容器元件，子元件透過 tabChildMap 分配到各個 tab page。

## 6. 父子關係設計

### 可以作為以下元件的子項

- 可直接作為 **Screen（頁面根節點）** 的子項
- 可作為任何 `isContainer=true` 元件的子項，包括：
  - Container (obj)
  - Button (btn)
  - 另一個 Tab View（巢狀，不建議）
  - Tile View (tileview) — 掛載到對應的圖磚
  - Window (win) — 掛載到 content 區域

### 可以包含的子元件

Tab View 可以包含**所有類型**的元件。子元件在邏輯上屬於某個 tab page，由 `tabChildMap` 記錄對應關係。

### 子元件掛載機制（核心設計）

這是編輯器最核心的設計之一，採用 **tabChildMap 對應機制**：

```
子元件 → tabChildMap 對應 → 對應的 tab page
```

#### tabChildMap 資料結構

```typescript
tabChildMap: Record<string, string[]>
// key：tab 索引字串（如 "0"、"1"、"2"）
// value：子元件 ID 陣列
```

範例：

```typescript
{
  tabChildMap: {
    "0": ["comp_id_1", "comp_id_2"],  // Tab 1 的子元件
    "1": ["comp_id_3"],                // Tab 2 的子元件
    "2": []                            // Tab 3 沒有子元件
  }
}
```

#### 掛載流程

1. **加入子元件時**（`addComponent`）：
   - 新元件加入 tabview 的 `children[]` 陣列
   - Store 自動把新元件 ID 加進 `tabChildMap[activeTab]`
   - 也就是說，新元件預設落在目前作用中的 tab page

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

2. **重新掛載時**（`reparentComponent`）：
   - 從舊 parent 的 childMap 中移除對應
   - 若新 parent 是 tabview，則加入其 `tabChildMap[activeTab]`

   ```typescript
   // editorStore.ts - reparentComponent
   // 移除舊對應
   if (oldParent?.type === 'tabview') {
     const tabChildMap = { ...(oldParent.props?.tabChildMap || {}) };
     for (const key of Object.keys(tabChildMap)) {
       tabChildMap[key] = tabChildMap[key].filter(cid => cid !== id);
     }
     get().updateComponent(comp.parentId, { props: { ...oldParent.props, tabChildMap } });
   }
   // 加入新對應
   if (newParent?.type === 'tabview') {
     const tabChildMap = { ...(newParent.props?.tabChildMap || {}) };
     const activeTab = String(newParent.props?.activeTab || 0);
     if (!tabChildMap[activeTab]) tabChildMap[activeTab] = [];
     tabChildMap[activeTab] = [...tabChildMap[activeTab], id];
     get().updateComponent(newParentId, { props: { ...newParent.props, tabChildMap } });
   }
   ```

3. **刪除子元件時**（`deleteComponents`）：
   - 從 parent 的 `tabChildMap` 所有 tab 中清除被刪除的元件 ID

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

4. **Fallback 機制**：未登記在 `tabChildMap` 中的子元件，預設 fallback 到 `activeTab` 對應的 tab page。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| tabs | `string[]` | `['Tab 1', 'Tab 2']` | 分頁名稱陣列，每個元素是一個 tab 的標題文字 |
| activeTab | `number` | `0` | 目前作用中的 tab 索引（從 0 開始） |
| tabPosition | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | 標籤列位置 |
| tabChildMap | `Record<string, string[]>` | `{}` | tab 與子元件的對應關係；key 為 tab 索引字串，value 為子元件 ID 陣列 |
| tabBarSize | `number` | `50` | 標籤列高度／寬度（取決於 tabPosition） |

### tabs 屬性說明

- 陣列長度決定 tab 數量
- 每個元素是該 tab 標籤的顯示文字
- 新增／刪除 tab 時需同步更新 `tabChildMap`

### tabChildMap 屬性說明

- 這是 Tab View 最核心的屬性，維護子元件與 tab page 的對應關係
- 由 Store 層自動維護，使用者一般不需要手動編輯
- key 為 tab 索引的字串形式（`"0"`、`"1"`…）
- value 為該 tab 下所有子元件的 ID 陣列
- 未對應的子元件會 fallback 到 activeTab

## 8. 樣式設計（styles）

### 預設樣式狀態（default）

Tab View 採用 LVGL 預設主題的 **screen 樣式**，並且無內距：

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| bgColor | `string` | `'#F5F5F5'` | 背景色，淺灰（LVGL color_scr） |
| borderColor | `string` | `'transparent'` | 無邊框 |
| borderWidth | `number` | `0` | 邊框寬度為 0 |
| borderRadius | `number` | `0` | 無圓角 |
| textColor | `string` | `'#212121'` | 文字顏色 |
| opacity | `number` | `1` | 完全不透明 |
| padding | `number` | `0` | 無內距（pad_zero） |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，必須存在 |
| `pressed` | 按下狀態（選用） |
| `focused` | 取得焦點狀態（選用） |
| `disabled` | 停用狀態（選用） |

注意：這些樣式主要作用於整體容器。標籤列（tab bar）與各個標籤按鈕的樣式由 LVGL 內部主題控制，編輯器目前不另外開放。

## 9. 事件支援

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | **切換 tab 時觸發**，是這裡最常用的事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |
| `LV_EVENT_READY` | 就緒事件 |
| `LV_EVENT_CANCEL` | 取消事件 |

`LV_EVENT_VALUE_CHANGED` 是 Tab View 最重要的事件，在使用者切換 tab 時觸發。

## 10. UI 層設計

### 編輯器畫布繪製

在畫布中，Tab View 繪製為：

```
┌─────────────────────────────┐
│ [Tab 1] [Tab 2] [Tab 3]    │  ← 標籤列（位置依 tabPosition 決定）
├─────────────────────────────┤
│                             │
│   目前 activeTab 的子元件    │  ← 內容區域
│                             │
└─────────────────────────────┘
```

- 標籤列依 `tabPosition` 顯示在上／下／左／右
- 點擊標籤可切換 `activeTab`，切換後只顯示該 tab 的子元件
- 子元件的可見性由 `tabChildMap[activeTab]` 決定
- 不屬於目前 activeTab 的子元件在畫布中會隱藏

### Prototype 繪製

與畫布繪製類似，但移除編輯互動。標籤列仍可點擊切換，顯示對應 tab 的子元件。

### Simulator 繪製

在 `editorStateToJson.ts` 中，子元件透過虛擬 ID 對應到 tab page：

```typescript
// 虛擬 parent ID 格式：{tabview_id}__tab__{tabIndex}
// 例如："abc123__tab__0"、"abc123__tab__1"

childToVirtualParent[childId] = `${parentComp.id}__tab__${tabIndex}`;
```

序列化後的 JSON 中，子元件的 `parent` 欄位指向虛擬 ID：

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

在 WASM 端（`ui_from_json.c`）：
1. 建立 tabview：`lv_tabview_create(parent)`
2. 加入 tab page：`lv_tabview_add_tab(tabview, "Tab 1")` 回傳 tab page 物件
3. 將 tab page 以虛擬 ID（`id__tab__N`）註冊到 `id_map`
4. 建立子元件時，透過虛擬 ID 在 `id_map` 中找到對應的 tab page 作為 parent

### 程式碼生成輸出

`ui.c.ts` 產生的 C 程式碼：

```c
// Create tabview: TabView_xxxx
TabView_xxxx = lv_tabview_create(parent);
lv_obj_set_pos(TabView_xxxx, 0, 0);
lv_obj_set_size(TabView_xxxx, 250, 200);

// 設定標籤列位置與大小（LVGL v9）
lv_tabview_set_tab_bar_position(TabView_xxxx, LV_DIR_TOP);
lv_tabview_set_tab_bar_size(TabView_xxxx, 50);

// 加入 tab page
lv_obj_t * TabView_xxxx_tab_0 = lv_tabview_add_tab(TabView_xxxx, "Tab 1");
lv_obj_t * TabView_xxxx_tab_1 = lv_tabview_add_tab(TabView_xxxx, "Tab 2");

// 子元件建立在對應的 tab page 上
// tabChildMap["0"] 中的子元件 → parent 為 TabView_xxxx_tab_0
child_1 = lv_label_create(TabView_xxxx_tab_0);
// tabChildMap["1"] 中的子元件 → parent 為 TabView_xxxx_tab_1
child_2 = lv_btn_create(TabView_xxxx_tab_1);

// 設定作用中的 tab（若不是第一個）
lv_tabview_set_active(TabView_xxxx, 1, LV_ANIM_OFF);
```

生成器分配子元件 parent 的邏輯（`ui.c.ts`）：

```typescript
// 建立 child → tab page 變數名稱的對應
const childToTab: Record<string, string> = {};
for (const [tabIndex, childIds] of Object.entries(tabChildMap)) {
  for (const childId of childIds) {
    childToTab[childId] = `${varName}_tab_${tabIndex}`;
  }
}
// 未對應的 fallback 到 activeTab
const defaultTab = `${varName}_tab_${component.props.activeTab || 0}`;
for (const child of component.children) {
  const tabParent = childToTab[child.id] || defaultTab;
  generateComponentCode(child, tabParent, ...);
}
```

## 11. LVGL API 對應

### 建立函式（LVGL v9）

```c
lv_obj_t * lv_tabview_create(lv_obj_t * parent);
```

注意：LVGL v8 的簽章不同 —— `lv_tabview_create(parent, dir, tab_size)`，編輯器在 v8 模式下會自動適配。

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_tabview_create(parent)` | 建立 tabview（v9） |
| `lv_tabview_add_tab(tabview, name)` | 加入一個 tab page，回傳該頁物件（`lv_obj_t *`） |
| `lv_tabview_set_active(tabview, index, anim)` | 設定作用中的 tab |
| `lv_tabview_set_tab_bar_position(tabview, dir)` | 設定標籤列位置（v9），dir 為 `LV_DIR_TOP/BOTTOM/LEFT/RIGHT` |
| `lv_tabview_set_tab_bar_size(tabview, size)` | 設定標籤列尺寸（v9） |
| `lv_tabview_get_active(tabview)` | 取得目前作用中的 tab 索引 |
| `lv_tabview_get_tab_bar(tabview)` | 取得標籤列物件 |
| `lv_tabview_get_content(tabview)` | 取得內容區域物件 |

### LVGL 原始碼參考

Tab View 的實作位於 `tools/lvgl/src/widgets/tabview/lv_tabview.c`，內部結構：

```
tabview (lv_obj)
├── tab_bar (lv_obj，包含 tab 按鈕)
│   ├── tab_btn_0 (lv_btn)
│   ├── tab_btn_1 (lv_btn)
│   └── ...
└── content (lv_obj，包含 tab page)
    ├── tab_page_0 (lv_obj)
    ├── tab_page_1 (lv_obj)
    └── ...
```

## 12. 設計注意事項

1. **tabChildMap 是核心**：Tab View 的子元件掛載完全依賴它。Store 層在 `addComponent`、`reparentComponent`、`deleteComponents` 三個操作中自動維護，這正是資料一致性的來源。

2. **設計時切換 tab**：在編輯器畫布中點擊 tab 標籤會更新 `activeTab` 屬性，從而切換顯示的子元件。這是純編輯器行為，不影響執行時。

3. **新增子元件的歸屬**：拖曳加入 Tab View 的子元件預設歸屬到目前的 `activeTab`。請先切換到目標 tab，再加入子元件。

4. **tab 增刪的同步**：新增或刪除 tab 時，需同步更新 `tabChildMap`。刪除 tab 時，該 tab 下的子元件需遷移到其他 tab 或一併刪除。

5. **WASM 預覽的虛擬 ID**：WASM 預覽以 `{id}__tab__{N}` 格式的虛擬 ID 標識 tab page。這些虛擬 ID 不是真實的元件 ID，僅供 WASM 端查找 parent 使用。

6. **v8/v9 API 差異**：
   - v9：`lv_tabview_create(parent)` 搭配 `lv_tabview_set_tab_bar_position()` 與 `lv_tabview_set_tab_bar_size()`
   - v8：`lv_tabview_create(parent, dir, tab_size)` 在建立時就指定位置與大小

7. **效能考量**：每個 tab page 都是一個完整的 `lv_obj`，即使不可見也會佔用記憶體。tab 數量偏多（超過約 10 個）時要留意記憶體消耗。

8. **標籤列樣式**：編輯器目前不另外開放標籤列與標籤按鈕的樣式設定，外觀由 LVGL 預設主題控制。未來可考慮擴充支援自訂標籤列樣式。

9. **巢狀容器**：Tab page 內部可以放置其他容器元件（例如 Container、另一個 Tab View），形成複雜的巢狀版面，但巢狀 Tab View 的使用體驗值得斟酌。
