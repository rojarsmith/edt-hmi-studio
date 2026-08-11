# EDT EVK043027B

<p align="center">
  <a href="../edt-evk043027b.md">English</a> · <strong>繁體中文</strong>
</p>

> **狀態。** 可以建置、燒錄、開機。**面板目前還點不亮** —— 原因尚未確定，
> §7 就是找出原因的流程。建置、燒錄與記憶體配置都已驗證；燒錄器之後的部分尚未。

EVK043027B 是 EDT EVKxxxx27B 系列中 4.3 吋的那一款，MCU 為 STM32U599NJH6Q。
它是第一款不是 ST Discovery 套件的支援板，而這個差異體現在三件事上：怎麼燒錄、
怎麼接到 PC、以及驅動從哪裡來。

## 1. 這塊板子是什麼

| 項目 | 值 |
| --- | --- |
| MCU | STM32U599NJH6Q，Cortex-M33 @ 160 MHz |
| 內部 Flash | 2 MB —— 兩個 bank 中的 bank 1，見 §3 |
| SRAM | 從 `0x20000000` 起連續 2496 KB |
| 顯示 | 480 × 272 並列 RGB，由 LTDC 驅動 |
| 色彩 | ARGB8888，32 bpp —— 見 [color-depth.md](./color-depth.md) |
| Frame buffer | 兩個，各 510 KB，位於內部 SRAM `0x20000000` |
| 觸控 | Atmel maXTouch MXT336U，掛在 I²C2（PH4/PH5） |
| 背光 | TIM3 CH3 PWM，PE5，約 320 Hz |
| 外部 Flash | Macronix MX25LM51245G，64 MB，OCTOSPI1，映射於 `0x90000000` —— 有映射但未使用，見 §4 |
| Modbus 線路 | **Type-C 上的 USB CDC** —— 虛擬 COM port，見 §5 |
| 燒錄 | SWD 排針上的**獨立 ST-LINK/V2** |

## 2. 兩條線

這是跟 Discovery 板差最多的地方 —— 那些板子一條 USB 線就全包了。

**燒錄**走插在板子 SWD 排針上的獨立 ST-LINK/V2。那顆探針根本不知道自己接在
什麼板子上，所以不會回報板名 —— Windows 裝置管理員顯示為 `STM32 STLink`，
`STM32_Programmer_CLI -l st-link-only` 的 `Board Name` 欄位是空的。

編輯器的板子辨識機制已經處理了這點。`src/types/hmi.ts` 裡這塊板子的
`probeBoardPattern` 是 `null`，燒錄前改為先連線一次（不寫入任何東西），比對回報的
**device ID** 是否為 `0x481`（STM32U59x/5Ax）。這無法分辨本板與另一個同樣用
STM32U599 的設計，也不宣稱做得到；它擋下的是替 F746 或 H747 建置的映像被燒到
這裡 —— 那種情況下錯誤的 flash 大小與錯誤的外部載入器會造成實質損害。

**USB Type-C 埠**會列舉成 `USB Serial Device (COMxx)`，也就是 MCU 自己的 USB
CDC（`STM32 Virtual ComPort`）。**HMI runtime 不使用它。** 那是原廠展示韌體的
除錯主控台，燒進本韌體之後這個埠根本不會再出現。請不要在 Communication 分頁
選它。

## 3. 只用 Flash 的 bank 1

STM32U599NJ 有 4 MB flash，分成兩個 2 MB 的 bank。本樣板只連結進 bank 1：
`STM32U599NJHXQ_FLASH.ld` 宣告 `FLASH : ORIGIN = 0x08000000, LENGTH = 2048K`，
bank 2 維持抹除狀態，不在映像內。原廠套件自己的 linker script 也是這樣做的。

這裡也不需要那些空間 —— 一個含滿版圖片的專案，連圖片在內大約用掉 484 KB（§4）。
要納入 bank 2，就得決定那裡該放什麼，並教燒錄器去燒第二個區域，而目前沒有任何
東西需要這個儲存空間。

`server/hmi/imageLayout.ts` 把 `0x08000000`–`0x081FFFFF` 歸類為內部 flash，
正好就是 bank 1，所以 Image Placement 檢視不用改就能正確呈現這塊板子。

## 4. 圖片留在內部 flash

與 STM32H747I-DISCO 不同，**這塊板子不把圖片資源放到外部 flash**，
`CMakeLists.txt` 裡也沒有定義 `HMI_IMAGES_IN_EXTERNAL_FLASH`。

