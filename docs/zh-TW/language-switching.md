# 執行期切換語系

<p align="center">
  <a href="../language-switching.md">English</a> · <strong>繁體中文</strong>
</p>

執行中的 UI 上按一個按鈕，如何切換所有已翻譯元件顯示的語系，以及在燒進硬體之前
要怎麼看到它真的有動作。

請與 [text-typography-evaluation.md](./text-typography-evaluation.md) §3 一併
閱讀 —— 翻譯模型本身在那裡說明。

## 1. 前提條件

切換語系是把元件在**文字表的欄位之間**移動。還帶著自己字面文字的元件沒有欄位可
移動，也就不會變。所以順序是：

1. **新增語系。** Texts 面板 → 逐一新增語系，代碼就是執行期送進
   `lv_translation_set_language()` 的字串（`en`、`zh-TW`、`ja`），名稱只在編輯器
   裡顯示。
2. **把元件連上文字資源。** 每個 label、checkbox、dropdown、textarea，用屬性編輯
   器的連結按鈕。元件的字面文字會變成一筆文字資源，元件改為存 id 而不是存字。
3. **填其他欄位。** 在 Texts 面板逐語系填。

有 🌐 連結的元件會跟著切換，仍是字面文字的元件不會。規則就這一條，設計期與執行期
完全一致。

### 1.1 Key，以及它以前設下的陷阱

屬性編輯器裡的 Key 下拉選單就是元件挑選哪一列的方式。請用它，不要靠反覆修改字面
文字直到剛好對上既有的列 —— 後者正是元件綁到一筆長得幾乎一樣的重複資料的過程。

Key 現在是**不分大小寫**唯一的，這正好堵住那個陷阱的具體版本。自動推導的 key 是
小寫的 —— 寫著 "newText" 的 label 推出 `newtext` —— 所以手寫的 `newText` 和推導出
的 `newtext` 會並排出現在表格裡，一筆有翻譯一筆沒有，一眼分不出來。現在兩者算同一
個 key，編輯器會拒絕第二個。

### 1.2 一列可以自己帶 Typography

Texts 分頁有 Typography 欄。有指定的那一列會把它套用到所有綁定該列的元件上，元件
自己的設定則退讓 —— 文字和適合它的字體一起走，這就是 TouchGFX 的
TypedText → Typography 配對。

這也是屬性編輯器不再有字型設定的原因：在單一元件上設定字體與大小，對其他應該一致
的元件是看不見的，而且只有 Typography 能帶各語系字型。設定 Typography，字型自然
跟上。

## 2. 設計期：畫布預覽

畫布右下角有一個 🌐 選單，專案語系超過一個時才會出現。它決定**畫布要渲染文字表的
哪一欄** —— 文字、placeholder、下拉選項，以及每個 Typography 為該語系指定的字型。

這是檢查翻譯有沒有填完最快的方法，但它是設計者的控制項，不是被設計的那個 UI 上的
按鈕。在畫布上按按鈕不會執行事件處理常式；畫布是設計介面。

## 3. 執行期：Switch Language 動作

Event 面板 → 新增事件 → **Built-in Action** → **Switch Language**：

| 選擇 | 產生的程式碼 |
| --- | --- |
| 指定語系 | `lv_translation_set_language("zh-TW");` |
| Next language (cycle) | `ui_events_next_language();` |

循環用的輔助函式在 `ui_events.c` 只會產生一份，依專案順序帶著語系代碼，走到最後
會繞回第一個。單一按鈕的語系切換要的就是這個形狀；一個語系一個按鈕的設定畫面，則
要的是明確指定語系。

除此之外不會產生任何東西，也不需要：

- **Label 會自己重讀文字。** `lv_label.c` 內部就處理
  `LV_EVENT_TRANSLATION_LANGUAGE_CHANGED`，而 `ui.c` 已用
  `lv_label_set_translation_tag()` 給每個已翻譯的 label 掛上 tag。
- **Checkbox、textarea、dropdown** 各自產生一支 callback，因為整個 LVGL 裡只有
  `lv_label` 自己處理這個事件。
- **各語系字型也會跟著換。** 有語系覆寫的 Typography，由註冊在第一個畫面上的
  `ui_typography_language_cb` 換掉 style 的字型 ——
  `lv_translation_set_language()` 會走遍每個 display 的每個畫面，所以沒有載入的
  畫面同樣會被更新。

有兩種情況會刻意不產生程式碼，而不是產生一個半殘的東西：專案已經沒有的語系代碼
（事件綁定之後才被刪掉），以及只有一個語系時的循環切換。

## 4. 怎麼測

### 4.1 在瀏覽器裡 —— 🔨 Build & Run

**🔨 Build & Run** 分頁會把產生的 C 對真正的 LVGL 編譯成 WASM 執行，滑鼠與鍵盤都
會轉送進去。在那裡按下按鈕跑的就是真正的 `ui_events.c` 處理常式，所以語系切換是
完整被執行的 —— 包含字型抽換，缺字的問題會在這一關現形。

這需要編譯伺服器：`vite-plugin-compile.ts` 的 `/api/compile` 端點會呼叫 `emcc`，
並以 `wasm/lv_conf.h`（`LV_USE_TRANSLATION 1`）從原始碼建 LVGL。該檔開頭的工具鏈
路徑是寫死的絕對路徑，指向一個 Linux 工作區；開發伺服器所在的機器有那套工具鏈時
這條路徑才會通，沒有時會回報編譯錯誤。

### 4.2 在硬體上 —— Deploy 面板

三塊板子的韌體範本都帶 `LV_USE_TRANSLATION 1`
（`firmware/*/include/lv_conf.h`），所以燒進去的版本會真的切換語系。這也是唯一能
涵蓋真正要緊的那件事的測試：字型裡到底有沒有切過去那個語系的字。參見
[charset-trimming-design.md](./charset-trimming-design.md) —— 字元集是從每個語系
的欄位收集的，所以字型轉檔之後才補的翻譯，需要重新轉一次字型。

### 4.3 每一層測不到什麼

編輯器還有第四層是這張表沒有列的：**LVGL Preview**。沒列是因為它根本試不了語言切換
——切換是一個事件動作，而 `editorStateToJson.ts` 沒有把事件帶過去。完整的階梯以及
四層之間的差別，見 [preview-ladder.md](./preview-ladder.md) §1。

| | 畫布 🌐 | Build & Run | 硬體 |
| --- | --- | --- | --- |
| 翻譯有沒有填完 | ✅ | ✅ | ✅ |
| 事件有沒有真的接到按鈕 | ❌ | ✅ | ✅ |
| 產生的 C 能不能編譯 | ❌ | ✅ | ✅ |
| 字型裡有沒有那些字 | ❌ | ✅ | ✅ |
| 字型佔多少 flash 與 RAM | ❌ | ❌ | ✅ |
| 該尺寸中文在面板上讀不讀得清楚 | ❌ | ❌ | ✅ |

## 5. 手動做法

這個動作只產生一行呼叫，所以自訂 C 程式碼也能到同一個地方：

```c
lv_translation_set_language("zh-TW");
```

當切換必須由編輯器沒有建模的東西驅動時值得知道 —— 例如某個 Modbus 暫存器，或開機
時從 flash 讀出的偏好設定 —— 那些情況內建動作沒有可掛的觸發來源。
