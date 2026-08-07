# Line (line) — 線條元件設計文件

<p align="center">
  <a href="../../components/line.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Line（線條）是用於繪製直線段的基礎元件。在 LVGL 中，線條物件（`lv_line`）以一組點座標定義線段形狀，並支援設定線寬、線色等屬性。線條常用於介面中的分隔線、裝飾線等情境。

線條不是容器元件（`isContainer = false`），不能包含子元件。

## 2. 元件類型識別碼

```
type: 'line'
```

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `basic` |
| 分類名稱 | 基礎 |
| 分類圖示 | 📦 |
| 元件圖示 | 📏 |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 4 |

> 注意：線條的預設高度為 4px，是為了在編輯器中提供足夠的可互動區域。實際由 LVGL 繪製時，線條的視覺粗細由 `lineWidth`（線寬）決定。

## 5. 是否為容器

```
isContainer: false
```

線條是純顯示元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Button (btn)** — 作為按鈕內的裝飾線
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區
- **Tile View (tileview)** — 放在圖磚區域內
- **Window (win)** — 放在視窗內容區

### 可以包含的子元件

無。線條不是容器，不能包含任何子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `points` | `number[][]` | `[[0,0],[100,0]]` | 線段的點座標陣列，每個點為 `[x, y]` |
| `lineWidth` | `number` | `2` | 線寬（像素），對應到 LVGL 的 `line_width` 樣式 |
| `lineColor` | `string` | `undefined` | 線條顏色（選填，會覆寫樣式中的 `borderColor`） |

### props 型別定義

```typescript
interface LineProps {
  points: number[][];  // [[x1,y1], [x2,y2], ...]
  lineWidth?: number;
  lineColor?: string;
}
```

### points 說明

- 預設值 `[[0,0],[100,0]]` 表示一條由左至右的水平線
- 座標相對於線條物件自身的原點
- 支援多個點（折線），但編輯器預設只使用兩個點（直線段）
- WASM 預覽最多只處理 2 個點

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | 預設／正常狀態 |
| `pressed` | `LV_STATE_PRESSED` | 按下狀態 |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態 |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

### default 狀態的預設樣式

| 樣式屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `bgColor` | `string` | `'transparent'` | 背景色（透明） |
| `borderColor` | `string` | `'#212121'` | 邊框顏色（作為線條顏色的參考，即 LVGL 主題的 `color_text`） |
| `borderWidth` | `number` | `1` | 邊框寬度（對應為 LVGL 的 `line_width`） |
| `borderRadius` | `number` | `0` | 圓角半徑（線條不使用） |
| `textColor` | `string` | `'#212121'` | 文字顏色 |
| `opacity` | `number` | `1` | 不透明度 |
| `padding` | `number` | `0` | 內距 |

### 樣式來源說明

線條的預設樣式來自 LVGL 預設主題：
- 線條顏色（`line_color`）使用 `color_text`（`#212121`）
- 線寬（`line_width`）預設為 1
- 背景透明

> 注意：在編輯器的樣式系統中，線條的顏色與寬度存放在 `borderColor` 與 `borderWidth` 欄位，但在 LVGL 中實際對應到 `line_color` 與 `line_width` 樣式屬性。`props.lineColor` 與 `props.lineWidth` 提供更直接的控制方式。

### 擴充樣式屬性

線條支援下列通用擴充樣式：

- 變換：`transformAngle`、`transformZoomX`、`transformZoomY`、`transformPivotX`、`transformPivotY`
- 混合模式：`blendMode`

## 9. 事件支援

線條支援下列 LVGL 事件類型：

| 事件類型 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

> 注意：線條預設不可點擊。由於線條的可互動區域很小，實際使用中很少為線條綁定事件。

## 10. UI 層設計

### 10.1 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，線條以 React DOM 繪製：

```tsx
<div className="lvgl-line" style={{
  width: '100%',
  height: '2px',
  backgroundColor: defaultStyle.borderColor || defaultStyle.textColor || '#333',
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
}} />
```

