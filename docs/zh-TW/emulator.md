# Emulator——真正在跑你程式碼的那一階，以及讓它啟動所付的代價

<p align="center">
  <a href="../emulator.md">English</a> · <strong>繁體中文</strong>
</p>

[預覽階梯](./preview-ladder.md)的第三階本來叫 **Build & Run**，而在一份剛 clone 下來的
專案裡，它兩件事都做不到。這份文件就是把兩者一起改掉的那份規劃：**名字為什麼是錯的**、
**它為什麼跑不起來**、**決定了什麼**，以及**這個決定沒有解決什麼**。

它是 [preview-ladder.md](./preview-ladder.md) §8 的後續。那一節把這一階排在三者之首，
然後在那個答案後面附了一張帳單：

> *「留下 Build & Run」跟「讓 `emcc` 這條路可靠」是同一個決定，不是兩個。只選前者而不付
> 後者的帳，等於讓產品唯一真正的驗證階回報一個編譯錯誤。*

這份文件就是在付這張帳。

## 1. 這一階到底是什麼

真正的 LVGL，從原始碼編出來，連上**這個產品從你的畫面產生出來的 C**，跑在網頁裡，你的
滑鼠與鍵盤直接送進去。不是把你的畫面畫一張圖——是你的畫面本身在跑。

那就是 **emulator（模擬器）**：沒有面板的面板。產品承諾的一切都在它的另一側，而它是唯一
一階，能在硬體介入之前就讓那個承諾看得見地失敗（階梯 §4、§8）。

## 2.「Build & Run」為什麼是錯的名字

三個理由，照代價由小到大排。

**它取的是按鈕的名字，不是地方的名字。** 另外兩個子分頁都是用「它顯示什麼」命名的——
*Prototype*、*Simulator*。只有這一個是用裡面那顆按鈕上的動詞命名的。一排分頁讀
起來是兩個名詞加一個祈使句，就不會讀成一座階梯，而階梯正是整個設計。

**「Build」這個字早就被用掉兩次了。** Deploy 會建置韌體，而且過程中就寫著「Building…」；
`npm run build` 建置的是網頁本身。文件每次都得多花力氣消歧義——在這次修改之前的
[preview-ladder.md](./preview-ladder.md) §5 裡就得寫出「the Build & Run build」這種句子，
沒有人第一次會這樣寫。

**它把這一階賣低了，而且是賣給它本來要服務的人。**「Build & Run」是開發者用來描述開發者
便利設施的詞。這個產品要服務的人不寫程式，也不想要一次 build；他們想看到面板會動。
*Emulator* 就是那個詞，而且更誠實——階梯 §4 整節列的都是這一階能證明、而任何「預覽」都
證明不了的事。

按鈕保留動詞，因為按鈕本來就該有動詞：**Start** 與 **Stop**。分頁是地方，按鈕是動作。
把這兩者分開，就是這次修正的重點。

## 3. 它為什麼跑不起來

五個缺陷，每一個都在動手之前對照過原始碼。前三個讓工具鏈找不到；後兩個讓工具鏈就算在
那裡也用不到。

### 3.1 工具鏈指向的是別人的機器

`vite-plugin-compile.ts:43-45`，當時的樣子：

```ts
const EMSDK_ENV =
  process.env.EMSDK_ENV ?? '/home/xcssa/.openclaw/workspace/tools/emsdk/emsdk_env.sh';
const LVGL_ROOT = process.env.LVGL_ROOT ?? '/home/xcssa/.openclaw/workspace/tools/lvgl';
```

某位貢獻者 Linux home 目錄底下的絕對路徑，被當成**所有人的預設值**。
`wasm/build.sh:7` 與 `wasm/build_lvgl_lib.sh:7,9` 又各寫了一次同樣的兩條路徑，而且完全
沒有環境變數可以覆寫；`src/codegen/__tests__/compile.test.ts` 還有第四份（§3.5）。

它產生的失敗，就是這次工作的起點：

```
emcc toolchain unavailable:
- emcc is not on PATH and no emsdk env script at /home/xcssa/.openclaw/workspace/tools/emsdk/emsdk_env.sh
- LVGL checkout not found at /home/xcssa/.openclaw/workspace/tools/lvgl
```

其中兩行指的是一個陌生人的目錄。沒有一行告訴你該怎麼做。

