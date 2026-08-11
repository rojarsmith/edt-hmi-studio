# 更新日誌

<p align="center">
  <a href="./CHANGELOG.md">English</a> · <strong>繁體中文</strong>
</p>

本專案所有值得記錄的變更都會寫在這個檔案裡。

格式依循 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，版本編號依循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### 新增
- **支援 EDT EVK043027B** — STM32U599NJH6Q、由 LTDC 直接驅動的 480×272 面板（ARGB8888 32-bit）、maXTouch MXT336U 觸控，圖片資源留在 2 MB 的內部 flash。完整韌體樣板位於 `firmware/edt-evk043027b/`，含 vendor 進來的 EDT 面板與觸控驅動。詳見 [docs/zh-TW/edt-evk043027b.md](docs/zh-TW/edt-evk043027b.md)
- **以獨立探針燒錄的板子改用目標晶片辨識** — 獨立的 ST-LINK/V2 不會回報板名，因此 `probeBoardPattern` 現在可以是 `null`；燒錄器改為先連線（不寫入）並比對回報的 device ID 與板子定義是否相符
- **外部 flash 設定改為逐板配置** — 外部載入器名稱與基底位址從 `server/hmi/service.ts` 的常數搬到板子定義上，每塊板子指名自己的顆粒。定義中 `externalFlash: null` 的板子會跳過外部燒錄步驟

### 變更
- **EVK043027B 改跑 32-bit 色彩** — 使用 ARGB8888，而不是原廠 TouchGFX 範例的 packed RGB888，因為這是 LVGL 產品。`LV_COLOR_DEPTH 32`、ARGB8888 的 LTDC layer、`LV_COLOR_FORMAT_ARGB8888`，以及把 `FRAMEBUFFER` linker 區段從 768 KB 加大到 1024 KB 以容納兩個 510 KB 的 buffer。四者必須一致；其中 linker script 是會無聲失敗的那一個 —— 它不會拒絕建置，而是直接壓到 `.bss` 上

### 新增
- **EVK043027B 會自己驗證 LTDC** — `HAL_LTDC_Init` 與 `HAL_LTDC_ConfigLayer` 寫完暫存器就回傳 `HAL_OK`，完全不回讀，所以匯流排時脈關著時每一次寫入都被丟掉、兩者卻都回報成功。`HAL_LTDC_MspInit` 是 `void` callback，連 PLL3 失敗都無法回報。現在由 `ltdc_clock_ready` 把結果帶出來、`ltdc_is_configured` 回讀 `GCR`/`TWCR`/`CR`/`CFBAR`，再由 `ltdc_is_scanning` 盯 `CPSR` 證明**像素**時脈真的在跑 —— 那是與匯流排時脈不同、且其他檢查都看不見的一個時脈
- **EVK043027B 開機測試圖樣（預設關閉）** — 不經過 LVGL 直接寫進 frame buffer 的色條，加上背光由暗到亮的掃描。用來區分「顯示路徑整條死掉」與「LVGL 沒在畫」，以及「有背光但畫面全黑」與「背光根本沒亮」。用 `-DHMI_DISPLAY_BRINGUP_PATTERN_MS=10000` 打開；正常建置開機會直接進入 UI
- **EVK043027B 狀態 LED** — 主迴圈固定 1 Hz 心跳；進入 `board_error_handler` 時則重複閃 `board_init_stage` + 1 下。它是唯一不依賴面板、背光與切換式供電軌的輸出，因此不需要除錯器就能區分「韌體沒在跑」與「韌體在跑但顯示設定錯了」。見 [docs/zh-TW/edt-evk043027b.md](docs/zh-TW/edt-evk043027b.md) §7

