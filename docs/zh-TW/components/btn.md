# Button (btn) — 按鈕元件設計文件

<p align="center">
  <a href="../../components/btn.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Button（按鈕）是 LVGL 編輯器中最基礎的互動元件之一。按鈕用於觸發使用者操作，內部會自動包含一個置中的文字標籤。在 LVGL 中，按鈕是一種特殊的容器物件（`lv_button`），預設具備可點擊屬性，並自帶按下狀態的視覺回饋。

按鈕是容器元件（`isContainer = true`），除了內建的文字標籤之外，還可以容納其他子元件（例如圖示、額外的標籤），以實作更複雜的按鈕版面。

## 2. 元件類型識別碼

```
type: 'btn'
```

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `basic` |
| 分類名稱 | 基礎 |
| 分類圖示 | 📦 |
| 元件圖示 | 🔘 |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 40 |

## 5. 是否為容器

```
isContainer: true
```

按鈕是容器元件。雖然建立時會自動產生一個內部的 `lv_label`，使用者仍可將其他子元件拖入按鈕內部。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區
- **Tile View (tileview)** — 放在圖磚區域內
- **Window (win)** — 放在視窗內容區

### 可以包含的子元件

作為容器，按鈕可以包含：

- **Label (label)** — 額外的文字標籤
- **Image (img)** — 圖示／圖片
- **Line (line)** — 裝飾線條
- **Spinner (spinner)** — 載入狀態指示

> 注意：按鈕建立時會自動產生一個置中的內部標籤，用來顯示 `props.text`。該標籤由程式碼生成器自動管理，不會出現在元件樹中。使用者手動加入的子元件會疊在按鈕內部之上。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `text` | `string` | `'Button'` | 按鈕內部標籤顯示的文字內容 |
| `fontSize` | `number` | `14` | 文字字級（選填，對應到內部 label 的字型大小） |
| `textAlign` | `string` | `'center'` | 文字對齊方式：`'left'` / `'center'` / `'right'` |
| `fontResource` | `string` | `undefined` | 自訂字型資源名稱（選填，優先於 fontSize）。需先在資源管理器中上傳字型並設定 sizes |

### 字型選擇說明

屬性面板提供字型選擇下拉選單，支援：
- **預設**：使用 LVGL 預設字型
- **內建字型**：montserrat_14 到 montserrat_32 等內建 Montserrat 字型
- **已上傳字型**：使用者在資源管理器中上傳的自訂字型（TTF/OTF）

選擇自訂字型時，字型大小下拉選單只會列出該字型已設定的 sizes（因為自訂字型是按 size 編譯的）。選擇內建字型時，則列出所有可用的內建字型大小。

當 `fontResource` 存在時，程式碼生成器輸出 `lv_obj_set_style_text_font(label, &{fontResource}_{fontSize}, 0)`；否則使用內建的 `lv_font_montserrat_{fontSize}`。

### props 型別定義

```typescript
interface BtnProps {
  text: string;
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
| `pressed` | `LV_STATE_PRESSED` | 按下狀態 |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點狀態（鍵盤／編碼器導覽） |
| `disabled` | `LV_STATE_DISABLED` | 停用狀態 |

### default 狀態的預設樣式

| 樣式屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `bgColor` | `string` | `'#2196F3'` | 背景色（Material Blue 500，即 LVGL 主題的 primary 色） |
| `borderColor` | `string` | `'transparent'` | 邊框顏色（預設無邊框） |
| `borderWidth` | `number` | `0` | 邊框寬度 |
| `borderRadius` | `number` | `8` | 圓角半徑 |
| `textColor` | `string` | `'#ffffff'` | 文字顏色（白色） |
| `opacity` | `number` | `1` | 不透明度（0～1） |
| `padding` | `number` | `10` | 內距（四方向一致） |

### 樣式來源說明

按鈕的預設樣式來自 LVGL 預設主題（`lv_theme_default.c`）：
- 背景色使用 `color_primary`（`lv_palette_main(LV_PALETTE_BLUE)` = `#2196F3`）
- 文字色使用白色（`lv_color_white()`）
- 無邊框（`border_width = 0`）
- 圓角 8px

### 擴充樣式屬性

按鈕也支援繼承自 `StyleProps` 的通用擴充樣式：

