# 文字與字體排印

<p align="center">
  <a href="../text-typography-evaluation.md">English</a> · <strong>繁體中文</strong>
</p>

> **狀態。** 僅為評估，尚未實作任何項目 —— 編輯器目前仍然是把字面字串直接寫進
> `lv_label_set_text()`。以下每一項 LVGL 的說法都是對照 vendored 的 LVGL 9.5.0
> 原始碼（`firmware/vendor/lvgl-9.5.0.zip`）查證的，而不是查線上文件；因為其中兩項
> 最關鍵的發現（§3 與 §7）正好是文件沒有講清楚的部分。

TouchGFX Designer 把文字編輯拆成兩個分頁 —— **Texts**（翻譯矩陣）與
**Typographies**（具名文字樣式，可按語系覆寫字型）。本文記錄這套設計有多少能由
LVGL 9 原生承接、有多少必須在編輯器端自建，以及哪兩項不修改 LVGL 就根本做不到。

結論先講：**約有 70% 可以原生對應到 LVGL 9.5，而且最關鍵的那一塊 —— text id
間接層加執行期語言切換 —— LVGL 本身就有，叫做 `lv_translation`，只是本專案目前
沒有把它編進去。**

## 1. TouchGFX 這套設計的本質

那兩個分頁只是表面。底下其實是四個獨立的機制，值得拆開來看，因為它們落到 LVGL
上的成本差異極大：

| # | 機制 | 在 Designer 中的對應 |
| --- | --- | --- |
| 1 | **Text id 間接層** —— 元件存的是 id，不是字面字串 | `Id` 欄（`boxEnglish`、`Auto-generated`） |
| 2 | **翻譯矩陣** —— 一列一個 id，一欄一個語系 | `GB` / `CN` / `JP` / `AR` 各欄與 `＋` 按鈕 |
| 3 | **Typography** —— 具名文字樣式，可被多個 text 共用，且**可按語系覆寫字型** | `Typography` 欄；`Language Settings: Default ＋` |
| 4 | **字元集裁剪** —— 只產出真正用到的 glyph | Wildcard Characters / Ranges，用來補使用分析看不到的字元 |

第 4 項值得講精確一點，因為很容易誤讀。它**不是** TouchGFX 的執行期功能，而是
產生器的功能：工具取所有語系所有字串的字元聯集，只為這個集合產出 glyph 表。
Wildcard 那幾格之所以存在，是因為像 `"<value> KB"` 這樣的字串無法讓產生器知道
執行期會出現哪些數字，所以由作者手動宣告。

這個區別在這裡很重要：第 4 項完全不依賴 LVGL。

## 2. 對應到 LVGL 9.5