### 3.2 它要的那份 LVGL，本來就已經在硬碟上了

韌體建置對應的 pin 記在 [lvgl-version.md](./lvgl-version.md)：LVGL **v9.5.0**、commit
`85aa60d`，由 `firmware/<board>/scripts/bootstrap-deps.ps1` 安裝到該板子的
`.hmi-cache/Middlewares/Third_Party/lvgl`。**任何建置過一次韌體的機器上，那個目錄都存在，
而且裡面正是這一階回報「找不到」的那份 checkout。** 在診斷這件事的機器上有兩份，一塊板子
一份，而且都在 pin 上。

它從來沒有被找過。Emulator 只問了一條寫死的路徑，然後就放棄了。

更糟的是，這兩邊從來沒有被要求一致：韌體 pin 住一個 commit，而這一階編的是「那邊剛好
checkout 了什麼」——這正是 [preview-ladder.md](./preview-ladder.md) §5 點名的、Emulator
與 Deploy 重疊處唯一真正的風險：**分家**。

### 3.3 假設了 `bash`，而 `emsdk_env.sh` 在 Windows 上根本設不了環境

編譯指令是 bash 腳本（`find`、`while read`、`sed`），所以就算 `emcc` 已經在 PATH 上，這個
plugin 仍然需要一個 POSIX shell。它找 shell 的方法是直接執行 `bash`、接受 PATH 給的任何
答案；它拿到 emcc 的方法是 `source emsdk_env.sh`。在 Windows 上這兩半都會壞，而且壞得都
不明顯：

- **Git for Windows 把 `bash.exe` 裝在一個它不會加進 PATH 的目錄裡。** 預設安裝放進 PATH
  的是 `C:\Program Files\Git\cmd`，裡面有 `git.exe`，沒有 `bash.exe`。於是一台裝了完好
  bash 的機器會回報「bash not found」。
- **會有別的東西先答話。** 在診斷這件事的機器上，`bash` 解析到的是
  `C:\ST\STM32CubeCLT_1.22.0\Make\bin\bash.exe`——一個跟著 ST 工具鏈裝進來、產品從來沒有
  選過、而且 `uname` 什麼都不印的 shell。它不是 MSYS shell，這一點在 §4.1 會變得很重要。
- **`source emsdk_env.sh` 什麼都不會 export。** 那個腳本透過 `python3` 去跑
  `emsdk construct_env`；在 MSYS 下這個名字打到的是 Microsoft Store 的佔位執行檔，它印一段
  廣告到 stderr 然後結束。在已經裝好可用的 Emscripten 6.0.8 之後，實測是這樣：

  ```
  $ source .hmi-cache/emulator/emsdk/emsdk_env.sh
  Python was not found; run without arguments to install from the Microsoft Store...
  $ echo "EMSDK=$EMSDK"
  EMSDK=
  $ command -v emcc
  （沒有輸出）
  ```

  也就是說，即使正確安裝完，編譯器仍然是搆不到的。

### 3.4 LVGL 靜態庫是一個沒人會告訴你的手動步驟

就算工具鏈都在，這個 build 仍然需要 `wasm/build/liblvgl_emcc.a` 存在，而沒有任何東西會
產生它。Plugin 裡其實有一條「依專案設定編一份庫」的路徑——`buildLvglLib()`，掛在
`POST /api/project/build-lvgl` 後面——但**沒有任何 client 呼叫過其中任何一個**：
`compilerService.ts` 送出的是 `{ files, fonts, width, height }`，從來沒有 `lvglConfig`，
所以每一次請求都走預設路徑，而預設路徑只檢查檔案在不在，不在就回答：

```
liblvgl_emcc.a not found at …/wasm/build/liblvgl_emcc.a.
Run wasm/build_lvgl_lib.sh first (or set LVGL_LIB).
```

這句話是真的，也是沒用的：那個腳本沒有出現在任何產品介面上，而且它本來也不可能成功。
它會編 `lvgl/src` 底下**每一個** `.c`，而 `wasm/lv_conf.h` 為了第二階把 `LV_USE_SDL` 設成
1，於是 `src/drivers/sdl/` 底下那六個檔案會以
`fatal error: 'SDL2/SDL.h' file not found` 中斷。開頭有 `set -e`，所以第一個就是最後一個。

### 3.5 驗證產品核心主張的那組測試，一直在跳過

