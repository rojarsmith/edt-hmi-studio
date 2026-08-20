# Protocol、Tag，以及切換之後什麼還在——分析

<p align="center">
  <a href="../protocol-and-tags.md">English</a> · <strong>繁體中文</strong>
</p>

狀態：**只有分析，沒有實作。** 這份文件記錄目前程式碼的實際行為、回答被問到的三個
問題，並列出真要改的話該改什麼、以什麼順序。

三個問題：

1. 讓專案在建立之後還能修改 **Protocol**，是好設計嗎？
2. 切換的時候，**通訊 TAG** 會不會亂掉？
3. 之後若要支援第三種協定——特別是**自訂的 UART 串口命令架構**，那既不是 Modbus
   也不是 CAN 的形狀——會發生什麼事？

## 1. 目前程式碼實際怎麼做

以下都對照過原始碼，不是憑印象。

| 項目 | 位置 | 行為 |
|---|---|---|
| 協定 | `ProjectConfig.protocol`（`src/store/projectStore.ts`） | 一個專案一個。建立專案時從該板子支援的清單挑選，之後可在 Protocol 分頁隨時改 |
| Modbus 設定 | `ProjectConfig.communication` | 串列參數，以及整張 tag 表 |
| CAN 設定 | `ProjectConfig.canBus` | 位元時序，以及 signal 表 |
| 切換動作 | `selectProtocol`（`ProtocolPanel.tsx`） | 只寫入 `protocol`，其他什麼都不動。**不會動到任何 tag、binding 或 signal** |
| 建置閘門 | `DeployPanel.tsx` — `buildable = protocolDefinition.implemented` | CAN 是 `implemented: false`，所以 CAN 專案無法建置 |
| 匯出／匯入 | `exportProject` / `importProject`（`projectStore.ts`）、`migrateProject`（`projectManager.ts`） | 三個欄位在 `.json` 來回一趟後都還在 |

兩份協定設定是**並排保存、而不是互相取代**，型別註解本身就寫明了：

> 專案驅動哪一種現場匯流排，在建立專案時從該板子支援的集合中選定。下面各協定的
> 設定是並排保存而不是取代，所以來回切換不會把使用者已經建好的 tag 表丟掉。

### 兩種「指向 tag」的方式

第二個問題的答案就在這裡。專案裡有兩種消費者，而它們參照 tag 的方式不一樣：

| 消費者 | 存了什麼 | 產生的 C 讀什麼 | tag 被刪掉時 |
|---|---|---|---|
| **元件** — `component.modbusBinding` | `tagId` **加上一整份快照**：area、address、資料型別、存取、scale、輪詢間隔 | **快照**（`hmiBindingGenerator.ts`） | 清掉 `tagId`，快照留著。元件繼續輪詢同一個位址，而且無聲無息 |
| **邏輯節點** — Read Tag／Write Tag | `tagId`（以及只用於顯示的 `tagName`） | **tag 本身**（`ui_logic.c.ts`） | 產生註解、不產生呼叫：`/* tag X no longer exists */` |

兩種各自都說得通。但放在一起，就是同一個專案對同一個問題——*這個 tag 被刪掉會怎樣*
——給了兩種不同的答案。

`synchronizeModbusBindings`（`src/utils/modbusBindings.ts`）負責讓元件的快照保持
最新：tag 表一被編輯，每個綁定的元件都會依 tag 重寫一次，而且走 undo 堆疊。所以
快照只有一種情況會過期——那個 tag 不見了。

## 2. 可以修改 Protocol 是好設計嗎？

**是，而且讓它安全的那一半已經做對了。** 兩個性質撐起這件事：

- **切換不具破壞性。** Modbus tag 與 CAN signal 存在不同欄位，所以切到 CAN 再切
  回來，專案跟原來一模一樣。若非如此，這個下拉選單就是個陷阱：點錯一次，整張 tag
  表就沒了。
- **一個專案一個協定，而不是一個 tag 一個協定。** 板子上只有一條匯流排。混協定的
  tag 表會需要在每個 tag、每個 binding、每份產生的描述子上都掛一個協定判別欄位，
  只為了表達這裡的硬體做不到的事。

**缺的不是節制，而是告知。** 目前的切換什麼都不說，但它可能擱置一大堆東西：

- 每一個 `modbusBinding` 指向 Modbus 表的元件，
- 每一張邏輯圖裡的每一個 Read Tag／Write Tag 節點，
- 以及——若被切走的正是那個已實作的協定——整個建置能力。

