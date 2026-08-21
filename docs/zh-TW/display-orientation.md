# 畫面方向——橫向與直向——評估

<p align="center">
  <a href="../display-orientation.md">English</a> · <strong>繁體中文</strong>
</p>

狀態：**先評估，然後做了。** §1–§13 是程式碼還不存在時寫下的評估；§14 記錄實際做了什麼，
以及評估在哪裡是錯的。內容對照過原始碼，也對照過一份真實的 linker map，不是憑印象。

提案內容：New Project 對話框在 Hardware Model Number 旁邊多一個 **Display
Orientation** 欄位，提供 **Landscape** 與 **Portrait** 兩個選擇。目標硬體沒有註明時
預設 Landscape；`EDT EVK043027B` 與 `STM32H747I-DISCO` 都預設 Landscape。選 Portrait
時設計畫布以中心點順時針轉 90°——矩形就是寬高對調，圓形畫布則什麼都不會變（§10）。

先講結論，分兩半：

- **編輯器這一半幾乎是免費的**，原因在於一條不變式（§2）。大約四十個地方已經從同一個
  來源讀畫布尺寸；只要那個來源存的是**轉過之後**的尺寸，這四十個地方一行都不用改。有
  四個地方不是免費的，其中一個是等著發作的 bug（§4.1）。
- **韌體這一半不是一件事，是三件事**，三塊板子給出三種答案。**H747I 是免費的**——那片
  面板自己會轉，而且 BSP 裡的開關本來就在（§8.1）。**F746G 與 EDT 不是**，因為它們是
  parallel RGB 面板，沒有任何掃描方向暫存器；LVGL 的軟體旋轉與這三塊板子目前用的 render
  mode 互斥；而 EDT 的記憶體預算擋掉了最直覺的那條路（§8.4）。實測數字是**剩下 437 KB
  SRAM**，而需要的緩衝區是 510 KB。

所以這件工作老實的形狀是：編輯器便宜、一塊板子便宜，另外兩塊要真的重寫顯示驅動。

---

## 1. 到底在要求什麼

「方向」這個詞底下藏了四件不同的事，代價差非常多。先把它們分開命名，後面才不會滑來滑去。

| | 意思 | 痛在哪裡 |
|---|---|---|
| **邏輯解析度** | 設計者擺 widget 的座標空間。直向 EDT 就是 272×480。 | 編輯器、預覽 |
| **實體解析度** | 面板真正掃描的尺寸。EDT 永遠是 480×272，專案怎麼寫都一樣。 | 韌體、frame buffer |
| **旋轉** | 上面兩者之間的轉換。 | 顯示驅動 |
| **觸控轉換** | **同一個**旋轉，套用在輸入上，方向相反。 | 顯示驅動 |

編輯器只需要第一項。韌體四項全要，而代價都在第三、第四項。

還有一件這件事**不是**的事：把已經存在的專案裡的 widget 轉過去。建立專案時畫布是空的，
這一點直接把整個功能最難的部分拿掉了。§6 討論的是要不要把那部分再加回來。

## 2. 決定編輯器成本的那條不變式

存法有兩種，只有一種便宜。

**（A）`display.width`/`display.height` 存的是旋轉後的邏輯尺寸。** 一個直向 EDT 專案，
板子上存 `480×272`，專案上存 `272×480`。下游沒有任何人知道旋轉這回事存在。

**（B）存面板的實體尺寸，每個使用者自己在讀的時候對調。**

（A）便宜到什麼程度是可以量的。編輯器裡每一個畫布消費端都是從 `editorStore` 讀
`canvas.width`/`canvas.height`，而它只在三個地方從 `config.display` 灌進去
（`App.tsx:101`、`App.tsx:297`、
`ProjectListPage.tsx:116`）。
在（A）之下，這三行是**唯一**需要知道方向的地方，而且它們現在就已經做對了。在（B）之下，
下面每一個都變成一個可能寫錯的地方：

| 消費端 | 讀什麼 | （A）之下 |
|---|---|---|
| 設計畫布 | `Canvas.tsx:870`、`:978` | 免費 |
| 畫布置中 / Ctrl+0 | `Canvas.tsx:830` → `canvasView.ts` | 免費 |
| 對齊與分佈，10 處 | `AlignToolbar.tsx:53`–`:231` | 免費 |
| Prototype | `PreviewPanel.tsx:1121`、`:1144` | 免費 |
| Emulator | `Emulator.tsx:249` | 免費 |
| 換頁轉場（滑動距離） | `PreviewPanel` 轉場程式碼 | 免費 |
| 專案卡縮圖 | `ProjectCard.tsx:102` | 免費 |
| 框選、拖曳夾限、父層尺寸 | `Canvas.tsx:930` | 免費 |

**建議採（A）。** 把這條不變式寫在 `DisplayConfig` 宣告的地方，因為這種東西最容易被人
悄悄違反：

> `ProjectConfig.display.width/height` 是**邏輯**解析度——設計者畫圖的空間，也是我們告訴
> LVGL 的顯示尺寸。`BoardDefinition.display.width/height` 是**實體**面板。兩者不一致的
> 時機，剛好就是方向不等於板子原生方向的時候。

## 3. 新狀態放在哪裡

`DisplayConfig` 本來就有一個旋轉欄位，而且它是死的：

```ts
// src/store/projectStore.ts:36
export interface DisplayConfig {
  width: number;
  height: number;
  colorDepth: 16 | 24 | 32;
  rotation: 0 | 90 | 180 | 270;   // 四個地方寫入 0，零個地方讀取
}
```

寫入點是 `projectStore.ts:133`、`:714`、`NewProjectDialog.tsx:45` 以及一份測試 fixture。
從來沒有被讀過。`grep -rn "display.rotation"` 什麼都找不到；程式碼裡唯一活著的
`rotation` 是**圖片 widget 的**（`ui.c.ts:852`），跟這件事無關。

三個選項：

1. **賦予 `rotation` 意義**，再從它推導方向。否決：180° 也是橫向，所以 `orientation`
   與 `rotation` 會變成兩個可以互相矛盾的欄位，而「不讓兩份資料有機會不一致」正是這個
   專案一直在設計掉的東西（見 `ProjectSettings.tsx:31` 那段從板子推導顯示設定的註解）。
2. **在 `rotation` 旁邊加 `orientation`。** 同樣的問題，還多一個死欄位。
3. **用 `orientation` 取代 `rotation`。** 沒有人讀它，所以不會壞掉任何東西。

**建議採（3）。** 180° 安裝是另一件事——那講的是面板怎麼鎖進機殼，不是 UI 怎麼排版——
它可以之後有自己的證據時再以自己的欄位出現，不必現在就先把這件事攪混。

