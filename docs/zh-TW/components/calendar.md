# Calendar (calendar) — 日曆元件設計文件

<p align="center">
  <a href="../../components/calendar.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Calendar（日曆）是日期呈現與選擇元件，以月檢視的格狀形式顯示日期。它支援設定目前顯示的年月、高亮今天、標記特定日期、日期範圍選擇等功能。在嵌入式 UI 中常用於日期選擇器、行程管理、倒數畫面、智慧家庭定時設定等情境。

## 2. 元件類型識別碼

```
type: 'calendar'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| display | 顯示 | 📅 |

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 220 |
| defaultHeight | 220 |

日曆需要較大的尺寸，才能容納月份標題、星期標題列與 6 列日期格狀。

## 5. 是否為容器

```
isContainer: false
```

Calendar 是純顯示元件，不能包含子元件。

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
| `year` | `number` | `2024` | 目前顯示的年份 |
| `month` | `number` | `1` | 目前顯示的月份（1–12） |
| `showDayNames` | `boolean` | `true` | 是否顯示星期標題列 |
| `showToday` | `boolean` | `true` | 是否高亮顯示今天 |
| `highlightedDates` | `HighlightedDate[]` | `[]` | 需要高亮標記的日期清單 |
| `dateRangeMode` | `boolean` | `false` | 是否啟用日期範圍選擇模式 |
| `rangeStart` | `string` | `''` | 範圍起始日期（格式：`'YYYY-MM-DD'`） |
| `rangeEnd` | `string` | `''` | 範圍結束日期（格式：`'YYYY-MM-DD'`） |

### HighlightedDate 型別定義

```typescript
interface HighlightedDate {
  year: number;
  month: number;
  day: number;
}
```

### 屬性限制

- `month` 範圍為 1–12
- `year` 應為合理年份（例如 1970–2099）
- `highlightedDates` 中的日期必須是有效日期
- `rangeStart` 與 `rangeEnd` 僅在 `dateRangeMode: true` 時生效
- `rangeStart` 應早於或等於 `rangeEnd`

## 8. 樣式設計（styles）

### 預設樣式（default 狀態）— card style

| 樣式屬性 | 預設值 | 說明 |
|----------|--------|------|
| `bgColor` | `#ffffff` | 白色背景（card style） |
| `borderColor` | `#E0E0E0` | 灰色邊框（color_grey） |
| `borderWidth` | `2` | 邊框寬度 |
| `borderRadius` | `8` | 圓角 |
| `textColor` | `#212121` | 日期文字顏色 |
| `opacity` | `1` | 完全不透明 |
| `padding` | `0` | 無外層內距（內部版面自行管理間距） |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，一律套用 |
| `pressed` | 按下狀態（日期被點擊時） |
| `focused` | 取得焦點狀態 |
| `disabled` | 停用狀態 |

### 內部區域

| 區域 | 編輯器畫布 | 簡易預覽 | LVGL Part |
|------|-----------|-----------|-----------|
| 月份標題列 | 灰色背景 `#f8f8f8`，粗體文字 | 藍色背景 `#2196F3`，白色文字 | `LV_PART_MAIN`（calendar header） |
| 星期標題列 | 灰色文字 `#666`，10px | 灰色文字 `#666`，10px | day names area |
| 日期格狀 | 深色文字 `#333`，10px | `textColor`，11px | `LV_PART_ITEMS` |
| 今天 | 由 LVGL 自行高亮 | — | `lv_calendar_set_today_date` |
| 高亮日期 | 由 LVGL 自行標記 | — | `lv_calendar_set_highlighted_dates` |

兩個編輯器層刻意不同：畫布的標題列維持中性色，避免與選取高亮互相干擾；簡易預覽則使用主題的主色。

## 9. 事件支援

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件（點到某個日期） |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | 值改變事件（選取的日期改變時觸發） |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

### 日期選擇

LVGL calendar 可透過 `lv_calendar_get_pressed_date(calendar, &date)` 取得被點擊的日期，可在 `LV_EVENT_VALUE_CHANGED` 回呼中使用。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