| TouchGFX 功能 | LVGL 9.5 對應 | 適配 |
| --- | --- | --- |
| Text id + 執行期切換語言 | `lv_translation_add_static()` / `lv_translation_set_language()` / `lv_tr()` | 原生 |
| 語言變更後文字自動刷新 | `lv_label_set_translation_tag()`；label 自己處理 `LV_EVENT_TRANSLATION_LANGUAGE_CHANGED` | 原生 |
| 翻譯矩陣的資料結構 | `lv_translation_add_static()` 收的正是這種攤平的二維陣列 | 原生 |
| 字元集裁剪 | `lv_font_conv --symbols "…"`；LVGL 完全無感 | 原生（產生器端） |
| Bpp 1/2/4/8 | 已接好 —— `FontResource.bpp` → `--bpp` | 已完成 |
| 對齊 | `lv_obj_set_style_text_align()`，另有依書寫方向自動決定的 `LV_TEXT_ALIGN_AUTO` | 原生 |
| Typography 具名樣式 | LVGL 沒有這個名詞，但 `lv_style_t` + `lv_obj_add_style()` 就是同一件事：字型、字距、行距、對齊、裝飾線全都是 style 屬性 | 需編輯器端自建抽象 |
| 每語系不同字型 | 三條路都可行：切換時改 `lv_obj_set_style_text_font()`、串 `lv_font_t.fallback`、或在一次 `lv_font_conv` 中用多個 `--font` 合併範圍 | 需要決策，三者皆可 |
| 書寫方向 LTR/RTL | `lv_obj_set_style_base_dir()` 是真正可繼承的 style 屬性；需要 `LV_USE_BIDI` | 原生，需重編 |
| 阿拉伯文連寫 | `LV_USE_ARABIC_PERSIAN_CHARS`（`lv_text_ap.c`） | 部分 —— 僅阿拉伯/波斯文 |
| 自動換行 / 長文字 | `lv_label_set_long_mode()`：`WRAP`、`DOTS`、`SCROLL`、`SCROLL_CIRCULAR`、`CLIP` | 原生 |
| Wildcard `<value>` | `lv_label_set_text_fmt()`，或透過 observer 的 `lv_label_bind_text(obj, subject, fmt)` | 形式不同，能力對等 |
| Wildcard Characters / Ranges | LVGL 沒有這個概念 —— 它們就是 `--symbols` / `--range` 的輸入來源 | 原生（產生器端） |
| Bitmap / Vector | Bitmap 就是現行做法；Vector 需要 `LV_USE_TINY_TTF` 或 `LV_USE_FREETYPE` | 可行但代價高，見 §7.3 |
| **Fallback Characters** | **沒有對應。** 見 §7.1 | 無法提供 |
| **Ellipsis Character** | **沒有對應。** 見 §7.2 | 無法提供 |
| Texts 的 Groups 樹 | 純編輯器端的組織方式，與 LVGL 無關 | 不適用 |

## 3. `lv_translation` 是關鍵，而它目前是關閉的

LVGL 9 新增了一個翻譯模組，位於 `lv_translation.h`。它與 TouchGFX 的模型夠接近，
接近到 Texts 分頁可以直接產生成它的形式：

```c
static const char * const languages[]    = {"en", "zh", "ja", NULL};
static const char * const tags[]         = {"boxEnglish", "boxChinese", NULL};
static const char * const translations[] = {
    "ENGLISH", "CHINESE",   /* en */
    "英文",     "中文",       /* zh */
    "英語",     "中国語",     /* ja */
};

lv_translation_add_static(languages, tags, translations);
lv_translation_set_language("zh");
```

最省事的部分在 label 上：

```c
lv_label_set_translation_tag(ui_box_english, "boxEnglish");
```

設過 tag 的 label 會在語言變更時自行重讀文字 —— `lv_label.c` 內部就處理了
`LV_EVENT_TRANSLATION_LANGUAGE_CHANGED`。不需要產生事件處理函式，也不需要重建畫面。

三點要注意，都是讀原始碼而不是讀文件才發現的：

**3.1 只有 label 會這樣做。** 整個 LVGL 原始樹中處理
`LV_EVENT_TRANSLATION_LANGUAGE_CHANGED` 的只有一個 widget：`lv_label.c`。按鈕沒問題，
因為產生器會在裡面放一個真正的 label。但 **dropdown 選項、roller 選項、table 儲存格、
textarea placeholder 與 chart 軸標籤**都需要各自產生處理函式。這段樣板要我們自己寫。

**3.2 查表是線性字串比對。** `lv_translation_get()` 會逐一走過 tag 陣列呼叫
`lv_streq` 直到命中 —— 每次查詢 O(n)，相對於 TouchGFX 的 O(1) 整數 `TypedText`
索引。查詢只發生在畫面載入與語言切換時，所以數百筆文字沒有問題。若數量成長到數千
筆，替代方案是自行產生整數索引表 —— 但那會放棄 §3 的自動刷新，因此不該是第一步。

**3.3 它沒有被編進去。** `LV_USE_TRANSLATION` 在 `lv_conf_template.h` 中預設為
`0`，而 `firmware/*/include/lv_conf.h` 與 `wasm/lv_conf.h` 都完全沒有定義它。見 §9。

## 4. 字元集裁剪是最划算的一大筆

