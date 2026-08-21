# 同一條線上的兩種協定——Modbus 與 UART 命令協定共存的規劃

<p align="center">
  <a href="../protocol-coexistence.md">English</a> · <strong>繁體中文</strong>
</p>

狀態：**只有規劃，沒有改任何程式碼。** 這份文件記錄 Protocol 編輯器目前伸進專案哪些
地方、當第二種協定跟它共用同一條實體線路時會壞在哪裡，以及該用什麼順序動手——內容
都對照過原始碼，不是憑印象。

這份文件接續 [protocol-and-tags.md](./protocol-and-tags.md)。那份問的是「同一套抽象
能不能同時撐住 Modbus、CAN 與 UART 命令協定」，結論是協定應該屬於**裝置（Device）**
而不是屬於專案（該文 §10.4）。本文從那個結論往下走，回答接著出現的四個問題：

1. Protocol 編輯器到底接進 **component** 與 **logic** 的哪些地方，每一條接線的代價
   是什麼？（§1）
2. 兩種協定共用**同一個實體介面**時，有什麼會變？（§2、§3）
3. 手邊沒有 CAN 轉接器的情況下，**Modbus + UART command** 的規劃是什麼，又要怎麼用
   現有的硬體驗證？（§8、§9）
4. 以上這些，在三塊支援的板子——EDT EVK043027B、STM32H747I-DISCO、STM32F746G-DISCO
   ——上分別代表什麼？（§12）

如果只讀兩節，請讀 **§3**（共線強加的規則）與 **§7**（那些規則逼出來的模型）。

另有一份姊妹文件 [uart-command-protocol.md](./uart-command-protocol.md)，從作者那一側
看同一個模型：一個命令在編輯器裡該長什麼樣，以及為什麼 Protocol 分頁必須先長出即時
畫面，這一切才用得動。

## 1. Protocol 編輯器目前伸到哪裡

`src/` 與 `server/` 底下有 24 個非測試檔案提到 Modbus。其中三個只出現在註解，其餘都
真的扛著它。以「要拆有多難」排序：

| 面向 | 位置 | 扛著什麼 |
|---|---|---|
| 專案設定 | `src/types/hmi.ts` | `CommunicationConfig`——串列參數、unit id **與**整張 tag 表擠在同一個物件裡。旁邊還有 `CanBusConfig` |
| 元件 | `src/types/index.ts:639` | **每一個** `LvglComponent` 上都有 `modbusBinding?: ModbusBinding` |
| 元件編輯器 | `ModbusBindingEditor.tsx`（404 行），掛在 `PropertyEditor.tsx:1409` | 十種元件型別都掛得到，而且不管專案選的是哪個協定 |
| tag → binding 同步 | `src/utils/modbusBindings.ts` | `applyTagToBinding` 把六個欄位推到每個綁定的元件上，而且走 undo 堆疊 |
| 複製元件 | `src/store/editorStore.ts:655` | 複製元件時，binding 是按欄位名稱複製的 |
| tag 來源 | `src/hooks/useProjectModbusTags.ts` | 回傳 `config.communication.tags`；`CodePanel`、`Emulator`、`NodeEditDialog` 都吃它 |
| 邏輯節點型別 | `src/components/LogicEditor/types.ts:38` | `tag_read`、`tag_write`，以及更早的 `modbus_holding_register` |
| 邏輯 tag 選單 | `NodeEditDialog.tsx:414` | 依存取權過濾、拒絕非 holding register 與 32-bit 的 tag、對消失的 tag 標 `(missing)` |
| 邏輯產碼 | `src/codegen/templates/ui_logic.c.ts:833`、`:1250` | 把 tag 解析成 `hmi_runtime_read_holding_register(address)` / `write_holding_register` / `write_coil` |
| Binding 產碼 | `src/codegen/hmiBindingGenerator.ts` | 每個**有綁定的元件**一份描述子，再為邏輯要讀的位址額外合成描述子 |
| 韌體 ABI | `firmware/*/include/hmi_runtime.h` | `hmi_binding_descriptor_t` 帶 `area` + `address`；邏輯用的 API 以位址為鍵 |
| 韌體執行期 | `firmware/*/src/hmi_runtime.c` | `static modbus_rtu_async_client_t g_modbus_client`；同一時間只有一筆交易 |

其中兩列是承重牆，而且正好就是問題點名的那兩個。

### 1.1 元件端存的是副本，不是參照

`ModbusBinding` 是一個 `tagId` **加上一整份快照**：area、address、資料型別、存取、
scale、輪詢間隔——而且 `hmiBindingGenerator.ts` 編譯的就是那份快照。
`synchronizeModbusBindings` 在每次編輯 tag 時把副本刷新；tag 被刪掉時只清掉 `tagId`，
快照留著繼續輪詢。

在「一個協定、一台裝置」的世界裡，這個設計說得通。但它有三個性質在兩個協定下失效：

- **快照有固定形狀。** `area` + `address` 沒辦法描述一個用 `GET TEMP` 問、從
  `TEMP=25.4` 裡讀出來的值。
- **快照是掛在元件上的。** 三個元件顯示同一個 tag，就會產生三份描述子、三次往返——
  §8 會說明為什麼這在共線上不只是浪費，而是致命。
- **快照沒有歸屬。** 一旦有兩台裝置，位址 40001 就不是唯一鍵，而描述子裡沒有任何欄位
  說得出它是誰的。

### 1.2 邏輯端在編輯器裡是 tag 形狀，在 C 裡是位址形狀

