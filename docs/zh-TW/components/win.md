# Window (win) — 視窗容器元件

<p align="center">
  <a href="../../components/win.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Window 是編輯器中的視窗容器元件，對應 LVGL 的 `lv_win`。它提供帶有標題列（header）與內容區域（content）的視窗結構，標題列可包含標題文字與操作按鈕（例如關閉按鈕）。適用於對話框、設定面板、彈出視窗、資訊卡片等情境。

Window 的子元件掛載機制特別之處在於：子元件不是直接掛在 win 物件上，而是掛到 `lv_win_get_content()` 回傳的 content 區域。

## 2. 元件類型識別碼

```
type: 'win'
```

## 3. 所屬分類

```
category: 'container'  // 容器分類，圖示：📁
```

在元件面板中顯示名稱為 **Window**，圖示為 🪟。

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 250 |
| defaultHeight | 200 |

## 5. 是否為容器

```
isContainer: true
```

Window 是容器元件，子元件掛載到其內部的 content 區域。

## 6. 父子關係設計

### 可以作為以下元件的子項

- 可直接作為 **Screen（頁面根節點）** 的子項
- 可作為任何 `isContainer=true` 元件的子項，包括：
  - Container (obj)
  - Button (btn)
  - Tab View (tabview) — 掛載到對應的 tab page
  - Tile View (tileview) — 掛載到對應的圖磚
  - 另一個 Window（巢狀，不建議）

### 可以包含的子元件

Window 可以包含**所有類型**的元件。執行時這些子元件會被放進 Window 的 content 區域。

### 子元件掛載機制（核心設計）

Window 採用 **content 區域掛載機制**：

```
子元件 → lv_win_get_content(win) → content 區域
```

#### 掛載原理

LVGL 的 `lv_win` 內部分為兩部分：
- **header**：標題列，包含標題文字與按鈕，由 `lv_win_add_title()` 與 `lv_win_add_btn()` 管理
- **content**：內容區域，以 `lv_win_get_content()` 取得，子元件應建立在此區域

在編輯器中，Window 的 `children[]` 陣列存放所有子元件，但在程式碼生成與 WASM 預覽時，這些子元件的 parent 不是 win 物件本身，而是 win 的 content 區域。

#### 掛載流程

1. **加入子元件時**（`addComponent`）：
   - 新元件加入 win 的 `children[]` 陣列
   - `parentId` 設為 win 的 ID
   - Window 不需要額外的 childMap（不像 tabview／tileview），因為所有子元件都屬於同一個 content 區域

   ```typescript
   // editorStore.ts - addComponent
   // Window 走通用邏輯，不需特殊處理
   addComponentToTree(page.components, newComponent, parentId)
   ```

2. **重新掛載時**（`reparentComponent`）：
   - 走通用邏輯：從舊 parent 移除，加入 win 的 children
   - 若舊 parent 是 tabview／tileview，需清理對應的 childMap

3. **刪除子元件時**（`deleteComponents`）：
   - 走通用邏輯：從 win 的 children 中移除

#### 與 Container (obj) 的差別

雖然 Window 的 Store 層操作與 Container 類似（都是直接操作 children 陣列），但在程式碼生成與 WASM 預覽層面有本質差異：

| 層面 | Container (obj) | Window (win) |
|------|-----------------|--------------|
| Store 層 | 子元件在 `children[]` 中 | 子元件在 `children[]` 中 |
| 程式碼生成 | `lv_xxx_create(container)` | `lv_xxx_create(win_content)` |
| WASM 預覽 | parent = container_id | parent = `{win_id}__win_content` |

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| title | `string` | `'Window'` | 視窗標題文字，顯示在標題列中 |
| headerHeight | `number` | `40` | 標題列高度（像素） |
| showCloseBtn | `boolean` | `true` | 是否顯示關閉按鈕（使用 LV_SYMBOL_CLOSE 圖示） |
| headerButtons | `Array<{icon: string, width: number}>` | `[]` | 額外的標題列按鈕清單 |

### title 屬性說明

- 透過 `lv_win_add_title(win, title)` 設定
- 顯示在標題列左側，或依加入順序排列

### headerHeight 屬性說明

- 控制標題列的高度
- LVGL v9 中在 `lv_win_create(parent)` 之後另外設定
- LVGL v8 中則於 `lv_win_create(parent, headerHeight)` 建立時指定

### showCloseBtn 屬性說明

- 為 `true` 時，在標題列加入一個關閉按鈕
- 生成的程式碼：`lv_win_add_btn(win, LV_SYMBOL_CLOSE, 40)`
- 關閉按鈕實際的行為需透過事件綁定實作

### headerButtons 屬性說明