H747I 是沒得選：內部 flash 只有 1 MB，韌體就佔掉約 285 KB，而一張 800×480
的 ARGB8888 背景圖就要 1500 KB。這裡的數字差得很遠：

| | 內部 flash | 韌體 | 一張滿版背景圖 |
| --- | --- | --- | --- |
| STM32H747I-DISCO | 1 MB | 約 285 KB | 1500 KB —— 放不下 |
| EDT EVK043027B | **2 MB** | 約 285 KB | **510 KB**（480×272×4） |

一個含滿版圖片的專案建置出來約 484 KB，佔 bank 1 的 23%，再放好幾張都還有空間。
在這裡動用外部 flash 什麼好處都沒有，卻會讓每一次燒錄都依賴外部載入器。

NOR 顆粒仍然在板上，`board_external_flash_init` 也照樣把它映射到
`0x90000000`，所以真的塞不下內部 flash 的專案還有地方可去。要改用它必須同時動
兩處：`src/types/hmi.ts` 板子定義裡的 `externalFlash`，以及 `CMakeLists.txt`
裡的 `HMI_IMAGES_IN_EXTERNAL_FLASH`。改完之後
[images-external-flash.md](./images-external-flash.md) 就完全適用。

**但在那之前，得先解決載入器的問題。** 隨 CubeProgrammer 附的
`MX25LM51245G_STM32U599J-DK.stldr` 是最直覺的人選，而它在這塊板子上不能用：

```
Erasing external memory sectors [0 2]
Error: failed to erase memory
```

已經排除的可能：原廠 EVK 套件 `STM32CubeIDE/` 底下那一份與 CubeProgrammer 的
**位元組完全相同**（MD5 一致），所以不是檔案舊了的問題。反組譯該載入器可以看到
它參考的是 GPIOA、GPIOC、GPIOF —— 正是本板 OctoSPI 用的那幾個 port；它也確實帶有
`MX25LM51245G_ResetEnable` / `ResetMemory` / `OSPI_NOR_ExitOPIMode`，所以也不是
被前一次執行殘留的 octal SOPI 模式卡住。兩塊板子之間真正不同、也是目前最可疑的，
是載入器自己設定的時脈：本板跑的是 25 MHz HSE **bypass**（外部振盪器而非石英），
而 DK 不是這樣接的。

把 NOR 從我們自己的韌體叫起來是比較繁瑣的部分，`firmware/edt-evk043027b/src/board.c`
的 `board_external_flash_init` 在每一步都寫明了原因。簡單說：顆粒開機時是 1-1-1
SPI，必須在它可能已經處於的三種協定下各重設一次，接著在切到 octal STR 模式
**之前**先告訴它 dummy cycle 數，最後才做記憶體映射。在那之前讀取只會得到
bus fault，不是資料。

## 5. Modbus RTU 走 USB 虛擬 COM port

Discovery 板的 Modbus 走的是接到板載 ST-LINK virtual COM port 的 UART，所以 PC
直接就看得到。這塊板子沒有這條路：它的 ST-LINK 是外掛的探針。但它自己有 USB
device 周邊，所以 **Type-C 埠就是那個虛擬 COM port**，Modbus 也走它。

因此流程與 Discovery 板完全一樣：插上 Type-C 線、在 Communication 分頁選那個
port、在上面跑 `tools\modbus-rtu-test-server.ps1`。不需要轉換器，也不需要驅動程式。

| | 值 |
| --- | --- |
| 周邊 | USB_OTG_HS，內建 HS PHY，PA11/PA12 = D-/D+ |
| 識別 | VID 0x0483、PID 0x5740、`STM32 Virtual ComPort` |
| Windows 驅動 | 內建的 `usbser.sys`，靠這組 VID/PID 綁定 |
| 顯示為 | `USB Serial Device (COMxx)` |

`HAL_PCD_MspInit` 裡有三件事少一件就熟不了，而且在這份韌體別處都找不到對應物：
PHY 需要自己的 kernel clock **以及**一個 reference clock 選擇；VDDUSB 是一個獨立的
供電域，沒開之前讀起來就像死的；HS 收發器另外還有它自己的供電與一個 SYSCFG
enable。這些都是從原廠套件搬過來的。

### USB 傳輸沒有的東西