`src/codegen/__tests__/compile.test.ts` 用 `generateCode()` 產生 C 然後把它編起來——48 個
測試，主題就只有一件事：*這個產品吐出來的 C 是合法的 C*。它的工具鏈區塊是 §3.1 那些路徑的
第四份拷貝，於是 `describe.skipIf(missing.length > 0)` 在每一台機器上都成立，這組測試永遠
回報「48 skipped」。產品最強的一張安全網，被一個預設值關掉了。

## 4. 決定

五個部分，照一個人會依序碰到的順序。

### 4.1 用找的，不要用猜的

一個解析器，[`server/emulator/toolchain.ts`](../../server/emulator/toolchain.ts)，每個工具
一份有序候選清單，而且**順序本身要有理由**。明確設定永遠優先；接著是這個 repo 自己裝的
pin 版本；再來才是這台機器本來就有的。

| | 順序 |
|---|---|
| **LVGL** | `LVGL_ROOT` → `.hmi-cache/emulator/lvgl` → 任一 `firmware/*/.hmi-cache/…/lvgl` |
| **emcc** | `EMSDK_ENV` → `.hmi-cache/emulator/emsdk` → `EMSDK` → `~/emsdk`、`/opt/emsdk`、`C:\emsdk` → PATH 上的 `emcc` |
| **bash** | `HMI_BASH` →（Windows）`git` 旁邊，再來是 Git for Windows 的慣用位置 → PATH |

這張表有四件事是刻意的。

**每一個候選都要用哨兵檔確認**，不能只看目錄存不存在：LVGL 看 `src/lv_init.c`，emsdk 看
`upstream/emscripten/` 底下的 `emcc` 啟動器，shell 則是實際跑一次 `-c "exit 0"`。一個刪
到一半的快取目錄不是工具鏈，也不該被當成工具鏈回報。

**repo 內的 pin 版本排在 PATH 前面。** pin 的存在就是為了讓兩份 build log 可以互相解釋，
而讓機器上隨手一個 emcc 悄悄壓過專案裝的版本，正是那種只會在別人的失敗裡才浮現的差異。
最後是哪一份贏了，狀態面板上會寫出來，所以永遠不會變成謎。

**在 Windows 上，Git Bash 排在 PATH 前面**——整張表唯一的例外。這不是潔癖。編譯是透過這個
行程注入的 PATH 去找到 emcc 的，而只有 MSYS shell 會把繼承來的 Windows 形式 PATH 改寫成
它自己 command lookup 用得上的形式。§3.3 那個非 MSYS 的 bash 啟動起來一切正常，然後找不到
就在旁邊的編譯器。`git` 不是可選的——這份 repo 就是用它 clone 下來的——而 Git for Windows
把 `bash.exe` 放在離 `git.exe` 一個目錄的地方，於是我們可以從一個確定裝了的工具，找到那個
shell。在 Linux 與 macOS 上，PATH 就是系統 shell，維持第一。

**環境是組出來的，不是 source 出來的。** 不再 `source emsdk_env.sh`，而是讀 `emsdk activate`
寫進 `.emscripten` 的工具路徑，直接把 `EMSDK`、`EM_CONFIG`、`EMSDK_PYTHON`、`EMSDK_NODE`
與一段前置的 `PATH` 交給編譯。這在每個平台上都成立，也正是讓 §3.3 第三點不再要緊的原因。

沿用韌體那份 LVGL 值得再講一次：它不用錢、它本來就是對的 commit，而且它讓**兩階在結構上
共用同一份 LVGL**，不再靠紀律——把階梯 §5 的風險在「LVGL 原始碼」這一側關掉。

### 4.2 缺什麼就補什麼，一行指令

```bash
npm run emulator:setup
```

[`tools/bootstrap-emulator.mjs`](../../tools/bootstrap-emulator.mjs)，沿用
`firmware/<board>/scripts/bootstrap-deps.ps1` 已經立下的慣例：pin 住的版本、被 gitignore
的快取目錄、**用 GitHub 壓在 zip 裡的 commit** 而不是檔名來比對壓縮檔，以及解壓後檢查
哨兵檔。用 Node 而不是 PowerShell，因為這條路徑得在 dev server 跑得起來的地方都能跑，而
node 本來就是跑它的必要條件。

