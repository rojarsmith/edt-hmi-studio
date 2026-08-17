# 桌面版安裝包打包

<p align="center">
  <a href="../desktop-installer-packaging.md">English</a> · <strong>繁體中文</strong>
</p>

如何把桌面版（NativeWebHost v2 殼層）連同硬體工具鏈的故事打包成單一
Windows 安裝包。調查日期：2026-08-17。

## 1. 授權紅線：STM32CubeCLT 不能整包捆進安裝檔

完整的硬體功能安裝需要 STM32CubeCLT（預設
`C:\ST\STM32CubeCLT_<version>`），但其元件的授權分成兩類：

| 元件 | 授權 | 可否隨我們的安裝包散布 |
| --- | --- | --- |
| `CMake`、`Ninja`、`Make` | 開源（BSD/Apache） | ✅ 可 |
| `GNU-tools-for-STM32`（arm-none-eabi-gcc） | GPL | ✅ 可（或改用上游 Arm GNU Toolchain） |
| `STM32CubeProgrammer`（`STM32_Programmer_CLI`）、`STLink-gdb-server`、`STLinkServer`、`st-arm-clang`、ST-LINK USB `drivers` | ST 專有授權（SLA） | ❌ **不可** |

燒錄功能依賴的正是不可散布的部分（`STM32_Programmer_CLI` + ST-LINK
驅動）。ST 的下載放在 st.com 且需接受授權，也沒有上 winget（已驗證：
`microsoft/winget-pkgs` 沒有 `STMicroelectronics` 目錄）。因此
「單一安裝包*內含*全部」在法律上做不到；正確做法是下述架構。

## 2. 安裝包架構

**自帶（打進我們的安裝包）：**

1. 桌面 app — `dotnet publish --self-contained -r win-x64`，使用者
   免裝 .NET runtime。
2. Node 後端。NativeWebHost 殼層目前只伺服 `dist/`；硬體橋接
   （`/api/hmi/*`，實作在 `server/`）活在 vite dev server 裡。完整
   安裝包必須把 server 程式碼打包（esbuild bundle）並附一份
   `node.exe`（Node.js 為 MIT 授權，可自由散布），由殼層啟動時
   spawn。
3. `firmware/` 板卡模板、`wasm/` 資源、內建字型。

**鏈式安裝的 prerequisite（可散布的第三方安裝程式）：**

- WebView2 Evergreen Bootstrapper（`MicrosoftEdgeWebView2Setup.exe`）
  — Microsoft 明確允許再散布；Windows 10 需要。

**偵測 + 導引（不可散布的）：**

- STM32CubeCLT：安裝程式掃描 `C:\ST\STM32CubeCLT_*`（取最新版）。
  找不到時顯示精靈頁，連結
  <https://www.st.com/en/development-tools/stm32cubeclt.html>
  讓使用者自行安裝（ST-LINK 驅動會一併裝好），再重新偵測。偵測到的
  根目錄寫入 app 設定；`server/hmi/service.ts` 本就支援預設路徑加
  環境變數覆寫，app 內也應保留手動指定路徑的設定頁。

## 3. 打包工具：Inno Setup

推薦 Inno Setup：免費、腳本直觀、支援 `[Run]` 鏈式執行與自訂精靈頁。
WiX/MSI 只有在企業需要 GPO 部署時才值得其複雜度。MSIX 不適合 —
其沙箱模型與「spawn 外部工具鏈 + USB 驅動」根本衝突。

骨架：

```innosetup
[Setup]
AppName=EDT HMI Studio
AppVersion=1.0.0
DefaultDirName={autopf}\EDT HMI Studio
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "publish\*"; DestDir: "{app}"; Flags: recursesubdirs
Source: "prereq\MicrosoftEdgeWebView2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2Setup.exe"; Parameters: "/silent /install"; \
  Check: not IsWebView2Installed; StatusMsg: "Installing WebView2 Runtime..."

[Code]
function IsWebView2Installed: Boolean;
begin
  Result := RegKeyExists(HKLM,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}');
end;

// DetectCubeCLT：掃描 C:\ST\STM32CubeCLT_*，取最新版寫入 app 設定；
// 找不到時顯示導引頁連到 st.com 下載，之後重新偵測。
```

## 4. 長期選項：換掉不可散布的那一塊

若「單一安裝包、零手動步驟」成為硬需求，唯一的路是把
`STM32_Programmer_CLI` 依賴換成 **OpenOCD**（開源、可散布、支援
ST-LINK 燒錄 STM32），驅動改用 WinUSB 方案。這能讓燒錄完全自帶，
代價是重寫 `server/hmi/service.ts` 的燒錄／探針／序列埠邏輯。建議
先出「偵測 + 導引」版安裝包，OpenOCD 化列為獨立的路線圖項目。