```tsx
<div className="lvgl-calendar" style={{
  width: '100%', height: '100%',
  fontSize: '10px',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden', color: '#333',
}}>
  {/* 月份標題列 */}
  <div style={{
    textAlign: 'center', padding: '6px 4px',
    fontWeight: 'bold', borderBottom: '1px solid #eee',
    backgroundColor: '#f8f8f8',
  }}>
    {props.year || 2024} / {props.month || 1}
  </div>

  {/* 日期格狀 */}
  <div style={{
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '1px', flex: 1, padding: '2px',
  }}>
    {/* 星期標題 */}
    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => (
      <div key={`${d}-${index}`} style={{
        textAlign: 'center', fontWeight: 'bold',
        color: '#666', padding: '2px 0',
      }}>{d}</div>
    ))}
    {/* 日期數字（簡化為 1-28） */}
    {Array.from({ length: 28 }).map((_, i) => (
      <div key={i} style={{ textAlign: 'center', padding: '1px 0' }}>
        {i + 1}
      </div>
    ))}
  </div>
</div>
```

重點：
- 垂直 flex 版面：標題列在上，日期格狀在下
- 日期格狀使用 7 欄的 CSS Grid
- 簡化繪製：固定顯示 1–28，不計算實際天數與起始星期
- 標題列顯示 `年 / 月`

### 簡易預覽繪製（PreviewPanel.tsx — Canvas 2D）

```typescript
function drawCalendar(ctx, x, y, w, h, opts) {
  // 背景（card style）
  ctx.fillStyle = opts.bgColor;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill(); ctx.stroke();

  const headerH = 30;
  const dayHeaderH = 20;

  // 月份標題列（藍色背景）
  ctx.fillStyle = '#2196F3';
  roundRect(ctx, x, y, w, headerH, 4);
  ctx.fill();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${monthNames[opts.month - 1] || 'Jan'} ${opts.year}`,
    x + w / 2, y + headerH / 2);

  // 星期標題列
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cellW = w / 7;
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  for (let i = 0; i < 7; i++) {
    ctx.fillText(days[i], x + cellW * i + cellW / 2,
      y + headerH + dayHeaderH / 2);
  }

  // 日期數字（依實際月份計算）
  const firstDay = new Date(opts.year, opts.month - 1, 1).getDay();
  const daysInMonth = new Date(opts.year, opts.month, 0).getDate();
  const cellH = Math.min(18, (h - headerH - dayHeaderH) / 6);
  let day = 1;
  for (let row = 0; row < 6 && day <= daysInMonth; row++) {
    for (let col = 0; col < 7 && day <= daysInMonth; col++) {
      if (row === 0 && col < firstDay) continue;
      ctx.fillText(`${day}`,
        x + cellW * col + cellW / 2,
        y + headerH + dayHeaderH + cellH * row + cellH / 2);
      day++;
    }
  }
}
```

重點：
- 藍色標題列顯示月份與年份，格式為 `Jan 2024`
- 會計算該月份實際的天數與起始星期
- 最多繪製 6 列日期
- 儲存格高度依元件高度自適應

### LVGL WASM 預覽繪製

**editorStateToJson.ts**：props（year、month、showDayNames、showToday、highlightedDates 等）完整序列化。

**ui_from_json.c**：

```c
static lv_obj_t *create_calendar(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *cal = lv_calendar_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int year = cjson_get_int(props, "year", 2026);
        int month = cjson_get_int(props, "month", 1);
        lv_calendar_set_today_date(cal, year, month, 1);
        lv_calendar_set_showed_date(cal, year, month);
    }
    return cal;
}
```

重點：
- 以 `lv_calendar_create` 建立真正的 LVGL calendar
- 設定今天的日期與顯示的月份
- 目前 WASM 實作忽略 `highlightedDates`（可再擴充）

### 程式碼生成輸出（ui.c.ts）

```c
// 建立
lv_obj_t *calendar_1 = lv_calendar_create(parent);
lv_obj_set_pos(calendar_1, 10, 10);
lv_obj_set_size(calendar_1, 220, 220);