Protocol 分頁本來就會講這種話：CAN 那邊會印出「尚無韌體支援」的提示。**在切換發生
之前先數一數會擱置什麼**，是這整頁上最小、也最有用的一個改動。

還有一個範圍更窄的缺陷也屬於這裡。`server/hmi/projectSource.ts` 呼叫
`generateHmiBindings(screens, communication, …)` 時**完全沒有看
`projectFile.protocol`**，所以它會很樂意為一個 CAN 專案吐出 Modbus 描述子。擋在
中間的只有 Deploy 按鈕。等第二個協定變成可建置的那天，這個順序必須反過來：由產碼器
依專案的協定決定，UI 只是反映它。

## 3. TAG 會亂掉嗎？

逐個情境來看：

| 情境 | 實際發生的事 | 判定 |
|---|---|---|
| 切走協定再切回來 | 兩張表都原封不動 | ✅ 安全 |
| 有元件綁著時修改 tag 的位址 | 一次推送到每個綁定的元件，而且可 undo | ✅ 安全 |
| 幫 tag 改名 | binding 參照的是 id，不會斷 | ✅ 安全 |
| 刪掉一個被綁定的 tag | 元件：清掉 `tagId`，繼續輪詢舊位址，沒有任何提示。邏輯節點：拒絕產碼並說明 | ⚠️ **不一致** |
| 切到一個表是空的協定 | 元件 binding 與 tag 節點仍指向舊表，沒有任何提示 | ⚠️ **無聲** |
| 匯出成 `.json` 再打開 | 協定、Modbus 設定、CAN 設定都還在 | ✅ 安全 |

**所以把 tag 弄亂的不是協定選單。** 真正的兩個風險是「刪除時的不一致」與「切換時的
沉默」，而這兩件事都不是「允許修改協定」造成的。

其中讀起來最糟的那一項值得多說一句。元件繼續輪詢一個已刪除 tag 的位址，未必是錯的
——位址還是位址，「解除 tag 綁定但繼續運作」是一種合理解讀。真正的問題在於：元件身
上沒有任何地方說「這個參照被拿掉了」。而這個專案早就有處理這種情況的語彙：動畫在目
標消失時掛的那個紫色 **LACK** 標籤——標示出來，絕不自作主張修好。tag 消失的 binding
應該掛同一個標籤。

## 4. 第三種協定：UART 命令架構

這才是決定形狀的問題，因為命令型協定跟前兩種**不是同一類東西**。

Modbus 與 CAN 都是**可定址**模型。一個 tag 回答三個問題：值在*哪裡*（`area` +
`address`；`frameId` + 位元視窗）、它*是什麼*（資料型別、scale）、以及*多久問一次*
（輪詢間隔）。正因為兩者形狀相同，[邏輯節點分類法的 Decision 1](./logic-node-taxonomy.md)
才成立：圖上寫 `MotorSpeed`，由 Protocol 分頁決定那是 holding register 40001 還是
CAN `0x123.rpm`。

而以行為單位的 UART 命令協定通常不可定址。它長這樣：

```
> GET TEMP\r\n
< TEMP=25.4\r\n
> SET TEMP 30\r\n
< OK\r\n
```

其中有三件事，在今天的 tag 裡沒有位置：

1. **沒有位址。** 有的是一個命令字串，有時還要把參數代進去。
2. **讀和寫是不同的命令**，而不是同一個位址配不同的存取模式。
3. **回覆需要解析**——前綴、分隔符號、第幾個欄位、單位後綴。今天沒有任何欄位能表達
   這件事。

### 兩種形狀，該預留哪一種

**形狀 A——一張 Tags 表，來源依協定而異。** tag 保留它與協定無關的那一半（名稱、
資料型別、存取、scale、輪詢間隔），而「在哪裡」變成一個帶判別的酬載：

```ts
type TagSource =
  | { kind: 'modbus'; area: ModbusRegisterArea; address: number }
  | { kind: 'can'; frameId: number; startBit: number; bitLength: number; byteOrder: CanByteOrder }
  | { kind: 'uart'; readCommand?: string; writeCommand?: string; parse: ReplyParse };
```

