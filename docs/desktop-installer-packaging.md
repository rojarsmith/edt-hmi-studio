# Desktop Installer Packaging

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/desktop-installer-packaging.md">繁體中文</a>
</p>

How to ship the desktop build (NativeWebHost v2 shell) as a single Windows
installer, including the hardware toolchain story. Researched 2026-08-17.

## 1. The licensing red line: STM32CubeCLT cannot be bundled

A full hardware-capable install needs STM32CubeCLT (default
`C:\ST\STM32CubeCLT_<version>`), but its components split into two license
classes:

| Component | License | Redistributable in our installer |
| --- | --- | --- |
| `CMake`, `Ninja`, `Make` | open source (BSD/Apache) | ✅ yes |
| `GNU-tools-for-STM32` (arm-none-eabi-gcc) | GPL | ✅ yes (or use upstream Arm GNU Toolchain) |
| `STM32CubeProgrammer` (`STM32_Programmer_CLI`), `STLink-gdb-server`, `STLinkServer`, `st-arm-clang`, ST-LINK USB `drivers` | ST proprietary (SLA) | ❌ **no** |

Flashing depends exactly on the non-redistributable parts
(`STM32_Programmer_CLI` + ST-LINK drivers). ST gates downloads behind
st.com with license acceptance, and publishes nothing on winget (verified:
`microsoft/winget-pkgs` has no `STMicroelectronics` vendor directory).
Therefore a single installer that *contains* everything is legally
impossible; the standard architecture below is the answer.

## 2. Installer architecture

**Bundled (ships inside our installer):**

1. The desktop app — `dotnet publish --self-contained -r win-x64`, so end
   users do not need the .NET runtime.
2. The Node backend. The NativeWebHost shell only serves `dist/` today;
   the hardware bridge (`/api/hmi/*`, implemented in `server/`) lives in
   the vite dev server. A complete installer must bundle the server code
   (esbuild bundle) plus a `node.exe` (Node.js is MIT-licensed and freely
   redistributable), spawned by the shell at startup.
3. `firmware/` board templates, `wasm/` assets, bundled fonts.

**Chained prerequisites (redistributable third-party installers):**

- WebView2 Evergreen Bootstrapper (`MicrosoftEdgeWebView2Setup.exe`) —
  Microsoft explicitly permits redistribution; needed on Windows 10.

**Detect-and-guide (non-redistributable):**

- STM32CubeCLT: the installer scans `C:\ST\STM32CubeCLT_*` (newest wins).
  When absent, a wizard page links to
  <https://www.st.com/en/development-tools/stm32cubeclt.html> and lets the
  user install it (ST-LINK drivers come along), then re-detects. The
  detected root is written to app config; `server/hmi/service.ts` already
  supports a default root plus env-var override, and the app should keep a
  settings page for manual paths.

## 3. Tooling: Inno Setup

Inno Setup is the recommendation: free, script-based, supports chained
`[Run]` steps and custom wizard pages. WiX/MSI is only worth its
complexity when enterprise GPO deployment is required. MSIX is unsuitable
— its sandbox model conflicts with spawning external toolchains and USB
drivers.

Skeleton:

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

// DetectCubeCLT: scan C:\ST\STM32CubeCLT_*, pick the newest, write it to
// app config; when absent show a guide page linking to the st.com
// download, then re-detect.
```

## 4. Long-term option: replace the non-redistributable piece

If "one installer, zero manual steps" ever becomes a hard requirement, the
only path is replacing the `STM32_Programmer_CLI` dependency with
**OpenOCD** (open source, redistributable, flashes STM32 over ST-LINK) and
WinUSB-based drivers. That makes flashing self-contained, at the cost of
rewriting the flash/probe/serial logic in `server/hmi/service.ts`. Ship
the detect-and-guide installer first; treat OpenOCD as a separate roadmap
item.