### 修正
- **EVK043027B 根本沒跑過 `board_init` 的第一行** — STM32U5 的 PWR 周邊是被時脈閘控的（`RCC_AHB3ENR_PWREN`），時脈沒開時 `HAL_PWREx_ConfigSupply` 輪詢到的暫存器永遠讀成 0，於是回傳 `HAL_TIMEOUT`。開那個時脈是 `HAL_Init` 呼叫 `HAL_MspInit` 的工作，而 HAL 自己的版本是 weak 且空的；原廠套件把它放在 `stm32u5xx_hal_msp.c`，而本樣板漏了沒移植。結果時脈樹、OctoSPI、LTDC 與顯示流程全都沒跑到，唯一的徵兆就是面板全黑
- **EVK043027B 主迴圈會一次卡住好幾秒** — vendor 進來的 maXTouch 驅動在 I²C 收發兩邊都用 1000 ms timeout，而 LVGL 每約 30 ms 就輪詢一次輸入裝置，所以觸控控制器不在或沒回應時，卡住的不只是觸控，而是整個 HMI 迴圈。`board_display_init` 現在會先用 50 ms 的 `HAL_I2C_IsDeviceReady` 探測一次，沒回應就完全不向 LVGL 註冊輸入裝置，並把結果記在 `board_touch_ready`
- **EVK043027B 觸控控制器從來沒有真的被 reset 過** — `CTP_RST`（PH6）只是一直被拉高，所以熱開機時那顆 IC 根本沒經歷過 reset。現在改為先拉低再放開，並等待 datasheet 要求的啟動時間
- **EVK043027B 的錯誤閃爍碼數不出來** — spin loop 的常數大約快了八倍，把十二下的階段碼變成一片閃爍
- **EVK043027B 燒錄失敗於「Error: failed to erase memory」** — 這塊板子不再把圖片資源連結到外部 flash，因此不再依賴任何外部載入器。這個做法是從 STM32H747I-DISCO 樣板抄過來的，那塊板子只有 1 MB 內部 flash 所以非用不可；本板有 2 MB，韌體約 285 KB、一張滿版 480×272 背景圖 383 KB，圖片跟程式碼放在一起還綽綽有餘。NOR 顆粒仍在板上、也仍映射於 `0x90000000`，供真的塞不下的專案使用 —— 見 [docs/zh-TW/edt-evk043027b.md](docs/zh-TW/edt-evk043027b.md) §4，那裡記錄了為什麼 ST 的 `MX25LM51245G_STM32U599J-DK.stldr` 目前抹不掉它
- **EVK043027B 燒錄後面板全黑** — `backlight_init` 沒有呼叫 `HAL_TIM_MspPostInit`，導致 PE5 從未切換成 AF2/TIM3_CH3，背光驅動收不到任何 PWM。`HAL_TIM_MspPostInit` 是 CubeMX 的慣例而非 HAL callback，HAL 也沒有替它宣告原型，所以那個定義被當成死碼 link 掉，而每一個 HAL 呼叫仍然回報成功
- **`FS_PW_SW`（PI15）沒有拉高** — 原廠初始化在碰面板之前會先把這條切換式供電軌拉高；`panel_power_init` 現在也照做

### 變更
- **EVK043027B 的啟動失敗現在查得出來** — `board_init` 會把進度記在 `board_init_stage`；OctoSPI NOR 初始化失敗也不再是致命錯誤，改為把 `board_external_flash_ready` 設為 false，讓沒有用到圖片的專案照常執行，而不是讓面板全黑又講不出原因
- **Modbus RTU 可以走 RS-485** — EVK043027B 透過 USART2 驅動收發器，driver-enable 由硬體在 PD4 上控制，而不是接到 ST-LINK virtual COM port 的 UART。PC 端需要一顆 USB 轉 RS-485 轉換器才能連上；Communication 分頁與測試伺服器的用法不變

## [1.1.0] - 2026-02-11

