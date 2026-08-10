# LVGL 設定

<p align="center">
  <a href="../lvgl-configuration.md">English</a> · <strong>繁體中文</strong>
</p>

專案會帶著一組 `lvglConfig`，描述 **LVGL 本身要如何為目標板編譯** — 與你在畫布上
擺放的元件無關，那些由 Screen 樹描述。

**「New Project」對話框不會詢問其中任何一項。** 這些設定全都是硬體的屬性，因此選擇
**Hardware Model Number** 就會 1 對 1 決定它們。數值定義在 `src/types/hmi.ts` 的
`SUPPORTED_BOARDS`。

| 設定 | 專案欄位名 | LVGL 巨集 | 來源 |
| --- | --- | --- | --- |
| 色彩深度 | `colorFormat` | `LV_COLOR_DEPTH` | `board.display.colorFormat` |
| 大字型支援 | `fontLarge` | `LV_FONT_FMT_TXT_LARGE` | `board.lvgl.fontLarge` |
| 預設字型 | `defaultFont` | `LV_FONT_DEFAULT` | `board.lvgl.defaultFont` |
| 記憶體大小 | `memSize` | `LV_MEM_SIZE` | `board.lvgl.memSizeKb` — **目前未套用，見 §1.2** |

目前支援的板子：

| 板子 | 顯示 | `fontLarge` | `defaultFont` | `memSizeKb` |
| --- | --- | --- | --- | --- |
| STM32F746G-DISCO | 480×272 RGB565 | `true` | `montserrat_14` | 96 |
| STM32H747I-DISCO | 800×480 RGB565 | `true` | `montserrat_14` | 256 |

`board.lvgl` 對映 `firmware/<board>/include/lv_conf.h`，後者才是韌體實際編譯時採用
的設定。**兩者並非由彼此產生 — 任一方變動時請手動保持同步。**

在這項改為由板子決定之前建立的專案，會保留當時存下的值；板子定義只在建立專案當下
套用，不會回溯修改既有專案。

---

## 1. Memory Size

### 1.1 這是哪一種記憶體

`memSize` 的用意是設定 **`LV_MEM_SIZE`：LVGL 自己的內部堆積大小**。它不是 MCU 的
總 RAM、不是 flash／程式大小，也不是framebuffer。

LVGL v9 取得記憶體的方式有兩種，由 `LV_USE_STDLIB_MALLOC` 決定：

- **`LV_STDLIB_BUILTIN`** — LVGL 自行管理一塊固定大小的位元組池，透過
  `lv_malloc()` / `lv_free()` 配置。`LV_MEM_SIZE` 就是這塊池子的大小。它會以靜態
  陣列的形式預先保留，因此不論 UI 實際用不用得到都會佔掉那麼多 RAM，而且**無法
  成長**：池子用盡時配置就會失敗，LVGL 會記錄 out-of-memory 錯誤。
- **`LV_STDLIB_CLIB`** — LVGL 改呼叫 C 函式庫的 `malloc()` / `free()`。此模式下
  `LV_MEM_SIZE` **完全被忽略**。

從這塊池子配置出去的是 LVGL 的*內部簿記資料*，大致包括：

- 元件物件（`lv_obj_t` 與各元件型別的額外資料）
- local style 與樣式屬性陣列
- 動畫描述子、timer、事件處理器清單
- 文字排版快取，以及影像／字型的解碼快取
- 中間繪製緩衝，例如對容器設 `lv_obj_set_style_opa()` 所產生的 layer，或旋轉、
  變形後的內容

**不會**從這裡出的是：顯示用的framebuffer，以及你交給
`lv_display_set_buffers()` 的繪製緩衝。那些由板級整合程式碼自行配置 — 這也是為什麼
480×272 RGB565 面板每張framebuffer就需要約 255 KB，與 `LV_MEM_SIZE` 設多少無關。

### 1.2 目前狀態：有存但沒有套用

**`memSize` 目前不會影響任何建置產物。** 它會跟著專案儲存、也能正確地在匯出／匯入間
往返，但沒有任何建置路徑會讀它：

- **WASM 預覽** — `vite-plugin-compile.ts` 的 `generateCustomLvConf()` 只會把
  `LV_COLOR_DEPTH`、`LV_FONT_FMT_TXT_LARGE`、`LV_FONT_DEFAULT` 代入模板，從未寫入
  `LV_MEM_SIZE`。而且就算寫了也沒用：`wasm/lv_conf.h` 設定的是
  `LV_USE_STDLIB_MALLOC LV_STDLIB_CLIB`，該建置使用 C 函式庫的配置器，依定義就會
  忽略 `LV_MEM_SIZE`。
- **韌體** — 每片板子已納入版控的 `lv_conf.h` 把值寫死，沒有任何程式會依專案設定
  改寫它。兩片板子都設 `LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN`，所以 `LV_MEM_SIZE`
  在那裡是真正生效的設定 — 只是它來自檔案。

由於專案裡的值與韌體的值現在同樣源自板子定義，兩者內容是一致的；只是專案這份並不是
編譯器看到的那一份。

有一個副作用是真實存在的：`memSize` 是 `hashLvglConfig()` 設定雜湊的一部分，因此
儲存值不同的專案會各自產生一份快取的 LVGL 靜態函式庫，即使輸出完全相同。

**要改變韌體建置的堆積大小，請編輯該板子的 `lv_conf.h`，並同步更新
`board.lvgl.memSizeKb`。**

### 1.3 新增板子時如何選值

- 以元件數量而非畫面數量估算。已建立但未顯示的 Screen，其物件仍佔用池子。
- 數十個元件的簡單 UI，32–64 KB 即可。含 table、chart、tab view 的密集畫面需要
  96–256 KB。本專案的兩片板子分別使用 96 KB 與 256 KB。
- 留意 `lv_malloc` 的失敗訊息，並用 `lv_mem_monitor()` 讀回實際尖峰用量，不要用猜的。
- 開太大並非沒有代價：這是靜態保留，會永久剝奪韌體其餘部分可用的 RAM。

---

## 2. 其餘設定

以下三項會被代入 WASM 預覽所產生的 `lv_conf.h`，在該處確實生效。

### 2.1 色彩深度

即 `LV_COLOR_DEPTH`，來自板子的 `display.colorFormat`：RGB565 → 16、RGB888 → 24、
ARGB8888 → 32。必須與面板及其驅動的預期相符。「New Project」對話框以唯讀方式顯示，
供你確認。

兩片板子都跑 RGB565。[色彩深度](./color-depth.md) 說明把 H747I 改成 32-bit 的
代價，以及為什麼 Project Settings 裡的這個選項目前傳不到韌體。

### 2.2 大字型支援

`LV_FONT_FMT_TXT_LARGE` 會放寬 LVGL 壓縮字型格式的內部位移量寬度。當轉換後的字型
字符資料超出 16 位元範圍時就需要開啟 — 例如很大的字級，或涵蓋範圍很廣的 CJK 字集。
開著只會讓字型表稍微變大；關著卻使用過大的字型則會產生破損的字符。兩片板子都是開啟。
參見[字型引入設計文件](./font-integration.md)。

### 2.3 預設字型

即 `LV_FONT_DEFAULT`，未自行指定字型的元件所使用的字型。兩片板子都使用 LVGL 內建的
`montserrat_14`。使用者上傳的自訂字型改為在元件層級個別指定，因此這裡只是後備值。
