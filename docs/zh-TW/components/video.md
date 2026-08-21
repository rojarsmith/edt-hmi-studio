# Video (video) — 影片元件設計文件

<p align="center">
  <a href="../../components/video.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 元件名稱與簡介

Video（影片）從面板的 SD 卡上播放影片。它是唯一一個內容不屬於專案的元件：檔案在這裡
是被**指名**的，不是被匯入的，關於它的任何東西都不會進入韌體映像檔。一段兩小時的片子
花掉的建置空間和兩秒鐘的一模一樣——零——而要換片就換卡，不必重新建置。

格式是 **AVI 容器裡的 Motion JPEG**，由板子的 JPEG 硬體逐格解碼，色彩轉換交給
DMA2D。這不是偏好問題：在一顆同時還要畫使用者介面的 Cortex-M7 上，沒有別的東西能用
24 fps 播得動。完整設計見 [docs/zh-TW/video-playback.md](../video-playback.md)。

Video 不是容器元件（`isContainer = false`），不能包含子元件——執行期會把自己的圖片與
訊息標籤放進去。

## 2. 類型識別碼

```
type: 'video'
```

## 3. 所屬類別

| 欄位 | 值 |
|---|---|
| 類別 id | `misc` |
| 類別名稱 | Miscellaneous（雜項） |
| 類別圖示 | 🧩 |
| 元件圖示 | 🎬 |

Miscellaneous 收的是不屬於上面任何一族的元件。影片不是控制項、不是圖形、也不是圖表
——它是一塊面板，上面播著韌體在放的東西。

## 4. 預設尺寸

| 屬性 | 值 |
|---|---|
| defaultWidth | 400 |
| defaultHeight | 240 |

