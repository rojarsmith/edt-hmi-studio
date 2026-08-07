# Checkbox — 核取方塊

<p align="center">
  <a href="../../components/checkbox.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

**Checkbox** 是核取方塊元件，對應 LVGL 的 `lv_checkbox` 控制項。由一個可勾選的方形標記（marker）與一段文字標籤組成，使用者點擊可切換勾選／未勾選狀態。在嵌入式 UI 中常用於設定開關、多選清單、同意條款等情境。

## 2. 元件類型識別碼

```
type: 'checkbox'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| `input` | 輸入 | ✏️ |

元件面板圖示：☑️

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 120 |
| defaultHeight | 28 |

## 5. 是否為容器

```
isContainer: false
```

Checkbox 不是容器元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Container (obj)** — 放在通用容器內（最常見的用法：多個 checkbox 放在容器中組成選項群組）
- **Tab View (tabview)** — 放在分頁的內容區域
- **Tile View (tileview)** — 放在圖磚區域
- **Window (win)** — 放在視窗內容區域

### 可以包含的子元件

無。Checkbox 是葉節點元件，不支援巢狀子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| `text` | `string` | `'Checkbox'` | 核取方塊旁邊的文字標籤 |
| `checked` | `boolean` | `false` | 是否勾選。勾選時 marker 填入主題色並顯示勾號 |
| `fontSize` | `number` | `14` | 文字字級（選填，對應內建 Montserrat 字型大小） |
| `fontResource` | `string` | `undefined` | 自訂字型資源名稱（選填，優先於 fontSize）。需先在資源管理器中上傳字型並設定 sizes |

### 字型選擇說明

屬性面板提供字型選擇下拉選單，支援：
- **預設**：使用 LVGL 預設字型
- **內建字型**：montserrat_14 到 montserrat_32 等內建 Montserrat 字型
- **已上傳字型**：使用者在資源管理器中上傳的自訂字型（TTF/OTF）

選擇自訂字型時，字型大小下拉選單只會列出該字型已設定的 sizes（因為自訂字型是按 size 編譯的）。選擇內建字型時，則列出所有可用的內建字型大小。

當 `fontResource` 存在時，程式碼生成器輸出 `lv_obj_set_style_text_font(obj, &{fontResource}_{fontSize}, 0)`；否則使用內建的 `lv_font_montserrat_{fontSize}`。

### 屬性定義（componentDefinitions.ts）

```typescript
defaultProps: { text: 'Checkbox', checked: false }
```

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | 預設的未勾選狀態 |
| `pressed` | `LV_STATE_PRESSED` | 按下狀態 |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態 |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

注意：`LV_STATE_CHECKED` 是 LVGL 內建狀態，透過 `lv_obj_add_state` 設定，不在編輯器樣式面板中單獨設定。

### 預設樣式（default 狀態）

Checkbox 整體背景透明，邊框顏色為主題色（供 marker 使用），與 LVGL 預設主題行為一致。

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| `bgColor` | `string` | `'transparent'` | 整體背景透明 |
| `borderColor` | `string` | `'#2196F3'` | 邊框顏色，對應 LVGL color_primary（供 marker 邊框使用） |
| `borderWidth` | `number` | `2` | 邊框寬度 |
| `borderRadius` | `number` | `4` | 圓角半徑（marker 的圓角） |
| `textColor` | `string` | `'#212121'` | 文字顏色 |
| `opacity` | `number` | `1` | 不透明度 |
| `padding` | `number` | `10` | 內距（marker 與文字之間間距的參考） |

### 建議的 disabled 狀態樣式

```typescript
disabled: {
  textColor: '#9E9E9E',
  borderColor: '#BDBDBD',
  opacity: 0.6,
}
```

## 9. 事件支援

| LVGL 事件類型 | 說明 |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | 勾選狀態改變時觸發（最常用） |
| `LV_EVENT_CLICKED` | 點擊時觸發 |
| `LV_EVENT_PRESSED` | 按下時觸發 |
| `LV_EVENT_RELEASED` | 放開時觸發 |
| `LV_EVENT_FOCUSED` | 取得焦點時觸發 |
| `LV_EVENT_DEFOCUSED` | 失去焦點時觸發 |

最常用的是 `LV_EVENT_VALUE_CHANGED`，在使用者切換勾選狀態後觸發。可用 `lv_obj_has_state(cb, LV_STATE_CHECKED)` 取得目前狀態。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，Checkbox 繪製為方形標記加文字標籤的水平版面：

```tsx
<div className="lvgl-checkbox" style={{
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: defaultStyle.textColor || '#333',
}}>
  <div style={{
    width: '16px',
    height: '16px',
    border: '2px solid #666',
    borderRadius: '2px',
    backgroundColor: props.checked ? '#2196F3' : '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }}>
    {props.checked && <span style={{ color: '#fff', fontSize: '12px' }}>✓</span>}
  </div>
  <span style={{ fontSize: 13 }}>{props.text || 'Checkbox'}</span>
</div>
```

- 勾選時 marker 背景變為主題藍 `#2196F3`，並顯示白色勾號 `✓`
- 未勾選時 marker 為白色背景加灰色邊框
- 整體背景在畫布中維持透明，不做回退

### 簡易預覽繪製（PreviewPanel.tsx — Canvas 2D）

使用 `drawCheckbox` 函式在 Canvas 2D 上繪製：

```typescript
function drawCheckbox(ctx, x, y, w, h, opts) {
  const boxSize = 18;
  const boxY = y + (h - boxSize) / 2;

  // 1. 繪製方形標記
  ctx.fillStyle = opts.checked ? '#2196f3' : '#fff';
  roundRect(ctx, x, boxY, boxSize, boxSize, 3);
  ctx.fill();
  ctx.stroke();

  // 2. 勾選時繪製勾號
  if (opts.checked) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, boxY + boxSize / 2);
    ctx.lineTo(x + boxSize / 2 - 1, boxY + boxSize - 5);
    ctx.lineTo(x + boxSize - 4, boxY + 5);
    ctx.stroke();
  }

  // 3. 繪製文字標籤
  ctx.fillStyle = opts.textColor;
  ctx.fillText(opts.text, x + boxSize + 8, y + h / 2);
}
```

### LVGL WASM 預覽繪製（ui_from_json.c）

透過 JSON 傳給 WASM 端，由 `create_checkbox` 函式建立真正的 LVGL 控制項：

```c
static lv_obj_t *create_checkbox(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *cb = lv_checkbox_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) lv_checkbox_set_text(cb, text);
        int checked = cjson_get_bool(props, "checked", 0);
        if (checked) lv_obj_add_state(cb, LV_STATE_CHECKED);
    }
    return cb;
}
```

### 程式碼生成輸出（ui.c.ts）

```c
// Create checkbox: my_checkbox
my_checkbox = lv_checkbox_create(parent);
lv_obj_set_pos(my_checkbox, 10, 20);
lv_obj_set_size(my_checkbox, 120, 28);

// Styles
lv_obj_set_style_bg_opa(my_checkbox, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(my_checkbox, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_border_width(my_checkbox, 2, 0);
lv_obj_set_style_radius(my_checkbox, 4, 0);
lv_obj_set_style_text_color(my_checkbox, lv_color_hex(0x212121), 0);
lv_obj_set_style_pad_all(my_checkbox, 10, 0);

// Props
lv_checkbox_set_text(my_checkbox, "Checkbox");
lv_obj_add_state(my_checkbox, LV_STATE_CHECKED);  // 僅當 checked = true 時產生
```

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_checkbox_create(parent)` |

### 關鍵 API

| API 函式 | 說明 |
|----------|------|
| `lv_checkbox_set_text(cb, text)` | 設定文字標籤 |
| `lv_checkbox_get_text(cb)` | 取得文字標籤 |
| `lv_obj_add_state(cb, LV_STATE_CHECKED)` | 設為勾選狀態 |
| `lv_obj_clear_state(cb, LV_STATE_CHECKED)` | 清除勾選狀態 |
| `lv_obj_has_state(cb, LV_STATE_CHECKED)` | 查詢是否勾選 |
| `lv_obj_add_state(cb, LV_STATE_DISABLED)` | 設為停用狀態 |

### 樣式部件（Parts）

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 整體區域（背景、文字） |
| `LV_PART_INDICATOR` | 方形標記（marker）區域 |

Marker 的樣式（勾選時的背景色、邊框色等）透過 `LV_PART_INDICATOR` 搭配狀態選擇器控制：
- `LV_PART_INDICATOR | LV_STATE_DEFAULT` — 未勾選時的 marker 樣式
- `LV_PART_INDICATOR | LV_STATE_CHECKED` — 勾選時的 marker 樣式

## 12. 設計注意事項

1. **勾選狀態管理**：Checkbox 的勾選狀態透過 LVGL 的 `LV_STATE_CHECKED` 狀態旗標管理，而非獨立屬性。編輯器以 `props.checked` 布林值對應到該狀態。

2. **Marker 樣式獨立**：在 LVGL 中，marker（方形標記）的樣式透過 `LV_PART_INDICATOR` 部件控制，與 `LV_PART_MAIN` 獨立。編輯器目前的 `borderColor` 與 `borderRadius` 主要影響 marker 的視覺表現。

3. **背景透明**：Checkbox 預設背景透明，這是 LVGL 的標準行為。編輯器畫布維持透明、不做背景色回退，因此在淺色背景上可能不太顯眼。

4. **文字位置**：LVGL 中文字一律在 marker 右側，不支援自訂位置。編輯器的三個繪製層都遵循此版面。

5. **組合使用**：多個 Checkbox 通常放在一個 Container (obj) 中，搭配 Flex 版面形成垂直排列的選項群組。編輯器支援此模式，但容器版面需由使用者手動設定。

6. **尺寸與文字**：Checkbox 的實際寬度取決於文字長度。預設寬度 120px 適合短文字，較長的標籤需要手動調整寬度或使用 `widthMode: 'content'`。

7. **觸控區域**：在裝置上，Checkbox 的整個區域（包含文字）都是可點擊的，不限於 marker。編輯器畫布中點擊元件任一處也都能選取。

8. **不需 checkable 旗標**：與 Button 不同，Checkbox 不需要手動設定 `LV_OBJ_FLAG_CHECKABLE`，LVGL 內部已自動處理。