- 陰影：`shadowColor`、`shadowWidth`、`shadowOffsetX`、`shadowOffsetY`、`shadowSpread`、`shadowOpacity`
- 漸層：`bgGradColor`、`bgGradDir`、`bgGradStop`
- 外框：`outlineColor`、`outlineWidth`、`outlinePad`
- 變換：`transformAngle`、`transformZoomX`、`transformZoomY`、`transformPivotX`、`transformPivotY`
- 四方向內距：`paddingTop`、`paddingBottom`、`paddingLeft`、`paddingRight`
- 四角圓角：`borderRadiusTopLeft`、`borderRadiusTopRight`、`borderRadiusBottomLeft`、`borderRadiusBottomRight`
- 邊框方向：`borderSide`（`'full'` / `'top'` / `'bottom'` / `'left'` / `'right'` / `'top_bottom'` / `'left_right'` / `'none'`）
- 文字裝飾：`textDecor`（`'none'` / `'underline'` / `'strikethrough'`）
- 混合模式：`blendMode`（`'normal'` / `'additive'` / `'subtractive'` / `'multiply'`）
- 字型：`textFont`、`textFontSize`、`textLetterSpace`、`textLineSpace`

## 9. 事件支援

按鈕支援下列 LVGL 事件類型：

| 事件類型 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊事件（按下並放開） |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_VALUE_CHANGED` | 值改變事件（當按鈕設為 checkable 時） |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

### 事件處理器類型

- **builtin（內建動作）**：支援 `navigate`（頁面跳轉）、`show`／`hide`（顯示／隱藏元件）、`enable`／`disable`（啟用／停用元件）、`setText`、`setValue`、`setProperty`
- **custom（自訂程式碼）**：由使用者撰寫自訂的 C 程式碼

## 10. UI 層設計

### 10.1 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，按鈕以 React DOM 繪製：

```tsx
<div className="lvgl-btn" style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  color: defaultStyle.textColor || '#ffffff',
  fontSize: props.fontSize || 13,
}}>
  {props.text || 'Button'}
</div>
```

關鍵行為：
- 以 `div` 搭配 flexbox 置中顯示文字
- 背景色直接對應到外層容器的 `backgroundColor`
- 支援選取高亮、停留效果、拖曳、調整大小控制點
- 背景透明時自動回退為 `#2196F3`（確保在畫布中可見）
- 支援 `borderSide` 的部分邊框繪製
- 支援 `textDecor` 文字裝飾

### 10.2 簡易預覽繪製（PreviewPanel.tsx）

在 Canvas 2D 簡易預覽中，按鈕以 `drawButton()` 函式繪製：

```typescript
drawButton(ctx, x, y, w, h, {
  bgColor: isHovered ? lightenColor(bgColorStyle, 20) : bgColorStyle,
  borderColor, borderWidth, borderRadius,
  text: comp.props.text || 'Button',
  textColor,
  gradientFill: isHovered ? undefined : getGradientFill(),
  textDecor: styles.textDecor,
  borderSide: styles.borderSide,
});
```

關鍵行為：
- 以 Canvas 2D 的 `roundRect` 繪製圓角矩形背景
- 文字置中繪製（`textAlign: 'center'`、`textBaseline: 'middle'`）
- 滑鼠停留時背景色自動變亮 20%
- 支援漸層填滿、文字裝飾、部分邊框
- 支援疊加動畫狀態（位移、縮放、透明度）
- 支援陰影、變換（旋轉／縮放）、外框

### 10.3 LVGL WASM 預覽繪製

#### JSON 序列化（editorStateToJson.ts）

按鈕會被序列化為扁平化的 JSON 元件節點：

```json
{
  "type": "btn",
  "id": "comp-xxx",
  "parent": null,
  "x": 50, "y": 50,
  "width": 100, "height": 40,
  "props": { "text": "Button" },
  "styles": {
    "default": {
      "bgColor": "#2196F3",
      "borderColor": "transparent",
      "borderWidth": 0,
      "borderRadius": 8,
      "textColor": "#ffffff",
      "opacity": 1,
      "padding": 10
    }
  }
}
```

#### C 端建立（ui_from_json.c）

```c
static lv_obj_t *create_btn(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *btn = lv_button_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) {
            lv_obj_t *lbl = lv_label_create(btn);
            lv_label_set_text(lbl, text);
            lv_obj_center(lbl);
        }
    }
    return btn;
}
```

關鍵行為：
- 呼叫 `lv_button_create()` 建立按鈕
- 讀取 `props.text`，自動建立內部的 `lv_label` 並置中
- 套用位置、尺寸、樣式（含多種狀態）
- 套用 flags（hidden、clickable、scrollable）

### 10.4 程式碼生成輸出（ui.c.ts）

