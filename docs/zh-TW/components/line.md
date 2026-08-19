# Line (line) — 線條元件設計文件

<p align="center">
  <a href="../../components/line.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Line（線條）是用於繪製直線段的元件。在 LVGL 中，線條物件（`lv_line`）以一組點座標定義線段形狀，並支援設定線寬、線色等屬性。線條常用於介面中的分隔線、裝飾線等情境。

它屬於 **Shapes（圖形）** 分類，與 [Rectangle](rectangle.md) 並列：是繪製出來的幾何圖形，而非互動控制項。在該分類出現之前，它歸在基礎元件。

線條不是容器元件（`isContainer = false`），不能包含子元件。

## 2. 元件類型識別碼

```
type: 'line'
```

元件面板中顯示為 **Line**，屬性面板的 **Type** 則顯示為 `Shape` — 它所屬的家族，由定義中選填的 `typeName` 指定。實例名稱仍依元件面板名稱命名為 `Line_1`、`Line_2`……

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `shape` |
| 分類名稱 | Shapes（圖形） |
| 分類圖示 | 🔷 |
| 元件圖示 | 📏 |
| 家族名稱（`typeName`） | Shape |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 2 |

這個高度就是線寬，不是為了好點選而留的空間：**線條不該有線條本身以外的區域**。它的外框就是點座標的範圍，在它不延伸的那個軸向上撐開到 `lineWidth` 為止，編輯器會一直維持這個關係 — 見 §7.1。畫布另外在筆畫上疊了一層透明的加寬點擊區，那是編輯器的輔助，不屬於元件本身。

## 5. 是否為容器

```
isContainer: false
```

線條是純顯示元件，不能包含子元件。

## 6. 父子關係設計

### 可以作為以下元件的子項

- **Screen（畫面根節點）** — 直接放在頁面上
- **Button (btn)** — 作為按鈕內的裝飾線
- **Container (obj)** — 放在通用容器內
- **Tab View (tabview)** — 放在分頁的內容區
- **Tile View (tileview)** — 放在圖磚區域內
- **Window (win)** — 放在視窗內容區

### 可以包含的子元件

無。線條不是容器，不能包含任何子元件。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `points` | `number[][]` | `[[0,0],[100,0]]` | 線段的點座標陣列，每個點為 `[x, y]` |
| `lineWidth` | `number` | `2` | 線寬（像素）— `line_width` |
| `lineColor` | `string` | `'#212121'` | 線條顏色 — `line_color` |
| `lineRounded` | `boolean` | `false` | 兩端以半個線寬收圓 — `line_rounded` |
| `lineDashWidth` | `number` | `0` | 虛線的線段長度，`0` 為實線 — `line_dash_width` |
| `lineDashGap` | `number` | `0` | 虛線間隔，未設定時沿用線段長度 — `line_dash_gap` |

### props 型別定義

```typescript
interface LineProps {
  points: number[][];  // [[x1,y1], [x2,y2], ...]
  lineWidth?: number;
  lineColor?: string;
  lineRounded?: boolean;
  lineDashWidth?: number;
  lineDashGap?: number;
}
```

線條會畫出來的一切都在這裡，刻意沒有別的：一般元件帶的那些外框樣式，畫出來會是圍在筆畫外的一個矩形，而那正是線條不該有的東西，因此屬性面板把它們隱藏（§8）。

**Line** 區塊以 Direction、Length、Line Width、Line Color、Rounded Ends 與 Dash Length／Gap 來編輯它們，底下再放原始的點座標清單供折線使用。

### 7.1 points 說明，以及它決定的外框

`points` 就是形狀，元件的外框跟著它走。規則寫在 `src/utils/lineGeometry.ts`，所有會改到線條的路徑都經過它：

