# Polygon（polygon）— 元件設計文件

<p align="center">
  <a href="../../components/polygon.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 名稱與摘要

Polygon 是 **Shapes** 分類中的多邊形成員，與 [Rectangle](rectangle.md)、[Line](line.md)、[Circle](circle.md) 並列。它畫的是**一串封閉的座標點**：菱形、三角形、箭頭、六邊形、切角面板——任何用角點列舉得出來的輪廓。

**LVGL 沒有多邊形 widget，也沒有填滿多邊形的圖元。** 輪廓是一個把首點重複到尾端的 `lv_line`，填色則是畫在它底下的一組三角形扇形。整個實作就是這樣，而它也決定了這個 widget 唯一的規則：**扇形只蓋得住凸多邊形**，所以會往內折的形狀一律不填色——編輯畫布、兩個預覽、實機面板都一樣。

Polygon 不是容器（`isContainer = false`）。

## 2. 型別識別碼

```
type: 'polygon'
```

面板上顯示為 **Polygon**，實例命名為 `Polygon_1`、`Polygon_2`……；屬性編輯器的 **Type** 顯示為 `Shape`，也就是其他三個形狀所屬的家族。

## 3. 分類

| 欄位 | 值 |
|---|---|
| 分類 id | `shape` |
| 分類名稱 | Shapes |
| 元件圖示 | 🔷 |
| 家族名稱（`typeName`） | Shape |
| 位置 | 第四個，接在 Rectangle、Line、Circle 之後 |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 100 |

預設是菱形：四個點、一眼看得出不是矩形，而且是凸的，所以預設形狀可以填色。

外框就是點座標的範圍，不多一分——沒有多餘的空白可以選取、設定樣式或拖曳。拖動控制點會縮放座標，編輯座標會改變外框。`applyPolygonGeometry` 同時掌管兩個方向，所有會改動多邊形的路徑都經過它。

## 5. 是否為容器

```
isContainer: false
```

## 6. 父子規則

### 可以是誰的子元件

- **Screen（頁面根）**、**Button (btn)**、**Container (obj)**、**Tab View**、**Tile View**、**Window**——與其他形狀相同

### 可以包含

無。

## 7. 屬性（props）

| 名稱 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `points` | `number[][]` | 菱形 | 角點，`[[x, y], …]`，以外框為原點。這串點自己閉合：最後一點連回第一點 |
| `lineWidth` | `number` | `2` | 輪廓寬度。`0` 表示不畫輪廓 |
| `lineColor` | `string` | `'#212121'` | 輪廓顏色 |
| `lineRounded` | `boolean` | `false` | 讓輪廓轉角以半個線寬圓角化 |

```typescript
interface PolygonProps {
  points: number[][];
  lineWidth: number;
  lineColor: string;
  lineRounded: boolean;
}
```

**沒有填色屬性。** 填色就是 Style 區塊的 `bgColor`，跟 Rectangle 填的是同一個——多一個顏色欄位就是對同一個問題給出第二個答案。設為 `transparent` 則只留輪廓。

**首點不會存兩次。** 形狀本來就是封閉的；產生出來的 C 之所以重複它，是因為 `lv_line_set_points` 畫的是開放折線。

**座標照著填的樣子保留，含小數。** `lv_point_precise_t` 只有在建置設定 `LV_USE_FLOAT` 時才是浮點，而這份韌體沒有——所以編輯器保留設計當下的精度，產碼時再四捨五入成整數像素。日後要打開 `LV_USE_FLOAT`，改的是產碼器一行，而不是任何人的專案檔。

## 8. 樣式

### 預設狀態樣式

| 樣式屬性 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `bgColor` | `string` | `'#E0E0E0'` | **填色。** `transparent` 或凹多邊形都會讓它不填 |
| `borderColor` | `string` | `'transparent'` | 未使用——輪廓是 `lineColor` |
| `borderWidth` | `number` | `0` | 未使用——這裡的邊框會在形狀外畫出一個矩形 |
| `borderRadius` | `number` | `0` | 未使用 |
| `opacity` | `number` | `1` | 整個 widget 的不透明度，含填色 |

