# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-07 🎉 Production Ready

### 🎨 Phase 1 — Foundation
- **Project setup**: Vite + React 19 + TypeScript
- **Base layout**: three columns — component panel, canvas, property editor
- **Component panel**: 16 LVGL widgets, grouped by category, with search filtering
- **Drag and drop**: built on @dnd-kit
- **Canvas**: zoom (0.1x–3x), pan, grid display
- **Selection**: single select, Ctrl multi-select, 8 resize handles
- **Property editor**: base properties, style properties, widget-specific properties
- **State management**: centralised in Zustand
- **Undo/redo**: 50 steps of history

### ✏️ Phase 2 — Advanced editing
- **Nesting**: widgets can be placed inside containers
- **Rubber-band selection**: drag a rectangle to select several widgets
- **Copy/paste**: full Ctrl+C / Ctrl+V support
- **Cut**: Ctrl+X
- **Select all**: Ctrl+A selects every widget on the current page
- **Duplicate**: Ctrl+D copies and pastes in one step
- **Context menu**: copy, paste, delete, z-order
- **Alignment toolbar**:
  - Align left, centre horizontally, align right
  - Align top, centre vertically, align bottom
  - Distribute horizontally, distribute vertically

### ⚡ Phase 3 — Event binding and multi-page
- **Event binding**:
  - Visual event editing UI
  - Every LVGL event type (clicked, pressed, value_changed, ...)
  - Built-in actions: navigate to page, set property, show/hide, set text or value
  - Custom C handlers, edited in Monaco
- **Multi-page**:
  - Create, delete and rename pages
  - Per-page background colour
  - Quick page switching

### 🔗 Phase 4 — Logic editor
- **React Flow integration**: node-based visual programming
- **Node types**:
  - 🟢 Trigger: event trigger, timer trigger
  - 🟡 Condition: If/Else, Switch, comparison, logical operators
  - 🔵 Action: set property, navigate, show/hide, set text, set value, call function, delay
  - 🟣 Data: read/write variables, arithmetic, string operations, get property
  - ⚫ Custom: a block of C
- **Connections**: execution flow (thick white) plus data flow (thin coloured)
- **Node editing**: double-click to edit parameters, with widget and property pickers
- **Variables**: global variable panel supporting int, float, string and bool
- **Debug mode**: simulated execution, single stepping, node highlighting
- **Graph management**: create, delete and switch between logic graphs

### 💻 Phase 5 — Code generation engine
- **Architecture**: modular generators, a template system and formatting helpers
- **Generated files**:
  - `ui.h` — header (widget and function declarations)
  - `ui.c` — UI initialisation (widget creation, styles, event binding)
  - `ui_events.h` — event handler declarations
  - `ui_events.c` — event handler implementations
  - `ui_logic.h` — logic function declarations (reserved)
  - `ui_logic.c` — logic function implementations (reserved)
- **Code preview panel**: Monaco Editor, file switching, live updates
- **Export**: copy a file, download a file, download everything

### 📱 Phase 6 — Live preview
- **Canvas simulation**: HTML5 Canvas approximating the appearance of LVGL widgets
- **Supported widgets**: button, label, slider, checkbox, switch, progress bar, arc, textarea, dropdown, image, panel
- **Zoom**: 50% – 200%
- **Hover interaction**: highlight on hover

### 📦 Phase 7 — Resource management
- **Images**: upload, preview and delete image resources
- **Fonts**: font resource management
- **Icons**: built-in icon picker
- **Projects**:
  - Save and load as JSON
  - Autosave (every 30 seconds)
  - Offer to restore on start

### 🎯 Phase 8 — Final polish
- **UI/UX**:
  - Main tab navigation (Design / Logic / Code / Preview)
  - Keyboard shortcut help panel (F1 / ?)
  - Toast notifications
  - A consistent visual style
- **Documentation**: README and CHANGELOG updated
- **Build verification**: TypeScript compiles without errors, production build succeeds

### Fixed
- Fixed the position calculation when dragging a widget
- Fixed undo/redo across multiple pages
- Fixed the coordinate calculation of rubber-band selection on a zoomed canvas

---

## [0.1.0] - 2026-02-07 (Initial Development)

### Added
- Project initialisation
- Base framework

---

## Statistics

- **Total files**: 67 source files (29 TSX + 38 TS)
- **Modules**: 17 UI component modules
- **LVGL widgets**: 16
- **Lines of code**: ~8000+

## Known limitations

1. Full conversion from the logic editor to C is not yet implemented
2. Image resources render as placeholders in the preview panel
3. Some advanced LVGL style properties are not yet supported
4. The animation editor is not yet implemented

## Roadmap

- [ ] Complete code generation from logic graphs
- [ ] Theme system
- [ ] Animation editor
- [ ] Support for more LVGL widgets
- [ ] Collaboration features
