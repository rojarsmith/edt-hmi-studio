# Font Integration Design

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/font-integration.md">繁體中文</a>
</p>

## 1. Overall architecture

The editor's font system supports both LVGL's built-in fonts and custom fonts uploaded by the user (TTF/OTF). Font size is chosen per widget, on demand; at build time every font+size combination actually in use is collected and converted into LVGL C source with `lv_font_conv`.

```
User uploads a font (TTF/OTF)
       │
       ▼
  ResourceStore (front-end state)
  ├── Parse the font metadata (family, style)
  ├── Store the base64 data
  └── Derive a cFontName (e.g. ui_font_noto)
       │
       ▼
  Project settings
  ├── Choose the default font (built-in or custom)
  └── If the default is a custom font, choose the default size
       │
       ▼
  Widget property panel
  ├── Choose the font (default / built-in / custom)
  ├── Built-in font: size is fixed (it is part of the name, e.g. montserrat_14)
  └── Custom font: size selectable from 8-48px
       │
       ▼
  Code generation (codegen)
  ├── Scan every widget and collect the font+size combinations in use
  ├── ui.h: LV_FONT_DECLARE(ui_font_noto_16)
  ├── ui.c: set the default font on every screen
  └── ui.c: emit a font setting only for widgets that differ from the default
       │
       ▼
  Compile preview (Emulator)
  ├── Collect every custom font+size combination in use
  ├── Build a FontCompileRequest (base64 plus conversion parameters)
  └── POST /api/emulator/build (files + fonts)
       │
       ▼
  Server (vite-plugin-compile)
  ├── Decode the base64 into a temporary .ttf/.otf file
  ├── Run lv_font_conv once per size to produce a .c file
  └── Compile them with the UI code through emcc → WASM
```

## 2. Font types

### 2.1 Built-in fonts

LVGL's built-in Montserrat family, whose size is fixed in the name:

- `montserrat_8` through `montserrat_48` (even sizes)
- Default font: `montserrat_14`
- When a built-in font is selected the size **cannot be set separately** — the name determines it

### 2.2 Custom fonts

TTF/OTF files uploaded by the user:

- Uploading only requires a name, a C variable name, a charset and a BPP
- **No size is chosen at upload time** — sizes are picked per widget in the property panel
- Every required size is generated at build time from actual usage

## 3. The default font

### 3.1 Project settings

Configured in `ProjectSettings`:

- **Default font**: a built-in font, or one of the uploaded custom fonts
- **Default font size**: shown only when the default font is a custom one; 8-48px

The configuration is stored in `ProjectConfig.lvglConfig`:

```typescript
interface LvglConfig {
  defaultFont: string;        // e.g. "montserrat_14" or "ui_font_noto"
  defaultFontSize?: number;   // only needed for a custom font, e.g. 16
  // ...
}
```

### 3.2 Inheritance rules

- Each screen (page) sets the default font when it is initialised
- Widgets inherit the font setting of the screen they are on
- Only a widget whose font or size differs from the default gets its own font code

## 4. Choosing a font per widget

### 4.1 Property panel behaviour

`ComponentFontSelector` offers three choices:

| Choice | Size picker | Behaviour |
|------|--------------|------|
| **Default** | Shown when the default is a custom font, hidden when it is built-in | Inherits the project default font; a different size may still be chosen |
| **Built-in font** | Hidden | Uses the named built-in font (size fixed) |
| **Custom font** | Shown (8-48px) | Uses the named custom font at the chosen size |

### 4.2 Code generation decision

For each widget, the generator decides as follows:

```
Widget has no font set (fontResource empty)
  → emit nothing (inherits the default)

Widget font == default font, and size == default size
  → emit nothing (inherits the default)

Widget font == default font, but size != default size
  → emit lv_obj_set_style_text_font (same font, different size)

Widget font != default font
  → emit lv_obj_set_style_text_font (different font)
```

## 5. End-to-end flow

### 5.1 Font upload

The user uploads a TTF/OTF file through the resource panel, and the front end:

1. `fontFileToBase64()` converts the file into a base64 data URI
2. `parseFontMetadata()` parses the font's name table and extracts the family and style
3. Derives a `cFontName` (format: `ui_font_<sanitized_name>`)
4. Stores it in the `ResourceStore.fonts` array

### 5.2 Code generation

When `generateCode()` runs:

1. **Collect usage**: `collectUsedCustomFonts()` walks every widget on every page and collects the custom font+size combinations actually used
2. **ui.h**: emit `LV_FONT_DECLARE(cFontName_size)` for each combination
3. **ui.c screen init**: each screen sets the project default font
4. **ui.c widgets**: emit `lv_obj_set_style_text_font` only where the font or size differs from the default

### 5.3 Compile preview

`Emulator.handleCompile()`:

1. `collectUsedCustomFontSizes()` collects every custom font+size combination the widgets actually use
2. Calls `generateCode()` to produce the C sources
3. Converts the font resources into `FontCompileRequest[]`, with `sizes` set to the collected sizes
4. Calls `compileCode(userFiles, width, height, onStatus, fontRequests)`

### 5.4 Server-side font conversion

The `/api/emulator/build` endpoint in `vite-plugin-emulator.ts`:

1. Receives the `fonts` array
2. For each font:
   - Decodes the base64 and writes a temporary file
   - Runs `lv_font_conv` once per size to produce a `.c` file
   - Reads back the generated C source
