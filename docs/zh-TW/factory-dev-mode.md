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

4. 成功後輸入欄關閉，**原廠人員研發模式**標記會同時出現在 About 畫面與選單列
   （Web/Desktop 標記旁）。介面立即更新，不需要重新載入。

密碼錯誤時輸入框會轉紅並清空，模式維持關閉。

## 生效期間

這個旗標存放在 `useAppStore().factoryDevMode`，**只存在於記憶體中**。它不會被寫入
`localStorage`、IndexedDB 或專案檔，因此：

- 重新載入頁面或重啟桌面版就會關閉，
- 不會不小心留給下一個使用者，
- 不會跟著匯出的專案一起外流。

刻意不提供關閉的 UI — 重新載入即可。

## 如何使用這個旗標

```tsx
import { useAppStore } from '../store/appStore';

const factoryDevMode = useAppStore(s => s.factoryDevMode);

return factoryDevMode ? <InternalDiagnostics /> : null;
```

密碼本身以 `FACTORY_DEV_MODE_PASSPHRASE` 從 `src/store/appStore.ts` 匯出，確保只
定義在一個地方。

## 這個模式改變了什麼

**目前還沒有。** 旗標與解鎖流程已就位，開啟時也會顯示標記，但尚未有任何功能依賴它。
這個模式要提供什麼、非此模式要隱藏什麼，仍待決定 — 決定後請逐項記錄於此：

| 介面 | 原廠人員研發模式下顯示 | 一般模式下顯示 |
| --- | --- | --- |
| _（待決定）_ | | |

## 實作位置

| 項目 | 檔案 |
| --- | --- |
| 旗標、密碼、`unlockFactoryDevMode()` | `src/store/appStore.ts` |
| About 畫面與五連點解鎖 | `src/components/AboutDialog/AboutDialog.tsx` |
| 選單列標記 | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
| `Help → About` 選單項目 | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