編輯器這邊本來就做對了：邏輯圖說的是 *MotorSpeed*，不是 *40001*
（[logic-node-taxonomy.md](./logic-node-taxonomy.md) 決策 1）。但產生的程式碼把 tag
丟掉，吐出一個位址：

```c
static uint16_t logic_read_holding_register_cached(uint16_t address);
/* ...寫入則是： */
bool hmi_runtime_write_holding_register(uint16_t address, float value);
```

這就是為什麼 `ui_logic.c.ts` 得拒絕三件它本來不該管的事：不是 holding register 的
tag、32-bit 的 tag，以及——隱含地——任何「位置」不是 `uint16` 的 tag。換成 UART 命令
型 tag，根本沒有位址可以傳；換成兩台裝置，也沒有唯一的位址可以傳。

**執行期 API 以 Modbus 位址為鍵，是邏輯端最大的一道障礙**，同時也是最便宜就能拆掉的
一道（§5）。

## 2. 在這塊硬體上，「同一個實體介面」是什麼意思

問題假設三種協定可能共用一個介面。在這塊硬體上，其中兩種可以、第三種不行——而且這個
不對稱來自硬體，不是政策：

| 板子 | 目前的串列線路 | 板上還有 |
|---|---|---|
| **EDT EVK043027B** | **Type-C 上的 USB CDC**——`hmi_usb_cdc.h`；`hmi_runtime.c` 裡的 `configure_transport` 帶起來的是它，不是 UART | USART2 接 RS-485 收發器，driver-enable 在 PD4——**開機時就初始化好了，只是沒有 client 綁上去**（§12.2）；另有 FDCAN1 與 `CAN_STB` 後面的收發器 |
| **STM32F746G-DISCO** | USART1，PA9/PB7，經 ST-LINK VCP | 沒裝 CAN 收發器 |
| **STM32H747I-DISCO** | USART1，PA9/PA10，經 ST-LINK VCP | 沒裝 CAN 收發器 |

一塊一塊板子看、以及每塊板子驗得了什麼驗不了什麼，在 **§12**。

所以：

- **Modbus RTU 與 UART 命令協定天生就是同居者。** 兩者都是同一個週邊上的位元組串流、
  PC 端同一個 COM port、走 RS-485 時同一對線。分開它們的只有時序。
- **CAN 永遠不會是同居者。** 不同的矽（FDCAN1）、不同的腳位、不同的收發器，而且訊框
  是自己送上門的。共用這件事根本不成立；CAN 就是**第二條連線**。

這把一個籠統的問題縮成一個具體的問題，而這對現在手邊的裝備剛好方便：**共線問題只針對
串列規劃，CAN 等收發器與轉接器到位時，當成額外一條連線加上去就好。**

有一個區別要從頭到尾分清楚：

| | 是什麼 | 由誰決定 |
|---|---|---|
| **邏輯上的共用** | 同一個 MCU 週邊、同一個排程器、同一個 COM port | **這個工具。** 規則見 §3 |
| **電氣上的共用** | 同一段 RS-485 上掛著好幾個聽眾 | 那些裝置。Modbus slave 會看到 ASCII 命令流量並在 CRC 上拒絕它；命令型裝置會看到 Modbus 二進位資料，然後——通常——忽略它。「通常」是關鍵字 |

工具能保證第一種。對第二種，它應該**明講自己不保證**，而不是讓「兩台裝置在同一份清單
裡」暗示它們電氣上相容。

## 3. 共線強加的六條規則

共線問題就這六條。每一條都是編輯器可以表達、韌體可以執行的限制。

**R1——串列參數屬於連線，位址屬於裝置。** 目前 `CommunicationConfig` 把 `baudRate`、
`parity`、`stopBits`、`dataBits` 跟 `unitId`、`tags` 放在同一個物件裡。同一條線上的
兩台裝置必須在框架參數上一致、又不可能在位址上一致，所以這個物件必須拆。這是讓後面
每一步都變成機械工的那一個改動。

**R2——每條連線同時只有一筆交易在飛。** 目前已經是這樣：`hmi_runtime_task` 只跑一個
`g_transaction`，重試它，然後最多再開一筆。維持它。等協定混在一起，它就不再只是簡化，
而是 R4 的正確性論證。

**R3——交易之間的間隔取所有參與者的最大值。** Modbus RTU 用 3.5 個字元時間的靜默切
訊框；命令型裝置可能需要數十毫秒才肯接下一行。連線取大的那個數字——也就是說，加入一台
慢裝置會拖慢整條線，而且拖得看得見，所以值得顯示出來（§8）。

**R4——每一個收到的位元組都必須歸得了屬。** 在「同時只有一筆請求」的前提下，它歸得了：
位元組屬於發問的那一位。除此之外沒有便宜的規則。任何允許一條線上有兩筆請求同時在飛的
設計，都得在傳輸層重新引入定址，而這兩種協定都沒有提供。

**R5——會主動推播的裝置不能跟請求／回應型裝置共用連線。** 一台會自己吐 `TEMP=25.4`
的裝置，遲早會把它吐在別人的回應窗口裡，R4 隨即瓦解。這條規則編輯器應該直接強制：
來源是被動接收型的裝置，必須獨佔一條連線。（CAN 完全是接收驅動的，本來就在自己的連線
上。）

**R6——半雙工要付出換向與回音的代價。** 在 RS-485 上，driver-enable 時序與回音抑制是
連線層級的屬性；而一台會把收到的東西原樣送回來的裝置，會讓回音變成每個回覆解析器最先
看到的東西。

