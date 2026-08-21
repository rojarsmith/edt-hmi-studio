# 原廠人員研發模式

<p align="center">
  <a href="../factory-dev-mode.md">English</a> · <strong>繁體中文</strong>
</p>

**原廠人員研發模式**是提供 EDT 原廠人員使用的隱藏執行模式。從 About 畫面解鎖，
效力僅維持到應用程式重新載入或重新啟動為止。

> **這不是安全機制。** 密碼會隨前端 bundle 一起出貨，而且就寫在下面。它的用途是讓
> 內部工具不干擾一般使用者，不是用來保護任何東西。**絕對不要**把破壞性操作、憑證或
> 客戶資料放在這個模式後面。

## 如何解鎖

1. 開啟 **Help → About**。工具列沒有這個按鈕，只有選單列的下拉選單裡才有。
2. 在開發者姓名 **Rojar Smith（吳斌）** 上**連點五下**。每兩下之間需在 2 秒內，
   否則計數會重新開始。
3. 會展開一個 **Access code** 輸入欄，輸入：

   ```
   edt321
   ```

4. 成功後輸入欄關閉，**Factory Mode** 標記會同時出現在 About 畫面與選單列
   （Web/Desktop 標記旁）。介面立即更新，不需要重新載入。

   介面文字一律使用英文，「原廠人員研發模式」只作為文件與口頭上的稱呼。

密碼錯誤時輸入框會轉紅並清空，模式維持關閉。

## 生效期間

這個旗標存放在 `useAppStore().factoryDevMode`，**只存在於記憶體中**。它不會被寫入
`localStorage`、IndexedDB 或專案檔，因此：

- 重新載入頁面或重啟桌面版就會關閉，
- 不會不小心留給下一個使用者，
- 不會跟著匯出的專案一起外流。

也可以隨時手動離開：點選單列的 **Factory Mode** 標記並確認，編輯器會立即回到
一般狀態，要再進入需重新輸入密碼。

## 如何使用這個旗標

```tsx
import { useAppStore } from '../store/appStore';

const factoryDevMode = useAppStore(s => s.factoryDevMode);

return factoryDevMode ? <InternalDiagnostics /> : null;
```

密碼本身以 `FACTORY_DEV_MODE_PASSPHRASE` 從 `src/store/appStore.ts` 匯出，確保只
定義在一個地方。

## 這個模式改變了什麼

| 介面 | 原廠人員研發模式 | 一般模式 |
| --- | --- | --- |
| **Code** 編輯分頁（產生的 C 原始碼），位於分頁列最右側 | 顯示 | 隱藏 |
| **View → Code** 選單項目，位於 Preview 之後 | 顯示 | 隱藏 |
| **Icon** 分頁與 **View → Icon** 選單項目 —— 圖庫能瀏覽、能複製 SVG，但免寫程式碼的作者目前沒有任何一條路能讓它到達面板；見 [icon-library.md](icon-library.md) | 顯示 | 隱藏 |
| 工具列 **Info** 對話框的 **LVGL** 區段 —— heap 大小、預設字型、大字型支援 | 顯示 | 隱藏 |
| **Deploy** 分頁的 **Asset Placement** 區段 —— 每個已燒錄圖片與字型字圖的起訖位址、兩端所在記憶體，字型另有字數與平均每字位元組 | 顯示 | 隱藏 |
| Text → Fonts 分頁 **Font Properties** 的轉檔設定 —— C 變數名、字元集模式、額外字元與範圍、涵蓋數、BPP、產生按鈕。中繼資料、名稱、警告與預覽留在一般模式 | 顯示 | 隱藏 |
| Logic 分頁 Event Trigger 節點的 **Event Object** 輸出 —— 產生的程式碼仍會丟棄事件，這個埠目前餵不出任何東西（見 [logic-event-trigger.md](logic-event-trigger.md)）；已經接了線的埠在兩種模式都顯示，連線永遠不會被藏斷 | 顯示 | 隱藏 |
| Logic 分頁 Properties 面板的 **Active on Screens** —— 逐圖儲存但目前沒有任何東西使用；圖暫定全域運作，一般模式改顯示單純的 **Active** 開關，而且真的有作用：關掉的圖完全不會出現在產生的程式碼裡 | 顯示 | 隱藏 |
| Logic 調色盤的 **Custom** 架子 —— Call Function 與 C Code Block，手寫 C 是原廠工程師的領域；已放進圖裡的節點在任何模式都照常渲染與產生，藏起來的只有調色盤上的供應 | 顯示 | 隱藏 |
| Properties 面板標題列的**收合三角形**，可把整個面板收成一條標題列。面板內各分區的收合、以及標題列的全部展開／全部收合按鈕，兩種模式都照常提供 | 顯示 | 隱藏 |

日後決定的項目請繼續補充於此表。

### 關於 Properties 面板

右側欄位裡只有屬性編輯器，整個收掉只會留下一條空白帶——原廠工程師想把畫布
拉寬時有用，但對其他人來說只是把屬性弄不見，還得再找同一個三角形才能叫回來。

收合狀態跟 Code 分頁一樣是「推導」而非「儲存」：`expanded` 的值是
`panelExpanded || !factoryDevMode`。因此在 Factory Mode 收起來的面板，一旦
離開該模式就會自動彈回，不會留下一條看不出怎麼打開的標題列。

### 關於 Info 對話框

該對話框的其餘內容都在描述板子：解析度、色彩格式、frame buffer 大小、flash、
現場匯流排，以及 ST-LINK 板名。這些是操作人員合理會需要知道的事實。LVGL 那幾列
是韌體的建置設定而非硬體性質，所以只有它們被隱藏。該區段帶有標記，讓人清楚它為何
出現。

### 關於 Code 分頁

在 Code 分頁開著時離開模式，內容區會變成空白，因此分頁是**推導**出來的而非另存：
只要 `activeTab` 是 `code` 且旗標關閉，`effectiveTab` 就讀作 `design`。繪製的面板、
分頁高亮、選單全部依據這一個值，不需要把狀態同步回去，也不需要任何 effect。

隱藏分頁並不會停用程式碼生成本身：`generateCode()` 在 **Emulator**
（`Emulator`）與 **Deploy** 建置時照常執行，後者是在
`server/hmi/projectSource.ts` 裡呼叫同一個產生器。被管制的只是顯示產出原始碼的那個
分頁。LVGL Preview 不在這份清單上，而且從來就不在——餵給它的是一棵元件樹 JSON，
不是產生出來的 C（[preview-ladder.md](./preview-ladder.md) §3）。

## 實作位置

| 項目 | 檔案 |
| --- | --- |
| 旗標、密碼、`unlockFactoryDevMode()` | `src/store/appStore.ts` |
| About 畫面與五連點解鎖 | `src/components/AboutDialog/AboutDialog.tsx` |
| 選單列標記 | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
| `Help → About` 選單項目 | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
