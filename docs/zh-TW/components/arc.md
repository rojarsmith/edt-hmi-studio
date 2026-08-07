# Arc (arc) — 弧形元件設計文件

<p align="center">
  <a href="../../components/arc.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Arc（弧形／圓弧）是環形顯示元件，透過弧線的角度範圍呈現數值進度。它由背景弧線與前景指示器弧線組成，常用於儀表板、旋鈕指示、環形進度等情境。與 Bar 的線性進度不同，Arc 以圓弧形式呈現資料，視覺上更緊湊也更美觀。

## 2. 元件類型識別碼

```
type: 'arc'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| display | 顯示 | 🔄 |

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 100 |
| defaultHeight | 100 |

Arc 通常為正方形，以確保圓弧置中且不變形。

## 5. 是否為容器

```
isContainer: false
```

Arc 是純顯示元件，不能包含子元件。

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
| `startAngle` | `number` | `135` | 背景弧線起始角度（度），0° 為 3 點鐘方向，順時針遞增 |
| `endAngle` | `number` | `45` | 背景弧線結束角度（度） |
| `value` | `number` | `60` | 目前值，範圍 [min, max] |
| `min` | `number` | `0` | 最小值（選填，預設 0） |
| `max` | `number` | `100` | 最大值（選填，預設 100） |
| `mode` | `'normal' \| 'symmetrical' \| 'reverse'` | `'normal'` | 弧線模式（選用擴充） |

### 屬性限制

- `startAngle` 與 `endAngle` 的範圍為 0-360；當 `startAngle > endAngle` 時弧線會跨越 0° 位置
- 預設角度 135°→45° 形成約 270° 的弧線（由左下經頂部到右下），這是 LVGL arc 的經典外觀
- `value` 會被裁切到 `[min, max]` 範圍內

### 角度說明

```
         270°（12 點）
          |
180° ----+---- 0°（3 點）
（9 點）   |
          90°（6 點）

預設：startAngle=135 → endAngle=45
弧線從左下 135° 經過 180°→270°→0° 到右下 45°
總弧度 = 360 - 135 + 45 = 270°
```

## 8. 樣式設計（styles）

### 預設樣式（default 狀態）

| 樣式屬性 | 預設值 | 說明 |
|----------|--------|------|
| `bgColor` | `transparent` | 背景透明（arc 不需要矩形背景填滿） |
| `borderColor` | `#2196F3` | 在編輯器中沿用為弧線指示器顏色 |
| `borderWidth` | `15` | 在編輯器中沿用為弧線寬度 |
| `borderRadius` | `0` | 不適用（圓弧形狀由 SVG／Canvas 繪製） |
| `textColor` | `#212121` | 中央數值文字的顏色 |
| `opacity` | `1` | 完全不透明 |
| `padding` | `0` | 無內距 |

### LVGL Parts 樣式對應

| Part | 編輯器樣式對應 | LVGL 預設值 |
|------|---------------|-------------|
| `LV_PART_MAIN` | bgColor → bg_opa=TRANSP | 無背景填滿 |
| `LV_PART_INDICATOR` | borderColor → arc_color | `#2196F3`（color_primary） |
| `LV_PART_MAIN`（arc） | — | `#E0E0E0`（color_grey）作為背景弧線 |
| `LV_PART_KNOB` | — | 選用的旋鈕（預設不顯示） |

### 支援的樣式狀態

| 狀態 | 說明 |
|------|------|
| `default` | 預設狀態，一律套用 |
| `pressed` | 按下狀態（arc 可設定為可互動） |
| `focused` | 取得焦點狀態 |
| `disabled` | 停用狀態 |

## 9. 事件支援

| 事件類型 | 說明 |
|----------|------|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | 值改變事件（使用者拖動或由程式設定時觸發） |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

> 注意：LVGL 的 arc 預設是可互動的（使用者可拖動改變值）。編輯器將它歸在「顯示」分類，主要用於唯讀呈現，但不限制使用者加上互動事件。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

```tsx
<div className="lvgl-arc" style={{
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
    {/* 背景弧線 */}
    <circle cx="50" cy="50" r="40" fill="none"
      stroke="#e0e0e0" strokeWidth="8" />
    {/* 指示器弧線 */}
    <circle cx="50" cy="50" r="40" fill="none"
      stroke={defaultStyle.borderColor || '#2196F3'}
      strokeWidth="8"
      strokeDasharray={`${(props.value || 60) * 2.51} 251`}
      strokeLinecap="round"
      transform="rotate(-90 50 50)" />
  </svg>
</div>
```

重點：
- 以 SVG `<circle>` 搭配 `strokeDasharray` 模擬弧線進度
- 背景圓使用灰色 `#e0e0e0`
- 指示器顏色取自 `defaultStyle.borderColor`（預設 `#2196F3`）
- `strokeDasharray` 的計算：圓周長約為 2π×40 ≈ 251，`value * 2.51` 即為填滿長度
- `rotate(-90)` 讓起點從 12 點鐘方向開始

### 簡易預覽繪製（PreviewPanel.tsx — Canvas 2D）

