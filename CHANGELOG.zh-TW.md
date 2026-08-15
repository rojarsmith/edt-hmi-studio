# 更新日誌

<p align="center">
  <a href="./CHANGELOG.md">English</a> · <strong>繁體中文</strong>
</p>

本專案所有值得記錄的變更都會寫在這個檔案裡。

格式依循 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，版本編號依循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### 變更
- **Font Properties 把作者要的和工廠要的分開** —— 普通模式下選取字型顯示中繼資料、名稱、實際渲染預覽，以及對所有人都要緊的警告：檔案畫不出來的字、和字元掃描看不到的自訂 C。轉檔機制 —— C 變數名、Auto/Preset/Manual 字元集模式、額外字元與範圍、涵蓋總數、BPP 與產生按鈕 —— 收進 Factory Dev Mode，掛在有標示的分隔線之下；Auto 自己安靜做事，不需要照顧。面板同時不再雙重捲動：舊的內層 500px 灰盒拿掉了，改由窗格本身捲動
- **Fonts 分頁改成 Typographies 的形狀：左側樹狀、右側屬性** —— 三個固定群組、可收合：*Built-in*（Montserrat，編在 LVGL 裡 —— 選取它會說明為什麼沒有東西可轉檔或刪除）、*Bundled*（四款 Noto 全列，不管加了沒有；還沒加的那一列帶 **+ Add**，加入後留在原群組而不是搬走）、*Project fonts*（作者自己上傳的）。搜尋、上傳、刪除都在樹上；搜尋過濾每一個群組。Typographies 的字型下拉選單改為同樣的三組，兩個介面的「Built-in」從此指同一件事 —— 編在 LVGL 裡 —— 而不是一邊指這個、另一邊指「隨產品出貨」。隨附字型並改為預設存在：每個專案開啟時自動擁有四款 Noto，沒有 + Add 也沒有刪除，因為沒被使用的字型毫無代價 —— 不宣告、不轉檔、存檔也只存參照 —— 而刪掉的下次開啟又會回來。+ Add 只保留為 payload 載入失敗時的降級狀態舊版是「未加入的隨附字型橫幅」加「其他全部的卡片牆」，正是 Typographies 字型下拉以前那個選項搬家的問題
- **Typographies 分頁改成樹狀，每個 typography 有 Default 加上逐語系分頁** —— TouchGFX 的形狀，一次解決兩件事。三十個字級的專案是一份沒人掃得完的平面清單，所以 typography 現在可以放進群組，最多兩層、可拖拉搬移，和畫面管理一樣。另外 *Base font* 這個概念拿掉了：typography 自己的設定**就是** Default，語系分頁只存「它改了什麼」，沒點名的部分一律繼續來自 Default —— 於是給繁體一個中文字體是一個欄位，而不是把整個樣式重述一遍，而改 Default 仍然會傳到所有沒有覆寫的語系。語系現在除了字體，也能覆寫字距、行距、對齊、裝飾與方向，產生的程式碼會在語系切換時只重新套用這些，並在離開時還原成 Default。Name 標籤改為 Id，因為它是產生的樣式命名的依據，不是描述。刻意不提供：Fallback Characters、Ellipsis Character 與 Bitmap/Vector 開關 —— LVGL 在這三處做得到與做不到什麼，見 [docs/text-typography-evaluation.md](docs/text-typography-evaluation.md) §7.1–7.3；`fallbackCharacter` 欄位先存起來，等 wildcard 讓它真正有意義的那天
- **Deploy 分頁的配置面板改以位址區間呈現** —— 從 *Image Placement* 更名為 *Asset Placement*，把轉換後的字型與圖片並列，每一項給出起始與結束位址，而不是位址加大小。這個面板要回答的問題是「這個資產是不是從頭到尾都在 QSPI 視窗裡」，兩端直接回答了它；起點與終點落在不同區域的區間現在會明講，而不是只報起點。字型那一列還會帶上字數與平均每字位元組，從實際編譯的那個檔案的 `glyph_dsc[]` 數出來 —— 光看大小無法分辨一個字型大是因為收的字多，還是因為每個字都很貴
- **Typographies 分頁的字型與大小拆成兩個欄位，不再是一個下拉選單** —— 綁在一起等於一份清單同時承載兩個選擇，想選 24px 得先捲過所有字型，同一個字型的兩個尺寸看起來像兩個字型。Font 現在只列字型家族（Montserrat 出現一次，不是 21 次），Size 改成直接輸入。內建字型只有特定尺寸，所以會吸附到最近的一個並明講
- **內建的隨附字型可以直接在 Typographies 的字型清單選** —— 不管專案有沒有加過，Noto Sans JP 與 KR 都會出現在「Bundled — added on selection」群組，選下去就會自動加入。以前要 CJK 字型得先繞去 Fonts 分頁再繞回來
- **元件層級不再有字型設定** —— 屬性編輯器只設定 Typography。在單一元件上設定的字體與大小，對其他應該一致的元件是看不見的，而且只有 Typography 能帶各語系字型。「＋ New typography from this widget」仍然會用元件目前的設定當種子，那就是舊專案搬過來的路徑；既有的元件層級設定也照舊會產生程式碼
- **文字 key 改為不分大小寫唯一** —— `newText` 和 `newtext` 以前是兩列，而自動推導的 key 是小寫的，所以把顯示 "newText" 的元件連結起來，就會在手寫的那一列旁邊生出第二列。一筆有翻譯一筆沒有，在表格裡完全分不出來。現在改名會被拒絕並告訴你和哪個 key 撞到，自動推導也會跳過只差大小寫的那個
- **EVK043027B 的 Modbus RTU 改走 Type-C USB 虛擬 COM port**，不再走 RS-485。這塊板子沒有 ST-LINK VCP（它是用外掛探針燒錄的），但它自己有 USB device 周邊，所以 Type-C 埠會以 VID 0x0483 / PID 0x5740 列舉成 `USB Serial Device (COMxx)`，Windows 直接綁內建的 `usbser.sys`。不需轉換器也不需驅動：插上、在 Communication 分頁選那個 port、跑測試伺服器。ST 的 USB Device Library 由 `bootstrap-deps.ps1` 抓取；描述符、低層黏合與帶 ring buffer 的 CDC 傳輸層則在 `src/`。RS-485 收發器還在板上，`board_uart1_apply` 也還會正確設定它，只是沒人呼叫 —— 見 [docs/zh-TW/edt-evk043027b.md](docs/zh-TW/edt-evk043027b.md) §5
- **Modbus 的時間設定在 USB 上仍然有意義** —— USB 傳輸沒有 baud rate，所以 Protocol 分頁的那個值改用來推導 RTU 幀間靜默時間，而不是被忽略。Parity 與 stop bits 依 CDC 規定記錄並回報給主機，除此之外不作用

