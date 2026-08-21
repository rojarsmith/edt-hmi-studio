# Textarea — 文字輸入區域

<p align="center">
  <a href="../../components/textarea.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

**Textarea** 是多行文字輸入元件，對應 LVGL 的 `lv_textarea` 控制項。使用者可以在其中輸入與編輯文字內容，並支援提示文字（placeholder）。在嵌入式 UI 中常用於表單輸入、文字編輯、搜尋框等情境。

## 2. 元件類型識別碼

```
type: 'textarea'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| `input` | 輸入 | ✏️ |

元件面板圖示：📝

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 150 |
| defaultHeight | 80 |

## 5. 是否為容器

```
isContainer: false
```

Textarea 不是容器元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區域
- **Tile View (tileview)** — 放在圖磚區域
- **Window (win)** — 放在視窗內容區域
- **Button (btn)** — 技術上可行但不建議

### 可以包含的子元件

無。Textarea 是葉節點元件，不支援巢狀子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| `text` | `string` | `''` | 文字方塊中的文字內容。為空時顯示 placeholder |
| `placeholder` | `string` | `'Enter text...'` | 提示文字，當 text 為空時以灰色顯示 |
| `fontSize` | `number` | `14` | 文字字級（選填，對應內建 Montserrat 字型大小） |
| `fontResource` | `string` | `undefined` | 自訂字型資源名稱（選填，優先於 fontSize）。需先在資源管理器中上傳字型並設定 sizes |
| `maxLength` | `number` | `undefined` | 最大輸入字元數限制，未設定則無限制 |
| `password` | `boolean` | `false` | 是否為密碼模式，開啟後輸入內容顯示為圓點 |
| `oneLine` | `boolean` | `false` | 是否為單行模式，開啟後禁止換行 |

### 字型選擇說明

屬性面板提供字型選擇下拉選單，支援：
- **預設**：使用 LVGL 預設字型
- **內建字型**：montserrat_14 到 montserrat_32 等內建 Montserrat 字型
- **已上傳字型**：使用者在資源管理器中上傳的自訂字型（TTF/OTF）

選擇自訂字型時，字型大小下拉選單只會列出該字型已設定的 sizes（因為自訂字型是按 size 編譯的）。選擇內建字型時，則列出所有可用的內建字型大小。

當 `fontResource` 存在時，程式碼生成器輸出 `lv_obj_set_style_text_font(obj, &{fontResource}_{fontSize}, 0)`；否則使用內建的 `lv_font_montserrat_{fontSize}`。

### 屬性定義（componentDefinitions.ts）

```typescript
defaultProps: { text: '', placeholder: 'Enter text...' }
```

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | 預設狀態 |
| `pressed` | `LV_STATE_PRESSED` | 按下狀態（觸控／點擊時） |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態（鍵盤導覽或點擊啟用） |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

### 預設樣式（default 狀態）

採用 LVGL 預設主題的 **card style**（白色背景加灰色邊框），與 dropdown、chart、table 等元件風格一致。

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| `bgColor` | `string` | `'#ffffff'` | 背景色，card 風格的白色 |
| `borderColor` | `string` | `'#E0E0E0'` | 邊框顏色，對應 LVGL color_grey |
| `borderWidth` | `number` | `2` | 邊框寬度 |
| `borderRadius` | `number` | `8` | 圓角半徑 |
| `textColor` | `string` | `'#212121'` | 文字顏色，對應 LVGL color_text |
| `opacity` | `number` | `1` | 不透明度（0～1） |
| `padding` | `number` | `10` | 內距，對應 LVGL 的 pad_small |

### 建議的 focused 狀態樣式

```typescript
focused: {
  borderColor: '#2196F3',  // 取得焦點時邊框變為主題色
  borderWidth: 2,
}
```

### 建議的 disabled 狀態樣式

```typescript
disabled: {
  bgColor: '#F5F5F5',
  textColor: '#9E9E9E',
  opacity: 0.6,
}
```

## 9. 事件支援

| LVGL 事件類型 | 說明 |
|--------------|------|
| `LV_EVENT_VALUE_CHANGED` | 文字內容改變時觸發 |
| `LV_EVENT_FOCUSED` | 取得焦點時觸發 |
| `LV_EVENT_DEFOCUSED` | 失去焦點時觸發 |
| `LV_EVENT_READY` | 使用者按下 Enter／確認鍵時觸發（單行模式下常用） |
| `LV_EVENT_CANCEL` | 使用者取消輸入時觸發 |
| `LV_EVENT_CLICKED` | 點擊時觸發 |
| `LV_EVENT_PRESSED` | 按下時觸發 |
| `LV_EVENT_RELEASED` | 放開時觸發 |

最常用的是 `LV_EVENT_VALUE_CHANGED`（監聽文字變化）與 `LV_EVENT_READY`（監聽輸入完成）。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，Textarea 繪製為帶邊框的矩形區域，內部顯示文字或提示文字：

```tsx
<div className="lvgl-textarea" style={{
  width: '100%',
  height: '100%',
  fontSize: '12px',
  color: '#999',
  backgroundColor: resolvedBgColor,
  border: !defaultStyle.borderWidth ? '1px solid #cccccc' : undefined,
  borderRadius: defaultStyle.borderRadius || 4,
  padding: '6px 8px',
  boxSizing: 'border-box',
}}>
  {props.text || props.placeholder || 'Enter text...'}