下游全部照舊：元件綁 tag、Read Tag 與 Write Tag 仍是唯二的節點、輪詢迴圈還是輪詢
迴圈。它同時把現在的兩張表併成一張，於是那個現行設計答不出來的問題——*我切換之後
binding 會怎樣？*——變成*哪些 tag 有我切過去那個協定的來源？*，而後者是看得見答案的。

**形狀 B——另開一張 Commands 表。** 對於那些「動詞根本不是值」的協定更貼切：
`REBOOT`、`TARE`、`START CYCLE`。沒有東西可讀回來，也沒有東西要輪詢。但它會讓每一
個消費者分岔——第二套 binding 編輯器、多兩個邏輯節點、第二份產生的描述子表。

**建議：預留形狀 A，只有在「一次性動詞」真的重要時才動用 B。** 一個背後沒有值的動詞
可以表達成「唯寫、且寫入固定值」的 tag，而那跟現在的 `writeBehavior: 'set'` 已經很
接近。把模型翻倍之前，這個值得先試。

### 絕對不能發生的事

目前命名鋪出來的軌跡是：Modbus 用 `communication`、CAN 用 `canBus`，第三個就
`uartCommands`——三個頂層欄位；而在元件那側是 `modbusBinding` 加 `canBinding` 加
`uartBinding`。之後每個屬性編輯器、每個產碼器、每次遷移都要三向分岔，而一個專案的
binding 會默默地屬於「協定當時剛好落在哪個欄位」。

**元件那一側，就是從來沒有套用 Decision 1 的那一半。** 邏輯圖已經跟協定脫鉤了，元件
binding 沒有。`component.modbusBinding` 從名字、型別到欄位都是 Modbus，而且它才是韌
體真正編進去的東西。

## 5. 各項改動的代價

| 改動 | 波及範圍 | 說明 |
|---|---|---|
| 切換前先說會擱置什麼 | 只有 Protocol 分頁 | 數 binding 與 tag 節點；不動模型 |
| tag 消失的 binding 掛 LACK 標籤 | 屬性編輯器 | 這個模式已經存在 |
| 產碼器依專案協定設閘門 | `server/hmi/projectSource.ts` | 一個條件式 |
| `modbusBinding` → `busBinding`，改成帶判別 | **6 個非測試檔**（`types/index.ts`、`utils/modbusBindings.ts`、`codegen/hmiBindingGenerator.ts`、`PropertyEditor.tsx`、`ModbusBindingEditor.tsx`、`store/editorStore.ts`） | 舊專案照讀舊欄位，就是這個 repo 對 `pages`、`targetPage`、巢狀動畫用過的遷移模式 |
| 一張 Tags 表，來源依協定而異 | 上述再加 Protocol 分頁與邏輯的 tag 節點 | 值得**跟 UART 一起做**，而不是提前做 |
| 只把選定協定的 runtime 編進韌體 | 韌體 CMake | 今天每次建置都會連進 `modbus_rtu_client.c`；多一套堆疊之後這就變成尺寸問題 |

## 6. 建議順序

1. **把切換的代價講出來。** 改協定之前，說明有多少元件 binding 與 tag 節點指向即將
   被留下的那張表。
2. **幫 tag 已消失的 binding 掛標籤**，讓元件那側對「刪除」的回答，跟邏輯那側一致。
3. **產碼器依專案協定設閘門**，別讓 UI 是唯一擋住錯誤建置的東西。
4. **把元件 binding 改名成與協定無關的名字**，趁第三個協定還沒把這次改名變成三向
   分岔之前。
5. **UART 模型最後再設計**，手上要有真實裝置的命令集。要預留的是上面的形狀 A，但
   解析規則應該對著一個存在的協定寫，而不是對著想像中的。

第 1–3 項各自獨立、規模都小，而且不管第三個協定會不會來都值得做。第 4 項是唯一有
時限的：今天很便宜，等到有兩個協定同時參照同一個欄位就貴了。

## 7. 刻意不建議的

- **一個 tag 一個協定。** 一塊板子一條匯流排；在每個 tag 上掛判別欄位，是為了表達
  硬體做不到的事。
- **切換時清掉另一個協定的設定。** 現在這個不具破壞性的行為，正是讓這個選單安全的
  性質。
- **把元件 binding 改成純參照。** 那份快照就是韌體要編進描述子表的東西，不是為了
  重複而重複。要修的是幫它取一個與協定無關的名字，而不是把它拿掉。
- **有 binding 就禁止切換。** 把專案改指向新裝置是完全正當的行為。告訴作者代價，
  但不要替他做決定。
