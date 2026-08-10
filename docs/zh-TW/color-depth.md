# 色彩深度

<p align="center">
  <a href="../color-depth.md">English</a> · <strong>繁體中文</strong>
</p>

兩片支援的板子目前都跑 **16-bit RGB565**。本文記錄原因、STM32H747I-DISCO 改成
32-bit 的實際代價，以及 ST 資料上「ARGB8888 via DMA2D」那句話的正確與不正確解讀。

## 1. 目前的設定

| 板子 | 面板 | `LV_COLOR_DEPTH` | LTDC layer 格式 | Frame buffer |
| --- | --- | --- | --- | --- |
| STM32F746G-DISCO | 480×272 | 16 | RGB565 | 2 × 255 KB |
| STM32H747I-DISCO | 800×480 | 16 | RGB565 | 2 × 750 KB |

H747I 是在三個地方設定的，三者必須一致：

| 位置 | 設定 |
| --- | --- |
| `firmware/stm32h747i-disco/include/lv_conf.h` | `LV_COLOR_DEPTH 16` |
| `firmware/stm32h747i-disco/src/board_display.c` | `BSP_LCD_InitEx(..., LCD_PIXEL_FORMAT_RGB565, ...)` |
| `firmware/stm32h747i-disco/src/board_display.c` | `lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565)` |

`src/types/hmi.ts` 的板子定義帶有對應的 `colorDepth: 16, colorFormat: 'RGB565'`。
那份是描述性的，見 §6。

16-bit 是刻意的選擇，不是預設值。`board_display.c` 用 `BSP_LCD_InitEx` 而非
`BSP_LCD_Init`，正是因為後者預設 RGB888。

## 2. 這片板子上的「24-bit」實際是每像素 32 bit

BSP 只提供兩種 pixel format，而它的 RGB888 模式並不會給你 packed 24 bpp 的
frame buffer。出自 `stm32h747i_discovery_lcd.c`：

```c
else /* LCD_PIXEL_FORMAT_RGB888 */
{
  ltdc_pixel_format = LTDC_PIXEL_FORMAT_ARGB8888;
  dsi_pixel_format  = DSI_RGB888;
  Lcd_Ctx[Instance].BppFactor = 4U;
}
```

DSI 線路上跑 24-bit 色，但 frame buffer 是 **ARGB8888，每像素 4 bytes**。
`BppFactor = 4U` 就是 BSP 自己的說明。除非繞過 BSP 直接設定
`LTDC_PIXEL_FORMAT_RGB888`，否則沒有 packed 24 的路徑。

所以真正的選擇是 16 bpp 或 32 bpp。要求「24-bit」拿到的是 32。

## 3. DMA2D 是什麼，不是什麼

ST 的資料把這顆晶片描述為支援 *ARGB8888 (32-bpp) via DMA2D*。兩半都是事實，
但它們是兩件獨立的事，這個說法容易導向錯誤結論。

**從本專案樹內的標頭檔確認：**

- DMA2D 週邊的輸出格式包含 ARGB8888、RGB888、RGB565 與 ARGB1555
  （`stm32h7xx_hal_dma2d.h:222`）。
- 決定掃描輸出格式的是 LTDC layer。ARGB8888 的支援來自 LTDC，不是 DMA2D。
- LVGL v9.5 內含 DMA2D draw unit（`src/draw/dma2d`），由 `LV_USE_DRAW_DMA2D`
  控制，**預設為 0**。本專案沒有啟用。
- 該 unit 的 `LV_DRAW_DMA2D_HAL_INCLUDE` 預設就是 `"stm32h7xx_hal.h"` ——
  它就是為這個系列寫的。
- 它自己處理 D-cache 一致性（`lv_draw_dma2d_clean_cache` /
  `lv_draw_dma2d_invalidate_cache`），這點很重要，因為本專案把 SDRAM 視窗設為
  cacheable write-back（§5）。
- 它加速的輸出格式包含 ARGB8888、XRGB8888、RGB888 **以及 RGB565**。

由此得到兩個結論，這是本節真正有用的部分：

**DMA2D 不是 32-bit 色的啟用條件。** LTDC 本來就支援。DMA2D 是能在這些格式間
做轉換與混色的加速器。

**DMA2D 不會降低記憶體頻寬。** 它搬運的位元組數和 CPU 一樣多，省下的是 CPU
時間。因此它無法回應 §4 的頻寬問題。

反過來說，這帶出一個可以馬上採取的發現：因為這個 draw unit 在 RGB565 下同樣有效，
**啟用它是在目前 16-bit 深度下就能拿到的獨立收益**，完全不增加頻寬。如果想改
32-bit 的動機是「UI 感覺慢」，請先試 `LV_USE_DRAW_DMA2D 1` —— 這是便宜太多的實驗。

