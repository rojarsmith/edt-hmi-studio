# Label (label) — 標籤元件設計文件

<p align="center">
  <a href="../../components/label.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Label（標籤）是 EDT HMI Studio 中最基礎的文字顯示元件。標籤用於在介面上顯示靜態或動態文字內容，是建構 UI 的核心元素之一。在 LVGL 中，標籤物件（`lv_label`）預設背景透明，只繪製文字，並支援長文字模式（換行、捲動、省略號、裁切）。

標籤不是容器元件（`isContainer = false`），不能包含子元件。

## 2. 元件類型識別碼

```
type: 'label'
```

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `basic` |
| 分類名稱 | 基礎 |
| 分類圖示 | 📦 |
| 元件圖示 | 🏷️ |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 80 |
| defaultHeight | 24 |

## 5. 是否為容器

```
isContainer: false
```

標籤是純顯示元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Button (btn)** — 作為按鈕的額外文字（按鈕本身已有內建 label）
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區
- **Tile View (tileview)** — 放在圖磚區域內
- **Window (win)** — 放在視窗內容區

### 可以包含的子元件

無。標籤不是容器，不能包含任何子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `text` | `string` | `'Label'` | 標籤顯示的文字內容 |
| `longMode` | `string` | `undefined` | 長文字模式：`'wrap'`（換行）／`'scroll'`（捲動）／`'dot'`（省略號）／`'clip'`（裁切） |
| `fontSize` | `number` | `14` | 文字字級（選填） |
| `textAlign` | `string` | `undefined` | 文字對齊方式：`'left'` / `'center'` / `'right'` |
| `fontResource` | `string` | `undefined` | 自訂字型資源名稱（選填，優先於 fontSize）。需先在資源管理器中上傳字型並設定 sizes |

### 字型選擇說明

屬性面板提供字型選擇下拉選單，支援：
- **預設**：使用 LVGL 預設字型
- **內建字型**：montserrat_14 到 montserrat_32 等內建 Montserrat 字型
- **已上傳字型**：使用者在資源管理器中上傳的自訂字型（TTF/OTF）

選擇自訂字型時，字型大小下拉選單只會列出該字型已設定的 sizes（因為自訂字型是按 size 編譯的）。選擇內建字型時，則列出所有可用的內建字型大小。

當 `fontResource` 存在時，程式碼生成器輸出 `lv_obj_set_style_text_font(obj, &{fontResource}_{fontSize}, 0)`；否則使用內建的 `lv_font_montserrat_{fontSize}`。

### props 型別定義

```typescript
interface LabelProps {
  text: string;
  longMode?: 'wrap' | 'scroll' | 'dot' | 'clip';
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  fontResource?: string;
}
```

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | 預設／正常狀態 |
| `pressed` | `LV_STATE_PRESSED` | 按下狀態（標籤通常不回應按下，但仍可設定樣式） |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態 |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

### default 狀態的預設樣式

| 樣式屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `bgColor` | `string` | `'transparent'` | 背景色（透明，LVGL 中為 `bg_opa = LV_OPA_TRANSP`） |
| `borderColor` | `string` | `'transparent'` | 邊框顏色（無邊框） |
| `borderWidth` | `number` | `0` | 邊框寬度 |
| `borderRadius` | `number` | `0` | 圓角半徑 |
| `textColor` | `string` | `'#212121'` | 文字顏色（LVGL 主題的 `color_text` = `lv_palette_darken(GREY, 4)`） |
| `opacity` | `number` | `1` | 不透明度 |
| `padding` | `number` | `0` | 內距 |

### 樣式來源說明

標籤的預設樣式來自 LVGL 預設主題：
- 背景透明（`bg_opa = LV_OPA_TRANSP`）
- 文字顏色繼承自父層，或使用 `color_text`（`#212121`）
- 無邊框、無圓角、無內距

### 擴充樣式屬性

標籤支援繼承自 `StyleProps` 的通用擴充樣式：

