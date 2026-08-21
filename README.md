# EDT HMI Studio

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/status-Production%20Ready-green.svg" alt="Status">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
</p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh-TW.md">繁體中文</a>
</p>

A full-featured **visual editor for LVGL user interfaces**, with drag-and-drop design, event binding, node-based logic and C code generation. Built for embedded GUI development.

## ✨ Features

### 🎨 Visual design
- **16 LVGL widgets**: button, label, image, slider, checkbox, switch, progress bar, arc, textarea, dropdown, container, tab view, window, chart, table, calendar
- **Drag and drop**: drag from the component panel onto the canvas
- **Nesting**: place widgets inside containers
- **Direct manipulation**: drag to move, resize from 8 handles
- **Grid alignment**: configurable grid size and snapping
- **Landscape or portrait**: chosen with the board when the project is created, and changeable later — Project Settings turns the whole layout a quarter turn with the canvas, in one undoable step. See [docs/display-orientation.md](docs/display-orientation.md)

### ✏️ Advanced editing
- **Rubber-band selection**: drag a rectangle to select
- **Copy / paste / cut**: full clipboard support
- **Alignment tools**: left/centre/right, top/middle/bottom, horizontal and vertical distribution
- **Context menu**: quick actions on right-click
- **Z-order**: bring to front, send to back, move forward, move backward
- **Hierarchy panel**: tree view of the widget structure, with drag-to-reorder
- **Undo / redo**: 50 steps of history
- **Widget parts**: style a slider's fill and knob, a switch's On colour, an arc's value — the pieces LVGL draws separately, in each widget's own words. See [docs/widget-parts.md](docs/widget-parts.md)

### 📄 Multi-page management
- Create, delete and rename pages
- Per-page background colour
- Quick page switching

### ⚡ Event binding
- **Visual event editor**
- **Every LVGL event**: click, long press, value changed, focus and more
- **Built-in actions**:
  - Page navigation, drawn with one of five transitions. See [docs/screen-transitions.md](docs/screen-transitions.md)
  - Set a property
  - Show / hide a widget
  - Set text or value
  - Switch language — a named one, or cycle through the project's languages. See [docs/language-switching.md](docs/language-switching.md)
  - Play or stop an animation. See [docs/animation-model.md](docs/animation-model.md)
- **Screens fire events too**: bind an animation to a screen's Screen Loaded event and it becomes that screen's entry animation, without writing code
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

### 📱 Preview
The Preview tab opens the **🎛️ Emulator**: your screens compiled to real LVGL and
running in the page, with mouse and keyboard going into the running UI. Two
lighter rungs sit behind it — **Prototype**, the editor's own Canvas 2D drawing
with zoom and click-through navigation, and **Simulator**, real LVGL rendering the
screen with none of your code — and the strip that switches between the three is
drawn in factory dev mode only, because a green result on either of the lighter
rungs is an answer about the editor rather than about the panel. See
[docs/preview-ladder.md](docs/preview-ladder.md).

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
cd edt-hmi-studio

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Then open http://localhost:5173

### Emulator toolchain (optional, once)

The Preview tab's **🎛️ Emulator** compiles the generated C against real LVGL and
runs it in the page. That needs Emscripten and an LVGL checkout, which this
installs into `.hmi-cache/emulator/` — gitignored, nothing system-wide:

```bash
npm run emulator:setup
```

On a machine that has already built firmware, the LVGL half is found and reused
at the same pin, so only Emscripten is downloaded. The other two preview modes
need no toolchain at all. See [docs/emulator.md](docs/emulator.md).

### Production build

```bash
npm run build
npm run preview  # preview the build output
```

To build a version **without** the "🎛️ Emulator" in-browser compile-and-run rung, turn the switch off at build time (the older `VITE_ENABLE_COMPILE_PREVIEW` is still honoured):

```bash
VITE_ENABLE_EMULATOR=false npm run build:web
```

When deploying to GitHub Pages, a repository sub-path can also be given:

```bash
VITE_BASE_PATH=/edt-hmi-studio/ VITE_ENABLE_EMULATOR=false npm run build:web
```

### Desktop build (NativeWebHost)

`desktop/` wraps the existing Vite front end as a desktop application using [NativeWebHost](https://github.com/IoTSharp/NativeWebHost) v2 (the renamed continuation of OmniHost). The packages are published on [nuget.org](https://www.nuget.org/packages/NativeWebHost), so no private feed or credentials are needed. Building requires the .NET 10 SDK.

```bash
# Build the front-end assets first
npm ci
npm run build:desktop-web

# Linux (WebKitGTK) / macOS (WKWebView, experimental upstream)
dotnet publish ./desktop/EdtHmiStudio.Desktop.csproj -c Release -f net10.0

# Windows (WebView2)
dotnet publish ./desktop/EdtHmiStudio.Desktop.csproj -c Release -f net10.0-windows
```

The desktop shell enables NativeWebHost's VSCode-style built-in title bar by default, providing maximise, minimise and close buttons; the editor itself adds a VSCode-style menu bar (File / Edit / View / Help). The shell injects a `nativeWeb` JavaScript bridge (with `omni` kept as a legacy alias) that the front end uses to detect desktop mode.

`.github/workflows/desktop-packages.yml` builds and uploads an archive for Linux, Windows and macOS on every push to `main`. The macOS runtime (AppKit + WKWebView) is marked experimental upstream.

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
│   ├── Emulator/         # Compile the generated C and run it on real LVGL
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

1. **Font conversion**: the actual bitmap data is produced by the external `lv_font_conv` tool; the editor generates the template and the command.

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