再加一條「非規則」，因為一定會有人問：**沒有「交錯（interleave）」這種有用的模式。**
把一行命令塞進 Modbus 交易中間不會換來效能，只會換來一個歸不了屬的回覆，以及一台剛
看過畸形訊框的 slave。

## 4. 元件端該變成什麼樣子

建議只有一句：**binding 不再是 tag 的副本，而是對 tag 的參照，加上真正屬於元件自己的
呈現欄位。**

| 欄位 | 目前在 `ModbusBinding` 上 | 應該屬於 |
|---|---|---|
| `enabled` | ✔ | binding |
| `tagId` | 選填 | binding，而且**必填** |
| `property` | ✔ | binding——元件的*哪一個*屬性反映這個值 |
| `writeBehavior`、`writeValue` | ✔ | binding——按下去代表什麼意思 |
| `area`、`address` | ✔（快照） | **tag 的 source** |
| `dataType`、`access`、`scale`、`pollIntervalMs` | ✔（快照） | **tag 本身** |

```ts
// 名字與形狀都中性；這裡沒有任何東西知道 tag 背後是哪條匯流排。
interface TagBinding {
  enabled: boolean;
  tagId: string;
  property: WidgetProperty;
  writeBehavior: WriteBehavior;
  writeValue: number;
}
```

由此掉出四件事，而且四件都是想要的：

1. **產生出來的模型從一張表變成兩張表。** 一張 tag 表——要問誰、問什麼、多久問一次；
   一張 binding 表——哪個元件反映哪個 tag。今天單一的描述子陣列把兩者混在一起，這正是
   三個元件綁同一個 tag 要付三次往返的原因。
2. **合併（coalescing）變成免費的。** 被輪詢的是 tag 表，而一個 tag 在裡面只出現一次。
   在一次 ASCII 往返要 47 ms 的線上（§8），這不是最佳化。
3. **被刪掉的 tag 再也遮不住。** 沒有快照可以退守，`tagId` 不見的 binding 就必須被
   報出來——這就是 [protocol-and-tags.md](./protocol-and-tags.md) §1 要的那個 **LACK**
   徽章，而且是被結構逼出來的，不是靠自律。
4. **`synchronizeModbusBindings` 消失。** 沒有東西要推了；元件在產碼時直接讀 tag。
   等於每次編輯 tag 都少掉 112 行的 undo 堆疊流量。

代價是一次遷移，而這個 repo 已經有現成的模式（`pages`、`targetPage`、巢狀動畫）：舊檔
讀 `component.modbusBinding`，之後寫 `component.binding`；遇到只帶位址、沒有 tag 的
舊 binding，就用那份快照**建立**一個 tag。什麼都不會掉，也不用重打。

編輯器端的一個後果：屬性面板的綁定區塊變成**一個 tag 選單加四個欄位**，而那個選單是
唯一需要知道「裝置」存在的地方——它依裝置分組，並用該裝置自己的方言顯示位址。
`ModbusBindingEditor.tsx` 大概會少掉一半的面積。

## 5. 邏輯端該變成什麼樣子

只有一個改動，而且很小：**執行期 API 改成以 tag 為鍵。**

| | 目前 | 建議 |
|---|---|---|
| 讀 | `logic_read_holding_register_cached(1U)` | `hmi_tag_read(HMI_TAG_MOTOR_SPEED, &value)` |
| 寫 | `hmi_runtime_write_holding_register(2U, v)` / `..._write_coil` | `hmi_tag_write(HMI_TAG_SETPOINT, v)` |
| 鍵 | 一個 `uint16` Modbus 位址 | 產生的 tag 表的索引 |
| 宣告在 | `hmi_runtime.h`，固定 | `hmi_bindings_generated.h`，就在 tag 表旁邊的一個 enum |

tag id 本來就已經是編輯器的鍵——`node.params.tagId`——所以這是改「產碼器*吐*什麼」，
不是改「邏輯圖*存*什麼」。既有的邏輯圖完全不用動。

它立刻換到的東西，而且在只有一個協定的現在就換得到：

- **目前三個拒絕全部消失。** `ui_logic.c.ts` 拒絕非 holding register 的 tag、拒絕
  32-bit 的 tag，寫入時還要在 coil 與 register 之間分岔。這三件事的存在，全都只是因為
  API 的鍵是 Modbus 位址；tag 索引背後帶著資料型別，一個都不需要。
- **合成出來的描述子不見了。** `collectLogicHoldingRegisterAddresses` 存在的理由，是
  確保邏輯要讀的位址有人在輪詢。有了 tag 表，被邏輯圖引用的 tag 就只是一個「有被用到的
  tag」。
- **它撐得住兩台裝置。** 索引是唯一的；40001 不是。
- **它撐得住 UART tag**，因為那種 tag 根本沒有數字位址可傳。

這一端還有兩個比較小的決定：

- **`modbus_holding_register` 變成 legacy。** 它是唯一在名字裡點名協定的節點，而且吃
  原始位址。永遠讓它讀得進來——`normalizeLogicGraphs` 本來就會在載入時重新推導節點
  分類，先例已經在——等 tag 節點涵蓋 32-bit 讀取之後就把它從面板拿掉；在還有意義的
  期間，把它解讀成「裝置 1 的 holding register N」。
- **寫入永遠是「已排入佇列」，不是「已確認」。** `hmi_runtime_task` 目前就讓寫入優先
  於背景讀取，甚至會取消進行中的讀取來服務它。在共線上，這個優先權現在還要跟第二種
  協定的間隔需求競爭，所以對邏輯圖誠實的契約是：*寫入已排入佇列*；至於確認，能給的
  匯流排就給，並且當成 per-tag 的品質旗標
  （[protocol-and-tags.md](./protocol-and-tags.md) §10.2）。一張每個 tick 都寫的邏輯
  圖，在共線上是會把輪詢餓死的——而 §8 的連線預算就是讓這件事看得見的地方。