```ts
export type DisplayOrientation = 'landscape' | 'portrait';
```

板子這邊也加上，讓未來原生直向的面板有地方說話：

```ts
// src/types/hmi.ts — BoardDefinition.display
/** 專案沒有指定時，這塊板子的 UI 預設哪一面朝上。不填即為橫向。 */
defaultOrientation?: DisplayOrientation;
/** 韌體真的驅動得起來的方向。不填即為兩者皆可。 */
orientations?: readonly DisplayOrientation[];
```

現有兩塊板子都不需要填 `defaultOrientation`——不填已經等於橫向，正好是兩者要的。這個
欄位靠「保持空白」來證明自己有價值。

`orientations` 就不是裝飾了。§8 的結論是 EDT 與 F746G 得先重寫驅動，直向才會動；在那之前，
對話框不可以讓使用者選一個「編得過、但畫出來是雜訊」的方向。這跟
`ProtocolDefinition.implemented`（`hmi.ts:19`）是同一個形狀，而那個欄位存在的理由也正是
這個。

## 4. 編輯器裡**不**免費的部分

四個地方。第一個才是重點。

### 4.1 Project Settings 會默默把專案轉回去

`ProjectSettings.tsx:44` 每次存檔都會從板子重新推導顯示設定：

```ts
const display = {
  ...config.display,
  width: board.display.width,     // ← 永遠是 480
  height: board.display.height,   // ← 永遠是 272
  colorDepth: board.display.colorDepth,
};
// ...
setCanvasSize(display.width, display.height);
```

這個重新推導是刻意的，而且是好的——它會修好那些在板子定義變更之前建立的專案，上面的
註解也是這樣寫的。但在不變式（A）之下，它會拿一個直向專案，把面板的橫向數字蓋掉邏輯
數字，然後在 widget 底下把畫布尺寸換掉。使用者只是打開 Project Settings 改個專案名稱，
版面就毀了。

修法只是一行意圖的差別：**透過方向**去推導。

```ts
const { width, height } = logicalResolution(board, config.display.orientation);
```

值得在 `types/hmi.ts` 抽成一個匯出函式，然後所有算這組尺寸的地方都用它——New Project
對話框、Project Settings、匯入路徑——這樣「這個專案是多大」只有一個定義，而不是三個
今天剛好一致的定義。

### 4.2 既有專案需要一個預設值，而 `normalizeProjectConfig` 就是它的位置

`projectStore.ts:212` 已經在替 `protocol`、`communication`、`canBus` 做同一件事，理由也
寫在上面：欄位還不存在時建立的專案沒有值，而且它們全部都有同一個正確答案。方向是一樣的
情況——今天存在的每一個專案都是橫向。那個函式多一行，不需要 migration，不需要升版號。

匯入路徑 `projectStore.ts:711` 需要同一個 fallback，而 `resources/types.ts:176` 的
`ProjectFile.display` 需要多這個欄位，匯出才能來回。`exportProject` 是整包寫
`display: config.display`（`projectStore.ts:697`），所以那一半已經做完了。

順帶一提，`ProjectFile.canvasSize`（`:661`）是從 `config.display` 寫出來的，在（A）之下
它**本來就已經**是邏輯尺寸——這正是一個叫做 `canvasSize` 的欄位應該有的意思。它不用改，
而這件事本身就是（A）是對的模型的一個小證據。

### 4.3 Hardware Information 把板子和專案混為一談

`HardwareInfoDialog.tsx:77` 在「Resolution」底下顯示
`board.display.width × board.display.height`。對一個直向專案來說，這對面板是真的、對專案
是假的，而對話框完全沒有線索說明它指的是哪一個。它應該兩個都顯示，而且這樣即使在橫向
之下也比現在更有資訊量：

```
面板        480 × 272（橫向）
設計畫布    272 × 480（直向）
```

`frameBufferBytes`（`:61`）維持原樣是正確的——frame buffer 是面板的屬性，內容轉了它不會
變大變小。值得加一行註解說明，因為它看起來很像漏改。

同樣的區分也適用於 New Project 對話框的提示行（`NewProjectDialog.tsx:118`），它應該顯示
使用者即將**在裡面設計**的解析度，而且隨著方向下拉選單即時更新。那是這個欄位唯一的
回饋迴路，而它就是兩個字串插值。

以及專案卡（`ProjectCard.tsx:163`），那裡印 `272 × 480` 才是對的——那正是卡片縮圖在畫的
東西。縮圖本身完全不用動：`.project-card-thumb-img` 是 `object-fit: contain`
（`ProjectCard.css:36`），直向的示意圖會正確地在 140 px 的帶狀區域裡留白置中。

### 4.4 Simulator 本來就是錯的，直向只是讓它現形

`wasm/src/main.c:35`：

```c
display = lv_sdl_window_create(480, 320);
```

480×320 不是三塊板子裡的任何一塊。而本來該修好它的鉤子是個空殼（`main.c:22`）：

```c
EMSCRIPTEN_KEEPALIVE
void set_screen_size(int w, int h) {
    /* For now we just recreate the display at the requested size.
       A full implementation would resize the SDL window. */
    (void)w; (void)h;
}
```

畫布尺寸**確實有**傳過去——`editorStateToJson` 有把它放進 payload
（`editorStateToJson.ts:141`）——只是到了那頭被丟掉。

這是既有缺陷，不是這個功能造成的。[preview-ladder.md](./preview-ladder.md) §3 說這一階
證明的是「真正的 LVGL 對 widget 的看法一致」；它一直是在錯的解析度上證明這件事。但今天
這個錯很溫和（480×320 對 480×272——同一個方向，接近到看起來很合理），而直向會把它變成
一個形狀明顯不對的螢幕。**這個功能不一定要修它，但一定會被算在它頭上。** 值得在同一次
變更裡修掉，或者至少在 Preview 分頁明確標示這一階不遵守專案的解析度。

對照之下，**Emulator 什麼都不用做**：它把 `canvas.width` 與 `canvas.height` 直接傳給
`generateMainWrapper`（`Emulator.tsx:249` → `vite-plugin-emulator.ts:297`），後者把
它們代進 `lv_display_create(disp_width, disp_height)`（`vite-plugin-emulator.ts:289`），
並用同一組數字決定 framebuffer 讀回的尺寸。這一階第一天就是對的，也因此它是「在動任何
韌體之前就能證明直向可行」的那一階。

## 5. 程式碼產生器什麼都不用改，而這不是運氣

產生出來的 C 有兩個性質，讓方向對它完全隱形：

1. **畫面是用 `lv_obj_create(NULL)` 建立的**（`ui.c.ts:1808`），物件尺寸會跟著 LVGL 認定
   的顯示尺寸走。產生的程式碼裡沒有任何地方寫死畫面尺寸，所以也沒有任何東西能跟驅動不
   一致。
