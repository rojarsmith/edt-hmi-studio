# 更新日誌

<p align="center">
  <a href="./CHANGELOG.md">English</a> · <strong>繁體中文</strong>
</p>

本專案所有值得記錄的變更都會寫在這個檔案裡。

格式依循 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，版本編號依循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### 新增
- **Emulator 的建置現在是一個 Work 項目，而輸出會在建置進行中就出現** —— 以前按下 Start 之後那顆按鈕就安靜了：**Work** pane 裡什麼都沒有（而其他每一個長時間操作都會列在那裡），Build Output 也要等整件事結束才會有東西。兩者都靠沿用韌體建置既有的東西解決：這次建置走的是**同一條 SSE 通道、同一個端點**（`/api/hmi/build-log/:runId`），所以 pane 會隨著編譯器工作而填進去，而最後的摘要是接在那份逐字稿後面、不是把它換掉——編譯器的輸出只串一次，摘要就不再重複它。同時這次建置也會像其他操作一樣出現在 **Work** 裡，依序經過 *Preparing your screens*、第一次執行時的 *Compiling the display engine*、*Compiling your screens*，最後結束在 *Running in the Emulator* 或 *Could not build your screens*。這些階段來自一份白名單，比對的是 dev server 刻意送出的標記行，而不是去剖析編譯器輸出，所以原始輸出不可能從產品視圖裡冒出來。而因為 Work 在每個分頁都在，從 Preview 啟動的建置，切到 Design 之後仍然看得到
- **Build Output 會講這次建置做了什麼，而不是只有「succeeded」一個字** —— 它以前顯示的全部內容就是 `Build succeeded`，因為伺服器只回一個 build id、前端自己補上那兩個字，於是 **emcc 產生的每一則警告都被收下來然後丟掉**。它現在會報花了多久、用了哪一份 LVGL、從哪裡找到的、靜態庫是重編還是沿用快取、編了哪些檔案、產出的 `.wasm` 與 `.js` 多大，然後是編譯器說過的每一句話——上面附一個警告數量，因為同一則 deprecation 會每個編譯單元來一次，讓後面那段變得可掃視的正是那個數字。一打開它就浮出四則從 LVGL 9.5 進來之後、每一次建置都會產生的警告：`wasm/lv_conf.h` 仍然寫著 `LV_FS_DEFAULT_DRIVE_LETTER`，而 9.5 已改用 `LV_FS_DEFAULT_DRIVER_LETTER` 並默默做了別名；改掉那一行，四則一起消失，pane 結尾現在是「emcc said nothing — no warnings」。動到那個檔案會改變 LVGL 靜態庫的快取鍵，所以這之後的第一次建置會再花上幾分鐘重編一次庫
- **Emulator 的建置輸出移進底部抽屜，成為 Preview 專屬的頁簽** —— 它原本藏在一顆 `📋 Build Output` 開關後面，按下去會在 **Emulator 自己的畫布上方**打開一個框；這個形狀錯了兩次：它是一份建置 log，而這個產品早就把建置 log 放在狀態列上方的抽屜裡；而你最想讀它的那一刻——一次建置剛剛失敗——正好也是你想同時看見背後畫面的那一刻。它現在是一個 **Build Output** pane，位置在 **Work** 與 **Build Firmware** 之間；這是階梯的順序而不是字母順序：Emulator 的編譯發生在 Deploy 之前，所以兩份建置 log 由左至右，正好就是一個專案經過它們的順序。它有跟韌體 log 一樣的 Copy 與 Clear，而失敗的建置會把它帶到前面、抽屜收著的話順便展開，於是那份輸出不用去要就會出現。它同時也是這個抽屜第一個綁分頁的 pane：Work 列的是活得比分頁還久的操作，而這一個描述的是 *Preview* 分頁剛剛做了什麼，在別的地方就會變成一份「畫面上沒有那個東西」的 log —— 所以做法是過濾頁簽列而不是把抽屜藏起來；離開 Preview 會解析成 Work，而且不會把那個選擇寫下去，於是回來時仍然落在 Build Output 上
- **Preview 打開的就是 Emulator，三階也照它們真正的樣子改名** —— 平常那一排子分頁不見了：打開 **Preview** 直接就是 **🎛️ Emulator**，因為它是唯一真的在跑你程式碼的一階，而在另外兩階拿到綠燈，回答的是編輯器而不是面板（[docs/zh-TW/preview-ladder.md](docs/zh-TW/preview-ladder.md) §8）。另外兩階也改名成它們實際上是什麼，而不是它們有多快：**Quick Preview** 改為 **📱 Prototype** —— 編輯器自己用 Canvas 2D 畫的那張圖，有縮放、點擊換頁與動畫播放；**LVGL Preview** 改為 **🖥️ Simulator** —— 真正的 LVGL 畫出你的畫面，但裡面沒有你的任何程式碼。在三階之間切換這件事，歸進原廠研發模式的其他工具裡，因為那時候的使用者是在做編輯器本身的人，而三階之間的差別正好就是他在處理的東西；用 `VITE_ENABLE_EMULATOR=false` 建出來的版本則兩種模式都保留那一排，不然剩下兩階就沒有入口了。Emulator 自己的底部資訊列——LVGL 版本與編譯它的編譯器——基於同樣的理由歸進同一個旗標：它回答的是「為什麼這裡跟板子不一樣」，而那不是做面板的人正在問的問題，上方的面板也已經講完他們需要知道的一切。新名字同時貫穿整份文件，包含 46 份元件文件裡原本寫成「Simple preview」與「LVGL WASM 預覽」的地方 —— 那正是 [docs/zh-TW/preview-ladder.md](docs/zh-TW/preview-ladder.md) §6 當初刻意不動的詞，理由是第二階與第三階都叫「WASM preview」；而在第二階拿到自己的名字之後，那個理由就不成立了
- **Preview 分頁的第三階現在叫 🎛️ Emulator，而且它真的會啟動** —— 這一階負責把產生出來的 C 跟真正的 LVGL 一起編譯、然後在網頁裡跑起來，它原本叫 **Build & Run**，而在除了一台以外的任何 checkout 上，這兩件事它都做不到：`emcc` 與 LVGL 是到某位貢獻者 Linux home 目錄底下的兩條絕對路徑去找的，所以按下按鈕得到的回答，是一則指著陌生人資料夾的工具鏈錯誤。現在它照它真正的樣子改名 —— 沒有面板的面板 —— 按鈕上是 **Start** 與 **Stop**，因為分頁是地方、按鈕是動作。而且它被修好了：`server/emulator/toolchain.ts` 用一份有序候選清單去「找」每個工具，每個候選都要靠哨兵檔確認，而不是看目錄存不存在；明確設定第一、這個 repo 自己裝的 pin 版本第二、機器本來就有的最後 —— 而且贏的是哪一份會寫在面板上，所以一次奇怪的建置追得回是哪一份跑的。**LVGL 是從韌體板子的相依快取裡找到的**，也就是說在建置過一次韌體的機器上根本不用下載；更重要的是，Emulator 與 Deploy 從此編的是*同一份* LVGL、*同一個* pin，而不是靠紀律去對齊。缺的東西由 **`npm run emulator:setup`** 補上 —— Emscripten 6.0.8 與 LVGL v9.5.0 裝進被 gitignore 的 `.hmi-cache/emulator/`，不碰系統層級，沿用韌體 bootstrap 早就在用的釘選壓縮檔慣例，連「用 GitHub 壓在 zip 裡的 commit 去比對 `firmware/vendor/` 既有壓縮檔」這件事都一樣。連結所需要的靜態庫也不再是一個沒人會告訴你的手動步驟：它改成按需建置、以產生它的設定為快取鍵、一核一個工作平行編譯、輸出即時串出來，而且是在 `LV_USE_SDL` 關掉的情況下建的 —— 這正是舊腳本面對 LVGL 9.5 從一開始就不可能成功的原因。在這一切開始之前，分頁會先問 dev server 它能用什麼建置，所以一台沒有工具鏈的機器**會直接告訴你補它的那行指令**，而不是在一次注定不會開始的編譯之後才說；它也會講一次「第一次要幾分鐘、之後是幾秒」。Windows 在這裡是一等公民而不是事後補丁：Git Bash 是從 clone 這份 repo 的那個 `git` 旁邊找出來的，而不是信任 PATH；Emscripten 的環境是直接組出來的，而不是 source `emsdk_env.sh` —— 後者在 Windows 上會去找 `python3`、撞上 Microsoft Store 的佔位程式，然後什麼都不 export。完整規劃，包含那一則錯誤訊息背後的五個缺陷、以及它刻意沒有解決的四件事，都在 [docs/zh-TW/emulator.md](docs/zh-TW/emulator.md)