## 6. Protocol 編輯器會變成什麼

`ProtocolPanel.tsx` 有 1104 行，最上層一個
`protocol === 'modbus-rtu' ? ... : ...`，底下兩張內嵌的 tag 表。它該長成的形狀：

| 區塊 | 要依協定分岔嗎？ | 說明 |
|---|---|---|
| **連線（Links）** | **要**——而且是正當的 | 串列參數，或 CAN 位元時序。把它們合成一個「connection」型別的話，不管選哪個協定都有三分之二是無關欄位 |
| 連線底下的**裝置（Devices）** | **部分要** | 名稱、協定、啟用，加上該協定自己的站台欄位：Modbus 的 unit id；UART 的命令樣板、框架、檢查碼與命令間隔 |
| **Tags** | **不要** | 整個專案一張表，加一個「裝置」欄。只有*位址*那一格會隨裝置的協定換形狀——一個 area 下拉加一個數字，或者一個參數名稱 |
| **預算** | 不要 | 每條連線一份：它的 tag 隱含的循環時間，對上它們要求的輪詢間隔（§8） |

分辨這三者的規則：**真的不同就分岔，只是看起來不同就統一。** 連線真的不同。值不是。
今天 tag 表被分岔了，而它不該被分岔。

兩個實務上的註記。這個面板早就超過「兩張表該各自獨立成元件」的大小，而拆開它是走向
主從式版面的前置作業，不只是整理。另外，到那時候「Protocol」這個分頁名字，指的是一個
在專案層級已經不存在的欄位：它會變成 **Connections**——也就是
[protocol-and-tags.md](./protocol-and-tags.md) §10.3 裡每一家廠商對它的稱呼。

## 7. 模型：連線 → 裝置 → Tag

[protocol-and-tags.md](./protocol-and-tags.md) §10.4 提議把 `protocol` 從專案移到
**裝置**上。共線在它上面再加一層，因為兩台裝置可以共用一條線，於是必須共用那條線的
設定：

```ts
interface Link {
  id: string;
  name: string;                    // "COM port"、"RS-485"、"CAN 1"
  kind: 'serial' | 'can';
  transport: 'usb-cdc' | 'uart';   // 只有 serial 用得到；EDT 板現在是 usb-cdc
  serial?: {
    baudRate: number; parity: 'none' | 'even' | 'odd';
    dataBits: 8; stopBits: 1 | 2;
    /** R3：連線取線上任一裝置所需的最大間隔。 */
    minGapMs: number;
    /** R6。 */
    halfDuplex: boolean; suppressEcho: boolean;
  };
  can?: { bitrate: number; fd: boolean; dataBitrate: number; samplePointPercent: number; mode: CanBusMode };
}

interface Device {
  id: string;
  name: string;                    // "PLC 1"、"秤重頭"
  linkId: string;
  protocol: ProtocolId;            // 'modbus-rtu' | 'uart-command' | 'can-bus'
  station: DeviceStation;          // 該協定自己的 per-device 設定
  timeoutMs: number; retries: number;
  enabled: boolean;
}

type DeviceStation =
  | { kind: 'modbus-rtu'; unitId: number }
  | { kind: 'uart-command';
      readTemplate: string;        // "GET {address}"
      writeTemplate: string;       // "SET {address} {value}"
      terminator: 'crlf' | 'cr' | 'lf' | 'etx' | 'idle';
      checksum: 'none' | 'xor' | 'sum' | 'crc16';
      interCommandGapMs: number; }
  | { kind: 'can-bus'; defaultFrameFormat: CanFrameFormat };

interface Tag {
  id: string;
  name: string;
  deviceId: string | null;         // null = 內部 tag，背後沒有線
  value: { dataType: TagDataType; access: BusAccess; scale: number; offset: number; unit?: string };
  source: TagSource;               // 值在哪裡，依協定而定
}
```

這個形狀有三個性質值得講明，因為它們正是讓遷移變便宜的原因：

- **今天的專案在每一層都是「只有一個元素的清單」。** 一條連線（CDC port）、一台裝置
  （unit id 1），以及補上 `deviceId` 的 `communication.tags`。遷移是包一層，不是重寫；
  而且只要上限維持在 1，UI 可以完全不動。
- **`project.protocol` 變成推導出來的**——`devices[0].protocol`——然後就不再存在。
  所有「切換會擱置什麼」的問題會跟著它一起消失，因為裝置的 tag 是跟著裝置走的。
- **`deviceId: null` 是驗證整套抽象最便宜的方式。** 一個背後沒有線的內部 tag，可以在
  *還沒實作第二個協定*的情況下證明中性層真的中性，也讓預覽有東西可以模擬
  （[protocol-and-tags.md](./protocol-and-tags.md) §10.7）。值得最先做，正因為它不需要
  任何硬體。

韌體那邊是每層一個陣列：連線，各自帶一個傳輸與一個排程器；裝置，各自帶一個驅動與一個
站台；tag，各自指名一台裝置。`hmi_runtime.c` 本來就已經是中間那層——輪詢游標、重試
計數、寫入佇列與元件更新全都與協定無關。屬於 Modbus 的只有 `g_modbus_client` 以及它
裡面的編解碼。

## 8. 一個算得出來的例子

一條連線、兩種協定——這正是要規劃的那個情況：