配色沿用 Rectangle，讓四個形狀看起來是一組的。

外框樣式會在產碼時被丟掉，與 Line 的處理相同、理由也相同：widget 的外框不是會被畫出來的東西。舊專案帶著這些樣式時是在產碼路徑上丟棄，而不是去遷移專案檔。

## 9. 支援的事件

與其他形狀相同——`LV_EVENT_CLICKED`、`PRESSED`、`RELEASED`、`LONG_PRESSED`、`FOCUSED`、`DEFOCUSED`。命中區域是 widget 的矩形外框，而不是裡面那條輪廓，這也是 LVGL 對所有 widget 的做法。

## 10. UI 各層

### 10.1 幾何（utils/polygonGeometry.ts）

一個模組收著其他各層依據的規則：

- `normalizePolygonPoints(value)`——把儲存的點整理成可用的座標對，保留小數；少於三點則退回預設
- `polygonBox(points)` / `pointsInPolygonBox(points)`——外框，以及把形狀移到外框角落
- `scalePolygonPoints(points, from, to)`——拖動控制點時做的事
- `isConvexPolygon(points)`——扇形蓋不蓋得住，以每個轉角的外積正負號判定
- `polygonFanTriangles(points)`——填色，就是韌體畫的那組三角形
- `applyPolygonGeometry(before, after)`——§4 的雙向規則

### 10.2 編輯畫布（CanvasComponent.tsx）

一個 SVG `<polygon>`，它跟這個形狀一樣會自己閉合：

```tsx
<polygon
  points={placed.map(([x, y]) => `${x},${y}`).join(' ')}
  fill={convex && bgColor !== 'transparent' ? bgColor : 'none'}
  stroke={lineWidth > 0 ? lineColor : 'none'}
  strokeWidth={lineWidth}
/>
```

底下再疊一份透明的複本來加大點擊範圍，讓沒有填色的輪廓也好點——那是編輯器的輔助，永遠不會畫到面板上。

### 10.3 簡易預覽（PreviewPanel.tsx）

`drawPolygon` 走同一組點、`closePath` 起來，凸的就填、然後描邊。用的是單一路徑而不是韌體那組扇形：在凸多邊形上兩者覆蓋的像素相同，而路徑不會有三角形之間的接縫。

### 10.4 LVGL WASM 預覽與產生的程式碼

兩邊做的是同兩件事，因為兩邊都是 LVGL。

```c
static lv_point_precise_t ui_shape_1_points[5] = {{50, 0}, {100, 50}, {50, 100}, {0, 50}, {50, 0}};

static const ui_polygon_fill_t ui_shape_1_fill = { ui_shape_1_points, 4, 0xE0E0E0 };

ui_shape_1 = lv_line_create(ui_screen_home);
lv_obj_set_size(ui_shape_1, 100, 100);
lv_line_set_points(ui_shape_1, ui_shape_1_points, 5);
lv_obj_set_style_line_color(ui_shape_1, lv_color_hex(0x212121), 0);
lv_obj_add_event_cb(ui_shape_1, ui_polygon_fill_cb, LV_EVENT_DRAW_MAIN_BEGIN, (void *)&ui_shape_1_fill);
```

陣列是五個點，填色記錄寫的是四個：那個閉合用的重複點屬於輪廓，扇形用不到它。

專案裡所有需要填色的多邊形共用同一個 callback，各自透過事件的 user data 交給它一份自己的點與顏色：