**沒有 baud rate。** 主機會用 `SET_LINE_CODING` 設一個，但線上根本沒人理它 ——
資料是以 USB transfer、用 USB 自己的節奏在跑。Protocol 分頁的 baud rate 仍然有用，
它是推導 RTU **幀間靜默時間**的那個數字，所以它還是一個真的設定，而不是死控件。
Parity 與 stop bits 會被記下來、回報給主機，除此之外忽略。

**沒有逐 byte 的中斷。** UART 是一次給一個 byte；USB 是整包給，而一個回應可能一包
就到、也可能分幾包。所以 `hmi_usb_cdc.c` 把收到的 byte 排進 ring buffer，再由
`modbus_rtu_async_poll` 去拿。client 的分幀邏輯 —— 算出回應應該有幾個 byte、然後核
CRC —— 跟 UART 板子完全一樣，這也是為什麼 `consume_rx_byte` 跟他們的
`HAL_UART_RxCpltCallback` 是逐行對應的。

**沒有 back pressure。** 一個 frame 要麼送出去、要麼沒有，不存在只送一半。
前一個 frame 還在飛的時候 `hmi_usb_cdc_write` 會拒絕，client 就當成 I/O 錯誤重試。

面板不需要主機也能跑。什麼都沒插的時候，`board_usb_ready` 依舊是 true、HMI 正常
運作，Modbus 交易則會逐筆逾時 —— 跟一條對端沒接東西的 RS-485 彙流排行為完全一樣。

### RS-485 收發器

還在板上，接在 USART2、driver-enable 在 PD4，只是這份韌體已經不再驅動它。
`board.c` 裡的 `board_uart1_apply` 還在，也仍然會透過 `HAL_RS485Ex_Init` 正確地
設定它，只是沒有人呼叫。如果哪個專案需要的是現場彙流排而不是 PC 連線，
要接回去的就是那個函式與 `modbus_rtu_async_client.c` 開頭那幾個傳輸原語 ——
本次變更之前的 git 歷史裡就是接好的狀態。

## 6. 驅動從哪裡來

這塊板子沒有對應的 `stm32XXX-disco-bsp` repository，所以
`scripts/bootstrap-deps.ps1` 比 Discovery 板的短很多。它只抓真正屬於上游的東西：

| 相依 | 版本 | 為什麼是這個版本 |
| --- | --- | --- |
| STM32U5 HAL | v1.6.2 | 原廠 EVK 套件所附的版本 |
| CMSIS Device U5 | v1.4.2 | 原廠 EVK 套件所附的版本 |
| CMSIS Core | v5.6.0 | 第一個含 `core_cm33.h` 的版本；其他板子用的 v5.4.0 沒有 Armv8-M 標頭 |
| LVGL | v9.5.0 | 與其他所有板子相同 |

面板、觸控與 NOR 的驅動原封不動放在
`firmware/edt-evk043027b/vendor/`，好讓韌體部門日後給的新版可以整個目錄換掉。
`vendor/README.md` 說明了規則；簡單講，`include/main.h` 是原廠 CubeMX 式期待與
本 runtime 之間的接縫，要改就改那裡，不要動被 vendor 進來的檔案。

`edt_bsp_lcd.c` 刻意**沒有** vendor 進來 —— 它跑的是一個 FreeRTOS task，在閒置
逾時後把面板關掉，而本 runtime 沒有排程器。觸控驅動實際上只用到它其中四個函式，
由 `src/board_display.c` 提供。

## 7. 首次上機：依序檢查什麼

**先看 PB14 上的 LED。** 它是唯一不依賴面板、背光或那條切換式供電軌的輸出，
因此也是唯一能區分「韌體根本沒在跑」與「韌體在跑但顯示設定錯了」的東西 ——
不需要除錯器：

| LED 的行為 | 代表什麼 |
| --- | --- |
| **穩定 1 Hz 閃爍** | 主迴圈正在轉。韌體沒問題，問題在面板、背光或 LTDC —— 跳到第 1 點 |
| **重複閃 N 下的爆發** | 進了 `board_error_handler`。數閃爍次數：N = `board_init_stage` + 1，所以閃 1 下是 `BOARD_STAGE_RESET`，閃 5 下是 `BOARD_STAGE_CACHE`，依此類推 |
| **完全不亮** | 根本沒跑到 `main`。先懷疑燒錄本身、option bytes，或是在 LED 被初始化之前的時脈／電源設定 |