| | 裝置 A | 裝置 B |
|---|---|---|
| 名稱 | `PLC` | `Scale` |
| 協定 | Modbus RTU，unit 1 | UART command |
| 站台設定 | — | `GET {address}` / `SET {address} {value}`、CRLF、20 ms 間隔 |
| Tags | `MotorSpeed` 40001 uint16、`Pressure` 40002 uint16、`Running` coil 1 | `Weight`——位址 `WT`；`Tare`——位址 `TARE`，唯寫 |

在 **9600 8N1** 下，一個字元是 10 個位元，約 1.04 ms：

| 往返 | 位元組 | 時間 |
|---|---|---|
| Modbus 讀 2 個 register | 出去 8、回來 9，兩側各再加 3.5 個字元的靜默 | 約 **25 ms** |
| `GET WT` → `WT=12.345` | 出去 8、回來 11，再加 20 ms 間隔與裝置自己的思考時間 | 約 **47 ms** |

一輪刷新三個 Modbus tag 加一個 UART tag，成本是 `3 × 25 + 47 ≈ 122 ms`。四個 tag 都
要求 250 ms 輪詢很輕鬆——大約用掉連線的 49 %。要求 100 ms 則在算術上不可能，而今天的
工具對此隻字未提。

算術逼出兩個結論，兩個在 UI 上都看不到：

- **連線預算應該進編輯器。** 每條連線一份：tag 隱含的循環時間，對上它們要求的間隔。
  每一家廠商的產品都有某種形式的這個東西；在這裡，當一次 47 ms 的往返坐在一次 25 ms
  的往返旁邊時，它就變成必要的。
- **每個元件一份描述子的做法活不下去。** 三個元件顯示 `Weight`，會替那一輪加上 94 ms
  ——多 77 %，卻沒有多任何資訊。§4 的兩張表模型就是用來擋這件事的，而這個數字就是把它
  從「偏好」變成「要求」的理由。

## 9. 用手邊現有的硬體驗證

這整套都不需要 CAN 轉接器，因為有意思的情況是兩個*串列*協定。需要的是 COM port 另一端
有一台兩種都回答的裝置——而那是對一個已經存在的工具做修改。

`tools/modbus-rtu-test-server.ps1`（621 行）已經是一個帶即時儀表板的 Modbus RTU slave。
擴充之後，它握著 COM port，對每一段收到的資料做分派：

| 收到的東西 | 走哪條路 |
|---|---|
| 可列印 ASCII、以 CRLF 結尾 | 命令型裝置：比對樣板，回 `WT=12.345` 或 `OK` |
| 能解析成 ADU、CRC-16 正確、unit id 認得 | 既有的 Modbus 路徑 |
| 其他 | 當成雜訊計數，並顯示在儀表板上 |

順序有差：**先**試那條「整行」規則。一行可列印文字幾乎不可能 CRC 剛好正確，但 Modbus
訊框裡可以出現可列印位元組；而後者這個方向的誤判是無聲的，前者則會吵得很明顯。

這套裝置用一條 USB 線就重現了 §3 的全部：R2 與 R4 由「韌體一旦允許兩筆在飛，就分不出
回覆是誰的」來檢驗；R3 由間隔來檢驗；R5 則是在模擬器裡加一行主動推播，看它會弄壞什麼。

兩個關於替代路線的註記：

- **RS-485 這條路比看起來近。** USART2 開機時就已經透過 `HAL_RS485Ex_Init` 帶起來了，
  連 PD4 的 DE 都在——它缺的是一個綁上去的 client，不是硬體帶起來的工作（§12.2，
  那一節同時訂正本文較早的草稿與 [edt-evk043027b.md](./edt-evk043027b.md) §5）。
  它仍然不是*第一*步，因為它需要 §7 的 per-link 驅動介面先存在；但它是那個介面在真實
  線路上第一個能驗證的東西。
- **內部 tag 連裝置都不用**（§7）。它是最該先做的東西，也是這份規劃裡唯一在什麼都沒插
  的情況下就能驗證的部分。

## 10. 分階段的路線

每一階段都能各自出貨、各自有用。「需要硬體嗎」那一欄才是重點：只有最後一階段被手邊沒有
的東西擋住。

| 階段 | 改什麼 | 換到什麼 | 需要硬體嗎？ |
|---|---|---|---|
| **0** | Modbus tag 加 `offset`；統一 `TagDataType`；綁定編輯器依專案協定開關；切換協定前先講會擱置什麼 | 修好目前這一個協定身上本來就不對的地方 | 不用 |
| **1** | 引入 `Link` 與 `Device`，**各自上限 1**。串列參數移到連線、`unitId` 移到裝置、每個 tag 加 `deviceId`。`project.protocol` 變成推導 | 關鍵的那次改名。上限還在 1 時，UI 完全不用動 | 不用 |
| **2** | binding 變成 tag 參照（§4）；邏輯 API 改成以 tag 為鍵（§5）；產生的模型拆成 tag 表與 binding 表 | 合併、LACK 徽章，以及邏輯那三個拒絕全部消失——都在只有一個協定的情況下 | 不用 |
| **3** | 內部 tag（`deviceId: null`）；預覽會模擬它們 | 證明抽象真的與協定無關；讓邏輯圖在什麼都沒接的情況下可測 | 不用 |
| **4** | 把複製了三份的韌體收斂：一份 `hmi_runtime.c`、一份 Modbus client，放在一個五個函式的傳輸介面後面，板子各自只留薄薄一層（§12.4） | 之後每一次韌體改動都只寫一次，不是三次 | 不用 |
| **5** | `uart-command` 成為同一條連線上的第二台裝置。韌體裡的 per-link 排程器與驅動介面。編輯器裡 per-transport 的連線預算（§12.3） | **Modbus 與命令型裝置共用一條線**——真正的目標 | 只需要 §9 的 PC 端模擬器 |
| **6** | RS-485 成為 EDT 板上的第二條連線（§12.2）；接著 CAN 成為第三條 | 兩條連線、R6，最後是第三種協定回到它該在的位置 | RS-485：不需要新東西。CAN：要打開收發器與一個轉接器 |

