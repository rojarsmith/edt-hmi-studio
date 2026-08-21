# Event Trigger —— 它今天做什麼，以及鏈條斷在哪裡

<p align="center">
  <a href="../logic-event-trigger.md">English</a> · <strong>繁體中文</strong>
</p>

**Event Trigger** 節點在某個元件發出 LVGL 事件時啟動一張邏輯圖。本文追蹤的
那個問題 —— *是誰觸發 trigger？* —— 在 2026-08-16 由 Design 端回答了：元件
的事件多了 **Logic Graphs** 處理類型，與 Built-in Action、Custom Code 並列。
接線歸元件所有；圖保持為可重用的具名動作，多個事件可以執行同一張圖。
（trigger 對話框*內部*的 Target Component 選擇器先試過、同日拿掉 —— 把
「是誰觸發我」釘進節點，是把應用層接線決策埋錯了地方。）

本文記錄這條鏈現在怎麼運作，以及塑造它的歷史。調色盤層級的分類決策在
[logic-node-taxonomy.md](logic-node-taxonomy.md)。

## 現在的觸發方式

1. Design 分頁裡，元件的事件選 **Handler Type: Logic Graphs**，勾選一或多張
   圖；選擇器會標示停用的圖與沒有 Event Trigger 的圖，並對空選與失效選擇
   提出警告。
2. `ui_events.c` 照常產生元件的事件 callback，並在其中按清單順序呼叫每張
   勾選圖的**事件進入函式** —— `logic_<graph>();` —— 同時引入 `ui_logic.h`。
   已刪除的圖、或被 Active 開關關掉（因此不存在於產生碼裡）的圖，會產生
   誠實的註解，而不是對不存在符號的呼叫。
3. `ui_logic.c` 給每個 trigger 自己的進入點：匯出的圖函式只跑
   **event trigger 的鏈**，每個 timer trigger 擁有只跑自己鏈的私有 callback
   （含各自的 delay 模式刪除）。混合 timer 與 event 的圖不再交叉觸發 ——
   那是舊的「一圖一函式」形狀的真實缺陷。
4. Event Trigger 節點面列出呼叫者 —— `Called by: Button_a8da (CLICKED)` ——
   沒人呼叫時警示 **Not called by any event**。

兩個刻意的處置：節點的 **Event Type** 下拉已移除 —— 過濾由綁定端的事件
型別決定，節點本身沒有東西可設定（舊圖存下的 `eventType` 仍由 legacy 的
`targetComponent` 註冊路徑讀取，只是不再出現在對話框裡）；**Event Object**
輸出繼續留在 Factory Mode 後面，直到進入函式學會把 `lv_event_t` 帶進
來。Edit Node 對話框同時把型別徽章移到名稱欄位上方，原始的 subtype 識別字
只在 Factory Mode 顯示 —— 機器名稱是原廠領域，與 Code 分頁同一個理由。

## Legacy 鏈條，逐段來看（留作記錄）

### 1. 節點與它的對話框

`nodeDefinitions.ts` 給 `event_trigger` 一個預設參數
`eventType: 'LV_EVENT_CLICKED'`，兩個輸出：**Execute**（執行流）與
**Event Object**（`any`，原廠模式限定 —— 見下文）。Edit Node 對話框
（`NodeEditDialog.tsx`）只給它一個欄位：**Event Type** 下拉選單，列出與
Design 分頁事件系統共用的九種事件（Clicked、Pressed、Released、
Long Pressed、Value Changed、Focused、Defocused、Ready、Cancel）。

刻意沒有 Target Component 欄位。值得明講，因為這個下拉選單會招來誤讀：
事件型別沒有目標，並**不**代表「任何元件的點擊都會觸發這張圖」。沒有存目標
時，程式碼產生器完全不會產生註冊，所以這張圖是誰都不聽，而不是誰都聽。

### 2. 產生的程式碼（`ui_logic.c`）

每張圖會變成一個 `static void logic_<name>(void)` 函式。含 Event Trigger 的圖
另外得到一個 callback 包裝：

```c
static void logic_<name>_event_cb(lv_event_t *e) {
    (void)e;
    logic_<name>();
}
```

註冊發生在 `ui_logic_init()` —— 這裡就是決定一切的分支
（`ui_logic.c.ts` 的 `generateInitFunction`）：