2. **Widget 幾何是絕對座標，而且已經是邏輯座標**（`ui.c.ts:1476`）。在旋轉過的顯示上，
   `lv_obj_set_pos` / `lv_obj_set_size` 用的就是旋轉後的座標系，也就是編輯器存的那個。

所以 `generateCode()` 動都不用動，直向專案產生出來的每一個 `.c` 在結構上跟橫向的完全
一樣。旋轉整個活在顯示驅動裡，而那正是它該待的地方：它是「像素怎麼到玻璃上」的屬性，
不是「UI 是什麼」的屬性。

產生器唯一需要多吐出來的東西是方向本身——見 §9。

## 6. 建立之後還能不能改方向？

**建議：不能。** 在建立時定案，就跟通訊協定一樣（`NewProjectDialog.tsx:125` ——「Fixed
for the life of the project」）。兩個理由，一弱一強。

弱的那個：轉**外框**很簡單。設計面從 W×H 順時針轉成 H×W，對應關係是

```
x' = H - y - h      y' = x      w' = h      h' = w
```

連 undo 紀錄一起算大概二十行。

強的那個：**那個轉換對 widget 的內容是錯的。** 它轉了外框，卻讓框裡的東西維持直立——
一個 200×40 的 label 會變成 40×200，而文字仍然在一條 40 px 寬的柱子裡由左往右跑，這不是
任何人說「把設計轉過來」時的意思。Arc 的起訖角度、圖片的 `rotation` 屬性
（`ui.c.ts:852`）、圖表座標軸、文字對齊，全都有外框轉換碰不到的旋轉語意。一個正確的
「旋轉這個專案」指令是一件關於十六種 widget 各自該怎麼辦的設計工作，不是幾何工作——而且
它是另一個功能，只是剛好跟這個共用一個詞。

把外框轉換記在這裡仍然值得，因為那個功能被提出來的時候，這一段是已經談定的部分。

有兩個後果要接受並且寫進 UI：方向下拉只出現在 **New Project**，不出現在 Project
Settings；而且在 New Project 對話框裡切換板子時，必須像現在夾限通訊協定那樣
（`NewProjectDialog.tsx:107`）重新夾限方向，以防新板子的 `orientations` 不包含目前的
選擇。

## 7. 編輯器工作量總表

| 變更 | 規模 |
|---|---|
| `DisplayOrientation` 型別、板子上的 `orientations` / `defaultOrientation`、`logicalResolution()` 輔助函式 | 小，`types/hmi.ts` |
| `DisplayConfig.rotation` → `orientation` | 小，4 個寫入點 + 1 份 fixture |
| New Project 對話框：下拉、即時提示、切板子時夾限 | 小 |
| `normalizeProjectConfig` 預設值 + 匯入 fallback + `ProjectFile.display` | 小 |
| **Project Settings 改成透過方向推導** | 小，**必要，§4.1** |
| Hardware Info：面板與設計畫布分開 | 小 |
| WASM 預覽遵守傳過去的解析度 | 中，既有缺陷，§4.4 |
| 程式碼產生器 | **零**，§5 |

以上全部大概一到兩天，而且 Emulator 讓它在完全不碰韌體的情況下就有一個可運作的端到端
展示。

## 8. 韌體，一塊板子一塊板子看

估算的其餘部分在這裡。

### 8.1 STM32H747I-DISCO——免費，而且開關本來就在

那片面板是走 DSI 的 OTM8009A，而且它**原生就是直向的**。BSP 是靠寫面板自己的 MADCTR
暫存器把它變成橫向顯示，而「不要這樣做」的常數本來就存在：

```c
/* firmware/stm32h747i-disco/src/board_display.c:170 */
BSP_LCD_InitEx(HMI_LCD_INSTANCE,
               LCD_ORIENTATION_LANDSCAPE,   /* LCD_ORIENTATION_PORTRAIT 是 0x00 */
               LCD_PIXEL_FORMAT_RGB888,
               HMI_DISPLAY_WIDTH, HMI_DISPLAY_HEIGHT);
```

`BSP_LCD_InitEx` 會把 `Orientation` 一路傳到 `OTM8009A_Probe` → `OTM8009A_Init`，由它選
`OTM8009A_MADCTR_MODE_PORTRAIT` 或 `..._LANDSCAPE`。那是面板的 memory-access-control：
**掃描方向是在顯示模組裡面改掉的**。LTDC、DSI host 和 LVGL 全都只是在 480×800 底下正常
工作，沒有任何一個像素被 CPU 搬動過。

所以這裡的直向就是：傳 `LCD_ORIENTATION_PORTRAIT`、寬高傳 `480, 800`、LVGL display 建成
480×800。Frame buffer 位元組數不變，位置仍在 SDRAM。Render mode 維持 `DIRECT`。代價：
**零 CPU、零 RAM。**

觸控轉換反而**變簡單**，這正是「這是面板原生模式」的證據。
`board_display.c:215`：

```c
touch_init.Orientation = TS_SWAP_XY | TS_SWAP_Y;
```

上面的註解記錄了實測結果：FT6X06「回報的是面板原生的**直向**座標系，X 為 0..480、
Y 為 0..800」。在直向之下那本來就是 LVGL 想要的座標系，所以兩個 swap 都可以拿掉——
`TS_SWAP_NONE`。這件事應該上板量，而不是相信這份文件，因為那段註解存在的理由，正是
「從 datasheet 推理」在這裡失敗過。

**直向應該先在這塊板子上證明。** 它最便宜，而且它的結果最值得相信。

### 8.2 LVGL 9.5 對另外兩塊板子願意做和不願意做的事

F746G 的 RK043FN48H 與 EDT 的 ET043027 都是由 LTDC 直接驅動的 parallel RGB 面板。沒有
MADCTL、沒有掃描方向暫存器、面板側沒有任何形式的旋轉。LTDC 不能轉，DMA2D（Chrom-ART）
也不能轉。所以旋轉必須發生在軟體裡，而 LVGL 對這件事的支援有一個硬性限制——這個 repo
的三個驅動目前全部站在錯的那一邊。

**三塊板子都是用 `LV_DISPLAY_RENDER_MODE_DIRECT`** 搭配兩張完整 frame buffer——
`edt:620`、`f746:133`、`h747:238`。這個選擇是刻意的，EDT 驅動裡的註解也論證得很清楚：
LVGL 畫進 LTDC 沒在掃的那一張，兩張在垂直空白期交換，所以永遠不會在畫到一半的時候被
顯示出來。

