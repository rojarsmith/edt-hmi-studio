# Slider — 滑桿

<p align="center">
  <a href="../../components/slider.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

**Slider** 是滑桿元件，對應 LVGL 的 `lv_slider` 控制項。使用者拖動旋鈕，在指定範圍內選擇一個數值。在嵌入式 UI 中常用於音量調整、亮度控制、參數設定等情境。

## 2. 元件類型識別碼

```
type: 'slider'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| `input` | 輸入 | ✏️ |

元件面板圖示：🎚️

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 150 |
| defaultHeight | 20 |

## 5. 是否為容器

```
isContainer: false
```

Slider 不是容器元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Container (obj)** — 放在通用容器內（常見用法：與 Label 搭配顯示目前值）
- **Tab View (tabview)** — 放在分頁的內容區域
- **Tile View (tileview)** — 放在圖磚區域
- **Window (win)** — 放在視窗內容區域

### 可以包含的子元件

無。Slider 是葉節點元件，不支援巢狀子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| `min` | `number` | `0` | 最小值 |
| `max` | `number` | `100` | 最大值 |
| `value` | `number` | `50` | 目前值，必須落在 [min, max] 範圍內 |
| `step` | `number` | `undefined` | 步進值，未設定則為連續滑動 |
| `orientation` | `string` | `undefined` | 方向：預設水平，設為 `'vertical'` 時垂直顯示 |

### 屬性定義（componentDefinitions.ts）

```typescript
defaultProps: { min: 0, max: 100, value: 50 }
```

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | 預設狀態 |
| `pressed` | `LV_STATE_PRESSED` | 拖動旋鈕時的狀態 |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態 |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

### 預設樣式（default 狀態）

Slider 軌道使用 LVGL 主題的 `color_primary_muted`（主題色以 20% 疊在白色上），採全圓角設計。

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| `bgColor` | `string` | `'#D3EAFD'` | 軌道背景色，對應 LVGL color_primary_muted |
| `borderColor` | `string` | `'transparent'` | 邊框顏色，預設無邊框 |
| `borderWidth` | `number` | `0` | 邊框寬度 |
| `borderRadius` | `number` | `9999` | 圓角半徑，9999 表示全圓角 |
| `textColor` | `string` | `'#212121'` | 文字顏色（Slider 本身無文字，保留以維持一致性） |
| `opacity` | `number` | `1` | 不透明度 |
| `padding` | `number` | `0` | 內距 |

### LVGL 主題中的部件樣式

在 LVGL 預設主題中：
- **軌道（MAIN）**：`bgColor = #D3EAFD`（primary_muted），全圓角
- **指示器（INDICATOR）**：`bgColor = #2196F3`（primary），全圓角，表示已選取的範圍
- **旋鈕（KNOB）**：`bgColor = #2196F3`（primary），圓形，帶陰影

### 建議的 disabled 狀態樣式

```typescript
disabled: {
  bgColor: '#E0E0E0',
  opacity: 0.5,
}
```

## 9. 事件支援

| LVGL 事件類型 | 說明 |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | 值改變時觸發（拖動過程中持續觸發，最常用） |
| `LV_EVENT_PRESSED` | 按下旋鈕時觸發 |
| `LV_EVENT_RELEASED` | 放開旋鈕時觸發 |
| `LV_EVENT_CLICKED` | 點擊時觸發 |
| `LV_EVENT_FOCUSED` | 取得焦點時觸發 |
| `LV_EVENT_DEFOCUSED` | 失去焦點時觸發 |

最常用的是 `LV_EVENT_VALUE_CHANGED`，在使用者拖動滑桿時持續觸發。可用 `lv_slider_get_value(slider)` 取得目前值。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，Slider 繪製為水平軌道、填滿條與圓形旋鈕：

```tsx
<div className="lvgl-slider" style={{
  width: '100%',
  height: '100%',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
}}>
  {/* 軌道 */}
  <div style={{
    width: '100%',
    height: '4px',
    backgroundColor: '#e0e0e0',
    borderRadius: '2px',
    position: 'relative',
  }}>
    {/* 填滿條（已選取範圍） */}
    <div style={{
      width: `${percentage}%`,
      height: '100%',
      backgroundColor: '#2196F3',
      borderRadius: '2px',
    }} />
  </div>
  {/* 旋鈕 */}
  <div style={{
    position: 'absolute',
    left: `calc(${percentage}% - 8px)`,
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#2196F3',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  }} />
</div>
```

其中 `percentage` 的計算方式：
```
percentage = ((value - min) / (max - min)) * 100
```

- 軌道高度固定 4px，垂直置中
- 填滿條從左側延伸到旋鈕位置，顏色為主題藍
- 旋鈕為 16px 圓形，帶陰影效果

### 簡易預覽繪製（PreviewPanel.tsx — Canvas 2D）

使用 `drawSlider` 函式在 Canvas 2D 上繪製：

```typescript
function drawSlider(ctx, x, y, w, h, opts) {
  const trackHeight = 6;
  const trackY = y + (h - trackHeight) / 2;
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  const knobX = x + progress * w;

  // 1. 繪製軌道背景
  ctx.fillStyle = '#e0e0e0';
  roundRect(ctx, x, trackY, w, trackHeight, 3);
  ctx.fill();

  // 2. 繪製填滿條
  ctx.fillStyle = '#2196f3';
  roundRect(ctx, x, trackY, w * progress, trackHeight, 3);
  ctx.fill();

  // 3. 繪製旋鈕
  ctx.fillStyle = '#2196f3';
  ctx.beginPath();
  ctx.arc(knobX, y + h / 2, 8, 0, Math.PI * 2);
  ctx.fill();
}
```