```c
/* 只有 trigger.params.targetComponent 有值時才會產生： */
lv_obj_add_event_cb(ui_run_button, logic_<name>_event_cb, LV_EVENT_CLICKED, NULL);
```

`targetComponent` 可以是元件 UUID 或字面名稱 —— `resolveComponent` 會查兩個索
引，查不到再退回從字串推導變數名。完整的鏈（點擊具名按鈕 → callback → 圖導航
到另一個畫面）在 `ui_logic.c.test.ts` 有測試涵蓋，而那些測試的資料都設了
`targetComponent`。

**沒有 `targetComponent` 時 —— 也就是今天編輯器唯一做得出來的形狀 ——
註冊那一行完全不會產生。** 圖的函式和 `_event_cb` 包裝照樣輸出，但沒有任何
東西引用它們。這張圖在裝置上是死碼。

### 3. 韌體

三塊板子的樣板（`firmware/*/src/main.c`）都在 `ui_init()` 之後緊接著呼叫
`ui_logic_init()`。`ui_init()` 一開始就建好所有畫面，導航載入畫面時也不刪除
它們，所以初始化時掛在任何畫面元件上的 callback 整個韌體生命週期都有效。
執行期這一側是健全的；它只是從來沒拿到任何要註冊的東西。

## 實務上這代表什麼

- Event Trigger 的圖在某個元件的事件以 Logic handler 勾選它之後，就會在
  硬體上執行。沒有任何事件勾選的圖，進入函式產生了但沒有人呼叫 —— 節點面
  會明講。
- Logic 分頁的 **Debug** 按鈕是手動的走訪 —— 從第一個 trigger 節點開始，
  按一次 Step 沿執行線走一步。它不模擬點擊，也不計算任何值。
- **LVGL Preview** 完全忽略邏輯圖，連事件也一起忽略：`editorStateToJson.ts`
  只匯出畫面與樣式，沒有別的。它餵給真正的 LVGL 一棵元件樹，所以它是
  renderer，不是 runtime。
- **Emulator** 是唯一會跑圖的預覽。`Emulator` 把圖傳給
  `generateCode`，後者產出 `ui_logic.c`；每一個產生的檔案都會送進編譯器，而
  `ui_events.c` 會 include `ui_logic.h`。在那裡跑的，就是在硬體上跑的同一份
  C。各個預覽各自涵蓋到什麼、涵蓋不到什麼，見
  [preview-ladder.md](./preview-ladder.md)。

## 趁挖開的時候一併記下的鄰近事實

- **`LogicGraph.eventBindingId`** —— 型別帶著這個欄位、`createGraph` 也收，
  但整個程式碼庫沒有任何地方傳入或讀取它。它是當年規劃的 Design 端連結
  （元件事件 → 邏輯圖）留下的痕跡，從未接線；今天 Design 分頁的事件系統
  對邏輯圖一無所知。
- **Event Object 輸出** —— callback 包裝把 `lv_event_t *` 丟棄（`(void)e;`），
  所以節點的第二個輸出在產生的程式碼裡什麼都不餵。下游節點目前讀不到
  「是哪個物件」、「按了哪個鍵」或任何事件內容。
- 編譯驗證測試只練過*有*目標的事件圖，所以編輯器實際產出的形狀
  （包裝有輸出、永無引用）在編譯測試的覆蓋之外。

## 試過的形狀，留作記錄

**節點端目標 —— 2026-08-16 試過，同日拿掉。** 對話框短暫帶過寫入
`params.targetComponent` 的 Target Component 選擇器，沉睡的鏈整條亮起來。
深思後移除：接線屬於元件。codegen 對 `params.targetComponent`（UUID 或
名稱）的理解保留，帶著它的圖照舊走 legacy 註冊路徑。

**Design 端綁定 —— 選定，2026-08-16 落地。** 就是上文的 Logic handler。
（這個想法的舊痕跡 `LogicGraph.eventBindingId` 依然是死的 —— 綁定改存在
事件的 `logicGraphIds` 欄位上。）

一個不管選哪種形狀都成立的決定：

- **Event Object 輸出住在 Factory Mode 後面**（2026-08-16，依需求）：
  callback 包裝仍然丟棄事件，所以在一般模式下這個埠只承諾裝置給不了的東西。
  埠留在節點資料裡 —— 隱藏只在渲染層 —— 而已經接了線的埠在兩種模式都顯示，
  連線永遠不會被藏斷。把事件內容餵進資料流，仍然是真正的後續工作。
