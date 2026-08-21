# Spinner (spinner) — 載入動畫元件設計文件

<p align="center">
  <a href="../../components/spinner.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Spinner（載入動畫）用於顯示載入／等待狀態。在 LVGL 中，Spinner 是 Arc（弧形）的特殊化版本，以持續旋轉的弧形動畫表示背景操作正在進行。旋轉速度與弧形長度都可以設定。

Spinner 不是容器元件（`isContainer = false`），不能包含子元件。

## 2. 元件類型識別碼

```
type: 'spinner'
```

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `display` |
| 分類名稱 | 顯示 |
| 分類圖示 | 📊 |
| 元件圖示 | ⏳ |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 50 |
| defaultHeight | 50 |

> Spinner 通常為正方形，寬高相等，才能正確呈現圓形旋轉動畫。

## 5. 是否為容器

```
isContainer: false
```

Spinner 是純顯示元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Button (btn)** — 作為按鈕內的載入狀態指示
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區
- **Tile View (tileview)** — 放在圖磚區域內
- **Window (win)** — 放在視窗內容區

### 可以包含的子元件

無。Spinner 不是容器，不能包含任何子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `speed` | `number` | `1000` | 旋轉一圈的時間（毫秒） |
| `arcLength` | `number` | `60` | 旋轉弧形的角度長度（度） |

### props 型別定義

```typescript
interface SpinnerProps {
  speed: number;
  arcLength?: number;
}
```

### 屬性說明

- `speed`：控制旋轉速度。值越小轉得越快，1000ms 表示 1 秒轉一圈。
- `arcLength`：控制可見弧形的長度。60° 表示弧形佔圓周的 1/6，值越大弧形越長。