### LVGL WASM 預覽繪製（ui_from_json.c）

透過 JSON 傳給 WASM 端，由 `create_slider` 函式建立真正的 LVGL 控制項：

```c
static lv_obj_t *create_slider(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *slider = lv_slider_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 50);
        lv_slider_set_range(slider, mn, mx);
        lv_slider_set_value(slider, val, LV_ANIM_OFF);
    }
    return slider;
}
```

在 WASM 預覽中 Slider 完全可互動，使用者可以拖動旋鈕改變數值。

### 程式碼生成輸出（ui.c.ts）

```c
// Create slider: my_slider
my_slider = lv_slider_create(parent);
lv_obj_set_pos(my_slider, 10, 20);
lv_obj_set_size(my_slider, 150, 20);

// Styles
lv_obj_set_style_bg_color(my_slider, lv_color_hex(0xD3EAFD), 0);
lv_obj_set_style_bg_opa(my_slider, LV_OPA_COVER, 0);
lv_obj_set_style_radius(my_slider, 9999, 0);

// Props
lv_slider_set_range(my_slider, 0, 100);
lv_slider_set_value(my_slider, 50, LV_ANIM_OFF);
```

支援生成的擴充屬性：
- `step` → 需在事件回呼中自行實作步進邏輯（會產生註解提示）
- `orientation: 'vertical'` → `lv_obj_set_style_transform_rotation(slider, 900, 0)`（v9）／`lv_obj_set_style_transform_angle(slider, 900, 0)`（v8）

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_slider_create(parent)` |

### 關鍵 API

| API 函式 | 說明 |
|----------|------|
| `lv_slider_set_value(slider, val, anim)` | 設定目前值 |
| `lv_slider_get_value(slider)` | 取得目前值 |
| `lv_slider_set_range(slider, min, max)` | 設定值範圍 |
| `lv_slider_set_left_value(slider, val, anim)` | 設定左側值（範圍模式） |
| `lv_slider_get_left_value(slider)` | 取得左側值（範圍模式） |
| `lv_slider_set_mode(slider, mode)` | 設定模式（NORMAL／SYMMETRICAL／RANGE） |
| `lv_slider_is_dragged(slider)` | 查詢是否正在拖動 |

### 樣式部件（Parts）

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 軌道（track）背景區域 |
| `LV_PART_INDICATOR` | 填滿指示器（從最小值到目前值的彩色區域） |
| `LV_PART_KNOB` | 旋鈕（可拖動的圓形握把） |

常用的樣式組合：
- `LV_PART_MAIN | LV_STATE_DEFAULT` — 軌道背景色、圓角
- `LV_PART_INDICATOR` — 填滿條顏色
- `LV_PART_KNOB` — 旋鈕大小、顏色、陰影
- `LV_PART_KNOB | LV_STATE_PRESSED` — 拖動時旋鈕的樣式變化

## 12. 設計注意事項

1. **值範圍驗證**：編輯器應確保 `value` 始終落在 `[min, max]` 範圍內。繪製時以 `Math.max(0, Math.min(100, ...))` 裁切百分比，避免旋鈕超出軌道。

2. **與 Bar 的差別**：Slider 與 Bar（進度條）視覺上非常相似，但 Slider 可互動（有旋鈕），Bar 僅供顯示。兩者共用相同的軌道加指示器結構，Slider 多了 `LV_PART_KNOB`。

3. **垂直方向**：LVGL 原生不直接支援垂直 Slider，而是透過旋轉 90° 達成。生成程式碼時使用 `transform_rotation(900)` 或 `transform_angle(900)`。編輯器畫布目前尚不支援垂直繪製。

4. **步進值**：LVGL 沒有內建的步進（step）屬性。若需要步進效果，需在 `LV_EVENT_VALUE_CHANGED` 回呼中手動將值對齊到步進格線；生成時會加上註解提示。

5. **全圓角設計**：`borderRadius: 9999` 讓軌道與指示器呈現圓角膠囊形狀，這是 Slider 的標準視覺風格，與 Bar 元件一致。

6. **旋鈕大小**：編輯器畫布中旋鈕固定為 16px 直徑。在 LVGL 中，旋鈕大小由 `LV_PART_KNOB` 的 padding 控制，padding 越大旋鈕越大。

7. **拖動互動**：編輯器畫布與簡易預覽中的 Slider 不可拖動，僅顯示靜態狀態；WASM 預覽則可完全互動拖動。

8. **高度建議**：預設高度 20px 已含旋鈕的顯示空間。軌道本身只有 4～6px 高，旋鈕置中顯示。高度若小於約 16px，旋鈕可能被裁切。

9. **顏色層次**：Slider 使用三層顏色：
   - 軌道背景：`#D3EAFD`（淺藍，primary_muted）
   - 填滿指示器：`#2196F3`（主題藍）
   - 旋鈕：`#2196F3`（主題藍）加陰影

   這種層次在編輯器畫布與簡易預覽中都有呈現。

10. **範圍模式**：LVGL 支援 `LV_SLIDER_MODE_RANGE`（雙旋鈕範圍選擇），但編輯器目前不支援。若需要，請在生成的程式碼中手動加入。
