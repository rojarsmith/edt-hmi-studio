# QrCode (qrcode) — QR 碼元件設計文件

<p align="center">
  <a href="../../components/qrcode.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

QrCode 顯示一個由內容計算出來的 QR 碼。內容在設計期有兩個來源——**Texts 素材庫的
資源**（不管面板顯示哪種語言，一律讀英語欄位），或直接打在元件裡的**字串**——執行期
再疊一個：**由通訊傳入的字串**會在面板運轉時取代內容，所以伺服器可以讓這個碼指向
工單、會話網址或任何別的東西。

元件用 QR 標準自己的名字暴露標準自己的旋鈕：**version**（1–40，或 Auto——裝得下的
最小版本）、**scale**（每模組像素數）與**錯誤更正等級**（L / M / Q / H）。每一層都用
同一套規則編碼：設計畫布、Prototype、Simulator 與面板畫出來的是同一個碼，設計者
看到的就是掃描器拿到的。

純軟體，所以和 Video 不同——**每塊板子都能用**。

QrCode 不是容器元件（`isContainer = false`）。

## 2. 類型識別碼

```
type: 'qrcode'
```

## 3. 所屬類別

| 欄位 | 值 |
|---|---|
| 類別 id | `image` |
| 類別名稱 | Image（圖像） |
| 類別圖示 | 🧿 |
| 元件圖示 | 🔳 |

Image 位在 Display 與 Miscellaneous 之間：收的是「本身就是一張圖」的元件，相對於
Basic 那個顯示專案匯入圖片的 Image。QR 碼是一張由內容計算出來的圖。

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 120 |
| defaultHeight | 120 |

> 碼以真實像素大小繪製——`(模組數 + 8) × scale`，含安靜區——在元件裡置中，絕不
> 拉伸。屬性面板會替你算，碼比框大時會警告。

## 5. 屬性 (props)

