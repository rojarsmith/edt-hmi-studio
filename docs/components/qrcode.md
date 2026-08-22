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
| `literal` | `string` | `'https://bitdove.net'` | The string encoded when `source` is `literal`. |
| `textId` | `string` | `''` | The Texts-library resource encoded when `source` is `text`. |
| `version` | `number` | `0` | 0 = the smallest version the content fits; 1–40 pins it. |
| `scale` | `number` | `2` | Pixels per module, 1–8. |
| `ecc` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` | Error correction level. |

### About the properties

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

## 6. Communication

Bind the widget in its Communication section: a **string** read from
consecutive holding or input registers — two ASCII characters per register,
high byte first, ended by a zero — with a configurable length of 1–64
registers (2–128 characters). Read-only: nothing on the panel edits a QR code.

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
