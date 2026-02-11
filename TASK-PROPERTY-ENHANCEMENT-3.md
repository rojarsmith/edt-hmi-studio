# LVGL Editor Enhancement — Round Three

## Project path
`/home/xcssa/.openclaw/workspace/projects/lvgl-editor`

## Batch D: canvas rendering bugs and property editor UI cleanup

### D.1 Canvas rendering bug
Problem: buttons and similar widgets come out transparent or invisible when dragged onto the canvas.

Where to look:
1. In CanvasComponent.tsx, `componentStyle`'s `backgroundColor` may be overwritten with undefined by the `background` (gradient) field
2. Some widgets may have a defaultStyles.bgColor of 'transparent' or an empty value
3. CSS may be overriding it

Fix: make sure every widget renders correctly on the canvas. Check each widget type's rendering one by one.

### D.2 Property editor — filter the common properties by widget type
The problem today: every common property (alignment, flags, shadow, transform, gradient, outline and so on) is shown for every widget, but some of them are meaningless for some widgets.

This needs a property visibility map:
```typescript
const PROPERTY_VISIBILITY: Record<string, {
  showAlign?: boolean;
  showFlags?: boolean;
  showShadow?: boolean;
  showTransform?: boolean;
  showGradient?: boolean;
  showOutline?: boolean;
  showScrollbar?: boolean;
  showTextStyle?: boolean;
  showBlendMode?: boolean;
}> = {
  btn: { showAlign: true, showFlags: true, showShadow: true, showTransform: true, showGradient: true, showOutline: true, showTextStyle: true, showBlendMode: true },
  label: { showAlign: true, showFlags: true, showTransform: true, showTextStyle: true },
  img: { showAlign: true, showFlags: true, showTransform: true, showBlendMode: true },
  line: { showAlign: true, showFlags: true, showTransform: true },
  // ... and so on, configured sensibly per widget type
};
```

When rendering the common sections in PropertyEditor, use the current widget type to decide whether each section is shown.

### D.3 Improve the dropdown options editor
It currently uses a textarea with one option per line. Replace it with a list editor:
- One row per option, numbered
- Each row has a text input plus move-up/move-down buttons and a delete button
- An "Add option" button at the bottom
- Reordering by drag (the up/down buttons are a good enough first implementation)

### D.4 Property editing UI for the other widgets
Go through every widget and make sure its property editing UI is sensible:
- The checkbox "checked" state should use a toggle switch rather than a checkbox (more legible)
- The same for the switch "on" state
- A textarea with a "max length" of 0 should show "unlimited"
- Changing min or max on a bar or slider should clamp the value automatically

---

## Batch E: LVGL WASM compile preview

This is the largest piece of work. The goal: compile and run the user's design in the browser using the real LVGL library.

### Technical options

LVGL officially supports being compiled to WASM with Emscripten and run in a browser. The options:

1. **Pre-compile LVGL as a WASM library** (done offline; no C compilation in the browser)
   - Use Emscripten to compile the LVGL core plus the SDL2 display driver into .wasm + .js
   - Expose an `init_ui(const char* code)` entry point
   - The user's UI code is invoked through eval or through predefined widget-creation functions

2. **A better option: LVGL MicroPython, or a LVGL JS binding**
   - But this moves away from the goal of generating C

3. **The most practical option: a pre-compiled LVGL WASM runtime plus dynamically loaded user C**
   - Pre-compile one LVGL WASM module containing the whole LVGL API
   - Execute the user's generated C through an interpreter or a command sequence
   - Convert the C into a series of LVGL API calls as JSON commands, parsed and executed on the WASM side

4. **The simplest workable option (recommended):**
   - Clone the LVGL source
   - Pre-compile LVGL plus the SDL2 backend to WASM with Emscripten
   - Convert the C the editor generates into a "UI description JSON"
   - Give the WASM side a generic `create_ui_from_json()` that parses the JSON and calls the LVGL API
   - This avoids compiling C in the browser entirely

### Implementation steps

#### E.1 Build the LVGL WASM runtime
- Clone lvgl/lvgl into `tools/lvgl/`
- Write the Emscripten build script
- Write the C-side JSON UI parser (`ui_from_json.c`)
- Produce `lvgl_runtime.wasm` plus `lvgl_runtime.js`
- Put the build output in `public/wasm/`

#### E.2 The JSON UI description format
Define a JSON format describing an LVGL UI:
```json
{
  "screen": {
    "width": 480,
    "height": 320,
    "bgColor": "#ffffff"
  },
  "components": [
    {
      "type": "btn",
      "id": "btn1",
      "parent": "screen",
      "x": 10, "y": 10,
      "width": 100, "height": 40,
      "props": { "text": "Hello" },
      "styles": {
        "default": { "bgColor": "#2196F3", ... },
        "pressed": { ... }
      }
    }
  ]
}
```

#### E.3 Editor integration
- Add a `src/components/WasmPreview/` component
- Load the WASM module
- Convert the editor state into the JSON UI description
- Hand it to the WASM runtime to render
- Show the result in an iframe or a canvas
- Add it as a tab in App.tsx, or replace the existing Preview tab

#### E.4 Compiling C for real (optional extension)
If actually compiling C turns out to be necessary:
- Use the WASM build of Emscripten (far too large; not recommended)
- Or compile on a server (needs a backend)
- Or use the WASM build of TCC (Tiny C Compiler)
- Recommendation: implement the JSON approach first and treat C compilation as a later addition

---

## Constraints
- All UI text in Chinese
- No unnecessary new npm dependencies (WASM build tooling excepted)
- Follow the existing code style
- Build the WASM with Emscripten (emsdk needs to be installed)
