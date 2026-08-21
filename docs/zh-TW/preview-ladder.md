# 預覽階梯——三個預覽、一個 Deploy，各自證明得了什麼

<p align="center">
  <a href="../preview-ladder.md">English</a> · <strong>繁體中文</strong>
</p>

Preview 分頁背後為什麼有三階、它們的差別在哪、**Emulator** 跟 **Deploy** 是什麼
關係、這些答案有哪些其實已經被寫在別的地方了，以及——用產品的承諾去量——**如果只能留
一個，該留哪一個**（§8）。內容都對照過原始碼，不是憑印象。

§8 的答案後來被落實進產品本身了：打開 Preview 就是打開 **Emulator**，而在三階之間切換的
那一排，只有在原廠研發模式下才會畫出來（§1.1）。

在此之前這件事只以碎片的形式存在：[animation-model.md](./animation-model.md) 知道
Prototype 支援到什麼程度、[language-switching.md](./language-switching.md) §4.3
有一張漏掉其中一個的涵蓋度表、[font-integration.md](./font-integration.md) 與
[charset-trimming-design.md](./charset-trimming-design.md) 描述編譯路徑、
[lvgl-configuration.md](./lvgl-configuration.md) 記錄預覽的 LVGL 設定跟板子在哪裡
分家。沒有任何一份文件持有這座階梯本身，而那些碎片裡有三則是錯的；§6 記錄它們原本怎麼寫、
又被什麼改正。

## 1. 四個階，一眼看完

每一階都比下一階跑到「更多真實的東西」，代價也更高。這就是整個設計，而且是個好設計。

| | 📱 Prototype | 🖥️ Simulator | 🎛️ Emulator | 🚀 Deploy |
|---|---|---|---|---|
| **誰畫的** | 編輯器自己，HTML5 Canvas 2D | **真的 LVGL**，預先編好的 WASM | **真的 LVGL＋產生出來的 C**，當場編譯 | 真的 LVGL＋產生出來的 C，跑在 MCU 上 |
| **餵進去什麼** | 編輯器 store，直接餵 | 一份描述 UI 的 JSON | 每一個產生的 `.c`/`.h`，加上轉好的字型與圖片 | 整個專案檔 |
| **C 從哪來** | 沒有 C | 沒有 C | 瀏覽器裡的 `generateCode()` | **同一個** `generateCode()`，在伺服器上 |
| **要什麼工具鏈** | 不用 | 不用——`.wasm` 是簽進 repo 的 | `emcc` 與一份 LVGL checkout，都由 `npm run emulator:setup` 裝好 | CMake + Ninja + arm-none-eabi + STM32_Programmer_CLI |
| **延遲** | 即時、連動 | 連動，300 ms debounce | 數秒到數十秒 | 數分鐘 |
| **互動** | 模擬點擊、畫面切換、動畫 | 沒有 | 滑鼠與鍵盤轉進 LVGL | 面板自己的觸控 |
| **實作在** | `Preview/PreviewPanel.tsx`，2038 行 | `WasmPreview/WasmPreview.tsx`，114 行 | `Emulator/`，528 行＋`emulatorService.ts`，再加 `server/emulator/` | `DeployPanel.tsx` ＋ `server/hmi/` |

這張表有用的讀法，是去問每一階**可能錯在哪**，那就是 §2 到 §5。

### 1.1 誰看得到這個選擇

**平常沒有人看得到。** Preview 分頁直接打開 Emulator，那一排子分頁根本不會畫出來。理由就是
§8 講的：第一階與第二階是編輯器自己對 LVGL 的近似，對一個正在用這個產品做面板的人來說，
在它們身上得到綠燈並不是對面板的回答——那是對「編輯器認為面板長什麼樣」的回答。

那一排會在**原廠研發模式**下出現，因為那時候的使用者是在做編輯器本身的人，而三階之間的差別
正好就是他在處理的東西（[factory-dev-mode.md](./factory-dev-mode.md)）。另外，在建置時把
Emulator 關掉的版本裡，兩種模式都會顯示它——不然剩下兩階就沒有入口了。

下面談的都是這三階本身，而那些跟「誰可以切換」無關。

## 2. 📱 Prototype——編輯器自己畫的那張圖

`PreviewPanel.tsx` 用 `<canvas>` 的 2D 繪圖 API 把每個元件畫出來，全部是手寫的
TypeScript（`canvasRef`、`getContext('2d')`，然後兩千行的形狀繪製）。整個過程 LVGL
沒有參與。

