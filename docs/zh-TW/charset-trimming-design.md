# 字元集裁剪

<p align="center">
  <a href="../charset-trimming-design.md">English</a> · <strong>繁體中文</strong>
</p>

> **狀態。** 設計，尚未實作。這是
> [text-typography-evaluation.md](./text-typography-evaluation.md) §10 第一梯隊
> 第 1 項的細部設計 —— 該梯隊中唯一完全不依賴 LVGL 的項目，這也正是它排第一的理由。

目前一個字型要涵蓋哪些 glyph，是從四個粗略 preset 中人工挑一個，其中最廣的
`cjk-basic` 是整段 `0x4E00`–`0x9FFF`。本文設計它的替代方案：從專案實際包含的文字
推導出字集，並為靜態分析看不到的文字保留明確的逃生門。

## 1. 現況真正的問題

管線本身沒有問題，整條是通的：

```
FontResource.charset（四個 preset 擇一）
  → getCharsetRanges()          src/resources/converters/fontConverter.ts
  → CompilePreview.tsx          串成 "0x20-0x7e,0x4e00-0x9fff"
  → FontCompileRequest.ranges   src/components/CompilePreview/compilerService.ts
  → convertFonts()              vite-plugin-compile.ts
  → lv_font_conv --range=… --range=…
```

問題在於**兩個不同的問題被同一個欄位回答**：字型**應該**包含哪些 glyph，以及 UI
**實際**用到哪些 glyph。目前只問了前者，而且是問人。

既有的 `custom` 路徑裡還埋著一個陷阱。`getCharsetRanges()` 會把作者輸入的字元合併成
**連續區間**。中文碼位分散，800 個字會產生約 800 個單字元區間，也就是約 800 個
`--range=` 參數 —— 而 `convertFonts()` 是把整條指令組成**單一 shell 字串**。
`cmd.exe` 的命令列上限是 8191 字元。

實測結果（§11 案例 A）：800 個漢字產生**長度 17,996 字元的命令列**，直接以
`The command line is too long.` 失敗。所以自動收集若沿用既有的 range 路徑，會比
preset **更早**壞掉。§5 不是優化，是前置條件。

## 2. 設計輪廓

```
  collectGlyphs()                    新增，位於 src/codegen/
    ├── 走訪所有畫面的所有文字屬性
    ├── 走訪執行期設定的文字（事件、邏輯圖、Modbus 綁定）
    └── 把每個字串歸戶到實際會渲染它的字型
         │
         ▼
  每個 (font, size) 一組 code point 集合
         │
    ┌────┴─────┐
    │ 三層併集  │  ASCII 基準 ∪ 收集所得 ∪ 作者宣告的補充
    └────┬─────┘
         ▼
  FontCompileRequest { symbols, ranges, … }      symbols 為新欄位
         ▼
  convertFonts() 改用 argv spawn，不再組 shell 字串
         ▼
  lv_font_conv --symbols "…" [--range=…]
```

**粒度是 (font, size) 而非 font。** 這本來就是 `lv_font_conv` 的呼叫單位，所以不會
有額外成本，而且結果嚴格更小：48px 的標題與 14px 的狀態列很少共用字元。

## 3. 必須收集的範圍

以下每一項都會在產生的 C 中產出使用者可見的字串。漏掉任何一項就是板子上的缺字，
所以這張表就是規格：

| 元件 | 屬性 | 產生的呼叫 | 來源 |
| --- | --- | --- | --- |
| label | `text` | `lv_label_set_text` | `ui.c.ts` |
| btn | `text` | 內部 label | `ui.c.ts` |
| checkbox | `text` | `lv_checkbox_set_text` | `ui.c.ts` |
| textarea | `text`、`placeholder` | `lv_textarea_set_text`、`…_set_placeholder_text` | `ui.c.ts` |
| dropdown / roller | `options`（陣列或 `\n` 字串） | `lv_dropdown_set_options` | `ui.c.ts` |
| table | `cells`（二維） | `lv_table_set_cell_value` | `ui.c.ts` |
| tabview | 分頁名稱 | `lv_tabview_add_tab` | `ui.c.ts` |
| win | `title` | `lv_win_add_title` | `ui.c.ts` |

執行期才設定的文字需要另外處理：

| 來源 | 可否靜態分析 |
| --- | --- |
| `setText` 內建動作的 `action.value`（`ui_events.c.ts`） | 可 —— 是專案裡的字面值 |
| 邏輯圖 setText 節點（`ui_logic.c.ts`） | 可 |
| Modbus 綁定格式化數值（`hmiBindingGenerator.ts`） | 部分 —— 需納入數字、`.`、`-` 與單位後綴 |
| `LV_SYMBOL_*` | **必須排除** —— 來自符號字型，不是文字字型 |
| 事件或邏輯節點中的自訂 C（`customCode`） | **不可** —— 這正是 §4 存在的理由 |

