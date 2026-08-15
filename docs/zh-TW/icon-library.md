# Icon 圖庫 —— 現況，以及真正能到達硬體的路

<p align="center">
  <a href="../icon-library.md">English</a> · <strong>繁體中文</strong>
</p>

**Icon** 分頁是一個可瀏覽的 Material Design 圖庫，帶 **Copy SVG** / **Copy
Path** 兩個動作。頁面本身一切正常 —— 瀏覽、分類、搜尋、預覽、複製 ——
但它沒有「插入設計」這一步，而 studio 裡也沒有任何功能吃它複製出來的東西。
對免寫程式碼的作者而言這是條死路，所以這個分頁改為**只在原廠人員研發模式顯示**
（見 [factory-dev-mode.md](factory-dev-mode.md)），直到它接上真正的管線。

本文記錄兩條**今天就能到達硬體**的 icon 路的查證結果，讓日後的重做從事實出發。

## 路一 —— LVGL 內建 symbol（已驗證，建議）

LVGL 把約 60 個 FontAwesome 字圖編進每一個內建 Montserrat 字型
（`LV_SYMBOL_WIFI`、`LV_SYMBOL_OK`⋯）。它們是私用區 U+F000–U+F8FF
的一般字元，label 文字含有它就會渲染 —— 不用寫碼、不用轉檔、不佔額外 flash。

**已端到端驗證**（2026-08）：文字為 `" WiFi "`（WIFI 與 OK 字元夾著單字）的
label 產生

```c
lv_label_set_text(ui_status, " WiFi ");
```

其位元組為 `ef 87 ab … ef 80 8c` —— 與 `LV_SYMBOL_WIFI " WiFi " LV_SYMBOL_OK`
巨集展開的結果完全相同，因為那些巨集**就是**這些 UTF-8 字串。

作者的操作步驟：

1. 放一個 **Label**，把 symbol 字元貼進 Text 欄位。
2. 字型維持內建 **Montserrat**（預設即是）—— 字圖只在它裡面。轉檔字型
   （Noto 等）沒有這些字圖，Fonts 分頁的缺字警告會講。
3. Build 後燒錄。

注意事項：

- 畫布預覽會顯示 □ —— 瀏覽器沒有 FontAwesome —— 但裝置上正確。Property
  editor 的字圖涵蓋警告基於同一理由刻意放行 U+F000–F8FF。
- 沒有選擇器：作者得從文件複製字元。這正是重做後的 Icon 分頁要補的那一步
  （點選即插入）。

常用 symbol，字元可直接複製：

| Symbol | 字元 | 碼位 | | Symbol | 字元 | 碼位 |
| --- | --- | --- | --- | --- | --- | --- |
| WIFI |  | U+F1EB | | HOME |  | U+F015 |
| BATTERY_FULL |  | U+F240 | | SETTINGS |  | U+F013 |
| BLUETOOTH |  | U+F293 | | WARNING |  | U+F071 |
| OK |  | U+F00C | | PLAY |  | U+F04B |
| CLOSE |  | U+F00D | | PAUSE |  | U+F04C |
| LEFT |  | U+F053 | | STOP |  | U+F04D |
| RIGHT |  | U+F054 | | REFRESH |  | U+F021 |
| UP |  | U+F077 | | TRASH |  | U+F2ED |
| DOWN |  | U+F078 | | EDIT |  | U+F304 |

專案設定 `useBuiltinSymbols`（預設開啟）另外讓產生的 `ui.h` 記載這些巨集，
且當專案預設字型是轉檔字型時，`ui.c` 會補掛一個 Montserrat symbol 字型。

## 路二 —— Copy SVG → 存檔 → Image 分頁上傳（已驗證，繞路）

影像轉 C 走的是瀏覽器 canvas 光柵化
（`src/resources/converters/imageConverter.ts` 的
`drawImage` + `getImageData`），而瀏覽器原生支援 SVG。**已驗證**：把 wifi
圖示 Copy SVG 的原文經真正的 `addImage` 上傳，轉出正確的 24×24 ARGB8888
陣列（透明底、黑色字形 —— `fill="currentColor"` 在此情境解析為黑色）。

流程可行：Copy SVG → 貼進檔案存成 `icon.svg` → Image 分頁上傳 → 放 Image
widget。存檔前通常要手動改兩處：

- `width="24" height="24"` → 想要的像素尺寸；光柵化會照它做。
- `fill="currentColor"` → 實際顏色（深色面板上用 `#ffffff`）。

## 這一頁該往哪走

當「點選一個 icon」真的會做事，這一頁才配回到一般模式。已議定的方向（待排程）：
以 LVGL symbol 集重做 —— 點選即插入選取中的 label/button（或建立帶著它的
label），SVG→`lv_image` 管線（匯入時選尺寸與顏色）作為之後服務任意圖形的階段。
