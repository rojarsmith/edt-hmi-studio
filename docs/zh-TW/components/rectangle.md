# Rectangle (rectangle) — 矩形元件設計文件

<p align="center">
  <a href="../../components/rectangle.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Rectangle（矩形）繪製一個具備填色與邊框的方框，屬於 **Shapes（圖形）** 分類，與 [Line](line.md) 並列——屬於裝飾性幾何圖形，而非互動控制項。常用於襯在一組元件後方的區塊底色、外框、分隔區塊、色票，以及執行期會改變填色的狀態方塊。

LVGL 並沒有矩形元件：矩形其實就是一個套上填色、邊框與圓角的一般物件，也正是 `lv_obj_create` 所建立的東西。矩形不是容器元件（`isContainer = false`），不能包含子元件——需要容納子元件時請使用 Container（`obj`）。

## 2. 元件類型識別碼

```
type: 'rectangle'
```

元件面板中顯示為 **Rectangle**，但屬性面板的 **Type** 顯示為 `Shape`：這個元件只是此分類收納的多種圖形之一，定義中以選填的 `typeName` 欄位標示所屬家族 — Line 也帶著同一個。新建立的實例由共用的 `nextComponentName` 規則命名為 `Rectangle_1`、`Rectangle_2`……，刪除後釋出的編號會優先被重複使用。

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `shape` |
| 分類名稱 | Shapes（圖形） |
| 分類圖示 | 🔷 |
| 元件圖示 | 🟦 |
| 家族名稱（`typeName`） | Shape |

此分類位於元件面板中 Input 與 Containers 之間。

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 120 |
| defaultHeight | 80 |

放到畫布上時一眼就看得出是矩形而非正方形，同時在 480×272 的面板上還能並排放下數個。

## 5. 是否為容器

```
isContainer: false
```

把元件拖到矩形上時，會掛載到矩形的父層而不是矩形本身。需要容納子元件的圖形，本質上就是容器。

## 6. 父子關係規則

### 可作為以下元件的子元件

- **Screen（頁面根節點）**——直接放置於頁面上
- **Button（btn）**——作為按鈕內的裝飾
- **Container（obj）**——放置於通用容器內
- **Tab View（tabview）**——放置於分頁內容區
- **Tile View（tileview）**——放置於圖磚內
- **Window（win）**——放置於視窗內容區

### 可包含的子元件

無。

## 7. 屬性設計（props）

```
defaultProps: {}
```

矩形**沒有自己的 props**。它所繪製的一切——填色、漸層、邊框顏色／寬度／邊、圓角、外框線、陰影、不透明度——全都是樣式，而共用的 Style 區塊已經涵蓋全部。

> 這正是與 Line 刻意不同之處。Line 之所以帶有 `lineWidth` 與 `lineColor`，是因為 LVGL 的 `line_width` / `line_color` 樣式在編輯器中沒有其他途徑可設定；而矩形的 `bg_*`、`border_*` 樣式本來就設定得到，再鏡射成 props 只會讓同一個值出現兩個設定入口。至於 `points`，對矩形完全沒有意義。

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
| `bgColor` | `string` | `'#E0E0E0'` | 填色（LVGL 的 `color_grey`） |
| `borderColor` | `string` | `'#212121'` | 邊框顏色（`color_text`） |
| `borderWidth` | `number` | `1` | 邊框寬度——細線外框 |
| `borderRadius` | `number` | `0` | 直角，否則就名不副實了 |
| `textColor` | `string` | `'#212121'` | 文字顏色，圖形本身不使用 |
| `opacity` | `number` | `1` | 整個元件的不透明度 |
| `padding` | `number` | `0` | 無內距——圖形沒有需要內縮的內容 |

### 樣式來源說明

沒有可繼承的 LVGL 主題樣式：圖形是「畫」出來的，不是主題化出來的。預設值借用主題的色盤，讓矩形與其他元件擺在一起不突兀——`color_grey`（`#E0E0E0`）的填色配上 `color_text`（`#212121`）的細邊框——同時保持直角與零內距，這也正是圖形與 card 樣式 Container 的分野。

### 擴充樣式區塊

矩形啟用所有會「畫出一個方框」的樣式區塊：

