# EDT HMI Studio — 元件設計文件目錄

<p align="center">
  <a href="../../components/README.md">English</a> · <strong>繁體中文</strong>
</p>

本目錄收錄 EDT HMI Studio 中所有元件的詳細設計文件。每份文件涵蓋屬性設計、樣式系統、父子關係、UI 繪製層、程式碼生成與 LVGL API 對應等內容。

---

## 元件總覽

編輯器共支援 **21 個元件**，分為 5 個類別：

| 類別 | 圖示 | 元件數 | 說明 |
|------|------|--------|------|
| 基礎 (basic) | 📦 | 4 | 建構介面的基本元素 |
| 輸入 (input) | ✏️ | 5 | 供使用者互動的輸入控制項 |
| 圖形 (shape) | 🔷 | 3 | 裝飾用幾何圖形，只繪製、不操作 |
| 容器 (container) | 📁 | 4 | 可容納子元件的版面容器 |
| 顯示 (display) | 📊 | 5 | 資料呈現與視覺化元件 |

---

## 基礎元件 (Basic)

| 元件 | 類型 | 圖示 | 預設尺寸 | 容器 | 說明 | 文件 |
|------|------|------|----------|------|------|------|
| Button | `btn` | 🔘 | 100×40 | ✅ | 按鈕，內部會自動建立 Label 子元件顯示文字。支援點擊互動，是唯一 `isContainer=true` 的基礎元件 | [btn.md](btn.md) |
| Label | `label` | 🏷️ | 80×24 | ❌ | 文字標籤，用於顯示靜態或動態文字。背景透明，繼承父層的文字顏色 | [label.md](label.md) |
| Image | `img` | 🖼️ | 100×100 | ❌ | 圖片顯示元件。v9 使用 `lv_image_create`，v8 使用 `lv_img_create` | [img.md](img.md) |
| Spinner | `spinner` | ⏳ | 50×50 | ❌ | 旋轉載入動畫，以 Arc 元件為基礎實作，可自訂轉速 | [spinner.md](spinner.md) |

---

## 輸入元件 (Input)

| 元件 | 類型 | 圖示 | 預設尺寸 | 容器 | 說明 | 文件 |
|------|------|------|----------|------|------|------|
| Textarea | `textarea` | 📝 | 150×80 | ❌ | 多行文字輸入區域，支援提示文字。採用 card 樣式（白底灰邊框） | [textarea.md](textarea.md) |
| Dropdown | `dropdown` | 📋 | 120×36 | ❌ | 下拉選單，可設定多個選項與預設選取項 | [dropdown.md](dropdown.md) |
| Checkbox | `checkbox` | ☑️ | 120×28 | ❌ | 核取方塊，包含勾選標記與文字標籤。勾選狀態由 `LV_STATE_CHECKED` 控制 | [checkbox.md](checkbox.md) |
| Switch | `switch` | 🔀 | 50×26 | ❌ | 切換開關，圓角膠囊造型。開啟狀態由 `LV_STATE_CHECKED` 控制 | [switch.md](switch.md) |
| Slider | `slider` | 🎚️ | 150×20 | ❌ | 滑桿控制項，可設定最小值、最大值與目前值 | [slider.md](slider.md) |

---

## 圖形元件 (Shape)

圖形是畫出來的，不是拿來操作的。每個圖形在元件面板中以自己的名稱呈現，屬性面板的 Type 則統一顯示為所屬家族 `Shape`。

