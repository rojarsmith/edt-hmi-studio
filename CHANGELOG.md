# Changelog

<p align="center">
  <strong>English</strong> · <a href="./CHANGELOG.zh-TW.md">繁體中文</a>
</p>

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **A logic graph gets a Properties panel, and an Active switch that really switches** — the panel joins the right side above Variables, the same collapsible shape as the graph list, showing the open graph's settings. Its one everyday control is **Active**: a graph switched off is absent from generated code entirely — declaration, function, callbacks and registration alike — and the panel says so. Graphs are treated as global for now, so the per-screen activation drafted alongside (all screens by default, an explicit checklist otherwise) moved behind Factory Dev Mode: stored on the graph, surviving save and export, consumed by nothing until code generation learns to gate on screens
- **The editor says, before flashing, what the device cannot draw** — the canvas renders with the browser's fonts, which cover every script, so a label showing 中文 through the built-in Montserrat looked perfect in the editor and rendered as boxes on the panel; the first sight of the failure cost a flash cycle. The Property editor's Typography section now checks each language's text — including the words a language without a value falls back to — against the font that will draw it on the device. Only the built-in Montserrat can gap: its coverage is fixed when LVGL is compiled, while a converted font's character set is collected from this same text. The warning names the languages and the characters, and points at the exact fix — a language tab with a covering font on the governing typography, or binding a typography when there is none. The Typographies panel's usage count also stops undercounting: it counted only the widget's own field, so a typography doing all its work through the Texts table read "Used by 0 widgets" — "safe to ignore" exactly when it is not
- **A real ellipsis for labels — "Ellipsis (…)" joins Long Text Mode** — LVGL's DOTS mode writes three ASCII periods, hard-coded in `lv_label.c` (`LV_LABEL_DOT_NUM`, not even a config option), so the single U+2026 TouchGFX offers meant doing the truncation ourselves: CLIP mode plus a generated helper that measures with `lv_text_get_size` and keeps the longest prefix that fits with the ellipsis appended, cutting only at UTF-8 boundaries. An ellipsis label linked to a text resource deliberately carries no translation tag — the label's own tag handling would restore the full text over the truncation on every language switch — so the generated callback owns the text and re-resolves the tag itself, re-truncating on language change and on resize. U+2026 is collected into the label's font automatically, or the tidy ending would render as a missing-glyph box. The canvas previews it with the browser's own single-line ellipsis, same character. The old `dot` option is now honestly labelled "Dots (...)". Verified compiling clean for Cortex-M7 under `-Wall -Wextra -Werror`
- **Wildcards, and a fallback character that actually renders** — a Modbus string or a formatted number arrives at runtime, invisible to the walk that trims the character set, so a typography can now declare Wildcard Characters and Wildcard Ranges (each side of a range is a literal character or `0x` hex — `0-9` means the digits, since code points 0–9 would be nine control characters). Declared per language tab, as TouchGFX shapes it: each tab carries its own Wildcards and Fallback Character fields, a tab that declares nothing inherits the Default's declaration, and each language's declaration is converted into the font that language resolves to — so an Arabic tab's `٪` lands in the Arabic face, not in every face. Ranges travel as `--range` rather than being expanded, because a declared CJK block is tens of thousands of characters and Windows cuts command lines at 32k. The Fallback Character rides the same declaration: generated code appends a substitute font to LVGL's `lv_font_t.fallback` chain whose `get_glyph_dsc` answers every letter with the declared character, sharing the source font's tables so it renders in the right face and size; a language declaring its own character gets its own substitute, switched with the language, and a tab that only adds wildcards generates no runtime switching at all — its whole effect is settled at conversion time — verified compiling clean for Cortex-M7 under `-Wall -Wextra -Werror`. Label and Button preview the full resolved typography on the canvas — spacing, alignment, decoration, per language — and their widget-level Text Alignment row hides while a typography governs them, since an object-local style would silently beat the shared one
- **Font glyph bitmaps are linked into external flash on the STM32H747I-DISCO** — a converted CJK subset is the largest thing this firmware links and 1 MB of internal flash has nowhere to put it beside the code. Each converted font redefines `LV_ATTRIBUTE_LARGE_CONST`, LVGL's own hook on that array, into a `.ext_flash_fonts` section the linker script places in the QSPI NOR; the descriptors, cmaps and `lv_font_t` stay in internal flash, since they are small and are read on every glyph lookup. Guarded on `HMI_FONTS_IN_EXTERNAL_FLASH`, which only a board with somewhere to put them defines, so the same converted file still serves the WASM preview and boards without external flash. Verified with the ARM toolchain: one 14px Noto Sans TC subset splits `.ext_flash_fonts` 0x148 / `.rodata` 0xcc, and the same file without the define is `.rodata` 0x214
- **Noto Sans SC ships with the editor too**, and all four Noto faces now sit under *Built-in* in the Typographies font dropdown — one heading, in the same place whether or not the project has added a font, with *Project fonts* left to mean what the author uploaded. The previous split showed the same font under two headings depending on whether it had been used yet, which is the editor's bookkeeping rather than anything the author chose. Montserrat is grouped with them while remaining a different kind of thing: compiled into LVGL, no conversion, only the sizes `lv_conf.h` switches on
- **Noto Sans TC ships with the editor** — Traditional Chinese is the primary market for these boards and was the one script with no bundled font, so switching a project to 繁體 rendered a row of tofu and the font dropdown had nothing in it that could fix that. `NotoSansTC-Regular.otf`, OFL-1.1, from the same `notofonts/noto-cjk` `Sans/SubsetOTF` build the bundled JP and KR fonts came from. It reaches Flash through the same auto charset trimming, so a UI's worth of Chinese costs tens of kilobytes rather than the 5.4 MB of the full face
- **A widget picks its text by key, from a dropdown** — the Property editor gains a Key field listing every row of the text table, so binding a widget is a selection rather than retyping its literal until it happens to match an existing row. Choosing a key refreshes the widget's literal to the words it now shows, which is what unlink and delete fall back to
- **A text resource can name the Typography its widgets render with** — a Typography column in the Texts tab, TouchGFX's TypedText → Typography pairing. Set there it wins over the widget's own assignment, so words needing a particular face carry it everywhere they appear rather than everywhere someone remembered. The canvas, the Property editor and `ui.c` all resolve through one shared rule, so the preview is the generated code
- **"Switch Language" as a built-in event action** — a button on the running UI can now change the language, which until now took hand-written C in a custom handler. Either a named language (`lv_translation_set_language("zh-TW")`) or "next language", which cycles through the project's languages and wraps; the cycling helper is emitted into `ui_events.c` once, whatever the number of buttons using it. Nothing else is generated because nothing else is needed — labels re-read their own text, and `ui.c` already registers callbacks for the widgets that do not. Two cases deliberately generate nothing rather than something that half-works: a language code the project no longer has, and cycling with a single language. See [docs/language-switching.md](docs/language-switching.md), which also sets out what the canvas 🌐 preview, Build & Run and hardware each do and do not cover
- **Board support for the EDT EVK043027B** — STM32U599NJH6Q, 480×272 RGB888 panel driven straight from the LTDC, maXTouch MXT336U, and image resources in the MX25LM51245G OctoSPI NOR at `0x90000000`. Complete firmware template under `firmware/edt-evk043027b/`, including the vendored EDT panel and touch drivers. See [docs/edt-evk043027b.md](docs/edt-evk043027b.md)
- **Target identification for boards flashed by a standalone probe** — an ST-LINK/V2 on a flying lead reports no board name, so `probeBoardPattern` may now be `null`; the flasher connects without writing and checks the reported device ID against the board definition instead
- **Per-board external flash configuration** — the external loader name and base address moved from constants in `server/hmi/service.ts` onto the board definition, so each board names its own part. A board with `externalFlash: null` skips the external programming step