LVGL 9.5 提供兩種旋轉機制，而**在 DIRECT 模式配軟體算繪器之下，兩種都不能用**：

| 機制 | 需要什麼 | 這裡有嗎？ |
|---|---|---|
| `lv_display_set_rotation` + 在 flush callback 裡呼叫 `lv_draw_sw_rotate` | `LV_DISPLAY_RENDER_MODE_PARTIAL` | **沒有**——三塊都是 DIRECT |
| `lv_display_set_matrix_rotation` | `LV_DRAW_TRANSFORM_USE_MATRIX`，而它需要一個支援 3×3 矩陣的算繪器 | **沒有**——三份 `lv_conf.h` 都是 `LV_DRAW_TRANSFORM_USE_MATRIX 0`，而且 `grep -rl matrix src/draw/sw/` 只找得到 letter 與 vector 兩個單元。SW 算繪器做不到；VG-Lite 與 NanoVG 可以。 |

而且弄錯的失敗模式很難看。在 DIRECT 模式、矩陣旋轉關閉時，`lv_refr.c` 會把 layer 的
buffer 區域設成**旋轉後**的解析度：

```c
/* lv_refr.c:875 — "In direct mode and full mode the buffer area is always
   the whole screen, not considering rotation" */
layer->buf_area.x2 = lv_display_get_horizontal_resolution(disp_refr) - 1;
```

於是 LVGL 把那 510 KB 的緩衝區當成 272 px 寬來畫，而 LTDC 把它當成 480 px 寬來掃。
**沒有警告，也沒有錯誤**——`lv_display_set_rotation` 根本不檢查 render mode。結果是一張
被剪切變形的畫面，而且它看起來像驅動的 bug，不像設定的問題。任何人把 `set_rotation`
當作第一個實驗，都會在這裡賠掉一個下午；這句話大概是這份文件對實作者最有用的一句。

參考實作就是 LVGL 自己的 ST 驅動 `lv_st_ltdc.c`，它也印證了這個形狀：旋轉只在
partial 模式那條路徑上處理（`lv_st_ltdc_create_partial`，`lv_draw_sw_rotate` 在第 216
行），它的 direct 路徑完全不轉。

### 8.3 F746G 與 EDT 的驅動會變成什麼樣子

```
   LVGL display：272 × 480，PARTIAL 模式
        │
        ├─ 畫進一塊 partial buffer（一條橫帶）
        │
   flush_cb：lv_draw_sw_rotate(橫帶 → frame buffer, ROTATION_90)
        │
   frame buffer：480 × 272，LTDC 掃的那張
```

具體到每塊板子：

- `lv_display_create(272, 480)` 加上 `lv_display_set_rotation(disp, LV_DISPLAY_ROTATION_90)`。
- `lv_display_set_buffers(..., LV_DISPLAY_RENDER_MODE_PARTIAL)`，搭配兩塊 **partial**
  算繪緩衝區——那是今天不存在的新記憶體。
- 一個 flush callback，先用 `lv_display_rotate_area` 算出橫帶落在哪裡，再呼叫
  `lv_draw_sw_rotate(px_map, first_pixel, w, h, src_stride, fb_stride, rotation, cf)`。
  `LV_COLOR_FORMAT_ARGB8888`（EDT）與 `LV_COLOR_FORMAT_RGB565`（F746G）該函式都支援。
- **不需要觸控轉換。** LVGL 自己會轉——`indev_pointer_proc` 在 hit-test 之前會呼叫
  `lv_display_rotate_point`（`lv_indev.c:742`）。驅動在兩個方向都交給它**面板**座標、
  不要轉。§15.6 記錄了這件事怎麼被搞反，以及代價。
- 撕裂的處理，而那是唯一不機械的部分（§8.5）。

旋轉本身是一個純量的逐像素迴圈，而且讀取是跨步的（`lv_draw_sw_utils.c`，
`rotate90_argb8888`）：

```c
for(int32_t x = 0; x < src_width; ++x) {
    int32_t dstIndex = (src_width - x - 1);
    int32_t srcIndex = x;
    for(int32_t y = 0; y < src_height; ++y) {
        dst[dstIndex * dst_stride + y] = src[srcIndex];
        srcIndex += src_stride;                      /* 沿著一整行往下走 */
    }
}
```

EDT 上一次全螢幕重畫是 130,560 個像素跑過這個迴圈。以 160 MHz 的 Cortex-M33 估每像素
6–10 個 cycle，大約是 **5–8 ms**，而一幀是 16 ms——這是估算，不是量測，也是真的做的話
第一件該量的事。一般 HMI 的更新遠小於全螢幕，所以穩態成本低得多；真正要看的數字是換頁
那一下的最壞情況。

如果真的痛，有兩條退路。LVGL 提供了覆寫鉤子 `LV_DRAW_SW_ROTATE90_ARGB8888`，預設回傳
`LV_RESULT_INVALID` 而落回上面那個迴圈——一個加速版實作可以直接掛在那裡，不用改 LVGL。
另外，**STM32U599 有 GPU2D（NeoChrom）**——`GPU2D_BASE`、`GPU2D_IRQn` 與
`stm32u5xx_hal_gpu2d.h` 在 vendored 的 CubeU5 裡都在——它可以用硬體做旋轉。兩者都不是
出貨必要，但在任何人下「這顆料上直向太慢」這個結論之前，值得先知道它們存在。

### 8.4 EDT 的記憶體預算才是真正的限制

要保住 DIRECT 模式，最直覺的做法是多一張緩衝區：直向畫進去，再轉進橫向的 frame buffer。
在 EDT 上這塞不下，而且差距不小。

從 linker script（`STM32U599NJHXQ_FLASH.ld:30`）與一份真實 build 的 map 檔：

```
FRAMEBUFFER   0x20000000  1024 KB   兩張 480×272×4 = 1020 KB      剩 4 KB
RAM           0x20100000  1472 KB
  .data + .bss                       1036 KB（其中 LVGL 的 pool 佔 1024 KB）
  到 _estack 為止的空閒                437 KB  ← 實測，firmware.map
```

第三張全螢幕 ARGB8888 緩衝區是 **510 KB**。它塞不進 FRAMEBUFFER 剩下的 4 KB，也塞不進
RAM 剩下的 437 KB——而那 437 KB 還得放堆疊。把 LVGL heap 縮小來挪空間，只是拿一個天花板
換另一個：`hmi.ts:231` 已經記錄這塊板子的 1 MB heap「是三塊裡最低的」，而且它正是限制
變形 widget 的那個上限。

