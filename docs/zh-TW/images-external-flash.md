# 圖片置於外部 Flash

<p align="center">
  <a href="../images-external-flash.md">English</a> · <strong>繁體中文</strong>
</p>

在 STM32H747I-DISCO 上，專案用到的每一張圖片，其像素資料都會連結到板子的
QSPI NOR，而不是 1 MB 的內部 flash。本文記錄原因、各環節如何銜接，以及哪些
已經驗證過。

**本文只適用於 STM32H747I-DISCO。** 另外兩塊板子都把圖片留在內部 flash，板子
定義帶著 `externalFlash: null`，燒錄時會完全跳過外部這一步：

- **STM32F746G-DISCO** 從來沒用過。
- **EDT EVK043027B** 有 2 MB 內部 flash，韌體約 285 KB、一張滿版背景圖 383 KB，
  根本不需要 —— 見 [edt-evk043027b.md](./edt-evk043027b.md) §4，那裡也記錄了為什麼
  ST 為對應 Discovery 套件準備的載入器目前燒不動它的 NOR。下面這套機制與板子
  無關，等那個問題解決後可以原封不動套用。

## 1. 為什麼

內部 flash 只有 1 MB，韌體本身已經佔掉約 285 KB，剩下約 740 KB。而單單一張
800×480 的 ARGB8888 背景圖就是 1500 KB —— 連它自己都放不下。數字來源見
[色彩深度](./color-depth.md) §4.2。

板子上的是 **MT25TL01G**：兩顆 MT25QL512 以 dual-flash 模式當成一個 128 MB
的裝置，啟用 memory mapped 模式後可從 `0x90000000` 讀取。空間大約是 170 倍，
而且因為是記憶體映射，**LVGL 完全不用改** —— `lv_image_dsc_t.data` 指到
`0x9xxxxxxx` 跟指到任何其他位址沒有差別。

## 2. 各環節如何銜接

| 環節 | 作用 |
| --- | --- |
| `imageConverter.ts` | 產生 `LV_ATTRIBUTE_IMG_<NAME> HMI_IMAGE_ATTRIBUTE`；有定義 `HMI_IMAGES_IN_EXTERNAL_FLASH` 時展開成 `section(".ext_flash_images")`，否則展開成空 |
| `CMakeLists.txt` | 定義 `HMI_IMAGES_IN_EXTERNAL_FLASH`，並編入 QSPI 的 HAL、BSP 與 MT25TL01G 驅動 |
| `STM32H747XIHx_FLASH.ld` | 新增 `0x90000000` 的 `EXTFLASH` 區段，並把 `.ext_flash_images` 放進去 |
| `board.c` | 一個把該視窗設為 Normal / cacheable / 唯讀的 MPU region，以及 `board_external_flash_init()` 負責啟動 QSPI 並開啟 memory mapped 模式 |
| `CMakeLists.txt` post-build | 把 ELF 切成 `firmware.bin`/`.hex`（移除外部區段）與 `firmware_extflash.bin`（只有該區段） |
| `service.ts` | 先用外部載入器把 `firmware_extflash.bin` 燒進外部 flash，再燒內部映像。位址與載入器名稱都來自板子定義的 `externalFlash`，沒有的板子就跳過這一步 |

只有專案實際用到的圖片才會被產生 —— `projectSource.ts` 的
`collectUsedImageResources` 本來就在做這件事，早於這次改動。

`--gc-sections` 依然生效。沒有任何程式碼參考到的圖片資料會被連結器丟棄，不會
佔用外部 flash；也因此描述子必須被活的程式碼參考到，像素資料才留得下來。

## 3. 兩個容易搞錯的地方

**描述子留在內部 flash，只有像素資料搬走。** `lv_image_dsc_t` 結構只是幾個
位元組的標頭加一個指標，而且沒有掛屬性，所以照舊落在 `.rodata`。這是刻意的：
小的中繼資料留在近處，大量資料搬走。

**ELF 不能再直接燒錄。** 它帶著 `0x90000000` 的區段，STM32CubeProgrammer 沒有
外部載入器就寫不進去，會出現 `failed to download Sector[0]`。請燒
`firmware.hex`，該區段已被移除。Deploy 分頁本來就是這樣做的。

## 4. MPU