- 額外的標題列按鈕陣列
- 每個按鈕包含 `icon`（LVGL 符號常數，例如 `LV_SYMBOL_SETTINGS`）與 `width`（按鈕寬度）
- 按鈕依陣列順序加入標題列

## 8. 樣式設計（styles）

### 預設樣式狀態（default）

Window 採用 LVGL 預設主題的 **clip_corner** 樣式，header 使用灰色背景，content 使用 screen 樣式：

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| bgColor | `string` | `'#F5F5F5'` | 背景色，淺灰（LVGL color_scr，作用於 content 區域） |
| borderColor | `string` | `'#E0E0E0'` | 邊框色，淺灰 |
| borderWidth | `number` | `2` | 邊框寬度 |
| borderRadius | `number` | `8` | 圓角半徑（clip_corner 效果） |
| textColor | `string` | `'#212121'` | 文字顏色 |
| opacity | `number` | `1` | 完全不透明 |
| padding | `number` | `0` | 無內距（content 區域有自己的 padding） |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，必須存在 |
| `pressed` | 按下狀態（選用） |
| `focused` | 取得焦點狀態（選用） |
| `disabled` | 停用狀態（選用） |

注意：這些樣式主要作用於整體容器。標題列（header）的背景色由 LVGL 主題控制（預設為 `color_grey = #E0E0E0`），編輯器目前不另外開放 header 樣式。

## 9. 事件支援

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | 值改變事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |
| `LV_EVENT_READY` | 就緒事件 |
| `LV_EVENT_CANCEL` | 取消事件 |

對 Window 而言，最常見的情境是關閉按鈕的點擊事件。關閉按鈕是由 `lv_win_add_btn()` 加入的獨立按鈕物件，其事件需要單獨綁定在該物件上。

## 10. UI 層設計

### 編輯器畫布繪製

在畫布中，Window 繪製為：

```
┌─────────────────────────────┐
│ Window Title          [✕]   │  ← header 區域（灰色背景）
├─────────────────────────────┤
│                             │
│   子元件內容區域             │  ← content 區域
│                             │
│                             │
└─────────────────────────────┘
```

- header 區域顯示標題文字與按鈕圖示
- content 區域顯示子元件
- header 高度由 `headerHeight` 屬性控制
- 子元件的 y 座標相對於 content 區域頂端，不含 header

### Prototype 繪製

與畫布繪製類似，但移除編輯互動。顯示完整的視窗結構（header + content），子元件在 content 區域內繪製。

### Simulator 繪製

在 `editorStateToJson.ts` 中，子元件透過虛擬 ID 對應到 content 區域：

```typescript
// 虛擬 parent ID 格式：{win_id}__win_content
// 例如："abc123__win_content"

// 所有子元件都對應到同一個 content 虛擬 ID
for (const comp of components) {
  childToVirtualParent[comp.id] = `${parentComp.id}__win_content`;
}
```

序列化後的 JSON 中，子元件的 `parent` 欄位指向虛擬 ID：

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

在 WASM 端（`ui_from_json.c`）：
1. 建立 win：`lv_win_create(parent)`
2. 加入標題：`lv_win_add_title(win, "Window")`
3. 加入按鈕：`lv_win_add_btn(win, LV_SYMBOL_CLOSE, 40)`
4. 取得 content：`lv_win_get_content(win)` 回傳 content 物件
5. 將 content 以虛擬 ID（`id__win_content`）註冊到 `id_map`
6. 建立子元件時，透過虛擬 ID 在 `id_map` 中找到 content 作為 parent

### 程式碼生成輸出

`ui.c.ts` 產生的 C 程式碼：

```c
// Create win: Window_xxxx
Window_xxxx = lv_win_create(parent);
lv_obj_set_pos(Window_xxxx, 0, 0);
lv_obj_set_size(Window_xxxx, 250, 200);

// 樣式設定
lv_obj_set_style_bg_color(Window_xxxx, lv_color_hex(0xF5F5F5), 0);
lv_obj_set_style_bg_opa(Window_xxxx, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(Window_xxxx, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(Window_xxxx, 2, 0);
lv_obj_set_style_radius(Window_xxxx, 8, 0);

// 加入標題
lv_win_add_title(Window_xxxx, "Window");

// 加入關閉按鈕
lv_win_add_btn(Window_xxxx, LV_SYMBOL_CLOSE, 40);

// 取得 content 區域，子元件建立在其上
lv_obj_t * Window_xxxx_content = lv_win_get_content(Window_xxxx);

// 子元件以 content 作為 parent
child_1 = lv_label_create(Window_xxxx_content);
child_2 = lv_btn_create(Window_xxxx_content);
```

生成器分配子元件 parent 的邏輯（`ui.c.ts`）：