```typescript
function drawArc(ctx, x, y, w, h, opts) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const radius = Math.min(w, h) / 2 - 5;
  const progress = (opts.value - opts.min) / (opts.max - opts.min);
  const startAngle = -Math.PI * 0.75;  // 對應 135°
  const endAngle = Math.PI * 0.75;     // 對應 45°
  const currentAngle = startAngle + (endAngle - startAngle) * progress;

  // 背景弧線
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.stroke();

  // 進度弧線
  ctx.strokeStyle = '#2196f3';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, currentAngle);
  ctx.stroke();

  // 中央數值
  ctx.fillStyle = '#333';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${opts.value}`, centerX, centerY);
}
```

重點：
- 以 Canvas 2D 的 `arc()` 繪製弧線
- 預設弧線範圍為 -135°→135°（約 270°）
- 在弧線中央繪製目前數值文字
- `lineCap = 'round'` 讓弧線端點圓潤

### LVGL WASM 預覽繪製

**editorStateToJson.ts**：props（startAngle、endAngle、value、min、max）直接序列化。

**ui_from_json.c**：

```c
static lv_obj_t *create_arc(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *arc = lv_arc_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 75);
        lv_arc_set_range(arc, mn, mx);
        lv_arc_set_value(arc, val);
    }
    return arc;
}
```

重點：
- 以 `lv_arc_create` 建立真正的 LVGL arc 控制項
- 目前 WASM 實作未設定 `startAngle`／`endAngle`，使用 LVGL 預設值，可再擴充
- 樣式由通用的 `apply_styles` 函式套用

### 程式碼生成輸出（ui.c.ts）

```c
// 建立
lv_obj_t *arc_1 = lv_arc_create(parent);
lv_obj_set_pos(arc_1, 50, 50);
lv_obj_set_size(arc_1, 100, 100);

// 樣式
lv_obj_set_style_bg_opa(arc_1, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(arc_1, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_border_width(arc_1, 15, 0);

// 屬性
lv_arc_set_bg_angles(arc_1, 135, 45);
lv_arc_set_range(arc_1, 0, 100);
lv_arc_set_value(arc_1, 60);
```

選用的模式設定：

```c
// mode 屬性
lv_arc_set_mode(arc_1, LV_ARC_MODE_NORMAL);       // 預設
lv_arc_set_mode(arc_1, LV_ARC_MODE_SYMMETRICAL);  // 對稱模式
lv_arc_set_mode(arc_1, LV_ARC_MODE_REVERSE);      // 反向模式
```

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_arc_create(parent)` |

### 關鍵 API

| API | 說明 |
|-----|------|
| `lv_arc_set_range(arc, min, max)` | 設定值範圍 |
| `lv_arc_set_value(arc, value)` | 設定目前值 |
| `lv_arc_set_bg_angles(arc, start, end)` | 設定背景弧線的起訖角度 |
| `lv_arc_set_angles(arc, start, end)` | 直接設定指示器弧線的角度 |
| `lv_arc_set_mode(arc, mode)` | 設定模式：NORMAL／SYMMETRICAL／REVERSE |
| `lv_arc_set_rotation(arc, deg)` | 設定整體旋轉偏移 |
| `lv_arc_get_value(arc)` | 取得目前值 |
| `lv_arc_get_angle_start(arc)` | 取得指示器起始角度 |
| `lv_arc_get_angle_end(arc)` | 取得指示器結束角度 |

### LVGL Parts

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 背景弧線（track） |
| `LV_PART_INDICATOR` | 前景指示器弧線 |
| `LV_PART_KNOB` | 旋鈕（弧線末端的圓形握把） |

### 預設主題樣式（lv_theme_default）

- **MAIN part（arc track）**：`arc_color = color_grey`（`#E0E0E0`），`arc_width` 由元件大小決定
- **INDICATOR part**：`arc_color = color_primary`（`#2196F3`）
- **KNOB part**：預設不顯示，可透過樣式啟用

## 12. 設計注意事項

1. **角度系統的差異**：LVGL 的角度系統以 3 點鐘方向為 0°，順時針遞增。編輯器以 SVG／Canvas 繪製時需要換算：Canvas 2D 的 0° 同樣在 3 點鐘方向，而 SVG 則以 `rotate(-90)` 把起點移到 12 點鐘方向。

2. **borderColor／borderWidth 的沿用**：編輯器的 `StyleProps` 中沒有專用的 `arcColor`／`arcWidth`，因此以 `borderColor` 與 `borderWidth` 代表弧線的顏色與寬度。生成程式碼時必須特別處理 —— 不應輸出 `lv_obj_set_style_border_*`，而要對應到 `lv_obj_set_style_arc_color` 與 `lv_obj_set_style_arc_width`。

3. **透明背景**：Arc 的 `bgColor` 預設為 `transparent`，這是正確的 —— arc 不需要矩形背景填滿。編輯器畫布中，`resolvedBgColor` 對 arc 類型維持 `transparent`，不做回退。

4. **保持正方形**：Arc 在非正方形容器中會變形。編輯器可在屬性面板提供「保持正方形」的限制選項，或在調整大小時自動維持寬高一致。

5. **可互動性**：LVGL 的 arc 預設可互動（使用者可拖動旋鈕改變值）。若僅用於顯示，應在程式碼中移除 `LV_OBJ_FLAG_CLICKABLE`，或搭配 `lv_arc_set_mode` 做適當設定。

6. **與 Spinner 的關係**：Spinner 本質上就是一個帶有持續旋轉動畫的 Arc。兩者共用相同的預設樣式（`bgColor=transparent`、`borderColor=#2196F3`、`borderWidth=15`），但 Spinner 不開放 value／angle 屬性。

7. **WASM 預覽的角度設定**：目前 `ui_from_json.c` 中的 `create_arc` 未設定 `startAngle`／`endAngle`，使用 LVGL 預設值。若要完整還原編輯器的設計，應擴充 WASM 端讀取這兩個屬性並呼叫 `lv_arc_set_bg_angles`。
