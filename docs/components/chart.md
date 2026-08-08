# Chart (chart) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/chart.md">繁體中文</a>
</p>

## 1. Name and summary

Chart is a data-visualisation widget supporting three types: line, bar and scatter. It can display one or several data series, with configurable grid lines, legend and axis ranges. In embedded UIs it is commonly used for sensor readouts, statistics and trend analysis.

## 2. Type identifier

```
type: 'chart'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| display | Display | 📈 |

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 200 |
| defaultHeight | 150 |

## 5. Container?

```
isContainer: false
```

Chart is a pure display widget and cannot hold children.

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

### Main properties

| Name | Type | Default | Description |
|--------|------|--------|------|
| `type` | `'line' \| 'bar' \| 'scatter'` | `'line'` | Chart type |
| `series` | `ChartSeries[]` | see below | The data series (the newer multi-series format) |
| `yAxisMin` | `number` | `0` | Y axis minimum |
| `yAxisMax` | `number` | `100` | Y axis maximum |
| `xLabels` | `string[]` | `[]` | X axis labels (optional) |
| `showLegend` | `boolean` | `false` | Whether to show the legend |
| `showGrid` | `boolean` | `true` | Whether to show grid lines |
| `data` | `number[]` | `[10, 20, 30, 25, 40]` | Legacy single-series data (kept for compatibility) |
| `lineColor` | `string` | `'#2196F3'` | Legacy line colour (kept for compatibility) |

### The ChartSeries type

```typescript
interface ChartSeries {
  name: string;       // series name
  data: number[];     // the data points
  color: string;      // series colour (hex)
  lineWidth: number;  // line width in px
  pointSize: number;  // data point size in px
}
```

### The default series

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

### Backward compatibility

`data` and `lineColor` are the legacy single-series fields. When the `series` array is empty or absent, a single series is built from `data` plus `lineColor` instead. Both code generation and the rendering layers accept either format.

## 8. Styles

### Default style (default state) — card style

| Style property | Default | Description |
|----------|--------|------|
| `bgColor` | `#ffffff` | White background (card style) |
| `borderColor` | `#E0E0E0` | Grey border (color_grey) |
| `borderWidth` | `2` | Border width |
| `borderRadius` | `8` | Corner radius |
| `textColor` | `#212121` | Text colour (axis labels and similar) |
| `opacity` | `1` | Fully opaque |
| `padding` | `10` | Padding (the gap between the plot area and the border) |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always applied |
| `pressed` | Pressed |
| `focused` | Focused |
| `disabled` | Disabled |

## 9. Supported events

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | Value changed (when the data updates) |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