它做的不只是畫。它會對元件做點擊命中測試、執行它們的事件綁定（`hit.events` →
`runActions`，包含 `navigate`）、播放動畫，也支援進入畫面時的入場動畫——這也是
[animation-model.md](./animation-model.md) 把它當成動畫行為基準的原因。

**它證明得了：** 幾何、版面、顏色、畫面流程與動畫時序——以**編輯器的理解**為準。

**它證明不了：** LVGL 同不同意。這裡的每一個像素都是編輯器對「LVGL 大概會怎麼畫」的
第二意見。LVGL 套用方式不同的樣式、canvas 程式碼只是近似的版面規則、不一樣的字型
度量——這一階全都看不出來。跟產生的程式碼有關的事情它也證明不了，因為根本沒有產生
程式碼。

**它真正的工作**是「即時」。它是你拖元件時一直開著的那一階，它的準確度預算也該照這個
定位來花。

有一個結構上的註記，因為它跟 §8 有關：**Design 畫布又是另一套獨立的 renderer**。
它是用 DOM 與 CSS 畫的（`Canvas/CanvasComponent.tsx`，1074 行），而這一階是用
Canvas 2D 畫的（2038 行），兩者不共用任何繪圖程式碼。也就是說編輯器身上背著*兩套*
各自手寫的 LVGL 外觀模仿，而且兩套都不可能對——因為 LVGL 兩套裡都沒有。Prototype
真正比 Design 畫布多的，是動畫播放與點擊換頁。

## 3. 🖥️ Simulator——真的 LVGL，但不是你的程式碼

`WasmPreview.tsx` 只有 114 行，因為它自己幾乎什麼都不做：掛一個
`<iframe src="/wasm/lvgl_wasm.html">`，然後往裡面 post 一個訊息。

有意思的是它 post 什麼。`editorStateToJson.ts`（149 行）把目前這個畫面轉成一份
**描述 UI 的 JSON**——元件、幾何，以及 `default` / `pressed` / `focused` / `disabled`
四組樣式——然後 `public/wasm/lvgl_wasm.{js,wasm}`（1.3 MB，簽在 repo 裡）這份預先編好
的 LVGL WASM 從它建出真正的 `lv_obj`。改動會在 300 ms debounce 之後重新 post。

**它證明得了：** **真正的 LVGL**，用真正的樣式處理與真正的字型繪製，把你的畫面畫成
這樣。這跟第一階是完全不同的主張，而且完全不需要任何工具鏈就拿得到。

**它證明不了：** 任何跟你的程式碼有關的事，因為沒有程式碼。另外有一件事值得特別講
清楚，因為別的文件把它講反了：**`editorStateToJson.ts` 裡完全沒有出現「event」。**
可以自己 grep。過橋的是畫面與樣式；事件綁定沒有過去，邏輯圖也沒有。這一階是個
renderer，不是 runtime。

**而且直到最近，它連解析度都不是你的。** `wasm/src/main.c` 建立顯示時寫死
`lv_sdl_window_create(480, 320)` —— 一個對不上這裡任何一塊板子的尺寸 —— 而
`set_screen_size` 是個空殼，收下編輯器傳來的數字然後丟掉。所以上面每一句宣稱，都是在
一個尺寸錯誤的螢幕上做出來的，而那會讓任何靠邊或置中的東西跑位。它能活這麼久，是因為
480x320 是橫向、而且離 480x272 近到看起來很合理；直向專案出現之後才變得一眼可見（見
[display-orientation.md](./display-orientation.md) §4.4）。`main.c` 現在會透過
`lv_sdl_window_set_size` 調整尺寸，而 `WasmPreview.tsx` 會量它實際拿到的 canvas，在
runtime 沒有照做時直接在頁尾講明白 —— 在這項變更之前建置的簽入 `.wasm` 就是沒照做，
直到它被重建為止。

## 4. 🎛️ Emulator——第一階真正在測產品的

`Emulator.tsx` 呼叫 `generateCode(...)`——跟匯出、跟韌體建置用的是同一個產生器——
把**回傳的每一個檔案**（`ui.c`、`ui_events.c`、`ui_logic.c` 與它們的標頭）加上產生的
圖片 C 陣列與 `lv_font_conv` 轉出來的字型，一起丟給 `POST /api/emulator/build`，
而 `vite-plugin-emulator.ts` 會叫出 **`emcc`**，把這些東西跟一份 LVGL 靜態庫一起
編譯。編出來的 `output.js` / `output.wasm` 再載回頁面，透過一個 `WasmRuntime` 控制：
`tick()`、`mouseEvent()`、`keyEvent()`、`getFramebuffer()`。