- 陰影：`shadowColor`、`shadowWidth`、`shadowOffsetX`、`shadowOffsetY`、`shadowSpread`、`shadowOpacity`
- 漸層：`bgGradColor`、`bgGradDir`、`bgGradStop`
- 外框：`outlineColor`、`outlineWidth`、`outlinePad`
- 變換：`transformAngle`、`transformZoomX`、`transformZoomY`、`transformPivotX`、`transformPivotY`
- 四方向內距：`paddingTop`、`paddingBottom`、`paddingLeft`、`paddingRight`
- 文字裝飾：`textDecor`（`'none'` / `'underline'` / `'strikethrough'`）
- 字型：`textFont`、`textFontSize`、`textLetterSpace`、`textLineSpace`
- 混合模式：`blendMode`

## 9. 事件支援

標籤支援下列 LVGL 事件類型：

| 事件類型 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

> 注意：標籤預設不可點擊（未設定 `LV_OBJ_FLAG_CLICKABLE`）。若要回應點擊事件，需在 flags 中設定 `clickable = true`。

## 10. UI 層設計

### 10.1 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，標籤以 React DOM 繪製：

```tsx
<span className="lvgl-label" style={{
  color: defaultStyle.textColor || '#333333',
  fontSize: props.fontSize || 13,
}}>
  {props.text || 'Label'}
</span>
```

關鍵行為：
- 以 `<span>` 元素直接顯示文字
- 背景保持透明（`resolvedBgColor` 對 label 類型回傳 `'transparent'`）
- 文字顏色與字級直接對應
- 支援選取高亮、停留效果、拖曳、調整大小控制點
- 支援 `textDecor` 文字裝飾（透過外層的 `textDecoration` CSS 屬性）

### 10.2 簡易預覽繪製（PreviewPanel.tsx）

在 Canvas 2D 簡易預覽中，標籤以 `drawLabel()` 函式繪製：

```typescript
drawLabel(ctx, x, y, w, h, {
  text: comp.props.text || 'Label',
  textColor,
  fontSize: comp.props.fontSize || 14,
  textDecor: styles.textDecor,
});
```

關鍵行為：
- 以 Canvas 2D 的 `fillText` 繪製文字
- 文字對齊：`textAlign = 'left'`、`textBaseline = 'top'`
- 不繪製背景矩形（背景透明）
- 支援文字裝飾（底線／刪除線）
- 支援疊加動畫狀態

### 10.3 LVGL WASM 預覽繪製

#### JSON 序列化（editorStateToJson.ts）

標籤會被序列化為扁平化的 JSON 元件節點：

```json
{
  "type": "label",
  "id": "comp-xxx",
  "parent": null,
  "x": 10, "y": 10,
  "width": 80, "height": 24,
  "props": { "text": "Label" },
  "styles": {
    "default": {
      "bgColor": "transparent",
      "borderColor": "transparent",
      "borderWidth": 0,
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
static lv_obj_t *create_label(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *lbl = lv_label_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) lv_label_set_text(lbl, text);
    }
    return lbl;
}
```

關鍵行為：
- 呼叫 `lv_label_create()` 建立標籤
- 讀取 `props.text` 並設定文字
- 套用位置、尺寸、樣式
- 樣式中 `bgColor = "transparent"` 會轉為 `lv_obj_set_style_bg_opa(obj, LV_OPA_TRANSP, sel)`

### 10.4 程式碼生成輸出（ui.c.ts）

```c
// Create label: my_label
my_label = lv_label_create(parent);
lv_obj_set_pos(my_label, 10, 10);
lv_obj_set_size(my_label, 80, 24);
lv_obj_set_style_bg_opa(my_label, LV_OPA_TRANSP, 0);
lv_obj_set_style_text_color(my_label, lv_color_hex(0x212121), 0);
lv_label_set_text(my_label, "Label");
```