在所有項目中，這一項的效益風險比最好，而且是唯一完全不依賴 LVGL 的。

`src/resources/types.ts` 中的 `CHARSET_PRESETS` 目前把 `cjk-basic` 定為整段
`0x4E00`–`0x9FFF` —— 約兩萬個 glyph。`docs/font-integration.md` §11 已經承認了它的
產出：數 MB 的 C 檔，加上漫長的編譯。實際的 UI 只會用到幾百個不同的字元。

`lv_font_conv` 除了 `--range` 之外也接受 `--symbols`，直接餵一串要納入的字元。
Texts 分頁一旦存在，輸入就是現成的：所有語系所有翻譯的字元聯集，加上作者為執行期
替換值宣告的 Wildcard Characters。改動範圍侷限在 `generateFontConvCommand()` 與
`vite-plugin-compile.ts` 中的伺服器端呼叫 —— LVGL、韌體、產生的 UI 程式碼都不受影響。

這件事已經在路線圖上：`docs/font-integration.md` §11 把「Automatic charset
extraction」列為 future work #2。

## 5. Typography 對應到 `lv_style_t`

LVGL 沒有「typography」這個名詞，但機制是有的。Typographies 面板上除了轉換參數
之外，每一項都是 style 屬性：

| Typography 欄位 | LVGL |
| --- | --- |
| Font、Size | `lv_style_set_text_font()` —— 每個字型＋字級組合一個 `lv_font_t` |
| Direction | `lv_style_set_base_dir()` |
| Alignment（來自 Texts 分頁） | `lv_style_set_text_align()` |
| Type、Bpp | 非執行期狀態 —— 這些是 `lv_font_conv` 的參數 |

所以一個 Typography 就是一個產生出來的 `static lv_style_t`，用 `lv_obj_add_style()`
套上去。這嚴格優於編輯器目前的做法：字型選擇重複散落在兩條路徑上 ——
`props.fontResource` + `props.fontSize` 與 `styles.textFont` + `styles.textFontSize`
—— 且在 `src/codegen/templates/ui.c.ts` 中各自處理。導入 Typography 正好是把兩者
收斂為一的時機。

至於每語系字型覆寫，`lv_font_t.fallback` 值得一提：它是會遞迴解析的指標鏈，而
**本專案已經在用它** —— `ui.c` 會建立預設字型的可寫副本並把 `fallback` 指向符號
字型，藉此繞過 WASM 下 const 字型位於唯讀記憶體的限制。同一套技巧可直接延伸成
「拉丁字母取自字型 A、CJK 取自字型 B」，比每個語系各產一份合併字型更簡單也更小。

## 6. 書寫方向與字形塑形

`lv_obj_set_style_base_dir()` 是正規的可繼承 style 屬性，所以 RTL 可以設在
Typography 上並由子物件繼承 —— 與 Designer 的 Direction 切換形狀一致。
`LV_TEXT_ALIGN_AUTO` 再據此解析對齊方式，這也正是 Designer 的對齊欄隱含在做的事。

在對外承諾 RTL 支援之前，有兩個限制要先寫下來：

- `LV_USE_BIDI` 與 `LV_USE_ARABIC_PERSIAN_CHARS` 在每一塊板卡與 WASM 預覽中都是
  `0`。要打開就是重編，不是執行期旗標。
- **LVGL 沒有通用的塑形引擎。** `lv_text_ap.c` 只實作阿拉伯文與波斯文的上下文字形，
  沒有別的。泰文、天城文與其他印度語系不會正確呈現，也沒有任何設定旗標能改變這點。
  截圖中的阿拉伯文，剛好是 LVGL 有涵蓋的那個案例。

CJK 斷行是有處理的：`lv_text.c` 把單一 CJK 字元視為一個「詞」，因此沒有空格也能換行。

## 7. LVGL 做不到的部分

### 7.1 Fallback Characters

