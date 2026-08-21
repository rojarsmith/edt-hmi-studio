# 影片播放——從 SD 卡上把一部片子讀出來

<p align="center">
  <a href="../video-playback.md">English</a> · <strong>繁體中文</strong>
</p>

這個編輯器裡的其他每一個元件，內容都是專案自己擁有的東西：標籤的文字、圖片的
像素、圖表的數字。它們全都會被編進韌體映像檔，燒進板子裡。

影片沒辦法這樣做。一分鐘的 800×480 影像大約 200 MB——是那塊要播它的板子內部
Flash 的兩百倍。所以 Video 是唯一一個**指名內容而不是帶著內容**的元件：你打上
一個檔名，面板在執行期自己到 SD 卡上把那個檔案找出來。

以下的一切，都是從這一個決定長出來的。

---

## 1. 這個元件是什麼

從 **Miscellaneous（雜項）** 分類把 **Video** 拖出來，它會落成一塊黑色矩形——
也就是畫面將要佔住的那個框。它只有三個屬性，沒有別的：

| 屬性 | 預設 | 作用 |
| --- | --- | --- |
| **File name on the SD card** | *(空白)* | 要播的檔案，就用它在卡片根目錄裡的名字——`intro.avi`。 |
| **Auto Play** | 開 | 載入帶著這個元件的畫面時就開始播。 |
| **Loop** | 開 | 播完最後一格之後，從第一格再來一次。 |

沒有匯入步驟，沒有資源條目，也不會有任何東西被加進建置。一部兩小時的片子花掉的
韌體空間，和兩秒鐘的一模一樣：零。要換影片就換卡，不必重新建置。

代價是編輯器從來沒看過那個檔案，也查不了它。所以它只查三件不管卡片上有什麼都
一樣錯的事——沒填名字、把路徑填在該填名字的地方、副檔名不是 `.avi`——其餘全部
留給面板，因為只有面板真的能去看。

## 2. 哪些板子播得動

| 板子 | 影片 | 原因 |
| --- | --- | --- |
| **STM32H747I-DISCO** | ✅ | 有 JPEG 編解碼硬體，也有接在 SDMMC1 上的 4-bit microSD 插槽。 |
| STM32F746G-DISCO | ❌ | 沒有 JPEG 硬體。那個週邊是 F76x/F77x 才開始有的。 |
| EDT EVK043027B | ❌ | STM32U599 沒有 JPEG 硬體，這塊評估板也沒把 SD 插槽拉出來。 |

這不是「驅動還沒寫」。一秒解二十四張 800×480 的 JPEG，**同時還要跑一整套使用者
介面**，不是 Cortex-M7 用軟體做得到的事——根本沒有一條比較慢的路可以退。沒有那顆
硬體的板子就是播不動影片，把這件事講清楚才是誠實的答案。

所以它的處理方式，和「尚未實作的通訊協定」與「驅動不了的螢幕方向」完全一樣：元件
在任何板子上都能放、能設定、能預覽、能存檔，而**用到它的專案在沒有 JPEG 硬體的板子
上不能建置**。屬性面板的 Video 區塊會說明是哪一種情況，Deploy 分頁也會用同樣的話
擋下建置——擋在編譯器之前，而不是變成一句找不到標頭檔的訊息。

**板子的能力只寫在一個地方**：[`src/types/hmi.ts`](../../src/types/hmi.ts) 裡的
`BoardDefinition.video`。要讓第四塊板子播影片，就是把那個欄位填上、給它一份執行期
程式；編輯器其他地方一行都不用動。

## 3. 格式，以及那個檔案

面板播的是 **AVI 容器裡的 Motion JPEG**。每一格都是一張完整的 JPEG，格與格之間
沒有任何互相參照。

這不是妥協，這正是重點。它是唯一一種每格的工作量剛好就是 STM32H7 的 JPEG 硬體在
做的事的常見影片格式；而正因為沒有畫面間預測，播放可以從任何一格開始、可以瞬間
回頭重播，也可以在某一格壞掉時直接跳到下一格。

要做出這樣的檔案：

```bash
ffmpeg -i source.mp4 -vf "scale=800:480,fps=24" -c:v mjpeg -q:v 3 -an intro.avi
```