```tsx
// accept either data format
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

Key points:
- The canvas always draws a simplified bar form, regardless of line/bar/scatter
- Flex layout, with one bar per data point
- Bar height is the data value as a proportion of the maximum
- Only the first series is drawn, to keep the preview simple

### Simple preview (PreviewPanel.tsx — Canvas 2D)

```typescript
function drawChart(ctx, x, y, w, h, opts) {
  // background (card style)
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

  // grid lines
  if (opts.showGrid) {
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) { /* horizontal grid */ }
  }

  if (opts.type === 'bar') {
    // bar chart: one rectangle per data point
  } else {
    // line chart: a polyline plus point markers
    ctx.strokeStyle = opts.lineColor; ctx.lineWidth = 2;
    // ... draw the line and the points
  }
}
```

Key points:
- Distinguishes `bar` from `line`
- The line chart draws a polyline with circular point markers
- The bar chart draws equal-width rectangles
- Grid lines can be toggled
- Uses the legacy `data` and `lineColor` fields

### LVGL WASM preview

**editorStateToJson.ts**: the props are serialised in full, including the series array and the legacy data field.

**ui_from_json.c**:

```c
static lv_obj_t *create_chart(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *chart = lv_chart_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        // chart type
        const char *type_str = cjson_get_string(props, "type");
        if (type_str && strcmp(type_str, "bar") == 0)
            lv_chart_set_type(chart, LV_CHART_TYPE_BAR);
        else
            lv_chart_set_type(chart, LV_CHART_TYPE_LINE);

        // the legacy data field
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

Key points:
- The WASM implementation currently handles only the legacy `data` field, as a single series
- Multi-series support on the WASM side is still to be added
- Line and bar types are supported

### Generated code (ui.c.ts)

**Multi-series (the series array):**

```c
// Create
lv_obj_t *chart_1 = lv_chart_create(parent);
lv_obj_set_pos(chart_1, 10, 10);
lv_obj_set_size(chart_1, 200, 150);

// Styles (card style)
lv_obj_set_style_bg_color(chart_1, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_bg_opa(chart_1, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(chart_1, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(chart_1, 2, 0);
lv_obj_set_style_radius(chart_1, 8, 0);
lv_obj_set_style_pad_all(chart_1, 10, 0);

// Chart type
lv_chart_set_type(chart_1, LV_CHART_TYPE_LINE);

// Y axis range
lv_chart_set_range(chart_1, LV_CHART_AXIS_PRIMARY_Y, 0, 100);

// Series 0
lv_chart_series_t *chart_1_ser_0 = lv_chart_add_series(chart_1,
    lv_color_hex(0x2196F3), LV_CHART_AXIS_PRIMARY_Y);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 10);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 20);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 30);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 25);
lv_chart_set_next_value(chart_1, chart_1_ser_0, 40);
```

**Legacy single series (the data array):**

```c
lv_chart_set_point_count(chart_1, 5);
lv_chart_series_t *chart_1_ser = lv_chart_add_series(chart_1,
    lv_color_hex(0x2196F3), LV_CHART_AXIS_PRIMARY_Y);
lv_chart_set_ext_y_array(chart_1, chart_1_ser,
    (int32_t[]){10, 20, 30, 25, 40});  // v9: int32_t, v8: lv_coord_t
```

**Hiding the grid:**

```c
// showGrid === false
lv_obj_set_style_line_opa(chart_1, LV_OPA_TRANSP, LV_PART_MAIN);
```

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_chart_create(parent)` |

### Key APIs

| API | Description |
|-----|------|
| `lv_chart_set_type(chart, type)` | Set the type: `LV_CHART_TYPE_LINE` / `LV_CHART_TYPE_BAR` / `LV_CHART_TYPE_SCATTER` |
| `lv_chart_set_point_count(chart, cnt)` | Set the number of data points |
| `lv_chart_add_series(chart, color, axis)` | Add a data series |
| `lv_chart_set_next_value(chart, ser, val)` | Append data points one at a time |
| `lv_chart_set_ext_y_array(chart, ser, arr)` | Point the series at an external Y array |
| `lv_chart_set_range(chart, axis, min, max)` | Set an axis range |
| `lv_chart_refresh(chart)` | Refresh the chart |
| `lv_chart_set_div_line_count(chart, hdiv, vdiv)` | Set the number of grid lines |
| `lv_chart_set_zoom_x(chart, zoom)` | Zoom the X axis |
| `lv_chart_set_zoom_y(chart, zoom)` | Zoom the Y axis |

### LVGL parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | Chart background and grid lines |
| `LV_PART_ITEMS` | The data points (circles on a line chart, bars on a bar chart) |
| `LV_PART_INDICATOR` | Cursor / crosshair |
| `LV_PART_CURSOR` | Cursor |
| `LV_PART_TICKS` | Axis ticks |

### Default theme styling (lv_theme_default)

- **MAIN part**: card style — `bg_color=#FFFFFF, border_color=#E0E0E0, border_width=2, radius=8, pad=10`
- **ITEMS part**: `bg_color=color_primary` (the data point colour)
- **TICKS part**: `text_color=color_text, line_color=color_grey`

## 12. Design notes

1. **Multi-series versus legacy**: `series` is the newer multi-series format; `data` plus `lineColor` is the legacy single-series one. Both are kept for backward compatibility. Generation prefers `series` and falls back to `data`. The property panel should steer users towards `series`.

2. **The canvas is a simplification**: the chart on the editor canvas is drawn as bars only and does not reflect what LVGL actually renders. Use the WASM preview for the real thing.

3. **Point count**: an LVGL chart needs its `point_count` set up front. `lv_chart_set_next_value` cycles and overwrites older data; `lv_chart_set_ext_y_array` requires the array length to match `point_count`.

4. **Performance**: on an embedded device, a large number of points (over about 100) can slow rendering noticeably. The property panel could warn about this.

5. **Scatter charts**: generation supports `LV_CHART_TYPE_SCATTER`, but neither the editor canvas nor the simple preview implements scatter rendering — both fall back to the line form.

6. **Grid control**: `showGrid` hides the grid by setting `line_opa = LV_OPA_TRANSP`. Finer control (the number of horizontal and vertical division lines) is available through `lv_chart_set_div_line_count`, which the editor does not currently expose.

7. **Extending the WASM preview**: `ui_from_json.c` handles only the legacy `data` field today. Full multi-series support means parsing the `series` JSON array on the C side and calling `lv_chart_add_series` and `lv_chart_set_next_value` for each one.

8. **Card style consistency**: Chart uses the card style (white background, grey border), matching Table, Calendar, Textarea and Dropdown. That consistency comes from LVGL's default theme.
