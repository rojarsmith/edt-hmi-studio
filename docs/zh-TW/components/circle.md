# Circle (circle) — 圓形元件設計文件

<p align="center">
  <a href="../../components/circle.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Circle 是 **Shapes（圖形）** 分類裡的圓形成員，與 [Rectangle](rectangle.md)、[Line](line.md) 並列。它可以畫出**圓盤**、**圓環**、**扇形**（派形切片）與**環狀扇形** — 狀態指示點、儀表底盤、刻度盤的一段。

**它叫 Circle 而不是 Ellipse，因為 LVGL 畫得出來的就只有正圓。** 軟體渲染器沒有橢圓圖元：圓角矩形的圓角半徑會被夾在較短邊的一半（`lv_draw_sw_fill.c`），所以一個較寬的框搭配圓形半徑畫出來是膠囊而不是橢圓；而 `lv_draw_arc_dsc_t` 只有單一個 `radius`，因此每一段弧都是正圓弧。真正的橢圓 — 連帶橢圓扇形 — 需要向量繪圖管線（`LV_USE_VECTOR_GRAPHIC`），而它需要 ThorVG 或向量 GPU；三片板子都沒有。這個名字說的是元件現在做得到的事，而不是它將來也許能做的事；§12.1 記錄了通往橢圓的幾條路，供值得走的時候參考。

外框維持**正方形**也是同一個理由：畫布不會顯示面板畫不出來的形狀。

Circle 不是容器（`isContainer = false`）。

## 2. 元件類型識別碼

```
type: 'circle'
```

元件面板顯示為 **Circle**，實例命名為 `Circle_1`、`Circle_2`……，與所有元件相同的慣例；屬性面板的 **Type** 顯示為 `Shape`，也就是 Rectangle 與 Line 所屬的同一個家族，由定義中選填的 `typeName` 指定。

## 3. 所屬分類

| 欄位 | 值 |
|---|---|
| 分類 ID | `shape` |
| 分類名稱 | Shapes（圖形） |
| 分類圖示 | 🔷 |
| 元件圖示 | 🔵 |
| 家族名稱（`typeName`） | Shape |
| 順序 | 第三個，排在 Rectangle 與 Line 之後 |

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 100 |

正方形，而且會一直維持正方形：調整大小的拖曳在 `resizeGeometry.ts` 裡就把外框變成正方形（那裡知道拖的是哪個控制點 — 邊控制點以自身軸向為準，角落取較大的那個），而 `circleGeometry.ts` 的 `squareBox` 為其他途徑進來的編輯維持同一條規則。拖曳角落時取兩邊較大的那個，下限是 8px。

> 兩者必須對「由哪一邊主導」有共識。若改成問「哪一邊變了？」，在剛把外框變成正方形的下一幀就會給出不同答案，元件會在兩個尺寸之間來回跳動，整個拖曳過程一直閃爍。因此由控制點決定，而已經是正方形的外框就原封不動。

## 5. 是否為容器

```
isContainer: false
```

## 6. 父子關係規則

### 可作為以下元件的子元件

- **Screen（頁面根節點）**、**Button（btn）**、**Container（obj）**、**Tab View**、**Tile View**、**Window** — 與其他圖形相同

### 可包含的子元件

無。

## 7. 屬性設計（props）

| 屬性名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `shape` | `'circle' \| 'sector'` | `'circle'` | 由哪一種實作繪製 — 見 §10.4 |
| `startAngle` | `number` | `0` | 僅扇形使用。0° 為 3 點鐘方向，順時針增加 — LVGL 的慣例 |
| `endAngle` | `number` | `270` | 僅扇形使用。掃過一整圈即為完整圓環 |
| `thickness` | `number` | `0` | 僅扇形使用。`0` 代表填滿到圓心；小於半徑則留下圓環 |

```typescript
interface CircleProps {
  shape: 'circle' | 'sector';
  startAngle?: number;
  endAngle?: number;
  thickness?: number;
}
```

四種形狀由兩個屬性組合而成：

| 想要的形狀 | `shape` | 角度 | `thickness` |
|---|---|---|---|
| 圓盤 | `circle` | — | — |
| 圓環 | `sector` | 0–360 | 環的寬度 |
| 扇形（派形切片） | `sector` | 例如 0–270 | `0` |
| 環狀扇形 | `sector` | 例如 0–270 | 環的寬度 |
| **有外框的圓環** | `circle` | — | —（不填色，邊框寬度＝環的寬度） |

**圓盤**是一個帶圓形半徑的一般物件，因此同時保有填色**與**邊框。**扇形**是一段弧，兩者都沒有 — 只有顏色、角度與寬度 — 所以形狀一改變，屬性面板就會把邊框那幾列收起來，並說明它們去哪了（§8）。

## 8. 樣式設計（styles）

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | 預設／正常狀態 |
| `pressed` | `LV_STATE_PRESSED` | 按下 |
| `focused` | `LV_STATE_FOCUSED` | 取得焦點 |
| `disabled` | `LV_STATE_DISABLED` | 停用 |

