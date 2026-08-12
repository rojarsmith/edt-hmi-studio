# 字型選擇

<p align="center">
  <a href="../font-selection.md">English</a> · <strong>繁體中文</strong>
</p>

> **狀態。** 參考資料，不是決定。目前尚未有任何字型隨產品出貨。授權說明是法務審查
> 的起點，不能取代法務審查。

適合嵌入本產品的免費開源字型，以及在 480×272 或 800×480 工業 HMI 上真正適用的限制
條件。請與 [charset-trimming-design.md](./charset-trimming-design.md) 一併閱讀 ——
是後者讓大字型變得負擔得起。

## 1. 三個與桌面不同的判準

1. **小尺寸可讀性。** 480×272 面板上的中文通常落在 12–16px。幾何風格字型 —— 包含
   LVGL 內建的 Montserrat —— 在這個尺寸會糊掉。
2. **等寬數字。** HMI 讀數是原地更新的；比例數字會讓欄位在每次刷新時左右抖動。
3. **像素字型在小尺寸是碾壓性的。** 原生點陣字型配 1 bpp，比向量字型光柵化到同樣
   像素高度**更銳利**且小上數倍。這是本頁最反直覺的一項，往往也是省最多的一項。

## 2. 拉丁文 / UI 主字型

| 字型 | 授權 | 說明 |
| --- | --- | --- |
| **Inter** | OFL 1.1 | 為螢幕 UI 而繪：x 高度大、開口開，12–16px 表現同級最佳。支援等寬數字。**本產品首選。** |
| **Roboto** | Apache 2.0 | Android 的 UI 字型。Apache 2.0 沒有保留字名條款，是本頁授權摩擦最小的選擇。 |
| **IBM Plex Sans** | OFL 1.1 | 為技術與工業情境而繪，且有相配的 Mono、CJK、Arabic 同源家族 —— 若在意所有語系共用一套設計語言就選它。 |
| **Barlow / Rajdhani / Oswald** | OFL 1.1 | 窄體；同樣寬度容納更多字元。Rajdhani 正是 TouchGFX 截圖裡的字型。 |
| Montserrat | OFL 1.1 | LVGL 的內建預設。偏寬、小尺寸弱。當預設可以，但不是我們會為產品挑的字型。 |

## 3. 數值讀數

| 字型 | 授權 | 說明 |
| --- | --- | --- |
| **JetBrains Mono**、**IBM Plex Mono** | OFL 1.1 | 等寬，數字辨識度高 |
| **Roboto Mono** | Apache 2.0 | 同上，授權更寬鬆 |
| **DSEG**（DSEG7 / DSEG14） | OFL 1.1 | 模擬七段與十四段顯示器。儀表風格讀數很好用，且字集只有數字加幾個符號，成本幾乎為零。 |

## 4. 繁體中文

| 字型 | 授權 | 說明 |
| --- | --- | --- |
| **Noto Sans TC** | OFL 1.1 | 安全而完整的選擇。與 Source Han Sans TC 同一套設計。 |
| **思源黑體 Source Han Sans TC** | OFL 1.1 | 同一套設計的 Adobe 品牌版本 |
| **台北黑體 Taipei Sans TC Beta** | OFL 1.1 | 由思源黑體衍生，字形調整為貼近教育部標準字體。若產品必須符合該字形就選它。 |
| **jf open 粉圓** | OFL 1.1 | 圓體，語氣較親和 |
| **Cubic 11 俐方體十一號** | OFL 1.1 | **涵蓋繁體中文的 11px 原生點陣字型。** 嵌入式的首選亮點：12–16px 配 1 bpp，在銳利度與體積上都勝過任何向量字型。建議優先實測。 |
| **Ark Pixel Font 方舟像素字體** | OFL 1.1 | 10/12/16px 點陣，涵蓋繁中、簡中、日、韓。理由相同。 |

## 5. 日文與韓文

- 日文：**Noto Sans JP**；**M PLUS 1 / M PLUS 2**（OFL，UI 尺寸表現好）；
  **BIZ UDPGothic**（OFL，通用設計，為高辨識度而繪）
- 韓文：**Noto Sans KR**；**Pretendard**（OFL，風格接近 Inter）