</div>
```

- 當 `text` 為空時顯示 `placeholder`，文字顏色為灰色 `#999`
- 背景色使用 `resolvedBgColor`，確保在畫布中可見（透明時回退為 `#ffffff`）
- 不可互動編輯，僅作為視覺預覽

### Prototype 繪製（PreviewPanel.tsx — Canvas 2D）

使用 `drawTextarea` 函式在 Canvas 2D 上繪製：

```typescript
function drawTextarea(ctx, x, y, w, h, opts) {
  // 1. 繪製背景矩形（支援漸層）
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  // 2. 繪製文字或提示文字
  const displayText = opts.text || opts.placeholder;
  ctx.fillStyle = opts.text ? opts.textColor : '#999';
  ctx.fillText(displayText, x + 8, y + 8);
}
```

- 支援背景漸層（bgGradDir／bgGradColor）
- 有文字時以 textColor 繪製，無文字時以灰色繪製 placeholder

### Simulator 繪製（ui_from_json.c）

序列化為 JSON 後傳給 WASM 端，由 `create_textarea` 函式建立真正的 LVGL 控制項：

```c
static lv_obj_t *create_textarea(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *ta = lv_textarea_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text && text[0]) lv_textarea_set_text(ta, text);
        const char *ph = cjson_get_string(props, "placeholder");
        if (ph) lv_textarea_set_placeholder_text(ta, ph);
    }
    return ta;
}
```

JSON 資料由 `editorStateToJson.ts` 的 `flattenTree` 函式產生，將元件樹扁平化並保留 parent 引用。

### 程式碼生成輸出（ui.c.ts）

```c
// Create textarea: my_textarea
my_textarea = lv_textarea_create(parent);
lv_obj_set_pos(my_textarea, 10, 20);
lv_obj_set_size(my_textarea, 150, 80);

// Styles
lv_obj_set_style_bg_color(my_textarea, lv_color_hex(0xffffff), 0);
lv_obj_set_style_bg_opa(my_textarea, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(my_textarea, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(my_textarea, 2, 0);
lv_obj_set_style_radius(my_textarea, 8, 0);
lv_obj_set_style_text_color(my_textarea, lv_color_hex(0x212121), 0);
lv_obj_set_style_pad_all(my_textarea, 10, 0);

// Props
lv_textarea_set_placeholder_text(my_textarea, "Enter text...");
lv_textarea_set_text(my_textarea, "Hello");
```

支援生成的擴充屬性：
- `maxLength` → `lv_textarea_set_max_length()`
- `password` → `lv_textarea_set_password_mode()`
- `oneLine` → `lv_textarea_set_one_line()`（v8 與 v9 皆同）

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_textarea_create(parent)` |

### 關鍵 API

| API 函式 | 說明 |
|----------|------|
| `lv_textarea_set_text(ta, text)` | 設定文字內容 |
| `lv_textarea_set_placeholder_text(ta, text)` | 設定提示文字 |
| `lv_textarea_get_text(ta)` | 取得目前文字 |
| `lv_textarea_set_max_length(ta, len)` | 設定最大字元數 |
| `lv_textarea_set_password_mode(ta, en)` | 設定密碼模式 |
| `lv_textarea_set_one_line(ta, en)` | 設定單行模式 |
| `lv_textarea_add_char(ta, c)` | 追加單一字元 |
| `lv_textarea_add_text(ta, text)` | 追加文字 |
| `lv_textarea_del_char(ta)` | 刪除游標前一個字元 |
| `lv_textarea_set_cursor_pos(ta, pos)` | 設定游標位置 |

### 樣式部件（Parts）

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 文字區域主體（背景、邊框） |
| `LV_PART_TEXTAREA_PLACEHOLDER` | 提示文字樣式 |
| `LV_PART_CURSOR` | 游標樣式 |
| `LV_PART_SCROLLBAR` | 捲軸樣式 |

## 12. 設計注意事項

1. **鍵盤整合**：在嵌入式裝置上，Textarea 通常需要搭配虛擬鍵盤（`lv_keyboard`）使用。編輯器不會產生鍵盤關聯的程式碼，需在 `ui_events.c` 中自行處理。

2. **提示文字顏色**：LVGL 透過 `LV_PART_TEXTAREA_PLACEHOLDER` 部件設定提示文字顏色。編輯器畫布固定以灰色 `#999` 模擬，與 LVGL 預設行為一致。

3. **不繪製游標**：編輯器畫布與 Prototype 都不繪製游標，只有 WASM 預覽由 LVGL 原生繪製。

4. **多行與單行**：預設為多行模式。當 `oneLine` 為 true 時，元件行為類似單行輸入框，高度建議調整為 36～40px。

5. **捲動行為**：當文字超出可視區域時，LVGL 會自動啟用捲動。編輯器畫布以 `overflow: hidden` 模擬裁切效果。

6. **密碼模式**：開啟後 LVGL 會將輸入字元替換為圓點（`•`）。編輯器畫布不模擬此行為，只有在 WASM 預覽中可見。

7. **背景色回退**：在編輯器畫布中，若 bgColor 設為 transparent，會自動回退為 `#ffffff`，確保元件在設計畫布上可見且可互動。

8. **字型限制**：LVGL 字型的大小在編譯時決定，編輯器中的 fontSize 屬性僅供參考，實際仍需在專案中啟用對應大小的字型檔。
