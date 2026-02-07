# LVGL UI Editor

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/status-Production%20Ready-green.svg" alt="Status">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
</p>

A full-featured **visual editor for LVGL user interfaces**, with drag-and-drop design, event binding, node-based logic and C code generation. Built for embedded GUI development.

## ✨ Features

### 🎨 Visual design
- **16 LVGL widgets**: button, label, image, slider, checkbox, switch, progress bar, arc, textarea, dropdown, container, tab view, window, chart, table, calendar
- **Drag and drop**: drag from the component panel onto the canvas
- **Nesting**: place widgets inside containers
- **Direct manipulation**: drag to move, resize from 8 handles
- **Grid alignment**: configurable grid size and snapping

### ✏️ Advanced editing
- **Rubber-band selection**: drag a rectangle to select
- **Copy / paste / cut**: full clipboard support
- **Alignment tools**: left/centre/right, top/middle/bottom, horizontal and vertical distribution
- **Context menu**: quick actions on right-click
- **Z-order**: bring to front, send to back, move forward, move backward
- **Hierarchy panel**: tree view of the widget structure, with drag-to-reorder
- **Undo / redo**: 50 steps of history

### 📄 Multi-page management
- Create, delete and rename pages
- Per-page background colour
- Quick page switching

### ⚡ Event binding
- **Visual event editor**
- **Every LVGL event**: click, long press, value changed, focus and more
- **Built-in actions**:
  - Page navigation
  - Set a property
  - Show / hide a widget
  - Set text or value
- **Custom C code**: edited in Monaco

### 🔗 Logic editor
Node-based visual programming built on React Flow:

| Node type | Purpose |
|---------|------|
| 🟢 Trigger | Event triggers, timer triggers |
| 🟡 Condition | If/Else, Switch, comparison, logical operators |
| 🔵 Action | Set property, navigate, show/hide, delay, call function |
| 🟣 Data | Read/write variables, arithmetic, string operations, get property |
| ⚫ Custom | Embed a block of C |

- **Connections**: execution flow (white) plus data flow (coloured)
- **Variables**: global variable panel
- **Debug mode**: single-step execution with node highlighting

### 💻 Code generation
- **Generated files**:
  - `ui.h` / `ui.c` — UI initialisation
  - `ui_events.h` / `ui_events.c` — event handlers
  - `ui_logic.h` / `ui_logic.c` — logic code
- **Monaco preview** with syntax highlighting
- **One-click copy and download**
- **Bulk export**: download every file at once

### 📱 Live preview
- Canvas renders an approximation of the LVGL widgets
- Zoom control (50% – 200%)
- Hover interaction

### 📦 Resource management
- Image upload and management
- Font management
- Icon library

### 💾 Project management
- Save and load as JSON
- Autosave (every 30 seconds)
- Offer to restore the last project on start

## 🚀 Getting started

### Install

```bash
# Clone the project
git clone <repository-url>
cd lvgl-editor

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Then open http://localhost:5173

### Production build

```bash
npm run build
npm run preview  # preview the build output
```

# Build the front-end assets first
npm ci
npm run build:desktop-web

# Linux
dotnet publish ./desktop/LvglEditor.Desktop.csproj -c Release -f net8.0

# Windows
dotnet publish ./desktop/LvglEditor.Desktop.csproj -c Release -f net8.0-windows
```

The desktop shell enables OmniHost's VSCode-style built-in title bar by default, providing maximise, minimise and close buttons; the editor itself adds a VSCode-style menu bar (File / Edit / View / Help).

OmniHost is currently distributed through `maikebing`'s GitHub Packages, so building the desktop version locally or in CI requires:

- `OMNIHOST_PACKAGES_USERNAME`
- `OMNIHOST_PACKAGES_TOKEN` (needs read access to the `maikebing/OmniHost` GitHub Packages feed)

`.github/workflows/desktop-packages.yml` builds and uploads an archive for Linux, macOS and Windows once the `OMNIHOST_PACKAGES_TOKEN` secret is configured. Because the current public release of OmniHost has no native macOS runtime, the macOS artifact exists to keep the build and distribution flow uniform; at runtime it reports the platform limitation.

## ⌨️ Keyboard shortcuts

### Basics
| Shortcut | Action |
|--------|------|
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo |
| `Delete` / `Backspace` | Delete selection |
| `Escape` | Clear selection |

### Selection and clipboard
| Shortcut | Action |
|--------|------|
| `Ctrl + A` | Select all |
| `Ctrl + click` | Toggle in multi-selection |
| `Ctrl + C` | Copy |
| `Ctrl + X` | Cut |
| `Ctrl + V` | Paste |
| `Ctrl + D` | Duplicate |

### Canvas
| Shortcut | Action |
|--------|------|
| `Space + drag` | Pan the canvas |
| `Middle-button drag` | Pan the canvas |
| `Ctrl + wheel` | Zoom the canvas |

### Project
| Shortcut | Action |
|--------|------|
| `Ctrl + N` | New project |
| `Ctrl + O` | Open project |
| `Ctrl + S` | Save project |
| `F1` / `?` | Show help |

## 🛠️ Tech stack

- **Framework**: React 19 + TypeScript
- **Build**: Vite 7
- **State**: Zustand 5
- **Drag and drop**: @dnd-kit/core
- **Logic editor**: @xyflow/react 12
- **Code editing**: Monaco Editor
- **Packaging**: JSZip

## 📁 Project layout

```
src/
├── components/           # UI components
│   ├── AlignToolbar/     # Alignment toolbar
│   ├── Canvas/           # Canvas (drag, select, resize)
│   ├── CodePreview/      # Code preview panel
│   ├── ComponentPanel/   # Component palette
│   ├── ContextMenu/      # Right-click menu
│   ├── EventPanel/       # Event binding panel
│   ├── HelpPanel/        # Keyboard shortcut help
│   ├── LogicEditor/      # Logic editor
│   ├── PageManager/      # Page management
│   ├── Preview/          # Live preview
│   ├── PropertyEditor/   # Property editor
│   ├── StatusBar/        # Status bar
│   └── Toast/            # Notifications
├── codegen/              # Code generation engine
│   ├── generator.ts      # Main generator
│   ├── templates/        # Code templates
│   ├── formatters/       # Formatting helpers
│   └── utils/            # Utilities
├── hooks/                # React hooks
│   └── useKeyboardShortcuts.ts
├── resources/            # Resource management
├── store/                # State management
│   └── editorStore.ts    # Zustand store
├── types/                # TypeScript types
└── utils/                # Utilities
    └── componentDefinitions.ts  # Widget definitions
```

## 📊 Supported LVGL widgets

| Category | Widgets |
|------|------|
| **Basic** | Button, Label, Image, Line |
| **Input** | Textarea, Dropdown, Checkbox, Switch, Slider |
| **Container** | Container (obj), Tab View, Tile View, Window |
| **Display** | Progress Bar, Arc, Spinner, Chart, Table, Calendar |

## 🔧 Known limitations

1. **Complex styles**: some advanced LVGL style properties are not yet supported.
2. **Animation**: the animation editor is not implemented yet.

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full history.

## 🤝 Contributing

Issues and pull requests are welcome.

## 📄 License

MIT License — see the [LICENSE](./LICENSE) file.

---

<p align="center">
  Made with ❤️ for embedded GUI development
</p>
