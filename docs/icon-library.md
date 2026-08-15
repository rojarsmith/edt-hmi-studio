# Icon Library — Status and the Paths That Reach Hardware

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/icon-library.md">繁體中文</a>
</p>

The **Icon** tab is a browsable gallery of Material Design icons with
**Copy SVG** / **Copy Path** actions. Everything on the page works — browse,
category filter, search, preview, copy — but the page has no "insert into the
design" step, and nothing else in the studio consumes what it copies. For a
no-code author it is a dead end, which is why the tab is
**factory-dev-mode only** (see [factory-dev-mode.md](factory-dev-mode.md))
until it grows a real pipeline.

This document records what was verified about the two icon paths that *do*
reach hardware today, so the future redesign starts from facts.

## Path 1 — LVGL built-in symbols (verified, recommended)

LVGL compiles ~60 FontAwesome glyphs into every built-in Montserrat font
(`LV_SYMBOL_WIFI`, `LV_SYMBOL_OK`, …). They are ordinary characters in the
private-use block U+F000–U+F8FF, so a label whose text contains one renders it
— no code, no conversion, no extra flash.

**Verified end to end** (2026-08): a label with text `" WiFi "` (WIFI and OK
symbols around the word) generates

```c
lv_label_set_text(ui_status, " WiFi ");
```

whose bytes are `ef 87 ab … ef 80 8c` — exactly what the
`LV_SYMBOL_WIFI " WiFi " LV_SYMBOL_OK` macros would produce, because the
macros *are* those UTF-8 strings.

Recipe for an author:

1. Place a **Label**; paste the symbol character into its Text field.
2. Keep the font on built-in **Montserrat** (the default) — the glyphs live
   there. A converted font (Noto etc.) does not carry them; the Fonts tab's
   missing-glyph warning will say so.
3. Build and flash.

Caveats:

- The canvas previews the character as □ — browsers have no FontAwesome — but
  the device renders it. The Property editor's glyph-coverage warning
  deliberately lets U+F000–F8FF pass for the same reason.
- There is no picker: the author must copy the character from documentation.
  This is the gap the redesigned Icon tab should close (click-to-insert).

Common symbols, copyable as characters:

| Symbol | Char | Code point | | Symbol | Char | Code point |
| --- | --- | --- | --- | --- | --- | --- |
| WIFI |  | U+F1EB | | HOME |  | U+F015 |
| BATTERY_FULL |  | U+F240 | | SETTINGS |  | U+F013 |
| BLUETOOTH |  | U+F293 | | WARNING |  | U+F071 |
| OK |  | U+F00C | | PLAY |  | U+F04B |
| CLOSE |  | U+F00D | | PAUSE |  | U+F04C |
| LEFT |  | U+F053 | | STOP |  | U+F04D |
| RIGHT |  | U+F054 | | REFRESH |  | U+F021 |
| UP |  | U+F077 | | TRASH |  | U+F2ED |
| DOWN |  | U+F078 | | EDIT |  | U+F304 |

The project setting `useBuiltinSymbols` (on by default) also makes generated
`ui.h` document the macros, and `ui.c` re-applies a Montserrat symbol font
when the project's default font is a converted one.

## Path 2 — Copy SVG → save as file → upload as Image (verified, clunky)

The image-to-C conversion is browser-canvas rasterisation
(`drawImage` + `getImageData` in
`src/resources/converters/imageConverter.ts`), and browsers rasterise SVG
natively. **Verified**: the exact SVG the wifi icon's Copy SVG produces,
uploaded through the real `addImage`, converts to a correct 24×24 ARGB8888
array (transparent background, black glyph — `fill="currentColor"` resolves
to black in this context).

So the flow works: Copy SVG → paste into a file saved as `icon.svg` → upload
in the Image tab → place an Image widget. Two manual edits are usually
wanted before saving:

- `width="24" height="24"` → the pixel size you actually want; the
  rasterisation honours it.
- `fill="currentColor"` → a real colour (`#ffffff` for icons on dark panels).

## Where this should go

The page earns its place back in normal mode when picking an icon *does*
something. The agreed direction, when scheduled: rebuild it around the LVGL
symbol set — click inserts the symbol into the selected label/button (or
creates a label carrying it), with the SVG→`lv_image` pipeline (size and
colour chosen at import) as a later stage for arbitrary artwork.