### Changed
- **The Event Trigger's Event Object output moves behind Factory Dev Mode** — generated code discards the event (`(void)e;`), so in normal mode the port only promised what the device cannot deliver; one already wired stays visible in both modes so a connection is never stranded. The deeper finding is recorded in [docs/logic-event-trigger.md](docs/logic-event-trigger.md): an event graph generates code nothing registers, because the editor cannot yet say which component fires the trigger — a Target Component selector on the node's dialog was tried and deliberately taken out again while that design question stays open
- **Logic graphs get a manager panel below the node palette** — the graph selector was a dropdown floating over the canvas with a trash button beside it: in the way, and barely a manager. A collapsible Logic Graphs panel now sits under the Nodes palette — search, create, delete and click-to-open, with the open graph highlighted and a VS Code-style twisty leading the header row. The boundary with the palette drags to resize, and both sides keep a working minimum. Deleting confirms by name. Creating rejects a name another graph already carries and reopens the prompt with the rejected name, since two same-named graphs are indistinguishable in a list; the suggested default keeps skipping past taken names as before
- **The Icon tab moves behind Factory Dev Mode** — the library browses, searches and copies SVG, and all of that works, but nothing a no-code author can do with what it copies reaches the panel: the studio consumes no SVG, and the page has no insert step. A tab that leads nowhere is worse than no tab, so it joins Code as factory-dev-only until it grows a real pipeline. What *was* verified to reach hardware today — LVGL's built-in `LV_SYMBOL_*` glyphs pasted into a label's text (byte-verified through codegen), and Copy SVG → saved file → Image upload (rasterised to a correct ARGB8888 array) — is recorded with recipes and a symbol table in [docs/icon-library.md](docs/icon-library.md), alongside the agreed redesign direction
- **The Texts tab takes the tree-and-detail shape too, and Key is now Id** — TouchGFX's Groups pane: on the left a tree of groups (two levels, drag rows onto them) and text rows, synced with the table on the right — picking a group scopes the table to it, subgroups included; picking a row selects and scrolls to it in the table; ＋ New Text files into whatever group is in view. The Id column header sorts, ascending and descending, case-insensitively. The column is labelled Id rather than Key — and so is the widget binding dropdown in the Property editor — because it is the identifier generated code matches on, the same thing the Typographies tab's Id is. Adding a language moved from two loose toolbar inputs to a ＋ at the end of the column headers, where the columns are. Groups persist with the project and survive export/import
- **Font Properties splits what the author needs from what the factory needs** — in normal mode a selected font shows its metadata, its name, its rendered preview, and the warnings that matter to everyone: glyphs the file cannot draw, and places using custom C the character scan cannot see. The conversion machinery — C variable name, the Auto/Preset/Manual character-set modes, extra characters and ranges, coverage total, BPP and the generate buttons — sits behind Factory Dev Mode under a labelled divider, with Auto simply doing its job unattended. The panel also stops double-scrolling: the old inner 500px grey box is gone and the pane itself scrolls
- **The Fonts tab takes the Typographies shape: a tree on the left, properties on the right** — three fixed groups, collapsible: *Built-in* (Montserrat, compiled into LVGL — selecting it explains why there is nothing to convert or delete), *Bundled* (all four Noto faces, whether added or not; an unadded one is a row with **+ Add** and stays in this group once added instead of moving elsewhere), and *Project fonts* (what the author uploaded). Search, upload and delete live on the tree; the search filters every group. The Typographies font dropdown mirrors the same three groups, so both surfaces say "Built-in" and mean the same thing — compiled into LVGL — rather than one meaning that and the other meaning "ships with the studio". And bundled fonts are now default-present: every project gains all four Noto faces on open, with no + Add and no delete, because an unused font costs nothing — it is neither declared, converted, nor saved by payload — and a deleted one would only have reappeared on the next open. The + Add affordance survives solely as the degraded state for a payload that failed to load The old layout was a banner of unadded bundled fonts above a card grid of everything else, which was the same moving-target problem the Typographies font dropdown had
- **The Typographies tab is a tree, and each typography has a Default plus a tab per customised language** — TouchGFX's shape, and a fix for two things at once. A project with thirty sizes was a flat list nobody could scan, so typographies now live in groups, nested up to two levels and reordered by dragging, exactly as screens already are. And *Base font* is gone: a typography's own settings **are** its Default, a language tab stores only what it changes, and everything it does not name keeps coming from the Default — so giving 繁體 a CJK face is one field rather than a restatement of the style, and editing the Default still reaches every language that did not override it. Language tabs are added, not grown: only Default exists until the author picks a language from the ＋ menu, and every tab carries an × that closes it — the language then follows Default again, after a confirmation when the tab actually held settings and silently when it was empty. (TouchGFX hides the same removal behind a right-click; an × on the tab is the same act, visible.) A just-added tab is stored as an empty entry, so it survives a reload while generating nothing until it differs. A language may now override spacing, alignment, decoration and direction as well as the face, and generated code re-applies exactly those on a language switch, restoring the Default on the way out. Name is labelled Id, since it is what the generated style is named after rather than a description. Deliberately not offered: Fallback Characters, Ellipsis Character and the Bitmap/Vector switch — see [docs/text-typography-evaluation.md](docs/text-typography-evaluation.md) §7.1–7.3 for what LVGL can and cannot do there; a `fallbackCharacter` field is stored against the day wildcards make it meaningful
- **The Deploy tab's placement panel reads assets as ranges** — renamed from *Image Placement* to *Asset Placement*, listing converted fonts beside images and giving each one a start and an end address rather than an address and a size. The question it answers is whether an asset begins and ends inside the QSPI window, and two ends answer it directly; a range that starts in one region and ends in another now says so instead of reporting only where it began. A font row also carries its glyph count and the average bytes per glyph, counted from `glyph_dsc[]` in the file that was compiled — a size alone cannot say whether a font is large because it covers a lot or because each glyph is expensive
- **Font and size are two fields in the Typographies tab, not one dropdown** — pairing them made a single list carry both choices, so picking 24px meant scrolling past every font, and one font at two sizes read as two fonts. Font now lists families (Montserrat once, not 21 times) and Size is typed. The built-in only ships certain sizes, so it snaps to the nearest and says so
- **Bundled fonts are selectable straight from the Typographies font list** — Noto Sans JP and KR appear under "Bundled — added on selection" whether or not the project has added them, and choosing one adds it. Needing CJK coverage was a detour through the Fonts tab and back
- **No per-widget font control** — the Property editor sets a Typography and nothing else. A face and a size set on one widget were invisible to every other widget that ought to match it, and only a typography can carry a per-language font. "＋ New typography from this widget" still seeds one from whatever a widget already carries, which is how an older project moves across; existing per-widget settings keep generating as they did
- **Text keys are unique case-insensitively** — `newText` and `newtext` were two rows, and since auto-derived keys are lowercased, linking a widget showing "newText" created the second one right beside a hand-written first. One translated, one not, indistinguishable in the table. The rename now refuses it and says which key it collides with; auto-derived keys skip past a case-different one
- **EVK043027B runs 32-bit colour** — ARGB8888 rather than the packed RGB888 the vendor's TouchGFX demo uses, because this is an LVGL product. `LV_COLOR_DEPTH 32`, an ARGB8888 LTDC layer, `LV_COLOR_FORMAT_ARGB8888`, and a `FRAMEBUFFER` linker region grown from 768 KB to 1024 KB to hold two 510 KB buffers. All four have to agree; the linker script is the one that fails silently, by overlapping `.bss` instead of refusing to build