**它證明得了、而且下面幾階都證明不了的：**

- **產生的 C 編得過。** 每一個會生出無效 C 的 codegen bug，都在這裡現形，而且只在這裡。
- **事件真的接上了。** `ui_events.c` 真的在跑，所以一個「有產生 handler 但沒有人掛
  上去」的按鈕，在這裡就是一顆按不動的按鈕。
- **邏輯圖會跑。** `logicGraphs` 有傳進 `generateCode`、`ui_logic.c` 有產生也有送去
  編譯，而 `ui_events.c` 會 include `ui_logic.h`。這一階是**唯一**會執行邏輯圖的預覽。
- **字型裡有那些字。** 字型轉換用的是跟韌體建置同一套字集收集，所以缺一段 CJK 範圍在
  這裡就會變成豆腐字，不會等到面板上才發現
  （[charset-trimming-design.md](./charset-trimming-design.md)）。

**它證明不了：** Flash 與 RAM 的成本、真實時序、任何跟面板或匯流排有關的事，以及任何
被 LVGL 設定差異蓋掉的東西——見 §5。

**它需要：** 跑 dev server 的那台機器上要有 `emcc` 與一份 LVGL checkout，兩者都由
`npm run emulator:setup` 裝好——而在建置過一次韌體的機器上，LVGL 那一半本來就在，會被
沿用，而且是同一個 pin。`server/emulator/toolchain.ts` 會去「找」而不是「假設」它們在哪，
而分頁會**在你按 Start 之前**就講出缺什麼、以及補它的那行指令。工具鏈不在的時候它仍然
不會降級到別階；它會拒絕，然後說明理由（[emulator.md](./emulator.md) §4.4、
[language-switching.md](./language-switching.md) §4.1）。

## 5. 🚀 Deploy——而且不，它並沒有讓 Emulator 變多餘

會這樣問很合理，因為兩者確實共用了一個真實的東西：**同一個 `generateCode()`**。
`server/hmi/projectSource.ts` 是從 `src/codegen/generator` import 它的，跟
`Emulator` 在瀏覽器裡做的一模一樣。這個專案只有一個程式碼產生器，被兩個地方
呼叫。這就是重複的部分，而且是**好的**那種——另一種選擇是兩個產生器慢慢分家。

從那之後就全都不一樣了：

| | Emulator | Deploy |
|---|---|---|
| codegen 在哪跑 | 瀏覽器裡 | 伺服器上，從專案檔跑 |
| 編譯器 | `emcc` → WASM | CMake + Ninja + arm-none-eabi → `.elf` |
| LVGL 設定 | `wasm/lv_conf.h`，`LV_USE_SDL` 關掉 | `firmware/<board>/include/lv_conf.h` |
| 跑在哪 | 頁面裡的一塊 canvas | MCU 上 |
| 輸入 | 滑鼠與鍵盤 | 電容式觸控面板 |
| 協定 | binding 有編進去，但線的另一端什麼都沒有 | 真的 runtime、真的 COM port |
| 失敗長什麼樣 | 一份編譯 log | 一塊開得起來、或開不起來的板子 |
| 代價 | 數秒 | 數分鐘，外加一條線 |

所以兩者回答的是不同的問題。Emulator 回答的是*「我產生出來的東西會動嗎？」*——
幾秒鐘、不用硬體，而且是找 codegen bug 最快的地方。Deploy 回答的是*「它在我要出貨的
那個東西上會動嗎？」*——記憶體、時序、面板、匯流排——而且它是唯一答得了的一階。

**這個重複裡真正的風險**不是重複，而是**分家**：兩份不同的 `lv_conf.h` 坐在兩個本來
應該一致的階後面。[lvgl-configuration.md](./lvgl-configuration.md) 已經記錄了它們在哪
分家，而 [charset-trimming-design.md](./charset-trimming-design.md) §8 對字型記了同一
種危險，也給出了當初解掉它的規則——把共用的步驟放進 `src/codegen/`，讓兩邊的呼叫者都
拿得到。那條規則正是在保護這座階梯的東西，而每次要在任一條路徑上加新步驟時，都值得
刻意再套一次。

Deploy 這一側還有兩個小註記：

- codegen **不會**被 Code 分頁擋住。在工廠模式下把那個分頁藏起來，`generateCode()`
  仍然為 Emulator 與這一階在跑（[factory-dev-mode.md](./factory-dev-mode.md)）
  ——會呼叫它的就是這兩階。
- `Emulator` 可以在建置時整個關掉——`VITE_ENABLE_EMULATOR=false`
  （`App.tsx:84`）會把那個分頁拿掉，而停在該模式的專案會退回別的階。

