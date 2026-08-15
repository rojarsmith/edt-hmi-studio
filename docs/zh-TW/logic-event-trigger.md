# Event Trigger —— 它今天做什麼，以及鏈條斷在哪裡

<p align="center">
  <a href="../logic-event-trigger.md">English</a> · <strong>繁體中文</strong>
</p>

**Event Trigger** 節點在某個元件發出 LVGL 事件時啟動一張邏輯圖 —— 按鈕的
`LV_EVENT_CLICKED`、滑桿的 `LV_EVENT_VALUE_CHANGED`。這條鏈幾乎整條從一開始
就存在而且有測試：資料模型帶著目標元件欄位、程式碼產生器會註冊 callback、
韌體樣板在正確的時機呼叫初始化函式。缺的正好是一環 —— **Edit Node 對話框
從不問「是哪個元件觸發事件」** —— 少了它，整條鏈產生的程式碼什麼都不會跑。
這一環已在 2026-08-16 接上：對話框現在有 Target Component 選擇器，而且在
還沒選的期間會明講後果。

本文記錄每一段的實況，讓之後的工作從事實出發。

## 鏈條，逐段來看

### 1. 節點與它的對話框

`nodeDefinitions.ts` 給 `event_trigger` 一個預設參數
`eventType: 'LV_EVENT_CLICKED'`，兩個輸出：**Execute**（執行流）與
**Event Object**（`any`）。Edit Node 對話框（`NodeEditDialog.tsx`）給它兩個
欄位：**Target Component** 下拉選單，列出所有畫面的全部元件 —— 和
`show_hide`、`set_property`、`get_property`、`set_text`、`set_value` 本來就有
的是同一款 —— 寫入 `params.targetComponent`；以及 **Event Type** 下拉選單，
列出與 Design 分頁事件系統共用的九種事件（Clicked、Pressed、Released、
Long Pressed、Value Changed、Focused、Defocused、Ready、Cancel）。

還沒選元件時，對話框會明講這個 trigger 不會被註冊進產生的程式碼。
（2026-08-16 之前 Target Component 欄位根本不存在，所以每一張事件圖都是
死碼 —— 本文其餘部分解釋的就是那段歷史。）

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

- Event Trigger 的圖在選定 Target Component 之後就會在硬體上執行。
  **沒選目標時依然不產生註冊** —— 但對話框現在會明講，而不是留下一張
  無聲的死圖。（Timer Trigger 的圖從來不需要目標，兩個時期都正常。）
- Logic 分頁的 **Debug** 按鈕是手動的走訪 —— 從第一個 trigger 節點開始，
  按一次 Step 沿執行線走一步。它不模擬點擊，也不計算任何值。
- **WASM 預覽**（Build & Run）完全忽略邏輯圖 —— `editorStateToJson.ts` 匯出
  畫面、樣式與事件，但不含圖。只有匯出的 C 程式碼帶著邏輯。

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

## 修補本身，以及刻意不動的部分

修補就是上面說的那一個下拉選單：`event_trigger` 拿到對話框本來就為
`show_hide` 畫好的同款 Target Component 選擇器，寫入
`params.targetComponent`，既有的 codegen、解析與韌體路徑原封不動地亮起來，
測試早就在了。

兩個鄰近的問題經過考慮後刻意維持原狀：

- **元件 id 失效**（選定後元件被刪除）時，解析器仍然無聲地退回名稱推導 ——
  這是所有帶目標的節點共同的行為；只替一個節點修好反而誤導。
- **Event Object 輸出移入 Factory Dev Mode**（同日 2026-08-16，依需求）：
  callback 包裝仍然丟棄事件，所以在一般模式下這個埠只承諾裝置給不了的東西。
  埠留在節點資料裡 —— 隱藏只在渲染層 —— 而已經接了線的埠在兩種模式都顯示，
  連線永遠不會被藏斷。把事件內容餵進資料流，仍然是真正的後續工作。