| 元件 | 類型 | 圖示 | 預設尺寸 | 容器 | 說明 | 文件 |
|------|------|------|----------|------|------|------|
| Rectangle | `rectangle` | 🟦 | 120×80 | ❌ | 以 `lv_obj_create` 實作的填色方框，直角、無內距 | [rectangle.md](rectangle.md) |
| Line | `line` | 📏 | 100×2 | ❌ | 線條，以座標點陣列定義線段，以 `lv_line_create` 實作；外框就是點座標的範圍，不會比筆畫更寬 | [line.md](line.md) |
| Circle | `circle` | 🔵 | 100×100 | ❌ | 圓盤、圓環、扇形與環狀扇形。以帶圓形半徑的 `lv_obj_create` 或 `lv_arc_create` 實作。只有正圓 — 軟體渲染器沒有橢圓圖元 | [circle.md](circle.md) |
| Polygon | `polygon` | 🔷 | 100×100 | ❌ | 封閉的座標點串。輪廓以 `lv_line_create` 實作，填色是一組 `lv_draw_triangle` 扇形；凹多邊形不填色，因為扇形蓋不住 | [polygon.md](polygon.md) |

---

## 容器元件 (Container)

容器是編輯器中最複雜的部分，設計核心在於**子元件的掛載機制**。

| 元件 | 類型 | 圖示 | 預設尺寸 | 子元件掛載方式 | 說明 | 文件 |
|------|------|------|----------|----------------|------|------|
| Container | `obj` | 📦 | 200×150 | 直接掛載 | 通用容器，子元件直接建立在自身之上。最基礎的容器類型 | [obj.md](obj.md) |
| Tab View | `tabview` | 📑 | 250×200 | 透過 tabChildMap | 分頁檢視，子元件透過 `tabChildMap` 對應到各自的 tab page | [tabview.md](tabview.md) |
| Tile View | `tileview` | 🔲 | 200×200 | 透過 tileChildMap | 圖磚檢視，子元件透過 `tileChildMap` 對應到各自的圖磚（key 格式為 `"row-col"`） | [tileview.md](tileview.md) |
| Window | `win` | 🪟 | 250×200 | content 區域 | 視窗容器，子元件掛載到 `lv_win_get_content()` 回傳的內容區域 | [win.md](win.md) |

### 容器子元件的掛載機制

編輯器的 Store 層（`editorStore.ts`）會自動維護容器的 childMap：

- **addComponent** — 將元件加入 tabview／tileview 時，自動把子元件 ID 加進目前 activeTab／currentTile 對應的 childMap 項目
- **reparentComponent** — 移動元件時，從舊 parent 的 childMap 移除，並加入新 parent 的 childMap
- **deleteComponents** — 刪除元件時，從 parent 的 childMap 清除對應的 ID

在程式碼生成與 WASM 預覽中，使用**虛擬 ID** 機制把子元件正確掛載到內部容器：
- Tab View：`{parentId}__tab__{tabIndex}`
- Tile View：`{parentId}__tile__{row}-{col}`
- Window：`{parentId}__win_content`

---

## 顯示元件 (Display)

| 元件 | 類型 | 圖示 | 預設尺寸 | 容器 | 說明 | 文件 |
|------|------|------|----------|------|------|------|
| Progress Bar | `bar` | 📊 | 150×20 | ❌ | 進度條，可設定範圍與目前值。圓角膠囊造型 | [bar.md](bar.md) |
| Arc | `arc` | 🔄 | 100×100 | ❌ | 弧形控制項，可設定起訖角度與目前值 | [arc.md](arc.md) |
| Chart | `chart` | 📈 | 200×150 | ❌ | 圖表元件，支援折線圖與長條圖。多系列資料，可設定座標軸與格線 | [chart.md](chart.md) |
| Table | `table` | 📋 | 200×150 | ❌ | 表格元件，可設定行列、儲存格資料、欄寬與對齊方式 | [table.md](table.md) |
| Calendar | `calendar` | 📅 | 220×220 | ❌ | 日曆元件，支援年月顯示、今日標記、日期高亮與範圍選取 | [calendar.md](calendar.md) |

---

## 通用設計

### 樣式系統

所有元件都支援 4 種樣式狀態：