| 相依 | Pin | 從哪裡來 |
|---|---|---|
| LVGL | `v9.5.0`、commit `85aa60d`——**與韌體同一個 pin** | 已經有內容的韌體板快取；否則 `firmware/vendor/*.zip` 依 commit 比對；否則 codeload |
| Emscripten | `6.0.8` | `emsdk install` / `activate` 到 `.hmi-cache/emulator/emsdk` |

沒有東西會落在 `.hmi-cache/` 之外，而 `.gitignore` 早就涵蓋了它；也沒有任何東西會裝到系統
層級。刪掉那個目錄就等於全部復原。

把工具鏈裝進工作目錄裡有兩個後果，兩個都先處理掉而不是留給後人踩：`eslint.config.js` 與
Vitest 的 `exclude` 現在都會忽略 `.hmi-cache/`。Emscripten 會帶進數萬個檔案，包含它自己的
測試套件與刻意寫壞的 JS fixture；少了這兩行，`npm run lint` 會從 Emscripten 的樹裡報出
233 個錯誤，而 `npm test` 會去跑 Emscripten 的測試。

**誠實的代價：** Emscripten 壓縮後大約 700 MB，第一次要跑幾分鐘。指令在開始前就會講。

### 4.3 LVGL 靜態庫改成按需建置並快取

[`server/emulator/lvglLib.ts`](../../server/emulator/lvglLib.ts) 取代了 §3.4 的手動步驟。
這份庫現在是一個帶快取的建置產物，快取鍵是**產生它的那份設定**——產生出來的 `lv_conf.h`、
LVGL 路徑、以及編譯器——所以改 `wasm/lv_conf.h` 或指向另一份 LVGL 會重建，其他情況不會。

- **它的 `lv_conf.h` 是 `wasm/` 那份，把 `LV_USE_SDL` 強制設成 0。** 這一階是把畫面刷進
  自己的 framebuffer，完全不碰 SDL；那個開關開著正是 §3.4 建置失敗的原因。同樣的理由，
  來源清單也跳過 `src/drivers/`。
- **建置是寫到硬碟上的腳本，不是一長串 `bash -c` 字串**，所以失敗時，那份失敗的腳本會就
  留在它的 log 旁邊。
- **它會平行編譯**，一核一個工作，而不是原本的序列迴圈；而且**把輸出即時串到 dev server
  的終端機**，所以第一次建置不會是好幾分鐘的沉默。
- **目的檔以它在 `src/` 底下的相對路徑命名**，不是壓平的絕對路徑——在 Windows 上後者會帶著
  磁碟機的冒號（不合法的檔名字元），而且長到會撞上 `MAX_PATH`。

這裡有一件事做錯過，值得記下來，因為它的失敗形態屬於危險的那一種。這份封存檔原本是用
`emar q` 一次一百個分批組出來的——而 `q` 是**附加**，那對「產生一個產物」來說是錯的動詞。
兩次執行在同一個快取目錄裡重疊，就產出了一個有 592 個成員的封存檔：其中 296 個重複、
一百個缺席，包含 `lv_display.c.o`。它連結時報 `undefined symbol: lv_display_create`，而
因為檔案「存在」，它就以那個狀態被快取起來，之後每一次建置都連到它。修法只有三行、沒有
任何聰明之處：用一次 `emar rcs` 搭配 response file、檢查成員數等於目的檔數且目的檔數等於
來源數、最後再 rename 到位——於是中途死掉的執行留下的是「沒有庫」，而不是「壞掉的庫」。

連結步驟完全不經過 shell：直接用參數陣列呼叫 `emcc`，也就不必在兩個平台上分別把
`-sEXPORTED_FUNCTIONS=[…]` 引號跳脫對。

### 4.4 說出缺什麼，以及補它的那行指令

`GET /api/emulator/toolchain` 回報解析結果——每個工具找到沒有、哪一個候選贏了、對上的是哪個
pin。Emulator 分頁在掛載時就問，所以一台不能建置的機器**會在你按 Start 之前就說**，而且
Start 是停用的，不會把人帶進一次注定不會發生的編譯。缺東西時，面板顯示的是設定指令與它會做
什麼，而不是一坨工具鏈輸出。commit `7b65574` 立下的規則——*用產品的話講一次 build 在做什麼，
不要用工具鏈的話*——同樣適用於講清楚一次 build 為什麼開始不了。