### default 狀態的預設樣式

| 樣式屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `bgColor` | `string` | `'#E0E0E0'` | 填色。扇形時成為弧的顏色 |
| `borderColor` | `string` | `'#212121'` | 邊框顏色 — 僅圓盤 |
| `borderWidth` | `number` | `1` | 邊框寬度 — 僅圓盤 |
| `borderRadius` | `number` | `0` | 不使用：形狀本身就是半徑 |
| `textColor` | `string` | `'#212121'` | 圖形本身不使用 |
| `opacity` | `number` | `1` | 整個元件的不透明度 |
| `padding` | `number` | `0` | 無內距 |

色盤沿用 Rectangle，讓三個圖形看起來像同一組。

### Style 區塊會顯示哪幾列

| 列 | 圓盤 | 扇形 |
|---|---|---|
| Background Color | ✅（填色） | ✅（弧的顏色） |
| Border Color／Width | ✅ | ❌ — 弧沒有邊框 |
| Corner Radius | ❌ — 形狀就是半徑 | ❌ |
| Border Sides | ❌ | ❌ |
| Opacity | ✅ | ✅ |
| Text Color、Padding | ❌ | ❌ |

Shadow、Transform、Gradient、Outline 與 Blend Mode 沿用與其他圖形相同的可見性表。

### 邊框，以及扇形

圓盤的邊框就是 LVGL 自己的：在一個圓形半徑的物件上設 `border_width` 與 `border_color`，銳利，而且可以在執行期改。

弧完全沒有外框，因此扇形給不出邊框。屬性面板會在那幾列原本的位置說明這件事，並指向能滿足大部分「有邊框的圓環」需求的做法：**圓環就是一個不填色、邊框很粗的圓盤**，原生、銳利，根本不需要用到扇形。只有部分楔形那兩條筆直的半徑邊超出能力範圍 — 要描它們得靠向量渲染器。

## 9. 支援的事件

| 事件 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊 |
| `LV_EVENT_PRESSED` | 按下 |
| `LV_EVENT_RELEASED` | 放開 |
| `LV_EVENT_LONG_PRESSED` | 長按 |
| `LV_EVENT_FOCUSED` | 取得焦點 |
| `LV_EVENT_DEFOCUSED` | 失去焦點 |

兩種實作都可點擊，因此圓盤是可用的觸控目標 — 一個屬於裝飾而非 Button 的圓形按鈕面。可觸控範圍是元件的正方形外框，不是裡面那個圓。`LV_EVENT_VALUE_CHANGED` 沒有意義：圖形不持有數值，而且扇形所使用的弧已經拿掉了讓它成為控制項的那些部件（§10.4）。

## 10. UI 層設計

### 10.1 幾何（utils/circleGeometry.ts）

規則集中在一個模組，其他各層都從它取用：

- `normalizeSweep(start, end)` — 以 LVGL 的方式表示起點與掃過角度，整圈仍然是整圈而不會塌成 0
- `innerRadius(size, thickness)` — 填滿到圓心時為 `0`，否則是圓環的內緣
- `sectorPath(size, thickness, start, end)` — 畫布與 2D 預覽共用的 SVG 路徑
- `squareBox(before, after)` — §4 的外框規則

### 10.2 編輯器畫布（CanvasComponent.tsx）

**圓盤**就是外層本身：元件的外框加上 `border-radius: 50%`，因此填色、邊框、漸層與陰影都走共用的樣式程式碼，與 Rectangle 完全相同。

**扇形**則是那條路徑，而外層不在它後面畫任何框：

```tsx
<svg viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none">
  <path d={sectorPath(size, thickness, startAngle, endAngle)} fill={fill} fillRule="evenodd" />
</svg>
```

`evenodd` 正是讓圓環成為圓環的關鍵：內圈以相反方向繞行，填色因而留下中間的洞。

### 10.3 Prototype（PreviewPanel.tsx）

`drawCircle` 畫的是同樣的兩種情況：圓盤用 `ctx.arc`（有邊框時一併描邊），扇形用 `ctx.fill(new Path2D(sectorPath(...)), 'evenodd')` — 就是畫布所畫的那條路徑，兩者不可能不一致。

### 10.4 Simulator 與程式碼生成

兩者都依 `props.shape` 選擇實作：

**圓盤** — `lv_obj_create` 加上 `lv_obj_set_style_radius(obj, LV_RADIUS_CIRCLE, 0)`。半徑會被夾在較短邊的一半，在正方形框中恰好就是一個圓。存下來的 `borderRadius` 在生成時被捨棄，因為半徑由形狀決定。

```c
ui_dot = lv_obj_create(ui_screen_main);
lv_obj_set_size(ui_dot, 60, 60);
lv_obj_set_style_bg_color(ui_dot, lv_color_hex(0xE0E0E0), 0);
lv_obj_set_style_border_width(ui_dot, 1, 0);
lv_obj_set_style_radius(ui_dot, LV_RADIUS_CIRCLE, 0);
```

**扇形** — `lv_arc_create`，以弧的**背景**部件繪製，寬度大到足以把楔形補到圓心：