- 陰影：`shadowColor`、`shadowWidth`、`shadowOffsetX/Y`、`shadowSpread`、`shadowOpacity`
- 漸層：`bgGradColor`、`bgGradDir`、`bgGradStop`
- 外框線：`outlineColor`、`outlineWidth`、`outlinePad`
- 變形：`transformAngle`、`transformZoomX/Y`、`transformPivotX/Y`
- 混合模式：`blendMode`
- 邊框方向與四角圓角，來自共用的 Style 區塊

捲軸與文字區塊則維持隱藏：矩形既不捲動，也不繪製文字。

> 變形（Transform）是唯一在裝置上有代價的區塊。旋轉或縮放過的元件會透過 layer 繪製 — 一整塊與元件同尺寸的連續 ARGB8888 緩衝區，`(w + 10) × (h + 10) × 4` bytes，從 LVGL 的堆積配置出來，而且不會被切成橫條。一個 200×200 的矩形就要 179 KB。各板的堆積大小已為此調整（[LVGL 設定 §1.4](../lvgl-configuration.md)）；萬一仍然放不下，失敗是無聲的：LVGL 會完全畫不完那一個 frame，面板因此凍結在原本的畫面，而不是只少掉這個圖形。

## 9. 支援的事件

| 事件 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊 |
| `LV_EVENT_PRESSED` | 按下 |
| `LV_EVENT_RELEASED` | 放開 |
| `LV_EVENT_LONG_PRESSED` | 長按 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

`lv_obj_create` 建立的物件預設即為可點擊，因此矩形一放上畫面就是可用的觸控區域——可以當作某塊區域的感應區，或是可點擊的色塊。`LV_EVENT_VALUE_CHANGED` 則沒有意義：圖形不持有數值。同理，Modbus 綁定編輯器也刻意不提供矩形；若要用暫存器驅動圖形，請在邏輯圖中讀取暫存器再設定其樣式。

## 10. UI 繪製層

### 10.1 編輯器畫布（CanvasComponent.tsx）

```tsx
case 'rectangle':
  return null;
```

每個畫布元件外層本來就會渲染的 `<div>`，已依樣式畫出填色、漸層、邊框、圓角、陰影、外框線與變形——而這就是矩形的全部，內層沒有東西需要再畫。

`resolveFallbackBackground` 對矩形回傳 `'transparent'`：把填色清掉正是繪製「只有外框」圖形的作法，畫布不能好心地又把它填回去。

### 10.2 簡易預覽（PreviewPanel.tsx）

矩形共用面板的繪製路徑：

```typescript
case 'rectangle':
case 'obj':
case 'panel':
case 'container':
  drawPanel(ctx, x, y, w, h, {
    bgColor: bgColorStyle,
    borderColor,
    borderWidth,
    borderRadius,
    gradientFill: getGradientFill(),
    borderSide: styles.borderSide,
  });
  break;
```

`drawPanel` 先填出一個圓角矩形，再依設定描出需要的邊——與面板畫的是同一個方框。

> 供給這個 switch 的樣式預設值採用 nullish（`??`）而非 falsy（`||`）：圖形指定 `borderRadius: 0` 或 `borderWidth: 0` 就是要 0，編輯器畫布一直都是這樣處理的。

### 10.3 LVGL WASM 預覽

序列化方式與其他節點相同：

```json
{
  "type": "rectangle",
  "id": "comp-xxx",
  "parent": null,
  "x": 100, "y": 20,
  "width": 120, "height": 80,
  "props": {},
  "styles": {
    "default": {
      "bgColor": "#E0E0E0",
      "borderColor": "#212121",
      "borderWidth": 1,
      "borderRadius": 0,
      "textColor": "#212121",
      "opacity": 1,
      "padding": 0
    }
  }
}
```

C 端把 `rectangle` 對應到共用的物件建立函式：

```c
{ "rectangle", create_obj },
```

接著由 `apply_styles` 完成上色。`ui_from_json` 對未知型別本來就會退回 `lv_obj_create`，所以在這筆對應加入之前矩形就已經正確顯示；加上這一筆是讓對應關係成為明確的設計而非巧合，並會在下次執行 `wasm/build.sh` 時進入實際發佈的二進位檔。

