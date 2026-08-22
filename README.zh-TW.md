# EDT HMI Studio

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/status-Production%20Ready-green.svg" alt="Status">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
</p>

<p align="center">
  <a href="./README.md">English</a> · <strong>繁體中文</strong>
</p>

功能完整的 **LVGL UI 視覺化編輯器**，支援拖曳設計、事件綁定、邏輯編排與 C 程式碼生成，適用於嵌入式 GUI 開發。

## ✨ 功能特性

### 🎨 視覺化設計
- **18 種 LVGL 元件**：按鈕、標籤、圖片、滑桿、核取方塊、切換開關、進度條、弧形、文字方塊、下拉選單、容器、分頁、視窗、圖表、表格、日曆、影片、QR 碼
- **拖曳放置**：從元件面板拖曳到畫布
- **元件巢狀**：可將元件放進容器內
- **直接操作**：拖曳移動、8 向調整大小
- **格線對齊**：可設定格線大小與吸附
- **橫向或直向**：建立專案時與板子一起選，之後也能改 —— Project Settings 會把整個版面連同畫布轉四分之一圈，而且只記一筆 undo。詳見 [docs/display-orientation.md](docs/zh-TW/display-orientation.md)

### ✏️ 進階編輯
- **框選多選**：以滑鼠拖出矩形選取
- **複製／貼上／剪下**：完整剪貼簿支援
- **對齊工具**：左／中／右對齊、上／中／下對齊、水平與垂直均分
- **右鍵選單**：快捷操作
- **疊放順序**：移到最上層／最下層、上移一層／下移一層
- **階層面板**：以樹狀顯示元件結構，可拖曳調整順序
- **復原／重做**：50 步歷史記錄
- **元件部位**：替滑桿的填色與把手、開關「開」的顏色、弧的數值上色——LVGL 分開繪製的那幾塊，用元件自己的說法命名。見 [docs/widget-parts.md](docs/zh-TW/widget-parts.md)
- **從 SD 卡播影片**：指名一個 AVI 容器裡的 Motion JPEG，面板就會用板子的 JPEG 硬體解碼播放。什麼都不會被編進韌體，所以任何長度的片子都不佔建置空間。見 [docs/video-playback.md](docs/zh-TW/video-playback.md)

### 📄 多頁面管理
- 建立、刪除、重新命名頁面
- 各頁面獨立的背景色
- 快速切換頁面

### ⚡ 事件綁定
- **視覺化事件編輯器**
- **支援所有 LVGL 事件**：點擊、長按、值改變、取得焦點等
- **內建動作**：
  - 頁面導覽，可從五種換頁動畫中挑選。詳見 [docs/zh-TW/screen-transitions.md](docs/zh-TW/screen-transitions.md)
  - 設定屬性
  - 顯示／隱藏元件
  - 設定文字或數值
  - 切換語系 —— 指定某個語系，或在專案語系之間循環。詳見 [docs/zh-TW/language-switching.md](docs/zh-TW/language-switching.md)
  - 播放或停止動畫。詳見 [docs/zh-TW/animation-model.md](docs/zh-TW/animation-model.md)
- **畫面本身也能觸發事件**：把動畫綁到畫面的 Screen Loaded 事件，它就成為該畫面的入場動畫，完全不需要寫程式碼
- **自訂 C 程式碼**：以 Monaco 編輯

### 🔗 邏輯編排器
以 React Flow 為基礎的節點式視覺化程式設計：

| 節點類型 | 功能 |
|---------|------|
| 🟢 觸發節點 | 事件觸發、計時器觸發 |
| 🟡 條件節點 | If/Else、Switch、比較、邏輯運算 |
| 🔵 動作節點 | 設定屬性、導覽、顯示／隱藏、延遲、呼叫函式 |
| 🟣 資料節點 | 讀寫變數、數學運算、字串操作、取得屬性 |
| ⚫ 自訂節點 | 嵌入 C 程式碼區塊 |

- **連線系統**：執行流（白色）＋資料流（彩色）
- **變數管理**：全域變數面板
- **除錯模式**：單步執行、節點高亮