Designer 允許作者指定一個替代字元（截圖中是 `?`）給字型裡缺少的字。LVGL 沒有等價
機制。它有的是 `LV_USE_FONT_PLACEHOLDER`（畫一個方框）與 `lv_font_t.fallback`
（到另一個字型去找）。兩者都不是替換成指定的字元。

建議是不要提供這個欄位。有了 §4 之後，字元集是從文字本身推導出來的，所以缺字就
代表產生器有 bug —— 可設定的替代字元只會掩蓋它，而不是修好它。

### 7.2 Ellipsis Character

`lv_label.h` 把數量寫死為 `#define LV_LABEL_DOT_NUM 3`，而 `lv_label.c` 直接寫入
字面字元：

```c
label->text[dot_begin + i] = '.';
```

三個編譯進去的 ASCII 句點。要支援單一個 `…` glyph，就得修改 LVGL，或是放棄
`LV_LABEL_LONG_DOTS` 自行計算截斷點。兩者都不值得；這個欄位應該直接不做。

### 7.3 向量字型在這些板卡上不划算

`LV_USE_TINY_TTF` 可以提供 Designer 的 Vector 選項：`lv_tiny_ttf_create_data()`
從 TTF 二進位資料即時光柵化，`lv_tiny_ttf_set_size()` 可在執行期改變字級。但代價
是實在的 —— TTF 得整份留在 flash 而非裁剪成用到的 glyph（等於完全失去 §4）、每個
字級都是一個帶著自己 glyph 快取的活字型實例佔用 RAM、光柵化也移到 MCU 上做。在
驅動 480×272 的 STM32U599 上，bitmap 路線才是正確的預設值。誠實的答案是：目前
根本不要開放 Bitmap/Vector 這個開關。

## 8. 本專案目前的狀態

底子比看起來好：

- `lv_font_conv` 的伺服器端管線已經整條打通（`vite-plugin-compile.ts`）；`--symbols`
  只是在一個已經在組 `--range` 的指令上再多一個參數。
- `lv_font_t.fallback` 這套技巧已經在 `ui.c` 中驗證過，連 WASM 唯讀記憶體那個坑
  都處理了。

缺的部分：

| 落差 | 位置 |
| --- | --- |
| 沒有 text id 間接層 —— `props.text` 直接進 `lv_label_set_text(x, "…")` | `src/codegen/templates/ui.c.ts` |
| 專案檔中沒有 `languages` / `texts` / `typographies` | `src/resources/types.ts` 的 `ProjectFile` |
| 沒有 Typography 概念；字型設定分散在兩條程式路徑 | `props.fontResource` 與 `styles.textFont` |
| 只有四個粗略的字元集 preset，`custom` 要手動輸入 | `src/resources/types.ts` 的 `CHARSET_PRESETS` |
| `textAlign` 沒有 `auto`；`longMode` 缺 `scroll_circular` | `src/components/PropertyEditor/PropertyEditor.tsx` |
| 完全沒有書寫方向 | — |

## 9. 需要的設定變更

`vite-plugin-compile.ts` 中的 `generateCustomLvConf()` 只改寫三個 macro：
`LV_COLOR_DEPTH`、`LV_FONT_FMT_TXT_LARGE` 與 `LV_FONT_DEFAULT`。下表中的任何一項
都要先把這個函式一般化。

| Macro | 現況 | 用於 |
| --- | --- | --- |
| `LV_USE_TRANSLATION` | 未定義（template 預設 `0`） | §3 —— 全部 |
| `LV_USE_BIDI` | `0` | §6 —— RTL |
| `LV_USE_ARABIC_PERSIAN_CHARS` | `0` | §6 —— 阿拉伯文 |
| `LV_USE_TINY_TTF` | `0` | §7.3 —— 向量字型，不建議 |
| `LV_USE_FONT_COMPRESSED` | `0` | 選用：在 §4 之後進一步壓縮 |

而且 `docs/lvgl-configuration.md` 已經載明的那條限制在這裡同樣適用：韌體的
`lv_conf.h` 與 `src/types/hmi.ts` 中的板卡定義**不是互相產生的，必須手動保持同步**。
上面新增的任何 macro 都要落在兩個地方。