### 新增
- **階層面板接入設計檢視** — HierarchyPanel 掛載到左側面板，與元件面板上下分欄，支援樹狀結構瀏覽、拖曳排序、重新命名、鎖定與可見性切換
- **樣式狀態編輯** — PropertyEditor 新增預設／按下／取得焦點／停用四種狀態切換，支援獨立的樣式覆寫與清除，並以藍色圓點標記已覆寫的狀態
- **預覽面板元件繪製補齊** — 新增 line、spinner、chart（折線／長條）、table、calendar、tabview、tileview、window、obj (container) 共 9 種元件的專用畫布繪製
- **畫布 visible/locked 視覺回饋** — 隱藏的元件以半透明加虛線邊框呈現；鎖定的元件不能拖曳或調整大小，並隱藏控制點
- **動畫編輯器** — Animation 型別定義、AnimationPanel 面板 UI（新增／編輯／刪除動畫）、AnimationEditDialog 編輯對話框，以及生成 `lv_anim_t` 初始化與 easing 對應
- **主題系統** — Theme 型別、themeStore（light/dark 預設）、ThemeSelector 工具列元件，以及生成 `lv_theme_default_init()`
- **圖片資源串接** — PropertyEditor 圖片選擇器附縮圖、畫布顯示實際圖片、生成的程式碼引用 C 陣列名稱、ZIP 匯出包含圖片 C 陣列檔案
- **字型轉換完善** — 真正解析 TTF/OTF name table、瀏覽器內字型預覽、BPP 選擇器、產生 `lv_font_conv` 指令、產生標頭檔與原始檔樣板，並在生成的程式碼中加入自訂字型的 `LV_FONT_DECLARE`
- **預覽面板動畫播放** — 以 requestAnimationFrame 模擬動畫（fade/slide/zoom 加 easing），並提供播放、暫停、重設控制
- **預覽面板多頁面切換** — 底部頁面標籤列、點擊切換預覽頁面，以及元件 navigate 事件的點擊導覽

### 修正
- **邏輯程式碼生成重寫** — if/else 與 switch 以遞迴方式生成完整的分支內容；init 函式註冊事件回呼與計時器；set_value 依元件類型選用正確的 API；計時器會生成實際的 `lv_timer_create` 回呼
- **程式碼生成補齊 focused/disabled 狀態** — ui.c 現在會輸出 `LV_STATE_FOCUSED` 與 `LV_STATE_DISABLED` 的樣式程式碼
- **將 logicGraphs 傳入 CodePreview/CodePanel** — 程式碼預覽與匯出現在會正確包含由邏輯圖生成的程式碼

## [1.0.0] - 2026-02-07 🎉 Production Ready

### 🎨 Phase 1 — 基礎框架
- **專案建置**：Vite + React 19 + TypeScript
- **基礎版面**：元件面板、畫布、屬性編輯器三欄式版面
- **元件面板**：16 種 LVGL 元件，分類顯示，可搜尋過濾
- **拖曳系統**：以 @dnd-kit 實作拖曳放置
- **畫布系統**：縮放（0.1x–3x）、平移、格線顯示
- **選取系統**：單選、Ctrl 多選、8 向調整大小控制點
- **屬性編輯器**：基本屬性、樣式屬性、元件特有屬性
- **狀態管理**：以 Zustand 集中管理
- **復原／重做**：50 步歷史記錄

### ✏️ Phase 2 — 進階編輯功能
- **元件巢狀**：可將元件放進容器內
- **框選功能**：以滑鼠拖出矩形選取多個元件
- **複製／貼上**：完整支援 Ctrl+C / Ctrl+V
- **剪下**：支援 Ctrl+X
- **全選**：Ctrl+A 選取目前頁面所有元件
- **快速複製**：Ctrl+D 複製並貼上
- **右鍵選單**：複製、貼上、刪除、疊放順序
- **對齊工具列**：
  - 靠左對齊、水平置中、靠右對齊
  - 靠上對齊、垂直置中、靠下對齊
  - 水平均分、垂直均分

### ⚡ Phase 3 — 事件綁定與多頁面
- **事件綁定系統**：
  - 視覺化事件編輯介面
  - 支援所有 LVGL 事件類型（clicked、pressed、value_changed 等）
  - 內建動作：導覽至頁面、設定屬性、顯示／隱藏、設定文字或數值
  - 自訂 C 處理函式（以 Monaco 編輯）
