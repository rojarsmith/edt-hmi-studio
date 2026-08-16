# 邏輯節點分類學 —— 決策記錄

<p align="center">
  <a href="../logic-node-taxonomy.md">English</a> · <strong>繁體中文</strong>
</p>

狀態：**第一步（tag）已於 2026-08-16 落地；其餘已議定、尚未動工。**
本文記錄 Logic 分頁的節點調色盤為什麼要重新分組、通訊協定支援怎麼進來，
讓後續工作從決策出發，而不是重新推導一遍。

## 量尺

這個 studio 是一款 **no-code HMI 編輯器**：不寫程式的作者做出「畫布上怎樣、
面板上就怎樣」的介面。它**不是 Modbus 專用產品** —— Modbus 只是第一個協定，
CANbus 與其他協定會跟上。由此出發，每個調色盤決策用兩把尺量：

1. **作者想的是「對什麼東西做操作」** —— 畫面、一個值、機器、時間 —— 而不是
   計算角色。調色盤應該按節點碰觸的對象分組，不是按它編譯成哪種運算式。
2. **邏輯圖必須活過協定更換。** 一張綁死「holding register 40001」的圖，
   設備改講 CAN 的那天就死了。圖只准參照與協定無關的名字。

## 現有五分類，對在哪、錯在哪

| 分類 | 目前內容 | 判定 |
| --- | --- | --- |
| **Triggers** | Event Trigger、Timer Trigger | 骨架正確 —— 這是「來源」家族（時間、使用者，未來加上資料）。位置不動。Event Trigger 自己懸而未決的綁定問題記錄在 [logic-event-trigger.md](logic-event-trigger.md) |
| **Conditions** | If/Else、Switch、Compare、Logic Operation | 混了兩種本質。If/Else 與 Switch 分岔執行流（長方體埠）；Compare 與 Logic Operation 是純運算式（只有圓點埠，codegen 直接內聯）。同一層架子、不同種東西 —— 連接埠形狀讓人困惑的原因之一 |
| **Actions** | Set Property、Navigate to Screen、Show/Hide、Set Text、Set Value、Call Function、Delay | 混了三種對象：畫面操作（HMI 的心臟）、流程工具（Delay 不是動作，是流程）、逃生口（Call Function 本質上屬 Custom） |
| **Data** | 變數讀寫、Math、String、Get Property、**Read Holding Register** | 埋著協定地雷。Modbus 專屬節點和協定中立的變數擺在一起；照這個方式加 CANbus，旁邊就會出現 Read CAN Signal，然後每個協定各長一族節點，而每張圖都耦合在畫它時用的那個協定上 |
| **Custom** | C Code Block | 架子放對了 —— 但自訂 C 是原廠工程師的領域，不是 no-code 作者的。是 Factory Dev Mode 的候選人，理由和 Code、Icon 分頁搬進去時相同 |

## 決策一 —— 用 Tag 把圖從協定上切開

商用 HMI（WinCC、FactoryTalk、Weintek 皆然）的共同答案：**Protocol 分頁定義
具名 tag** —— 今天 `MotorSpeed` ← Modbus holding register 40001，明天
`MotorSpeed` ← CAN 訊號 `0x123.rpm` —— 而**邏輯圖只參照 tag**，調色盤上永遠
只有兩個節點：**Read Tag** 與 **Write Tag**。調色盤不會隨協定增生節點；
設備換協定時在一個分頁裡重新對應 tag，而不是重畫每一張圖。地基已經在：
`ModbusRegisterTag` 與 binding 機制已經在為暫存器命名。今天的
*Read Holding Register* 節點應演化成 *Read Tag*，而不是長出兄弟。

一個比外觀更重要的誠實性註記：**寫入路徑根本不存在。** 作者能讀暫存器，
卻不能把任何東西寫回設備 —— 而「按鈕控制機器」正是 HMI 最核心的使用情境。
Write Tag 的價值高於下面所有的重新分組。

## 決策二 —— 按「作者在操作什麼」重新分組調色盤

作者的心智模型是：*時間/使用者/資料 → 決策 → 對畫面或機器的效果*。
調色盤跟著走：

| 新分組 | 內容 | 搬動 |
| --- | --- | --- |
| **Triggers（來源）** | Timer Trigger、Event Trigger，之後加 Tag Trigger（值變化觸發） | 不變 |
| **Flow（流程）** | If/Else、Switch、**Delay** | Delay 從 Actions 搬入 |
| **Screen（畫面）** | Set Property、**Get Property**、Show/Hide、Set Text、Set Value、Navigate to Screen | Get Property 從 Data 搬入 —— 讀和寫同一個元件，本來就該在同一層架子 |
| **Data（資料運算）** | 變數讀寫、Math、String、**Compare**、**Logic Operation** | Compare 與 Logic Operation 從 Conditions 搬入 —— 它們是運算式，現在和其他圓點埠節點作伴 |
| **Device（裝置通訊）** | **Read Tag**、**Write Tag** | 隨協定成長，但節點不增生 |
| **Custom（進階）** | **Call Function**、C Code Block | Call Function 從 Actions 搬入；整類是 Factory Dev Mode 候選人 |

## 決策三 —— 先動陳列，不逼資料搬家

每個已儲存的節點帶著 `type` 欄位（`trigger | condition | action | data |
custom`），它同時決定節點顏色，而且存在每個專案的圖裡。但調色盤分組
（`NODE_CATEGORIES`）是純顯示層。所以重新分組拆成兩個互不牽連的步驟：

1. **重新上架調色盤** —— 只動顯示層，已存專案一字不動，零遷移風險。
2. 之後（如果真有必要）才改儲存的 type 值與顏色 —— 那是一次資料遷移，
   舊拼法得永遠讀得懂，所以它得自己證明值得。

## 議定順序

1. **已完成（2026-08-16）：** Read Tag / Write Tag 節點對接 Protocol 分頁的
   tag 表。Read Tag 涵蓋 16-bit 的 holding-register tag —— 以無物件描述子
   輪詢原始值，tag 的型別與 scale 在 `ui_logic.c` 套用，int16 的正負號因此
   躲過 runtime 讀取 API 的鉗位。Write Tag 涵蓋 coil 與 holding-register 的
   全部資料型別：它騎在一個帶著 tag 型別與 scale 的純寫入描述子上，由新增
   的 `hmi_runtime_write_holding_register`／`hmi_runtime_write_coil` 排入
   佇列（三塊板都加了；韌體端只能目視檢查 —— 這個環境沒有 ARM 工具鏈）。
   Read Holding Register 標記棄用：調色盤不再列出，已存的圖照常渲染與產生。
2. 依上表重新分組調色盤（僅顯示層）
3. Custom 分類移入 Factory Dev Mode
4. 儲存 type／顏色的正名 —— 可選、最後、且要先有遷移方案
