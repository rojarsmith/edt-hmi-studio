# Image (img) — 圖片元件設計文件

<p align="center">
  <a href="../../components/img.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Image（圖片）是用於顯示圖像資源的基礎元件。在 LVGL 中，圖片物件（`lv_image` / `lv_img`）用於顯示預先編譯的 C 陣列影像，或外部檔案系統中的圖片，並支援旋轉、縮放等變換操作。

圖片不是容器元件（`isContainer = false`），不能包含子元件。

## 2. 元件類型識別碼

```
type: 'img'
```

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `basic` |
| 分類名稱 | 基礎 |
| 分類圖示 | 📦 |
| 元件圖示 | 🖼️ |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 100 |

## 5. 是否為容器

```
isContainer: false
```

圖片是純顯示元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Button (btn)** — 作為按鈕內的圖示
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區
- **Tile View (tileview)** — 放在圖磚區域內
- **Window (win)** — 放在視窗內容區

### 可以包含的子元件

無。圖片不是容器，不能包含任何子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `src` | `string` | `''` | 圖片來源。可以是資源 ID、資源名稱、C 陣列名稱或 data URL |
| `rotation` | `number` | `0` | 旋轉角度（度；生成程式碼時乘以 10，轉換為 LVGL 的 0.1° 單位） |
| `scaleMode` | `string` | `undefined` | 縮放模式：`'cover'` / `'contain'`（需自行實作） |

### props 型別定義

```typescript
interface ImgProps {
  src: string;
  rotation?: number;
  scaleMode?: 'cover' | 'contain';
}
```

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
| `borderColor` | `string` | `'transparent'` | 邊框顏色（無邊框） |
| `borderWidth` | `number` | `0` | 邊框寬度 |
| `borderRadius` | `number` | `0` | 圓角半徑 |
| `textColor` | `string` | `'#212121'` | 文字顏色（供佔位文字使用） |
| `opacity` | `number` | `1` | 不透明度 |
| `padding` | `number` | `0` | 內距 |

### 樣式來源說明

圖片元件在 LVGL 預設主題中沒有特殊樣式，使用基礎物件的預設值：
- 背景透明
- 無邊框、無圓角、無內距

### 擴充樣式屬性

圖片支援繼承自 `StyleProps` 的通用擴充樣式：

- 陰影：`shadowColor`、`shadowWidth`、`shadowOffsetX`、`shadowOffsetY`、`shadowSpread`、`shadowOpacity`
- 外框：`outlineColor`、`outlineWidth`、`outlinePad`
- 變換：`transformAngle`、`transformZoomX`、`transformZoomY`、`transformPivotX`、`transformPivotY`
- 混合模式：`blendMode`

## 9. 事件支援

圖片支援下列 LVGL 事件類型：

| 事件類型 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

> 注意：圖片預設不可點擊。若要回應事件，需在 flags 中設定 `clickable = true`。

## 10. UI 層設計

### 10.1 編輯器畫布繪製（CanvasComponent.tsx）

在編輯器畫布中，圖片由 `CanvasImageContent` 子元件繪製：

```tsx
// 有圖片資源時
<div className="lvgl-img" style={{
  width: '100%', height: '100%',
  backgroundImage: `url(${matched.data})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
}} />

// 無圖片資源時（佔位圖）
<div className="lvgl-img placeholder" style={{
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100%', height: '100%', fontSize: '24px',
  backgroundColor: '#f0f0f0',
}}>
  🖼️
