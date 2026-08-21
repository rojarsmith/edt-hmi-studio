# 狀態列上方的可隱藏式面板——評估

<p align="center">
  <a href="../bottom-dock-panel.md">English</a> · <strong>繁體中文</strong>
</p>

狀態：**先評估，然後做了。** §1–§9 是程式碼還不存在時寫下的評估；§10 記錄實際做了什麼，
以及評估在哪裡是錯的。內容都對照過原始碼，不是憑印象。

提案內容：模仿 Visual Studio 底部那條工具視窗列——在**狀態列上方**的橫向空間放一個
可收合、可調整高度的面板，裡面放好幾個可切換的分頁。先做兩個：**Build Firmware** 與
**Flash & Reset**，在 Deploy 分頁自動顯示，在其他分頁自動隱藏。

先講結論：**可行，而且版面那一半幾乎是免費的。** 成本不在那個抽屜，在 Deploy 分頁把
狀態放在哪裡。

## 1. 版面本來就是對的形狀

`App.tsx` 畫出來的是一個乾淨的 flex column：

```
.app  (display: flex; flex-direction: column; height: 100%)
├── .app-header            固定高
├── renderMainContent()    .app-body { flex: 1; overflow: hidden; min-height: 0 }
└── <StatusBar />          固定高
```

抽屜就是 `renderMainContent()` 與 `<StatusBar />` 之間再多一個兄弟節點
（`App.tsx:656`）。決定這件事會不會成立的是兩個屬性，而**兩個都已經寫好了**：
`.app-body` 帶著 `flex: 1`、`overflow: hidden` **以及 `min-height: 0`**
（`App.css:140`）。`min-height: 0` 正是最常被忘記的那一個——沒有它，flex 子項不肯縮到
比內容還小，抽屜就會把狀態列擠出畫面外，而不是壓縮工作區。

所以 Design 畫布、Preview 以及每一個 full-panel 分頁都會正確讓出高度，**完全不需要重構
版面**。這是這份估算裡最關鍵的一個輸入。

## 2. 互動零件也已經有了

這個 repo 做過同樣形狀的東西：

| 需要的 | 已經存在 | 在哪 |
|---|---|---|
| 拖上緣改高度 | `.panel-grip`——8 px、`row-resize`、absolute 貼在面板自己的上緣 | `components/panelBar.css:94`，已被四個面板共用 |
| pointer 拖曳＋min/max 夾制 | 約 30 行，可以原樣抽出來 | `LogicEditor/GraphManager.tsx:24` |
| 收合箭頭 | `PanelChevron` | `LogicEditor/` |

一個命名上的註記：這個 codebase 已經把 **Manager** 用在內容管理器上了——`GraphManager`、
`ScreenManager`、`ProjectManager`。這次提的東西比較接近 Visual Studio 的 *tool window*。
值得換一個詞（一個 **dock**，裡面放 **pane**），免得之後討論講不清楚。

## 3. 真正的成本：Deploy 的狀態是 local 的，切分頁就會被銷毀

抽屜要顯示的每一樣東西，都住在元件裡的 `useState`（`DeployPanel.tsx:72`–`:82`）：
`busy`、`buildId`、`logs`、`artifactUrl`、`layout`。而 `renderMainContent()` 是對
active tab 做的 `switch`，所以一離開 Deploy 就會 **unmount `DeployPanel`，把這些全部
丟掉**。

這不是這個提案帶來的新問題，而是提案會一頭撞上的既有缺陷：

> 開始建置、切到 Design、再切回來——log 是空的、`buildId` 也沒了，於是
> **Flash & Reset 不知道要燒什麼。**

所以底下那個選擇，就是這整件事的全部決定。

## 4. 兩種架構

**A——抽屜掛在 Deploy 裡面**（用 portal 投影到狀態列上方那條帶子）。

