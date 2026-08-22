# QrCode (qrcode) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/qrcode.md">繁體中文</a>
</p>

## 1. Name and summary

QrCode shows a QR code computed from its content. The content has two
design-time sources — a **Texts-library resource**, read in English whatever
language the panel is showing, or a **literal** typed into the widget — and one
run-time source on top: a **string sent over communication** replaces the
content while the panel runs, so a server can point the code at a work order,
a session URL, or anything else.

The widget exposes the QR standard's own knobs under the standard's own names:
**version** (1–40, or auto — the smallest that fits), **scale** (pixels per
module) and **error correction** (L / M / Q / H). Every layer honours them the
same way: the design canvas, the Prototype, the Simulator and the panel all
encode with the same rules, so the code the designer sees is the code the
scanner gets.

Pure software, so unlike Video it runs on **every board**.

QrCode is not a container (`isContainer = false`).

## 2. Type identifier

```
type: 'qrcode'
```

## 3. Category

| Field | Value |
|---|---|
| Category id | `image` |
| Category name | Image |
| Category icon | 🧿 |
| Widget icon | 🔳 |

Image sits between Display and Miscellaneous: widgets that *are* a picture, as
opposed to Basic's Image, which shows one the project imported. A QR code is a
picture computed from its content.

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 120 |
| defaultHeight | 120 |

> The code draws at its true pixel size — `(modules + 8) × scale`, quiet zone
> included — centred in the widget, never stretched. The property editor does
> the arithmetic and warns when the code outgrows the box.