### Added
- **The EVK043027B verifies its own LTDC** — `HAL_LTDC_Init` and `HAL_LTDC_ConfigLayer` write registers and return `HAL_OK` without reading anything back, so with the bus clock off every write is discarded and both still report success. `HAL_LTDC_MspInit` is a `void` callback and could not report a failed PLL3 at all. `ltdc_clock_ready` now carries that result out, `ltdc_is_configured` re-reads `GCR`/`TWCR`/`CR`/`CFBAR`, and `ltdc_is_scanning` watches `CPSR` to prove the **pixel** clock is running — a separate clock from the bus clock, and invisible to every other check
- **Bring-up test pattern on the EVK043027B, off by default** — colour bars written straight into the frame buffer, bypassing LVGL, plus a backlight ramp. Splits "the display path is dead" from "LVGL is not drawing", and a backlit-but-black panel from an unlit one. Enable with `-DHMI_DISPLAY_BRINGUP_PATTERN_MS=10000`; a normal build boots straight into the UI
- **Status LED on the EVK043027B** — a steady 1 Hz heartbeat from the main loop, and in `board_error_handler` a repeating burst of `board_init_stage` + 1 flashes. It is the only output independent of the panel, its backlight and the switched supply rail, so it separates "firmware not running" from "firmware running, display misconfigured" without a debugger. See [docs/edt-evk043027b.md](docs/edt-evk043027b.md) §7