| 狀態 | LVGL 選擇器 | 說明 |
|------|-------------|------|
| `default` | `LV_PART_MAIN \| LV_STATE_DEFAULT` | 預設狀態樣式 |
| `pressed` | `LV_PART_MAIN \| LV_STATE_PRESSED` | 按下狀態樣式 |
| `focused` | `LV_PART_MAIN \| LV_STATE_FOCUSED` | 取得焦點狀態樣式 |
| `disabled` | `LV_PART_MAIN \| LV_STATE_DISABLED` | 停用狀態樣式 |

通用樣式屬性（`StyleProps`）包括：背景色、邊框、圓角、文字顏色、透明度、內距、陰影、漸層、外框、變換等。詳見各元件文件。

### 事件系統

編輯器支援的 LVGL 事件類型：

| 事件 | 說明 | 典型元件 |
|------|------|----------|
| `LV_EVENT_CLICKED` | 點擊 | btn、checkbox、switch |
| `LV_EVENT_PRESSED` | 按下 | btn |
| `LV_EVENT_RELEASED` | 放開 | btn |
| `LV_EVENT_LONG_PRESSED` | 長按 | btn |
| `LV_EVENT_VALUE_CHANGED` | 值改變 | slider、arc、dropdown、switch、checkbox、tabview |
| `LV_EVENT_FOCUSED` | 取得焦點 | textarea、dropdown |
| `LV_EVENT_DEFOCUSED` | 失去焦點 | textarea、dropdown |
| `LV_EVENT_READY` | 就緒 | textarea |
| `LV_EVENT_CANCEL` | 取消 | textarea |

### UI 繪製層

每個元件在編輯器中有 4 層繪製實作：

1. **編輯器畫布**（`CanvasComponent.tsx`）— 以 React/HTML 近似模擬，支援拖曳、選取、調整大小
2. **Prototype**（`PreviewPanel.tsx`）— 以 Canvas 2D 繪製的輕量預覽
3. **Simulator**（`ui_from_json.c`）— 真實的 LVGL 執行環境，元件樹以 JSON 傳入
4. **程式碼生成**（`ui.c.ts`）— 產生可編譯的 C 程式碼，支援 LVGL v8／v9

### LVGL 版本相容性

編輯器預設使用 LVGL v9 API。主要的版本差異：

| 功能 | v8 | v9 |
|------|----|----|
| 建立圖片 | `lv_img_create` | `lv_image_create` |
| 設定圖片來源 | `lv_img_set_src` | `lv_image_set_src` |
| 建立 tabview | `lv_tabview_create(parent, dir, size)` | `lv_tabview_create(parent)` |
| 設定作用中分頁 | `lv_tabview_set_act` | `lv_tabview_set_active` |
| 建立視窗 | `lv_win_create(parent, height)` | `lv_win_create(parent)` |
| 座標型別 | `lv_coord_t` | `int32_t` |
| 旋轉屬性 | `transform_angle` | `transform_rotation` |

---

## 檔案結構

```
docs/components/
├── README.md          ← 本檔案（元件目錄）
├── btn.md             ← Button 按鈕
├── label.md           ← Label 標籤
├── img.md             ← Image 圖片
├── spinner.md         ← Spinner 載入動畫
├── textarea.md        ← Textarea 文字輸入
├── dropdown.md        ← Dropdown 下拉選單
├── checkbox.md        ← Checkbox 核取方塊
├── switch.md          ← Switch 切換開關
├── slider.md          ← Slider 滑桿
├── rectangle.md       ← Rectangle 矩形
├── line.md            ← Line 線條
├── circle.md          ← Circle 圓形
├── polygon.md         ← Polygon 多邊形
├── obj.md             ← Container 通用容器
├── tabview.md         ← Tab View 分頁檢視
├── tileview.md        ← Tile View 圖磚檢視
├── win.md             ← Window 視窗
├── bar.md             ← Progress Bar 進度條
├── arc.md             ← Arc 弧形
├── chart.md           ← Chart 圖表
├── table.md           ← Table 表格
└── calendar.md        ← Calendar 日曆
```
