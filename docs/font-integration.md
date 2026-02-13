# Font Integration Design

## 1. Overall architecture

The editor's font system lets the user upload a TTF/OTF file. At compile-preview time it is converted into LVGL-ready C source with the `lv_font_conv` tool, and compiled to WASM alongside the UI code.

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
  Code generation (codegen)
  ├── ui.h: LV_FONT_DECLARE(ui_font_noto_16)
  └── ui.c: widgets reference &ui_font_noto_16
       │
       ▼
  Compile preview (CompilePreview)
  ├── Build a FontCompileRequest (base64 plus conversion parameters)
  └── POST /api/compile (files + fonts)
       │
       ▼
  Server (vite-plugin-compile)
  ├── Decode the base64 into a temporary .ttf/.otf file
  ├── Run lv_font_conv to produce a .c file
  └── Compile it with the UI code through emcc → WASM
```

## 2. End-to-end flow

### 2.1 Font upload

The user uploads a TTF/OTF file through the resource panel, and the front end:

1. `fontFileToBase64()` converts the file into a base64 data URI
2. `parseFontMetadata()` parses the font's name table and extracts the family and style
3. Derives a `cFontName` (format: `ui_font_<sanitized_name>`)
4. Stores it in the `ResourceStore.fonts` array

### 2.2 Code generation

When `generateCode()` runs, `fontResources` feeds into:

- **ui.h**: a `LV_FONT_DECLARE(cFontName_size)` for every size of every font
- **ui.c**: widgets reference the font variable through `styles.textFont` or `props.fontResource`

### 2.3 Compile preview

`CompilePreview.handleCompile()`:

1. Calls `generateCode()` to produce the C sources
2. Converts `fontResources` into `FontCompileRequest[]`, carrying:
   - `data`: the font file as a base64 data URI
   - `cFontName`: the C variable name prefix
   - `sizes`: the sizes to generate
   - `ranges`: the Unicode ranges, computed by `getCharsetRanges()`
   - `bpp`: the anti-aliasing bit depth
3. Calls `compileCode(userFiles, width, height, onStatus, fontRequests)`

### 2.4 Server-side font conversion

The `/api/compile` endpoint in `vite-plugin-compile.ts`:

1. Receives the `fonts` array
2. For each font:
   - Decodes the base64 and writes a temporary file
   - Runs `lv_font_conv` once per size to produce a `.c` file
   - Reads back the generated C source
3. Adds the font `.c` files to the emcc source list

### 2.5 Compile output

emcc compiles every `.c` file (UI code plus the font C arrays) into `output.js` and `output.wasm`, which run in the browser.

## 3. Key files

| File | Responsibility |
|------|------|
| `src/resources/types.ts` | The `FontResource` type |
| `src/resources/converters/fontConverter.ts` | Font metadata parsing, charset range calculation, `lv_font_conv` command generation |
| `src/codegen/templates/ui.h.ts` | Emits the `LV_FONT_DECLARE` declarations |
| `src/codegen/templates/ui.c.ts` | References the font variables from widgets |
| `src/codegen/generator.ts` | Generation entry point; passes fontResources through |
| `src/components/CompilePreview/CompilePreview.tsx` | Compile preview UI; builds the font requests |
| `src/components/CompilePreview/compilerService.ts` | Compile service client; sends the font data |
| `vite-plugin-compile.ts` | Server-side compile plugin; runs `lv_font_conv` and compiles |

## 4. Using lv_font_conv

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

## 5. Font variable naming

| Level | Format | Example |
|------|------|------|
| cFontName | `ui_font_<name>` | `ui_font_noto` |
| Variable with size | `<cFontName>_<size>` | `ui_font_noto_16` |
| ui.h declaration | `LV_FONT_DECLARE(<var>)` | `LV_FONT_DECLARE(ui_font_noto_16)` |
| ui.c reference | `&<var>` | `&ui_font_noto_16` |
| lv_font_conv output | `--output=<var>.c` | `--output=ui_font_noto_16.c` |

`LV_FONT_DECLARE(x)` expands to `extern const lv_font_t x;`, matching the global that `lv_font_conv` generates.

## 6. Supported charsets and options

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

- `sizes: number[]` — the sizes to generate
- `charset: CharsetType` — charset type
- `customChars?: string` — the character list, when the charset is custom
- `bpp: 1 | 2 | 4 | 8` — anti-aliasing bit depth
- `compress: boolean` — whether to compress (the compile preview currently uses `--no-compress`)

## 7. Known limitations and future work

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