## 5. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `source` | `'literal' \| 'text'` | `'literal'` | Where the content comes from. |
| `literal` | `string` | `''` | The string encoded when `source` is `literal`. Empty by default — see below. |
| `textId` | `string` | `''` | The Texts-library resource encoded when `source` is `text`. |
| `version` | `number` | `0` | 0 = the smallest version the content fits; 1–40 pins it. |
| `scale` | `number` | `2` | Pixels per module, 1–8. |
| `ecc` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` | Error correction level. |
| `quietZone` | `boolean` | `true` | The standard's 4-module clear margin, drawn in the light colour. |
| `sampleText` | `string` | `''` | A string to plan the widget around. Never encoded, never generated — see *Planning for a string*. |

### About the properties

- **A new widget is blank, and blank means blank.** There is no sample
  address to clear out of the way: the literal starts empty, and a widget
  with nothing to encode draws **nothing but its background colour** — a
  plain square — on the design canvas, in the Prototype, in the Simulator
  and on the panel alike. The encoder could make a code out of an empty
  string, and the first firmware did: a valid, meaningless version-1 code
  that no phone could do anything with. Now the panel shows the square and
  waits. This is the state a code that arrives over communication starts in:
  blank at power-up, filled by the first string the server sends. The
  property editor says *"Nothing to encode yet"* as a note, not a warning.
- **Unicode is encoded as UTF-8**, in byte mode — the convention every phone
  scanner decodes. Japanese, Chinese, or any other script works in the
  literal, in a text resource, and over communication alike; capacity is
  counted in UTF-8 bytes, so a kanji costs three where a letter costs one,
  and the version arithmetic in the editor counts the same bytes the panel
  encodes.
- **A text resource is read in English**, whatever the panel's language: a QR
  code is scanned by a phone, not read by the operator, and the address behind
  it does not translate. Resolution falls back the way every text reader does
  — `en`, then the first language with a value.
- **A pinned version that cannot hold the content is an error, not a guess**:
  the editor says *"does not fit version N at level X — raise the version,
  lower the correction level, or set the version to Auto"*, and the panel
  keeps the previous picture rather than drawing half a code.
- The widget's **Text Color is the dark modules** and **Background Color the
  light ones** — the same two rows every widget's Style section has. Keep the
  contrast high; a scanner needs it.

### The white around the code

Two different things, one look. The **quiet zone** is the standard's 4-module
clear margin, drawn in the light colour on every side — scanners rely on it,
and it is on by default. Everything beyond that is the **widget's own
background** filling the rest of the box.

To shrink the white: the property editor's *Shrink the widget to the code*
button sizes the box to the code's exact pixels, leaving only the quiet zone.
To remove even that, switch **Quiet zone** off — the right move only when the
widget already sits on a plain, light background that provides the clearance
instead; on a dark or busy background the code may stop scanning, and the
editor says so when the switch goes off.

### Planning for a string

A code fed over communication has a problem at design time: the widget has
no content, so nothing tells the designer which version the longest work
order URL will need, whether it fits the box at this scale, or how many
registers the binding must read. **Plan for a string** is a field for
exactly that — type the longest string the server will ever send (Unicode
welcome: it is counted in UTF-8 bytes, the way the code and the registers
count it), and the editor answers:

- **characters and bytes**, separately, with a note when they differ — a
  kanji costs three bytes where a letter costs one;
- **the smallest version at the widget's level**, its module count, and the
  pixel square at the widget's scale and quiet-zone setting;
- **the smallest version at every level**, L through H, so the cost of more
  error correction is a glance rather than four experiments;
- **the registers** a string binding needs (two bytes each);
- and, only when something is wrong, **what to change, with the number**:
  *"Version is pinned to 2, which cannot hold this: set it to 3 or higher, or
  to Auto"*; *"lower the scale to 3, or enlarge the widget to 259×259"*;
  *"the binding's Length is 8 registers (16 bytes); this string needs 16"*;
  *"longer than communication can carry: 140 bytes, and a string binding
  reads at most 128"*.

The field is **planning only**. It is never encoded — the canvas stays blank
while you type into it — and it never reaches the generated code or the
Simulator; a test holds each of those doors shut. It *is* saved with the
project, as the widget's `sampleText` prop, so the next person to open the
design sees what the code was sized for.

## 6. Communication

Bind the widget in its Communication section: a **string** read from
consecutive holding or input registers — two UTF-8 **bytes** per register,
high byte first, ended by a zero — with a configurable length of 1–64
registers (2–128 bytes; a kanji is three of them and may straddle a register
boundary, which is fine). Read-only: nothing on the panel edits a QR code.

The panel polls the block and re-encodes **only when the string actually
changes** — polls repeat, pictures should not. An empty read leaves the
current code up.

## 7. UI layers

| Layer | What it does |
|---|---|
| Design canvas | Encodes the real content and draws it as SVG — same modules, version, quiet zone as the panel. |
| Prototype | Same encoding, drawn with Canvas 2D rectangles. |
| Simulator | `create_qrcode` in `ui_from_json.c`, running the same `qrcodegen` encoder LVGL bundles; the serializer resolves the content first so the C side encodes a plain string. |
| Generated code | `lv_canvas_create` plus a generated renderer (`ui_qrcode_apply`) that calls `qrcodegen` directly with the widget's version/ECC/scale, paints an I1 canvas buffer, and exposes `<name>_qr_set_text` for communication. |

The generated code deliberately bypasses LVGL's own `lv_qrcode` wrapper: that
wrapper pins the error-correction level to MEDIUM and picks the version
itself, and both are settings this widget hands to the user.

## 8. Where the code is

| Piece | File |
|---|---|
| Settings model, encoding, English resolution | [`src/utils/qrcodeModel.ts`](../../src/utils/qrcodeModel.ts) |
| Widget definition, Image category | [`src/utils/componentDefinitions.ts`](../../src/utils/componentDefinitions.ts) |
| Design canvas | [`CanvasQrcode.tsx`](../../src/components/Canvas/CanvasQrcode.tsx) |
| Prototype | `drawQrcode` in [`PreviewPanel.tsx`](../../src/components/Preview/PreviewPanel.tsx) |
| Property editor | `QrcodeEditor` in [`PropertyEditor.tsx`](../../src/components/PropertyEditor/PropertyEditor.tsx) |
| String binding | [`ModbusBindingEditor.tsx`](../../src/components/PropertyEditor/ModbusBindingEditor.tsx), [`hmiBindingGenerator.ts`](../../src/codegen/hmiBindingGenerator.ts) |
| Generated renderer | `QRCODE_SUPPORT_SOURCE` in [`ui.c.ts`](../../src/codegen/templates/ui.c.ts) |
| Simulator | `create_qrcode` in [`ui_from_json.c`](../../wasm/src/ui_from_json.c) |
| Runtime string reads | `HMI_DATA_STRING` in each board's `hmi_runtime.c` |

`LV_USE_QRCODE` is enabled in every board's `lv_conf.h` and in
`wasm/lv_conf.h`; it compiles the bundled QR-Code-generator library the
renderer calls.
