# Progress Bar (bar) — 進度條元件設計文件

<p align="center">
  <a href="../../components/bar.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Progress Bar（進度條）是唯讀的顯示型元件，用於呈現某個數值在給定範圍內的進度。它由背景軌道與填滿指示器組成，填滿比例由 `value`、`min`、`max` 三個屬性決定。在嵌入式 UI 中常用於顯示下載進度、電池電量、載入狀態等情境。

## 2. 元件類型識別碼

```
type: 'bar'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| display | 顯示 | 📊 |

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 150 |
| defaultHeight | 20 |

## 5. 是否為容器

```
isContainer: false
```

Progress Bar 是純顯示元件，不能包含子元件。

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
| `min` | `number` | `0` | 進度條最小值 |
| `max` | `number` | `100` | 進度條最大值 |
| `value` | `number` | `60` | 目前進度值，範圍 [min, max] |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | 方向（選用擴充），垂直模式透過旋轉 90° 達成 |

### 屬性限制

- `min` 必須小於 `max`
- `value` 會被裁切（clamp）到 `[min, max]` 範圍內
- 填滿百分比計算公式：`percent = (value - min) / (max - min) * 100`

## 8. 樣式設計（styles）

### 預設樣式（default 狀態）

| 樣式屬性 | 預設值 | 說明 |
|----------|--------|------|
| `bgColor` | `#D3EAFD` | 背景軌道顏色（LVGL primary muted＝primary 以 20% 疊在白色上） |
| `borderColor` | `transparent` | 無邊框 |
| `borderWidth` | `0` | 無邊框 |
| `borderRadius` | `9999` | 全圓角（膠囊形狀），與 LVGL 預設 bar 的 circle 樣式一致 |
| `textColor` | `#212121` | 文字顏色（bar 本身不顯示文字，但可供子標籤繼承） |
| `opacity` | `1` | 完全不透明 |
| `padding` | `0` | 無內距 |

### 指示器樣式

在 LVGL 中，bar 的填滿部分是 `LV_PART_INDICATOR`，顏色為 `color_primary`（`#2196F3`）。這是沒有設定填色部位時的預設值；設定之後，畫布、預覽與韌體都會採用它。

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，一律套用 |
| `pressed` | 按下狀態（bar 通常不可互動，但仍支援樣式覆寫） |
| `focused` | 取得焦點狀態（鍵盤／編碼器導覽時） |
| `disabled` | 停用狀態，通常降低透明度 |

每個狀態都可覆寫 `StyleProps` 中定義的所有樣式屬性（bgColor、borderColor、borderWidth、borderRadius、textColor、opacity、padding、shadow*、transform*、outline* 等）。

## 9. 事件支援

Bar 是唯讀顯示元件，支援的 LVGL 事件類型：

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件（若有設定 clickable flag） |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | 值改變事件（以程式設定 value 時觸發） |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

### 內建動作支援

透過 `EventBinding` 可綁定下列內建動作：

- `navigate` — 頁面跳轉
- `setProperty` — 設定目標元件的屬性
- `show` / `hide` — 顯示／隱藏目標元件
- `enable` / `disable` — 啟用／停用目標元件
- `setText` / `setValue` — 設定目標元件的文字／數值

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

```tsx
// 計算填滿百分比
const barMin = props.min ?? 0;
const barMax = props.max ?? 100;
const barVal = props.value ?? 60;
const barPercent = barMax > barMin
  ? Math.max(0, Math.min(100, (barVal - barMin) / (barMax - barMin) * 100))
  : 0;

// 結構：外層背景軌道 + 內層填滿條
<div className="lvgl-bar" style={{
  width: '100%', height: '100%',
  backgroundColor: '#e0e0e0',
  borderRadius: defaultStyle.borderRadius,
  overflow: 'hidden',
}}>
  <div style={{
    width: `${barPercent}%`, height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: defaultStyle.borderRadius,
    transition: 'width 0.15s',
  }} />
</div>
```

重點：
- 外層 div 作為背景軌道，使用灰色 `#e0e0e0`
- 內層 div 作為填滿指示器，使用主題色 `#2196F3`
- `borderRadius` 由樣式繼承，預設 9999 形成膠囊形狀
- 加上 `transition`，讓屬性面板調整 value 時有平滑動畫

### Prototype 繪製（PreviewPanel.tsx — Canvas 2D）

```typescript
function drawBar(ctx, x, y, w, h, opts) {
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  // 背景軌道
  ctx.fillStyle = '#e0e0e0';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  // 填滿指示器
  ctx.fillStyle = '#2196f3';
  roundRect(ctx, x, y, w * progress, h, 4);
  ctx.fill();
}
```