- 最便宜：一個元件加一點 CSS。
- 但它只是把現有的 log 框換個位置。它會跟著 `DeployPanel` 一起死，所以「這個區域可以有
  多個管理器」交付不出來——之後要加第三個 pane（例如全域錯誤清單）就得重做一次。

**B——抽屜掛在 `App` 層，Deploy 的狀態搬到 store。**

- 抽屜本身一樣便宜；工作量在把 `logs` / `busy` / `buildId` / `artifactUrl` 搬進一個
  `deployStore`（zustand，這個專案到處都在用）。
- 除了抽屜以外它還換到：**你在別的分頁工作時建置照跑，切回來 log 還在。**`buildId` 也
  還在，Flash & Reset 因此一直有效。§3 是它順手修掉的副作用。

**建議 B。** 那句需求本身——*這個區域可以有多個管理器*——只有在全域抽屜下才站得住。
A 是那種「一旦成功就得砍掉重做」的版本。

## 5.「管理器」裡該放什麼：輸出，不是按鈕

這件事該在動工之前定案。在 Visual Studio 裡，底部那條放的是**輸出視窗**——Error List、
Output、Package Manager Console。而這裡提的兩個 pane 是用 Deploy 卡片上那兩顆*按鈕*
命名的，所以有兩種讀法：

- **(a) 每個 pane 是一個操作的輸出。** 現在那個混在一起的「Build / Flash log」拆成兩個，
  各自有生命週期、各自有 Copy/Clear，而每個 pane 的工具列可以帶自己的觸發按鈕——就像
  Package Manager Console 有自己的控制項。Deploy 卡片保留兩顆大按鈕與摘要。**建議這個。**
- **(b) 按鈕整個搬進 pane。** 那 Deploy 分頁就只剩說明文字了。

(a) 符合被模仿的那個模型，也讓 Deploy 分頁還有存在的理由。

## 6. 自動隱藏規則有個陷阱

「在 Deploy 顯示、其他地方隱藏」讀起來很自然，但**這個面板最有用的時刻，正好就是你離開
那個分頁的時刻。** Visual Studio 不會因為你打開了別的檔案就把 Output 收掉。

建議改成這條規則：**進 Deploy 就展開；離開時，只有在沒有操作進行中才收起**——如果有，
要嘛讓抽屜保持可見，要嘛在狀態列留一個進度指示。注意這條規則**只有在架構 B 之下才做得
出來**，因為它要求操作的狀態活得比分頁久。

## 7. 要一併想清楚的細節

| 項目 | 說明 |
|---|---|
| 高度持久化 | `GraphManager` 的高度放在 `useState`，重整就沒了。抽屜至少該用 `localStorage`——這個 app 本來就直接讀它（`App.tsx:92`），不需要包裝層 |
| 收合 vs 隱藏 | 「收到只剩分頁列」跟「整個不見」是兩種狀態；Visual Studio 兩種都有 |
| 小螢幕 | 抽屜需要 max-height 夾制，工作區永遠不能被壓到 0 |
| Simulator | 它的 `<iframe>` 在 resize 時會重繪；在那個分頁開著時拖抽屜要實際看一下 |
| 工廠模式 | Deploy 分頁本身沒有被工廠模式擋（`TAB_DEFS` 只擋 `code` 與 `icon`），但面板裡有部分有擋（`DeployPanel.tsx:218`、`:397`）。抽屜的規則不能不小心把它們露出來 |
| 鍵盤與無障礙 | 分頁列要能用鍵盤切換，拖曳把手要有鍵盤替代方案 |

## 8. 工作量

| 階段 | 內容 | 粗估規模 |
|---|---|---|
| 1 | `App` 層的抽屜外殼：分頁列、收合、拖曳改高度（複用 `.panel-grip` 與 `GraphManager` 那 30 行）、`localStorage` 高度 | 1 個元件 ＋ 1 份樣式，約 200–250 行 |
| 2 | `deployStore`：把 `logs` / `busy` / `buildId` / `artifactUrl` 上移；`DeployPanel` 改讀 store | 新 store 約 80 行，`DeployPanel` 改動約 40–60 行 |
| 3 | 兩個 pane，各自帶 log 與工具列 | 2 個小元件，各 60–100 行 |
| 4 | 顯示規則（§6） | 約 20 行 |