0–4 階段不管第二個協定會不會出貨都值得做：每一階段都修掉一件今天就不對的事。階段 1 是
有時效的那一個——現在做是機械工，晚做就變成三向分岔。階段 4 對韌體有同樣的性質：今天做
只是機械性的去重複，等到有人在裡面設計驅動介面時，它就變成三向合併衝突。

## 11. 現在該決定什麼，什麼先別決定

**現在就決定：**

- **連線是裝置之上的一層。** 兩個協定共用一條線，就得共用它的設定與排程器；光靠裝置這
  一層表達不出來。
- **元件的 binding 是參照，不是副本**（§4）。這是讓合併成為可能的決定，而在一次往返
  47 ms 的線上，合併不是可選項。
- **邏輯執行期 API 以 tag 為鍵，不是以位址為鍵**（§5）。改動小、今天就划算，等兩台裝置
  出現之後就很難便宜地補回來。
- **R2 與 R5**（§3）：每條連線同時只有一筆交易；主動推播的裝置不與人共線。兩者都是編輯
  器講得出、韌體守得住的限制；而且都不是「先繞過、以後再補」補得回來的。
- **板子宣告的是連線，不是協定**（§12.6）。這跟階段 1 是同一次改名，在每塊板子都只有
  一條連線的期間不多花任何成本，而且它是讓「換目標板」變成可檢查、而不是悄悄出錯的
  關鍵。
- **先把韌體核心抽出來，再在裡面設計驅動介面**（§12.4）。三份 826 行，今天是去重複，
  晚一點就是合併衝突。

**先別決定：**

- UART 的定位（locator）詞彙——回覆解析規則應該對著一台真實存在的裝置寫，不是對著想像
  的裝置寫（[protocol-and-tags.md](./protocol-and-tags.md) §8.8）。
- 一條連線可以掛幾台裝置。有意思的數字是 2；上面的模型並不在乎，等專案真的需要時再把
  上限拉開。
- 未來的驅動要用結構化欄位還是方言字串來寫位址。先走結構化，留 `raw` 變體當出口
  （該文 §10.6）。

**不要做：**

- **不要在同一條連線上交錯交易。** 沒有便宜的辦法把回覆歸屬回去（R4）。
- **在裝置這一層還不存在時，不要在 tag 上加協定判別欄位。** 那是把 per-device 的事情
  寫成 per-tag，正是 §4 的改名要避開的那個分岔。
- **不要讓編輯器暗示電氣相容。** 兩台裝置在同一份清單裡，代表韌體不會自己講話講到重疊；
  不代表這兩台裝置能忍受彼此在同一段 RS-485 上的流量（§2）。
- **不要把連線層跨協定合併。** 串列參數、CAN 位元時序與 UART 框架彼此毫無共通之處，
  把它們聯集起來，不管選哪個協定都有三分之二是雜訊。
- **不要用同一份連線預算算所有板子。** 「字元數乘以 1/baud」在 Discovery 板上是對的，
  在 EDT 板的 CDC 連線上幾乎沒有意義（§12.3）。
- **不要把協定排程器放到 H747 的 Cortex-M4 上**（§12.5）。瓶頸是 122 ms 的等待，不是
  CPU，而且 USART1 就住在那顆核心擁有的 domain 裡。

## 12. 三塊板子，一塊一塊看

上面所有內容都是對著工具寫的。而工具要編給三塊板子，這三塊板子能提供的線並不一樣。
以下都對照過 `firmware/`，其中有一項——§12.2——是一則**訂正**，而且已經一併帶回
[edt-evk043027b.md](./edt-evk043027b.md) §5 了。

### 12.1 每塊板子實際上載得動什麼

| 板子 | 連線 1——今天在跑 Modbus 的 | 連線 2——有裝的 | 連線 3 | 在 §7 模型下的上限 |
|---|---|---|---|---|
| **EDT EVK043027B** | Type-C 上的 USB CDC（`hmi_usb_cdc.c`），綁在 `g_modbus_client` 上 | **USART2 / RS-485**，PD5 TX、PD6 RX、DE 在 PD4——*開機時就已經帶起來了*，見 §12.2 | FDCAN1 在 `CAN_STB` 後面（PB5，`main.h:48`）；`HAL_FDCAN_MODULE_ENABLED` **是被註解掉的**（`stm32u5xx_hal_conf.h:58`） | **2 條串列連線 + 1 條 CAN。** 唯一撐得住完整模型的板子 |
| **STM32F746G-DISCO** | USART1，PA9 TX / PB7 RX，經 CN14 上的 ST-LINK VCP | — | 沒裝 CAN 收發器 | **1 條串列連線** |
| **STM32H747I-DISCO** | USART1，PA9 TX / PA10 RX，經 ST-LINK VCP | — | 沒裝 CAN 收發器 | **1 條串列連線** |

這個不對稱只在一個方向上有意義：**§3 的共線問題在三塊板子上完全一樣**，因為那是共用
*一條*連線的問題。EDT 板多出來的是能驗證**上面那一層**的能力——兩條連線，以及一個
R5 不准跟人共線的裝置該去哪裡。

