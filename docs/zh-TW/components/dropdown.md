# Dropdown — 下拉選單

<p align="center">
  <a href="../../components/dropdown.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

**Dropdown** 是下拉選擇元件，對應 LVGL 的 `lv_dropdown` 控制項。使用者點擊後展開選項清單，從中選擇一個選項。在嵌入式 UI 中常用於設定頁面、表單選擇、模式切換等情境。

## 2. 元件類型識別碼

```
type: 'dropdown'
```

## 3. 所屬分類

| 分類 ID | 分類名稱 | 圖示 |
|---------|---------|------|
| `input` | 輸入 | ✏️ |

元件面板圖示：📋

## 4. 預設尺寸

| 屬性 | 值 |
|------|-----|
| defaultWidth | 120 |
| defaultHeight | 36 |

## 5. 是否為容器

```
isContainer: false
```

Dropdown 不是容器元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區域
- **Tile View (tileview)** — 放在圖磚區域
- **Window (win)** — 放在視窗內容區域
- **Button (btn)** — 技術上可行但不建議

### 可以包含的子元件

無。Dropdown 是葉節點元件，不支援巢狀子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|--------|------|--------|------|
| `options` | `string[]` | `['Option 1', 'Option 2', 'Option 3']` | 選項清單，每個元素為一個選項的文字 |
| `selected` | `number` | `0` | 目前選取項目的索引（從 0 開始） |
| `direction` | `string` | `undefined` | 展開方向：`'down'`（預設）或 `'up'` |
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
defaultProps: { options: ['Option 1', 'Option 2', 'Option 3'], selected: 0 }
```

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|------|--------|------|
| `default` | `LV_STATE_DEFAULT` | 預設狀態 |
| `pressed` | `LV_STATE_PRESSED` | 按下狀態 |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態 |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

### 預設樣式（default 狀態）

採用 LVGL 預設主題的 **card style**，與 textarea、chart、table 等元件風格一致。

| 樣式屬性 | 型別 | 預設值 | 說明 |
|----------|------|--------|------|
| `bgColor` | `string` | `'#ffffff'` | 背景色，card 風格的白色 |
| `borderColor` | `string` | `'#E0E0E0'` | 邊框顏色，對應 LVGL color_grey |
| `borderWidth` | `number` | `2` | 邊框寬度 |
| `borderRadius` | `number` | `8` | 圓角半徑 |
| `textColor` | `string` | `'#212121'` | 文字顏色，對應 LVGL color_text |
| `opacity` | `number` | `1` | 不透明度（0～1） |
| `padding` | `number` | `10` | 內距 |

### 建議的 focused 狀態樣式

```typescript
focused: {
  borderColor: '#2196F3',
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
| `LV_EVENT_VALUE_CHANGED` | 選取項目改變時觸發（最常用） |
| `LV_EVENT_CLICKED` | 點擊時觸發 |
| `LV_EVENT_PRESSED` | 按下時觸發 |
| `LV_EVENT_RELEASED` | 放開時觸發 |
| `LV_EVENT_FOCUSED` | 取得焦點時觸發 |
| `LV_EVENT_DEFOCUSED` | 失去焦點時觸發 |
| `LV_EVENT_READY` | 選擇完成時觸發 |
| `LV_EVENT_CANCEL` | 取消選擇時觸發 |

最常用的是 `LV_EVENT_VALUE_CHANGED`，在使用者選擇新選項後觸發。

## 10. UI 層設計

### 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，Dropdown 繪製為帶下拉箭頭的選擇框，顯示目前選取項目的文字：

```tsx
<div className="lvgl-dropdown" style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  height: '100%',
  padding: '0 8px',
  backgroundColor: resolvedBgColor,
  border: !defaultStyle.borderWidth ? '1px solid #cccccc' : undefined,
  borderRadius: defaultStyle.borderRadius || 4,
  boxSizing: 'border-box',
  color: defaultStyle.textColor || '#333',
}}>
  <span>{props.options?.[props.selected || 0] || 'Select...'}</span>
  <span style={{ color: '#999', fontSize: '10px' }}>▼</span>
</div>
```

- 左側顯示目前選取項目的文字
- 右側顯示下拉箭頭 `▼`
- 不會展開，僅作為視覺預覽
- 背景色透明時回退為 `#ffffff`

### Prototype 繪製（PreviewPanel.tsx — Canvas 2D）

使用 `drawDropdown` 函式在 Canvas 2D 上繪製：

```typescript
function drawDropdown(ctx, x, y, w, h, opts) {
  // 1. 繪製背景矩形（支援漸層）
  ctx.fillStyle = opts.gradientFill || opts.bgColor;
  roundRect(ctx, x, y, w, h, opts.borderRadius);
  ctx.fill();
  ctx.stroke();

  // 2. 繪製選取項目的文字
  const selectedText = opts.options[opts.selected] || 'Select...';
  ctx.fillStyle = opts.textColor;
  ctx.fillText(selectedText, x + 10, y + h / 2);

  // 3. 繪製下拉箭頭（三角形）
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(x + w - 20, y + h / 2 - 3);
  ctx.lineTo(x + w - 10, y + h / 2 - 3);
  ctx.lineTo(x + w - 15, y + h / 2 + 3);
  ctx.closePath();
  ctx.fill();
}
```

### Simulator 繪製（ui_from_json.c）

透過 JSON 傳給 WASM 端，由 `create_dropdown` 函式建立真正的 LVGL 控制項：

```c
static lv_obj_t *create_dropdown(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *dd = lv_dropdown_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        // 將陣列選項串接為換行分隔的字串
        cJSON *options = cJSON_GetObjectItemCaseSensitive(props, "options");
        if (cJSON_IsArray(options)) {
            char buf[512] = {0};
            int first = 1;
            cJSON *opt;
            cJSON_ArrayForEach(opt, options) {
                if (cJSON_IsString(opt)) {
                    if (!first) strncat(buf, "\n", sizeof(buf) - strlen(buf) - 1);
                    strncat(buf, opt->valuestring, sizeof(buf) - strlen(buf) - 1);
                    first = 0;
                }
            }
            lv_dropdown_set_options(dd, buf);
        }
        int sel = cjson_get_int(props, "selected", 0);
        lv_dropdown_set_selected(dd, (uint32_t)sel);
    }
    return dd;
}
```

LVGL 的 dropdown 選項是以 `\n` 分隔的單一字串，因此 WASM 端需要將 JSON 陣列轉換成該格式。

### 程式碼生成輸出（ui.c.ts）

```c
// Create dropdown: my_dropdown
my_dropdown = lv_dropdown_create(parent);
lv_obj_set_pos(my_dropdown, 10, 20);
lv_obj_set_size(my_dropdown, 120, 36);

// Styles
lv_obj_set_style_bg_color(my_dropdown, lv_color_hex(0xffffff), 0);
lv_obj_set_style_bg_opa(my_dropdown, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(my_dropdown, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(my_dropdown, 2, 0);
lv_obj_set_style_radius(my_dropdown, 8, 0);
lv_obj_set_style_text_color(my_dropdown, lv_color_hex(0x212121), 0);
lv_obj_set_style_pad_all(my_dropdown, 10, 0);

// Props
lv_dropdown_set_options(my_dropdown, "Option 1\nOption 2\nOption 3");
lv_dropdown_set_selected(my_dropdown, 0);
```

選項陣列在生成程式碼時會以 `\n` 串接為單一 C 字串。支援生成的擴充屬性：
- `direction` → `lv_dropdown_set_dir()`

## 11. LVGL API 對應

### 建立函式

| LVGL 版本 | 函式 |
|-----------|------|
| v8 / v9 | `lv_dropdown_create(parent)` |

### 關鍵 API

| API 函式 | 說明 |
|----------|------|
| `lv_dropdown_set_options(dd, opts)` | 設定選項清單（以 `\n` 分隔的字串） |
| `lv_dropdown_add_option(dd, opt, pos)` | 在指定位置插入選項 |
| `lv_dropdown_set_selected(dd, idx)` | 設定選取項目索引 |
| `lv_dropdown_get_selected(dd)` | 取得目前選取項目索引 |
| `lv_dropdown_get_selected_str(dd, buf, len)` | 取得目前選取項目的文字 |
| `lv_dropdown_set_dir(dd, dir)` | 設定展開方向（LV_DIR_BOTTOM／LV_DIR_TOP） |
| `lv_dropdown_open(dd)` | 以程式開啟下拉清單 |
| `lv_dropdown_close(dd)` | 以程式關閉下拉清單 |
| `lv_dropdown_set_text(dd, text)` | 設定固定顯示文字（不隨選擇變化） |

### 樣式部件（Parts）

| Part | 說明 |
|------|------|
| `LV_PART_MAIN` | 下拉框主體（關閉狀態的按鈕區域） |
| `LV_PART_INDICATOR` | 下拉箭頭圖示 |
| `LV_PART_ITEMS` | 展開後的清單項目 |
| `LV_PART_SELECTED` | 展開後目前選取的項目 |
| `LV_PART_SCROLLBAR` | 選項清單的捲軸 |

## 12. 設計注意事項

1. **選項格式轉換**：編輯器內部以 `string[]` 陣列存放選項，但 LVGL API 使用 `\n` 分隔的單一字串。程式碼生成與 WASM 預覽都需要進行格式轉換。

2. **展開後的清單**：LVGL 的 dropdown 展開時會建立一個浮動清單，該清單在 LVGL 內部作為獨立物件管理。編輯器畫布與 Prototype 都不模擬展開狀態。

3. **選項數量限制**：WASM 端的選項串接緩衝區為 512 位元組，過長的清單可能被截斷。建議單一選項文字不超過 50 個字元，總選項數不超過 20 個。

4. **背景色回退**：在編輯器畫布中，若 bgColor 設為 transparent，會自動回退為 `#ffffff`。

5. **展開方向**：預設向下展開。當元件位於畫面底部時，建議設定 `direction: 'up'` 以避免清單被裁切。

6. **清單樣式**：展開後的清單樣式由 `LV_PART_ITEMS` 與 `LV_PART_SELECTED` 控制。編輯器目前不提供這些部件的樣式編輯，需要在生成的程式碼中手動加入。

7. **執行期變更選項**：`lv_dropdown_set_options()` 會取代整份清單；`lv_dropdown_add_option()` 則可逐一加入。

8. **箭頭繪製**：編輯器畫布使用 Unicode 字元 `▼`，Prototype 以三角形路徑繪製，LVGL 原生則使用 `LV_SYMBOL_DOWN` 符號字型。三者的視覺略有差異。