- **外框就是點座標的範圍**，在線條不延伸的那個軸向上不會薄於 `lineWidth`。100px 的水平 2px 線條是 100×2；同一條線改成 8px 是 100×8；垂直的則是 8×100。
- **拖曳外框會等比縮放點座標**，所以調整大小是把線拉長，而不是在旁邊生出空白。
- **往線條自身筆畫的方向拖曳不會有任何效果** — 規則會把外框放回去 — 因此畫布根本不畫那些控制點。水平線只有左右，垂直線只有上下，斜線則八個都有。
- **編輯點座標會反過來改變外框**，Direction 就是這樣把線轉向的：它改寫點座標，外框隨之改變。
- 範圍會置中於外框內，所以筆畫落在外框中線上，而不是貼著上緣。畫布、預覽與產生的程式碼都用 `pointsInBox` 擺放，因此三者一致。

預設值 `[[0,0],[100,0]]` 表示一條由左至右的水平線。多個點（折線）在資料、畫布、2D 預覽與程式碼生成上都支援；WASM 預覽最多讀 8 個點。

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
| `bgColor` | `string` | `'transparent'` | 不填色 — 沒有可以填的框 |
| `borderColor` | `string` | `'transparent'` | 不畫邊框，理由同上 |
| `borderWidth` | `number` | `0` | 不畫邊框 |
| `borderRadius` | `number` | `0` | 不使用 |
| `textColor` | `string` | `'#212121'` | 線條本身不使用 |
| `opacity` | `number` | `1` | 整個元件的不透明度 |
| `padding` | `number` | `0` | 無內距 |

### Style 區塊只剩一列

填色、邊框、圓角、邊框方向、文字顏色與內距對線條全部隱藏：它們每一項都是在畫一個框，而線條沒有框。共用樣式裡它只保留 **Opacity**，加上 Transform 與 Blend Mode 區塊。其餘會畫出來的東西都是 `line_*` 樣式，在 Line 區塊編輯。

舊專案還帶著線條屬於基礎元件時期的 `#212121` 1px 邊框。這裡不做任何搬移 — 編輯器不再繪製那些樣式，程式碼生成也會捨棄它們（§10.4）— 所以原本被畫在一個矩形裡的線條，從此不再是。

> 歷史註記：線條的顏色與寬度過去是從 `borderColor`、`borderWidth` 讀取的。`props.lineColor` 不存在時畫布仍會退回讀 `borderColor`，因此在 `lineColor` 出現之前寫成的專案會保留原本的顏色。

### 擴充樣式屬性

線條支援下列通用擴充樣式：

- 變換：`transformAngle`、`transformZoomX`、`transformZoomY`、`transformPivotX`、`transformPivotY`
- 混合模式：`blendMode`

## 9. 事件支援

線條支援下列 LVGL 事件類型：

| 事件類型 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊事件 |
| `LV_EVENT_PRESSED` | 按下事件 |
| `LV_EVENT_RELEASED` | 放開事件 |
| `LV_EVENT_LONG_PRESSED` | 長按事件 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

> 注意：元件只有筆畫那麼大，所以畫布會在它上面疊一層較寬的透明點擊區，讓它選得到。那是編輯器的輔助；在裝置上可觸控的範圍就是筆畫本身，這也是實務上很少為線條綁定事件的原因。

## 10. UI 層設計

### 10.1 編輯器畫布繪製（CanvasComponent.tsx）

畫布以 SVG polyline 畫出元件自己的點座標，因此垂直、虛線或斜線看起來就是 LVGL 將會畫出來的樣子：

```tsx
const points = normalizeLinePoints(props.points);
const box = lineBox(points, stroke);
const placed = pointsInBox(points, box);
<svg viewBox={`0 0 ${box.width} ${box.height}`} preserveAspectRatio="none">
  {/* 一條透明的 10px 筆畫，讓 2px 的線條仍然點得到 */}
  <polyline points={path} stroke="transparent" strokeWidth={Math.max(stroke, 10)} />
  <polyline
    points={path}
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap={props.lineRounded ? 'round' : 'butt'}
    strokeDasharray={dash}
  />
</svg>
```

重點行為：
- polyline 就是點座標，由 `pointsInBox` 擺放，因此繪製剛好填滿外框
- 線寬、顏色、圓端與虛線都以面板上將呈現的樣子繪出
- 顏色取自 `props.lineColor`，在該屬性出現之前寫成的專案則退回 `borderColor`
- **外層不套用任何外框樣式**：沒有填色、邊框、圓角或內距，因為線條沒有框
- 選取、hover 與拖曳與其他元件相同；調整大小的控制點只保留線條用得到的那些