### 12.2 一則訂正：EDT 板的第二條連線其實已經起來了

上面 §9 的早期草稿，以及 [edt-evk043027b.md](./edt-evk043027b.md) §5，都說過 RS-485
這條路沒有任何程式在驅動、`HAL_RS485Ex_Init` 從來沒被呼叫過。**程式碼不是這樣寫的**，
而兩處都已經改過來了；這一節是它的來由紀錄。
`board_init` 會呼叫 `board_uart1_apply(115200, none, 1)`（`board.c:293`），它用
DE 高準位極性與 0 的建立／釋放時間跑 `HAL_RS485Ex_Init`（`board.c:227`），並把 FIFO
關掉好讓訊框間隔量得準；`stm32u5xx_it.c:57` 也把 `USART2_IRQHandler` 接到
`HAL_UART_IRQHandler(&huart1)`。

真正缺的是**沒有 client 綁在它上面**。`g_modbus_client` 的傳輸是 CDC 的環形緩衝，
韌體裡沒有別的東西讀寫 `huart1`。所以這塊板子從「一條連線」到「兩條連線」的距離，
不是硬體帶起來的工作，而正好就是 §7 那個 per-link 驅動介面。這讓 RS-485 從「本身就
是一件韌體工作」變成*這個連線模型在真實線路上最便宜的一次驗證*。

有個細節值得記著，因為它就是 R1 的縮影：USART2 是用 **115200** 初始化的，而 Protocol
分頁上的 baud rate 餵的是 *CDC* 那條連線的訊框間靜默。兩條連線、兩組框架設定，加上
一個哪一條都不屬於的專案層級欄位。R1 要的那次拆分，在這塊板子上早就該做了。

### 12.3 連線預算換一塊板子就不成立了

§8 的算式——9600 8N1、一個字元 1.04 ms、一次 Modbus 往返約 25 ms、一次 `GET WT` 往返
約 47 ms——是一份 **UART** 的預算。它在兩塊 Discovery 板上是字面上成立的。但同一個
專案跑在 EDT 板上是走 USB CDC，baud rate 對線上的實際傳輸完全沒有影響：位元組是以
USB transfer 的形式過去的，設定的 baud 只剩下一個用途，就是拿來推導 RTU 的訊框間靜默
（[edt-evk043027b.md](./edt-evk043027b.md) §5）。

由此得到三個結論，而且三個都落在編輯器身上，不是韌體：

- **CDC 連線的週期時間由 USB 框架排程、主機與裝置自己的思考時間決定**，不是由字元數
  決定。R3 要的間隔仍然是真的——那是*裝置*的需求，不是線的需求——但傳輸那一項幾乎
  消失了。
- **§6 的預算是 per link 而且 per transport 的。** 把字元數乘上 1/baud，在 Discovery
  板上是對的，在 EDT 的 CDC 連線上幾乎沒有意義。板子在編輯期就是已知的，所以這件事
  算得出來，不必用猜的。
- **換目標板可能悄悄弄壞一份預算。** 一個在 EDT/CDC 上用 100 ms 間隔做出來的專案，
  搬到 9600 的 UART 上在算術上就是做不到。編輯器可以在換板子的那一刻就講出來——而
  那也是唯一有人會想到要看的時刻。

### 12.4 韌體被複製了三份，而接縫早就以 diff 的形式寫好了

| 檔案 | F746G 對 H747I | 對 EDT |
|---|---|---|
| `hmi_runtime.c`（826 / 826 / 820 行） | **逐位元組相同** | 差 58 行，全部是傳輸相關 |
| `modbus_rtu_client.c` | **逐位元組相同** | **逐位元組相同** |
| `modbus_rtu_async_client.c`（529 行） | **逐位元組相同** | 差 134 行 |

那 134 行不是散落各處的。它們就是：位元組怎麼進來（`HAL_UART_Receive_IT` 加
`HAL_UART_RxCpltCallback`，對上由 `modbus_rtu_async_poll` 抽乾的 CDC 環形緩衝）、
訊框怎麼送出去、殘留的接收資料怎麼清掉（`__HAL_UART_FLUSH_DRREGISTER` 對上
`hmi_usb_cdc_flush_rx`），以及 baud rate 從哪裡來（`client->uart->Init.BaudRate`
對上 `client->baud_rate`）。EDT 那份檔案自己在開頭的註解裡就是這麼說的。

兩個結論：

1. **這份規劃要求的每一項韌體改動都會落地三次。** 以 tag 為鍵的 API（§5）、per-link
   排程器與驅動介面（§7），只要共用核心沒有先抽出來，就得一塊板子寫一次、審一次、
   除錯一次。這就是為什麼「收斂重複」應該**自成一個階段**，而不是趁著加協定的時候
   順手做——三向合併衝突不是設計介面的好地方。
2. **要抽到的那個介面已經存在了**，就存在於兩份原本相同的檔案之間的差異裡。五個操作，
   不多不少：

```c
/* 只是命名，不是要定案的 API。重點是這道接縫有多小。 */
typedef struct {
    bool     (*open)(void *ctx, const hmi_link_config_t *config);
    size_t   (*write)(void *ctx, const uint8_t *data, size_t len);
    size_t   (*read)(void *ctx, uint8_t *out, size_t max);
    void     (*flush_rx)(void *ctx);
    /* UART 上是 10000000 / baud；CDC 上約等於 0。這一個函式就是 §12.3。 */
    uint32_t (*char_time_us)(void *ctx);
} hmi_transport_vtable_t;
```