## 9a. 與 SquareLine Studio 的對照

SquareLine Studio 是商業 LVGL 編輯器，因此它的差異值得知道 —— 而且兩個方向都有。

**它領先我們的地方**

- **字型是明確的實例。** 字型檔 + 字級 + bpp + 字元集，具名、建立一次、重複使用。
  這比我們的 `FontResource`（一個檔案，字級由使用情形推導）更接近 TouchGFX 的
  Typography。推導字級要維護的東西較少；明確實例則較容易推理，作者能直接看到會被
  產出什麼。
- **Letters、Range、Symbols 是可疊加的**，同一張表上的三個輸入，而非互斥模式。
  我們的 `auto` / `preset` / `manual` 強迫作出一個未必互斥的選擇 —— 想同時要「用到的
  字」**和**一段自行宣告的範圍是合理需求，而今天只能選 `auto` 再用 Extra Ranges。
- **提供壓縮選項並寫明代價**：「約慢 30% 的算繪速度」，建議只用於較大且不常用的
  字型。我們寫死 `--no-compress` 且完全不提供 —— 這是安全的預設，但不是知情的預設。
- **有一個 Custom 欄位可傳原始 `lv_font_conv` 參數**（例如
  `--no-compress --no-prefilter`），作為 UI 未涵蓋項目的逃生門。我們沒有對應機制。

**我們領先的地方**

- **完全沒有由使用情形推導的字元集。** Letters/Range/Symbols 全都是宣告，沒有任何
  一項讀取專案自身的文字。CJK 字型仍須手動指定 —— 而這正是 §4 要消除的問題。
- **多語系只是標記，不是管理。** 標記為「To be translated」的文字會匯出成
  `_("text")`，而文件明言你「需要自行在專案中加入並使用 `lv_i18n` 函式庫」。
  編輯器裡沒有翻譯表格、沒有語系欄位 —— 文字內容活在工具之外。
- **它針對的是 `lv_i18n`**，較舊的社群函式庫，而非 LVGL 9 內建的 `lv_translation`
  （§3）。我們產生的是 LVGL 隨附、且 `lv_label` 本身就會跟隨的那個模組。

**值得借鑑的：** 帶有代價說明的壓縮選項，以及原始參數逃生門。兩者都不大，而且都屬於
「作者偶爾會需要一次、缺了就完全繞不過去」的那種東西。

## 10. 建議的順序

**第一梯隊 —— 原生支援，只改產生器**

1. **字元集裁剪（§4）。** 不依賴任何其他項目，而且在 EVK043027B 上能把數 MB 的
   CJK 字型變成數十 KB 的 flash。這一項該先做。
2. **Texts 分頁與 text id 間接層（§3）**，產生成 `lv_translation_add_static()` +
   `lv_label_set_translation_tag()`。需要 `lv_conf.h` 加一行，外加 §3.1 那些非
   label 的樣板。
3. **Typography 產生為 `lv_style_t`（§5）**，順便把兩條字型路徑收斂為一。

**第二梯隊 —— 需要重編 LVGL**

4. 書寫方向 / `base_dir`、BIDI 與阿拉伯文塑形（§6），在 `generateCustomLvConf()`
   一般化之後（§9）。
5. 每語系字型，走 `fallback` 鏈（§5）。
6. 補上 `LV_TEXT_ALIGN_AUTO` 與 `SCROLL_CIRCULAR`。

**不建議**

7. 向量字型（§7.3）、Fallback Characters（§7.1）、Ellipsis Character（§7.2）。

另有一項值得順手納入、而 TouchGFX 沒有對應做法的東西：
`lv_label_bind_text(obj, subject, fmt)` 可把 label 綁到 observer subject 上，值一
變動文字就更新，完全不需要事件處理函式。這與 `src/codegen/hmiBindingGenerator.ts`
中既有的 Modbus 綁定可以直接串起來，對即時數值而言是比 wildcard 更乾淨的機制。