**合計大約 500–600 行新程式碼，一個中型 PR。** 沒有任何一階是架構上有風險的改動。要最
小心的是階段 2，因為它會碰到還在飛的 `fetch` 與 unmount 的時機。

## 9. 動工前要決定的事

1. **A 還是 B**（§4）。其他每一件事都跟著它走，而建議是 B。
2. **一個 pane 裡放什麼**（§5）——帶自己工具列的輸出，還是按鈕本身。
3. **有操作在跑時，抽屜可不可以在 Deploy 以外的分頁保持可見**（§6）。答「不可以」是個
   正當的選擇，只是必須是刻意做的選擇，因為它同時決定了 §3 那個缺陷會不會被修掉。

## 10. 實際做了什麼

§9 的三個決定全部照建議走：**B**、**(a)**，以及修正過的顯示規則。實際落地的東西：

| 檔案 | 角色 |
|---|---|
| `src/store/deployStore.ts` | 操作狀態，以及操作本身。`runBuild` / `runFlash` 透過 `getState()` 讀輸入，而不是把 React state 包進 closure，所以沒有任何一段依賴某個還掛著的元件 |
| `src/store/dockStore.ts` | 只管抽屜的外觀狀態——展開與否、哪個 pane 在前、高度（存在 `localStorage`） |
| `src/components/DockPanel/DockPanel.tsx` | 外殼：分頁列、收合、拖曳改高度 |
| `src/components/DockPanel/DeployLogPane.tsx` | 一個 pane，用參數決定它顯示哪份 log、它的工具列跑哪個操作 |
| `src/components/DockPanel/EmulatorOutputPane.tsx` | Emulator 的建置 log（§11） |
| `src/App.tsx` | 把抽屜畫在 `renderMainContent()` 與 `<StatusBar />` 之間，並持有顯示規則 |

有三件事值得記下來，因為從 §1–§9 看不出來。

**顯示規則就是一個表達式。** `effectiveTab === 'deploy' || deployBusy !== null`
——Deploy 分頁會顯示它，而正在跑的操作蓋過分頁。操作在別的分頁結束時它**不會**自動收
掉：建置剛結束的那一刻，正是它最後幾行最要緊的時候，所以它會一直留著，直到作者在沒有
操作進行的情況下再次離開 Deploy。

**顯示規則被換掉兩次，而第二個答案比前面兩版都簡單。** §6 的規則把抽屜綁在 Deploy
分頁上；第一次修訂改成「帶子留在原地，變成一條 inert 的空條」。兩個都不在了：抽屜現在
在**每一個**分頁都可用，因為它後來多出來的 Work 頁簽列的是「活得比啟動它的分頁還久」的
操作，把它藏在任何地方，都等於藏掉那個唯一不屬於任何分頁的視圖
（[work-progress.md](./work-progress.md) §5）。展開與否只由作者決定，而頁簽列上那顆紅燈
負責蓋掉「自動顯示」原本存在的那個情境：抽屜收著的時候有東西在跑。

從那兩版草稿留下來的是量測的紀律。帶子的高度是在 CSS 裡釘死的，不是由內容推導的，所以
它不會因為裡面的頁簽變了就跳動；實測收合 29 px、展開 220 px，`.app-body` 把差額吸收掉，
狀態列從頭到尾沒有移動過。