重點：
- 以 Canvas 2D 的 `roundRect` 輔助函式繪製圓角矩形
- 先畫灰色背景，再畫藍色填滿
- 填滿寬度＝總寬度 × progress

### Simulator 繪製

**editorStateToJson.ts**：將元件樹扁平化為 JSON，bar 的 props（min、max、value）直接序列化傳遞。

**ui_from_json.c**：

```c
static lv_obj_t *create_bar(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *bar = lv_bar_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 50);
        lv_bar_set_range(bar, mn, mx);
        lv_bar_set_value(bar, val, LV_ANIM_OFF);
    }
    return bar;
}
```

重點：
- 以 `lv_bar_create` 建立真正的 LVGL bar 控制項
- 從 JSON props 讀取 min／max／value 並設定
- 樣式由通用的 `apply_styles` 函式套用

### 程式碼生成輸出（ui.c.ts）

```c
// 建立
lv_obj_t *bar_1 = lv_bar_create(parent);
lv_obj_set_pos(bar_1, 10, 50);
lv_obj_set_size(bar_1, 150, 20);

// 樣式
lv_obj_set_style_bg_color(bar_1, lv_color_hex(0xD3EAFD), 0);
lv_obj_set_style_bg_opa(bar_1, LV_OPA_COVER, 0);
lv_obj_set_style_radius(bar_1, 9999, 0);

// 屬性
lv_bar_set_range(bar_1, 0, 100);
lv_bar_set_value(bar_1, 60, LV_ANIM_OFF);
```

垂直方向的支援：

```c
// orientation === 'vertical' 時
lv_obj_set_style_transform_rotation(bar_1, 900, 0);  // LVGL v9
// 或
lv_obj_set_style_transform_angle(bar_1, 900, 0);     // LVGL v8
```

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_bar_create(parent)` |

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_bar_set_range(bar, min, max)` | 設定值範圍 |
| `lv_bar_set_value(bar, value, LV_ANIM_OFF)` | 設定目前值 |
| `lv_bar_set_start_value(bar, value, LV_ANIM_OFF)` | 設定起始值（用於範圍模式） |
| `lv_bar_set_mode(bar, mode)` | 設定模式：`LV_BAR_MODE_NORMAL`／`LV_BAR_MODE_SYMMETRICAL`／`LV_BAR_MODE_RANGE` |
| `lv_bar_get_value(bar)` | 取得目前值 |
| `lv_bar_get_min_value(bar)` | 取得最小值 |
| `lv_bar_get_max_value(bar)` | 取得最大值 |

### LVGL Parts

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 背景軌道 |
| `LV_PART_INDICATOR` | 填滿指示器 |

### 預設主題樣式（lv_theme_default）

- **MAIN part**：`bg_color = color_primary_muted`（`#D3EAFD`），`radius = LV_RADIUS_CIRCLE`
- **INDICATOR part**：`bg_color = color_primary`（`#2196F3`），`radius = LV_RADIUS_CIRCLE`

## 12. 設計注意事項

1. **唯讀與可互動**：Bar 是唯讀顯示元件，與 Slider 不同。Slider 允許使用者拖動改變值，Bar 只能由程式設定值，因此編輯器不需要為它提供拖動互動。

2. **指示器顏色是一個部位樣式**：Style 區塊的部位切換列提供**軌道**與**填色**，填色就是 `LV_PART_INDICATOR`。沒有設定填色的 bar，在畫布、預覽與面板上一律維持佈景主題的 `#2196F3`。見 [docs/widget-parts.md](../widget-parts.md)。

3. **borderRadius = 9999 的意義**：在 CSS 與 LVGL 中，過大的圓角值會自動裁切為元件短邊的一半，形成膠囊／藥丸形狀，這正是 LVGL bar 的預設外觀。

4. **垂直方向**：LVGL 原生不支援垂直 bar，需透過旋轉 90° 達成。生成程式碼時使用 `transform_rotation`（v9）或 `transform_angle`（v8），值為 900（0.1° 單位）。

5. **動畫過渡**：`lv_bar_set_value` 的第三個參數可設為 `LV_ANIM_ON` 以啟用平滑過渡動畫。編輯器預設生成 `LV_ANIM_OFF`，使用者可在自訂程式碼中修改。

6. **值範圍檢查**：編輯器屬性面板應確保 `min < max`，且 `value` 落在 `[min, max]` 範圍內，超出範圍的值應自動裁切。

7. **與 Slider 的樣式一致性**：Bar 與 Slider 在 LVGL 預設主題中共用相同的背景樣式（`color_primary_muted` 加 circle 圓角），維持視覺一致性。
