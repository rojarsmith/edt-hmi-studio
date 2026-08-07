# Chart (chart) — 圖表元件設計文件

<p align="center">
  <a href="../../components/chart.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Chart（圖表）是資料視覺化顯示元件，支援折線圖（line）、長條圖（bar）與散佈圖（scatter）三種類型。它可以呈現一個或多個資料系列，並支援格線、圖例、座標軸範圍等設定。在嵌入式 UI 中常用於感測器資料呈現、統計資訊視覺化、趨勢分析等情境。

## 2. 元件類型識別碼

```
type: 'chart'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| display | 顯示 | 📈 |

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 150 |

## 5. 是否為容器

```
isContainer: false
```

Chart 是純顯示元件，不能包含子元件。

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

### 主要屬性

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| `type` | `'line' \| 'bar' \| 'scatter'` | `'line'` | 圖表類型 |
| `series` | `ChartSeries[]` | 見下方 | 資料系列陣列（新版多系列格式） |
| `yAxisMin` | `number` | `0` | Y 軸最小值 |
| `yAxisMax` | `number` | `100` | Y 軸最大值 |
| `xLabels` | `string[]` | `[]` | X 軸標籤（選填） |
| `showLegend` | `boolean` | `false` | 是否顯示圖例 |
| `showGrid` | `boolean` | `true` | 是否顯示格線 |
| `data` | `number[]` | `[10, 20, 30, 25, 40]` | 舊版單系列資料（保留以維持相容） |
| `lineColor` | `string` | `'#2196F3'` | 舊版線條顏色（保留以維持相容） |

### ChartSeries 型別定義

```typescript
interface ChartSeries {
  name: string;       // 系列名稱
  data: number[];     // 資料點陣列
  color: string;      // 系列顏色（十六進位）
  lineWidth: number;  // 線條寬度（px）
  pointSize: number;  // 資料點大小（px）
}
```

### 預設的 series 值

```typescript
series: [
  {
    name: 'Series 1',
    data: [10, 20, 30, 25, 40],
    color: '#2196F3',
    lineWidth: 2,
    pointSize: 4
  }
]
```

### 向後相容說明

`data` 與 `lineColor` 是舊版的單系列欄位。當 `series` 陣列為空或不存在時，會改以 `data` 搭配 `lineColor` 組成單一系列。程式碼生成與各繪製層都接受這兩種格式。

## 8. 樣式設計（styles）

### 預設樣式（default 狀態）— card style

| 樣式屬性 | 預設值 | 說明 |
|----------|--------|------|
| `bgColor` | `#ffffff` | 白色背景（card style） |
| `borderColor` | `#E0E0E0` | 灰色邊框（color_grey） |
| `borderWidth` | `2` | 邊框寬度 |
| `borderRadius` | `8` | 圓角 |
| `textColor` | `#212121` | 文字顏色（座標軸標籤等） |
| `opacity` | `1` | 完全不透明 |
| `padding` | `10` | 內距（繪圖區域與邊框之間的間距） |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，一律套用 |
| `pressed` | 按下狀態 |
| `focused` | 取得焦點狀態 |
| `disabled` | 停用狀態 |

## 9. 事件支援

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | 值改變事件（資料更新時） |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

```tsx
// 相容新舊兩種資料格式
const series = props.series || (props.data
  ? [{ data: props.data, color: props.lineColor || '#2196F3' }]
  : [{ data: [10, 20, 30, 25, 40], color: '#2196F3' }]);
const chartData = series[0]?.data || [10, 20, 30, 25, 40];
const chartColor = series[0]?.color || '#2196F3';
const maxVal = Math.max(...chartData, 1);

<div className="lvgl-chart" style={{
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
  padding: '8px',
  boxSizing: 'border-box',
}}>
  {chartData.map((val, i) => (
    <div key={i} style={{
      width: `${Math.max(8, 80 / chartData.length)}%`,
      height: `${Math.max(2, (val / maxVal) * 100)}%`,
      backgroundColor: chartColor,
      borderRadius: '2px 2px 0 0',
    }} />
  ))}
</div>
```

