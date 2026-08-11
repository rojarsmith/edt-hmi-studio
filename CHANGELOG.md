# Changelog

<p align="center">
  <strong>English</strong> · <a href="./CHANGELOG.zh-TW.md">繁體中文</a>
</p>

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Board support for the EDT EVK043027B** — STM32U599NJH6Q, 480×272 RGB888 panel driven straight from the LTDC, maXTouch MXT336U, and image resources in the MX25LM51245G OctoSPI NOR at `0x90000000`. Complete firmware template under `firmware/edt-evk043027b/`, including the vendored EDT panel and touch drivers. See [docs/edt-evk043027b.md](docs/edt-evk043027b.md)
- **Target identification for boards flashed by a standalone probe** — an ST-LINK/V2 on a flying lead reports no board name, so `probeBoardPattern` may now be `null`; the flasher connects without writing and checks the reported device ID against the board definition instead
- **Per-board external flash configuration** — the external loader name and base address moved from constants in `server/hmi/service.ts` onto the board definition, so each board names its own part. A board with `externalFlash: null` skips the external programming step

### Changed
- **EVK043027B runs 32-bit colour** — ARGB8888 rather than the packed RGB888 the vendor's TouchGFX demo uses, because this is an LVGL product. `LV_COLOR_DEPTH 32`, an ARGB8888 LTDC layer, `LV_COLOR_FORMAT_ARGB8888`, and a `FRAMEBUFFER` linker region grown from 768 KB to 1024 KB to hold two 510 KB buffers. All four have to agree; the linker script is the one that fails silently, by overlapping `.bss` instead of refusing to build

### Added
- **The EVK043027B verifies its own LTDC** — `HAL_LTDC_Init` and `HAL_LTDC_ConfigLayer` write registers and return `HAL_OK` without reading anything back, so with the bus clock off every write is discarded and both still report success. `HAL_LTDC_MspInit` is a `void` callback and could not report a failed PLL3 at all. `ltdc_clock_ready` now carries that result out, `ltdc_is_configured` re-reads `GCR`/`TWCR`/`CR`/`CFBAR`, and `ltdc_is_scanning` watches `CPSR` to prove the **pixel** clock is running — a separate clock from the bus clock, and invisible to every other check
- **Bring-up test pattern on the EVK043027B** — colour bars written straight into the frame buffer, bypassing LVGL, plus a backlight ramp, held for 2 s at start-up. Splits "the display path is dead" from "LVGL is not drawing", and a backlit-but-black panel from an unlit one. Disable with `-DHMI_DISPLAY_BRINGUP_PATTERN_MS=0`
- **Status LED on the EVK043027B** — a steady 1 Hz heartbeat from the main loop, and in `board_error_handler` a repeating burst of `board_init_stage` + 1 flashes. It is the only output independent of the panel, its backlight and the switched supply rail, so it separates "firmware not running" from "firmware running, display misconfigured" without a debugger. See [docs/edt-evk043027b.md](docs/edt-evk043027b.md) §7

