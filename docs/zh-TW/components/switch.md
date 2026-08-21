# Switch — 切換開關

<p align="center">
  <a href="../../components/switch.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

**Switch** 是切換開關元件，對應 LVGL 的 `lv_switch` 控制項。提供滑動式的開／關切換控制項，使用者點擊或滑動即可切換狀態。在嵌入式 UI 中常用於功能開關、模式切換、Wi-Fi／藍牙開關等情境。

## 2. 元件類型識別碼

```
type: 'switch'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| `input` | 輸入 | ✏️ |

元件面板圖示：🔀

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 50 |
| defaultHeight | 26 |

## 5. 是否為容器

```
isContainer: false
```

Switch 不是容器元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Container (obj)** — 放在通用容器內（常見用法：與 Label 搭配組成設定項目）
- **Tab View (tabview)** — 放在分頁的內容區域
- **Tile View (tileview)** — 放在圖磚區域
- **Window (win)** — 放在視窗內容區域

### 可以包含的子元件

無。Switch 是葉節點元件，不支援巢狀子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| `checked` | `boolean` | `false` | 是否為開啟狀態。開啟時旋鈕滑到右側，軌道變為主題色 |

### 屬性定義（componentDefinitions.ts）

```typescript
defaultProps: { checked: false }
```

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | 預設的關閉狀態 |
| `pressed` | `LV_STATE_PRESSED` | 按下狀態 |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態 |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

注意：`LV_STATE_CHECKED` 是 LVGL 內建狀態，開啟時會自動套用。

### 預設樣式（default 狀態）

Switch 關閉時軌道為灰色，並使用全圓角（pill 形狀）。

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| `bgColor` | `string` | `'#E0E0E0'` | 軌道背景色（關閉狀態），對應 LVGL color_grey |
| `borderColor` | `string` | `'transparent'` | 邊框顏色，預設無邊框 |
| `borderWidth` | `number` | `0` | 邊框寬度 |
| `borderRadius` | `number` | `9999` | 圓角半徑，9999 表示全圓角（pill 形狀） |
| `textColor` | `string` | `'#212121'` | 文字顏色（Switch 本身無文字，保留以維持一致性） |
| `opacity` | `number` | `1` | 不透明度 |
| `padding` | `number` | `0` | 內距 |

### LVGL 主題中的 checked 狀態

在 LVGL 預設主題中，Switch 開啟時：
- 軌道背景色變為 `color_primary`（`#2196F3`）
- 旋鈕維持白色

編輯器畫布透過 `props.checked` 動態切換顏色來模擬這個行為。

### 建議的 disabled 狀態樣式

```typescript
disabled: {
  bgColor: '#F5F5F5',
  opacity: 0.5,
}
```

## 9. 事件支援

| LVGL 事件類型 | 說明 |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | 開關狀態改變時觸發（最常用） |
| `LV_EVENT_CLICKED` | 點擊時觸發 |
| `LV_EVENT_PRESSED` | 按下時觸發 |
| `LV_EVENT_RELEASED` | 放開時觸發 |
| `LV_EVENT_FOCUSED` | 取得焦點時觸發 |
| `LV_EVENT_DEFOCUSED` | 失去焦點時觸發 |

最常用的是 `LV_EVENT_VALUE_CHANGED`，在使用者切換開關後觸發。可用 `lv_obj_has_state(sw, LV_STATE_CHECKED)` 取得目前狀態。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，Switch 繪製為一個圓角軌道加上圓形旋鈕：

```tsx
<div className="lvgl-switch" style={{
  width: '100%',
  height: '100%',
  borderRadius: defaultStyle.borderRadius || 13,
  backgroundColor: props.checked ? '#2196F3' : '#ccc',
  position: 'relative',
  minHeight: '20px',
}}>
  <div style={{
    position: 'absolute',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    top: '50%',
    marginTop: '-10px',
    left: props.checked ? 'calc(100% - 23px)' : '3px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transition: 'left 0.2s',
  }} />
</div>
```

- 開啟時軌道為藍色 `#2196F3`，旋鈕滑到右側
- 關閉時軌道為灰色 `#ccc`，旋鈕在左側
- 旋鈕帶有陰影，增強立體感
- 以 CSS transition 呈現滑動動畫（僅在編輯器中可見）

### Prototype 繪製（PreviewPanel.tsx — Canvas 2D）

使用 `drawSwitch` 函式在 Canvas 2D 上繪製：