### 修正
- **Emulator 的 LVGL 靜態庫可能以壞掉的狀態被快取** —— 封存檔原本是用 `emar q` 一次一百個分批組出來的，而 `q` 是附加，那對「產生一個產物」來說是錯的動詞：兩次執行在同一個快取目錄裡重疊，就產出了一個有 592 個成員的封存檔，其中 296 個重複、一百個缺席，`lv_display.c.o` 也在缺席名單裡。它連結時報 `undefined symbol: lv_display_create`，而因為檔案「存在」，它就以那個狀態被快取起來，之後每一次建置都連到它。封存現在是一次 `emar rcs` 搭配 response file，並且同時對目的檔數與來源數做檢查，完成之後才 rename 到位 —— 於是中途死掉的執行留下的是「沒有庫」而不是「壞掉的庫」，而兩個並行的執行會用同樣完整的封存檔互相覆蓋，不會交錯寫進同一個

- **48 個 codegen 編譯測試從「跳過」變成真的執行，而第一次跑就抓到一個 bug** —— `src/codegen/__tests__/compile.test.ts` 會產生 C 再把它編起來，也就是全專案唯一在檢查產品核心主張的地方；而它身上帶著上面那些絕對路徑的第四份拷貝，於是 `skipIf` 在每一台機器上都成立，這組測試從誕生到現在一直回報「48 skipped」。它現在改用跟 Emulator 同一套方式解析工具鏈，並且連結 Emulator 已經建好的那份庫，而不是在 `npm test` 裡啟動一次好幾分鐘的編譯。一打開，它立刻抓到真的問題：一個帶著文字樣式屬性、卻沒有字型的元件 —— 字距、文字裝飾、或只設了字級 —— 會產生 `lv_style_set_text_font(&ui_style_text_16, &_16)`，一個由空字型名組出來的符號，根本編不過。現在沒有指定字型的文字樣式會維持繼承來的字型不動，這也正是單一元件那條路徑一直以來的做法

