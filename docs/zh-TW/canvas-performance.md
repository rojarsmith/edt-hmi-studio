# 畫布繪製架構設計文件

<p align="center">
  <a href="../canvas-performance.md">English</a> · <strong>繁體中文</strong>
</p>

## 1. 概述

設計畫布（Canvas）是 EDT GUI Studio 的核心互動區域，負責元件的視覺化繪製、拖曳移動、縮放調整、框選、對齊等操作。架構以高效能為核心目標，確保元件數量龐大時仍能流暢互動。

## 2. 元件結構

```
Canvas（畫布容器）
├── 視埠層 (canvas-viewport) — 平移變換
│   └── 畫布層 (canvas) — 縮放變換
│       ├── Grid（格線）
│       ├── CanvasComponent[]（元件繪製）
│       │   └── CanvasComponent[]（遞迴子元件）
│       ├── BoxSelection（框選矩形）
│       └── AlignmentGuides（對齊輔助線）
└── ContextMenu（右鍵選單）
```

## 3. 狀態管理

### 3.1 Store 結構（editorStore）

| State | 說明 | 變化頻率 |
|-------|------|---------|
| `canvas` | 畫布尺寸、縮放、平移、格線設定 | 低 |
| `pages` | 頁面列表與元件樹 | 中（拖曳時每幀更新被拖曳的元件） |
| `selection` | 選取／停留中的元件 ID | 低 |
| `drag` | 拖曳狀態（是否拖曳中、起始座標、目前座標） | 高（拖曳時每幀更新） |
| `alignmentGuides` | 對齊輔助線 | 低 |

### 3.2 訂閱策略

Canvas 與 CanvasComponent 採用細粒度的 zustand selector 訂閱，避免無關的 state 變化觸發重新繪製：

- **Canvas** 訂閱：`canvas`、`pages`、`currentPageId`、`alignmentGuides`，以及各個 action 函式。
- **Canvas 不訂閱 `drag`**：拖曳座標是高頻變動的暫態資料，改在事件處理函式中以 `getState()` 讀取。
- **CanvasComponent** 自行訂閱 `selection.selectedIds` 與 `selection.hoveredId`，只有選取／停留狀態真的改變的元件才會重新繪製。

### 3.3 元件樹的參考穩定性

`updateComponentInTree` 遞迴更新元件樹時，只在實際被修改的路徑上建立新物件，未修改的子樹回傳原本的參考。搭配 `React.memo`，讓沒有變化的元件跳過重新繪製。

## 4. 互動處理

### 4.1 拖曳移動

1. `mousedown` → `startDrag('move', ...)` 記錄起始位置
2. `mousemove` → 以 RAF 節流 → `moveComponentAndUpdateDrag()` 在單次 `set()` 中同時更新元件位置與 drag state
3. `mouseup` → `endDrag()` + `saveToHistory()`

### 4.2 調整大小（Resize）

1. 在調整控制點上 `mousedown` → `startDrag('resize', ...)` 記錄控制點方向
2. `mousemove` → 以 RAF 節流 → `resizeComponentAndUpdateDrag()` 在單次 `set()` 中更新尺寸與 drag state
3. `mouseup` → `endDrag()` + `saveToHistory()`

### 4.3 框選

1. 在畫布背景 `mousedown` → 記錄起始座標
2. `mousemove` → 更新框選矩形（本地 state + ref）
3. `mouseup` → 計算框內的元件 → `selectComponents(ids)`

### 4.4 平移與縮放

- 中鍵拖曳／Space + 左鍵拖曳 → 平移畫布
- Ctrl + 滾輪 → 縮放畫布

### 4.5 事件回呼的穩定性

所有事件 handler 都以 `useCallback` 包裹，內部透過 ref 與 `getState()` 讀取暫態 state，相依項降到最低，讓回呼的參考保持穩定。

## 5. 繪製最佳化

| 技術 | 說明 |
|------|------|
| `React.memo` | CanvasComponent 與 CanvasImageContent 使用 memo，跳過未變化元件的重新繪製 |
| 細粒度訂閱 | zustand selector 模式，元件只訂閱自己需要的 state 片段 |
| 參考穩定性 | 元件樹更新時保留未修改節點的原參考；事件回呼相依項最小化 |
| 批次更新 | move/resize 操作合併為單次 `set()` 呼叫 |
| RAF 節流 | `mousemove` 以 `requestAnimationFrame` 節流，每幀最多處理一次 |
| 高頻 state 不訂閱 | `drag` 不透過 selector 訂閱，只在事件處理函式中按需讀取 |

## 6. 元件繪製

### 6.1 CanvasComponent

畫布上每個 LVGL 元件都由一個 `CanvasComponent` 繪製，負責：

- 依元件類型繪製對應的預覽內容（按鈕、標籤、滑桿等）
- 套用樣式屬性（背景色、邊框、圓角、陰影、漸層、透明度等）
- 顯示選取狀態（選取框 + 調整控制點）
- 遞迴繪製子元件
- 讀取 `appStore.defaultFontSize` 作為文字元件的預設字級

### 6.2 容器元件的特殊處理

- **Tabview**：依 `activeTab` 與 `tabChildMap` 過濾，只顯示目前分頁的子元件
- **Tileview**：依 `currentRow`／`currentCol` 與 `tileChildMap` 過濾，只顯示目前圖磚的子元件
- **Win**：標題列 + 內容區域的版面

## 7. 關鍵檔案

| 檔案 | 職責 |
|------|------|
| `src/components/Canvas/Canvas.tsx` | 畫布容器、事件處理、元件遞迴繪製 |
| `src/components/Canvas/CanvasComponent.tsx` | 單一元件的繪製與互動 |
| `src/components/Canvas/Canvas.css` | 畫布樣式 |
| `src/components/Canvas/CanvasComponent.css` | 元件樣式 |
| `src/components/Canvas/AlignmentGuides.tsx` | 對齊輔助線 |
| `src/store/editorStore.ts` | 編輯器狀態管理（元件樹、選取、拖曳、歷史） |
| `src/store/appStore.ts` | 應用程式層級狀態（預設字級等） |