這兩個值如何傳給 LVGL 取決於版本，詳見 [LVGL API 對應](#11-lvgl-api-對應)。

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
| `borderColor` | `string` | `'#2196F3'` | 邊框顏色（作為弧形指示器顏色，即 LVGL 主題的 primary 色） |
| `borderWidth` | `number` | `15` | 邊框寬度（對應為弧形線寬） |
| `borderRadius` | `number` | `0` | 圓角半徑（不使用） |
| `textColor` | `string` | `'#212121'` | 文字顏色 |
| `opacity` | `number` | `1` | 不透明度 |
| `padding` | `number` | `0` | 內距 |

### 樣式來源說明

Spinner 的預設樣式與 Arc 元件相同，來自 LVGL 預設主題：
- 弧形背景軌道顏色：`#E0E0E0`（`color_grey`）
- 弧形指示器顏色：`#2196F3`（`color_primary`）
- 弧形線寬：15px

> 注意：在編輯器的樣式系統中，`borderColor` 用來存放弧形指示器顏色，`borderWidth` 用來存放弧形線寬。這是一種對應約定；LVGL 本身使用 `arc_color`（套在 `LV_PART_INDICATOR`）與 `arc_width` 樣式屬性。

### 擴充樣式屬性

Spinner 支援下列通用擴充樣式：

- 變換：`transformAngle`、`transformZoomX`、`transformZoomY`、`transformPivotX`、`transformPivotY`
- 混合模式：`blendMode`

## 9. 事件支援

Spinner 支援下列 LVGL 事件類型：

| 事件類型 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

> 注意：Spinner 通常不需要綁定事件，它是純粹的視覺回饋元件，預設也不可點擊。

## 10. UI 層設計

### 10.1 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，Spinner 以 React DOM 搭配 CSS 動畫繪製：

```tsx
<div className="lvgl-spinner" style={{
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
  <div style={{
    width: '80%', height: '80%',
    border: '4px solid #e0e0e0',
    borderTopColor: defaultStyle.borderColor || '#2196F3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  }} />
</div>
```

關鍵行為：
- 以 CSS `border` 技巧模擬旋轉弧形：灰色圓環加上彩色的上邊框
- 透過 `animation: spin 1s linear infinite` 持續旋轉
- 弧形顏色取自 `borderColor`（預設 `#2196F3`）
- 背景軌道顏色固定為 `#e0e0e0`
- 內部圓環尺寸為元件的 80%
- 背景透明（`resolvedBgColor` 對 spinner 類型回傳 `'transparent'`）
- 支援選取高亮、停留效果、拖曳、調整大小控制點

> 需要在 CSS 中定義 `@keyframes spin { to { transform: rotate(360deg); } }`。

### 10.2 Prototype 繪製（PreviewPanel.tsx）

在 Canvas 2D Prototype 中，Spinner 以 `drawSpinner()` 函式繪製：

```typescript
drawSpinner(ctx, x, y, w, h, {
  borderColor: styles.borderColor || '#2196F3',
});
```

實作內容：

```typescript
function drawSpinner(ctx, x, y, w, h, opts) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const radius = Math.min(w, h) / 2 - 4;

  // 背景圓環
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // 旋轉弧形（靜態快照）
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI / 3);
  ctx.stroke();
}
```

關鍵行為：
- 先繪製完整的灰色背景圓環
- 在其上繪製一段彩色弧形（從 -90° 到 60°，約 150° 弧長）
- 弧形端點為圓頭（`lineCap = 'round'`）
- Prototype 中的 Spinner 是靜態的（不旋轉），只顯示一個快照狀態
- 線寬固定為 4px（繪製簡化）
- 支援疊加動畫狀態

### 10.3 Simulator 繪製

#### JSON 序列化（editorStateToJson.ts）

Spinner 會被序列化為扁平化的 JSON 元件節點：

```json
{
  "type": "spinner",
  "id": "comp-xxx",
  "parent": null,
  "x": 100, "y": 100,
  "width": 50, "height": 50,
  "props": { "speed": 1000 },
  "styles": {
    "default": {
      "bgColor": "transparent",
      "borderColor": "#2196F3",
      "borderWidth": 15,
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
static lv_obj_t *create_spinner(lv_obj_t *parent, const cJSON *comp) {
    (void)comp;
    return lv_spinner_create(parent);
}
```

關鍵行為：
- 呼叫 `lv_spinner_create(parent)` 建立 Spinner（v9 的簽章）
- 目前 WASM 預覽尚未傳入 `speed` 與 `arcLength`，因此使用 LVGL 預設值
- LVGL 會自行啟動旋轉動畫
- 套用位置、尺寸、樣式

> 注意：在 WASM 預覽中 Spinner 會真的旋轉（由 LVGL 內部動畫驅動），這是它與編輯器畫布、Prototype 的主要差異。

### 10.4 程式碼生成輸出（ui.c.ts）

LVGL v9：

```c
// Create spinner: my_spinner
my_spinner = lv_spinner_create(parent);
lv_obj_set_pos(my_spinner, 100, 100);
lv_obj_set_size(my_spinner, 50, 50);
lv_obj_set_style_bg_opa(my_spinner, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(my_spinner, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_border_width(my_spinner, 15, 0);
lv_spinner_set_anim_params(my_spinner, 1000, 60);
```

LVGL v8：

```c
my_spinner = lv_spinner_create(parent, 1000, 60);
```

關鍵行為：
- v9 建立時只接受 parent，之後以 `lv_spinner_set_anim_params(obj, speed, arcLength)` 設定動畫
- v8 維持三參數的建立形式，`speed` 與 `arcLength` 是建立參數
- 在 v8 上，若 `speed` 或 `arcLength` 非預設值，會輸出註解說明該值是在建立函式中設定的

`getCreateFunction` 中的特殊處理：

```typescript
if (type === 'spinner') {
  if (isV9) {
    return `lv_spinner_create(${parentVar})`;
  }
  const speed = props?.speed || 1000;
  const arcLength = props?.arcLength || 60;
  return `lv_spinner_create(${parentVar}, ${speed}, ${arcLength})`;
}
```

`generatePropsCode` 中的處理：

```typescript
case 'spinner':
  if (isV9) {
    // V9: speed and arc length set via lv_spinner_set_anim_params
    const speed = props.speed || 1000;
    const arcLength = props.arcLength || 60;
    lines.push(`${indent}lv_spinner_set_anim_params(${varName}, ${speed}, ${arcLength});`);
  } else {
    // V8: speed and arc length set in create function
    if (props.speed && props.speed !== 1000) {
      lines.push(`${indent}// Note: Spinner speed ${props.speed}ms set in create function`);
    }
    if (props.arcLength && props.arcLength !== 60) {
      lines.push(`${indent}// Note: Spinner arc length ${props.arcLength}° set in create function`);
    }
  }
  break;