```c
// Create btn: my_button
my_button = lv_btn_create(parent);
lv_obj_set_pos(my_button, 50, 50);
lv_obj_set_size(my_button, 100, 40);
lv_obj_set_style_bg_color(my_button, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_bg_opa(my_button, LV_OPA_COVER, 0);
lv_obj_set_style_radius(my_button, 8, 0);
lv_obj_set_style_text_color(my_button, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_pad_all(my_button, 10, 0);

// Create label inside button
lv_obj_t *my_button_label = lv_label_create(my_button);
lv_label_set_text(my_button_label, "Button");
lv_obj_center(my_button_label);
```

關鍵行為：
- 建立函式使用 `lv_btn_create`（注意：程式碼生成用 `lv_btn_create`，WASM 預覽用 `lv_button_create`，兩者在 LVGL v9 中等價）
- 自動產生內部 label 的建立程式碼
- 內部 label 變數名稱為 `{varName}_label`
- 將 `fontSize`、`textAlign`、`fontResource` 屬性對應到內部 label
- 支援多狀態樣式輸出（pressed／focused／disabled 使用對應的 `LV_STATE_*` 選擇器）
- 支援事件綁定程式碼生成

## 11. LVGL API 對應

### 建立函式

| 版本 | API |
|---|---|
| LVGL v9 | `lv_button_create(parent)` / `lv_btn_create(parent)` |
| LVGL v8 | `lv_btn_create(parent)` |

### 關鍵 API

| API | 說明 |
|---|---|
| `lv_label_create(btn)` | 在按鈕內部建立文字標籤 |
| `lv_label_set_text(label, text)` | 設定標籤文字 |
| `lv_obj_center(label)` | 將標籤置中於按鈕 |
| `lv_obj_set_pos(btn, x, y)` | 設定按鈕位置 |
| `lv_obj_set_size(btn, w, h)` | 設定按鈕尺寸 |
| `lv_obj_set_style_bg_color(btn, color, sel)` | 設定背景色 |
| `lv_obj_set_style_bg_opa(btn, opa, sel)` | 設定背景不透明度 |
| `lv_obj_set_style_radius(btn, r, sel)` | 設定圓角 |
| `lv_obj_set_style_text_color(btn, color, sel)` | 設定文字顏色 |
| `lv_obj_set_style_pad_all(btn, pad, sel)` | 設定內距 |
| `lv_obj_set_style_border_width(btn, w, sel)` | 設定邊框寬度 |
| `lv_obj_set_style_border_color(btn, color, sel)` | 設定邊框顏色 |
| `lv_obj_add_event_cb(btn, handler, event, data)` | 加入事件回呼 |
| `lv_obj_add_state(btn, LV_STATE_DISABLED)` | 設為停用狀態 |
| `lv_obj_add_flag(btn, LV_OBJ_FLAG_HIDDEN)` | 設為隱藏 |

## 12. 設計注意事項

1. **內部標籤管理**：按鈕的 `text` 屬性是透過自動建立的內部 `lv_label` 實作。在程式碼生成中，label 的變數名稱為 `{btnVarName}_label`，需注意命名衝突。

2. **容器特性**：按鈕是容器（`isContainer = true`），使用者可以在其中加入子元件；子元件在生成程式碼時會以按鈕作為父層建立。但要注意，自動建立的內部 label 不在元件樹中，使用者加入的子元件可能與它重疊。

3. **透明邊框處理**：預設為 `borderColor = 'transparent'`、`borderWidth = 0`。當 `borderColor` 為 transparent 時，不會產生邊框顏色的程式碼。

4. **v8/v9 相容性**：
   - 程式碼生成使用 `lv_btn_create`（v8／v9 通用）
   - WASM 預覽使用 `lv_button_create`（v9 的新名稱）
   - 兩者在 v9 中等價

5. **畫布可見性**：當 `bgColor` 為 transparent 時，編輯器畫布會自動回退為 `#2196F3`，確保按鈕在設計時始終可見且可互動。

6. **停留回饋**：簡易預覽中，滑鼠停留時背景色自動變亮 20%，模擬互動回饋；編輯器畫布則透過 CSS hover 類別實作。

7. **字型屬性傳遞**：`fontSize`、`textAlign`、`fontResource` 在生成程式碼時是套用到內部 label 而非按鈕本身。自訂字型資源（`fontResource`）的優先度高於 `fontSize`。

8. **跨頁面命名衝突**：當多個頁面存在同名按鈕時，程式碼生成器會自動加上頁面名稱前綴（例如 `page1_my_button`），避免 C 變數名稱衝突。