3. Adds the font `.c` files to the emcc source list

### 5.5 Compile output

emcc compiles every `.c` file (UI code plus the font C arrays) into `output.js` and `output.wasm`, which run in the browser.

## 6. Canvas preview

Widget previews on the design canvas also reflect the default font size:

- `appStore.defaultFontSize` holds the current project's default font size
- `CanvasComponent` reads it as the default size for text widgets (btn, label, checkbox, ...)
- A widget that sets its own `fontSize` uses that value instead

## 7. Key files

| File | Responsibility |
|------|------|
| `src/store/projectStore.ts` | The `LvglConfig` type (including `defaultFont` and `defaultFontSize`) |
| `src/store/appStore.ts` | The `defaultFontSize` state and the `parseFontSize()` helper |
| `src/resources/types.ts` | The `FontResource` type |
| `src/resources/converters/fontConverter.ts` | Font metadata parsing, charset range calculation, `lv_font_conv` command generation |
| `src/components/ProjectSettings/ProjectSettings.tsx` | Project settings UI (default font and default size) |
| `src/components/PropertyEditor/PropertyEditor.tsx` | Per-widget font selector (`ComponentFontSelector`) |
| `src/components/Canvas/CanvasComponent.tsx` | Canvas widget preview (reads `defaultFontSize`) |
| `src/codegen/templates/ui.h.ts` | Emits the `LV_FONT_DECLARE` declarations (only for combinations in use) |
| `src/codegen/templates/ui.c.ts` | Per-widget font code, including the inheritance decision |
| `src/codegen/generator.ts` | Generation entry point; passes `defaultFont` and `defaultFontSize` through |
| `src/components/Emulator/Emulator.tsx` | The Emulator panel; collects the sizes and builds the font requests |
| `src/components/Emulator/emulatorService.ts` | The Emulator's client half; sends the font data |
| `vite-plugin-emulator.ts` | The Emulator's dev-server half; runs `lv_font_conv` and compiles |

## 8. Using lv_font_conv

### Install

```bash
npm install -g lv_font_conv
```

### Command format

```bash
lv_font_conv \
  --font <input.ttf> \
  --size=<N> \
  --bpp=<1|2|4|8> \
  --range=<start>-<end> \
  --format=lvgl \
  --output=<name>.c \
  --no-compress
```

### Example

```bash
lv_font_conv \
  --font NotoSansSC-Regular.ttf \
  --size=16 \
  --bpp=4 \
  --range=0x20-0x7e \
  --format=lvgl \
  --output=ui_font_noto_16.c \
  --no-compress
```

The generated `.c` file contains a global `lv_font_t ui_font_noto_16`, named after the output file without the `.c`.

## 9. Font variable naming

| Level | Format | Example |
|------|------|------|
| cFontName | `ui_font_<name>` | `ui_font_noto` |
| Variable with size | `<cFontName>_<size>` | `ui_font_noto_16` |
| ui.h declaration | `LV_FONT_DECLARE(<var>)` | `LV_FONT_DECLARE(ui_font_noto_16)` |
| ui.c reference | `&<var>` | `&ui_font_noto_16` |
| lv_font_conv output | `--output=<var>.c` | `--output=ui_font_noto_16.c` |

`LV_FONT_DECLARE(x)` expands to `extern const lv_font_t x;`, matching the global that `lv_font_conv` generates.

## 10. Supported charsets and options

### Charset presets

| ID | Name | Unicode range |
|----|------|-------------|
| `ascii` | ASCII | 0x20-0x7E |
| `latin` | Latin Extended | 0x20-0x7E, 0xA0-0x24F |
| `cjk-basic` | CJK basic | 0x20-0x7E, 0x4E00-0x9FFF |
| `custom` | Custom | A user-supplied list of characters |

### BPP (anti-aliasing bit depth)

- **1 bpp**: no anti-aliasing, smallest size
- **2 bpp**: 4 grey levels
- **4 bpp**: 16 grey levels (recommended)
- **8 bpp**: 256 grey levels, best quality

### Options

- `charset: CharsetType` — charset type
- `customChars?: string` — the character list, when the charset is custom
- `bpp: 1 | 2 | 4 | 8` — anti-aliasing bit depth
- `compress: boolean` — whether to compress (the compile preview currently uses `--no-compress`)

## 11. Known limitations and future work

### Known limitations

- **CJK charsets are large**: `cjk-basic` covers roughly 20,000 characters, so the generated C file can reach several MB and take a long time to compile
- **Server dependency**: `lv_font_conv` must be installed globally, and conversion fails if it is not
- **No subsetting**: a custom charset has to be listed by hand; the characters actually used in the UI are not analysed
- **No caching**: every build reconverts the fonts from scratch

### Future work

1. **Conversion cache**: key the converted result on font hash + size + charset + bpp, to avoid reconverting
2. **Automatic charset extraction**: analyse all text in the UI and derive the minimal charset
3. **lv_font_conv as WASM**: compile it to WASM and convert in the browser, removing the server dependency
4. **Font preview**: preview an uploaded font in the resource panel with CSS `@font-face`
5. **Font merging**: combine different ranges from several fonts into one LVGL font (`lv_font_conv` accepts `--font` more than once)
6. **Progress feedback**: show a progress bar or an estimate when converting a large charset