### 變更
- **Emulator 平常講產品的話，工程用語只留在原廠研發模式** —— 狀態列原本寫 `Compiling your screens with LVGL…`、畫布上寫 `Press Start to run this screen on real LVGL`、「尚未設定」面板直接點名 Emscripten 與 POSIX shell，而 Build Output pane 放的是編譯器的逐字稿。這些對一個正在排版 HMI 的人都不是建議：他沒有要求 LVGL，也對「缺少 `bash`」做不了任何事。現在平常看到的是 **Preparing your panel…**、**Running — click the screen to try it**；工具鏈缺席時講的是該找誰、以及在那之前先用 Deploy。原廠研發模式下工程版本一字未動，因為那裡才是值得讀它的地方。**Build Output** pane 刻意不在這個範圍內：它按定義就是工程視圖，兩種模式都保留完整內容，而且預計整個頁簽會移到旗標後面，而不是硬把編譯器逐字稿翻成它沒有的字。另外，狀態列在**什麼都沒發生的時候完全不出聲**——第一次按 Start 之前、以及按下 Stop 之後，旁邊那顆按鈕已經在報狀態了，「Ready」與「Stopped」只是在複述它
- **Emulator 的狀態列拿掉表情符號** —— 它原本寫的是 `⚡ Stopped`、`🔨 Compiling…`、`📦 Loading…`，而那些符號並沒有比旁邊那個字多說任何東西；⚡ 配上「閒置」更是讀起來像在警告什麼。現在只留文字，而真正值得注意的兩個狀態——失敗與執行中——改由顏色承擔，那不需要任何解碼。另外，**Start** 在有東西正在跑的時候也會離開工具列：一顆邀你去啟動「已經啟動的模擬器」的按鈕，講的話跟它旁邊的面板相反；那時候只剩 Stop，而 Start 會跟著它一起回來