Partial 模式反而塞得很輕鬆，因為它讓**第二張 frame buffer** 變成不需要——LTDC 從頭到尾
只掃一張。這就在 FRAMEBUFFER 區釋出 510 KB 給 partial 算繪緩衝區用，而後者根本用不了
那麼多。兩塊半螢幕的橫帶是 2 × 255 KB；LVGL 自己建議的「螢幕的十分之一」則是 2 × 52 KB。

另外兩塊板子完全沒有記憶體問題。F746G 在 frame buffer 之上還有 7 MB SDRAM，裡面放著 4 MB
的 LVGL heap（`STM32F746NGHx_FLASH.ld:28`），而 H747I 根本不需要走這條路（§8.1）。有一個
F746G 專屬的最佳化值得記下來：它的 partial buffer 小到（RGB565 之下 480×34×2 = 每塊
32 KB）可以放在**內部的 240 KB RAM** 而不是 SDRAM，這很重要，因為旋轉迴圈的跨步讀取幾乎
是 SDRAM 最糟的存取樣式。

### 8.5 真正要決定的是撕裂，不是旋轉

失去 DIRECT 模式，就等於失去 EDT 驅動註解特別捍衛的那個「不撕裂的交換」：

> 「把畫好的橫帶複製進正在顯示的 frame buffer，只要複製跨過掃描光柵就會撕裂——在一個
> 持續重畫的控制項上最明顯，例如正在被拖動的 slider。」

那段註解描述的正是天真的 partial 模式會做的事。三條出路，代價由低到高：

1. **接受它。** 對一個主要手勢就是拖 slider 的產品來說，這是錯的。
2. **讓搬移與掃描同步。** LTDC 的 `CPSR` 暫存器給出光柵的即時位置，而
   `ltdc_is_scanning` 已經在讀它（`board_display.c:293`）——等光柵的機制本來就在。記憶體
   便宜，但會增加延遲，而且當一條橫帶剛好跨在光柵上時會很囉唆。
3. **保留兩張 frame buffer 並補寫。** 把橫帶轉進背景那張，照今天的方式在垂直空白期交換，
   然後把同一塊轉好的矩形複製進另一張，讓兩張都保持最新。代價：一次旋轉加一次直接的
   矩形複製，而第二步 DMA2D 可以做，不花 CPU。記憶體：兩張 frame buffer 都留著，partial
   緩衝區從 437 KB 的 RAM 裡出——2 × 100 KB 之後還剩 237 KB，夠用，但應該對照堆疊的實際
   最高水位再確認一次。

**建議採（3）。** 它保住了現行驅動當初就是繞著它設計的那個性質，而且它是失敗模式為
「一個效能數字」而不是「一個看得見的瑕疵」的那個選項。它也是最花工的。

### 8.6 韌體總表

| 板子 | 機制 | CPU | RAM | 工作量 |
|---|---|---|---|---|
| STM32H747I-DISCO | 面板 MADCTR，改成 `LCD_ORIENTATION_PORTRAIT` | 無 | 無 | **數小時**——一個常數、寬高對調、重驗觸控 |
| STM32F746G-DISCO | PARTIAL + `lv_draw_sw_rotate` | 每次 flush 一次旋轉 | 兩塊小緩衝區，內部 RAM 放得下 | **數天**——重寫顯示驅動 |
| EDT EVK043027B | PARTIAL + `lv_draw_sw_rotate` | 每次 flush 一次旋轉，最壞估 5–8 ms | 要重新配置記憶體才塞得下，§8.4 | **數天**——重寫顯示驅動 + 決定撕裂策略 |

## 9. 方向怎麼傳到韌體

韌體是每塊板子一份簽入的樣板；專案貢獻的是產生出來的 `.c`。所以方向必須跨過這條界線，
而這個 repo 已經有現成的正確做法。

`hmi_runtime.c:48` 宣告了一個 weak 預設值，由產生的程式碼以強定義覆寫：

```c
__weak const hmi_runtime_config_t hmi_runtime_config = { .enabled = false, ... };
```

而 `hmiBindingGenerator.ts:241` 負責吐出那個強定義。一個什麼都沒產生的專案照樣連結、照樣
跑得起來。

**建議：照抄這個做法。** 一個帶著方向的 `hmi_display_config_t`，在 `board_display.c` 裡
weak 預設為橫向，由產生器給出強定義。三個性質讓它勝過其他選項：

- **一份沒有任何產生原始碼的韌體樣板仍然編得過、跑得起來**——跟 `hmi_runtime_config`
  是 weak 的理由完全一樣。
- **它是資料，不是前置處理器狀態**，所以兩種 frame buffer 佈局與兩條 flush 路徑都會被
  編譯、都可測試，而不是任何一次 build 都有一半對編譯器隱形。
- **它待在現有的 build 契約裡面。** 另一個選項——把 `-DHMI_DISPLAY_ROTATION=90` 穿過
  `build.ps1`（`scripts/build.ps1:51`）與 `service.ts`——是在一條目前只傳路徑的管線上多加
  一個參數，而且三份 build script 加上呼叫它們的服務都要一起改。

有一件事要做對：`board_display_init` 必須在建立 LVGL display **之前**讀到它，也就是說它
必須是編譯期初始化的 const，不能是之後才設定的東西。而它就是。

## 10. 圓形面板

提案提到圓形畫布以中心點旋轉。目前支援的三塊板子沒有一塊是圓的——`docs/components/`
裡的 `circle.md` 講的是圓形 **widget**，不是顯示形狀——所以今天這裡沒有東西要實作。

值得把它的意思寫下來，因為它不是「一樣，只是圓的」。把一個圓以中心點轉 90° 得到的是同一個
圓，所以**設計面的形狀完全不變**。變的只是哪一邊是「上」：widget 座標、觸控轉換、面板掃描
方向全都跟矩形一樣照轉，只有畫布外框留在原地。也就是說，圓形面板還需要一個矩形板子不需要
的**第三**份狀態——板子定義上的顯示**形狀**——方向對它才有任何看得見的意義。那是另一個
功能，而這個功能不該為它預作準備，頂多就是把 `orientation` 留成字串而不是布林值。

## 11. 如果由我來做，順序是

1. **編輯器，§7 全部，加上 H747I 的韌體改動（§8.1）。** 這就是一塊板子上端到端的完整
   功能，而花的時間跟只做編輯器差不多。Emulator（§4.4）能獨立於任何板子驗證編輯器
   那一半，所以出錯時可以明確知道是哪一半錯。
2. **`orientations` 從第一天就開始擋（§3）**，讓 EDT 與 F746G 在驅動落地之前只提供
   Landscape。一個編得過但畫出雜訊的專案，比一個只有一個選項的下拉選單更糟。
3. **在同一次變更裡修掉或標註 WASM 預覽（§4.4）**，因為它會是第一個看起來壞掉的東西。
4. **EDT 驅動（§8.3–§8.5）**，當作獨立的一件工作，並且在決定撕裂策略之前先自己量一次
   旋轉成本。
