# 字型引入設計文件

<p align="center">
  <a href="../font-integration.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 整體架構

EDT GUI Studio 的字型系統支援 LVGL 內建字型與使用者上傳的自訂字型（TTF/OTF）。字型大小在元件層級按需選擇，建置時動態收集所有實際用到的字型＋字級組合，再透過 `lv_font_conv` 轉換為 LVGL 的 C 原始檔。

```
使用者上傳字型 (TTF/OTF)
       │
       ▼
  ResourceStore（前端狀態管理）
  ├── 解析字型中繼資料 (family, style)
  ├── 儲存 base64 資料
  └── 產生 cFontName（例如 ui_font_noto）
       │
       ▼
  專案設定
  ├── 選擇預設字型（內建或自訂）
  └── 預設字型為自訂字型時，選擇預設字級
       │
       ▼
  元件屬性面板
  ├── 選擇字型（預設／內建／自訂）
  ├── 內建字型：大小固定（名稱自帶，例如 montserrat_14）
  └── 自訂字型：可選 8-48px
       │
       ▼
  程式碼生成 (codegen)
  ├── 掃描所有元件，收集實際用到的字型＋字級組合
  ├── ui.h：LV_FONT_DECLARE(ui_font_noto_16)
  ├── ui.c：每個 screen 設定預設字型
  └── ui.c：只對字型／字級與預設不同的元件產生設定程式碼
       │
       ▼
  編譯預覽 (CompilePreview)
  ├── 動態收集所有用到的自訂字型＋字級組合
  ├── 建立 FontCompileRequest（base64 + 轉換參數）
  └── POST /api/compile (files + fonts)
       │
       ▼
  伺服器端 (vite-plugin-compile)
  ├── 解碼 base64 → 暫存的 .ttf/.otf 檔
  ├── 對每個字級呼叫 lv_font_conv 產生 .c 檔
  └── 與 UI 程式碼一起用 emcc 編譯 → WASM
```

## 2. 字型類型

### 2.1 內建字型

LVGL 內建的 Montserrat 字型，大小固定寫在名稱裡：

- `montserrat_8` 到 `montserrat_48`（偶數大小）
- 預設字型：`montserrat_14`
- 選擇內建字型時**不能另外設定字型大小**（大小由字型名稱決定）

### 2.2 自訂字型

使用者上傳的 TTF/OTF 字型檔：

- 上傳時只需設定：名稱、C 變數名稱、字元集、BPP
- **上傳時不需要選擇字級** —— 字級在元件屬性面板中按需選擇
- 建置時依實際使用情況動態產生所需的所有字級

## 3. 預設字型機制

### 3.1 專案設定

在專案設定（`ProjectSettings`）中設定：

- **預設字型**：可選內建字型或已上傳的自訂字型
- **預設字型大小**：僅當預設字型為自訂字型時顯示，可選 8-48px

設定存放在 `ProjectConfig.lvglConfig`：

```typescript
interface LvglConfig {
  defaultFont: string;        // 例如 "montserrat_14" 或 "ui_font_noto"
  defaultFontSize?: number;   // 僅自訂字型需要，例如 16
  // ...
}
```

### 3.2 繼承規則

- 每個 screen（頁面）在初始化時設定預設字型
- 元件預設繼承所在 screen 的字型設定
- 只有字型或字級與預設不同的元件，才會產生單獨的字型設定程式碼

## 4. 元件的字型選擇

### 4.1 屬性面板行為

`ComponentFontSelector` 提供三種選擇：

| 選擇 | 字型大小選擇器 | 行為 |
|------|--------------|------|
| **預設** | 預設字型為自訂字型時顯示，為內建字型時隱藏 | 繼承專案預設字型；仍可選擇不同字級 |
| **內建字型** | 隱藏 | 使用指定的內建字型（大小固定） |
| **自訂字型** | 顯示（8-48px） | 使用指定的自訂字型與選定的大小 |

### 4.2 程式碼生成的判斷邏輯

對每個元件，生成器依下列規則判斷：