附帶一提，`escapeCString()` 對 UTF-8 是原樣通過，所以收集器蒐集到的 code point
就是最終進入 `.c` 檔的位元組，沒有第二層編碼要對齊。

## 4. 三層併集

自動收集只有在「分析看不到的文字有地方可以宣告」的前提下才安全。

**第一層 —— 無條件基準線。** ASCII `0x20`–`0x7E`：95 個 glyph，在任何 bpp 下成本
都可忽略，且涵蓋絕大多數 printf 風格的執行期文字。`extractCharsFromText()` 今天
就已經做了完全相同的決定，所以這是延續而非新規則。

**第二層 —— §3 的全部。**

**第三層 —— 作者宣告的補充**，即 TouchGFX 的 Wildcard Characters 與 Wildcard
Ranges 原樣沿用。

```ts
export type CharsetMode = 'auto' | 'preset' | 'manual';

export interface FontResource {
  // …
  charsetMode: CharsetMode;   // 新增；新加入的字型為 'auto'
  charset: CharsetType;       // 保留，僅在 mode === 'preset' 時有意義
  extraChars?: string;        // Wildcard Characters
  extraRanges?: string;       // "0x4E00-0x4EFF,0xFF00-0xFFEF"
  /** @deprecated 已遷移至 extraChars */
  customChars?: string;
}
```

遷移規則，前提是不得改變任何既有專案的輸出：

| 既有值 | 遷移為 |
| --- | --- |
| `charset: 'custom'` + `customChars` | `charsetMode: 'manual'`，`extraChars = customChars` |
| `charset: 'ascii' \| 'latin' \| 'cjk-basic'` | `charsetMode: 'preset'`，`charset` 不變 |
| 新加入的字型 | `charsetMode: 'auto'` |

因此既有專案產出的位元組完全相同，只有新字型走新路徑。這是一條回歸測試，不是期望
—— 見 §9。

## 5. 傳輸層：`--symbols` 與 argv spawn

`lv_font_conv` 除了 `--range` 也接受 `--symbols "…"`，兩者取聯集。
`FontCompileRequest` 新增 `symbols?: string`；`ranges` 保留，改為只承載第三層的補充
範圍。

字型轉換這一步也必須**停止組 shell 字串，改傳 argv 陣列**。理由不是直覺上的那個，
所以值得講精確 —— 實測數據在 §11。

**長度不是問題。** `--symbols` 很精簡：同樣那 800 個漢字，走 range 會撐爆命令列，
走 symbols 只有 1,209 字元（§11 案例 B），而且成功。要碰到 8191 上限得到約 6,000
字元才行。

**引號才是問題，而且是新增的曝險。** 現在只有十六進位範圍會進到命令列，沒有任何
使用者文字被引號包住，所以壞不了。一旦 `--symbols` 開始承載作者輸入的文字，label
裡一個尋常的 `"` 就會摧毀整條指令：實測（§11 案例 E1），含 `"` 的 symbols 字串把
`--output` 參數吃掉了，`lv_font_conv` 以 `Output is required for "lvgl" writer`
失敗。同一個字串走 argv 則完全正確。label 裡出現雙引號並不是邊角案例。

**在 Windows 上，argv 必須繞過 `.cmd` shim。** 對
`node_modules/.bin/lv_font_conv.cmd` 用 `execFile` 加 `shell: false` 會在現行 Node
上以 `EINVAL` 失敗（§11 案例 C）—— 這是 Node 為 CVE-2024-27980 採取的緩解措施，
拒絕在不經 shell 的情況下啟動 `.cmd`/`.bat`。改成對套件的 JS 進入點
（`lv_font_conv/lv_font_conv.js`）啟動 `process.execPath` 則可行（§11 案例 D）。

最後這點有個值得順手拿下的後果：既然要解析 JS 進入點，`lv_font_conv` 就應該成為
**`package.json` 裡的專案相依**，而不是 `vite-plugin-compile.ts` 目前假設的全域安裝。
這同時也了結了 `docs/font-integration.md` §11 的「Server dependency」那一項 ——
轉換不會再在沒跑過 `npm install -g` 的機器上失敗。

symbol 字串在送出前必須**去重並排序**。理由見 §6。

## 6. 快取

`docs/font-integration.md` §11 把「無快取」列為已知限制，並把轉換快取列為 future
work #1。本設計讓快取更必要 —— 字集現在會隨任何一次 label 編輯而變動 —— 同時也讓
它更容易，因為收集器產出的是一個正規化的值：

```
key = sha256(fontData) + size + bpp + sorted(symbols) + sorted(ranges) + compress
```

既有的 `tmpdir()/lvgl-lib-<hash>` 慣例可直接沿用。

有一個後果應該先寫下來而不是之後才發現：因為 key 含字集，**編輯一個 label 就會讓
該字型的快取失效**。編輯期間的命中率會比看起來低。兩層式快取（基準層與專案層分開）
是可行的，但在第一次量測之前不值得動手。

## 7. 編輯器介面

`FontManager.tsx` 中的 charset 下拉改為：