```c
ui_gauge = lv_arc_create(ui_screen_main);
lv_obj_set_size(ui_gauge, 80, 80);
lv_obj_set_style_bg_opa(ui_gauge, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_width(ui_gauge, 0, 0);
lv_obj_remove_style(ui_gauge, NULL, LV_PART_KNOB);
lv_obj_set_style_arc_opa(ui_gauge, LV_OPA_TRANSP, LV_PART_INDICATOR);
lv_arc_set_bg_angles(ui_gauge, 135, 45);
lv_obj_set_style_arc_width(ui_gauge, 12, LV_PART_MAIN);
lv_obj_set_style_arc_rounded(ui_gauge, false, LV_PART_MAIN);
lv_obj_set_style_arc_color(ui_gauge, lv_color_hex(0x2196F3), LV_PART_MAIN);
```

重點行為：
- **thickness 為 0、或不小於半徑時，一律取半徑**，把圓環補成實心楔形
- **knob 與 indicator 會被移除**，因為弧本來是控制項，而這裡它是裝飾。少了這一步，拖曳會讓一個 knob 在圖形上移動
- **結束角度在輸出前先做環繞。** LVGL 對超過 360 的角度只減一圈（`lv_arc_set_bg_start_angle`），所以起點較大時 `start + sweep` 會出錯；整圈則輸出成 `0, 360`，那是弧用來表示「繞滿一圈」的寫法
- 扇形的外框樣式會被捨棄：弧不畫填色也不畫邊框，顏色是透過 `arc_color` 傳進去的

> WASM 預覽的 `create_circle` 做同樣的事，會在下一次執行 `wasm/build.sh` 時進入預覽；目前 `public/wasm` 的二進位檔早於它。

## 11. LVGL API 對應

| API | 用途 |
|---|---|
| `lv_obj_create(parent)` | 圓盤 |
| `lv_obj_set_style_radius(obj, LV_RADIUS_CIRCLE, sel)` | 讓它變圓 |
| `lv_arc_create(parent)` | 扇形 |
| `lv_arc_set_bg_angles(arc, start, end)` | 楔形範圍 |
| `lv_obj_set_style_arc_width(arc, w, LV_PART_MAIN)` | 環寬，實心楔形時為半徑 |
| `lv_obj_set_style_arc_color(arc, color, LV_PART_MAIN)` | 顏色 |
| `lv_obj_set_style_arc_rounded(arc, en, LV_PART_MAIN)` | 楔形端點是否收圓 |
| `lv_obj_remove_style(arc, NULL, LV_PART_KNOB)` | 移除控制項部件 |

## 12. 設計要點

### 12.1 為什麼它不叫 Ellipse

通往真正橢圓的路有四條，沒有一條是免費的：

| 做法 | 品質 | Flash | Heap | 代價 |
|---|---|---|---|---|
| **A8 遮罩** | 完美、有抗鋸齒 | 每個橢圓 w × h bytes（200×100 = 20 KB） | 只有 8 KB 橫條 — `bitmap_mask_src` 產生的是 **simple** layer（`lv_obj_style.c`），會被 `lv_refr.c` 切段 | 尺寸在編譯期就固定，而且邊框無法跟著橢圓走 |
| **事先畫好的圖片** | 完美 | ARGB8888，200×100 = 80 KB | 無 | 顏色也固定。今天就能用 Image 元件做到 |
| **變形縮放** | 邊緣偏軟、邊框粗細不對稱 | 無 | 每次重繪一整塊 transform layer（200×100 要 160 KB） | 就是曾經讓面板凍住的那個機制；畫出來的形狀也不再與元件外框吻合 |
| **ThorVG 向量** | 完美、可縮放 | ~200 KB 起 | 中等 | 每片板子的建置都要加上 C++ 工具鏈與函式庫 |

若這個元件將來要長出橢圓模式，**A8 遮罩**是值得走的那條：填色仍然是一般樣式，顏色在執行期照樣可改，而它造成的 layer 是便宜的那一種。

在那之前，這個元件維持正圓、外框維持正方形，這是誠實的版本 — 名字也就這樣取。

### 12.2 其餘

1. **一個元件，兩種實作。** `shape` 在物件與弧之間選擇。把它們收在同一個元件面板項目底下，代表圓盤與扇形共用一個身分、一個屬性面板與一個名稱；將來的橢圓模式會是同一個屬性的另一個值，而不是一個新元件加上一次專案搬移。

2. **扇形是裝飾，不是控制項。** 弧的 knob 與 indicator 在建立時就移除，圖形畫出來的一切都住在 `LV_PART_MAIN`。

3. **角度用的是 LVGL 的，不是畫布的。** 0° 為 3 點鐘方向、順時針增加，而 SVG 與 Canvas 2D 在 y 軸向下時也是如此，因此沒有任何一層需要換算。

4. **外框就是觸控範圍。** 圓盤的正方形外框代表圓形之外的四個角落仍然可點。LVGL 也是這樣 — 物件的區域就是觸控區域，不論半徑畫出什麼形狀。