```
元件未設定字型（fontResource 為空）
  → 不產生字型程式碼（繼承預設）

元件字型 == 預設字型 且 字級 == 預設字級
  → 不產生字型程式碼（繼承預設）

元件字型 == 預設字型 但 字級 != 預設字級
  → 產生 lv_obj_set_style_text_font（同字型不同大小）

元件字型 != 預設字型
  → 產生 lv_obj_set_style_text_font（不同字型）
```

## 5. 完整流程

### 5.1 字型上傳

使用者透過資源管理面板上傳 TTF/OTF 檔，前端會：

1. 以 `fontFileToBase64()` 將檔案轉為 base64 data URI
2. 以 `parseFontMetadata()` 解析字型的 name 表，取出 family 與 style
3. 產生 `cFontName`（格式：`ui_font_<sanitized_name>`）
4. 存入 `ResourceStore.fonts` 陣列

### 5.2 程式碼生成

`generateCode()` 被呼叫時：

1. **收集使用情況**：`collectUsedCustomFonts()` 走訪所有頁面的所有元件，收集實際用到的自訂字型＋字級組合
2. **ui.h**：為每個組合產生 `LV_FONT_DECLARE(cFontName_size)`
3. **ui.c screen init**：每個 screen 設定專案的預設字型
4. **ui.c 元件**：只對字型／字級與預設不同的元件產生 `lv_obj_set_style_text_font`

### 5.3 編譯預覽

`CompilePreview.handleCompile()` 會：

1. 以 `collectUsedCustomFontSizes()` 動態收集所有元件實際用到的自訂字型＋字級組合
2. 呼叫 `generateCode()` 產生 C 原始檔
3. 將字型資源轉換為 `FontCompileRequest[]`，其中 `sizes` 為動態收集到的字級陣列
4. 呼叫 `compileCode(userFiles, width, height, onStatus, fontRequests)`

### 5.4 伺服器端字型轉換

`vite-plugin-compile.ts` 的 `/api/compile` 端點：

1. 接收 `fonts` 陣列
2. 對每個字型：
   - 解碼 base64 並寫入暫存檔
   - 對每個 size 呼叫 `lv_font_conv` 產生 `.c` 檔
   - 讀回產生的 C 原始碼內容
3. 將字型 `.c` 檔加入 emcc 的編譯來源清單

### 5.5 編譯輸出

emcc 將所有 `.c` 檔（UI 程式碼＋字型 C 陣列）編譯為 `output.js` 與 `output.wasm`，在瀏覽器中執行。

## 6. 畫布預覽

設計畫布（Canvas）上的元件預覽也會反映預設字型大小：

- `appStore.defaultFontSize` 存放目前專案的預設字型大小
- `CanvasComponent` 讀取此值，作為文字元件（btn、label、checkbox 等）的預設字級
- 元件若自行設定了 `fontSize`，則以元件自身的值為準

## 7. 關鍵檔案

| 檔案 | 職責 |
|------|------|
| `src/store/projectStore.ts` | `LvglConfig` 型別定義（含 `defaultFont`、`defaultFontSize`） |
| `src/store/appStore.ts` | `defaultFontSize` 狀態與 `parseFontSize()` 工具函式 |
| `src/resources/types.ts` | `FontResource` 型別定義 |
| `src/resources/converters/fontConverter.ts` | 字型中繼資料解析、字元集範圍計算、`lv_font_conv` 指令生成 |
| `src/components/ProjectSettings/ProjectSettings.tsx` | 專案設定 UI（預設字型與預設字型大小） |
| `src/components/PropertyEditor/PropertyEditor.tsx` | 元件字型選擇器（`ComponentFontSelector`） |
| `src/components/Canvas/CanvasComponent.tsx` | 畫布元件預覽（讀取 `defaultFontSize`） |
| `src/codegen/templates/ui.h.ts` | 產生 `LV_FONT_DECLARE` 宣告（僅限實際用到的組合） |
| `src/codegen/templates/ui.c.ts` | 元件字型程式碼生成（含繼承判斷邏輯） |
| `src/codegen/generator.ts` | 程式碼生成進入點，傳遞 `defaultFont` 與 `defaultFontSize` |
| `src/components/CompilePreview/CompilePreview.tsx` | 編譯預覽，動態收集字級並建立字型請求 |
| `src/components/CompilePreview/compilerService.ts` | 編譯服務用戶端，送出字型資料 |
| `vite-plugin-compile.ts` | 伺服器端編譯外掛，呼叫 `lv_font_conv` 並編譯 |