重點：
- 畫布一律以簡化的長條圖形式繪製，不區分 line／bar／scatter
- 使用 flex 版面，每個資料點繪製成一根長條
- 長條高度依資料值與最大值的比例計算
- 只繪製第一個系列，以簡化預覽

### 簡易預覽繪製（PreviewPanel.tsx — Canvas 2D）

```typescript
function drawChart(ctx, x, y, w, h, opts) {
  // 背景（card style）
  ctx.fillStyle = opts.bgColor;
  ctx.strokeStyle = opts.borderColor;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill(); ctx.stroke();

  const pad = 10;
  const chartX = x + pad, chartY = y + pad;
  const chartW = w - pad * 2, chartH = h - pad * 2;
  const maxVal = Math.max(...opts.data, 1);
  const minVal = Math.min(...opts.data, 0);
  const range = maxVal - minVal || 1;

  // 格線
  if (opts.showGrid) {
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) { /* 水平格線 */ }
  }

  if (opts.type === 'bar') {
    // 長條圖：每個資料點一個矩形
  } else {
    // 折線圖：連線加上資料點圓點
    ctx.strokeStyle = opts.lineColor; ctx.lineWidth = 2;
    // ... 繪製折線與圓點
  }
}
```

重點：
- 區分 `bar` 與 `line` 兩種繪製模式
- 折線圖繪製連線與資料點圓點
- 長條圖繪製等寬矩形
- 支援格線開關
- 使用舊版的 `data` 與 `lineColor` 欄位

### LVGL WASM 預覽繪製

**editorStateToJson.ts**：props 完整序列化，包含 series 陣列與舊版的 data 欄位。

**ui_from_json.c**：

```c
static lv_obj_t *create_chart(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *chart = lv_chart_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        // 圖表類型
        const char *type_str = cjson_get_string(props, "type");
        if (type_str && strcmp(type_str, "bar") == 0)
            lv_chart_set_type(chart, LV_CHART_TYPE_BAR);
        else
            lv_chart_set_type(chart, LV_CHART_TYPE_LINE);

        // 舊版的 data 欄位
        cJSON *data = cJSON_GetObjectItemCaseSensitive(props, "data");
        if (cJSON_IsArray(data)) {
            int cnt = cJSON_GetArraySize(data);
            lv_chart_set_point_count(chart, cnt);
            lv_chart_series_t *ser = lv_chart_add_series(chart,
                lv_color_hex(0x2196F3), LV_CHART_AXIS_PRIMARY_Y);
            cJSON *val;
            cJSON_ArrayForEach(val, data) {
                if (cJSON_IsNumber(val))
                    lv_chart_set_next_value(chart, ser, val->valueint);
            }
        }
    }
    return chart;
}
```

重點：
- 目前 WASM 實作只處理舊版的 `data` 欄位，且僅單一系列
- 多系列 `series` 陣列的 WASM 支援尚待擴充
- 圖表類型支援 line 與 bar

### 程式碼生成輸出（ui.c.ts）

**多系列模式（series 陣列）：**

```c
// 建立
lv_obj_t *chart_1 = lv_chart_create(parent);
lv_obj_set_pos(chart_1, 10, 10);
lv_obj_set_size(chart_1, 200, 150);

// 樣式（card style）
lv_obj_set_style_bg_color(chart_1, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_bg_opa(chart_1, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(chart_1, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(chart_1, 2, 0);
lv_obj_set_style_radius(chart_1, 8, 0);
lv_obj_set_style_pad_all(chart_1, 10, 0);

// 圖表類型
lv_chart_set_type(chart_1, LV_CHART_TYPE_LINE);

// Y 軸範圍
lv_chart_set_range(chart_1, LV_CHART_AXIS_PRIMARY_Y, 0, 100);

// 系列 0
lv_chart_series_t *chart_1_ser_0 = lv_chart_add_series(chart_1,
    lv_color_hex(0x2196F3), LV_CHART_AXIS_PRIMARY_Y);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 10);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 20);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 30);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 25);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 40);
```

**舊版單系列模式（data 陣列）：**