第三種情況值得優先排除，因為下面所有步驟都預設韌體有在跑。

有除錯器的話，`board_init_stage` 就是同一份資訊。停住核心後 `p board_init_stage`：

| 閃爍次數 | 值 | 意義 |
| --- | --- | --- |
| 1 | `_RESET` | 根本沒離開 reset |
| **2** | `_HAL` | **`HAL_PWREx_ConfigSupply` 失敗 —— 見下** |
| 3–4 | `_POWER`、`_CLOCK` | 供電已切換，但 160 MHz PLL 失敗 |
| 5 | `_CACHE` | 已到 cache；若停在這裡表示讀取圖片時 fault |
| 6–8 | `_EXTERNAL_FLASH`、`_TOUCH_BUS`、`_UART` | 與顯示無關的硬體都過了 |
| 9 | `_PANEL_POWER` | 面板致能腳與供電軌都已驅動 |
| 10 | `_LTDC_CLOCK` | PLL3 設定完成，LTDC **匯流排**時脈已開 |
| 11 | `_LTDC_CONFIG` | LTDC 暫存器回讀值與寫入值相符 |
| 12 | `_LTDC` | **已確認光柵正在掃描** —— 像素時脈是真的 |
| 13–14 | `_BACKLIGHT`、`_TOUCH` | 背光 PWM 在跑、maXTouch 有回應 |
| 15 | `_DISPLAY` | LVGL 已綁上 display |
| 16 | `_RUNNING` | 已在主迴圈中 |

**閃兩下代表 PWR 這顆周邊沒有時脈。** 在 STM32U5 上，PWR 是由
`RCC_AHB3ENR_PWREN` 閘控的；那個時脈關著的時候，所有對 PWR 暫存器的寫入都會被丟掉、
所有讀取都回 0，於是 `HAL_PWREx_ConfigSupply` 會一直去輪詢 `PWR->SVMSR` 裡一個
永遠不會變的位元，最後回傳 `HAL_TIMEOUT`。`board_init` 就停在第一步 ——
時脈樹、OctoSPI、整個顯示流程通通沒跑到，而對外唯一的徵兆就是面板全黑。

除非板子自己補上，否則沒有人會去開那個時脈：`HAL_Init` 會呼叫 `HAL_MspInit`，
而它在 **HAL 裡是 weak 且空的**。原廠套件把它放在 `stm32u5xx_hal_msp.c`，
而 `src/board.c` 裡的 `HAL_MspInit` 就是那個檔案的移植版。它只有三行、沒有別的用途，
但少了它，這塊板子上什麼都不會動。

之所以要有第 10 到 12 這三個階段，一是因為這裡的 HAL 同樣不可信任，二是因為 LTDC
有兩個會各自獨立失敗的時脈。

`HAL_LTDC_Init` 與 `HAL_LTDC_ConfigLayer` 寫完暫存器就回傳 `HAL_OK`，完全不回讀，
所以**在匯流排時脈關閉的情況下每一次寫入都被丟掉，兩者卻依然回報成功** ——
結果就是面板全黑，而沿路沒有任何一處報錯。`HAL_LTDC_MspInit` 又是 `void`
callback，也無法回報 PLL3 失敗。因此改由 `ltdc_clock_ready` 手動把結果帶出來，
再由 `ltdc_is_configured` 重新讀 `GCR`、`TWCR`、layer 的 `CR` 與 `CFBAR`，
要求控制器自己證明它真的吃下了設定。

但這樣還不夠，這正是第 12 階段存在的理由。上面每一個暫存器都掛在**匯流排**時脈上，
而面板是由 PLL3R 來的**像素**時脈驅動的。像素時脈停掉時，控制器照樣接受並回傳每一次
寫入、照樣回讀成 enabled、照樣指向正確的 frame buffer，但接頭上完全沒有 DCLK、
沒有 HSYNC、也沒有 DE。這兩種狀態從暫存器那一側看完全一樣。`ltdc_is_scanning`
因此去盯 `CPSR`（光柵目前位置），它只有在像素時脈實際運轉時才會前進。

**所以一個能走到第 12 階段的映像，是真的在驅動面板。** 如果走到了、螢幕還是黑的，
就不必再看 LTDC 了。

接著依序：