### Fixed
- **Choosing a Montserrat size the firmware does not compile in broke the build** — the Typographies tab offered all 21 sizes LVGL ships, but every target's `lv_conf.h` switches on only 12, 14, 16, 20, 24, 28 and 32. Picking any other generated a reference to a symbol that does not exist, failing with `'lv_font_montserrat_22' undeclared` about 540 files into a full LVGL compile. The offered set now comes from one constant, sizes snap onto it (ties round up), and a project already carrying an unbuildable size is snapped when opened. A test reads all four `lv_conf.h` files and fails if they and the constant ever disagree — they are not generated from one another, as [docs/lvgl-configuration.md](docs/lvgl-configuration.md) notes. `wasm/lv_conf.h` gains Montserrat 12 so the WASM preview and the boards offer the same set
- **Two logic graphs with the same name broke the firmware build** — both generated a function of the same name, and the duplicate only surfaced as `error: redefinition of 'logic_new_logic_graph'` at the end of a full LVGL compile. Accepting the "New Logic Graph" default twice was enough to reach it. The generator now assigns each graph a unique C name — the first keeps the plain one, later collisions take a numeric suffix — and `ui_logic.h` and `ui_logic.c` derive them from one shared function so a declaration cannot disagree with its definition. The editor also stops suggesting a name that is already taken
- **Every navigate event was listed as "Navigate to: Not set"** — the event panel read `targetPage`, the pre-rename spelling, while the editor has written `targetScreen` since the rename. Generated code was always correct; only the one-line summary in the list was wrong. Both spellings now display, so a project saved before the rename still reads properly
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