### 💻 程式碼生成
- **產生的檔案**：
  - `ui.h` / `ui.c` — UI 初始化程式碼
  - `ui_events.h` / `ui_events.c` — 事件處理程式碼
  - `ui_logic.h` / `ui_logic.c` — 邏輯程式碼
- **Monaco 編輯器預覽**：語法高亮
- **一鍵複製與下載**
- **批次匯出**：一次下載所有檔案

### 📱 預覽
Preview 分頁打開的是 **🎛️ Emulator**：你的畫面被編譯成真正的 LVGL 在網頁裡跑，滑鼠與鍵盤
直接送進執行中的 UI。它後面還有兩個較輕的階——**Prototype**，編輯器自己用 Canvas 2D 畫的
版本，有縮放與點擊換頁；以及 **Simulator**，真正的 LVGL 畫出這個畫面，但不含你的任何程式碼
——而在三者之間切換的那一排，只有在原廠研發模式下才會畫出來，因為在較輕的那兩階拿到綠燈，
回答的是編輯器而不是面板。詳見 [docs/zh-TW/preview-ladder.md](docs/zh-TW/preview-ladder.md)。

### 📦 資源管理
- 圖片上傳與管理
- 字型管理
- 圖示庫

### 💾 專案管理
- 以 JSON 格式儲存／載入
- 自動儲存（每 30 秒）
- 啟動時詢問是否還原上次的專案

## 🚀 快速開始

### 安裝

```bash
# 複製專案
git clone <repository-url>
cd edt-hmi-studio

# 安裝相依套件
npm install

# 啟動開發伺服器
npm run dev
```

接著開啟 http://localhost:5173

### Emulator 工具鏈（選用，做一次就好）

Preview 分頁裡的 **🎛️ Emulator** 會把產生出來的 C 跟真正的 LVGL 一起編譯，然後直接在網頁裡
跑起來。那需要 Emscripten 與一份 LVGL checkout，這行指令會把它們裝進 `.hmi-cache/emulator/`
——已被 gitignore，不會裝到系統層級：

```bash
npm run emulator:setup
```

在已經建置過韌體的機器上，LVGL 那一半會被找到並沿用，pin 也相同，所以只需要下載
Emscripten。另外兩個預覽模式完全不需要工具鏈。詳見 [docs/zh-TW/emulator.md](docs/zh-TW/emulator.md)。

### 建置正式版

```bash
npm run build
npm run preview  # 預覽建置結果
```

若要建置**不包含**「🎛️ Emulator」這一階（線上編譯並執行）的版本，可在建置時關閉開關
（舊的 `VITE_ENABLE_COMPILE_PREVIEW` 仍然有效）：

```bash
VITE_ENABLE_EMULATOR=false npm run build:web
```

部署到 GitHub Pages 時，可另外指定儲存庫的子路徑：

```bash
VITE_BASE_PATH=/edt-hmi-studio/ VITE_ENABLE_EMULATOR=false npm run build:web
```

### 桌面版（NativeWebHost）