- **多頁面支援**：
  - 建立／刪除／重新命名頁面
  - 各頁面獨立的背景色
  - 快速切換頁面

### 🔗 Phase 4 — 邏輯編排器
- **整合 React Flow**：節點式視覺化程式設計介面
- **節點類型**：
  - 🟢 觸發節點：事件觸發、計時器觸發
  - 🟡 條件節點：If/Else、Switch、比較、邏輯運算
  - 🔵 動作節點：設定屬性、導覽、顯示／隱藏、設定文字、設定數值、呼叫函式、延遲
  - 🟣 資料節點：讀寫變數、數學運算、字串操作、取得屬性
  - ⚫ 自訂節點：C 程式碼區塊
- **連線系統**：執行流（白色粗線）＋資料流（彩色細線）
- **節點編輯**：雙擊編輯參數，附元件與屬性選擇器
- **變數管理**：全域變數面板，支援 int/float/string/bool
- **除錯模式**：模擬執行、單步除錯、節點高亮
- **邏輯圖管理**：建立／刪除／切換邏輯圖

### 💻 Phase 5 — 程式碼生成引擎
- **生成架構**：模組化生成器、樣板系統、格式化工具
- **產生的檔案**：
  - `ui.h` — 標頭檔（元件宣告、函式宣告）
  - `ui.c` — UI 初始化（建立元件、設定樣式、綁定事件）
  - `ui_events.h` — 事件處理函式宣告
  - `ui_events.c` — 事件處理函式實作
  - `ui_logic.h` — 邏輯函式宣告（預留）
  - `ui_logic.c` — 邏輯函式實作（預留）
- **程式碼預覽面板**：整合 Monaco Editor，可切換檔案，即時更新
- **程式碼匯出**：複製單一檔案、下載單一檔案、批次下載

### 📱 Phase 6 — 即時預覽
- **畫布模擬繪製**：以 HTML5 Canvas 模擬 LVGL 元件外觀
- **支援的元件**：按鈕、標籤、滑桿、核取方塊、切換開關、進度條、弧形、文字方塊、下拉選單、圖片、面板
- **縮放控制**：50% – 200%
- **停留互動**：滑鼠停留時元件高亮

### 📦 Phase 7 — 資源管理
- **圖片管理**：上傳、預覽、刪除圖片資源
- **字型管理**：字型資源管理
- **圖示庫**：內建圖示選擇
- **專案管理**：
  - 以 JSON 格式儲存／載入
  - 自動儲存（每 30 秒）
  - 啟動時詢問是否還原

### 🎯 Phase 8 — 最終打磨
- **UI/UX 優化**：
  - 主分頁導覽（設計／邏輯／程式碼／預覽）
  - 快捷鍵說明面板（F1 / ?）
  - Toast 通知系統
  - 統一的視覺風格
- **文件完善**：更新 README 與 CHANGELOG
- **建置驗證**：TypeScript 編譯無錯誤，正式建置成功

### 修正
- 修正拖曳元件時的位置計算問題
- 修正復原／重做在多頁面情境下的問題
- 修正框選在縮放畫布時的座標計算

---

## [0.1.0] - 2026-02-07（初始開發）

### 新增
- 專案初始化
- 基礎框架建置

---

## 統計

- **總檔案數**：67 個原始檔（29 TSX + 38 TS）
- **模組數**：17 個 UI 元件模組
- **LVGL 元件**：16 種
- **程式碼行數**：約 8000+ 行

## 已知限制

1. 邏輯編排器到 C 程式碼的完整轉換尚未實作
2. 圖片資源在預覽面板顯示為佔位圖
3. 部分進階 LVGL 樣式屬性尚未支援
4. 動畫編輯器尚未實作

## 未來計畫

- [ ] 邏輯圖的完整程式碼生成
- [ ] 主題系統
- [ ] 動畫編輯器
- [ ] 支援更多 LVGL 元件
- [ ] 協作功能