1. **先把色條打開。** 用 `-DHMI_DISPLAY_BRINGUP_PATTERN_MS=10000` 重新建置 ——
   它**預設是關閉的**，所以正常建置開機後會直接進入 UI。打開後
   `board_display_init` 會把紅／綠／藍／白四條色條**不經過 LVGL**直接畫進
   frame buffer，並停留指定的時間才交棒。這是這塊板子上最有用的一個測試，
   因為它把顯示路徑一刀切成兩半：

   | 你看到什麼 | 代表什麼 |
   | --- | --- |
   | 色條正確，接著出現 UI | LVGL 以下全部正常 |
   | 色條正確，接著一片黑 | LTDC、面板、背光都沒問題；問題在 LVGL 或 `display_flush` |
   | 顏色不對或順序不對 | 像素格式不一致 —— 見第 2 點 |
   | 什麼都沒有 | 問題在 LVGL 以下：背光、面板致能腳或 LTDC。這時候完全不必去看 UI |

   在色條停留之前，背光會先**由暗到亮再到暗來回三次**，約 1.3 秒。這是因為
   「有背光但畫面全黑」與「背光根本沒亮」隔一段距離看幾乎一模一樣，而這正是
   「沒畫面」難以下手的根源：

   | 那 1.3 秒期間 | 代表什麼 |
   | --- | --- |
   | 面板明顯有亮度變化 | PE5、TIM3 與背光驅動都正常 —— 問題在 LTDC 資料路徑或面板本身的供電 |
   | 完全沒有變化 | 問題就是背光或面板電源。檢查 LCD_CTRL（PH13）、LCD_RESET（PH15）與切換式供電軌 FS_PW_SW（PI15），再用示波器量 PE5 |

   色條與背光掃描共用同一個開關，正常建置下兩者都是關的 —— 它們是為了這個系列的
   下一片面板而留的，不是給出貨韌體用的。

   這裡有個已經踩過一次的坑，而且完全沒有徵兆。把 PE5 設成 AF2 的
   `HAL_TIM_MspPostInit` **是 CubeMX 的慣例，不是 HAL 的 callback**。HAL 裡沒有
   任何地方會呼叫它；是產生出來的 `MX_TIM3_Init` 明確去呼叫的，而
   `board_display.c` 的 `backlight_init` 也必須照做。少了那一行，HAL 每一步都
   回報成功、LVGL 照常繪製、LTDC 照常掃描，但面板就是全黑 —— 因為 PE5 從未離開
   reset 狀態，背光驅動一個 PWM 邊緣都沒收到。HAL 也沒有替它宣告原型，所以那個
   定義只會變成 linker 丟掉的死碼。用
   `arm-none-eabi-nm firmware.elf | grep MspPostInit` 一行就能確認它有進到映像裡。
2. **形狀對但顏色不對，或每一行歪掉幾分之一個像素？** 那就是
   `LTDC_PIXEL_FORMAT_ARGB8888`、`LV_COLOR_DEPTH 32`、`LV_COLOR_FORMAT_ARGB8888`
   與 `HMI_DISPLAY_BYTES_PER_PIXEL` 之間不一致了。四者必須一致 ——
   見 [color-depth.md](./color-depth.md) §1。
3. **觸控點位置不對？** `board_display.c` 裡的 `board_touch_log` 記錄控制器實際
   回報的值。摸四個角，然後用 `x/12dw &board_touch_log` 倒出來看；方向在被
   vendor 進來的驅動裡固定為 `TS_SWAP_Y`，那是原廠套件對這片面板的選擇。
4. **圖片顯示成雜訊？** 圖片放在內部 flash（§4），所以這不是 OctoSPI 的問題 ——
   請回頭懷疑第 2 點的色彩格式。`board_external_flash_ready` 會回報 NOR 有沒有
   起來，但在 `HMI_IMAGES_IN_EXTERNAL_FLASH` 關閉的情況下沒有任何程式碼會去讀
   它，所以那裡是 false 目前無害。
5. **Modbus 全部逾時？** 先確認 Windows 有沒有列出 `USB Serial Device (COMxx)`，
   以及 `board_usb_ready` 是不是 true。沒有 COM port 就是 USB 沒熟起來（§5），
   而不是 Modbus 的問題。

## 延伸閱讀

- [images-external-flash.md](./images-external-flash.md) —— 圖片資源如何連結、
  切分與燒錄
- [color-depth.md](./color-depth.md) —— 每塊板子跑什麼，以及為什麼
- [lvgl-configuration.md](./lvgl-configuration.md) —— `LV_MEM_SIZE` 等設定
