# Container (obj) — 通用容器元件

<p align="center">
  <a href="../../components/obj.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Container 是編輯器中最基礎的容器元件，對應 LVGL 的 `lv_obj`（基礎物件）。它是所有 LVGL 元件的基底類別，作為容器使用時提供一塊可容納任意子元件的矩形區域。預設採用卡片樣式（card style），帶有白色背景、灰色邊框與圓角，適合用於版面分組、面板、卡片等情境。

## 2. 元件類型識別碼

```
type: 'obj'
```

## 3. 所屬分類

```
category: 'container'  // 容器分類，圖示：📁
```

在元件面板中顯示名稱為 **Container**，圖示為 📦。

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 150 |

## 5. 是否為容器

```
isContainer: true
```

Container 是容器元件，可以包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- 可直接作為 **Screen（頁面根節點）** 的子項
- 可作為任何 `isContainer=true` 元件的子項，包括：
  - 另一個 Container (obj)
  - Button (btn)
  - Tab View (tabview) — 掛載到對應的 tab page
  - Tile View (tileview) — 掛載到對應的圖磚
  - Window (win) — 掛載到 content 區域

### 可以包含的子元件

Container 可以包含**所有類型**的元件，包括：
- 基礎元件：Button、Label、Image、Line
- 輸入元件：Textarea、Dropdown、Checkbox、Switch、Slider
- 容器元件：Container（巢狀）、Tab View、Tile View、Window
- 顯示元件：Progress Bar、Arc、Spinner、Chart、Table、Calendar

### 子元件掛載機制

Container 使用最單純的**直接掛載**：

```
子元件直接建立在 Container 自身上（lv_obj_create(container)）
```

具體流程：

1. **加入子元件時**：`addComponent(type, x, y, containerId)` → 新元件的 `parentId` 設為 Container 的 ID，並被加入 Container 的 `children[]` 陣列。
2. **重新掛載時**：`reparentComponent(childId, containerId)` → 從舊 parent 的 `children[]` 移除，加入 Container 的 `children[]`，並更新 `parentId`。
3. **刪除子元件時**：`deleteComponents([childId])` → 從 Container 的 `children[]` 移除。

Container 不需要額外的 childMap 對應（不像 tabview 的 `tabChildMap` 或 tileview 的 `tileChildMap`），因為所有子元件都屬於同一個容器空間。

**Store 層操作**（`editorStore.ts`）：

```typescript
// addComponent：直接加入 parent 的 children
addComponentToTree(page.components, newComponent, parentId)

// reparentComponent：移動到新的 parent
moveComponentToParent(page.components, id, newParentId)

// deleteComponents：從樹中刪除
deleteComponentFromTree(page.components, ids)
```

## 7. 屬性設計（props）

Container 的 `defaultProps` 為空物件 `{}`，沒有元件特有的屬性，但支援下列選用的版面屬性：

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| layout | `'flex' \| 'grid'` | 無（自由定位） | 版面模式。設為 `'flex'` 啟用 Flex 版面，設為 `'grid'` 啟用 Grid 版面 |
| scrollDir | `'none' \| 'hor' \| 'ver' \| 'all'` | 無 | 捲動方向限制 |

### Flex 版面屬性（當 `layout='flex'` 時）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| flexDirection | `'row' \| 'column' \| 'row-reverse' \| 'column-reverse'` | `'row'` | Flex 主軸方向 |
| flexWrap | `boolean` | `false` | 是否換行 |
| justifyContent | `string` | `'flex-start'` | 主軸對齊方式 |
| alignItems | `string` | `'flex-start'` | 交叉軸對齊方式 |
| alignContent | `string` | `'flex-start'` | 多行對齊方式 |
| gap | `number` | 無 | 子元件間距（同時設定 row gap 與 column gap） |

### Grid 版面屬性（當 `layout='grid'` 時）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| gridColumns | `string` | 無 | 欄定義，例如 `"1fr 1fr"` 或 `"100 200"` |
| gridRows | `string` | 無 | 列定義，例如 `"1fr 1fr"` |
| gridColumnGap | `number` | 無 | 欄間距 |
| gridRowGap | `number` | 無 | 列間距 |