## 6. 現有紀錄漏在哪（已修）

查證上面這些的時候找到三個問題。三個都已經修好了；以下是「當初錯在哪、被什麼改正」
的紀錄。以下兩段引文都早於 [emulator.md](./emulator.md) §2 的改名，維持原樣。

**「WASM preview」這個名字曾經帶著兩種意思，而當時全面改名會是錯的。** 第二階與第三階
都是 WASM，所以這個詞看起來有歧義——但把它在 `docs/` 底下約 90 處出現全部看過之後，會
發現它其實一致地被用在兩種不同的意思上，而且只有一種是問題：

| 出現在哪 | 在那裡的意思 | 判定 |
|---|---|---|
| `docs/components/*`——42 個檔案，一律寫成「LVGL WASM 預覽」，而且旁邊都引 `ui_from_json.c` | **第二階** | 當時在脈絡裡是對的，所以沒有動。**後來改了**：第二階現在叫 *Simulator*，這個名字跟第三階不再有歧義，原本不動它的理由也就不成立了 |
| [lvgl-configuration.md](./lvgl-configuration.md)、[lvgl-version.md](./lvgl-version.md)、[color-depth.md](./color-depth.md)、[text-typography-evaluation.md](./text-typography-evaluation.md) | 共用的 **`wasm/` 建置樹**——`wasm/lv_conf.h`、`wasm/build.sh`——它同時餵第二階簽進 repo 的產物**與**第三階的當場編譯 | 改成任一階都不對；它真的就是兩者 |
| [logic-event-trigger.md](./logic-event-trigger.md)、[factory-dev-mode.md](./factory-dev-mode.md) | 本來就是要指**某一階**，卻指錯了 | **本來是錯的。已修** |

由此得到規則，而且它在改名之後仍然成立：**句子在講某一階時就講那一階的名字；句子在講
建置輸入時就講「`wasm/` 建置樹」。** `docs/` 裡剩下的四處「LVGL WASM」全都屬於後者——
簽進 repo 的 `.wasm` 產物，以及產生它的那棵樹——它們留著是對的。

**[logic-event-trigger.md](./logic-event-trigger.md) 曾把第二階的限制安在第三階頭上。**
它原本寫的是：*「**WASM preview**（Build & Run）完全忽略邏輯圖——`editorStateToJson.ts`
匯出畫面、樣式與事件，但沒有圖。」* 這句話有三個地方是錯的：

1. `editorStateToJson.ts` 住在 `src/components/WasmPreview/`，屬於 **Simulator**。
   Emulator 根本沒用到它。
2. 它**沒有匯出事件**。整個檔案裡沒有出現過這個字。
3. Emulator **並沒有**忽略邏輯圖——它把圖傳給 `generateCode`、編譯產生出來的
   `ui_logic.c`，而 `ui_events.c` 會 include `ui_logic.h`。

正確的說法就是這份文件 §3 與 §4 的說法：*Simulator* 既沒有事件也沒有圖，而
*Emulator* 是唯一會跑這兩者的預覽。

同樣已修：**[factory-dev-mode.md](./factory-dev-mode.md) 把第二階列成
`generateCode()` 的使用者。** 它原本說程式碼生成仍然「在 WASM 預覽、Build & Run 流程
與專案匯出時照常執行」。Simulator 根本沒有任何地方呼叫 `generateCode()`——它的四個
呼叫者是 `CodePanel`、`CodePreview`、`Emulator` 與 `server/hmi/projectSource.ts`
——而其中前兩個正是那個旗標會藏起來的 Code 分頁。撐過那個旗標的是 Emulator 與
Deploy 建置，而它現在就是這樣寫的。

**[language-switching.md](./language-switching.md) §4.3 的涵蓋度表只有三欄，但階梯有
四階。** 它比較的是「Canvas 🌐」、Emulator 與硬體，漏掉（或早於）Simulator。
它列出來的部分沒有錯，但它是不完整的；照著它挑階的人不會知道第二階存在。它現在會說明
第二階為什麼不在表上——語言切換是一個事件動作，而第二階不帶事件——並連到這裡。

## 7. 意見，等哪天值得動手時再用

§6 那三個缺陷已經修掉了。剩下的，大致按價值排序：

1. **涵蓋度表只留一張，放一個地方**——就是這份文件的 §1——讓
   `language-switching.md` §4.3 與未來任何同類表格連過來，而不是各自重述一遍。重述的
   表格會漂移，§4.3 那張就漂過。