> 800×480 的一半：面板自己的長寬比，而這個大小在畫布上還留得下位置放別的東西。
>
> **請把元件設成影片自己的解析度。** 1:1 時 LVGL 直接搬運每一格；其他任何尺寸都會讓
> 每一格在 CPU 上、以播放速率被重新縮放。見[§12](#12-設計說明)。

## 5. 是否為容器

```
isContainer: false
```

什麼都放不進去。執行期會自己建立兩個子物件——一個 `lv_image` 放解出來的影格，一個
`lv_label` 承載面板要說的話——而編輯器再放第三個進去只會蓋在畫面上。

## 6. 父子關係規則

### 可作為以下元件的子元件

- **Screen（頁面根節點）** — 最常見的用法，通常整頁鋪滿
- **Container (obj)** — 放在面板裡，旁邊配一段說明
- **Tab View (tabview)** — 放在分頁內容區
- **Tile View (tileview)** — 放在圖磚裡
- **Window (win)** — 放在視窗內容區

### 可包含的子元件

無。

> **一頁一個。** 只有一顆 JPEG 硬體、一組緩衝區，所以執行期播的是已載入畫面上的第一個
> Video 元件，其他的會顯示 *Another video is playing*。跨多個畫面各放一個是很平常的
> 用法，而且可以運作。

## 7. 屬性 (props)

| 名稱 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `fileName` | `string` | `''` | 要播的檔案，就用它在 SD 卡**根目錄**裡的名字。是名字，不是路徑。 |
| `autoPlay` | `boolean` | `true` | 載入帶著這個元件的畫面時就開始播。 |
| `loop` | `boolean` | `true` | 播完最後一格之後，從第一格再來一次。 |

### props 型別

```typescript
interface VideoProps {
  fileName: string;
  autoPlay: boolean;
  loop: boolean;
}
```

### 關於這些屬性

- `fileName` 用打的，不是用選的。編輯器沒有辦法讀 SD 卡，所以沒有東西可以瀏覽——而且
  不會建立任何資源，這正是任何長度的片子都免費的原因。
- `fileName` **留空不會被擋下**。這個元件的行為和填錯名字時完全一樣：面板畫出
  *Video not found*。站在看著面板的人的角度，這兩件事是同一個失誤。
- `autoPlay` 關掉時，元件會停在黑框上，直到有人呼叫 `hmi_video_play`。編輯器目前還
  沒有任何動作綁上去——見
  [docs/zh-TW/video-playback.md §7](../video-playback.md#7-這裡刻意不做的事)。
- `loop` 關掉時，檔案播完會把**最後一格留在畫面上**。轉黑看起來會像失敗，而影片明明
  完全照著要求做完了。

### 編輯器會檢查什麼

只是提醒，永遠不擋——而且只查那些不管卡片上有什麼都一樣錯的事：

| 打進去的內容 | 提醒 |
|---|---|
| *(空白)* | 還沒填檔名。請照卡片根目錄裡的名字打上去。 |
| `clips/intro.avi` | 執行期從卡片根目錄開檔，所以這裡填的是名字而不是路徑。 |
| `intro.mp4` | 只讀 AVI 容器。 |

其餘的——卡片上沒有這個名字、檔案的影像軌不是 Motion JPEG——都等面板來說。

## 8. 樣式系統

### 支援的樣式狀態

| 狀態 | 選擇器 | 說明 |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | 預設／一般狀態 |

執行期永遠不會把這個元件推進按下、聚焦或停用狀態，所以只有靜止狀態有作用。

### 預設狀態樣式

| 樣式屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `bgColor` | `string` | `'#000000'` | 空的畫格。黑色，因為空的影片畫格就是黑的。 |
| `borderColor` | `string` | `'transparent'` | 無邊框 |
| `borderWidth` | `number` | `0` | 無邊框，所以元件本身就是畫面 |
| `borderRadius` | `number` | `0` | 直角 |
| `textColor` | `string` | `'#ffffff'` | **面板寫訊息時用的顏色** |
| `opacity` | `number` | `1` | 不透明 |
| `padding` | `number` | `0` | 無，讓畫面貼到邊 |

### 這些預設值從哪裡來

不是從 LVGL 佈景主題來的。影片畫格不是卡片、也不是控制項——它是一張畫面，而沒填滿
畫面的那塊底就是黑的。讓佈景主題的白色從加了黑邊的畫格透出來，正是這組預設值存在
要防的唯一一件事。

`textColor` 在這裡不是裝飾：執行期建立的訊息標籤是這個元件的子物件並繼承它，所以
**Text Color** 就是決定 *Video not found* 長什麼樣子的那一列。

### 擴充樣式屬性

沒有。這個元件不在陰影、變形、漸層、外框、捲軸、文字樣式與混色模式的任何一組裡，
所以屬性面板全部隱藏。對一個每秒被換掉 24 次內容的元件做變形，等於每一格都要重建
一次它的圖層。

## 9. 支援的事件

| 事件 | 說明 |
|---|---|
| `LV_EVENT_CLICKED` | 點擊 |
| `LV_EVENT_PRESSED` | 按下 |
| `LV_EVENT_RELEASED` | 放開 |
| `LV_EVENT_LONG_PRESSED` | 長按 |

> 影片不是控制項，預設也不可點擊。要在它身上綁一個點擊——例如點一下片頭就跳到下一頁
> ——和在其他任何元件上綁的方式相同。

## 10. UI 繪製層

### 10.1 編輯器畫布 (CanvasComponent.tsx)

`CanvasVideoContent` 畫出畫面將要佔住的那個框，加上一個播放符號、檔名，以及標示畫面
載入時這個元件會做什麼的小標籤：

```tsx
<CanvasVideoContent
  fileName={props.fileName}
  autoPlay={props.autoPlay !== false}
  loop={props.loop !== false}
  textColor={defaultStyle.textColor || '#ffffff'}
/>
```

主要行為：

- 不捏造劇照。編輯器從來沒看過那個檔案，而一張虛構的縮圖會是畫布上唯一一個不是從專案
  推導出來的東西。
- 沒填檔名的元件顯示 **No file named**，並帶上 `unnamed` class——這是編輯器唯一能在
  面板之前抓到的失敗。
- 小標籤寫 `AUTO · LOOP`，哪一項關掉就少哪一項。
- `resolveFallbackBackground('video')` 回傳 `'transparent'`：這個元件自帶一份它自己
  擁有的黑色填色，而把那份填色清掉是刻意的選擇，畫布不可以再幫它補回去。

### 10.2 原型預覽 (PreviewPanel.tsx)

`drawVideo` 在 Canvas 2D 預覽上畫同樣的東西：黑框、一個依短邊決定大小的播放三角形、
檔名，以及那些小標籤。

```typescript
drawVideo(ctx, x, y, w, h, {
  fileName: comp.props.fileName,
  autoPlay: comp.props.autoPlay !== false,
  loop: comp.props.loop !== false,
  bgColor: bgColorStyle,
  textColor,
});
```

原型預覽不播任何東西，而且刻意不假裝在播。

### 10.3 模擬器

#### JSON 序列化 (editorStateToJson.ts)

屬性原樣通過：

```json
{
  "type": "video",
  "id": "comp-xxx",
  "parent": null,
  "x": 0, "y": 0,
  "width": 800, "height": 480,
  "props": { "fileName": "intro.avi", "autoPlay": true, "loop": true },
  "styles": { "default": { "bgColor": "#000000", "textColor": "#ffffff" } }
}
```

#### C 端建立 (ui_from_json.c)

```c
static lv_obj_t *create_video(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *frame = lv_obj_create(parent);
    lv_obj_remove_flag(frame, LV_OBJ_FLAG_SCROLLABLE);
    /* ... */
    lv_label_set_text_fmt(text, LV_SYMBOL_VIDEO " %s\nNot played in the Emulator", file);
}
```

Emulator 跑的是真的 LVGL、真的畫面定義，但瀏覽器分頁唯一沒有的東西，就是面板的
讀卡機。在那裡顯示 *Video not found* 會是另一種宣稱——宣稱卡片被看過而且是空的
——而只有面板能這樣說。

### 10.4 產生的程式碼 (ui.c.ts)

```c
// Create video: Intro Clip
ui_intro_clip = lv_obj_create(ui_screen_main);
lv_obj_set_pos(ui_intro_clip, 0, 0);
lv_obj_set_size(ui_intro_clip, 800, 480);
lv_obj_set_style_bg_color(ui_intro_clip, lv_color_hex(0x000000), 0);
lv_obj_set_style_bg_opa(ui_intro_clip, LV_OPA_COVER, 0);
lv_obj_set_style_border_width(ui_intro_clip, 0, 0);
lv_obj_set_style_radius(ui_intro_clip, 0, 0);
lv_obj_set_style_text_color(ui_intro_clip, lv_color_hex(0xFFFFFF), 0);
lv_obj_set_style_pad_all(ui_intro_clip, 0, 0);
lv_obj_remove_flag(ui_intro_clip, LV_OBJ_FLAG_SCROLLABLE);
hmi_video_attach(ui_intro_clip, "intro.avi", true, true);
```

以及，只有在專案裡真的有影片時才會出現：

```c
#include "hmi_video.h"
```

主要行為：

- 元件本身就是一個普通的 `lv_obj`——那塊黑框。填進去的東西屬於執行期，不屬於產生器。
- 捲動被清掉：畫面剛好填滿那個框，觸控面板上誤觸的拖曳不可以把它滑走。
- 檔名會被逸出成 C 字串常值再交出去。什麼都沒有被連結進來；去找它的是執行期。
- 沒填檔名的元件仍然會產生 `hmi_video_attach(obj, "", …)`，所以回報的是面板。
- `hmi_video.h` 這行 include **只有**在某個畫面帶著影片時才會產生，這樣沒有影片的
  專案就不會平白多出一份對它從來沒要求過的硬體的相依。

## 11. LVGL API 對應

### 建立

| 版本 | API | 說明 |
|---|---|---|
| LVGL v9 | `lv_obj_create(parent)` | 接著 `hmi_video_attach` |
| LVGL v8 | `lv_obj_create(parent)` | 相同；執行期以 v9 為目標 |

### 執行期介面

宣告在 `firmware/stm32h747i-disco/include/hmi_video.h`：

| API | 說明 |
|---|---|
| `hmi_video_attach(frame, file_name, auto_play, loop)` | 把元件綁到卡片根目錄裡的一個檔案。什麼都不開——元件第一次出現在使用中畫面時才讀卡。 |
| `hmi_video_play(frame)` | 開始播，或把播完的重新開始 |
| `hmi_video_pause(frame)` | 停在當下這一格 |
| `hmi_video_stop(frame)` | 回到第一格，並回到黑框 |

### 執行期在元件內部用到的東西

| API | 說明 |
|---|---|
| `lv_image_create` / `lv_image_set_src` | 解出來的影格，包成指向 ARGB8888 緩衝區的 `lv_image_dsc_t` |
| `lv_image_set_inner_align(LV_IMAGE_ALIGN_CONTAIN)` | 在元件的框裡維持長寬比 |
| `lv_image_cache_drop` | 告訴 LVGL 同一個描述子後面的像素已經換成別的了 |
| `lv_label_create` / `lv_label_set_text` | 訊息，繼承元件的文字顏色 |
| `lv_timer_create` / `lv_timer_set_period` | 一個計時器，週期取自 AVI 標頭的每格間隔 |

## 12. 設計說明

1. **指名，而不是匯入。** 這是這個元件的整體形狀。其餘的一切——沒有瀏覽按鈕、沒有資源
   條目、由面板來回報檔案不見——都是從這裡長出來的。

2. **把元件設成影片的大小。** `LV_IMAGE_ALIGN_CONTAIN` 意味著 800×480 的影片放在
   800×480 的元件裡會被直接搬運，完全不縮放。其他任何尺寸都會讓每一格在播放速率下被
   軟體縮放，而那是把 41 ms 預算花壞的唯一途徑。

3. **同一時間只有一個播放器。** 一顆硬體、一組緩衝區。執行期照註冊順序挑已載入畫面上
   的第一個 Video 元件——也就是它們在專案裡出現的順序，因此是使用者預測得到的順序。

4. **能不能建置由板子決定。** 只有 STM32H747I-DISCO 有 JPEG 硬體和 SD 插槽。用到這個
   元件的專案在另外兩塊板子上不能建置，Video 區塊與 Deploy 分頁都會說明。見
   [docs/zh-TW/video-playback.md §2](../video-playback.md#2-哪些板子播得動)。

5. **init 時什麼都不開。** 使用者從未造訪的畫面完全不會存取卡片、開機不會卡在一張沒插
   的卡上，而之後才插進去的卡也還是找得到。離開畫面再回來，也正是讓失敗的元件重試的
   方式。

6. **沒用到時不花錢。** 當沒有任何 `hmi_video_attach` 呼叫存在時，`--gc-sections` 會把
   執行期和它那 3.1 MB 的 SDRAM 緩衝區一起丟掉。在這塊板子上實測：帶影片的專案
   **多 20 KB Flash**，沒有影片的專案則逐位元組不變。

7. **沒有聲音。** 音訊串流會被跳過，不解碼。做檔案時請用 `ffmpeg … -an`；有沒有聲音
   影格都一樣，音訊軌只是讓檔案變大。見
   [docs/zh-TW/video-playback.md §7](../video-playback.md#7-這裡刻意不做的事)。

8. **三層預覽，沒有一層在播。** 畫布、Preview 與 Emulator 都只畫出那個框並寫上檔名。
   這不是之後要補的缺口——它們都沒有讀卡機，而在一個預覽全都由專案推導出來的編輯器裡，
   捏造一張劇照會是唯一的虛構。