5. **F746G 放最後**，直接移植 EDT 那邊得到的結論。

第 4、5 步是應該分開估的。第 1–3 步不依賴它們，而第 1–3 步才是讓這個功能對使用者成真的
部分。

## 12. 會過期的文件

- [lvgl-configuration.md](./lvgl-configuration.md)——多一節旋轉；render mode 的說法變成
  跟板子與方向有關。
- [color-depth.md](./color-depth.md)——它那份「四個地方都得一致」的清單會多第五項，因為
  LVGL 的顯示解析度現在必須對上面板**旋轉後**的幾何，而不是它字面上的尺寸。
- [preview-ladder.md](./preview-ladder.md)——§3 對 Simulator 證明了什麼的說法，在解析度
  這件事上本來就錯（§4.4），之後會更錯。
- [edt-evk043027b.md](./edt-evk043027b.md)——§8.4 的記憶體預算應該放在那塊板子既有的 SRAM
  帳目旁邊。
- `README.md` / `README.zh-TW.md`——功能列表。
- `CHANGELOG.md` / `CHANGELOG.zh-TW.md`。

以上每一份在 `docs/zh-TW/` 都有對應的鏡像，要一起改。

## 13. 待決問題

1. **H747I 的觸控在直向下真的是 `TS_SWAP_NONE` 嗎？** 這是從一段註解推理出來的，而那段
   註解存在的理由正是推理失敗過。必須上板用 `board_touch_log` 量（EDT 的對應物在
   `board_display.c:173`）。
2. **旋轉迴圈在 U599 上實際要多少時間？** §8.3 的 5–8 ms 是估算。它決定 §8.5 的選項（3）
   付不付得起。
3. **ET043027 面板有沒有掃描方向接腳？** 有些 parallel RGB 面板會把水平／垂直翻轉做成
   硬體選線。那不會給出 90°，但它能定案 180° 安裝在這裡是不是免費的——也就是 §3 刻意
   延後的那個欄位。
4. **EDT 上 437 KB 的空閒 RAM 夠不夠放兩塊 partial buffer 加堆疊？** map 檔給的是靜態
   數字；堆疊在負載下的最高水位不在裡面。

## 14. 實際做了什麼，以及 §1–§13 在哪裡錯了

在 `feat/display-orientation` 上實作。上面有兩項建議沒有撐過實際接觸，而且兩項都是依使用者
指示推翻的，不是因為出現新證據。

### 14.1 建立之後可以改方向——§6 被推翻

§6 建議在建立時定案，理由是轉外框會讓 widget 的**內容**維持直立。需求是無論如何都要能在
Project Settings 改，所以就讓它能改。

§6 的論證仍然是對的，而且實作沒有假裝不是。`utils/rotateLayout.ts` 只轉外框；對話框在**存檔
之前**就顯示哪些東西不會跟著轉，而不是事後才說；整個旋轉是一筆 `saveToHistory()`，所以
Ctrl+Z 收得回來。§6 沒提到的是遞迴那一段：子元件的座標是相對於父層的，所以每一棵子樹是在
父層**旋轉前**的框裡轉，不是在畫布裡轉。`utils/__tests__/rotateLayout.test.ts` 用八個測試把
這件事釘住，包含來回轉一圈。

有一件不明顯但非做不可的事：**要把 `align` 清掉**。有對齊設定的 widget 是由 LVGL 從錨點定位
而不是靠 x/y，所以轉了外框卻留著錨點，等於讓它移動兩次。

### 14.2 兩個方向永遠都提供——§3 的閘門換了位置

§3 原本讓 `orientations` 決定 New Project 對話框**顯示**什麼，那樣 EDT 與 F746G 就只會出現
Landscape。這是錯的，而且理由是通訊協定那邊早就知道的那個：設計端裡面沒有硬體，一個專案在
韌體還不存在的方向下排版與預覽，是有意義的。

所以 `orientations` 現在管的是**能不能編譯**，不是能不能設計——正好是
`ProtocolDefinition.implemented` 的那個切法。兩個方向在兩個對話框裡都出現；驅動不了的那個標上
「— no firmware support yet」，提示文字說明專案仍然可以設計與預覽，而 Deploy 分頁會帶著具體
理由拒絕編譯。判斷式是 `boardCanDriveOrientation()`，它讀的是 `getDrivableOrientations()`。

這同時也修正了 `normalizeOrientation`：第一版會在板子驅動不了時把直向專案降級成橫向。那會在
載入時默默把作者的畫布改掉——而那正是 §2 那條不變式存在要防的唯一一件事。

### 14.3 §4.1 的修法長什麼樣

跟預測的一樣：`ProjectSettings.handleSave` 直接從板子推導寬高，會在使用者只是改個名稱時把每
一個直向專案壓平。現在改成走 `logicalResolution(boardId, orientation)`，也就是 §4.1 要的那個
單一定義，New Project 對話框與 Project Settings 都用它。

### 14.4 韌體那份契約

照 §9 設計：`hmi_display_config_t` 宣告在每塊板子的 `board_display.h`，在各自的
`board_display.c` 裡 weak 預設，再由 `codegen/displayConfigGenerator.ts` 產生的
`hmi_display_generated.c` 給出強定義。沒有任何產生原始碼的樣板照樣連結、照樣以橫向開機。

H747I 會真的照著做（§8.1）——`LCD_ORIENTATION_PORTRAIT`、把對調後的寬高傳進
`BSP_LCD_InitEx`、`lv_display_create` 用轉過的解析度，而 render mode 與 frame buffer 完全不動。
F746G 與 EDT 則是**拒絕**：`board_display_init` 對非橫向直接回傳 false，讓一份本來就不該存在的
設定變成「螢幕不亮」並直接指向那一行，而不是變成一張看起來像 LVGL bug 的剪切畫面。

對 §8.1 的一項更正：觸控要改的**只有**方向旗標。`touch_init.Width`/`Height` 在兩個方向都必須
維持 800x480，因為 BSP 只把它們當成一個比例的分子，分母是固定的
`FT6X06_MAX_X/Y_LENGTH`——它們不是夾限值，儘管看起來很像。讓它們跟著方向走，會把每一次觸控
壓進螢幕的左半邊。旗標本身的選擇（直向用 `TS_SWAP_NONE`）仍然是推理而非量測；§13 的第一個
待決問題依舊成立。

### 14.5 WASM 預覽

§4.4 給了「修掉它，或標註它」兩個選項。結果兩個都做了，因為這裡沒有 `emcc`，而
`public/wasm/lvgl_wasm.wasm` 是簽入的二進位檔，在這個環境重建不了：