`desktop/` 使用 [NativeWebHost](https://github.com/IoTSharp/NativeWebHost) v2（OmniHost 改名後的延續）將既有的 Vite 前端包裝成桌面應用程式。套件已公開發佈於 [nuget.org](https://www.nuget.org/packages/NativeWebHost)，不再需要私有 feed 或認證。建置需要 .NET 10 SDK。

```bash
# 先建置前端靜態資源
npm ci
npm run build:desktop-web

# Linux（WebKitGTK）/ macOS（WKWebView，上游標示為實驗性）
dotnet publish ./desktop/EdtHmiStudio.Desktop.csproj -c Release -f net10.0

# Windows（WebView2）
dotnet publish ./desktop/EdtHmiStudio.Desktop.csproj -c Release -f net10.0-windows
```

桌面殼層預設啟用 NativeWebHost 的 VSCode 風格內建標題列，提供最大化、最小化與關閉按鈕；編輯器內部另外提供 VSCode 風格的選單列（File / Edit / View / Help）。殼層會注入 `nativeWeb` JavaScript bridge（並保留 `omni` 舊別名），前端以此偵測桌面模式。

`.github/workflows/desktop-packages.yml` 會在每次 push 到 `main` 時分別於 Linux、Windows、macOS 建置並上傳壓縮檔產物。macOS 執行環境（AppKit + WKWebView）在上游標示為實驗性。

## ⌨️ 快捷鍵

### 基本操作
| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + Z` | 復原 |
| `Ctrl + Shift + Z` / `Ctrl + Y` | 重做 |
| `Delete` / `Backspace` | 刪除選取項目 |
| `Escape` | 取消選取 |

### 選取與剪貼簿
| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + A` | 全選 |
| `Ctrl + 點擊` | 多選切換 |
| `Ctrl + C` | 複製 |
| `Ctrl + X` | 剪下 |
| `Ctrl + V` | 貼上 |
| `Ctrl + D` | 快速複製 |

### 畫布操作
| 快捷鍵 | 功能 |
|--------|------|
| `Space + 拖曳` | 平移畫布 |
| `滑鼠中鍵拖曳` | 平移畫布 |
| `Ctrl + 滾輪` | 縮放畫布 |

### 專案操作
| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + N` | 新增專案 |
| `Ctrl + S` | 儲存專案 |
| `F1` / `?` | 顯示說明 |

## 🛠️ 技術堆疊

- **框架**：React 19 + TypeScript
- **建置**：Vite 7
- **狀態管理**：Zustand 5
- **拖曳**：@dnd-kit/core
- **邏輯編排**：@xyflow/react 12
- **程式碼編輯**：Monaco Editor
- **打包**：JSZip

## 📁 專案結構

```
src/
├── components/           # UI 元件
│   ├── AlignToolbar/     # 對齊工具列
│   ├── Canvas/           # 畫布（拖曳、選取、調整大小）
│   ├── CodePreview/      # 程式碼預覽面板
│   ├── ComponentPanel/   # 元件面板
│   ├── ContextMenu/      # 右鍵選單
│   ├── Emulator/         # 編譯產生出來的 C，用真正的 LVGL 跑起來
│   ├── EventPanel/       # 事件綁定面板
│   ├── HelpPanel/        # 快捷鍵說明
│   ├── LogicEditor/      # 邏輯編排器
│   ├── PageManager/      # 頁面管理
│   ├── Preview/          # 即時預覽
│   ├── PropertyEditor/   # 屬性編輯器
│   ├── StatusBar/        # 狀態列
│   └── Toast/            # 通知提示
├── codegen/              # 程式碼生成引擎
│   ├── generator.ts      # 主生成器
│   ├── templates/        # 程式碼樣板
│   ├── formatters/       # 格式化工具
│   └── utils/            # 工具函式
├── hooks/                # React Hooks
│   └── useKeyboardShortcuts.ts
├── resources/            # 資源管理
├── store/                # 狀態管理
│   └── editorStore.ts    # Zustand Store
├── types/                # TypeScript 型別
└── utils/                # 工具函式
    └── componentDefinitions.ts  # 元件定義
```

## 📊 支援的 LVGL 元件

| 類別 | 元件 |
|------|------|
| **基礎** | Button、Label、Image、Line |
| **輸入** | Textarea、Dropdown、Checkbox、Switch、Slider |
| **容器** | Container (obj)、Tab View、Tile View、Window |
| **顯示** | Progress Bar、Arc、Spinner、Chart、Table、Calendar |
| **圖像** | QrCode |
| **雜項** | Video |

## 🔧 已知限制

1. **字型轉換**：實際的點陣資料由外部的 `lv_font_conv` 工具產生，編輯器負責生成樣板與指令。

## 📝 更新日誌

完整的更新歷史請見 [CHANGELOG.md](./CHANGELOG.md)。

## 🤝 貢獻

歡迎提交 Issue 與 Pull Request。

## 📄 授權

MIT License — 詳見 [LICENSE](./LICENSE) 檔案。

---

<p align="center">
  Made with ❤️ for embedded GUI development
</p>