- **模式**：`自動（實際用到的字）` / `Preset` / `手動`
- 自動模式下的即時回饋：`來自 47 處文字的 312 字 · ASCII 基準 95 · 補充 12`
- **預覽收集到的字元** —— 把集合倒出來供作者目視確認
- 補充字元與補充範圍兩欄常駐；在自動與 preset 模式下同樣適用

**值得一併做的事：編輯期的缺字警告。** `parseFontMetadata()` 已經在走訪 TTF 的
table directory 讀取 `name` 與 `head`，延伸去讀 `cmap` 是不大的增量，而它能把
「lv_font_conv 靜默丟棄一個 glyph、板子上顯示空白」變成就出現在肇因文字旁邊的一則警告。

這也是 LVGL 無法實作的 Fallback Character 欄位（[text-typography-evaluation.md](./text-typography-evaluation.md)
§7.1）的誠實答案：解法不是執行期替換，而是不讓這個情況發生。

## 8. 必須一併關閉的落差

`vite-plugin-hmi.ts` **完全沒有字型處理**。WASM 編譯預覽會跑 `lv_font_conv`，韌體
佈署路徑不會。若收集器寫在 `CompilePreview.tsx` 內，預覽與實機會對「字型裡有哪些
glyph」產生分歧。

所以收集器應該放在 `src/codegen/`，與 `collectUsedCustomFonts` 同層級，且
`FontCompileRequest` 必須移到共用型別。這是本工作的前置條件，不是可選項。

## 9. 測試

- **單元** —— 收集器對 fixture 專案的產出與預期 code point 集合比對：CJK、BMP 外
  字元、重複字元、空字串
- **單元** —— symbols 字串已排序去重，且跨次執行穩定（快取 key 穩定性）
- **單元** —— `LV_SYMBOL_*` 絕不進入文字字型的集合
- **整合** —— `compile.test.ts` 已經會編譯真實專案；加入 CJK label 案例，並斷言
  只出現在 `setText` 動作中的字元有被保留進字型
- **回歸** —— `charset: 'custom'` 的專案在遷移後產出位元組相同

## 10. 預期效果

以下是實測而非估算 —— 方法見 §11：

| | C 原始碼 | 嵌入的資料 | Glyphs | 轉換耗時 |
| --- | --- | --- | --- | --- |
| `cjk-basic` preset（現況） | 16.94 MB | **1369 KB** | 21,072 | 72.0 s |
| 裁剪後：800 漢字 + ASCII | 0.70 MB | **54 KB** | 896 | 0.9 s |

**flash 少 25 倍、C 原始碼少 24 倍、轉換快 80 倍。**

兩個大小欄位是不同的東西，而且都重要。嵌入的資料是真正落進 flash 的量；C 原始碼
大小則是編譯器必須啃完的量 —— 那 72 秒就花在這裡。

以 EVK043027B 的量級來看，其 linker script 給 `FLASH` 的是 2048 KB：目前 preset 下
**一個字型、一個字級就是 1369 KB，佔整個內部 flash 的 67%** —— 這還沒算韌體本身，
也還沒算第二個字級。裁剪後同一個字型是 54 KB，佔 2.6%。這不是替你爭取餘裕的優化，
而是字型放不放得進去的差別。

## 11. 實測

對象是 `SourceHanSansSC-Normal.otf`（LVGL 自己的 `scripts/built_in_font/` 內附的
OFL 字型），16px / 4bpp，`lv_font_conv` 1.5.3，Node 24.19 / Windows 11。字元集為
分散於 CJK 區塊、以決定性方式選出的 800 個漢字碼位。

| 案例 | 內容 | 結果 |
| --- | --- | --- |
| A | 800 個 `--range`，單一 shell 字串 | **失敗** —— 命令列 17,996 字元，`The command line is too long.` |
| B | `--symbols`，單一 shell 字串 | 成功 —— 命令列 1,209 字元，3.8 s |
| C | `--symbols`，argv 對 `.bin/lv_font_conv.cmd` | **失敗** —— `spawn EINVAL` |
| D | `--symbols`，argv 對 `node lv_font_conv.js` | 成功 —— 1.0 s，801 glyphs |
| E1 | symbols 含 `" & % ^ < > \| ! $ \` `，shell 字串 | **失敗** —— 引號崩潰，`--output` 遺失 |
| E2 | 同一字串走 argv | 成功 —— 27 glyphs，全數正確 |
| F | `cjk-basic` preset（`0x20-0x7E` + `0x4E00-0x9FFF`） | 成功 —— 72.0 s，16.94 MB 原始碼，1369 KB 資料 |
| G | ASCII 範圍 + 800 字 symbols | 成功 —— 0.9 s，0.70 MB 原始碼，54 KB 資料 |

嵌入資料的數字是產生的 C 中 `0x..` 位元組字面量的個數，也就是真正進到 flash 的
陣列 —— 不是 `.c` 檔案本身的大小。