- `wasm/src/main.c` 現在用 `lv_sdl_window_set_size` 實作了 `set_screen_size`，並且把顯示建成
  480x272，而不是那個對不上任何板子的 480x320。重建之後就會生效。
- `_set_screen_size` 在簽入的二進位檔裡**本來就已經匯出**，所以 `wasm/shell.html` 與已建置的
  host page 都可以先接上新的 `set-screen-size` 訊息，不需要重建。
- `WasmPreview.tsx` 在送出尺寸之後量 iframe 裡的 canvas，如果 runtime 沒有照做，就在頁尾明講。
  那行提示會在新的 `.wasm` 換上去的瞬間自己消失，所以它不會過期。

### 14.6 已用 ARM 工具鏈驗證

評估當時以為韌體只能用推理的；這台機器上裝了
`C:\ST\STM32CubeCLT_1.22.0`，所以全部都真的編了：

| 檢查項目 | 結果 |
|---|---|
| EDT 帶著產生的橫向設定編譯 | text 293,032 B，連結乾淨 |
| 產生的強定義勝出 | `hmi_display_config` 解析到 `hmi_display_generated.c.obj` |
| **沒有**產生設定的樣板照樣連結 | 解析到 `board_display.c.obj`，映像大小相同 |
| H747I 帶著**直向**設定編譯 | text 283,952 B，`-Wall -Wextra` 之下 `board_display.c` 零警告 |

所以 §9 那份契約兩個方向都成立，而那正是最容易無聲失敗的一段。仍然沒有驗證的是**行為**、
不是連結：這裡沒有任何東西能證明 H747I 真的會以直向開機，§13 的觸控問題也不會因為編譯
成功而有任何改變。

### 14.7 還沒做的

- **EDT 與 F746G 的顯示驅動**（§8.3–§8.5）。直向在兩塊板子上都能設計、能預覽，都不能編譯。
  這是剩下最大的一塊，而且上面所有東西都不依賴它。
- **重建 `lvgl_wasm.wasm`**，需要 `emcc`。
- **H747I 直向的觸控對應**，需要板子。

## 15. EDT 驅動，以及差點跟著一起出貨的那個 bug

§8.3 的 partial mode 直向路徑做好了。過程中跑出兩件評估沒有預測到的事，而第一件才是重點。

### 15.1 在自己的編譯單元裡讀 `__weak const`，會被摺掉

§9 選了 `hmi_runtime_config` 的做法——板子自己的檔案裡放 `__weak` 預設，由產生的程式碼以強
定義覆寫——並且把預設放在 `board_display.c`，就在讀它的程式碼旁邊。這是錯的，而且錯在最糟
糕的那一種：**編得過、連結得過、linker map 顯示強定義勝出，而韌體完全不理它。**

當一個 `const` 物件的定義在同一個編譯單元裡看得見時，GCC 可以直接從它的初始值讀出結果，
而且即使帶著 `__weak` 它也真的這麼做了。所以在編譯 `board_display.c` 時：

```c
const bool portrait =
    hmi_display_config.orientation == HMI_DISPLAY_ORIENTATION_PORTRAIT;
```

被摺成 `false`，整條旋轉路徑變成死碼，`--gc-sections` 接著把它引用的兩塊 51 KB 繪製緩衝區
丟掉，於是直向的映像檔跟橫向的**一個位元組都不差**。

會被抓到，只因為 partial buffer 留下了一個看得見的痕跡：它們出現在 map 檔的
*Discarded input sections* 裡。這次 build 其他地方看起來都沒有問題。

**這讓 §14.4 有一部分作廢。** 那裡記錄的 H747I 檢查——「產生的強定義勝出，
`hmi_display_config` 解析到 `hmi_display_generated.c.obj`」——是真的，但不是當時以為的意思。
符號確實解析到產生的目的檔；而 **`board_display.c` 裡面那些讀取**在編譯期就已經對著本地的
weak 定義摺掉了，所以那份韌體不論專案怎麼寫都會以橫向開機。修正後重建，H747I 的 `.text`
多了 32 個位元組：那條直向分支，從死裡回來了。

修法是結構性的，不是小聰明。weak 預設在三塊板子上都搬進自己的檔案
`src/board_display_config.c`；`board_display.c` 現在只看得到 `board_display.h` 裡的 `extern`
宣告，沒有初始值可以摺。`hmi_runtime_config` 是誤打誤撞躲過同一個陷阱——它的讀取都是透過
`main.c` 傳進去的指標。

**通用的教訓，值得帶到這個 repo 未來任何一份 weak symbol 契約：連結期的符號檢查，不能證明
那個值是在連結期被讀取的。** 該驗證的是兩種設定會不會產生**不同的**韌體。

### 15.2 EDT 驅動做了什麼

`lv_display_create` 仍然吃面板的 480x272——LVGL 會把它保留為 original，只對調 UI 看到的那一
組，所以畫面出來是 272x480，而 frame buffer 維持面板的形狀。接著是 `LV_DISPLAY_ROTATION_90`
與 `LV_DISPLAY_RENDER_MODE_PARTIAL`，配兩塊 272x48x4 的繪製緩衝區——那是邏輯螢幕的十分之
一，也正是 LVGL 在 `get_max_row` 裡從位元組數反推回來的 48 列。

每次 flush 把一條橫帶轉進 LTDC **沒有**在掃的那張 frame buffer，位置用
`lv_display_rotate_area`、像素用 `lv_draw_sw_rotate`。一次刷新的最後一條橫帶進來時，兩張在
垂直空白期交換，然後把剛寫過的那個框複製到另一張，讓兩張持有同一幅畫面——這是 §8.5 的選項
（3），會這樣選是因為 partial mode 只重畫變動的部分，否則 LVGL 下一次要畫進去的那張會是上
上一幀。所以 direct mode 驅動當初繞著它設計的那個「不撕裂」性質被保住了。

觸控是在 `touch_read` 裡轉的，不是在 vendored 驅動裡——後者在兩個方向都照樣映射到面板自己
的座標系，而驅動就這樣原封不動傳下去，因為 LVGL 自己會轉。§15.6 記錄了這段話原本錯在哪裡。
bring-up 記錄存原始讀值，旁邊再存一份 LVGL 轉完之後真正拿去 hit-test 的點。

### 15.3 成本，能量的都量了

| | 數值 |
|---|---|
| `.text` | 294,792 B |
| `.bss` | 1,173,940 B（兩塊繪製緩衝區多佔 104,448） |
| 到 `_estack` 的空閒 RAM | 334.7 KB，而堆疊只要 8 KB |