## 8. 樣式設計（styles）

### 預設樣式狀態（default）

Container 採用 LVGL 預設主題的 **card style**：

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| bgColor | `string` | `'#ffffff'` | 背景色，白色（LVGL color_card） |
| borderColor | `string` | `'#E0E0E0'` | 邊框色，淺灰（LVGL color_grey） |
| borderWidth | `number` | `2` | 邊框寬度 |
| borderRadius | `number` | `8` | 圓角半徑 |
| textColor | `string` | `'#212121'` | 文字顏色（LVGL color_text） |
| opacity | `number` | `1` | 不透明度（1＝完全不透明） |
| padding | `number` | `16` | 內距 |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，必須存在 |
| `pressed` | 按下狀態（選用），對應 `LV_STATE_PRESSED` |
| `focused` | 取得焦點狀態（選用），對應 `LV_STATE_FOCUSED` |
| `disabled` | 停用狀態（選用），對應 `LV_STATE_DISABLED` |

### 完整樣式屬性清單

每個樣式狀態都支援下列屬性（定義於 `StyleProps` 型別）：

| 分類 | 屬性 | 說明 |
|------|------|------|
| 基礎 | bgColor、borderColor、borderWidth、borderRadius、textColor、opacity、padding | 基礎外觀 |
| 內距 | paddingTop、paddingBottom、paddingLeft、paddingRight | 四方向內距 |
| 圓角 | borderRadiusTopLeft、borderRadiusTopRight、borderRadiusBottomLeft、borderRadiusBottomRight | 四角圓角 |
| 邊框 | borderSide | 邊框顯示方向（full/top/bottom/left/right/top_bottom/left_right/none） |
| 漸層 | bgGradColor、bgGradDir、bgGradStop | 背景漸層 |
| 外框 | outlineColor、outlineWidth、outlinePad | 外輪廓 |
| 陰影 | shadowColor、shadowWidth、shadowOffsetX、shadowOffsetY、shadowSpread、shadowOpacity | 陰影效果 |
| 變換 | transformAngle、transformZoomX、transformZoomY、transformPivotX、transformPivotY | 旋轉與縮放 |
| 文字 | textFont、textFontSize、textLetterSpace、textLineSpace、textDecor | 文字樣式 |
| 捲軸 | scrollbarMode、scrollbarWidth、scrollbarColor | 捲軸樣式 |
| 混合 | blendMode | 混合模式 |

## 9. 事件支援

Container 支援 `LvglEventType` 中定義的所有 LVGL 事件類型：

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

事件綁定支援兩種處理方式：
- **builtin**：內建動作（navigate、setProperty、show、hide、enable、disable、setText、setValue）
- **custom**：自訂 C 程式碼

## 10. UI 層設計

### 編輯器畫布繪製

在 `CanvasComponent.tsx` 中，Container 繪製為一個 `<div>`，樣式直接對應：

```
- 背景色 → CSS background-color（有漸層時使用 linear-gradient）
- 邊框 → CSS border
- 圓角 → CSS border-radius
- 內距 → CSS padding
- 陰影 → CSS box-shadow
- 變換 → CSS transform（rotate + scale）
- 子元件 → 遞迴繪製為巢狀的 <div>
```

Container 在畫布中顯示為白色卡片區域，子元件以絕對定位放在其內部。選取時會顯示藍色外框與 8 個調整控制點。

### 簡易預覽繪製

`PreviewPanel.tsx` 的繪製邏輯與畫布類似，但移除了編輯互動（選取框、拖曳控制點等），只保留視覺呈現。子元件同樣遞迴繪製。

### LVGL WASM 預覽繪製

`editorStateToJson.ts` 將 Container 序列化為：

```json
{
  "type": "obj",
  "id": "xxx",
  "parent": "screen 或 parent_id",
  "x": 0, "y": 0,
  "width": 200, "height": 150,
  "props": {},
  "styles": { "default": { "bgColor": "#ffffff", ... } }
}
```

在 WASM 端（`ui_from_json.c`）以 `lv_obj_create(parent)` 建立，接著套用位置、尺寸與樣式。子元件的 `parent` 欄位直接指向 Container 的 ID。