## 8. lv_font_conv 使用方式

### 安裝

```bash
npm install -g lv_font_conv
```

### 指令格式

```bash
lv_font_conv \
  --font <input.ttf> \
  --size=<N> \
  --bpp=<1|2|4|8> \
  --range=<start>-<end> \
  --format=lvgl \
  --output=<name>.c \
  --no-compress
```

### 範例

```bash
lv_font_conv \
  --font NotoSansSC-Regular.ttf \
  --size=16 \
  --bpp=4 \
  --range=0x20-0x7e \
  --format=lvgl \
  --output=ui_font_noto_16.c \
  --no-compress
```

產生的 `.c` 檔包含一個全域變數 `lv_font_t ui_font_noto_16`，變數名稱取自輸出檔名（不含 `.c`）。

## 9. 字型變數命名規範

| 層級 | 格式 | 範例 |
|------|------|------|
| cFontName | `ui_font_<name>` | `ui_font_noto` |
| 帶 size 的變數名 | `<cFontName>_<size>` | `ui_font_noto_16` |
| ui.h 宣告 | `LV_FONT_DECLARE(<var>)` | `LV_FONT_DECLARE(ui_font_noto_16)` |
| ui.c 引用 | `&<var>` | `&ui_font_noto_16` |
| lv_font_conv 輸出 | `--output=<var>.c` | `--output=ui_font_noto_16.c` |

`LV_FONT_DECLARE(x)` 巨集會展開為 `extern const lv_font_t x;`，與 `lv_font_conv` 產生的全域變數宣告相符。

## 10. 支援的字元集與設定選項

### 字元集預設

| ID | 名稱 | Unicode 範圍 |
|----|------|-------------|
| `ascii` | ASCII | 0x20-0x7E |
| `latin` | Latin Extended | 0x20-0x7E, 0xA0-0x24F |
| `cjk-basic` | CJK 基本 | 0x20-0x7E, 0x4E00-0x9FFF |
| `custom` | 自訂 | 使用者指定的字元清單 |

### BPP（抗鋸齒位元深度）

- **1 bpp**：無抗鋸齒，體積最小
- **2 bpp**：4 級灰階
- **4 bpp**：16 級灰階（建議）
- **8 bpp**：256 級灰階，品質最佳

### 設定選項

- `charset: CharsetType`：字元集類型
- `customChars?: string`：字元集為自訂時的字元清單
- `bpp: 1 | 2 | 4 | 8`：抗鋸齒位元深度
- `compress: boolean`：是否壓縮（目前編譯預覽使用 `--no-compress`）

## 11. 已知限制與未來改進

### 已知限制

- **CJK 字元集體積龐大**：`cjk-basic` 涵蓋約 20,000 個漢字，產生的 C 檔可能達數 MB，編譯時間較長
- **伺服器端相依**：需要全域安裝 `lv_font_conv`，未安裝時轉換會失敗
- **無字型子集化**：自訂字元集需由使用者手動指定，不會自動分析 UI 中實際用到的字元
- **無快取**：每次編譯都重新轉換字型，不會沿用先前的轉換結果

### 未來改進方向

1. **字型轉換快取**：以字型 hash + size + charset + bpp 為鍵快取轉換結果，避免重複轉換
2. **自動擷取字元集**：分析 UI 中所有文字內容，自動產生最小字元集
3. **WASM 版 lv_font_conv**：將其編譯為 WASM，直接在瀏覽器端轉換，消除伺服器端相依
4. **字型預覽**：在資源管理面板中以 CSS `@font-face` 預覽上傳的字型效果
5. **字型合併**：支援將多個字型的不同範圍合併為一個 LVGL 字型（`lv_font_conv` 的 `--font` 可指定多次）
6. **進度回饋**：對大字元集的轉換提供進度條或預估時間