**§7 那個 max-height 夾制，第一次寫錯了，而且錯得值得留下來。** 第一版是拿
`window.innerHeight - 240` 去夾，這悄悄忽略了 header 與狀態列：在 720 px 的視窗下，它
留給工作區的是 127 px，不是 240 px。修正版改成量「工作區與抽屜真正共用的那條帶子」
——從 `.app-body` 的上緣到 `.status-bar` 的上緣——再從那裡扣掉最小值。這個教訓可以推廣：
**一個以工作區命名的常數，就該從工作區裡扣，不是從視窗裡扣。**

以上都在瀏覽器裡用量出來的幾何驗證過，不是用眼睛看：Design 分頁上抽屜不存在、
`.app-body` 拿回完整的 607 px；Deploy 上 220 px 而狀態列沒有動；收合後 30 px、分頁列
仍然可切換；往上拖 100 px 剛好得到 320 px 而且 `localStorage` 記住了；最大夾制停在
「工作區剛好剩 240 px」；最小夾制停在 120 px，而工具列與 log 都還看得見。完整測試套件
1355 passing，主控台沒有錯誤。

**沒有做，而且是刻意的。** §7 提的「分頁列的鍵盤切換」與「拖曳把手的鍵盤替代方案」還
沒做——pane 帶著 `role="tab"` / `role="tabpanel"`、把手帶著 `role="separator"`，但方向鍵
導航還沒接。如果這個抽屜要長出第三個 pane，那就是第一件該補的事。

## 11.第四個 pane：Emulator 的 Build Output

§10 的結尾說「如果這個抽屜要長出第三個 pane」，鍵盤導航就是第一件該補的事。它長出的是
第四個，而那句話仍然成立——見本節結尾。

**它從哪裡來。** Emulator 原本把編譯器輸出放在自己的 local state 裡，藏在一顆
`📋 Build Output` 開關後面，按下去會在**它自己的畫布上方**打開一個框。這個形狀錯了兩次：
它是一份建置 log，而這個抽屜已經放著兩份；而你最想讀它的那一刻——一次建置剛剛失敗——
正好也是你想同時看見背後畫面的那一刻。

**它放在哪裡。** **Work** 與 **Build Firmware** 之間。這是階梯的順序，不是字母順序：
Emulator 的編譯發生在 Deploy 之前（[preview-ladder.md](./preview-ladder.md)），所以兩份
建置 log 由左至右，正好就是一個專案經過它們的順序。

**它是第一個綁分頁的 pane，而那需要一條規則。** §10 把原本「跟著 Deploy 分頁」的顯示規則
換成了「每個分頁都可用」，理由是 Work 列的是活得比分頁還久的操作。Build Output 是那個
不與之矛盾的例外：它描述的是 *Preview* 分頁剛剛做了什麼，而在 Design 分頁上，它會是一份
「畫面上根本沒有那個東西」的 log。所以做法是**過濾頁簽列**而不是隱藏整個抽屜——`App.tsx`
傳的是 `showBuildOutput={effectiveTab === 'preview' && isEmulatorEnabled}`，因為呼叫端是
唯一同時知道這兩件事的地方。

在 Build Output 在前面時離開 Preview，會解析成 **Work**，而這個解析是**推導出來的，不是
寫進去的**：`dockStore` 的 `activePane` 維持作者離開時的樣子，`DockPanel` 畫的是
`visiblePane`。所以回到 Preview 會再度落在 Build Output 上——那正是一個在 Design 與
Preview 之間來回除錯的人想要的行為。這跟 `App.tsx` 處理原廠專屬分頁用的是同一個模式，
理由也一樣：出去的時候寫一次，回來的時候就得再改回來。

**失敗的建置會自己打開它。** `showPane('output')` 會把這個 pane 帶到前面，抽屜收著的話
順便展開，於是那份 log 不用去要就會出現。成功的建置則完全不動抽屜；上面的面板已經說了
它正在跑。

**仍然沒做。** 頁簽列的方向鍵導航，以及拖曳把手的鍵盤替代方案。四個 pane 只會讓這件事
比三個更急，不會更不急。
