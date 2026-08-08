# Calendar (calendar) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/calendar.md">繁體中文</a>
</p>

## 1. Name and summary

Calendar displays and selects dates, presenting a month view as a grid. It supports setting the displayed year and month, highlighting today, marking specific dates and selecting a date range. In embedded UIs it is commonly used for date pickers, scheduling, countdown screens and smart-home timer settings.

## 2. Type identifier

```
type: 'calendar'
```

## 3. Category

| Category id | Name | Icon |
|---------|---------|------|
| display | Display | 📅 |

## 4. Default size

| Property | Value |
|------|-----|
| defaultWidth | 220 |
| defaultHeight | 220 |

A calendar needs a fairly large area to fit the month header, the day-name row and six rows of dates.

## 5. Container?

```
isContainer: false
```

Calendar is a pure display widget and cannot hold children.

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

| Name | Type | Default | Description |
|--------|------|--------|------|
| `year` | `number` | `2024` | The displayed year |
| `month` | `number` | `1` | The displayed month (1–12) |
| `showDayNames` | `boolean` | `true` | Whether to show the day-name row |
| `showToday` | `boolean` | `true` | Whether to highlight today |
| `highlightedDates` | `HighlightedDate[]` | `[]` | Dates to mark as highlighted |
| `dateRangeMode` | `boolean` | `false` | Whether date-range selection is enabled |
| `rangeStart` | `string` | `''` | Range start date (format `'YYYY-MM-DD'`) |
| `rangeEnd` | `string` | `''` | Range end date (format `'YYYY-MM-DD'`) |

### The HighlightedDate type

```typescript
interface HighlightedDate {
  year: number;
  month: number;
  day: number;
}
```

### Constraints

- `month` must be 1–12
- `year` should be a sensible value (1970–2099, say)
- Entries in `highlightedDates` must be valid dates
- `rangeStart` and `rangeEnd` only take effect when `dateRangeMode: true`
- `rangeStart` should be on or before `rangeEnd`

## 8. Styles

### Default style (default state) — card style

| Style property | Default | Description |
|----------|--------|------|
| `bgColor` | `#ffffff` | White background (card style) |
| `borderColor` | `#E0E0E0` | Grey border (color_grey) |
| `borderWidth` | `2` | Border width |
| `borderRadius` | `8` | Corner radius |
| `textColor` | `#212121` | Date text colour |
| `opacity` | `1` | Fully opaque |
| `padding` | `0` | No outer padding (the internal layout manages its own spacing) |

### Supported style states

| State | Description |
|------|------|
| `default` | Default state, always applied |
| `pressed` | Pressed (when a date is clicked) |
| `focused` | Focused |
| `disabled` | Disabled |

### Internal areas

| Area | Editor canvas | Simple preview | LVGL part |
|------|-----------|-----------|-----------|
| Month header | Grey background `#f8f8f8`, bold text | Blue background `#2196F3`, white text | `LV_PART_MAIN` (calendar header) |
| Day-name row | Grey text `#666`, 10px | Grey text `#666`, 10px | day names area |
| Date grid | Dark text `#333`, 10px | `textColor`, 11px | `LV_PART_ITEMS` |
| Today | LVGL's own highlight | — | `lv_calendar_set_today_date` |
| Highlighted dates | LVGL's own marker style | — | `lv_calendar_set_highlighted_dates` |

Note that the two editor layers differ deliberately: the canvas keeps the header neutral so it does not compete with the selection highlight, while the simple preview uses the theme's primary colour.

## 9. Supported events

| Event | Description |
|----------|------|
| `LV_EVENT_CLICKED` | Click (on a date) |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_VALUE_CHANGED` | Value changed (fires when the selected date changes) |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

### Date selection

An LVGL calendar exposes the clicked date through `lv_calendar_get_pressed_date(calendar, &date)`, which can be called from the `LV_EVENT_VALUE_CHANGED` callback.

## 10. UI layers

### Editor canvas (CanvasComponent.tsx)

```tsx
<div className="lvgl-calendar" style={{
  width: '100%', height: '100%',
  fontSize: '10px',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden', color: '#333',
}}>
  {/* Month header */}
  <div style={{
    textAlign: 'center', padding: '6px 4px',
    fontWeight: 'bold', borderBottom: '1px solid #eee',
    backgroundColor: '#f8f8f8',
  }}>
    {props.year || 2024} / {props.month || 1}
  </div>

  {/* Date grid */}
  <div style={{
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '1px', flex: 1, padding: '2px',
  }}>
    {/* Day names */}
    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => (
      <div key={`${d}-${index}`} style={{
        textAlign: 'center', fontWeight: 'bold',
        color: '#666', padding: '2px 0',
      }}>{d}</div>
    ))}
    {/* Date numbers (simplified to 1-28) */}
    {Array.from({ length: 28 }).map((_, i) => (
      <div key={i} style={{ textAlign: 'center', padding: '1px 0' }}>
        {i + 1}
      </div>
    ))}
  </div>
