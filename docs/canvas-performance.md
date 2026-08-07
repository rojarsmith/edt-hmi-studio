# Canvas Rendering Architecture

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/canvas-performance.md">繁體中文</a>
</p>

## 1. Overview

The design canvas is the editor's main interaction surface. It renders the widgets, and handles dragging, resizing, rubber-band selection and alignment. The architecture is built around performance, so that interaction stays smooth on a page with many widgets.

## 2. Component structure

```
Canvas (canvas container)
├── Viewport layer (canvas-viewport) — pan transform
│   └── Canvas layer (canvas) — zoom transform
│       ├── Grid
│       ├── CanvasComponent[] (widget rendering)
│       │   └── CanvasComponent[] (children, recursive)
│       ├── BoxSelection (rubber-band rectangle)
│       └── AlignmentGuides
└── ContextMenu (right-click menu)
```

## 3. State management

### 3.1 Store structure (editorStore)

| State | Purpose | Update frequency |
|-------|------|---------|
| `canvas` | Canvas size, zoom, pan, grid configuration | Low |
| `pages` | Page list and widget trees | Medium (the dragged widget updates every frame) |
| `selection` | Ids of the selected and hovered widgets | Low |
| `drag` | Drag state (whether dragging, start coordinates, current coordinates) | High (every frame while dragging) |
| `alignmentGuides` | Alignment guides | Low |

### 3.2 Subscription strategy

Canvas and CanvasComponent use fine-grained zustand selectors, so an unrelated state change does not trigger a re-render:

- **Canvas** subscribes to `canvas`, `pages`, `currentPageId`, `alignmentGuides` and the action functions.
- **Canvas does not subscribe to `drag`**: the drag coordinates are transient, high-frequency data, read through `getState()` inside the event handlers instead.
- **CanvasComponent** subscribes to `selection.selectedIds` and `selection.hoveredId` itself, so only the widgets whose selected or hovered state actually changed re-render.

### 3.3 Reference stability of the widget tree

When `updateComponentInTree` walks the tree, it creates new objects only along the path that actually changed and returns the original reference for untouched subtrees. Together with `React.memo`, this lets unchanged widgets skip re-rendering.

## 4. Interaction handling

### 4.1 Drag to move

1. `mousedown` → `startDrag('move', ...)` records the start position
2. `mousemove` → throttled by RAF → `moveComponentAndUpdateDrag()` updates the widget position and the drag state in a single `set()`
3. `mouseup` → `endDrag()` + `saveToHistory()`

### 4.2 Resize

1. `mousedown` on a resize handle → `startDrag('resize', ...)` records the handle direction
2. `mousemove` → throttled by RAF → `resizeComponentAndUpdateDrag()` updates the size and the drag state in a single `set()`
3. `mouseup` → `endDrag()` + `saveToHistory()`

### 4.3 Rubber-band selection

1. `mousedown` on the canvas background → record the start coordinates
2. `mousemove` → update the selection rectangle (local state plus a ref)
3. `mouseup` → find the widgets inside the rectangle → `selectComponents(ids)`

### 4.4 Pan and zoom

- Middle-button drag, or Space + left-button drag → pan the canvas
- Ctrl + wheel → zoom the canvas

### 4.5 Handler stability

Every event handler is wrapped in `useCallback`, reads transient state through refs and `getState()`, and keeps its dependency list minimal, so the handler identity stays stable.

## 5. Rendering optimisations

| Technique | Description |
|------|------|
| `React.memo` | CanvasComponent and CanvasImageContent are memoised, skipping re-renders of unchanged widgets |
| Fine-grained subscriptions | zustand selectors, so a component subscribes only to the state slice it needs |
| Reference stability | Tree updates preserve the original reference for unmodified nodes; handler dependencies are minimal |
| Batched updates | A move or resize is merged into a single `set()` call |
| RAF throttling | `mousemove` is throttled with `requestAnimationFrame`, at most once per frame |
| No subscription to high-frequency state | `drag` is not subscribed through a selector; it is read on demand inside the handlers |

## 6. Widget rendering

### 6.1 CanvasComponent

Every LVGL widget on the canvas is rendered by one `CanvasComponent`, which:

- Renders the preview content for its widget type (button, label, slider, ...)
- Applies the style properties (background colour, border, corner radius, shadow, gradient, opacity, ...)
- Shows the selection state (selection box plus resize handles)
- Renders its children recursively
- Reads `appStore.defaultFontSize` as the default font size for text widgets

### 6.2 Container special cases

- **Tabview**: filters children by `activeTab` and `tabChildMap`, showing only the current tab's children
- **Tileview**: filters children by `currentRow`/`currentCol` and `tileChildMap`, showing only the current tile's children
- **Win**: title bar plus content area layout

## 7. Key files

| File | Responsibility |
|------|------|
| `src/components/Canvas/Canvas.tsx` | Canvas container, event handling, recursive widget rendering |
| `src/components/Canvas/CanvasComponent.tsx` | Rendering and interaction for a single widget |
| `src/components/Canvas/Canvas.css` | Canvas styles |
| `src/components/Canvas/CanvasComponent.css` | Widget styles |
| `src/components/Canvas/AlignmentGuides.tsx` | Alignment guides |
| `src/store/editorStore.ts` | Editor state (widget tree, selection, drag, history) |
| `src/store/appStore.ts` | App-level state (default font size, ...) |