`-an` 會把聲音丟掉——見[§7](#7-這裡刻意不做的事)。把結果複製到 FAT32 或 exFAT
卡片的**根目錄**，再把檔名打進元件裡。

### 讀取器走過的那棵 AVI

AVI 是一個 RIFF 檔：一棵由四字元區塊組成的樹，每塊帶一個 32 位元長度，並補齊到
偶數位元組。其中兩根樹枝有意義。

```
RIFF 'AVI '
├── LIST 'hdrl'                   ← 開檔時讀一次
│   ├── 'avih'                    ← 每格間隔、寬、高、總格數
│   └── LIST 'strl'（每個串流一個）
│       └── 'strh'                ← 'vids' + 'MJPG' 指出哪一軌是影像
├── LIST 'movi'                   ← 一次串流一塊
│   ├── '00dc' <jpeg 影格>
│   ├── '01wb' <音訊>             ← 跳過
│   └── ...
└── 'idx1'                        ← 從來不讀
```

讀取器（[`hmi_avi.c`](../../firmware/stm32h747i-disco/src/hmi_avi.c)）只解析
`hdrl` 一次，之後就照檔案順序走 `movi`，每次呼叫回傳一格壓縮影格。**索引完全不
讀。** 串流放棄了跳到任意一格的能力——產品裡沒有任何地方需要它——換來的是一個
記憶體不隨片長增長的讀取器，而且壞掉的索引擋不住它。

Motion JPEG 從來就沒有統一的拼法，所以 `MJPG`、`mjpg`、`MJPA`、`MJPB`、`AVRn`、
`jpeg` 與 `dmb1` 全部接受。它們都是普通的 JPEG 影格，硬體根本分不出差別；為了標籤
怎麼拼而拒絕一個檔案，是一個沒有後果的區別。

## 4. 一格畫面怎麼變成像素

兩個週邊，像素路徑上沒有 CPU：

```
SD 卡 ──f_read──► 壓縮影格 ──JPEG 硬體──► YCbCr，以 MCU 區塊排列
                                                 │
                                               DMA2D
                                                 │
                                                 ▼
                              ARGB8888，掃描線順序 ──► lv_image
```

在這顆晶片上，JPEG 硬體與 DMA2D 是成對設計的：DMA2D 的 YCbCr 輸入模式讀的正是
JPEG 硬體輸出的那種 MCU 區塊排列，轉換之後寫出掃描線順序的 ARGB8888。這裡沒有
任何「軟體解碼加硬體輔助」——它就是硬體解碼。

兩段都用**輪詢**，而且整件事跑在一個 `lv_timer` 回呼裡。呼叫端本來就得等到那一格
才有東西可以顯示，非同步解碼除了多一台狀態機之外買不到任何東西。

### 時間預算

24 fps 時一格是 41.7 ms。一張 800×480 影格花掉幾毫秒的硬體時間，以及在這裡設定的
約 27 Mbit/s 位元率下大約 140 KB 的卡片讀取。主迴圈在兩格之間照樣跑 Modbus 與觸控。

唯一會把這份預算花壞的事情是**縮放**。畫面用 `LV_IMAGE_ALIGN_CONTAIN` 繪製，會在
元件給的框裡維持長寬比——而當元件正好就是影片自己的解析度時，LVGL 直接搬運影格，
完全不縮放。**請把 Video 元件的大小設成影片的大小。** 其他任何尺寸，都會讓每一格
都在 CPU 上、以播放速率被重新縮放一次。

### 那些緩衝區

| 緩衝區 | 800×480 時的大小 | 誰寫 | 誰讀 |
| --- | --- | --- | --- |
| 壓縮影格 | 512 KB | `f_read` | JPEG 硬體 |
| YCbCr MCU 區塊 | 1152 KB | JPEG 硬體 | DMA2D |
| ARGB8888 畫面 | 1500 KB | DMA2D | LVGL |

三個都放在板子的外部 SDRAM，在 `.sdram` 區段裡，位於 LVGL 自己那 4 MB 堆積之上。
它們是**共用的，不是每個元件一份**，因為同一時間只有一個影片在解碼
（[§5](#5-同一時間只有一個播放器)）。

沒有 Video 元件的專案一毛都不用付。當沒有任何地方呼叫 `hmi_video_attach` 時，
`--gc-sections` 會把整份執行期與它的緩衝區一起丟掉；在這塊板子上實測，一個帶影片的
畫面比同一個不帶影片的畫面多花 **20 KB Flash 與 3.1 MB SDRAM**，而沒有影片的專案
和這個功能出現之前逐位元組相同。

每一次交接都做了 D-Cache 維護：硬體輸出在 DMA2D 讀之前先 clean，轉換好的影格在
LVGL 讀之前先 invalidate。卡片用輪詢而不是 DMA 讀取，等於在那一側直接繞開同一個
問題，代價是本來就在等待的那段 CPU 時間。

## 5. 同一時間只有一個播放器

只有一顆 JPEG 硬體、一組緩衝區，所以執行期會播**已載入畫面上的第一個 Video
元件**，其他的則顯示 *Another video is playing*。一個畫面一部影片才是專案真正的
形狀；跨畫面註冊好幾個是很平常的事，而且可以運作。

專案設定樣式的那個元件，就是那塊黑框。執行期在它裡面放兩個子物件：

- 一個 **`lv_image`**，解出來的影格會設到它身上，在第一格到達之前是隱藏的；
- 一個置中的 **`lv_label`**，承載面板要說的話。

標籤繼承黑框的文字顏色，所以訊息是由元件自己的 **Text Color** 那一列決定樣式，
而不是寫死在程式裡。

**`ui_init` 時什麼都不開。** `hmi_video_attach` 只記下名字就回來；卡片是在元件真的
出現在使用中畫面上時才第一次被碰。所以使用者從未打開的畫面完全不會存取卡片、開機
不會卡在一張沒插的卡上，而面板啟動之後才插進去的卡也還是找得到。離開畫面會放掉
檔案；回到畫面會從第一格重新打開，這也是失敗的元件重新獲得一次機會的方式。

## 6. 面板會說什麼，什麼時候說

| 元件上顯示 | 發生了什麼 |
| --- | --- |
| **Video not found** | 卡片根目錄沒有那個名字的檔案——或者這個元件根本沒填檔名。 |
| **No SD card** | 插槽裡沒有東西。插槽的偵測腳位這麼說。 |
| **SD card unreadable** | 卡在裡面，但初始化不起來，或上面沒有檔案系統。 |
| **Video format not supported** | 檔案不是 AVI、影像軌不是 Motion JPEG、影格比緩衝區大，或畫面是這條硬體路徑轉換不了的形狀。 |
| **Another video is playing** | 同一畫面上的第二個 Video 元件。見[§5](#5-同一時間只有一個播放器)。 |

這些刻意不合併。對播放器來說，「檔案不見了」和「卡沒插」是同一種失敗；對手上拿著
卡片的人來說完全是兩回事，而在人家只是忘了把卡推進去的時候告訴他影片不見了，會把
他送去錯的地方找。

失敗的元件把話說一次就停下來——每一格都重試會把一張不在的卡打爆。離開畫面再回來
就會重試。

### 在編輯器裡，以及在 Preview 裡

設計畫布、Preview 與 Emulator 都不播任何東西。它們都沒有面板的讀卡機，也從來沒看
過那個檔案。

所以三者都畫出畫面將要佔住的那個框，把檔名寫在上面，而不是憑空捏造一張劇照。
Emulator 會在元件裡寫 *Not played in the Emulator*。在那裡顯示 **Video not found**
會是另一種宣稱——宣稱卡片被看過而且是空的——而只有面板能這樣說。

## 7. 這裡刻意不做的事

**不播聲音。** 執行期會直接跳過音訊串流，不解碼它。一軌 MP3 或 AAC 需要一份解碼
函式庫、把 WM8994 codec 掛上 SAI，還需要一套讓聲音跟著影像時鐘走的緩衝紀律——那是
另一個專案份量的工作，而且目前元件的設定裡沒有任何一項需要它。做檔案時請加 `-an`；
不管有沒有聲音，影格都一樣，音訊串流只是讓檔案變大而已。

**不能跳轉，也沒有播放控制列。** 元件只有 Auto Play 與 Loop。執行期裡有
`hmi_video_play`、`hmi_video_pause` 與 `hmi_video_stop` 可以讓事件或邏輯圖呼叫，但
編輯器還沒有任何動作綁上去。

**畫面必須是整數個 MCU 區塊。** 4:4:4 是 8×8、4:2:2 是 16×8、4:2:0 是 16×16。
區塊排列的來源只有在整除時才跟掃描線目的地對得上；要處理那條參差的邊，就得在每一
格上每個 MCU 列各發一次 DMA2D，只為了救一種沒有人會產出的影片。800×480——面板自己
的尺寸——在三種取樣下都整除。

**灰階與 CMYK 的 JPEG 會被拒絕。** DMA2D 的 YCbCr 輸入模式只涵蓋 4:4:4、4:2:2 與
4:2:0，而那兩種都不是編碼器會為影片產出的東西。

**大於 512 KB 的影格會被拒絕。** 在這裡設定的位元率下一格大約 140 KB，所以這個上限
遠遠超過任何合理的品質設定——而真的超過的檔案會說出來，而不是拿一段被截斷的資料去
解碼。

**檔案放在卡片根目錄。** 在編輯器裡打的是名字，不是路徑。屬性面板看到分隔符號時
會這麼說。

## 8. 程式在哪裡

| 部分 | 檔案 |
| --- | --- |
| 元件定義、分類 | [`src/utils/componentDefinitions.ts`](../../src/utils/componentDefinitions.ts) |
| 屬性 | [`src/types/index.ts`](../../src/types/index.ts) 裡的 `VideoProps` |
| 板子能力 | [`src/types/hmi.ts`](../../src/types/hmi.ts) 裡的 `BoardDefinition.video` |
| 屬性面板 | [`PropertyEditor.tsx`](../../src/components/PropertyEditor/PropertyEditor.tsx) 裡的 `VideoEditor`、[`videoModel.ts`](../../src/components/PropertyEditor/videoModel.ts) |
| 設計畫布 | [`CanvasComponent.tsx`](../../src/components/Canvas/CanvasComponent.tsx) 裡的 `CanvasVideoContent` |
| Preview | [`PreviewPanel.tsx`](../../src/components/Preview/PreviewPanel.tsx) 裡的 `drawVideo` |
| Emulator | [`ui_from_json.c`](../../wasm/src/ui_from_json.c) 裡的 `create_video` |
| 程式碼產生 | [`ui.c.ts`](../../src/codegen/templates/ui.c.ts) 裡的 `getCreateFunction` 與 `generatePropsCode` |
| 建置閘門 | [`DeployPanel.tsx`](../../src/components/DeployPanel/DeployPanel.tsx)、[`videoWidgets.ts`](../../src/utils/videoWidgets.ts) |
| 執行期——元件與播放 | [`hmi_video.c`](../../firmware/stm32h747i-disco/src/hmi_video.c) |
| 執行期——AVI 解多工 | [`hmi_avi.c`](../../firmware/stm32h747i-disco/src/hmi_avi.c) |
| 執行期——JPEG + DMA2D | [`hmi_jpeg.c`](../../firmware/stm32h747i-disco/src/hmi_jpeg.c) |
| 執行期——SD 卡與 FatFs | [`hmi_sd.c`](../../firmware/stm32h747i-disco/src/hmi_sd.c)、[`ffconf.h`](../../firmware/stm32h747i-disco/include/ffconf.h) |

FatFs 和其他每一個相依項目一樣，釘在
[`bootstrap-deps.ps1`](../../firmware/stm32h747i-disco/scripts/bootstrap-deps.ps1)
裡。只有 `ff.c` 與 `ffunicode.c` 會被編譯；`disk_*` 介面直接在 `hmi_sd.c` 裡對著
板子的 BSP 實作，而且這份建置是**唯讀**的——`FF_FS_READONLY` 是 1，所以這份韌體做
的任何事都改不了一張卡片。

## 9. 元件參考

元件本身的參考頁——屬性、樣式、事件、各層繪製與 LVGL API 對應——見
[docs/zh-TW/components/video.md](./components/video.md)。