同一份回報還帶著 `libraryReady`，所以面板可以剛好講一次
**「第一次執行要從原始碼編 LVGL——幾分鐘；之後每次都是幾秒」**，而不是讓剛 clone 完的人自己
猜它是不是卡住了。

**而且它會用兩種語域各講一次。** 上面引的每一句都是原廠研發模式下的用語。在那之外，同一個
面板講的是 *Preparing your panel*、*Running — click the screen to try it*；工具鏈缺席時講的
則是「該找誰」以及「在那之前可以做什麼」，而不是一串點名 Emscripten 與 POSIX shell 的清單。
Build Output pane 也經過 Work pane 用的同一份白名單過濾（[work-progress.md](./work-progress.md)
§3），所以編譯器的逐字稿不會落到沒有要求它的人眼前。這些字就放在
`src/store/emulatorPhases.ts`，跟那些階段名放在一起，因為它們是同一個決定：對一個正在排版
HMI 的人講 LVGL，並沒有告訴他任何他做得了的事。見
[factory-dev-mode.md](./factory-dev-mode.md)。

### 4.5 講出這次建置做了什麼——包含它成功的時候

Build Output 這個 pane 以前顯示的全部內容就是 `Build succeeded` 兩個字。那不是任何東西的
摘要：伺服器回的是 `{ success, buildId }`，前端自己補上那兩個字，於是 **emcc 產生的每一則
警告都被收下來然後丟掉**。一份內容只有「成功」兩個字的 build log，是一顆穿著 log 外衣的
狀態燈。

它現在會講這次建置做了什麼——花了多久、用的是哪一份 LVGL、從哪裡來、靜態庫是重編還是沿用
快取、編了哪些檔案、產出多大，然後是編譯器說過的每一句話，有警告時附上數量。第一次打開它
就浮出四則從 LVGL 9.5 進來之後、每一次建置都會產生的警告：`wasm/lv_conf.h` 仍然寫著
`LV_FS_DEFAULT_DRIVE_LETTER`，而 9.5 已經把它標為 deprecated、改用
`LV_FS_DEFAULT_DRIVER_LETTER`，並且默默做了別名。改掉那一行，四則警告一起消失——而這正是
重點：沒有人讀得下去的 log，就是沒有人會去看的 log。

它出現在哪裡，見 [bottom-dock-panel.md](./bottom-dock-panel.md) §11：底部抽屜、韌體建置
log 旁邊，而且只有 Preview 分頁會提供那個頁簽。

## 5. 改了哪些名字，哪些刻意不動

| 介面 | 之前 | 之後 |
|---|---|---|
| 子分頁 | `🔨 Build & Run` | `🎛️ Emulator` |
| 裡面的按鈕 | `🔨 Build & Run` | `▶ Start` / `⏹ Stop` |
| 元件 | `src/components/CompilePreview/` | `src/components/Emulator/` |
| 前端服務 | `compilerService.ts` | `emulatorService.ts` |
| dev server plugin | `vite-plugin-compile.ts` | `vite-plugin-emulator.ts` |
| 虛擬模組 | `virtual:compile-preview` | `virtual:emulator` |
| 建置期開關 | `VITE_ENABLE_COMPILE_PREVIEW` | `VITE_ENABLE_EMULATOR` |
| 建置端點 | `POST /api/compile` | `POST /api/emulator/build` |
| 產物端點 | `GET /api/build/:id/output.{js,wasm}` | `GET /api/emulator/build/:id/output.{js,wasm}` |
| 預檢 | — | `GET /api/emulator/toolchain` |
| 沒人用的端點 | `POST /api/project/build-lvgl` | 移除——沒有任何呼叫者（§3.4） |
| 建置輸出 | 一顆 `📋 Build Output` 開關，在畫布上方開一個框 | 底部抽屜的 **Build Output** pane，就在韌體建置 log 旁邊（[bottom-dock-panel.md](./bottom-dock-panel.md) §11） |
| 沒人用的模組 | `CompilePreview/cTemplates.ts` | 移除——伺服器端 `main_wrapper.c` 的第二份拷貝，沒有任何地方引用 |

**`VITE_ENABLE_COMPILE_PREVIEW` 仍然有效。** 它出現在 README 的說明裡，也可能出現在讀者
早就寫好的 CI 裡；兩個變數任何一個設成 `false` 都會關掉這個分頁。舊名字被標記為 deprecated
而不是刪掉，因為為了整理一個變數名而弄壞別人的部署，是一筆划不來的交易。