// 樣式（card style）
lv_obj_set_style_bg_color(calendar_1, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_bg_opa(calendar_1, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(calendar_1, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(calendar_1, 2, 0);
lv_obj_set_style_radius(calendar_1, 8, 0);

// 顯示的月份
lv_calendar_set_showed_date(calendar_1, 2024, 1);

// 今天的日期
lv_calendar_set_today_date(calendar_1, 2024, 1, 1);
```

**高亮日期：**

```c
// highlightedDates 不為空時
static lv_calendar_date_t calendar_1_hl_dates[] = {
    {.year = 2024, .month = 1, .day = 15},
    {.year = 2024, .month = 1, .day = 20},
};
lv_calendar_set_highlighted_dates(calendar_1, calendar_1_hl_dates, 2);
```

**隱藏星期標題：**

```c
// showDayNames === false
// Note: Day names visibility needs custom header configuration
```

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_calendar_create(parent)` |

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_calendar_set_today_date(cal, year, month, day)` | 設定今天的日期（會被高亮） |
| `lv_calendar_set_showed_date(cal, year, month)` | 設定顯示的年月 |
| `lv_calendar_set_highlighted_dates(cal, dates, cnt)` | 設定高亮標記的日期清單 |
| `lv_calendar_get_pressed_date(cal, &date)` | 取得被點擊的日期 |
| `lv_calendar_header_arrow_create(cal)` | 建立箭頭式的月份導覽標題（v9） |
| `lv_calendar_header_dropdown_create(cal)` | 建立下拉式的月份導覽標題（v9） |

### LVGL 日期結構

```c
typedef struct {
    uint32_t year;
    uint32_t month;  // 1-12
    uint32_t day;    // 1-31
} lv_calendar_date_t;
```

### LVGL Parts

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 日曆背景 |
| `LV_PART_ITEMS` | 日期儲存格 |

### 預設主題樣式（lv_theme_default）

- **MAIN part**：card style — `bg_color=#FFFFFF, border_color=#E0E0E0, border_width=2, radius=8, pad=0`
- **ITEMS part**：日期儲存格樣式
- **Header**：LVGL calendar 可選擇加上 header 元件（箭頭導覽或下拉選擇）

## 12. 設計注意事項

1. **月份導覽標題**：LVGL v9 提供 `lv_calendar_header_arrow_create` 與 `lv_calendar_header_dropdown_create` 兩種導覽標題。編輯器未將其作為可設定選項，生成程式碼也不會自動加入，需要時請在自訂程式碼中加上。

2. **畫布繪製是簡化版**：編輯器畫布固定繪製 28 天，不計算實際天數與起始星期；簡易預覽（Canvas 2D）則有計算真實的日曆版面。要看完整效果請用 WASM 預覽。

3. **高亮日期需要 static 陣列**：生成程式碼會輸出 `static` 陣列，因為 `lv_calendar_set_highlighted_dates` 不會複製資料，只保存指標。該陣列必須在 calendar 的生命週期內保持有效。

4. **showDayNames**：LVGL calendar 預設會顯示星期標題。要隱藏需要自訂 header 設定，目前生成程式碼只輸出註解提示，尚未實作。

5. **日期範圍模式**：`dateRangeMode`、`rangeStart`、`rangeEnd` 是編輯器的擴充屬性，LVGL 原生不支援日期範圍選擇。實作需在事件回呼中自行處理邏輯，搭配 `highlightedDates` 標記範圍內的日期。

6. **最小尺寸**：LVGL calendar 需要足夠空間容納 7×6 的日期格狀加上標題。尺寸過小會讓日期文字重疊，建議在編輯器中設定最小尺寸限制（約 180×180）。

7. **星期標題的在地化**：編輯器畫布使用單字母英文星期（`S M T W T F S`），簡易預覽使用三字母（`Sun Mon …`）。LVGL 本身的星期標題可用 `lv_calendar_set_day_names` 自訂；生成程式碼未處理在地化，會沿用 LVGL 預設的英文。

8. **擴充 WASM 預覽**：目前 `ui_from_json.c` 未處理 `highlightedDates` 與 `showDayNames`。要完整還原編輯器的設計，需在 C 端解析 `highlightedDates` JSON 陣列並呼叫 `lv_calendar_set_highlighted_dates`。

9. **today 不是真正的今天**：生成程式碼是以 props 中的 `year`／`month` 加上 day=1 作為今天的日期。實際應用應改為執行時取得的真實日期（例如透過 RTC）。生成時會輸出註解提醒使用者。