兩塊 51 KB 繪製緩衝區是靜態的，所以在橫向也一樣佔 102 KB，而那裡根本沒人讀它們。這是刻意
的取捨，另一個選項是放棄第二張 frame buffer、在 frame buffer 區釋出 510 KB——那會讓直向免
費，但會把撕裂帶回來。仍然剩 334.7 KB，說明這個取捨付得起。

### 15.4 板子給出的答案，以及那個估錯的數字

上板實測，全螢幕刷新，DWT cycle 數，160 MHz：

| | cycles | ms |
|---|---|---|
| 旋轉（`lv_draw_sw_rotate`，130,560 px） | 976,238 | **6.1** |
| 補寫複製（522,240 B） | 3,283,727 | **20.5** |

旋轉落在 §8.3 估的 5–8 ms 之內。複製沒有，而且它根本沒被估過——當初寫的是「先用直接複製，
讓成本在被最佳化掉之前先被量到」，而量出來是每個**位元組** 6.3 個 cycle。

原因是 `--specs=nano.specs`：newlib-nano 是以 `PREFER_SIZE_OVER_SPEED` 建置的，它的 `memcpy`
是一次一個位元組的迴圈。

換成一次四個字的展開迴圈之後，在同一塊板子上量到：

| | 修正前 | 修正後 |
|---|---|---|
| 補寫複製 | 3,283,727 cycles（20.5 ms） | **530,517 cycles（3.32 ms）** |
| 每位元組 | 6.29 cycles | **1.02 cycles** |
| 最壞刷新（含旋轉） | 26.6 ms | **9.5 ms** |

也就是把一次全螢幕直向刷新拉回它自己 16.6 ms 的幀之內，而且還有餘裕。旋轉沒有動，重量到
982,985 cycles（6.14 ms），所以它現在是兩者中較大的一項，也是 DMA2D 或這顆料的 GPU2D 下一步
該接手的東西——而那個決定現在可以對著數字做，不是用猜的。

這件事的影響不只是幀率。一次 6.1 + 20.5 ms 的刷新會超出它自己 16.6 ms 的幀，主迴圈裡其他
所有東西都得等——包含 LVGL 的輸入輪詢。**一個慢到來不及輪詢自己觸控螢幕的顯示，表現出來
就是一個要按兩次的觸控螢幕**，也就是這次調查的起點，而觸控路徑本身沒有任何地方是錯的。

觸控記錄另外印證了這一點：358 次按壓，面板 X 落在 4..466、Y 落在 18..260，而每一個 logical
點都正好是它面板點的轉換——面板 (23, 220) 進來變成 logical (51, 23)，也就是 `271 - 220` 與
`23`。這個映射從頭到尾都是對的。

**沒有被量到的，是任何會跑起來的東西。** 旋轉迴圈每次刷新的成本（§8.3 估最壞 5–8 ms）、
交換與補寫跟不跟得上 60 Hz、以及觸控轉換對不對，全都需要板子。EDT 現在在編輯器裡提供
Portrait，正是為了讓這些可以被試出來。

### 15.5 變更方向不再移動 widget

Project Settings 原本在方向改變時把整個版面轉四分之一圈——也就是 §6 那個外框轉換，實作在
`utils/rotateLayout.ts`。依作者指示已經移除，而理由值得留下來，因為那正是 §6 當初用來反對這
個功能的同一套理由。

轉外框會動到別人親手擺好的版面，而且它轉不動框**裡面**的東西：一個 100x40 的 label 會變成
40x100，而文字仍然由左往右跑。所以這個操作看起來無損，其實不是。現在變更方向只會重塑畫布，
每個 widget 的座標原封不動；對話框改成告訴你哪些 widget 會落到新畫布之外，而不是假裝已經
幫你處理好了。

`rotateLayout.ts`、它的測試、以及 `rotateLayout` 這個 store action 都直接刪掉而不是留著不
用——轉換公式本身記在 §6，等哪天真的要設計一個「旋轉這個專案」指令時再拿出來。

### 15.6 觸控轉換被套用了兩次

直向的觸控點會落在錯的位置，原因是 §8.3 與 §15.2 裡一句根本不成立的斷言：**LVGL 自己會轉
輸入點。**

`indev_pointer_proc` 在 hit-test 之前會呼叫 `lv_display_rotate_point(i->disp, &data->point)`
（`lv_indev.c:742`），而該函式對 `ROTATION_90` 算的是 `point->x = ver_res - y - 1;
point->y = x`——跟驅動在 `touch_read` 裡做的是**同一個**轉換。轉兩次四分之一圈就是半圈，所以
面板上 `(x, y)` 的按壓，到了 LVGL 手上變成 `(271 - x, 271 - y)`：面板上大部分位置都落到畫面
外，只有按下**對角**時才會壓到 widget。這正是回報的症狀——「馬上有反應，但位置是偏的」。

這句斷言會寫進文件，是因為當初的搜尋字串是 `"rotation"`，而那個函式叫 `rotate_point`。一次
搜不到的 grep，和一次真的不存在的 grep，看起來一模一樣——而這一次它被當成肯定的事實寫進了
兩個地方，而不是被當成「沒有證據」。

修法是把驅動裡的轉換刪掉：`touch_read` 現在在兩個方向都交給 LVGL 面板座標，只做夾限，因為
vendored 那條鏈確實會回報到面板之外（§15.1 的 `- 10` 縮放與 `size - brute_y` 少減一）。夾限
是驅動現在唯一還欠的修正。

**為什麼這件事很難看出來**，值得記下來，因為所有顯而易見的檢查都沒抓到它：

- 顯示對照 framebuffer 驗證過是對的——按鈕確實畫在映射所說的位置。
- 驅動自己的轉換也驗證過是對的——記錄顯示 `panel(143,77) -> logical(194,143)`，算術上分毫不差。
- 兩邊**各自**都對。而任一邊都沒有任何跡象暗示還有第三方會再轉一次。

最後定位到它的，是從執行中的目標讀出 `disp->act_scr`，發現它仍然指著當下已經顯示的那個畫面：
按壓有進來、座標自洽、而 click 沒有觸發——這就排除掉了除「驅動交出去之後點又被移動」以外的
所有可能。

有一個檢查本來可以早得多抓到它，而那就是教訓：**會轉換座標的驅動，該驗證的是框架真正拿去
hit-test 的東西，不是自己的算術。** 記錄現在同時存面板讀值與 `lv_display_rotate_point` 之後
的結果，兩者可以直接跟 widget 座標對照。

H747I 不受影響：那裡是面板自己透過 MADCTR 轉，`lv_display_set_rotation` 從未被呼叫，所以
`lv_display_rotate_point` 是 no-op，BSP 的 `TS_SWAP_*` 旗標仍是唯一的轉換。