另外 BSP 自身的 DMA2D 使用目前也是關閉的：`include/stm32h747i_discovery_conf.h`
裡的 `USE_DMA2D_TO_FILL_RGB_RECT 0`。HAL 模組有編進去（`CMakeLists.txt` 含
`stm32h7xx_hal_dma2d.c`），但本專案目前沒有任何程式碼在驅動這個週邊。

## 4. H747I 改成 32 bpp 的代價

### 4.1 晶片內部成本是零 —— 實測

實際套用改動、用 CubeCLT 1.22.0 建置、反組譯驗證生效，然後還原。Flash 與內部
RAM 完全沒有變化：

| | 16 bpp | 32 bpp |
| --- | --- | --- |
| text | 281344 | 281344 |
| data | 812 | 812 |
| bss | 279516 | 279516 |

數字相同不是因為建置沒重跑。兩個二進位檔內容不同，且 `board_display_init` 的
反組譯確認改動確實生效：

| 證據 | 16 bpp | 32 bpp |
| --- | --- | --- |
| `BSP_LCD_InitEx` 的 PixelFormat 參數 | `#2`（`LCD_PIXEL_FORMAT_RGB565`） | `#1`（`LCD_PIXEL_FORMAT_RGB888`） |
| `HMI_FRAMEBUFFER_BYTES` 常數 | `0x000BB800` = 768,000 | `0x00177000` = 1,536,000 |

佔用不變的原因是 frame buffer 位於外部 SDRAM，而且 `lv_conf.h` 不論
`LV_COLOR_DEPTH` 為何都開啟了所有 `LV_DRAW_SW_SUPPORT_*` 格式，因此兩種情況
編進去的混色路徑相同。

### 4.2 SDRAM 容量沒問題

800 × 480 = 384,000 像素。

| | 每 buffer | 兩個 buffer |
| --- | --- | --- |
| RGB565 | 750 KB | 1.5 MB |
| ARGB8888 | 1.5 MB | 3 MB |

兩個 layer 槽位是 `LCD_LAYER_0_ADDRESS = 0xD0000000` 與
`LCD_LAYER_1_ADDRESS = 0xD0200000`，相距 2 MB，所以 1.5 MB 的 buffer 不必搬動
任何東西就塞得下。板子上有 32 MB SDRAM。

### 4.3 頻寬才是真正的限制

時脈鏈，讀自 `src/board.c` 與 BSP：

- HSE 25 MHz、`PLLM 5` → 5 MHz、`PLLN 160` → 800 MHz VCO、`PLLP 2` → 400 MHz SYSCLK
- `AHBCLKDivider = RCC_HCLK_DIV2` → 200 MHz AXI/AHB
- `FMC_SDRAM_CLOCK_PERIOD_2` → SDCLK = HCLK/2 = **100 MHz**
- `FMC_SDRAM_MEM_BUS_WIDTH_32`、CAS latency 3、read burst 啟用

理論峰值為 100 MHz × 4 bytes = **400 MB/s**。refresh、row activate/precharge 與
CAS latency 都要從中扣除；串流存取的實務持續值**大約在 200–280 MB/s**。這個區間
是估計值，不是量測值。

掃描輸出是無條件的 —— 不管畫面有沒有變動，LTDC 每一幀都會讀完整個 frame buffer。
在約 60 Hz 下（flush 路徑自己的逾時註解把一幀寫成約 16 ms）：

| | 每幀 | 掃描輸出 |
| --- | --- | --- |
| RGB565 | 750 KB | 約 46 MB/s |
| ARGB8888 | 1.5 MB | **約 92 MB/s** |

LVGL 以 `LV_DISPLAY_RENDER_MODE_DIRECT` 直接繪製進 frame buffer，所以繪製端的
寫入量同樣翻倍。最壞情況是連續全螢幕重繪 —— 動畫，或拖曳中的 slider：

| | 掃描輸出 + 60 Hz 全螢幕重繪 |
| --- | --- |
| RGB565 | 約 92 MB/s |
| ARGB8888 | **約 184 MB/s** |

對上估計的 200–280 MB/s 上限，而且還沒計入 M7 自己對 SDRAM 的存取，32 bpp
剩下的餘裕非常有限。

## 5. 為什麼已知頻寬餘裕很薄

這在這片板子上不是理論疑慮。`src/board.c` 記錄了一個在 **16 bpp** 就已經踩到並
修復的問題：