```

## 11. LVGL API 對應

### 建立函式

| 版本 | API | 說明 |
|---|---|---|
| LVGL v9 | `lv_spinner_create(parent)` | v9 中唯一有效的形式 |
| LVGL v8 | `lv_spinner_create(parent, speed, arcLength)` | 速度與弧長為建立參數 |

### 關鍵 API

| API | 說明 |
|---|---|
| `lv_spinner_create(parent)` | 建立 Spinner（v9） |
| `lv_spinner_create(parent, speed, arc_length)` | 建立並設定速度與弧長（v8） |
| `lv_spinner_set_anim_params(spinner, speed, arc_length)` | 設定速度與弧長（v9） |
| `lv_obj_set_pos(spinner, x, y)` | 設定位置 |
| `lv_obj_set_size(spinner, w, h)` | 設定尺寸 |
| `lv_obj_set_style_arc_color(spinner, color, LV_PART_INDICATOR)` | 設定弧形指示器顏色 |
| `lv_obj_set_style_arc_width(spinner, width, LV_PART_INDICATOR)` | 設定弧形指示器線寬 |
| `lv_obj_set_style_arc_color(spinner, color, LV_PART_MAIN)` | 設定背景軌道顏色 |
| `lv_obj_set_style_arc_width(spinner, width, LV_PART_MAIN)` | 設定背景軌道線寬 |
| `lv_obj_add_flag(spinner, LV_OBJ_FLAG_HIDDEN)` | 隱藏 Spinner |

### Spinner 與 Arc 的關係

Spinner 是 Arc 的特殊化版本：
- 內部建立了一個 Arc 物件
- 自動加上旋轉動畫（`lv_anim`）
- 不支援使用者互動（無法拖動弧形）
- 不支援設定 value／range（與 Arc 不同）

## 12. 設計注意事項

1. **速度與弧長在哪裡設定**：在 v9 是建立後以 `lv_spinner_set_anim_params` 套用，因此可於執行期變更；在 v8 則是建立參數，建立後無法修改，必須銷毀並重新建立 Spinner。

2. **三層繪製的差異**：
   - 編輯器畫布：以 CSS 動畫持續旋轉（視覺上最接近真實）
   - Prototype：靜態弧形快照，不旋轉
   - WASM 預覽：由 LVGL 內部動畫驅動旋轉（真實的 LVGL 行為）

3. **樣式對應約定**：編輯器樣式系統中 `borderColor` 對應弧形指示器顏色，`borderWidth` 對應弧形線寬。在 LVGL 中，它們實際上是套用於 `LV_PART_INDICATOR` 的 `arc_color` 與 `arc_width` 樣式屬性。

4. **背景軌道**：灰色背景軌道（`#E0E0E0`）就是**軌道**部位——它的 Background Color 會變成 `LV_PART_MAIN` 的 `arc_color`，Border Width 變成 `arc_width`；旋轉的那一段是**弧**部位。兩者都是弧，盒子那幾列不適用，屬性面板會直接藏起來；過去照字面採用它們，正是環外多一個方框的原因。見 [docs/widget-parts.md](../widget-parts.md)。

5. **保持正方形**：Spinner 的寬高應相等才能維持圓形外觀。編輯器不強制此限制，但在 UI 中提示使用者保持正方形會是合理的改進。

6. **WASM 預覽簡化**：目前 `create_spinner` 未傳入 `speed` 與 `arcLength`，因此使用 LVGL 預設值。這表示在編輯器中修改這兩個屬性後，WASM 預覽不會反映變化。

7. **效能考量**：旋轉動畫由 LVGL 的 `lv_anim` 系統驅動，會持續觸發重繪。在資源受限的嵌入式裝置上，多個 Spinner 同時運行可能影響效能。

8. **顯示與隱藏**：Spinner 通常在非同步操作開始時顯示、結束時隱藏。可透過 `LV_OBJ_FLAG_HIDDEN` flag 控制，或使用事件系統的 `show`／`hide` 內建動作。