QSPI 視窗預設是 Device memory，跟
[STM32H747I-DISCO 雙核](../stm32h747i-disco-dual-core.md) 描述的 SDRAM 視窗是
同一個陷阱。維持預設的話，LVGL 讀取的每一個圖片位元組都會變成不可緩衝、不可
合併的單筆存取，直接壓在 QSPI 匯流排上。Region 1 把它改成 Normal、cacheable、
唯讀，讓 D-Cache 能存放圖片資料、控制器能做叢發傳輸。

唯讀是刻意的：執行期沒有任何東西會寫它，內容是由燒錄器寫入的。

## 5. Dummy cycles，以及為什麼設錯會看起來像圖片壞掉

`MT25TL01G_DUMMY_CYCLES_READ` 是 QSPI 控制器對 `QUAD_INOUT_FAST_READ`（0xEB）
指令使用的 dummy cycle 數，`MT25TL01G_ReadSTR` 和記憶體映射設定都用它。ST 的
`mt25tl01g_conf_template.h` 設成 8。**在這片板子上必須是 10**，
`include/mt25tl01g_conf.h` 覆寫了它。

沒有任何程式碼會設定晶片的 volatile configuration register ——
`CONF_QSPI_DUMMY_CLOCK` 雖然在範本裡，但 BSP 與元件驅動中**沒有任何地方引用它**
—— 所以 flash 維持出廠預設的 10 個 dummy clock，控制器必須跟它一致。

設成 8 時，控制器會提早兩個時脈開始取樣。而在 dual-flash QPI 下兩顆 die 提供
八條資料線，一個時脈剛好搬一個位元組，因此每次記憶體映射讀取都會**整體位移
兩個位元組**。

這個失效模式值得記住，因為它的表現方式很有欺騙性：

- Flash 裡的內容是**正確的**。透過外部載入器讀取，與檔案完全一致。
- 只有 CPU 的記憶體映射視圖是錯的。
- 所以韌體跑得起來、圖片位址正確，面板顯示的是「有結構但錯亂」的畫面，
  而不是一片空白。

**用重複樣式測不出來。** `11 22 33 FF` 重複的資料位移之後仍然是同一組位元組
輪轉。要抓到它，必須拿真實圖片的位元組、**透過 CPU 路徑**與檔案比對 ——
用 `-el` 讀取抓不到，因為那走的是載入器自己的讀取常式，不是記憶體映射視窗。

## 6. 驗證狀態

以下都是在板子上實測，不是推論：

| 檢查項 | 結果 |
| --- | --- |
| 區段位置 | `.ext_flash_images`，16384 bytes，位於 `0x90000000`，`CONTENTS, ALLOC, LOAD` |
| 像素資料符號 | `ui_img_probe_map` 位於 `90000000` |
| 描述子符號 | `ui_img_probe` 位於 `080409b0` —— 如預期留在內部 |
| `firmware.bin` | 285704 bytes，沒有把到 `0x90000000` 的空隙填滿 |
| `firmware_extflash.bin` | 剛好 16384 bytes |
| 燒錄 | 透過 `MT25TL01G_STM32H747I-DISCO.stldr`，`Download verified successfully` |
| 回讀 `0x90000000` | `FF332211` —— 即探針的 `11 22 33 FF` 樣式 |
| 回讀 `0x90004000` | `FFFFFFFF` —— 空白，代表剛好只寫了 16 KB |
| 執行期 | 重置後連續三次取樣 PC，數值皆不同且都不在 `board_error_handler`，代表 `board_external_flash_init()` 成功且主迴圈在跑 |
| CPU 記憶體映射讀取 | `MT25TL01G_DUMMY_CYCLES_READ` 設為 10 時，在真實的 198 KB 影像上取七個分散位移，與檔案完全一致；設為 8 時每次讀取都位移兩個位元組 |

一個真實專案 —— 35 張圖片、共 198 KB —— 已經完成建置、燒錄並在面板上顯示。
圖片正常繪製，按鈕可用，切換畫面正常。

## 相關文件

- [色彩深度](./color-depth.md) —— flash 預算數字的來源。
- [STM32H747I-DISCO 雙核](../stm32h747i-disco-dual-core.md) —— 本文所依據的 MPU
  與時脈設定。