```c
lv_chart_set_point_count(chart_1, 5);
lv_chart_series_t *chart_1_ser = lv_chart_add_series(chart_1,
    lv_color_hex(0x2196F3), LV_CHART_AXIS_PRIMARY_Y);
lv_chart_set_ext_y_array(chart_1, chart_1_ser,
    (int32_t[]){10, 20, 30, 25, 40});  // v9：int32_t，v8：lv_coord_t
```

**隱藏格線：**

```c
// showGrid === false
lv_obj_set_style_line_opa(chart_1, LV_OPA_TRANSP, LV_PART_MAIN);
```

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_chart_create(parent)` |

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_chart_set_type(chart, type)` | 設定圖表類型：`LV_CHART_TYPE_LINE`／`LV_CHART_TYPE_BAR`／`LV_CHART_TYPE_SCATTER` |
| `lv_chart_set_point_count(chart, cnt)` | 設定資料點數量 |
| `lv_chart_add_series(chart, color, axis)` | 加入資料系列 |
| `lv_chart_set_next_value(chart, ser, val)` | 逐一附加資料點 |
| `lv_chart_set_ext_y_array(chart, ser, arr)` | 將系列指向外部的 Y 資料陣列 |
| `lv_chart_set_range(chart, axis, min, max)` | 設定座標軸範圍 |
| `lv_chart_refresh(chart)` | 重新整理圖表 |
| `lv_chart_set_div_line_count(chart, hdiv, vdiv)` | 設定格線數量 |
| `lv_chart_set_zoom_x(chart, zoom)` | X 軸縮放 |
| `lv_chart_set_zoom_y(chart, zoom)` | Y 軸縮放 |

### LVGL Parts

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 圖表背景與格線 |
| `LV_PART_ITEMS` | 資料點（折線圖的圓點、長條圖的長條） |
| `LV_PART_INDICATOR` | 游標／十字線 |
| `LV_PART_CURSOR` | 游標 |
| `LV_PART_TICKS` | 座標軸刻度 |

### 預設主題樣式（lv_theme_default）

- **MAIN part**：card style — `bg_color=#FFFFFF, border_color=#E0E0E0, border_width=2, radius=8, pad=10`
- **ITEMS part**：`bg_color=color_primary`（資料點顏色）
- **TICKS part**：`text_color=color_text, line_color=color_grey`

## 12. 設計注意事項

1. **多系列與舊版相容**：`series` 是新版的多系列格式，`data` 搭配 `lineColor` 是舊版單系列格式，兩者並存以維持向後相容。生成程式碼時優先使用 `series`，找不到才退回 `data`。屬性面板應引導使用者採用 `series`。

2. **畫布繪製是簡化版**：編輯器畫布上的 chart 一律以長條形式繪製，並不反映 LVGL 真實的繪製結果。要看真實效果請用 WASM 預覽。

3. **資料點數量**：LVGL chart 需要事先設定 `point_count`。`lv_chart_set_next_value` 會循環覆寫舊資料；使用 `lv_chart_set_ext_y_array` 時，陣列長度必須與 `point_count` 一致。

4. **效能考量**：在嵌入式裝置上，資料點過多（超過約 100 個）可能明顯拖慢繪製。屬性面板可提示使用者留意。

5. **散佈圖支援**：程式碼生成支援 `LV_CHART_TYPE_SCATTER`，但編輯器畫布與簡易預覽都未實作散佈圖繪製，會一律退回折線形式。

6. **格線控制**：`showGrid` 是透過設定 `line_opa = LV_OPA_TRANSP` 來隱藏格線。更細緻的控制（水平／垂直分割線數量）可用 `lv_chart_set_div_line_count`，目前編輯器未開放為屬性。

7. **擴充 WASM 預覽**：目前 `ui_from_json.c` 只處理舊版的 `data` 欄位。要完整支援多系列，需在 C 端解析 `series` JSON 陣列，並為每個系列呼叫 `lv_chart_add_series` 與 `lv_chart_set_next_value`。

8. **Card Style 一致性**：Chart 使用 card style（白色背景加灰色邊框），與 Table、Calendar、Textarea、Dropdown 等元件維持視覺一致，這是 LVGL 預設主題的設計規範。