```typescript
function drawSwitch(ctx, x, y, w, h, opts) {
  const trackWidth = Math.min(w, 50);
  const trackHeight = 24;
  const trackX = x + (w - trackWidth) / 2;
  const trackY = y + (h - trackHeight) / 2;

  // 1. 繪製軌道
  ctx.fillStyle = opts.checked ? '#4caf50' : '#ccc';
  roundRect(ctx, trackX, trackY, trackWidth, trackHeight, trackHeight / 2);
  ctx.fill();

  // 2. 繪製旋鈕
  const knobRadius = trackHeight / 2 - 2;
  const knobX = opts.checked
    ? trackX + trackWidth - knobRadius - 2
    : trackX + knobRadius + 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(knobX, trackY + trackHeight / 2, knobRadius, 0, Math.PI * 2);
  ctx.fill();
}
```

注意：Prototype 的開啟狀態使用綠色 `#4caf50`（Material Green），與畫布繪製的藍色略有差異。

### Simulator 繪製（ui_from_json.c）

透過 JSON 傳給 WASM 端，由 `create_switch` 函式建立真正的 LVGL 控制項：

```c
static lv_obj_t *create_switch(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *sw = lv_switch_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int checked = cjson_get_bool(props, "checked", 0);
        if (checked) lv_obj_add_state(sw, LV_STATE_CHECKED);
    }
    return sw;
}
```

### 程式碼生成輸出（ui.c.ts）

```c
// Create switch: my_switch
my_switch = lv_switch_create(parent);
lv_obj_set_pos(my_switch, 10, 20);
lv_obj_set_size(my_switch, 50, 26);

// Styles
lv_obj_set_style_bg_color(my_switch, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_bg_opa(my_switch, LV_OPA_COVER, 0);
lv_obj_set_style_radius(my_switch, 9999, 0);

// Props（僅當 checked = true 時產生）
lv_obj_add_state(my_switch, LV_STATE_CHECKED);
```

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_switch_create(parent)` |

### 關鍵 API

| API 函式 | 說明 |
|----------|------|
| `lv_switch_create(parent)` | 建立開關控制項 |
| `lv_obj_add_state(sw, LV_STATE_CHECKED)` | 設為開啟狀態 |
| `lv_obj_clear_state(sw, LV_STATE_CHECKED)` | 設為關閉狀態 |
| `lv_obj_has_state(sw, LV_STATE_CHECKED)` | 查詢是否為開啟 |
| `lv_obj_add_state(sw, LV_STATE_DISABLED)` | 設為停用狀態 |

Switch 沒有專屬的 set/get 函式，狀態完全透過 LVGL 通用的狀態管理 API 控制。

### 樣式部件（Parts）

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 軌道（track）區域 |
| `LV_PART_INDICATOR` | 填滿指示器（開啟時的彩色區域） |
| `LV_PART_KNOB` | 旋鈕（圓形滑塊） |

常用的樣式組合：
- `LV_PART_MAIN | LV_STATE_DEFAULT` — 關閉時的軌道樣式
- `LV_PART_INDICATOR | LV_STATE_CHECKED` — 開啟時的指示器顏色
- `LV_PART_KNOB` — 旋鈕的大小、顏色、陰影

## 12. 設計注意事項

1. **無文字屬性**：與 Checkbox 不同，Switch 本身不含文字標籤。若需在旁邊顯示說明文字，應搭配 Label 元件，通常放在同一個 Container 中水平排列。

2. **狀態管理**：Switch 的開／關狀態與 Checkbox 一樣，透過 `LV_STATE_CHECKED` 管理。編輯器中以 `props.checked` 布林值對應。

3. **全圓角設計**：`borderRadius: 9999` 讓軌道呈現 pill（膠囊）形狀，這是 Switch 的標準視覺風格；修改此值會影響整體外觀。

4. **顏色不一致**：三個繪製層的開啟狀態顏色略有差異：
   - 編輯器畫布：`#2196F3`（藍色）
   - Prototype：`#4caf50`（綠色）
   - Simulator：取決於主題設定（預設為藍色）

   建議統一為主題色 `#2196F3`。

5. **尺寸限制**：Switch 的預設尺寸 50×26 是經過調整的觸控友善尺寸。過小會讓旋鈕難以辨識，建議寬度不小於 40px、高度不小於 20px。

6. **旋鈕陰影**：編輯器畫布的旋鈕帶有 `boxShadow` 以增強立體感；在 LVGL 中可透過 `LV_PART_KNOB` 的陰影樣式屬性達到類似效果。

7. **動畫效果**：編輯器畫布以 CSS `transition` 模擬旋鈕滑動動畫。LVGL 原生也支援狀態切換動畫，可用 `lv_obj_set_style_anim_time()` 控制。

8. **無 padding**：Switch 預設 padding 為 0，因為其內部版面（軌道 + 旋鈕）由 LVGL 自動管理，不需要額外內距。