</div>
```

Key points:
- A vertical flex layout: the header above the date grid
- The date grid is a 7-column CSS Grid
- Simplified rendering: always 1–28, without working out the real day count or the starting weekday
- The header shows `year / month`

### Simple preview (PreviewPanel.tsx — Canvas 2D)

```typescript
function drawCalendar(ctx, x, y, w, h, opts) {
  // background (card style)
  ctx.fillStyle = opts.bgColor;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill(); ctx.stroke();

  const headerH = 30;
  const dayHeaderH = 20;

  // month header (blue background)
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

  // day-name row
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cellW = w / 7;
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  for (let i = 0; i < 7; i++) {
    ctx.fillText(days[i], x + cellW * i + cellW / 2,
      y + headerH + dayHeaderH / 2);
  }

  // date numbers (for the real month)
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

Key points:
- A blue header showing the month and year, as `Jan 2024`
- Works out the real day count and starting weekday for the month
- Draws at most 6 rows of dates
- The cell height adapts to the widget height

### LVGL WASM preview

**editorStateToJson.ts**: the props (year, month, showDayNames, showToday, highlightedDates and the rest) are serialised in full.

**ui_from_json.c**:

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

Key points:
- Creates a real LVGL calendar with `lv_calendar_create`
- Sets today's date and the displayed month
- The current WASM implementation ignores `highlightedDates` — this could be extended

### Generated code (ui.c.ts)

```c
// Create
lv_obj_t *calendar_1 = lv_calendar_create(parent);
lv_obj_set_pos(calendar_1, 10, 10);
lv_obj_set_size(calendar_1, 220, 220);

// Styles (card style)
lv_obj_set_style_bg_color(calendar_1, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_bg_opa(calendar_1, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(calendar_1, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(calendar_1, 2, 0);
lv_obj_set_style_radius(calendar_1, 8, 0);

// Displayed month
lv_calendar_set_showed_date(calendar_1, 2024, 1);

// Today's date
lv_calendar_set_today_date(calendar_1, 2024, 1, 1);
```

**Highlighted dates:**

```c
// when highlightedDates is not empty
static lv_calendar_date_t calendar_1_hl_dates[] = {
    {.year = 2024, .month = 1, .day = 15},
    {.year = 2024, .month = 1, .day = 20},
};
lv_calendar_set_highlighted_dates(calendar_1, calendar_1_hl_dates, 2);
```

**Hiding the day names:**

```c
// showDayNames === false
// Note: Day names visibility needs custom header configuration
```

## 11. LVGL API mapping

### Creation

| LVGL version | Function |
|-----------|------|
| v8 / v9 | `lv_calendar_create(parent)` |

### Key APIs

| API | Description |
|-----|------|
| `lv_calendar_set_today_date(cal, year, month, day)` | Set today's date (which is highlighted) |
| `lv_calendar_set_showed_date(cal, year, month)` | Set the displayed year and month |
| `lv_calendar_set_highlighted_dates(cal, dates, cnt)` | Set the highlighted dates |
| `lv_calendar_get_pressed_date(cal, &date)` | Read the clicked date |
| `lv_calendar_header_arrow_create(cal)` | Create an arrow-based month navigation header (v9) |
| `lv_calendar_header_dropdown_create(cal)` | Create a dropdown-based month navigation header (v9) |

### The LVGL date structure

```c
typedef struct {
    uint32_t year;
    uint32_t month;  // 1-12
    uint32_t day;    // 1-31
} lv_calendar_date_t;
```

### LVGL parts

| Part | Description |
|------|------|
| `LV_PART_MAIN` | The calendar background |
| `LV_PART_ITEMS` | The date cells |

### Default theme styling (lv_theme_default)

- **MAIN part**: card style — `bg_color=#FFFFFF, border_color=#E0E0E0, border_width=2, radius=8, pad=0`
- **ITEMS part**: the date cell styling
- **Header**: an LVGL calendar can optionally be given a header widget (arrow navigation or a dropdown)

## 12. Design notes

1. **Month navigation header**: LVGL v9 offers `lv_calendar_header_arrow_create` and `lv_calendar_header_dropdown_create`. The editor does not expose the header as a configurable option and generation does not add one; add it in custom code if wanted.

2. **The canvas is a simplification**: the editor canvas always draws 28 days and does not work out the real day count or starting weekday. The simple preview (Canvas 2D) does compute the real layout. For the full picture, use the WASM preview.

3. **Highlighted dates need a static array**: generation emits a `static` array because `lv_calendar_set_highlighted_dates` does not copy the data — it stores the pointer. The array must stay valid for the calendar's lifetime.

4. **showDayNames**: an LVGL calendar shows the day names by default. Hiding them requires custom header configuration; generation currently emits only a comment and does not implement it.

5. **Date range mode**: `dateRangeMode`, `rangeStart` and `rangeEnd` are editor extensions — LVGL has no native range selection. Implementing it means custom logic in the event callback, marking the dates in the range through `highlightedDates`.

6. **Minimum size**: an LVGL calendar needs enough room for a 7×6 date grid plus the header. Too small and the date text overlaps. A minimum size constraint in the editor (around 180×180) would help.

7. **Day-name localisation**: the editor canvas uses single-letter English day names (`S M T W T F S`) and the simple preview uses three-letter ones (`Sun Mon ...`). LVGL's own day names can be customised with `lv_calendar_set_day_names`; generation does not handle localisation and leaves LVGL's English defaults in place.

8. **Extending the WASM preview**: `ui_from_json.c` handles neither `highlightedDates` nor `showDayNames`. To reproduce the design exactly, extend the C side to parse the `highlightedDates` JSON array and call `lv_calendar_set_highlighted_dates`.

9. **Today is not really today**: generation uses the `year`/`month` props with day=1 as today's date. A real application should replace this with the actual date read at runtime (from an RTC, for example). A comment is emitted to remind the user.