```c
static void ui_polygon_fill_cb(lv_event_t *e) {
    lv_obj_t *obj = lv_event_get_target(e);
    lv_layer_t *layer = lv_event_get_layer(e);
    const ui_polygon_fill_t *fill = lv_event_get_user_data(e);

    lv_area_t area;
    lv_obj_get_coords(obj, &area);
    int32_t x_ofs = area.x1 - lv_obj_get_scroll_x(obj);
    int32_t y_ofs = area.y1 - lv_obj_get_scroll_y(obj);

    lv_draw_triangle_dsc_t dsc;
    lv_draw_triangle_dsc_init(&dsc);
    dsc.color = lv_color_hex(fill->color);
    dsc.opa = lv_obj_get_style_opa(obj, LV_PART_MAIN);

    for (uint32_t i = 1; i + 1 < fill->point_cnt; i++) {
        /* … 三個角點，各自加上 x_ofs/y_ofs … */
        lv_draw_triangle(layer, &dsc);
    }
}
```

其中三個細節是關鍵：

- **`LV_EVENT_DRAW_MAIN_BEGIN`**，不是 `DRAW_MAIN`。line widget 是在 `DRAW_MAIN` 描自己的邊，填色畫在那裡會蓋掉自己的輪廓。
- **與 `lv_line` 相同的原點**——`area.x1 - lv_obj_get_scroll_x(obj)`，抄自 `lv_line.c`。換成別的原點，填色與輪廓就會在可捲動的父層裡分家。
- **顏色以整數傳遞**，因為靜態初始化不能呼叫 `lv_color_hex()`。

> WASM 預覽的 `create_polygon` 做的是同一件事，會在下一次 `wasm/build.sh` 後生效；已進版控的 `public/wasm` 二進位檔比它早。

## 11. LVGL API 對照

| API | 用途 |
|---|---|
| `lv_line_create(parent)` | 這個 widget |
| `lv_line_set_points(obj, points, n)` | 封閉輪廓 |
| `lv_obj_set_style_line_width / _color / _rounded` | 輪廓怎麼描 |
| `lv_draw_triangle_dsc_init(&dsc)` / `lv_draw_triangle(layer, &dsc)` | 填色的每一個三角形 |
| `lv_event_get_layer(e)` | 填色要畫在哪一層 |
| `lv_obj_add_event_cb(obj, cb, LV_EVENT_DRAW_MAIN_BEGIN, data)` | 讓填色畫在輪廓底下 |

## 12. 設計註記

### 12.1 為什麼凹多邊形不填色

從第 0 點出發的三角形扇形，能精準覆蓋凸多邊形。但在凹的形狀上——箭頭、星形、V 形——扇形會跨過那個凹口，填色就會鼓出形狀之外。

有三條路可走，但在這裡都不划算：

| 做法 | 代價 |
|---|---|
| **耳切法（ear clipping）** | 真正的三角化，大約 150 行產生出來或引入的 C，再加上退化情況。等真的有人需要凹多邊形填色時值得做，現在也沒有東西擋著 |
| **向量圖形**（`LV_USE_VECTOR_GRAPHIC`） | 需要 `LV_USE_MATRIX`，外加一個支援向量的繪圖後端：ThorVG（C++，體積可觀）或向量 GPU。這裡的板子都沒有 |
| **照填不誤** | 編輯器會顯示一個面板畫不出來的形狀 |

所以形狀就不填，屬性編輯器在設定的旁邊說明原因。這裡遵循的是整個工具遵循的那條規則：**畫布上看到的，就是面板畫出來的**。

### 12.2 其他

1. **輪廓是 widget，填色是 callback。** 沿用 `lv_line` 就免費得到線寬、顏色與圓角這些一般樣式，執行期可改，而不必在繪圖 callback 裡重寫一遍。

2. **閉合用的重複點只存在於產生的程式碼，不存在於專案。** 一份自己重複首點的清單，遲早會有人只改了其中一份。

3. **點在編輯器是浮點、在韌體是整數像素。** 兩者可以不同，因為一個是設計、一個是建置；細節見 §7。

4. **新增角點會放在閉合的那條邊上**，也就是最後一點與第一點之間，因為那正是點列表沒有顯示出來的那條邊。