### 新增
- **Label 有了真正的刪節號 —— Long Text Mode 新增「Ellipsis (…)」** —— LVGL 的 DOTS 模式寫死三個 ASCII 句點（`lv_label.c` 的 `LV_LABEL_DOT_NUM`，連設定選項都不是），所以 TouchGFX 那個單一 U+2026 意味著截斷得自己做：CLIP 模式加上產生的輔助函式，用 `lv_text_get_size` 量測、保留「接上刪節號後仍放得下」的最長前綴，且只在 UTF-8 邊界切。連結到文字資源的刪節號 label 刻意不帶翻譯 tag —— label 自己的 tag 處理會在每次切換語系時用全文蓋掉截斷 —— 所以產生的 callback 接管文字、自行重新解析 tag，在語系切換與改變大小時重新截斷。U+2026 會自動收進該 label 的字型，否則收尾那個字元本身就是缺字方塊。畫布用瀏覽器原生的單行刪節號預覽，同一個字元。舊的 `dot` 選項改為誠實的「Dots (...)」。已用 Cortex-M7 在 `-Wall -Wextra -Werror` 下驗證編譯乾淨
- **Wildcard，以及真的會渲染的 Fallback 字元** —— Modbus 字串或格式化數字是執行期才出現的，裁剪字元集的掃描看不見它們，所以 typography 現在可以宣告 Wildcard Characters 與 Wildcard Ranges（範圍兩端是單一字元或 `0x` 十六進位 —— `0-9` 指的是數字，因為 code point 0–9 是九個控制字元）。宣告會被轉進這個 typography 解析得到的每一個字型、每一個語系；範圍以 `--range` 原樣傳遞而不展開，因為一個中日韓區塊是數萬字元，Windows 的命令列在 32k 截斷。Fallback 字元搭同一班車：產生的程式碼在 LVGL 的 `lv_font_t.fallback` 鏈尾端接上一個代換字型，它的 `get_glyph_dsc` 對任何字都回答宣告的那個字元，且共用來源字型的表，所以會以正確的字體和字級渲染 —— 已用 Cortex-M7 在 `-Wall -Wextra -Werror` 下驗證編譯乾淨。Label 與 Button 在畫布上預覽完整解析後的 typography —— 字距、對齊、裝飾、逐語系 —— 而當 typography 接管時，元件層級的 Text Alignment 列會隱藏，因為物件層級樣式會無聲壓過共用樣式
- **STM32H747I-DISCO 上字型字圖改連結到外部 flash** —— 轉出來的 CJK 子集是這份韌體連結的東西裡最大的一個，1 MB 內部 flash 在放完程式碼之後沒有位置容納它。每個轉換後的字型會把 `LV_ATTRIBUTE_LARGE_CONST`（LVGL 自己掛在那個陣列上的鉤子）重新定義成 `.ext_flash_fonts` section，由 linker script 放進 QSPI NOR；描述元、cmap 與 `lv_font_t` 留在內部 flash，因為它們很小、而且每次查字都會讀到。以 `HMI_FONTS_IN_EXTERNAL_FLASH` 包住，只有真的有地方放的板子才定義，所以同一份轉換結果仍可供 WASM 預覽與沒有外部 flash 的板子使用。已用 ARM 工具鏈驗證：一份 14px Noto Sans TC 子集切成 `.ext_flash_fonts` 0x148 / `.rodata` 0xcc，同一個檔不加定義則是 `.rodata` 0x214
- **Noto Sans SC 也隨編輯器出貨**，且四款 Noto 字型現在都列在 Typographies 字型下拉選單的 *Built-in* 之下 —— 同一個標題、不管專案加過沒有都在同一個位置，*Project fonts* 則留給作者自己上傳的字型。先前的分法會讓同一個字型因為「用過了沒」而出現在不同標題下，那是編輯器的內部記帳，不是作者做過的選擇。Montserrat 雖與它們並列，本質仍不同：編進 LVGL、不需轉檔、只有 `lv_conf.h` 打開的那幾個尺寸
- **Noto Sans TC 隨編輯器出貨** —— 繁體中文是這些板子的主要市場，卻是唯一沒有隨附字型的語系，於是專案切到繁體就是一整排缺字方塊，而且字型下拉選單裡沒有任何能解決它的選項。`NotoSansTC-Regular.otf`，OFL-1.1，來源與已隨附的 JP、KR 完全相同（`notofonts/noto-cjk` 的 `Sans/SubsetOTF`）。它走同一套 auto 字元集裁剪進 Flash，所以一套 UI 的中文只佔數十 KB，而不是整套字型的 5.4 MB
- **元件改用 key 從下拉選單挑選要顯示的文字** —— 屬性編輯器新增 Key 欄位，列出文字表的每一列，綁定元件變成「選一個」而不是「反覆改字面文字直到剛好對上既有的列」。選定 key 後元件的字面文字會更新成它現在顯示的字，那正是解除連結與刪除時的退路
- **文字資源可以指定它的 Typography** —— Texts 分頁新增 Typography 欄，即 TouchGFX 的 TypedText → Typography 配對。在這裡設定會蓋過元件自己的指定，於是需要特定字體的文字會把字體帶到它出現的每個地方，而不是只帶到有人記得設定的地方。畫布、屬性編輯器與 `ui.c` 都走同一條解析規則，所以預覽就是產生的程式碼
- **「切換語系」成為內建事件動作** —— 執行中的 UI 上的按鈕現在可以直接切換語系，在此之前這需要在自訂處理常式裡手寫 C。可以指定語系（`lv_translation_set_language("zh-TW")`），也可以選「next language」在專案語系之間循環並繞回第一個；循環用的輔助函式在 `ui_events.c` 只產生一份，不管有幾個按鈕用到它。除此之外不產生任何東西，因為不需要 —— label 會自己重讀文字，而 `ui.c` 早已為不會自己重讀的元件註冊了 callback。有兩種情況刻意不產生程式碼，而不是產生半殘的東西：專案已經沒有的語系代碼，以及只有一個語系時的循環切換。詳見 [docs/zh-TW/language-switching.md](docs/zh-TW/language-switching.md)，其中也說明畫布 🌐 預覽、Build & Run 與硬體各自涵蓋與涵蓋不到什麼
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
- **選到韌體沒有編進去的 Montserrat 尺寸會讓編譯失敗** —— Typographies 分頁提供 LVGL 出貨的全部 21 種尺寸，但每個目標的 `lv_conf.h` 只打開 12、14、16、20、24、28、32。選其他尺寸會產生一個根本不存在的符號參照，在整包 LVGL 編到第 540 個檔案左右才以 `'lv_font_montserrat_22' undeclared` 失敗。可選集合現在來自單一常數，尺寸會吸附到它（平手時往上），已經存有無法編譯尺寸的專案在開啟時會被吸附。另有測試會讀取四個 `lv_conf.h` 檔案，只要它們和常數不一致就失敗 —— 如 [docs/lvgl-configuration.md](docs/lvgl-configuration.md) 所述，它們並非由彼此產生。`wasm/lv_conf.h` 補上 Montserrat 12，讓 WASM 預覽與板子提供相同集合
- **兩個同名的邏輯圖會讓韌體編譯失敗** —— 兩者產生同名的函式，而重複定義要等到整包 LVGL 編完才會以 `error: redefinition of 'logic_new_logic_graph'` 現形。新增時連按兩次接受「New Logic Graph」預設名稱就會踩到。產生器現在會給每個邏輯圖一個唯一的 C 名稱 —— 第一個維持原本的名字，之後撞名的加數字後綴 —— 且 `ui_logic.h` 與 `ui_logic.c` 都由同一支共用函式推導，宣告不可能和定義對不上。編輯器也不再建議一個已經有人用的名字
- **所有導覽事件都被列成「Navigate to: Not set」** — 事件面板讀的是改名前的 `targetPage`，而編輯器自改名之後寫的是 `targetScreen`。產生的程式碼一直都是對的，錯的只有清單裡那一行摘要。現在兩種寫法都能顯示，改名之前存的專案也讀得出來
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