</div>
```

關鍵行為：
- 透過 `useResourceStore` 查找圖片資源（以 ID、名稱或 C 陣列名稱比對）
- 找到資源時以 `backgroundImage` 顯示，並使用 `100% 100%`，與生成程式碼所套用的拉伸一致
- 找不到資源時顯示 🖼️ 佔位圖示
- 圖片元件本身**不會**被套上不透明的背景回退：那會墊在來源影像的 alpha 通道之後，讓透明 PNG 看起來變成不透明，與 LVGL 實際繪製的結果不符。可見性改由佔位圖自行填色來確保，未解析出圖片時仍可見且可點選
- 支援選取高亮、停留效果、拖曳、調整大小控制點

### 10.2 Prototype 繪製（PreviewPanel.tsx）

在 Canvas 2D Prototype 中，圖片以 `drawImage()` 函式繪製：

```typescript
drawImage(ctx, x, y, w, h, {
  src: comp.props.src,
  loadImage,
});
```

關鍵行為：
- 透過 `loadImage()` 回呼載入圖片（支援資源 ID、名稱、data URL、HTTP URL）
- 使用記憶體快取（`imageCache`）避免重複載入
- 圖片載入完成後以 `ctx.drawImage()` 繪製
- 沒有 src 或尚未載入時，繪製灰色佔位矩形加上 🖼️ 圖示
- 載入完成後自動觸發重繪

### 10.3 Simulator 繪製

#### JSON 序列化（editorStateToJson.ts）

圖片會被序列化為扁平化的 JSON 元件節點：

```json
{
  "type": "img",
  "id": "comp-xxx",
  "parent": null,
  "x": 20, "y": 20,
  "width": 100, "height": 100,
  "props": { "src": "" },
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
static lv_obj_t *create_img(lv_obj_t *parent, const cJSON *comp) {
    (void)comp;
    /* Image source handling would require asset management;
       for now just create the widget */
    return lv_image_create(parent);
}
```

關鍵行為：
- 呼叫 `lv_image_create()` 建立圖片物件（v9 API）
- 目前 WASM 預覽尚未處理圖片來源（需要資產管理系統支援）
- 只建立空的 image widget，並套用位置、尺寸與樣式

### 10.4 程式碼生成輸出（ui.c.ts）

```c
// Create img: my_image
my_image = lv_image_create(parent);  // v9
// my_image = lv_img_create(parent); // v8
lv_obj_set_pos(my_image, 20, 20);
lv_obj_set_size(my_image, 100, 100);
lv_obj_set_style_bg_opa(my_image, LV_OPA_TRANSP, 0);

// 設定圖片來源（比對到資源時使用 C 陣列名稱）
lv_image_set_src(my_image, &my_icon);  // v9
// lv_img_set_src(my_image, &my_icon); // v8

// 將來源拉伸至元件邊界（v9）
lv_image_set_inner_align(my_image, LV_IMAGE_ALIGN_STRETCH);

// 旋轉（有設定 rotation 時）
lv_image_set_rotation(my_image, 450);  // v9，45° × 10
// lv_img_set_angle(my_image, 450);    // v8
```

關鍵行為：
- v9 使用 `lv_image_create` / `lv_image_set_src` / `lv_image_set_rotation`
- v8 使用 `lv_img_create` / `lv_img_set_src` / `lv_img_set_angle`
- 圖片來源比對邏輯：先在 `imageResources` 中以 ID 或名稱查找，找到就使用其 `cArrayName`；否則直接把 `props.src` 當作 C 變數名稱
- 針對 v9 會輸出 `lv_image_set_inner_align(..., LV_IMAGE_ALIGN_STRETCH)`，讓來源填滿元件邊界，與畫布顯示一致
- 旋轉角度乘以 10（LVGL 使用 0.1° 單位）
- `scaleMode` 需自行實作，生成時輸出註解提示

## 11. LVGL API 對應

### 建立函式

| 版本 | API |
|---|---|
| LVGL v9 | `lv_image_create(parent)` |
| LVGL v8 | `lv_img_create(parent)` |

### 關鍵 API

| API (v9) | API (v8) | 說明 |
|---|---|---|
| `lv_image_create(parent)` | `lv_img_create(parent)` | 建立圖片物件 |
| `lv_image_set_src(img, src)` | `lv_img_set_src(img, src)` | 設定圖片來源 |
| `lv_image_set_rotation(img, angle)` | `lv_img_set_angle(img, angle)` | 設定旋轉角度（0.1° 單位） |
| `lv_image_set_scale(img, zoom)` | `lv_img_set_zoom(img, zoom)` | 設定縮放（256 = 100%） |
| `lv_image_set_inner_align(img, align)` | — | 設定來源如何貼合元件 |
| `lv_obj_set_pos(img, x, y)` | 同左 | 設定位置 |
| `lv_obj_set_size(img, w, h)` | 同左 | 設定尺寸 |
| `lv_obj_set_style_bg_opa(img, opa, sel)` | 同左 | 設定背景不透明度 |

### 圖片宣告巨集

| 版本 | 巨集 | 說明 |
|---|---|---|
| LVGL v9 | `LV_IMAGE_DECLARE(var_name)` | 宣告外部的圖片 C 陣列 |
| LVGL v8 | `LV_IMG_DECLARE(var_name)` | 宣告外部的圖片 C 陣列 |

## 12. 設計注意事項

1. **圖片資源管理**：編輯器以 `resourceStore` 管理圖片資源。每個資源包含 `id`、`name`、`cArrayName`（C 陣列變數名稱）與 `data`（base64／data URL）。`props.src` 存的是資源 ID 或名稱，生成程式碼時轉換為 C 陣列引用。

2. **v8/v9 API 差異**：圖片是 v8 與 v9 之間 API 差異最大的元件。生成器依 `options.lvglVersion` 決定使用哪一套。主要差異：
   - 建立：`lv_img_create` → `lv_image_create`
   - 設定來源：`lv_img_set_src` → `lv_image_set_src`
   - 旋轉：`lv_img_set_angle` → `lv_image_set_rotation`
   - 縮放：`lv_img_set_zoom` → `lv_image_set_scale`
   - 宣告巨集：`LV_IMG_DECLARE` → `LV_IMAGE_DECLARE`

3. **WASM 預覽限制**：目前 WASM 預覽尚未解析圖片來源（`create_img` 中標註了 TODO），圖片在該處只會顯示為空的 image widget。

4. **畫布上的透明處理**：圖片與 image-button 元件在設計畫布上刻意維持透明背景。不透明的回退會墊在來源影像的 alpha 通道之後，使透明 PNG 看起來變成不透明。可見性改由 `CanvasImageContent` 在尚未解析出圖片時繪製的佔位圖自行填色來確保。共用的回退表位於 `src/components/Canvas/widgetBackground.ts`。

5. **圖片快取**：Prototype 以 `imageCache`（Map）快取已載入的 `HTMLImageElement`，避免每次重繪都重新載入。

6. **旋轉單位**：LVGL 以 0.1° 為旋轉單位。編輯器的 `rotation` 屬性以度為單位，生成時會自動乘以 10。

7. **縮放模式**：`scaleMode`（`cover`／`contain`）在 LVGL 中沒有直接對應的 API，需自行實作，生成時會輸出註解提示使用者處理。另請注意，生成器對 v9 已經會輸出 `lv_image_set_inner_align(..., STRETCH)`，讓影像填滿元件邊界。

8. **圖片宣告**：生成程式碼時，實際用到的圖片資源會在檔案頂端產生 `LV_IMAGE_DECLARE`（v9）或 `LV_IMG_DECLARE`（v8）宣告。只宣告實際使用到的資源（由 `collectUsedImages` 函式過濾）。

9. **Flash 佔用**：圖片元件會把來源拉伸到元件邊界，因此超出最大固定尺寸用途的像素只會多佔目標板的 Flash。HMI 專案原始碼組建流程正是基於這點，將一般圖片來源縮到其在畫面上的尺寸。