```typescript
// Window 的子元件一律掛到 content 區域
if (component.type === 'win') {
  if (component.children.length > 0) {
    lines.push(`${indent}lv_obj_t * ${varName}_content = lv_win_get_content(${varName});`);
    for (const child of component.children) {
      lines.push(...generateComponentCode(child, `${varName}_content`, ...));
    }
  }
}
```

## 11. LVGL API 對應

### 建立函式（LVGL v9）

```c
lv_obj_t * lv_win_create(lv_obj_t * parent);
```

注意：LVGL v8 的簽章不同 —— `lv_win_create(parent, header_height)`，編輯器在 v8 模式下會自動適配。

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_win_create(parent)` | 建立 window（v9） |
| `lv_win_add_title(win, title)` | 將標題文字加入 header |
| `lv_win_add_btn(win, icon, width)` | 將按鈕加入 header，`icon` 為 LVGL 符號（例如 `LV_SYMBOL_CLOSE`），`width` 為按鈕寬度 |
| `lv_win_get_content(win)` | 取得 content 區域物件（`lv_obj_t *`），子元件應建立在此物件上 |
| `lv_win_get_header(win)` | 取得 header 區域物件 |

### LVGL 內部結構

```
win (lv_obj，整體容器)
├── header (lv_obj，標題列，flex 版面)
│   ├── title (lv_label，標題文字)
│   ├── btn_close (lv_btn，關閉按鈕)
│   └── btn_xxx (lv_btn，其他按鈕)
└── content (lv_obj，內容區域)
    ├── child_1（使用者的子元件）
    ├── child_2（使用者的子元件）
    └── ...
```

Window 內部使用 flex 版面：
- 整體為垂直 flex（header 在上，content 在下）
- header 為水平 flex（標題與按鈕水平排列）
- content 區域預設可捲動

### LVGL 符號常數（供 headerButtons 使用）

| 符號 | 說明 |
|------|------|
| `LV_SYMBOL_CLOSE` | 關閉 ✕ |
| `LV_SYMBOL_SETTINGS` | 設定 ⚙ |
| `LV_SYMBOL_HOME` | 首頁 🏠 |
| `LV_SYMBOL_LEFT` | 左箭頭 ← |
| `LV_SYMBOL_RIGHT` | 右箭頭 → |
| `LV_SYMBOL_REFRESH` | 重新整理 🔄 |
| `LV_SYMBOL_EDIT` | 編輯 ✏ |
| `LV_SYMBOL_SAVE` | 儲存 💾 |

## 12. 設計注意事項

1. **content 區域是關鍵**：Window 的子元件必須建立在 `lv_win_get_content()` 回傳的 content 區域上，而不是 win 物件本身。這是 Window 與 Container 最大的差別，編輯器在程式碼生成與 WASM 預覽中會自動處理這層對應。

2. **Store 層不需要 childMap**：與 Tab View 和 Tile View 不同，Window 不需要 childMap，因為所有子元件都屬於同一個 content 區域。Store 層的 addComponent／reparentComponent／deleteComponents 走通用邏輯即可。

3. **header 不可放子元件**：目前的設計中，header 區域的內容（標題與按鈕）透過 props 設定，不支援在 header 中放置自訂子元件。所有拖曳加入的子元件都會進入 content 區域。

4. **headerHeight 的 v8/v9 差異**：
   - v9：在 `lv_win_create(parent)` 之後，透過樣式或內部機制設定 header 高度
   - v8：於 `lv_win_create(parent, headerHeight)` 建立時指定
   - 編輯器在生成程式碼時會自動適配

5. **關閉按鈕的行為**：`showCloseBtn=true` 只是在 header 加入一個帶關閉圖示的按鈕，並不會自動實作關閉／隱藏視窗的邏輯。需透過事件綁定來實作（例如 `lv_obj_add_flag(win, LV_OBJ_FLAG_HIDDEN)`）。

6. **單一虛擬 ID**：Window 使用單一的 `{id}__win_content` 虛擬 ID（不像 tabview 需要多個 tab page 虛擬 ID），因為 Window 只有一個 content 區域。

7. **content 區域可捲動**：Window 的 content 區域預設可捲動，當子元件超出 content 區域時會自動出現捲軸。

8. **樣式的作用範圍**：編輯器中設定的樣式主要作用於 win 整體容器。header 的背景色（預設灰色）與 content 的背景色由 LVGL 主題內部控制。未來可考慮分別開放 header 與 content 的樣式設定。

9. **當作對話框使用**：LVGL 沒有獨立的 dialog 元件。Window 搭配 `lv_obj_add_flag(win, LV_OBJ_FLAG_FLOATING)` 即可做出浮動對話框效果。編輯器目前未直接開放 floating 旗標，但可透過 flags 屬性擴充。