2. **讓 `lv_conf.h` 的分家變成可檢查的，而不是靠記得。** 兩份設定坐在兩個必須一致的階
   後面，正是會生出「可是預覽看起來是對的啊」的那種形狀。一份產生出來的 diff，或一個
   斷言「預覽依賴的那些欄位跟板子一致」的測試，就能把紀律變成檢查。
3. **在每一階上寫明它證明不了什麼。** 這座階梯的危險是「在錯誤的高度拿到綠燈」——一個
   在 Prototype 裡畫得好好的、但它的 C 一行都沒編過的畫面。每個分頁一行字，內容從
   §2–§5 抄，不花什麼成本，卻能擋掉這座階梯天生會誘發的誤讀。

## 8. 如果只能留一個預覽

這不是要拿掉什麼的計畫——這是拿產品真正的承諾去給三階排序，而那句承諾是*「你不寫程式，
我產出跑得動的 C」*。用這句話去量，答案並不接近。

**留 🎛️ Emulator。**

- **它是唯一在測交付物的一階。** 產品的產出是產生出來的 C。其他每一階測的都是那份產出
  的一張照片。
- **它是唯一會抓到「作者自己修不了」的失敗的一階。** 編不過的 C 是工具的錯、卻是使用者
  的死路。它要嘛在這裡現形，要嘛在燒進板子之後現形，中間沒有別的地方。
- **它是唯一會跑事件與邏輯圖的一階**（§4）。一個 no-code 工具，如果它的邏輯只能靠燒
  硬體才操得到，那它就對它原本設定的使用者失效了。
- **它把另外兩階包含掉了。** 留著它，作者一樣看得到畫面、點得動、試得了語言切換，也
  找得出缺字。

**為什麼該被捨掉的是另外兩個：**

*Simulator 被嚴格支配。* 它的獨門主張是「不用工具鏈的真 LVGL」——但 Emulator
也是真 LVGL，還多了你的程式碼、你的事件與你的圖。第二階存在的理由是閃避 `emcc` 這個
相依；把相依拿掉，這個主張就空了。

*Prototype 的迴圈，大部分就是 Design 分頁的迴圈。* 而且這背後有一個值得講白的
事實：Design 畫布是用 **DOM 與 CSS** 畫的（`Canvas/CanvasComponent.tsx`，1074 行），
Prototype 是用 **Canvas 2D** 畫的（`Preview/PreviewPanel.tsx`，2038 行），兩者不
共用任何繪圖程式碼。**那是兩套各自手寫、互不相干的 LVGL 外觀模仿，加起來約 3,100 行，
而且兩套都不可能對**，因為 LVGL 兩套裡都沒有。同一個畫面在這個工具裡有三種答案，其中
兩種是猜的。Prototype 真正比 Design 畫布多的是動畫播放與點擊換頁——是真的，但很小。

**這個答案附帶的一張帳單——已經付掉了。** 這一節剛寫下來的時候，價值最高的那一階同時
也是最可能一拿到手就是壞的那一階：`vite-plugin-compile.ts:44` 把工具鏈預設成了別人的
Linux 工作區，而同樣那兩條路徑在 `wasm/*.sh` 與 codegen 編譯測試裡還各有一份。

```ts
const EMSDK_ENV =
  process.env.EMSDK_ENV ?? '/home/xcssa/.openclaw/workspace/tools/emsdk/emsdk_env.sh';
const LVGL_ROOT = process.env.LVGL_ROOT ?? '/home/xcssa/.openclaw/workspace/tools/lvgl';
```

那是**設定問題，不是架構問題**，也正因如此，「留下這一階」跟「把 `emcc` 這條路變可靠」
是**同一個決定**，不是兩個。現在兩個都做了：路徑改成用找的而不是用假設的、
`npm run emulator:setup` 會把缺的東西照著與韌體共用的 pin 裝好、而這一階會在被要求建置
之前就先講清楚它需要什麼。[emulator.md](./emulator.md) 就是完成這件事的規劃，以及它仍然
沒有解決什麼的清單。

**唯一會翻轉這個答案的條件。** 如果當初那張帳單真的付不起——例如要出貨給永遠不會有工具鏈
的終端使用者——那就改留 **Simulator**，因為它是唯一「真 LVGL＋簽進 repo 的二進位檔
＋零設定」的一階。那是次佳解，不是首選。

**Deploy 不在候選名單裡。** 它不是預覽，它是產品的輸出路徑。順帶一提，留著 Emulator
也會讓 Deploy 保持誠實：兩者共用 `generateCode()`（§5），所以 **Emulator 是唯一每天
在操 deploy 那條路徑的東西。**
