# Font Selection

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/font-selection.md">繁體中文</a>
</p>

> **Status.** Reference, not a decision. Nothing here is bundled with the product
> yet. Licence summaries are a starting point for a legal review, not a
> substitute for one.

Free and open-source fonts suitable for embedding in this product, with the
constraints that actually apply on a 480×272 or 800×480 industrial HMI. Read
alongside [charset-trimming-design.md](./charset-trimming-design.md), which is
what makes a large font affordable in the first place.

## 1. Three criteria that differ from desktop

1. **Legibility at small sizes.** CJK on a 480×272 panel usually lands at 12–16px.
   Geometric faces — including LVGL's built-in Montserrat — go soft at that size.
2. **Tabular figures.** HMI readouts update in place; proportional digits make
   the field jitter horizontally on every refresh.
3. **Pixel fonts win outright at small sizes.** A native bitmap face at 1 bpp is
   both sharper *and* several times smaller than a vector face rasterised to the
   same pixel height. This is the least intuitive item on the list and often the
   largest saving.

## 2. Latin / primary UI

| Font | Licence | Notes |
| --- | --- | --- |
| **Inter** | OFL 1.1 | Drawn for screen UI: tall x-height, open apertures, best in class at 12–16px. Supports tabular figures. **First choice here.** |
| **Roboto** | Apache 2.0 | Android's UI font. Apache 2.0 has no reserved-font-name clause, so the least licence friction of anything on this page. |
| **IBM Plex Sans** | OFL 1.1 | Drawn for technical and industrial contexts, with matching Mono, CJK and Arabic siblings — the choice if one design language across every script matters. |
| **Barlow / Rajdhani / Oswald** | OFL 1.1 | Condensed; more characters in the same width. Rajdhani is the face in the TouchGFX screenshots. |
| Montserrat | OFL 1.1 | LVGL's built-in default. Wide, weak at small sizes. Fine as a default, not what we would pick for a product. |

## 3. Numeric readouts

| Font | Licence | Notes |
| --- | --- | --- |
| **JetBrains Mono**, **IBM Plex Mono** | OFL 1.1 | Monospaced, strong digit differentiation |
| **Roboto Mono** | Apache 2.0 | As above, more permissive licence |
| **DSEG** (DSEG7 / DSEG14) | OFL 1.1 | Simulates seven- and fourteen-segment displays. Useful for instrument-style readouts, and the charset is digits plus a few symbols, so it costs almost nothing. |

## 4. Traditional Chinese

| Font | Licence | Notes |
| --- | --- | --- |
| **Noto Sans TC** | OFL 1.1 | The safe, complete choice. Same design as Source Han Sans TC. |
| **Source Han Sans TC** (思源黑體) | OFL 1.1 | The same design under Adobe's branding |
| **Taipei Sans TC Beta** (台北黑體) | OFL 1.1 | Derived from Source Han Sans, adjusted toward the Taiwanese Ministry of Education standard glyph forms. Pick this if the product has to match those forms. |
| **jf open 粉圓** | OFL 1.1 | Rounded, friendlier tone |
| **Cubic 11** (俐方體十一號) | OFL 1.1 | **An 11px native bitmap face covering Traditional Chinese.** The standout for embedded: at 12–16px with 1 bpp it beats any vector face on both sharpness and size. Worth measuring before anything else. |
| **Ark Pixel Font** (方舟像素字體) | OFL 1.1 | Bitmap at 10/12/16px, covering TC, SC, JP and KR. Same argument. |

## 5. Japanese and Korean

- Japanese: **Noto Sans JP**; **M PLUS 1 / M PLUS 2** (OFL, good at UI sizes);
  **BIZ UDPGothic** (OFL, universal-design, drawn for high legibility)
- Korean: **Noto Sans KR**; **Pretendard** (OFL, close in feel to Inter)

## 6. Arabic — and an LVGL trap

Checked against the mapping table in `lv_text_ap.c`: LVGL's
`LV_USE_ARABIC_PERSIAN_CHARS` maps base letters (from `LV_AP_ALPHABET_BASE_CODE`
`0x0622`) onto **Arabic Presentation Forms-B, `U+FE70`–`U+FEFF`** — entries such
as `{6, 0xFE90, …}`.

**So the converted font must contain `U+FE70`–`U+FEFF`. `U+0600`–`U+06FF` alone
is not enough.** Many modern Arabic faces implement joining through OpenType
GSUB and omit the legacy presentation-forms block entirely; those render as
missing glyphs under LVGL no matter how well they behave elsewhere.

| Font | Licence | Notes |
| --- | --- | --- |
| **Noto Sans Arabic** | OFL 1.1 | Default choice, widest coverage |
| **IBM Plex Sans Arabic** | OFL 1.1 | Pairs with Plex Sans |
| **Cairo** | OFL 1.1 | Modern, geometric, pairs well with a Latin sans |
| Amiri | OFL 1.1 | Traditional Naskh. Beautiful, but needs more line height and full shaping — a poor match for LVGL's simplified shaping. |

Dump the `cmap` and confirm `U+FE70`–`U+FEFF` coverage before committing to any
of them. That is also the first practical use for the cmap parsing proposed in
[charset-trimming-design.md](./charset-trimming-design.md) §7.

## 7. Icons

LVGL's built-in symbols are a Font Awesome subset, already wired up here through
`useBuiltinSymbols` / `symbolFont`. When more are needed: **Material Symbols**
(Apache 2.0), **Lucide** (ISC), **Bootstrap Icons** (MIT), **Remix Icon**
(Apache 2.0), **Phosphor** (MIT).

With character-set trimming in place, subsetting icons uses the same mechanism —
you pay only for the glyphs actually placed.

## 8. Licence practicalities

Both OFL 1.1 and Apache 2.0 permit embedding in commercial firmware. Two
differences are worth knowing:

- **OFL 1.1** carries a Reserved Font Name clause: a modified version must be
  renamed. Converting to an LVGL C array is normally read as embedding rather
  than deriving a new font, and the OFL explicitly permits bundling with
  software — but **the OFL text must ship with the product**, in documentation
  or a licences screen.
- **Apache 2.0** (Roboto, Roboto Mono, Material Symbols) has no RFN clause and
  less to reason about.

Recommend a `LICENSES/` directory, or a section in the docs, listing every
embedded font and its licence. This is not legal advice; if the product ships
commercially, have someone qualified confirm it.

## 9. Suggested combination for this product

For 480×272 / 800×480, industrial Modbus HMI, Traditional Chinese primary:

| Role | Suggestion |
| --- | --- |
| Latin and digits | **Inter** — or **Roboto** to avoid thinking about RFN at all |
| Numeric readouts | Inter's tabular figures; **DSEG7** for an instrument look |
| Traditional Chinese ≥ 20px | **Noto Sans TC** |
| Traditional Chinese 11–16px | **Cubic 11** at 1 bpp — measure this first; likely the largest single saving on this page |
| Arabic, if needed | **Noto Sans Arabic**, after verifying `U+FE70`–`U+FEFF` |
| Icons | Keep LVGL's built-in symbols; add a **Material Symbols** subset if short |

This interacts with the font work elsewhere: `lv_font_t.fallback` can chain
**Inter → Noto Sans TC → symbol font**, so Latin comes from the compact Latin
face and only Han characters pay Han-character cost. The project already uses
this technique in `ui.c` — including the workaround for const fonts living in
read-only memory under WASM — so it is an extension, not a new mechanism.