**`docs/components/*` 裡的「WASM preview」仍然不改名**，理由 [preview-ladder.md](./preview-ladder.md)
§6 已經確立過：在那 42 個檔案裡，那個詞指的是*第二階*，而且在那個脈絡下是對的。這次只動
第三階的名字。

## 6. 現在它會做什麼

在 §3.3 那台機器上實測——Windows 11、沒有 emcc、沒有自己的 LVGL、PATH 上的 `bash` 來自
STM32CubeCLT：

| 步驟 | 結果 |
|---|---|
| `npm run emulator:setup` | 發現 LVGL v9.5.0 已經因為韌體建置存在；把 Emscripten 6.0.8 裝進 `.hmi-cache/emulator/emsdk` |
| `GET /api/emulator/toolchain` | `ready: true`——bash 來自 `beside git`、emcc 來自 pin 住的 emsdk、LVGL 來自 `firmware/stm32f746g-disco cache`、`pinned: true`、`v9.5.0` |
| 第一次 **Start** | 從原始碼編出 LVGL，457 個目的檔並封成庫；接著編譯連結專案的 `ui.c` / `ui_events.c` / `ui_logic.c` 成 `output.wasm` |
| 面板 | 480×272 的畫布顯示正在執行的畫面，滑鼠與鍵盤即時作用 |
| `npm test` | §3.5 那 48 個編譯驗證測試改成真的執行，而不是跳過 |

## 7. 這個決定沒有解決什麼

直白地寫出來，因為只列戰功的文件不算規劃。

- **`lv_conf.h` 仍然分家。** `wasm/lv_conf.h` 與 `firmware/<board>/include/lv_conf.h` 仍然是
  兩份必須一致、卻沒有互相檢查的檔案。讓兩階共用 LVGL *原始碼*，不等於共用它們的*設定*。
  [lvgl-configuration.md](./lvgl-configuration.md) 記錄了它們在哪分家；階梯 §7.2 提出了能終結
  這件事的檢查。仍然是開著的。
- **專案自己的 LVGL 設定仍然到不了 Emulator。** 一個設成 RGB565 的專案，模擬出來的仍然是
  `wasm/lv_conf.h` 說的那樣，因為橋的兩側都固定在 `LV_COLOR_FORMAT_ARGB8888`——要改底下的
  `LV_COLOR_DEPTH`，得同時改 flush callback 與 JS 的色彩轉換。移除那個沒人用的 per-project
  端點（§5）不會讓這件事更糟；它拿掉的是一個從未接通、卻看起來像功能的東西。
- **第二階簽進 repo 的產物仍然是 LVGL 9.2。** `public/wasm/lvgl_wasm.wasm` 是預先編好簽進來的，
  這次沒有任何東西重建它。現在它*可以*在任何機器上重建了——`wasm/build.sh` 透過共用的
  `wasm/toolchain.sh` 解析工具鏈——但還沒有重建。見 [lvgl-version.md](./lvgl-version.md) §1.2。
- **靜態庫的建置仍然需要 bash。** 找得到，不等於不需要。連結步驟已經不用 shell 了（§4.3），
  所以剩下的相依只在 LVGL 庫的建置這一段。把那段改寫成 Node 就能完全拿掉它，順便還能做到
  逐檔進度。這次沒做。
- **`npm run emulator:setup` 需要網路。** 離線的做法是事先把 LVGL 壓縮檔放進 `firmware/vendor/`
  （這是可行的），以及自己把 emsdk 裝在 §4.1 會找的任一個位置。

## 8. 相關文件

- [preview-ladder.md](./preview-ladder.md)——四階、各自能證明什麼，以及這份文件所執行的 §8 論證
- [lvgl-version.md](./lvgl-version.md)——各個 pin，以及哪些路徑真的遵守它們
- [lvgl-configuration.md](./lvgl-configuration.md)——兩份 `lv_conf.h` 在哪裡分家
- [charset-trimming-design.md](./charset-trimming-design.md)——讓兩個 `generateCode()` 呼叫者
  不會漂開的共用步驟規則（§8）
- [factory-dev-mode.md](./factory-dev-mode.md)——為什麼把 Code 分頁藏起來不會停掉 codegen
