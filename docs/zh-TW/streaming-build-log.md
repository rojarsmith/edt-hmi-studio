# 建置 log 的串流

<p align="center">
  <a href="../streaming-build-log.md">English</a> · <strong>繁體中文</strong>
</p>

一次韌體建置要好幾分鐘，而在此之前它在結束之前什麼都不顯示。這份文件記錄是什麼在緩衝、
換成了什麼，以及輸出因此有哪些看得見的改變。內容都對照過原始碼，不是憑印象。

## 1. 四層緩衝，一層疊一層

舊行為沒有一處是意外——每一層都各自在等下面那一層跑完：

| 層 | 位置 | 它做了什麼 |
|---|---|---|
| 子行程 | `server/hmi/command.ts` | `execFile` 的 callback 形式把 stdout 與 stderr 緩衝在記憶體裡（`maxBuffer: 16 MB`），**只有行程結束才 resolve** |
| 服務 | `server/hmi/service.ts` | `log.push(...commandLog(result))`——上面沒回來就沒東西可 push |
| 傳輸 | `vite-plugin-hmi.ts` | 一個 POST，`await service.buildProject(...)`，然後一次 JSON 回應 |
| 前端 | `src/store/deployStore.ts` | `await buildHmiProject()`，然後一次 `append(result.log)` |

最底下那層是根因：用 `execFile` 的話，伺服器自己在行程結束前連一行都不知道，所以上面
三層再怎麼改都沒用。

## 2. 換成了什麼

**`runExecutable` 多了一個 `onLine` 選項**（`server/hmi/command.ts`）。傳它就切到
`spawn`，每收到一整行就回報一次；不傳就維持原本的 `execFile` 路徑，完全不動。只有建置
會傳——那些短命令（列舉埠、探針檢查、燒錄）留在原本那條沒有「半行」簿記可以搞砸的路上。

串流路徑仍然會 resolve 出完整的 `stdout` / `stderr` / `exitCode`，所以**串流對呼叫者是
零成本的**：可以邊看，最後還是拿得到完整輸出。兩個要緊的細節：

- **chunk 的邊界不是行的邊界。** 被切在兩個 `data` 事件之間的一行會先扣住，等到換行字元
  才回報，所以它只會被報一次、而且是完整的。結尾那行永遠等不到換行的，會在結束時 flush。
- **`spawn` 沒有 `execFile` 那種 `timeout` 選項**，所以時間預算改由一個計時器執行：它會
  砍掉子行程，並且仍然帶著「已經講出來的那些」resolve。逾時的建置依然查得下去。

**一個 log 通道**（`server/hmi/buildLog.ts`）坐在建置與觀看者之間：行進去、訂閱者出來，
以一個 **run id** 為鍵。它會先重播再跟進，所以晚到的訂閱者——或斷線後重連的——看到的是
整場建置，不是尾巴。通道在建置結束後保留五分鐘再丟掉。

**SSE** 把它送到瀏覽器：`GET /api/hmi/build-log/:runId`，可以用 `?from=N` 續傳。每 15 秒
一次心跳，避免中間層把一個只是在等編譯器的連線給關掉。

## 3. run id，以及為什麼 POST 不必改

顯而易見的做法——讓 `POST /api/hmi/build` 立刻回一個 build id、建置丟到背景跑——會把這個
端點整個契約改掉：它的錯誤處理、它的結果，以及圍著它的每一個測試。

但那不必要。**run id 是前端在 POST 之前自己生的**，所以它可以在建置還沒吐出任何東西之前
就先訂閱。POST 完全維持原樣，一樣跑到完成、一樣回傳整份 log。即時輸出是純粹加上去的，
而這也讓退場機制變得很簡單：

```ts
// deployStore.runBuild
const runId = newRunId();
let streamed = 0;
const stopStreaming = subscribeBuildLog(runId, (line) => { streamed += 1; append(line); });
try { result = await buildHmiProject(projectFile, runId); }
finally { stopStreaming(); }
// 串流與回應帶的是同一串序列，所以從真的有到的那一邊取，不要兩邊都取。
if (streamed === 0) append(result.log);
```

如果 SSE 不可用、或瀏覽器沒有 `EventSource`、或串流根本沒接上，建置的行為就跟改動之前
一模一樣。它不會退化成壞掉，只會退化成慢。

**一個 sink，一串序列。** `buildProject` 裡每一個 `log.push` 都變成了 `emit`——它同時
append 到回傳的陣列**和**推進通道。這正是讓前端可以信任 `streamed === 0` 這個判斷的原因：
兩個目的地不可能漂移，因為餵它們的只有一個呼叫點。

## 4. log 看得見的兩個改變

有兩個差異值得知道，因為它們不是 bug。

**stdout 與 stderr 現在會依抵達順序交錯。** 它們是兩根不同的管線，相對順序本來就沒有
保證——舊的 `commandLog()` 是靠「先接全部 stdout、再接全部 stderr」把這件事藏起來。串流
會照它們來的樣子顯示，也就是說一個警告會出現在**引發它的那一行旁邊**，而不是集中在最後
一塊。這是想要的行為，而 `server/hmi/__tests__/command.test.ts` 也因此斷言**同一條流內**
的順序，而不是跨流的順序——因為跨流不是任何人守得住的承諾。

**每一筆現在是一行**，而不是每條流一整塊。算繪出來的文字完全相同（前端兩種情況都用
`\n` 接起來），但如果有人在數「筆數」，數字會不一樣。

## 5. 實測

一次真實的 STM32H747I-DISCO 建置，在 `busy` 還是 `'building'` 的期間每兩秒取樣一次抽屜
裡的 log：

| t | 顯示行數 | 還在跑 | 最後一行 |
|---|---|---|---|
| 2 秒 | 16 | 是 | `-- The ASM compiler identification is GNU` |
| 6 秒 | 75 | 是 | `[40/585] Building C object …` |
| 12 秒 | 212 | 是 | `[177/585] …` |
| 20 秒 | 298 | 是 | `[263/585] …` |
| 74 秒 | 901 | 否 | `Firmware build complete, buildId: 9af5b44e…` |

在這次改動之前，上面每一行在建置結束前都是看不見的。而「Firmware build complete」在
整份 log 裡**只出現一次**，證明 `streamed === 0` 那道防線確實擋掉了重複附加。

順帶注意 Ninja 本來就在印的東西：`[263/585]`。**進度指示現在幾乎是免費的**——那個數字
就在串流裡，只是還沒有人去讀它。

## 6. 刻意沒動的部分

- **燒錄仍然是批次的。** 它只要幾秒，不是幾分鐘；而且哪天不是了，機制也已經在了：
  `flashBuild` 只需要同樣的 `emit` 處理與一個 run id，沒有別的。
- **`GET /api/hmi/builds/:id` 完全沒動。** 它所記錄的輪詢路徑仍然有效，對於「不願意把
  連線一直開著」的客戶端來說也仍然是正確答案。
- **沒有做進度條。** §5 說明了它會很便宜；但那是另一次改動，有它自己的 UI 問題要回答。