關鍵行為：
- 以 `div` 元素模擬線條，固定高度 2px
- 在元件區域中垂直置中（`top: 50%` 搭配 `translateY(-50%)`）
- 顏色取自 `borderColor`，其次為 `textColor`
- 一律繪製為水平線（不依 `points` 計算角度）
- 支援選取高亮、停留效果、拖曳、調整大小控制點

### 10.2 簡易預覽繪製（PreviewPanel.tsx）

在 Canvas 2D 簡易預覽中，線條以 `drawLine()` 函式繪製：

```typescript
drawLine(ctx, x, y, w, h, {
  lineColor: comp.props.lineColor || bgColorStyle,
  lineWidth: comp.props.lineWidth || 2,
});
```

實作內容：

```typescript
function drawLine(ctx, x, y, w, h, opts) {
  ctx.strokeStyle = opts.lineColor;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
}
```

關鍵行為：
- 以 Canvas 2D 的 `stroke` 繪製線段
- 線條在元件區域中垂直置中
- 線端為圓頭（`lineCap = 'round'`）
- 顏色取自 `props.lineColor`，回退到樣式的 `bgColor`
- 線寬取自 `props.lineWidth`，預設 2px
- 支援疊加動畫狀態

### 10.3 LVGL WASM 預覽繪製

#### JSON 序列化（editorStateToJson.ts）

線條會被序列化為扁平化的 JSON 元件節點：

```json
{
  "type": "line",
  "id": "comp-xxx",
  "parent": null,
  "x": 10, "y": 50,
  "width": 100, "height": 4,
  "props": { "points": [[0,0],[100,0]] },
  "styles": {
    "default": {
      "bgColor": "transparent",
      "borderColor": "#212121",
      "borderWidth": 1,
      "borderRadius": 0,
      "textColor": "#212121",
      "opacity": 1,
      "padding": 0
    }
  }
}
```

#### C 端建立（ui_from_json.c）

```c
static lv_obj_t *create_line(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *line = lv_line_create(parent);
    static lv_point_precise_t line_points[2];
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    int w = cjson_get_int(comp, "width", 100);
    line_points[0].x = 0; line_points[0].y = 0;
    line_points[1].x = w; line_points[1].y = 0;

    if (props) {
        cJSON *pts = cJSON_GetObjectItemCaseSensitive(props, "points");
        if (cJSON_IsArray(pts) && cJSON_GetArraySize(pts) >= 2) {
            cJSON *p0 = cJSON_GetArrayItem(pts, 0);
            cJSON *p1 = cJSON_GetArrayItem(pts, 1);
            if (cJSON_IsArray(p0) && cJSON_IsArray(p1)) {
                line_points[0].x = cJSON_GetArrayItem(p0, 0)->valueint;
                line_points[0].y = cJSON_GetArrayItem(p0, 1)->valueint;
                line_points[1].x = cJSON_GetArrayItem(p1, 0)->valueint;
                line_points[1].y = cJSON_GetArrayItem(p1, 1)->valueint;
            }
        }
    }
    lv_line_set_points(line, line_points, 2);
    return line;
}
```

關鍵行為：
- 呼叫 `lv_line_create()` 建立線條
- 解析 `props.points` 陣列取得兩個端點座標
- 使用 `static` 點陣列（LVGL 要求點資料在線條的生命週期內都有效）
- 預設回退為水平線（`[0,0]` 到 `[width,0]`）
- 呼叫 `lv_line_set_points()` 設定點座標
- 套用位置、尺寸、樣式

### 10.4 程式碼生成輸出（ui.c.ts）

```c
// Create line: my_line
my_line = lv_line_create(parent);
lv_obj_set_pos(my_line, 10, 50);
lv_obj_set_size(my_line, 100, 4);
lv_obj_set_style_bg_opa(my_line, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(my_line, lv_color_hex(0x212121), 0);
lv_obj_set_style_border_width(my_line, 1, 0);

// 自訂線寬（當 props.lineWidth 非預設值時）
lv_obj_set_style_line_width(my_line, 3, 0);

// 自訂線色（當有設定 props.lineColor 時）
lv_obj_set_style_line_color(my_line, lv_color_hex(0xFF0000), 0);
```