### 10.2 簡易預覽繪製（PreviewPanel.tsx）

Canvas 2D 預覽描的是同一組點：

```typescript
function drawLine(ctx, x, y, w, h, opts) {
  const placed = pointsInBox(normalizeLinePoints(opts.points), { width: w, height: h });
  ctx.strokeStyle = opts.lineColor;
  ctx.lineWidth = Math.max(1, opts.lineWidth);
  ctx.lineCap = opts.rounded ? 'round' : 'butt';
  ctx.setLineDash(opts.dashWidth > 0 ? [opts.dashWidth, opts.dashGap || opts.dashWidth] : []);
  ctx.beginPath();
  placed.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(x + px, y + py) : ctx.lineTo(x + px, y + py)));
  ctx.stroke();
}
```

重點行為：
- 每個點都會畫出來，位置與畫布一致
- 端點樣式依 `lineRounded` 決定，不再一律圓端
- 虛線依 `lineDashWidth` / `lineDashGap`
- 上層仍可疊加動畫狀態

### 10.3 LVGL WASM 預覽繪製

#### JSON 序列化（editorStateToJson.ts）

```json
{
  "type": "line",
  "id": "comp-xxx",
  "parent": null,
  "x": 10, "y": 50,
  "width": 100, "height": 2,
  "props": {
    "points": [[0, 1], [100, 1]],
    "lineWidth": 2,
    "lineColor": "#212121",
    "lineRounded": false,
    "lineDashWidth": 0,
    "lineDashGap": 0
  },
  "styles": { "default": { "bgColor": "transparent", "borderWidth": 0, "opacity": 1 } }
}
```

#### C 端建立（ui_from_json.c）

`create_line` 會讀取每一個點（最多 8 個），並套用 `apply_styles` 不會處理的 `line_*` 樣式：

```c
static lv_obj_t *create_line(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *line = lv_line_create(parent);
    int slot = line_pool_used < LINE_POOL_LINES ? line_pool_used++ : LINE_POOL_LINES - 1;
    lv_point_precise_t *points = line_point_pool[slot];
    /* ... 讀取 props.points，缺漏時退回水平線 ... */
    lv_line_set_points(line, points, count);
    /* ... lv_obj_set_style_line_width / _color / _rounded / _dash_width / _dash_gap ... */
    return line;
}
```

重點行為：
- `lv_line_set_points` 保存的是指標而不是複製內容，因此點資料必須比元件活得久。每條線從一個池子取用自己的位置，池子在每次載入時清空 — **過去共用一個 `static` 陣列，導致畫面上每條線都畫成最後一條的點座標**
- 點資料缺漏或格式不符時，退回以元件寬度構成的水平線
- 線寬、顏色、圓端與虛線都在這裡套用，因為共用的樣式流程完全不認識 `line_*`

> 這些 C 端的修改要等下一次執行 `wasm/build.sh` 才會進入預覽；目前 `public/wasm` 中的二進位檔早於它們。

### 10.4 程式碼生成輸出（ui.c.ts）

```c
/* 檔案層級，緊接在物件指標之後 */
lv_obj_t *ui_divider;
static lv_point_precise_t ui_divider_points[2] = {{0, 1}, {120, 1}};

/* 在畫面的 init 之中 */
ui_divider = lv_line_create(ui_screen_main);
lv_obj_set_pos(ui_divider, 20, 40);
lv_obj_set_size(ui_divider, 120, 2);
lv_obj_set_style_bg_opa(ui_divider, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_width(ui_divider, 0, 0);
lv_line_set_points(ui_divider, ui_divider_points, 2);
lv_obj_set_style_line_width(ui_divider, 6, 0);       /* 與預設值 2 不同時才輸出 */
lv_obj_set_style_line_color(ui_divider, lv_color_hex(0xFF0000), 0);
lv_obj_set_style_line_rounded(ui_divider, true, 0);  /* lineRounded 為真時 */
lv_obj_set_style_line_dash_width(ui_divider, 8, 0);  /* lineDashWidth > 0 時 */
lv_obj_set_style_line_dash_gap(ui_divider, 4, 0);
```