> FMC SDRAM 視窗被歸類為 Device memory……消耗的 FMC 頻寬遠高於應有的量，使 LTDC
> 缺料並讓其 FIFO underrun —— 在面板上表現為只要有東西持續重繪就出現的撕裂與
> 扭曲線條。

修法是用 MPU region 把 SDRAM 重新歸類為 cacheable write-back，並由
`board_display.c` 在 LTDC 讀取前清快取。也就是說，這個設計本來就運作在離 FMC
頻寬上限夠近的區域，近到一個定址屬性的錯誤就會直接顯示在面板上。把每像素位元組
數翻倍，等於把那次修復換來的餘裕花掉。

## 6. 只有實機才會浮現的風險

**每像素 alpha 會參與混色。** `MX_LTDC_ConfigLayer` 設定
`BlendingFactor1/2 = LTDC_BLENDING_FACTOR_PAxCA` —— 像素 alpha × 常數 alpha。
在 `LV_COLOR_DEPTH 32` 下，LVGL 的原生格式是 `XRGB8888`，其最高位元組依定義是
「不在乎」。任何把它留成 0 的繪製路徑都會產生全透明像素，露出 layer 的黑色
backcolor。顯示端改用 `LV_COLOR_FORMAT_ARGB8888` 可以迴避，但這個失效模式在
建置階段完全看不出來，只會在面板上出現。

**圖片資源的 flash 佔用翻倍，或付出轉換時間。** 編輯器預設把圖片輸出成 RGB565
的 C array。在 32 bpp 顯示下，LVGL 會在貼圖時轉換，或者必須重新輸出成
ARGB8888 —— 那會讓 flash 佔用翻倍。目前的映像用掉 1 MB bank 中的 281 KB，還有
空間，但圖片多的專案會有感。

**Simple layer 的覆蓋面積減半。** `LV_DRAW_LAYER_SIMPLE_BUF_SIZE` 是 8 KB。
16 bpp 下等於 4096 像素，32 bpp 下是 2048。需要 layer 的 widget —— 任何帶
opacity 或 transform 的 —— 會被切成大約兩倍數量的區塊。

**編輯器的色彩深度選項傳不到韌體。** Project Settings 提供 16/24/32 bit 且會存
下選擇，但每片板子的 `lv_conf.h` 是納入版控的檔案，沒有任何流程會依專案設定重寫
它。只有 WASM 預覽會替換 `LV_COLOR_DEPTH` —— `memSize` 有相同的問題，見
[LVGL 設定](./lvgl-configuration.md) §1.2。現在在那裡改色彩深度，會讓預覽與板子
無聲地不一致。真要改成 32 bpp，應該同時修掉這點，否則這個設定會變成主動誤導。

## 7. 若仍要進行

三處韌體修改，加上編輯器端：

1. `include/lv_conf.h` —— `LV_COLOR_DEPTH` 16 → **32**。不是 24：LVGL 把
   `LV_COLOR_DEPTH 24` 對應到 packed `RGB888`，那正是 BSP 掃描不出來的格式。
2. `src/board_display.c` —— `HMI_FRAMEBUFFER_BYTES` 改為 `sizeof(uint32_t)`、
   `LCD_PIXEL_FORMAT_RGB888`、`LV_COLOR_FORMAT_ARGB8888`。
3. `src/types/hmi.ts` —— 板子定義的 `colorDepth` / `colorFormat`。

然後**必須在實機上驗證**，因為上述沒有任何一項能靠建置定案。跑一個持續重繪的
畫面 —— 拖曳 slider，或播放動畫 —— 觀察是否出現撕裂與扭曲線條。那就是 §5 描述的
LTDC FIFO underrun 指紋。

## 8. 建議

目前維持 16 bpp。

32 bpp 的晶片內部成本確實是零，SDRAM 容量也不是問題，所以反對的理由很集中：就是
頻寬，而這片板子的餘裕已有紀錄顯示曾經薄到出事。

如果目標是畫質，請先確認 RGB565 真的是瓶頸 —— 800×480 的工控 HMI 內容通常不是，
而且 LVGL 的 dithering 是更便宜的嘗試。如果目標是速度，§3 有更好的槓桿：在目前
深度下開啟 `LV_USE_DRAW_DMA2D` 再量測，因為它完全不增加頻寬。

## 相關文件

- [LVGL 設定](./lvgl-configuration.md) —— 各項 `lv_conf.h` 設定的意義，以及哪些
  專案設定真的會進到建置。
- [LVGL 版本](./lvgl-version.md) —— 釘選的 LVGL 版本及其建置選項。
- [STM32H747I-DISCO 雙核](../stm32h747i-disco-dual-core.md) —— 上文引用的 MPU
  與時脈設定，以及板子的復原程序。