### 程式碼生成輸出

`ui.c.ts` 產生的 C 程式碼：

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

// 子元件以 Container_xxxx 作為 parent 建立
child_xxxx = lv_label_create(Container_xxxx);
```

若設定了 Flex 版面：

```c
lv_obj_set_layout(Container_xxxx, LV_LAYOUT_FLEX);
lv_obj_set_flex_flow(Container_xxxx, LV_FLEX_FLOW_ROW);
lv_obj_set_flex_align(Container_xxxx, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
```

若設定了 Grid 版面：

```c
lv_obj_set_layout(Container_xxxx, LV_LAYOUT_GRID);
static int32_t Container_xxxx_col_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST};
static int32_t Container_xxxx_row_dsc[] = {LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST};
lv_obj_set_grid_dsc_array(Container_xxxx, Container_xxxx_col_dsc, Container_xxxx_row_dsc);
```

## 11. LVGL API 對應

### 建立函式（LVGL v9）

```c
lv_obj_t * lv_obj_create(lv_obj_t * parent);
```

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_obj_create(parent)` | 建立基礎物件 |
| `lv_obj_set_pos(obj, x, y)` | 設定位置 |
| `lv_obj_set_size(obj, w, h)` | 設定尺寸 |
| `lv_obj_set_width(obj, w)` / `lv_obj_set_height(obj, h)` | 單獨設定寬／高 |
| `lv_obj_set_style_bg_color(obj, color, selector)` | 設定背景色 |
| `lv_obj_set_style_border_color(obj, color, selector)` | 設定邊框色 |
| `lv_obj_set_style_border_width(obj, width, selector)` | 設定邊框寬度 |
| `lv_obj_set_style_radius(obj, radius, selector)` | 設定圓角 |
| `lv_obj_set_style_pad_all(obj, pad, selector)` | 設定內距 |
| `lv_obj_set_layout(obj, LV_LAYOUT_FLEX)` | 啟用 Flex 版面 |
| `lv_obj_set_layout(obj, LV_LAYOUT_GRID)` | 啟用 Grid 版面 |
| `lv_obj_set_flex_flow(obj, flow)` | 設定 Flex 流向 |
| `lv_obj_set_flex_align(obj, main, cross, track)` | 設定 Flex 對齊 |
| `lv_obj_set_grid_dsc_array(obj, col_dsc, row_dsc)` | 設定 Grid 描述子 |
| `lv_obj_set_scroll_dir(obj, dir)` | 設定捲動方向 |
| `lv_obj_add_flag(obj, flag)` | 加入旗標 |
| `lv_obj_clear_flag(obj, flag)` | 清除旗標 |
| `lv_obj_add_event_cb(obj, cb, event, user_data)` | 加入事件回呼 |

## 12. 設計注意事項

1. **最基礎的容器**：`obj` 是 LVGL 中所有元件的基底類別，作為容器使用時功能最單純、最通用。其他容器元件（tabview、tileview、win）都是在它之上的特化。

2. **子元件定位**：Container 內的子元件預設使用**絕對定位**（x、y 相對於 Container 的內容區域）。啟用 Flex 或 Grid 版面後，位置改由版面引擎管理。

3. **巢狀深度**：Container 支援無限巢狀，但過深的巢狀會影響 LVGL 的繪製效能，建議層級不超過 5 層。

4. **捲動行為**：LVGL 的 obj 預設可捲動（`LV_OBJ_FLAG_SCROLLABLE`）。當子元件超出 Container 邊界時會自動出現捲軸，可透過 `flags.scrollable = false` 停用。

5. **Card Style 的來源**：預設樣式來自 LVGL 預設主題的 card style（`lv_theme_default.c`），與 textarea、dropdown、chart、table、calendar 等元件共用相同的基礎樣式。

6. **切換版面模式**：從自由定位切換到 Flex／Grid 後，子元件的 x／y 座標會被版面引擎忽略；切換回自由定位時，需要重新設定子元件的位置。

7. **與 Button 的差別**：Button (btn) 同樣是 `isContainer=true`，但它有預設的按下樣式（pressed state）與主色背景。Container 更適合純版面用途。