| 名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `source` | `'literal' \| 'text'` | `'literal'` | 內容從哪裡來。 |
| `literal` | `string` | `''` | `source` 是 `literal` 時編碼的字串。預設為空——見下文。 |
| `textId` | `string` | `''` | `source` 是 `text` 時編碼的 Texts 素材庫資源。 |
| `version` | `number` | `0` | 0 = 裝得下的最小版本；1–40 釘死版本。 |
| `scale` | `number` | `2` | 每模組像素數，1–8。 |
| `ecc` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` | 錯誤更正等級。 |
| `quietZone` | `boolean` | `true` | 標準規定的 4 模組淨空，以淺色繪製。 |
| `sampleText` | `string` | `''` | 用來規劃元件尺寸的字串。絕不編碼、絕不產生程式碼——見「用一個字串來規劃」。 |

### 關於這些屬性

- **新元件是空白的，而空白就是空白。** 沒有要先清掉的範例網址：字串預設為空，沒有
  內容可編碼的元件**只畫自己的背景色**——一個素色方塊——設計畫布、Prototype、
  Simulator 與面板一律如此。編碼器本來可以把空字串編成一個碼，第一版韌體也真的這麼
  做了：一個合法但無意義的 version 1 碼，手機掃了什麼也做不了。現在面板就顯示方塊、
  等著。這正是由通訊傳入內容的碼該有的起始狀態：開機空白，伺服器送來第一個字串才
  填上。屬性面板的「Nothing to encode yet」是提示，不是警告。
- **Unicode 以 UTF-8 編進 byte mode**——每支手機掃描器都用這個慣例解碼。日文、
  中文或其他任何文字，在字串、文字資源與通訊傳入三種來源都可用；容量以 UTF-8
  位元組計——一個漢字佔三個位元組、一個字母佔一個——編輯器算版本用的位元組和
  面板編碼的位元組是同一套。
- **文字資源一律讀英語**，不管面板講哪種語言：QR 碼是給對著它的手機看的，不是給
  操作員讀的，碼背後的網址不會因語言而不同。解析方式和每個文字讀取器一樣——先
  `en`，再退到第一個有值的語言。
- **釘死的版本裝不下內容是錯誤，不是猜測**：編輯器會說「version N 在等級 X 下裝
  不下——調高版本、調低更正等級，或把版本設回 Auto」，面板則保留上一張圖，而不是
  畫半個碼。
- 元件的 **Text Color 是深色模組**、**Background Color 是淺色模組**——就是每個元件
  Style 區塊都有的那兩列。對比要夠，掃描器需要它。

### 碼四周的白色

兩個東西，看起來像一個。**Quiet zone（安靜區）**是標準規定的 4 模組淨空，用淺色畫在
四邊——掃描器依賴它，預設開啟。超出安靜區的部分則是**元件自己的背景**在填滿剩下
的框。

要縮小白色：屬性面板的 *Shrink the widget to the code* 按鈕會把框縮到碼的精確像素，
只剩安靜區。連安靜區都不要的話，把 **Quiet zone** 關掉——但只有在元件本來就放在
素色、淺色背景上（由背景提供淨空）時才是對的做法；放在深色或花的背景上，碼可能就
掃不到了，開關關掉時編輯器會這樣提醒。

### 用一個字串來規劃

由通訊餵內容的碼在設計期有個難題：元件沒有內容，所以沒有東西告訴設計者最長的工單
網址需要哪個版本、在這個 scale 下裝不裝得進框、綁定要讀幾個 register。**Plan for a
string** 就是為此而設的欄位——打進伺服器將來會送的最長字串（Unicode 歡迎：以 UTF-8
位元組計算，和碼與 register 的算法一致），編輯器就回答：

- **字元數與位元組數**，分開算，兩者不同時會提醒——一個漢字佔三個位元組、一個字母
  佔一個；
- **在元件目前等級下的最小版本**、模組數，以及在元件的 scale 與安靜區設定下的像素
  邊長；
- **四個等級各自的最小版本**，L 到 H，多一級錯誤更正要付多少代價一眼就看到，不用
  試四次；
- 字串綁定需要的 **register 數**（每個兩個位元組）；
- 以及，只在有問題時，**該改什麼、改成多少**：「Version is pinned to 2, which
  cannot hold this: set it to 3 or higher, or to Auto」、「lower the scale to 3, or
  enlarge the widget to 259×259」、「the binding's Length is 8 registers (16 bytes);
  this string needs 16」、「longer than communication can carry: 140 bytes, and a
  string binding reads at most 128」。

這個欄位**只用於規劃**。它絕不會被編碼——打字時畫布保持空白——也絕不會進到產生的
程式碼或 Simulator，各有一個測試把門守住。但它**會**隨專案儲存，放在元件的
`sampleText` 屬性裡，下一個打開設計的人就看得到這個碼是按什麼尺寸規劃的。

## 6. 通訊

在元件自己的 Communication 區塊綁定：從連續的 holding／input registers 讀出的
**字串**——每個 register 兩個 UTF-8 **位元組**、高位元組在前、以零結尾——長度可設
1–64 個 registers（2–128 位元組；一個漢字佔三個、可以跨 register 邊界，沒有問題）。
唯讀：面板上沒有任何東西會編輯 QR 碼。

面板輪詢那塊 registers，**只在字串真的變了才重新編碼**——輪詢會重複，圖不該跟著
重畫。讀到空字串時保留目前的碼。

## 7. UI 繪製層

| 層 | 做什麼 |
|---|---|
| 設計畫布 | 把真實內容編碼後畫成 SVG——和面板同樣的模組、版本、安靜區。 |
| Prototype | 同一套編碼，用 Canvas 2D 矩形畫。 |
| Simulator | `ui_from_json.c` 的 `create_qrcode`，跑的是 LVGL 內附的同一個 `qrcodegen` 編碼器；序列化器先把內容解析好，C 那側只編一個純字串。 |
| 產生的程式碼 | `lv_canvas_create` 加上一段產生出來的繪製器（`ui_qrcode_apply`），直接以元件的 version／ECC／scale 呼叫 `qrcodegen`、畫進 I1 canvas 緩衝區，並輸出 `<名稱>_qr_set_text` 給通訊呼叫。 |

產生的程式碼刻意繞過 LVGL 自己的 `lv_qrcode` 包裝：那個包裝把錯誤更正等級釘死在
MEDIUM、版本也自己挑，而這兩者正是這個元件交給使用者的設定。

## 8. 程式在哪裡

| 部分 | 檔案 |
|---|---|
| 設定模型、編碼、英語解析 | [`src/utils/qrcodeModel.ts`](../../../src/utils/qrcodeModel.ts) |
| 元件定義、Image 類別 | [`src/utils/componentDefinitions.ts`](../../../src/utils/componentDefinitions.ts) |
| 設計畫布 | [`CanvasQrcode.tsx`](../../../src/components/Canvas/CanvasQrcode.tsx) |
| Prototype | [`PreviewPanel.tsx`](../../../src/components/Preview/PreviewPanel.tsx) 的 `drawQrcode` |
| 屬性面板 | [`PropertyEditor.tsx`](../../../src/components/PropertyEditor/PropertyEditor.tsx) 的 `QrcodeEditor` |
| 字串綁定 | [`ModbusBindingEditor.tsx`](../../../src/components/PropertyEditor/ModbusBindingEditor.tsx)、[`hmiBindingGenerator.ts`](../../../src/codegen/hmiBindingGenerator.ts) |
| 產生的繪製器 | [`ui.c.ts`](../../../src/codegen/templates/ui.c.ts) 的 `QRCODE_SUPPORT_SOURCE` |
| Simulator | [`ui_from_json.c`](../../../wasm/src/ui_from_json.c) 的 `create_qrcode` |
| 執行期字串讀取 | 各板 `hmi_runtime.c` 的 `HMI_DATA_STRING` |

`LV_USE_QRCODE` 在每塊板子的 `lv_conf.h` 與 `wasm/lv_conf.h` 都已開啟；它把繪製器
呼叫的內附 QR-Code-generator 函式庫編進來。