### 10.4 產生的程式碼（ui.c.ts）

```c
// Create rectangle: frame
ui_frame = lv_obj_create(ui_screen_main);
lv_obj_set_pos(ui_frame, 100, 20);
lv_obj_set_size(ui_frame, 120, 80);
lv_obj_set_style_bg_color(ui_frame, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_bg_opa(ui_frame, LV_OPA_COVER, 0);
lv_obj_set_style_border_color(ui_frame, lv_color_hex(0x212121), 0);
lv_obj_set_style_border_width(ui_frame, 1, 0);
lv_obj_set_style_radius(ui_frame, 0, 0);
lv_obj_set_style_pad_all(ui_frame, 0, 0);
```

`getCreateFunction` 把 `rectangle` 對應到 `lv_obj_create`；`generatePropsCode` 中沒有對應的 case，因為它沒有 props。所有看得見的外觀都由共用的樣式產生器輸出，而該產生器會為元件定義的每個樣式輸出明確的值——包含 `radius: 0`，因此產生出來的矩形不會被主題的圓角預設值蓋掉。

## 11. LVGL API 對應

### 建立

| 版本 | API |
|---|---|
| LVGL v9 | `lv_obj_create(parent)` |
| LVGL v8 | `lv_obj_create(parent)` |

### 主要 API

| API | 說明 |
|---|---|
| `lv_obj_create(parent)` | 建立作為圖形載體的物件 |
| `lv_obj_set_style_bg_color(obj, color, sel)` | 填色 |
| `lv_obj_set_style_bg_opa(obj, opa, sel)` | 填色不透明度——`LV_OPA_TRANSP` 即為只有外框的圖形 |
| `lv_obj_set_style_bg_grad_color(obj, color, sel)` | 漸層結束色 |
| `lv_obj_set_style_border_color(obj, color, sel)` | 邊框顏色 |
| `lv_obj_set_style_border_width(obj, w, sel)` | 邊框寬度 |
| `lv_obj_set_style_border_side(obj, side, sel)` | 要繪製哪幾邊 |
| `lv_obj_set_style_radius(obj, r, sel)` | 圓角半徑 |
| `lv_obj_set_style_outline_width(obj, w, sel)` | 外框線寬度 |
| `lv_obj_set_style_shadow_width(obj, w, sel)` | 陰影寬度 |
| `lv_obj_set_pos(obj, x, y)` | 位置 |
| `lv_obj_set_size(obj, w, h)` | 尺寸 |

## 12. 設計要點

1. **圖形就是樣式，別無其他。** 整個元件即為它的樣式集合，這也是它沒有 props、屬性面板只顯示共用區塊的原因。再加上 `fillColor` 之類的 props 只會與 Style 區塊重複，讓同一個值有兩個來源。

2. **Rectangle 與 Container 的差別。** 兩者底層都是 `lv_obj_create`。Container 是 `padding: 16` 的 card 樣式方框，可以容納子元件；Rectangle 是 `padding: 0` 的直角圖形，不能。兩者分開，階層樹才誠實：樹上的矩形永遠是裝飾，不會是父節點。

3. **預設為直角。** `borderRadius: 0` 是矩形唯一不能妥協的預設值。畫布與產生的程式碼都會明確輸出 `0`；Canvas 2D 預覽的圓角預設值也改為 nullish 判斷，以與兩者一致。

4. **預設可點擊。** LVGL 的基礎物件帶有 `LV_OBJ_FLAG_CLICKABLE`，因此矩形可以直接綁定事件——不像 Line 只有 4px 的感應範圍，實務上難以綁定事件。若希望觸控穿透到下層，取消 Clickable 旗標即可。

5. **這是一個家族，不是單一元件。** `typeName: 'Shape'` 的存在，讓屬性面板可以顯示家族名稱，而元件面板顯示的是具體的圖形。Line 同樣帶著它；未來的 Circle 或 Triangle 會是同分類、同 `typeName` 的新定義，而不是這個元件上的變體屬性。

6. **不提供 Modbus 綁定。** 綁定編輯器列出的是持有數值的元件，圖形沒有數值，因此刻意不列入；要改變矩形的外觀，請透過邏輯圖驅動。