- **Edit Node 對話框以型別徽章開頭，機器名稱留給原廠** —— 每種節點的對話框在名稱欄位上方顯示分類色的小徽章；原始的 subtype 識別字（`event_trigger`、`tag_read`⋯）只在原廠人員研發模式於徽章旁顯示，理由與藏起 Code 分頁相同。Event Trigger 的 **Event Type 下拉移除了** —— 事件由元件端綁定選擇，節點沒有東西可設定；對話框改為指路去哪裡綁定，舊圖存的 `eventType` 仍由 legacy 註冊路徑無聲讀取，節點面也捨棄過時的 Event 行、只顯示真正的呼叫者。順帶修正對話框的型別顏色 —— 它漏掉了架子正名，把 flow、screen、device 節點都塗成灰色
- **Logic 節點分類正名為架子本身，顏色跟著走** —— 儲存的五分法 trigger-condition-action-data-custom 換成六個架子（trigger／flow／screen／data／device／custom），顯示分組與資料從此一致，過渡用的 `paletteGroup` 欄位功成身退。節點顏色跟著架子：Compare 轉紫、Delay 轉琥珀、tag 節點轉青、Call Function 轉灰。遷移的鑰匙是 subType：`normalizeLogicGraphs` 在 store 每個入口（開專案、專案清單、匯入圖）以定義表重新推導每個節點的分類，帶著 `condition`、`action` 的舊檔永遠讀得進來，未知的 subType 保留仍有效的儲存值、否則退到 `custom`。程式碼產生全面以 subType 為準；僅有的一處分類判斷（無 trigger 線性後備）改以定義表的執行輸入埠判定，順帶修好它從前看不見 `var_write` 與 `tag_write` 的盲點
- **Logic 調色盤的 Custom 架子移入原廠人員研發模式** —— Call Function 與 C Code Block 是手寫 C，屬於原廠工程師的領域，理由與 Code、Icon 分頁搬進去時相同。閘門同時蓋住架子與搜尋，自訂節點不會從查詢那邊漏回來；已放進圖裡的節點在任何模式都照常渲染與產生 —— 藏起來的只有調色盤上的供應
- **Logic 調色盤改按「作者在操作什麼」分組** —— Triggers／Flow／Screen／Data／Device／Custom，取代工程師視角的 trigger-condition-action-data-custom。Delay 搬進 Flow（它是流程，不是動作）；Compare 與 Logic Operation 併入 Data（它們是運算式，現在和其他圓點埠節點作伴）；Get Property 歸隊 Screen 家族；Call Function 搬到 Custom 與 C Code Block 並肩；Read Tag 與 Write Tag 有了自己的 Device 架子 —— 隨協定成長但節點不增生。依 [docs/logic-node-taxonomy.md](docs/zh-TW/logic-node-taxonomy.md) 決策三，僅動顯示層：儲存的節點 type、它們的顏色、每一張已存的圖都原封不動，並有測試同時釘住兩層，不可能無聲漂移
- **Event Trigger 的 Event Object 輸出移入原廠人員研發模式** —— 產生的程式碼會丟棄事件（`(void)e;`），一般模式下這個埠只承諾裝置給不了的東西；已經接了線的埠在兩種模式都顯示，連線永遠不會被藏斷。更深的發現記錄在 [docs/logic-event-trigger.md](docs/zh-TW/logic-event-trigger.md)：事件圖產生的程式碼沒有任何東西會註冊，因為編輯器還說不出是哪個元件觸發 trigger —— 節點對話框上的 Target Component 選擇器試過又刻意拿掉了，這個設計問題保持開放
- **Logic 圖有了自己的管理面板，位於節點清單下方** —— 原本的圖選擇器是浮在畫布上的下拉選單加一顆垃圾桶按鈕：既擋畫面，又稱不上管理。現在 Nodes 面板下方有一個可收合的 Logic Graphs 面板 —— 搜尋、新增、刪除、點選開啟，開啟中的圖有高亮標示，標題列最前面是 VS Code 樣式的收合箭頭。和 Nodes 區的交界可以拖拉調整高度，兩邊都保有最小可用高度。刪除會以名字確認。新增時拒絕與既有圖重複的名字，並帶著被拒的名字重開命名框 —— 清單裡兩個同名的圖是分不出來的；預設建議名稱照舊自動跳過已被占用的
- **Icon 分頁移入原廠人員研發模式** —— 圖庫的瀏覽、搜尋、Copy SVG 都正常，但免寫程式碼的作者拿著它複製出的東西哪裡都去不了：studio 沒有任何功能吃 SVG，頁面也沒有插入這一步。一個通往死路的分頁比沒有分頁更糟，所以它與 Code 一樣改為原廠模式限定，直到接上真正的管線。經查證**今天就能到達硬體**的兩條路 —— LVGL 內建 `LV_SYMBOL_*` 字圖貼進 label 文字（已逐位元組驗證 codegen 輸出），以及 Copy SVG → 存檔 → Image 上傳（光柵化為正確的 ARGB8888 陣列）—— 連同操作步驟、symbol 對照表與議定的重做方向，記錄在 [docs/icon-library.md](docs/zh-TW/icon-library.md)
- **Texts 分頁也改成樹狀加明細的形狀，Key 更名為 Id** —— TouchGFX 的 Groups 窗格：左側是群組樹（兩層、可拖拉歸戶）與文字列，和右側表格同步 —— 點群組，表格限縮到它（含子群組）；點文字列，表格選取並捲到那一列；＋ New Text 落在目前檢視的群組裡。Id 欄位表頭可排序，升冪降冪、不分大小寫。欄位從 Key 改名為 Id —— Design 端 Property editor 的綁定下拉也一併改 —— 因為它就是產生的程式碼配對用的識別字，和 Typographies 分頁的 Id 是同一件事。新增語系從工具列上兩個漂浮的輸入框，搬到欄位表頭尾端的 ＋ —— 欄位在哪裡，加欄位的地方就在哪裡。群組隨專案儲存，匯出匯入都保留
- **Font Properties 把作者要的和工廠要的分開** —— 普通模式下選取字型顯示中繼資料、名稱、實際渲染預覽，以及對所有人都要緊的警告：檔案畫不出來的字、和字元掃描看不到的自訂 C。轉檔機制 —— C 變數名、Auto/Preset/Manual 字元集模式、額外字元與範圍、涵蓋總數、BPP 與產生按鈕 —— 收進 Factory Dev Mode，掛在有標示的分隔線之下；Auto 自己安靜做事，不需要照顧。面板同時不再雙重捲動：舊的內層 500px 灰盒拿掉了，改由窗格本身捲動
- **Fonts 分頁改成 Typographies 的形狀：左側樹狀、右側屬性** —— 三個固定群組、可收合：*Built-in*（Montserrat，編在 LVGL 裡 —— 選取它會說明為什麼沒有東西可轉檔或刪除）、*Bundled*（四款 Noto 全列，不管加了沒有；還沒加的那一列帶 **+ Add**，加入後留在原群組而不是搬走）、*Project fonts*（作者自己上傳的）。搜尋、上傳、刪除都在樹上；搜尋過濾每一個群組。Typographies 的字型下拉選單改為同樣的三組，兩個介面的「Built-in」從此指同一件事 —— 編在 LVGL 裡 —— 而不是一邊指這個、另一邊指「隨產品出貨」。隨附字型並改為預設存在：每個專案開啟時自動擁有四款 Noto，沒有 + Add 也沒有刪除，因為沒被使用的字型毫無代價 —— 不宣告、不轉檔、存檔也只存參照 —— 而刪掉的下次開啟又會回來。+ Add 只保留為 payload 載入失敗時的降級狀態舊版是「未加入的隨附字型橫幅」加「其他全部的卡片牆」，正是 Typographies 字型下拉以前那個選項搬家的問題
- **Typographies 分頁改成樹狀，每個 typography 有 Default 加上「有客製的語系」分頁** —— TouchGFX 的形狀，一次解決兩件事。三十個字級的專案是一份沒人掃得完的平面清單，所以 typography 現在可以放進群組，最多兩層、可拖拉搬移，和畫面管理一樣。另外 *Base font* 這個概念拿掉了：typography 自己的設定**就是** Default，語系分頁只存「它改了什麼」，沒點名的部分一律繼續來自 Default —— 於是給繁體一個中文字體是一個欄位，而不是把整個樣式重述一遍，而改 Default 仍然會傳到所有沒有覆寫的語系。語系分頁是「加出來的」，不是跟著語系清單自動長的：一開始只有 Default，作者從 ＋ 選單挑語系才會出現分頁，每個分頁右側帶一個 × 可以關掉 —— 關掉後該語系重新跟隨 Default；分頁真的存了設定會先確認，剛加的空分頁則直接關。（TouchGFX 把同一個刪除藏在滑鼠右鍵；放在分頁上的 × 是同一件事，只是看得見。）剛加入的分頁以空條目儲存，重開專案還在，但在出現差異之前不產生任何程式碼。語系現在除了字體，也能覆寫字距、行距、對齊、裝飾與方向，產生的程式碼會在語系切換時只重新套用這些，並在離開時還原成 Default。Name 標籤改為 Id，因為它是產生的樣式命名的依據，不是描述。刻意不提供：Fallback Characters、Ellipsis Character 與 Bitmap/Vector 開關 —— LVGL 在這三處做得到與做不到什麼，見 [docs/text-typography-evaluation.md](docs/text-typography-evaluation.md) §7.1–7.3；`fallbackCharacter` 欄位先存起來，等 wildcard 讓它真正有意義的那天
- **Deploy 分頁的配置面板改以位址區間呈現** —— 從 *Image Placement* 更名為 *Asset Placement*，把轉換後的字型與圖片並列，每一項給出起始與結束位址，而不是位址加大小。這個面板要回答的問題是「這個資產是不是從頭到尾都在 QSPI 視窗裡」，兩端直接回答了它；起點與終點落在不同區域的區間現在會明講，而不是只報起點。字型那一列還會帶上字數與平均每字位元組，從實際編譯的那個檔案的 `glyph_dsc[]` 數出來 —— 光看大小無法分辨一個字型大是因為收的字多，還是因為每個字都很貴
- **Typographies 分頁的字型與大小拆成兩個欄位，不再是一個下拉選單** —— 綁在一起等於一份清單同時承載兩個選擇，想選 24px 得先捲過所有字型，同一個字型的兩個尺寸看起來像兩個字型。Font 現在只列字型家族（Montserrat 出現一次，不是 21 次），Size 改成直接輸入。內建字型只有特定尺寸，所以會吸附到最近的一個並明講
- **內建的隨附字型可以直接在 Typographies 的字型清單選** —— 不管專案有沒有加過，Noto Sans JP 與 KR 都會出現在「Bundled — added on selection」群組，選下去就會自動加入。以前要 CJK 字型得先繞去 Fonts 分頁再繞回來
- **元件層級不再有字型設定** —— 屬性編輯器只設定 Typography。在單一元件上設定的字體與大小，對其他應該一致的元件是看不見的，而且只有 Typography 能帶各語系字型。「＋ New typography from this widget」仍然會用元件目前的設定當種子，那就是舊專案搬過來的路徑；既有的元件層級設定也照舊會產生程式碼
- **文字 key 改為不分大小寫唯一** —— `newText` 和 `newtext` 以前是兩列，而自動推導的 key 是小寫的，所以把顯示 "newText" 的元件連結起來，就會在手寫的那一列旁邊生出第二列。一筆有翻譯一筆沒有，在表格裡完全分不出來。現在改名會被拒絕並告訴你和哪個 key 撞到，自動推導也會跳過只差大小寫的那個
- **EVK043027B 的 Modbus RTU 改走 Type-C USB 虛擬 COM port**，不再走 RS-485。這塊板子沒有 ST-LINK VCP（它是用外掛探針燒錄的），但它自己有 USB device 周邊，所以 Type-C 埠會以 VID 0x0483 / PID 0x5740 列舉成 `USB Serial Device (COMxx)`，Windows 直接綁內建的 `usbser.sys`。不需轉換器也不需驅動：插上、在 Communication 分頁選那個 port、跑測試伺服器。ST 的 USB Device Library 由 `bootstrap-deps.ps1` 抓取；描述符、低層黏合與帶 ring buffer 的 CDC 傳輸層則在 `src/`。RS-485 收發器還在板上，`board_uart1_apply` 也還會正確設定它，只是沒人呼叫 —— 見 [docs/zh-TW/edt-evk043027b.md](docs/zh-TW/edt-evk043027b.md) §5
- **Modbus 的時間設定在 USB 上仍然有意義** —— USB 傳輸沒有 baud rate，所以 Protocol 分頁的那個值改用來推導 RTU 幀間靜默時間，而不是被忽略。Parity 與 stop bits 依 CDC 規定記錄並回報給主機，除此之外不作用

