# 元件部位——替 LVGL 真正畫出來的每一塊上色

<p align="center">
  <a href="../widget-parts.md">English</a> · <strong>繁體中文</strong>
</p>

滑桿不是一塊東西。LVGL 把它畫成三塊：軌道、已經走過的長度，以及被拖動的把手。
每一塊都是一個**部位（part）**，而一份樣式透過部位選擇器精準落在其中一塊上。

編輯器過去把所有樣式都寫到 `LV_PART_MAIN`。專案能塗軌道，卻永遠塗不到填色，所以
不管畫面其他地方多暖，每一個滑桿、開關、進度條與轉圈圈都固執地留著佈景主題的
藍色——除了手動改產生出來的 C 之外別無他法。

Style 區塊現在在狀態切換列之上多了一排**部位切換列**，只列出該元件真的有的部位。

## 1. 哪些元件有部位

| 元件 | 切換列上的名稱 |
| --- | --- |
| Slider | 軌道 Track · 填色 Fill · 把手 Knob |
| Progress Bar | 軌道 Track · 填色 Fill |
| Switch | 關 Off · **開 On** · 把手 Knob |
| Checkbox | 標籤 Label · **方框 Box** |
| Dropdown | 外框 Box · 箭頭 Arrow |
| Arc | 軌道 Track · 數值 Value · 把手 Knob |
| Spinner | 軌道 Track · 弧 Arc |

其餘元件只有單一部位，不會顯示切換列——Style 區塊維持原樣。

這些名字是元件自己的說法，不是 LVGL 的。`LV_PART_INDICATOR` 在滑桿是填色、在開關
是「開」的顏色、在核取方塊是打勾的方框；沒有人該為了改一個顏色而先把這張對照表
背起來。目錄放在 [src/utils/widgetParts.ts](../../src/utils/widgetParts.ts) 的
`widgetParts()`，而且只有那一份——屬性面板、兩個繪製層與程式碼產生器都讀它。

## 2. Checked 狀態

`LV_STATE_CHECKED` 現在和 Pressed、Focused、Disabled 並列為樣式狀態之一。這不是
錦上添花：

> 開關「開」的顏色，以及核取方塊打勾後的方框，**只能**在 Checked 狀態設定。

LVGL 預設佈景主題把主色設在 `LV_PART_INDICATOR | LV_STATE_CHECKED` 上，而帶狀態
選擇器的樣式一定贏過不帶的，跟兩者誰先加入無關。所以只在靜止狀態設過色的開關，
看起來一切正常，直到被打開的那一刻變成藍色。

選擇 **On** 部位時，狀態切換列會自動跳到 Checked，正是為了這個原因——否則那個
親切的名稱等於在騙人，顏色根本沒落在該落的地方。

## 3. 一個部位的樣式能說些什麼

多數部位以「盒子」的方式繪製，也就接受盒子該有的屬性：填色、漸層、邊框、圓角、
內距、陰影、透明度。它們和主要部位走同一個 `generateStyleCode`，只是換了選擇器：

```c
lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0xF0A94C), LV_PART_INDICATOR);
lv_obj_set_style_bg_color(ui_strength, lv_color_hex(0xF7F2ED), LV_PART_KNOB);
lv_obj_set_style_bg_color(ui_eco, lv_color_hex(0x4FD1A5), LV_PART_INDICATOR | LV_STATE_CHECKED);
```

### 弧形是例外

**Arc** 與 **Spinner** 的軌道與數值都是弧，而弧沒有填色、沒有邊框、也沒有圓角
——它只有顏色與粗細。那兩列因此照這個形狀真正擁有的東西來讀：

| 樣式列 | 在弧形部位上的意義 |
| --- | --- |
| Background Color | `arc_color` |
| Border Width | `arc_width` |
| Opacity | `arc_opa` |

屬性面板會把不起作用的列直接藏起來，就像它對 Line 與 Circle 扇形所做的一樣。
Knob 是真正的盒子，不在此列。

這不是新約定。`componentDefinitions.ts` 一直以來就把 Arc 與 Spinner 的
`borderColor` 當成「弧的顏色」，編輯器畫布也一直是這樣畫的。新的是**韌體終於同意
了**：在此之前那幾列被照字面採用，於是替轉圈圈指定一個重點色，換來的是環外面
一個方框。

同樣的理由，弧形元件本身的 Border Color 在沒有設定 Value 部位時，仍然代表數值弧
的顏色——既有專案就是這個意思。設了 Value 部位就以它為準，因為部位是最後寫出去的。

## 4. 哪些地方會遵守

三個繪製層都透過同一組輔助函式讀同一份部位樣式，因此不可能各說各話：

| 層 | 讀取方式 |
| --- | --- |
| 編輯器畫布 | `CanvasComponent.tsx` 裡的 `partColor` / `partStyle` |
| 原型（2D） | `PreviewPanel.tsx` 裡的 `partColor` / `partStyle` |
| 模擬器與韌體 | `ui.c.ts` 裡的 `generatePartStyleCode` |

專案沒有交代的部位不會產生任何一行，維持佈景主題原本的樣子——那正是所有在部位
出現之前寫好的專案的行為，也是它們該繼續維持的樣子。

## 5. 存檔時的形狀

```jsonc
"styles": {
  "default":  { "bgColor": "#3A2E25" },     // LV_PART_MAIN，靜止
  "pressed":  { "bgColor": "#2E2620" },     // LV_STATE_PRESSED
  "parts": {
    "indicator": { "checked": { "bgColor": "#4FD1A5" } },
    "knob":      { "default": { "bgColor": "#F7F2ED" } }
  }
}
```

在這個機制出現之前寫下的專案都沒有 `parts`，而沒有就代表「交給佈景主題」。磁碟上
不需要改寫任何東西。

## 6. 還沒有的東西

- **這三個以外的部位。** LVGL 另外還有文字框的游標、表格與圖表的項目、滾輪的選中
  列，以及每個元件的捲軸。要加一個，就是在 `PARTS_BY_TYPE` 補一列，再讓繪製層
  知道怎麼畫它。
- **弧的端點。** `arc_rounded` 沒有對應的列，所以弧的兩端永遠是平的。
- **滑桿把手的大小。** 在 LVGL 那是 `LV_PART_KNOB` 的內距；編輯器畫布不管內距寫
  什麼，一律畫成 16px。