### Fixed
- **EVK043027B never got past the first line of `board_init`** — the PWR peripheral is clock gated on the STM32U5 (`RCC_AHB3ENR_PWREN`), so with its clock off `HAL_PWREx_ConfigSupply` polled a register that reads as zero and returned `HAL_TIMEOUT`. `HAL_Init` calls `HAL_MspInit` to supply that clock and the HAL's own is weak and empty; the vendor package has it in `stm32u5xx_hal_msp.c`, which this template had not ported. The clock tree, OctoSPI, LTDC and display were all never reached, and the only symptom was a dark panel
- **EVK043027B main loop stalled for seconds at a time** — the vendored maXTouch driver reads with 1000 ms I²C timeouts on both transmit and receive, and LVGL polls the input device every ~30 ms, so an absent or unresponsive touch controller blocked the whole HMI loop rather than merely degrading touch. `board_display_init` now probes the controller once with a 50 ms `HAL_I2C_IsDeviceReady` and registers no LVGL input device at all when it does not answer, recording the result in `board_touch_ready`
- **EVK043027B touch controller was never actually reset** — `CTP_RST` (PH6) was parked high, so on a warm reset the part was never taken through a reset at all. It is now pulsed low and released with the datasheet start-up delay
- **EVK043027B fault blink code was unreadable** — the spin-loop constant ran roughly eight times too fast, turning a twelve-flash stage code into a flicker
- **EVK043027B flashing failed at "Error: failed to erase memory"** — the board no longer links image resources into external flash, so nothing depends on an external loader. It was copied from the STM32H747I-DISCO template, where 1 MB of internal flash forces it; this board has 2 MB against ~285 KB of firmware and 383 KB for a full-screen 480×272 background, so images fit alongside the code with room to spare. The NOR is still fitted and still mapped at `0x90000000` for a project that outgrows internal flash — see [docs/edt-evk043027b.md](docs/edt-evk043027b.md) §4, which records why ST's `MX25LM51245G_STM32U599J-DK.stldr` cannot currently erase it
- **EVK043027B panel stayed dark after flashing** — `backlight_init` never called `HAL_TIM_MspPostInit`, so PE5 was never switched to AF2/TIM3_CH3 and the backlight driver received no PWM. `HAL_TIM_MspPostInit` is a CubeMX convention rather than a HAL callback, and the HAL declares no prototype for it, so the definition linked out as dead code while every HAL call still reported success
- **`FS_PW_SW` (PI15) left unasserted** — the vendor's own init drives this switched supply rail high before touching the panel; `panel_power_init` now does the same

### Changed
- **Start-up failures on the EVK043027B are now diagnosable** — `board_init` records its progress in `board_init_stage`, and a failure to bring up the OctoSPI NOR is no longer fatal: it sets `board_external_flash_ready` false and lets a project that uses no images run instead of blanking the panel with no explanation
- **Modbus RTU can now run over RS-485** — the EVK043027B drives USART2 through a transceiver with hardware driver-enable on PD4, rather than a UART wired to an ST-LINK virtual COM port. A PC needs a USB-to-RS-485 adapter to reach it; the Communication tab and the test server are otherwise unchanged

## [1.1.0] - 2026-02-11

### Added
- **Hierarchy panel wired into the design view** — HierarchyPanel mounted in the left panel, sharing it with the component panel; tree browsing, drag to reorder, rename, lock and visibility toggles
- **Style state editing** — PropertyEditor gains default / pressed / focused / disabled state switching, with independent overrides and a clear action; a blue dot marks a state that has been overridden
- **Complete widget rendering in the preview panel** — dedicated canvas rendering for 9 more widgets: line, spinner, chart (line and bar), table, calendar, tabview, tileview, window and obj (container)
- **visible/locked feedback on the canvas** — hidden widgets render semi-transparent with a dashed border; locked widgets cannot be dragged or resized and their handles are hidden
- **Animation editor** — Animation type definitions, the AnimationPanel UI (add, edit, delete), the AnimationEditDialog, and code generation of `lv_anim_t` initialisation with easing mapping
- **Theme system** — Theme types, themeStore (light/dark presets), the ThemeSelector toolbar control, and generation of `lv_theme_default_init()`
- **Image resources wired through** — PropertyEditor image picker with thumbnails, the actual image shown on the canvas, generated code referencing the C array name, and the ZIP export including the image C array files
- **Font conversion completed** — real parsing of the TTF/OTF name table, in-browser font preview, BPP selector, `lv_font_conv` command generation, header and source template generation, and `LV_FONT_DECLARE` for custom fonts in generated code
- **Animation playback in the preview panel** — requestAnimationFrame-based simulation (fade/slide/zoom with easing) and play, pause and reset controls
- **Page switching in the preview panel** — a page tab bar along the bottom, click to switch the previewed page, and navigation from a widget's navigate event

### Fixed
- **Logic code generation rewritten** — if/else and switch now generate complete branch bodies recursively; the init function registers event callbacks and timers; set_value picks the correct API for the widget type; timers generate a real `lv_timer_create` callback
- **focused/disabled states completed in code generation** — ui.c now emits `LV_STATE_FOCUSED` and `LV_STATE_DISABLED` style code
- **logicGraphs passed to CodePreview/CodePanel** — the code preview and the export now correctly include the code generated from the logic graphs

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