驅動的接縫——Modbus 對上命令協定——是這一層*之上*的事。先把傳輸接縫做對，才會讓
「一條連線上兩台裝置」與「一塊板子上第二條連線」變成同一套機制，而不是兩套。

### 12.5 H747 的第二顆核心不是第二條連線

一定會有人提，所以在這裡先拒絕掉。以這塊板子目前的樣子，把協定排程器丟到 Cortex-M4
上是錯的：

- **這個映像檔只有 Cortex-M7**（`CORE_CM7`，`CMakeLists.txt:56`），而 M4 的開機在
  option bytes 就被關掉了（`BCM4 = 0`），這是文件裡建議的設定
  （[stm32h747i-disco-dual-core.md](./stm32h747i-disco-dual-core.md)）。
- **USART1 住在 D2 domain——也就是 M4 的 domain。** `board_init` 已經在等
  `RCC_FLAG_D2CKRDY`，而且在它一直沒起來時強制打開那個 domain，好讓 HMI 至少能在沒有
  Modbus 的情況下繼續跑，而不是卡死（`board.c:49`）。一條連線的週邊本來就位在應用程式
  不擁有的 domain 裡，這已經是這塊板子最微妙的地方；再給它第二個擁有者，等於在最不需要
  IPC 與共享記憶體協定的板子上，多加一套 IPC 與共享記憶體協定。
- **這裡沒有任何東西是 CPU-bound 的。** §8 那個週期裡有 122 ms 是在*等*。多一顆核心
  買不到任何 R2 的單交易狀態機還沒給的東西。

這塊板子上的雙核心是顯示與吞吐的題目，不是協定的題目。把它排除在這份規劃之外。

### 12.6 板子的能力是一份連線清單，不是一份協定清單

`BoardDefinition.protocols: readonly ProtocolId[]`（`src/types/hmi.ts:109`）在只有
一條連線時完全正確，但在 §7 之下就少了一層。今天兩塊 Discovery 板宣告
`['modbus-rtu']`、EDT 宣告 `['modbus-rtu', 'can-bus']`——但這幾塊板子之間真正的差別
是：一塊有三個埠，另外兩塊只有一個。跟階段 1 同一次改名就能修好：

```ts
interface BoardLink {
  id: string;                       // 'cdc' | 'rs485' | 'fdcan1' | 'vcp'
  name: string;                     // 「Type-C 虛擬 COM port」
  kind: 'serial' | 'can';
  transport: 'usb-cdc' | 'uart';
  /** 掛在這條連線上的裝置可以講什麼。 */
  protocols: readonly ProtocolId[];
  status: 'ready' | 'fitted-unbound' | 'absent-transceiver';
  note?: string;                    // 一句話說明原因，給 UI 顯示
}
```

在還有東西讀 `BoardDefinition.protocols` 的期間，讓它變成上面這些的聯集就好。這在
編輯器裡換到什麼：

- **連線是從板子上挑的，不是打字打出來的。** §6 的「連線」區塊不再是自由填寫，專案
  也就不可能要求一條板子根本沒有的線。
- **`status` 就是那些硬體實話該放的地方。** EDT 的 RS-485 那一列寫 `fitted-unbound`
  並指向 §12.2；FDCAN 那一列寫收發器有裝但 HAL 模組沒編進去；Discovery 板則根本沒有
  CAN 那一列。這跟 §2 要求對電氣相容性講實話是同一件事，只是放在使用者真的會看的地方。
- **換目標板變成可檢查的操作。** 每一台裝置的連線都必須對應到新板子上真的有的連線。
  今天把一個雙裝置專案從 EDT 板搬到 Discovery 板，會編得很順利，然後對著一條線講話。

### 12.7 哪塊板子驗得了哪條規則

| 規則（§3） | 在哪驗得了 | 用什麼驗 |
|---|---|---|
| **R1** 連線擁有框架設定 | 三塊都行 | §9 的雙協定模擬器。韌體不用改 |
| **R2** 同時只有一筆交易 | 三塊都行 | 本來就是這樣；回歸測試是讓模擬器慢慢回 |
| **R3** 間隔取最大值 | 三塊都行 | 模擬器的 20 ms 間隔——不過它的代價會隨傳輸而不同（§12.3） |
| **R4** 每個位元組都歸得了屬 | 三塊都行 | 插一行主動推播進去，看下一個回覆怎麼解析錯 |
| **R5** 推播型裝置不共線 | 三塊都行 | 同一套裝置。這條規則正是那套裝置存在的理由 |
| **R6** 半雙工、換向、回音 | **只有 EDT** | USART2 加上第二個 RS-485 節點。DE 已經由硬體處理（`board.c:227`） |
| CAN 作為第二條連線 | **只有 EDT** | 驅動 `CAN_STB`、把 `HAL_FDCAN_MODULE_ENABLED` 取消註解，再加一個 USB-CAN 轉接器 |

由此也給了動手順序一個關於工作檯的建議：

**共線這部分在 STM32F746G-DISCO 上開發。** 它是單純的 UART，§8 的算式在它上面字面上
成立，預算拿碼錶就看得懂。**再移植到 EDT 板上驗證傳輸接縫**（§12.4）——如果同一個專案
走 CDC 也能跑，而唯一不同的只有 `char_time_us`，那接縫就是對的。**最後才動 RS-485**
（§12.2），它是這三塊板子上第一個能同時操到 R6 與雙連線模型的東西。EDT 板是目的地，
Discovery 板是工作檯。