重點行為：
- **點陣列輸出在檔案層級**並傳給 `lv_line_set_points`，因為 LVGL 保存的是指標。v9 用 `lv_point_precise_t`，v8 用 `lv_point_t`。在這之前，產生出來的線條根本不會畫出任何線段
- 點座標由 `pointsInBox` 擺放，因此面板畫出來的就是畫布上看到的
- 線條的外框樣式會被捨棄（`withoutBoxStyles`）：填色、邊框或圓角都會在筆畫外畫出一個矩形，舊專案帶著的那些也一樣捨棄
- `line_width` 只在與預設值 2 不同時輸出；顏色、圓端與虛線則有設就輸出

## 11. LVGL API 對應

### 建立函式

| 版本 | API |
|---|---|
| LVGL v9 | `lv_line_create(parent)` |
| LVGL v8 | `lv_line_create(parent)` |

### 關鍵 API

| API | 說明 |
|---|---|
| `lv_line_create(parent)` | 建立線條物件 |
| `lv_line_set_points(line, points, count)` | 設定線段的點座標陣列 |
| `lv_obj_set_style_line_width(line, width, sel)` | 設定線寬 |
| `lv_obj_set_style_line_color(line, color, sel)` | 設定線條顏色 |
| `lv_obj_set_style_line_rounded(line, en, sel)` | 設定線端是否為圓頭 |
| `lv_obj_set_style_line_dash_width(line, w, sel)` | 設定虛線段長度 |
| `lv_obj_set_style_line_dash_gap(line, gap, sel)` | 設定虛線間隔 |
| `lv_obj_set_pos(line, x, y)` | 設定位置 |
| `lv_obj_set_size(line, w, h)` | 設定尺寸 |

### 點座標型別

| 版本 | 型別 | 說明 |
|---|---|---|
| LVGL v9 | `lv_point_precise_t` | 精確座標（支援浮點） |
| LVGL v8 | `lv_point_t` | 整數座標 |

## 12. 設計注意事項

1. **線條不該有線條本身以外的區域。** 外框就是點座標的範圍，往外撐開到線寬為止、不再多一分，而且這條規則在所有會改到線條的路徑上都會執行（`applyLineGeometry`）。往筆畫方向拖曳無法生出空白，Size 欄位在該軸向上不接受數值，會嘗試這麼做的控制點也不會畫出來。這才讓線條用起來像線條，而不是一個中間畫著橫線的矩形。

2. **點資料的生命週期。** `lv_line_set_points` 保存指標而非複製，因此陣列必須比元件活得久。產生的程式碼為每條線在檔案層級輸出一個陣列；WASM 預覽則從池子分配。共用單一陣列 — 也就是預覽過去的作法 — 會讓每條線都畫成最後一條的點座標。

3. **點座標是形狀，外框跟著走。** Direction 與 Length 只是改寫點座標的便利控制項，外框是之後推導出來的。這也是為什麼把線轉成垂直時外框跟著轉向，以及為什麼斜線在兩個軸向上都有尺寸。

4. **外框樣式不屬於線條。** 填色、邊框、圓角、邊框方向與內距在編輯器中隱藏，在程式碼生成時捨棄。LVGL 會很樂意把它們全部畫在筆畫周圍，尤其邊框，那正是線條不該變成的那個矩形。

5. **點擊區是編輯器的輔助。** 2px 的線條就只有 2px 可點，所以畫布在上面疊了一條 10px 的透明筆畫。它不會離開編輯器：元件在專案檔、在預覽、在面板上都仍然是 2px。

6. **折線。** 超過兩個點在資料、畫布、2D 預覽與產生的程式碼中都可用。Direction 與 Length 只描述軸向對齊的線條，其餘情況顯示為 `Custom`，改由點座標清單編輯。

7. **v8/v9 的點座標型別。** v9 使用 `lv_point_precise_t`（可含浮點），v8 使用 `lv_point_t`（整數），程式碼生成會依目標版本選用正確的型別。