### 新增
- **橫向或直向，建立專案時選，之後也還能改** —— New Project 對話框在 Hardware Model Number 旁多了 **Display Orientation** 欄位，已經建立的專案則在 Project Settings 的 Project Name 底下看到同一個欄位。在那裡更改會把設計整個轉過去：每一個畫面上每一個 widget 的外框轉四分之一圈，每一棵子樹是在父層**旋轉前**的框裡轉、不是在畫布裡轉，畫布同時對調 —— 只記一筆 undo，所以 Ctrl+Z 一次全部收回。只轉外框，而且對話框在**存檔前**就講明白、不是事後才說：label 的文字方向、arc 的角度、chart 的座標軸，是十六種 widget 各自的設計問題，不是幾何問題。儲存的解析度是**邏輯**解析度、本來就已經轉過，所以那四十幾個讀畫布尺寸的地方一行都不用改 —— 包含 Prototype、Emulator、對齊工具與專案卡縮圖。板子定義會宣告自己的韌體驅動得了哪些方向，而那管的是**能不能編譯，不是能不能設計**，跟未實作的通訊協定完全同一個做法：兩個方向在每塊板子上都能排版與預覽，Deploy 分頁則帶著具體理由拒絕沒有驅動的那個。直向在 STM32H747I-DISCO 上是免費的 —— 它的 OTM8009A 原生就是直向，是 BSP 寫面板自己的 MADCTR 暫存器把它轉成橫向 —— 不花 CPU、不多佔 RAM，不撕裂的 DIRECT render mode 也完全不動。另外兩塊 parallel RGB 板子根本沒有掃描方向暫存器，要直向就得改用 LVGL 的 partial render mode 並在每次 flush 做一次軟體旋轉，所以它們的 `board_display_init` 會拒絕直向設定，而不是畫出一張剪切變形的畫面。方向是以**資料**而非前置處理器定義傳到韌體：產生的 `hmi_display_generated.c` 覆寫每塊板子 `board_display.c` 裡的 `__weak` 預設，與 `hmi_runtime_config` 是同一份契約，所以沒有任何產生原始碼的樣板照樣連結、照樣開得起來。已用 ARM 工具鏈驗證 —— 兩塊板子都編得過，檔案在時強定義勝出、檔案不在時 weak 預設接手連結。完整評估，包含讓另外兩塊板子昂貴的那條 LVGL 限制、以及定案用的 437 KB SRAM 實測，收在 [docs/display-orientation.md](docs/zh-TW/display-orientation.md)
- **元件的事件可以執行邏輯圖 —— Event Trigger 終於有了呼叫者** —— Handler Type 在 Built-in Action 與 Custom Code 旁多了 **Logic Graphs**：勾選一或多張圖，事件的 callback 就按清單順序呼叫每張圖的事件進入函式。接線歸元件所有；圖保持為可重用的具名動作，多個事件可以執行同一張。選擇器會標示停用的圖與沒有 Event Trigger 的圖、對空選與失效選擇提出警告，而產生的程式碼對已刪除或被關掉的圖輸出註解，絕不呼叫不存在的符號。Event Trigger 節點面列出呼叫者 —— `Called by: Button_a8da (CLICKED)` —— 沒人呼叫時明講。底層則讓每個 trigger 拿到自己的進入函式：圖函式只跑事件鏈、每個 timer trigger 擁有私有 callback，順帶修掉兩個潛在缺陷 —— 混合 timer 與事件的圖會交叉觸發、一個 delay 模式的 timer 會把共用 callback 的計時器替所有人刪掉。完整歷史記錄在 [docs/logic-event-trigger.md](docs/zh-TW/logic-event-trigger.md)
- **Logic 圖改說 tag，不再說暫存器 —— Read Tag 與 Write Tag** —— Protocol 分頁的 tag 表成為 Modbus 位址唯一的家。調色盤的 Read Holding Register —— 把位址直接打進節點，正是 tag 表存在要防止的協定耦合 —— 標記棄用（已存的圖照常運作），改由 **Read Tag** 與 **Write Tag** 以名字參照 tag；選擇器依 access 過濾，程式碼產生還做不到的 tag 會明講原因而不是憑空消失。Read Tag 涵蓋 16-bit 的 holding-register tag：以無物件描述子輪詢原始值，tag 的型別與 scale 在 `ui_logic.c` 套用 —— int16 的正負號因此躲過 runtime 讀取 API 的鉗位。Write Tag 是那條從來不存在的寫入路徑 —— coil 與 holding-register 的全部資料型別，騎在帶著 tag 型別與 scale 的純寫入描述子上，由三塊板 runtime 新增的 `hmi_runtime_write_holding_register`／`hmi_runtime_write_coil` 排入佇列（值是工程值，縮放方式與 widget 寫入完全一致；韌體以目視與單元測試驗證 —— 開發環境沒有 ARM 工具鏈）。這是 [docs/logic-node-taxonomy.md](docs/zh-TW/logic-node-taxonomy.md) 議定順序的第一步，文件已記錄落地內容
- **Logic 圖有了 Properties 面板，和一個真的有作用的 Active 開關** —— 面板加在右側 Variables 上方，與左下的圖清單同款的可收合形狀，顯示目前開啟的圖的設定。日常用的控制只有一個 **Active**：關掉的圖完全不會出現在產生的程式碼裡 —— 宣告、函式、callback、註冊一併消失 —— 而且面板會明講。圖暫定為全域運作，所以一併起草的逐畫面設定（預設全部，取消後是明細勾選清單）移入原廠人員研發模式：存在圖本體上、隨存檔與匯出保留，在程式碼產生學會依畫面篩選之前不被任何東西使用
- **裝置畫不出來的字，編輯器在燒錄前就講** —— 畫布用瀏覽器的字型渲染，什麼文字都畫得出來，於是一個透過內建 Montserrat 顯示中文的 label 在編輯器裡完美、在面板上是一排方塊，而第一次看見這個失敗要花掉一輪燒錄。Property editor 的 Typography 區現在逐語系檢查文字 —— 包括沒有自己譯文的語系實際 fallback 到的那些字 —— 對照裝置上真正負責畫它的字型。只有內建 Montserrat 會有缺口：它的涵蓋在 LVGL 編譯時就固定了，而轉檔字型的字元集正是從這些文字收集來的。警告會點名語系與字元，並指出確切的修法 —— 在治理的 typography 上給該語系一個帶合適字型的分頁，或在還沒有 typography 時先綁一個。Typographies 面板的使用計數也不再少算：以前只數 widget 自己的欄位，完全透過 Texts 表工作的 typography 顯示「Used by 0 widgets」—— 恰恰在最不該被忽略的時候讀起來像「可以忽略」
- **Label 有了真正的刪節號 —— Long Text Mode 新增「Ellipsis (…)」** —— LVGL 的 DOTS 模式寫死三個 ASCII 句點（`lv_label.c` 的 `LV_LABEL_DOT_NUM`，連設定選項都不是），所以 TouchGFX 那個單一 U+2026 意味著截斷得自己做：CLIP 模式加上產生的輔助函式，用 `lv_text_get_size` 量測、保留「接上刪節號後仍放得下」的最長前綴，且只在 UTF-8 邊界切。連結到文字資源的刪節號 label 刻意不帶翻譯 tag —— label 自己的 tag 處理會在每次切換語系時用全文蓋掉截斷 —— 所以產生的 callback 接管文字、自行重新解析 tag，在語系切換與改變大小時重新截斷。U+2026 會自動收進該 label 的字型，否則收尾那個字元本身就是缺字方塊。畫布用瀏覽器原生的單行刪節號預覽，同一個字元。舊的 `dot` 選項改為誠實的「Dots (...)」。已用 Cortex-M7 在 `-Wall -Wextra -Werror` 下驗證編譯乾淨
- **Wildcard，以及真的會渲染的 Fallback 字元** —— Modbus 字串或格式化數字是執行期才出現的，裁剪字元集的掃描看不見它們，所以 typography 現在可以宣告 Wildcard Characters 與 Wildcard Ranges（範圍兩端是單一字元或 `0x` 十六進位 —— `0-9` 指的是數字，因為 code point 0–9 是九個控制字元）。逐語系分頁宣告，TouchGFX 的形狀：每個分頁有自己的 Wildcards 與 Fallback Character 欄位，沒宣告的分頁繼承 Default 的宣告，而每個語系的宣告轉進該語系解析到的那個字型 —— 阿拉伯文分頁的 `٪` 進阿拉伯文的字體，不是進每一個字體。範圍以 `--range` 原樣傳遞而不展開，因為一個中日韓區塊是數萬字元，Windows 的命令列在 32k 截斷。Fallback 字元搭同一班車：產生的程式碼在 LVGL 的 `lv_font_t.fallback` 鏈尾端接上一個代換字型，它的 `get_glyph_dsc` 對任何字都回答宣告的那個字元，且共用來源字型的表，所以會以正確的字體和字級渲染；自己宣告字元的語系拿到自己的代換體、隨語系切換，而只加 wildcard 的分頁完全不產生 runtime 切換 —— 它的全部效果在轉檔時就結清了 —— 已用 Cortex-M7 在 `-Wall -Wextra -Werror` 下驗證編譯乾淨。Label 與 Button 在畫布上預覽完整解析後的 typography —— 字距、對齊、裝飾、逐語系 —— 而當 typography 接管時，元件層級的 Text Alignment 列會隱藏，因為物件層級樣式會無聲壓過共用樣式
- **STM32H747I-DISCO 上字型字圖改連結到外部 flash** —— 轉出來的 CJK 子集是這份韌體連結的東西裡最大的一個，1 MB 內部 flash 在放完程式碼之後沒有位置容納它。每個轉換後的字型會把 `LV_ATTRIBUTE_LARGE_CONST`（LVGL 自己掛在那個陣列上的鉤子）重新定義成 `.ext_flash_fonts` section，由 linker script 放進 QSPI NOR；描述元、cmap 與 `lv_font_t` 留在內部 flash，因為它們很小、而且每次查字都會讀到。以 `HMI_FONTS_IN_EXTERNAL_FLASH` 包住，只有真的有地方放的板子才定義，所以同一份轉換結果仍可供 WASM 預覽與沒有外部 flash 的板子使用。已用 ARM 工具鏈驗證：一份 14px Noto Sans TC 子集切成 `.ext_flash_fonts` 0x148 / `.rodata` 0xcc，同一個檔不加定義則是 `.rodata` 0x214
- **Noto Sans SC 也隨編輯器出貨**，且四款 Noto 字型現在都列在 Typographies 字型下拉選單的 *Built-in* 之下 —— 同一個標題、不管專案加過沒有都在同一個位置，*Project fonts* 則留給作者自己上傳的字型。先前的分法會讓同一個字型因為「用過了沒」而出現在不同標題下，那是編輯器的內部記帳，不是作者做過的選擇。Montserrat 雖與它們並列，本質仍不同：編進 LVGL、不需轉檔、只有 `lv_conf.h` 打開的那幾個尺寸
- **Noto Sans TC 隨編輯器出貨** —— 繁體中文是這些板子的主要市場，卻是唯一沒有隨附字型的語系，於是專案切到繁體就是一整排缺字方塊，而且字型下拉選單裡沒有任何能解決它的選項。`NotoSansTC-Regular.otf`，OFL-1.1，來源與已隨附的 JP、KR 完全相同（`notofonts/noto-cjk` 的 `Sans/SubsetOTF`）。它走同一套 auto 字元集裁剪進 Flash，所以一套 UI 的中文只佔數十 KB，而不是整套字型的 5.4 MB
- **元件改用 key 從下拉選單挑選要顯示的文字** —— 屬性編輯器新增 Key 欄位，列出文字表的每一列，綁定元件變成「選一個」而不是「反覆改字面文字直到剛好對上既有的列」。選定 key 後元件的字面文字會更新成它現在顯示的字，那正是解除連結與刪除時的退路
- **文字資源可以指定它的 Typography** —— Texts 分頁新增 Typography 欄，即 TouchGFX 的 TypedText → Typography 配對。在這裡設定會蓋過元件自己的指定，於是需要特定字體的文字會把字體帶到它出現的每個地方，而不是只帶到有人記得設定的地方。畫布、屬性編輯器與 `ui.c` 都走同一條解析規則，所以預覽就是產生的程式碼
- **「切換語系」成為內建事件動作** —— 執行中的 UI 上的按鈕現在可以直接切換語系，在此之前這需要在自訂處理常式裡手寫 C。可以指定語系（`lv_translation_set_language("zh-TW")`），也可以選「next language」在專案語系之間循環並繞回第一個；循環用的輔助函式在 `ui_events.c` 只產生一份，不管有幾個按鈕用到它。除此之外不產生任何東西，因為不需要 —— label 會自己重讀文字，而 `ui.c` 早已為不會自己重讀的元件註冊了 callback。有兩種情況刻意不產生程式碼，而不是產生半殘的東西：專案已經沒有的語系代碼，以及只有一個語系時的循環切換。詳見 [docs/zh-TW/language-switching.md](docs/zh-TW/language-switching.md)，其中也說明畫布 🌐 預覽、Emulator 與硬體各自涵蓋與涵蓋不到什麼
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