## 6. 阿拉伯文 —— 以及一個 LVGL 陷阱

對照 `lv_text_ap.c` 的映射表確認過：LVGL 的 `LV_USE_ARABIC_PERSIAN_CHARS` 會把基本
字母（自 `LV_AP_ALPHABET_BASE_CODE` `0x0622` 起）映射到 **Arabic Presentation
Forms-B，`U+FE70`–`U+FEFF`** —— 例如 `{6, 0xFE90, …}` 這樣的條目。

**因此轉換出來的字型必須包含 `U+FE70`–`U+FEFF`，光有 `U+0600`–`U+06FF` 是不夠的。**
許多現代阿拉伯文字型透過 OpenType GSUB 實作連寫，完全不收錄這個舊版區塊；那些字型
不論在別處表現多好，在 LVGL 下都會整片缺字。

| 字型 | 授權 | 說明 |
| --- | --- | --- |
| **Noto Sans Arabic** | OFL 1.1 | 預設選擇，涵蓋度最廣 |
| **IBM Plex Sans Arabic** | OFL 1.1 | 與 Plex Sans 相配 |
| **Cairo** | OFL 1.1 | 現代幾何風，與拉丁 sans 搭配良好 |
| Amiri | OFL 1.1 | 傳統 Naskh。很美，但需要更多行高與完整塑形 —— 與 LVGL 的簡化塑形並不相配。 |

在選定任何一款之前，先 dump `cmap` 確認 `U+FE70`–`U+FEFF` 的覆蓋。這也正是
[charset-trimming-design.md](./charset-trimming-design.md) §7 所提 cmap 解析功能的
第一個實戰用途。

## 7. 圖示

LVGL 的內建符號是 Font Awesome 的子集，本專案已透過 `useBuiltinSymbols` /
`symbolFont` 接好。需要更多時：**Material Symbols**（Apache 2.0）、**Lucide**
（ISC）、**Bootstrap Icons**（MIT）、**Remix Icon**（Apache 2.0）、**Phosphor**
（MIT）。

有了字元集裁剪之後，圖示子集化用的是同一套機制 —— 只為實際擺放的 glyph 付出空間。

## 8. 授權實務

OFL 1.1 與 Apache 2.0 都允許嵌入商業韌體。兩點差異值得知道：

- **OFL 1.1** 帶有保留字名（RFN）條款：修改後的版本必須改名。轉換成 LVGL 的 C
  陣列一般被解讀為嵌入而非衍生出新字型，且 OFL 明文允許與軟體一同散布 ——
  但**OFL 授權文字必須隨產品出貨**，放在說明文件或授權畫面中。
- **Apache 2.0**（Roboto、Roboto Mono、Material Symbols）沒有 RFN 條款，要考量的
  事更少。

建議開一個 `LICENSES/` 目錄，或在文件中加一節，列出所有嵌入字型與其授權。這不是
法律意見；若產品要商業出貨，請由具資格者確認。

## 9. 針對本產品的建議組合

給 480×272 / 800×480、工業 Modbus HMI、繁體中文為主：

| 角色 | 建議 |
| --- | --- |
| 拉丁文與數字 | **Inter** —— 或 **Roboto**，若想完全不必考慮 RFN |
| 數值讀數 | Inter 的等寬數字；儀表風格則用 **DSEG7** |
| 繁體中文 ≥ 20px | **Noto Sans TC** |
| 繁體中文 11–16px | **Cubic 11** 配 1 bpp —— 優先實測；很可能是本頁單項省最多的一個 |
| 阿拉伯文（若需要） | **Noto Sans Arabic**，先驗證 `U+FE70`–`U+FEFF` |
| 圖示 | 維持 LVGL 內建符號；不足時加 **Material Symbols** 子集 |

這與別處的字型工作是連動的：`lv_font_t.fallback` 可以串成
**Inter → Noto Sans TC → 符號字型**，讓拉丁字母來自精簡的拉丁字型，只有漢字才付
漢字的成本。本專案在 `ui.c` 已經用過這個技巧 —— 包含 WASM 下 const 字型位於唯讀
記憶體的繞法 —— 所以這是延伸，不是新機制。