關鍵行為：
- 建立函式使用 `lv_line_create`
- 將 `props.lineWidth` 對應到 `lv_obj_set_style_line_width`（僅在非預設值 2 時生成）
- 將 `props.lineColor` 對應到 `lv_obj_set_style_line_color`
- 點座標資料需要在程式碼中以 `static` 陣列形式存在；目前生成器不會輸出，因此仰賴預設行為

> 注意：目前的生成器（`generatePropsCode`）不會為 `points` 屬性輸出對應的 `lv_line_set_points`。這是已知的簡化處理，線條會退回預設的水平線行為。

## 11. LVGL API 對應

### 建立函式

| 版本 | API |
|---|---|
| LVGL v9 | `lv_line_create(parent)` |
| LVGL v8 | `lv_line_create(parent)` |

### 關鍵 API

| API | 說明 |
|---|---|
| `lv_line_create(parent)` | 建立線條物件 |
| `lv_line_set_points(line, points, count)` | 設定線段的點座標陣列 |
| `lv_obj_set_style_line_width(line, width, sel)` | 設定線寬 |
| `lv_obj_set_style_line_color(line, color, sel)` | 設定線條顏色 |
| `lv_obj_set_style_line_rounded(line, en, sel)` | 設定線端是否為圓頭 |
| `lv_obj_set_style_line_dash_width(line, w, sel)` | 設定虛線段長度 |
| `lv_obj_set_style_line_dash_gap(line, gap, sel)` | 設定虛線間隔 |
| `lv_obj_set_pos(line, x, y)` | 設定位置 |
| `lv_obj_set_size(line, w, h)` | 設定尺寸 |

### 點座標型別

| 版本 | 型別 | 說明 |
|---|---|---|
| LVGL v9 | `lv_point_precise_t` | 精確座標（支援浮點） |
| LVGL v8 | `lv_point_t` | 整數座標 |

## 12. 設計注意事項

1. **點資料的生命週期**：LVGL 的 `lv_line_set_points` 不會複製點資料，而是保存指標。因此點陣列必須是 `static` 或全域變數，並在線條物件的整個生命週期內保持有效。WASM 預覽以 `static lv_point_precise_t line_points[2]` 實作。

2. **編輯器簡化**：編輯器畫布與簡易預覽一律將線條繪製為水平線，忽略 `points` 中的實際座標。這是刻意的簡化，因為在視覺化編輯器中精確編輯線段端點需要複雜得多的互動設計。

3. **樣式對應差異**：線條的顏色與寬度在編輯器樣式系統中存為 `borderColor` 與 `borderWidth`，但 LVGL 實際使用 `line_color` 與 `line_width` 樣式屬性。`props.lineColor` 與 `props.lineWidth` 提供更精確的控制，優先度高於樣式欄位。

4. **預設高度**：線條的預設高度為 4px（而非 1px），是為了在編輯器中提供足夠的滑鼠互動區域（選取、拖曳、調整大小）。實際繪製時，線條的視覺粗細由線寬決定。

5. **程式碼生成不完整**：目前生成器不會輸出 `lv_line_set_points` 呼叫與對應的 `static` 點陣列宣告。這表示生成的程式碼中線條不會畫出任何線段，需要使用者手動補上點資料。這是待改進的項目。

6. **多點折線**：雖然 `points` 屬性支援多個點（折線），但編輯器 UI 目前只支援兩點直線段的編輯，WASM 預覽也只處理前兩個點。

7. **v8/v9 點型別差異**：v9 使用 `lv_point_precise_t`（支援浮點座標），v8 使用 `lv_point_t`（整數座標）。生成程式碼時需依版本選用正確的型別。