關鍵行為：
- 建立函式使用 `lv_label_create`
- 直接在標籤物件上設定文字（`lv_label_set_text`）
- 支援將 `longMode` 對應到 `lv_label_set_long_mode`
- 支援將 `fontSize` 對應到 `lv_obj_set_style_text_font`（使用內建的 Montserrat 字型）
- 支援將 `textAlign` 對應到 `lv_obj_set_style_text_align`
- 自訂字型資源（`fontResource`）的優先度高於 `fontSize`

## 11. LVGL API 對應

### 建立函式

| 版本 | API |
|---|---|
| LVGL v9 | `lv_label_create(parent)` |
| LVGL v8 | `lv_label_create(parent)` |

### 關鍵 API

| API | 說明 |
|---|---|
| `lv_label_create(parent)` | 建立標籤 |
| `lv_label_set_text(label, text)` | 設定文字內容 |
| `lv_label_set_long_mode(label, mode)` | 設定長文字模式 |
| `lv_obj_set_pos(label, x, y)` | 設定位置 |
| `lv_obj_set_size(label, w, h)` | 設定尺寸 |
| `lv_obj_set_style_text_color(label, color, sel)` | 設定文字顏色 |
| `lv_obj_set_style_text_font(label, font, sel)` | 設定字型 |
| `lv_obj_set_style_text_align(label, align, sel)` | 設定文字對齊 |
| `lv_obj_set_style_text_letter_space(label, space, sel)` | 設定字距 |
| `lv_obj_set_style_text_line_space(label, space, sel)` | 設定行距 |
| `lv_obj_set_style_text_decor(label, decor, sel)` | 設定文字裝飾 |
| `lv_obj_set_style_bg_opa(label, LV_OPA_TRANSP, sel)` | 設定背景透明 |

### 長文字模式常數

| 模式 | LVGL 常數 | 說明 |
|---|---|---|
| `wrap` | `LV_LABEL_LONG_WRAP` | 自動換行 |
| `scroll` | `LV_LABEL_LONG_SCROLL` | 水平捲動 |
| `dot` | `LV_LABEL_LONG_DOT` | 結尾省略號 |
| `clip` | `LV_LABEL_LONG_CLIP` | 裁切超出的部分 |

## 12. 設計注意事項

1. **透明背景**：標籤預設背景透明，在 LVGL 中以 `bg_opa = LV_OPA_TRANSP` 實作。編輯器畫布也保持透明繪製，不做可見性回退（與按鈕不同）。

2. **文字顏色繼承**：在 LVGL 中，標籤的文字顏色可以從父層繼承。編輯器預設使用 `#212121`（LVGL 主題的 `color_text`），但實際執行時可能因父層樣式而不同。

3. **尺寸與文字的關係**：標籤的預設尺寸（80×24）是固定值。在實際的 LVGL 中，標籤尺寸通常由文字內容決定（`LV_SIZE_CONTENT`）。編輯器可將 `widthMode`／`heightMode` 設為 `'content'` 來模擬此行為。

4. **長文字模式**：當文字超出標籤尺寸時，由 `longMode` 決定處理方式。預設不設定（LVGL 本身預設為 `LV_LABEL_LONG_WRAP`），只有使用者明確設定時才會生成對應程式碼。

5. **字型大小限制**：LVGL 的字型大小在編譯時決定。生成程式碼時 `fontSize` 會對應到內建的 Montserrat 字型（例如 `lv_font_montserrat_14`）；若要求的字級沒有對應的已編譯字型，會生成註解提示。

6. **不可點擊**：標籤預設不可點擊。若要回應事件，需在 flags 中設定 `clickable = true`，生成時會輸出 `lv_obj_add_flag(label, LV_OBJ_FLAG_CLICKABLE)`。

7. **C 字串跳脫**：文字內容在生成程式碼時會經過 `escapeCString()` 處理，確保引號、反斜線、換行等特殊字元被正確跳脫。

8. **跨頁面命名衝突**：與按鈕相同，多頁面同名標籤會自動加上頁面名稱前綴。
