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

| 板子 | 顯示 | `fontLarge` | `defaultFont` | `memSizeKb` | 堆積位於 |
| --- | --- | --- | --- | --- | --- |
| STM32F746G-DISCO | 480×272 RGB565 | `true` | `montserrat_14` | 4096 | 外部 SDRAM |
| STM32H747I-DISCO | 800×480 ARGB8888 | `true` | `montserrat_14` | 4096 | 外部 SDRAM |
| EDT EVK043027B | 480×272 ARGB8888 | `true` | `montserrat_14` | 1024 | 內部 SRAM |

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
  改寫它。三片板子都設 `LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN`，所以 `LV_MEM_SIZE`
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
  96–256 KB。
- **接著請看 §1.4。** 單一個做了變形的元件，可能就比上面全部加起來還要吃記憶體，
  而那才是目前這三片板子堆積大小的真正決定因素。
- 留意 `lv_malloc` 的失敗訊息，並用 `lv_mem_monitor()` 讀回實際尖峰用量，不要用猜的。
- 池子放在內部 RAM 時，開太大並非沒有代價：那是靜態保留，會永久剝奪韌體其餘部分
  可用的 RAM。放在外部 SDRAM 則幾乎沒有代價，這也是三片板子有兩片把它移過去的原因。

### 1.4 Transform layer，以及堆積為何是以 MB 計

旋轉或縮放過的元件不會就地繪製。LVGL 會先把它畫進一塊 **transform layer** —
只要 `transform_rotation` 不為 0，或任一軸的 scale 不是 256，`lv_obj_style.c`
就會回傳 `LV_LAYER_TYPE_TRANSFORM` — 而那塊 layer 是**一整塊連續的 ARGB8888**
緩衝區，大小等同該元件，並且就從本節談的這個堆積配置出來。

它有兩個性質決定了一切：

- **不能被切開。** `lv_refr.c` 只會把 `LV_LAYER_TYPE_SIMPLE` 切成
  `LV_DRAW_LAYER_SIMPLE_BUF_SIZE`（此處為 8 KB）的橫條。這也是為什麼換頁淡入或
  容器的 `opa` 幾乎不花記憶體：那些是 simple layer。變形的則是「整塊配置，否則
  免談」。
- **一律是每像素 4 bytes**，與 `LV_COLOR_DEPTH` 無關。layer 區域是元件本身再加
  5px 邊界，那圈邊界不被元件覆蓋，於是 `alpha_test_area_on_obj()` 會要求 alpha。

因此最壞情況是以元件自身尺寸計的 `(w + 10) × (h + 10) × 4`：

| 板子 | 全螢幕大小的元件 | 200×200 的元件 |
| --- | --- | --- |
| STM32F746G-DISCO（480×272） | 553 KB | 179 KB |
| STM32H747I-DISCO（800×480） | 1.5 MB | 179 KB |
| EDT EVK043027B（480×272） | 553 KB | 179 KB |

**配置不到時會發生什麼事，才是本節存在的理由。** 失敗不會被回報，也不會降級處理：
`lv_draw_layer_alloc_buf()` 回傳 NULL，軟體繪圖單元回答 `LV_DRAW_UNIT_IDLE`，
`lv_draw_dispatch()` 就只是把工作再排一次 — 永遠地排下去。這個 frame 從此畫不完，
面板也就再也收不到 flush，**整個畫面停在原樣**，其他元件一併陪葬。在 `LV_USE_LOG`
關閉的情況下，這一切安靜無聲：沒有 log、沒有 assert、沒有當機，只有一片凍結在開機
填色（通常就是全白）的畫面。

那正是 256 KB 的堆積對一個 200×200 旋轉矩形所做的事。現在的堆積大小，已足以讓面板
上任何尺寸的元件都能被變形：

- **F746G 與 H747I** — 池子透過 `LV_ATTRIBUTE_LARGE_RAM_ARRAY` 與 `.sdram` section
  搬出內部 RAM，移到板上的外部 SDRAM。兩份 linker script 的 SDRAM 區段起點都設在
  **frame buffer 之上**；frame buffer 由 BSP 固定在 linker 一無所知的位址，少了這個
  位移，堆積會被直接安排在畫面上。
- **EDT EVK043027B** — 這片板子沒有外部 RAM，因此池子改為在內部 SRAM 內長大，取用
  扣掉 frame buffer 後 1472 KB 中的 1 MB。開過頭會是連結期的 region overflow，而不是
  執行期才出事。

SDRAM 上的池子是純 CPU 存取的記憶體（沒有 DMA 讀它），所以不需要任何快取維護；它確實
會與 LTDC 共用 FMC 頻寬，而那正是「變形能夠成立」所付出的代價。

`LV_DRAW_TRANSFORM_USE_MATRIX` 可以完全避開 layer，但它要求繪圖引擎支援 3×3 矩陣變換，
而軟體渲染器做不到。三片板子都跑 `LV_USE_DRAW_SW`，因此 layer 是唯一的路。

---

## 2. 其餘設定

以下三項會被代入 WASM 預覽所產生的 `lv_conf.h`，在該處確實生效。

### 2.1 色彩深度

即 `LV_COLOR_DEPTH`，來自板子的 `display.colorFormat`：RGB565 → 16、RGB888 → 24、
ARGB8888 → 32。必須與面板及其驅動的預期相符。「New Project」對話框以唯讀方式顯示，
供你確認。

F746G 跑 RGB565，H747I 跑 ARGB8888。[色彩深度](./color-depth.md) 說明其代價、
哪些部分尚未在實機驗證，以及為什麼 Project Settings 裡的這個選項傳不到韌體。

### 2.2 大字型支援

`LV_FONT_FMT_TXT_LARGE` 會放寬 LVGL 壓縮字型格式的內部位移量寬度。當轉換後的字型
字符資料超出 16 位元範圍時就需要開啟 — 例如很大的字級，或涵蓋範圍很廣的 CJK 字集。
開著只會讓字型表稍微變大；關著卻使用過大的字型則會產生破損的字符。兩片板子都是開啟。
參見[字型引入設計文件](./font-integration.md)。

### 2.3 預設字型

即 `LV_FONT_DEFAULT`，未自行指定字型的元件所使用的字型。兩片板子都使用 LVGL 內建的
`montserrat_14`。使用者上傳的自訂字型改為在元件層級個別指定，因此這裡只是後備值。
