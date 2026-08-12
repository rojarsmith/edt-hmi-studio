# Text and Typography

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/text-typography-evaluation.md">繁體中文</a>
</p>

> **Status.** Evaluation only. Nothing in this document is implemented — the
> editor still writes literal strings into `lv_label_set_text()`. Every LVGL
> claim below was checked against the vendored LVGL 9.5.0 source
> (`firmware/vendor/lvgl-9.5.0.zip`), not against the online documentation,
> because two of the most important findings (§3 and §7) are things the
> documentation does not make obvious.

TouchGFX Designer splits text authoring into two tabs — **Texts** (a translation
matrix) and **Typographies** (named font styles with per-language overrides).
This document records how much of that design LVGL 9 can carry natively, what
has to be built in the editor instead, and the two features that cannot be built
at all without patching LVGL.

The short version: **about 70% maps onto LVGL 9.5 natively, and the keystone —
a text-id indirection with runtime language switching — exists in LVGL as
`lv_translation`, a module this project does not currently compile in.**

## 1. What the TouchGFX design actually is

The two tabs are a surface. Underneath they are four separate mechanisms, and
they are worth separating because they have very different costs on LVGL:

| # | Mechanism | Where it shows in the Designer |
| --- | --- | --- |
| 1 | **Text-id indirection** — a widget stores an id, never a literal | The `Id` column (`boxEnglish`, `Auto-generated`) |
| 2 | **Translation matrix** — one row per id, one column per language | The `GB` / `CN` / `JP` / `AR` columns and the `＋` button |
| 3 | **Typography** — a named text style, shared by many texts, with a **per-language font override** | The `Typography` column; `Language Settings: Default ＋` |
| 4 | **Character-set trimming** — only glyphs actually used are emitted | Wildcard Characters / Ranges, which exist to cover glyphs that usage analysis cannot see |

Mechanism 4 is the one worth being precise about, because it is easy to
misread. It is **not** a runtime feature of TouchGFX. It is a generator feature:
the tool takes the union of every character in every translation, and emits
glyph tables for that set alone. The Wildcard fields exist because a string like
`"<value> KB"` does not tell the generator which digits will appear at runtime,
so the author declares them by hand.

That distinction matters here: mechanism 4 has no LVGL dependency whatsoever.

## 2. The mapping onto LVGL 9.5

| TouchGFX feature | LVGL 9.5 equivalent | Fit |
| --- | --- | --- |
| Text id + runtime language switch | `lv_translation_add_static()` / `lv_translation_set_language()` / `lv_tr()` | Native |
| Text refreshes when the language changes | `lv_label_set_translation_tag()`; the label handles `LV_EVENT_TRANSLATION_LANGUAGE_CHANGED` itself | Native |
| Translation matrix storage | `lv_translation_add_static()` takes exactly that flat 2-D array | Native |
| Character-set trimming | `lv_font_conv --symbols "…"`; LVGL never sees it | Native (generator-side) |
| Bpp 1/2/4/8 | Already wired — `FontResource.bpp` → `--bpp` | Already done |
| Alignment | `lv_obj_set_style_text_align()`, plus `LV_TEXT_ALIGN_AUTO` which follows the base direction | Native |
| Typography as a named style | No such noun in LVGL, but `lv_style_t` + `lv_obj_add_style()` is the same thing: font, letter space, line space, align and decor are all style properties | Needs an editor-side abstraction |
| Per-language font | Three workable routes: swap `lv_obj_set_style_text_font()` on switch; chain `lv_font_t.fallback`; or merge ranges with repeated `--font` in one `lv_font_conv` run | Needs a decision, all three work |
| Direction LTR/RTL | `lv_obj_set_style_base_dir()` is a real inherited style property; needs `LV_USE_BIDI` | Native, needs a rebuild |
| Arabic contextual shaping | `LV_USE_ARABIC_PERSIAN_CHARS` (`lv_text_ap.c`) | Partial — Arabic/Persian only |
| Auto-wrap / long text | `lv_label_set_long_mode()`: `WRAP`, `DOTS`, `SCROLL`, `SCROLL_CIRCULAR`, `CLIP` | Native |
| Wildcard `<value>` | `lv_label_set_text_fmt()`, or `lv_label_bind_text(obj, subject, fmt)` via the observer | Different shape, same capability |
| Wildcard Characters / Ranges | No LVGL concept — these are the inputs to `--symbols` / `--range` | Native (generator-side) |
| Bitmap vs Vector | Bitmap is what we already do; Vector needs `LV_USE_TINY_TTF` or `LV_USE_FREETYPE` | Possible, expensive — see §7.3 |
| **Fallback Characters** | **Nothing equivalent.** See §7.1 | Not available |
| **Ellipsis Character** | **Nothing equivalent.** See §7.2 | Not available |
| Text Groups tree | Editor-only organisation, no LVGL involvement | N/A |

## 3. `lv_translation` is the keystone, and it is switched off

LVGL 9 gained a translation module at `lv_translation.h`. It is close
enough to the TouchGFX model that the Texts tab can generate straight into it:

```c
static const char * const languages[]    = {"en", "zh", "ja", NULL};
static const char * const tags[]         = {"boxEnglish", "boxChinese", NULL};
static const char * const translations[] = {
    "ENGLISH", "CHINESE",   /* en */
    "英文",     "中文",       /* zh */
    "英語",     "中国語",     /* ja */
};

lv_translation_add_static(languages, tags, translations);
lv_translation_set_language("zh");
```

The part that saves the most work is on the label:

```c
lv_label_set_translation_tag(ui_box_english, "boxEnglish");
```

A label given a tag re-reads its text by itself whenever the language changes —
`lv_label.c` handles `LV_EVENT_TRANSLATION_LANGUAGE_CHANGED` internally. No
generated event handler, no screen rebuild.

Three caveats, all found by reading the source rather than the docs:

**3.1 Only labels do this.** `LV_EVENT_TRANSLATION_LANGUAGE_CHANGED` is handled
in exactly one widget in the whole LVGL tree: `lv_label.c`. Buttons are fine,
because our generator puts a real label inside them. But **dropdown options,
roller options, table cells, textarea placeholders and chart axis labels** all
need a generated handler of their own. That boilerplate is ours to emit.

**3.2 Lookup is a linear string compare.** `lv_translation_get()` walks the tag
array calling `lv_streq` until it hits a match — O(n) per lookup, against
TouchGFX's O(1) integer `TypedText` index. Lookups only happen at screen load
and on language change, so a few hundred texts are fine. If the count grows into
the thousands, the alternative is generating our own integer-indexed table — but
that gives up the automatic refresh in §3, so it should not be the first move.

**3.3 It is not compiled in.** `LV_USE_TRANSLATION` defaults to `0` in
`lv_conf_template.h`, and neither `firmware/*/include/lv_conf.h` nor
`wasm/lv_conf.h` defines it at all. See §9.

## 4. Character-set trimming is the cheapest large win

Of everything here, this is the item with the best ratio of benefit to risk,
and it is the only one with no LVGL dependency at all.

`CHARSET_PRESETS` in `src/resources/types.ts` currently offers `cjk-basic` as
the whole of `0x4E00`–`0x9FFF` — roughly 20,000 glyphs. `docs/font-integration.md`
§11 already admits what that produces: a C file of several MB, and a long
compile. A real UI uses a few hundred distinct characters.

`lv_font_conv` accepts `--symbols` alongside `--range`, taking a literal string
of characters to include. Once the Texts tab exists, the input is free: the
union of every character in every translation, plus the Wildcard Characters the
author declares for runtime-substituted values. The change is confined to
`generateFontConvCommand()` and the server-side invocation in
`vite-plugin-compile.ts` — LVGL, the firmware and the generated UI code are all
unaffected.

This is already on the roadmap: `docs/font-integration.md` §11 lists
"Automatic charset extraction" as future work #2.

## 5. Typography maps onto `lv_style_t`

LVGL has no "typography" noun, but it has the mechanism. Everything on the
Typographies pane except the conversion parameters is a style property:

| Typography field | LVGL |
| --- | --- |
| Font, Size | `lv_style_set_text_font()` — one `lv_font_t` per font+size pair |
| Direction | `lv_style_set_base_dir()` |
| Alignment (from the Texts tab) | `lv_style_set_text_align()` |
| Type, Bpp | Not runtime state — these are `lv_font_conv` arguments |

So a Typography becomes one generated `static lv_style_t`, applied with
`lv_obj_add_style()`. That is strictly better than what the editor does today,
where font choice is duplicated across two paths — `props.fontResource` +
`props.fontSize` and `styles.textFont` + `styles.textFontSize` — both handled
separately in `src/codegen/templates/ui.c.ts`. Introducing Typography is a
natural moment to collapse them.

For the per-language font override, `lv_font_t.fallback` deserves a mention: it
is a resolved-recursively pointer chain, and **this project already uses it** —
`ui.c` builds a mutable copy of the default font and points `fallback` at the
symbol font, working around const fonts living in read-only memory under WASM.
The same technique extends directly to "Latin from font A, CJK from font B",
which is both simpler and smaller than emitting one merged font per language.

## 6. Direction and shaping

`lv_obj_set_style_base_dir()` is a proper inherited style property, so RTL can
be set per Typography and inherited by children — the same shape as the
Direction toggle in the Designer. `LV_TEXT_ALIGN_AUTO` then resolves alignment
against it, which is what the Designer's alignment column implicitly does.

Two limits are worth writing down before anyone promises RTL support:

- `LV_USE_BIDI` and `LV_USE_ARABIC_PERSIAN_CHARS` are both `0` on every board
  and in the WASM preview. Turning them on is a rebuild, not a runtime flag.
- **LVGL has no general shaping engine.** `lv_text_ap.c` implements Arabic and
  Persian contextual forms and nothing else. Thai, Devanagari and the other
  Indic scripts will not render correctly, and no configuration flag changes
  that. Arabic — the language in the screenshots — is the case LVGL does cover.

CJK line breaking is handled: `lv_text.c` treats a single CJK character as a
word, so wrapping works without spaces.

## 7. What LVGL cannot do

### 7.1 Fallback Characters

The Designer lets the author nominate a substitute glyph (`?` in the screenshot)
for characters missing from the font. LVGL has no equivalent. What it has is
`LV_USE_FONT_PLACEHOLDER`, which draws a box, and `lv_font_t.fallback`, which
searches another font. Neither substitutes a chosen character.

The recommendation is to not offer the field. With §4 in place the character set
is derived from the text itself, so a missing glyph means the generator has a
bug — a configurable substitute would hide it rather than fix it.

### 7.2 Ellipsis Character

`lv_label.h` fixes the count at `#define LV_LABEL_DOT_NUM 3`, and `lv_label.c`
writes the character literally:

```c
label->text[dot_begin + i] = '.';
```

Three ASCII periods, compiled in. Supporting a single `…` glyph means either
patching LVGL or abandoning `LV_LABEL_LONG_DOTS` and computing the truncation
point ourselves. Neither is worth it; the field should be left out.

### 7.3 Vector fonts are a poor trade on these boards

`LV_USE_TINY_TTF` would give the Designer's Vector option: `lv_tiny_ttf_create_data()`
rasterises from a TTF blob and `lv_tiny_ttf_set_size()` changes size at runtime.
The costs are real, though — the TTF stays in flash whole rather than trimmed to
the glyphs in use (losing §4 entirely), each size is a live font instance with
its own glyph cache in RAM, and rasterisation moves to the MCU. On an
STM32U599 driving 480×272 the bitmap path is the right default. The honest
answer is to not expose the Bitmap/Vector switch at all for now.

## 8. Where this project stands today

The groundwork is better than it looks:

- The `lv_font_conv` server pipeline works end to end
  (`vite-plugin-compile.ts`); `--symbols` is one more argument on a command that
  already assembles `--range`.
- The `lv_font_t.fallback` technique is already proven in `ui.c`, WASM
  read-only-memory caveat and all.

What is missing:

| Gap | Where |
| --- | --- |
| No text-id indirection — `props.text` goes straight to `lv_label_set_text(x, "…")` | `src/codegen/templates/ui.c.ts` |
| No `languages` / `texts` / `typographies` in the project file | `ProjectFile` in `src/resources/types.ts` |
| No Typography concept; font settings split across two code paths | `props.fontResource` vs `styles.textFont` |
| Four coarse charset presets, `custom` typed by hand | `CHARSET_PRESETS` in `src/resources/types.ts` |
| `textAlign` has no `auto`; `longMode` is missing `scroll_circular` | `src/components/PropertyEditor/PropertyEditor.tsx` |
| No base direction anywhere | — |

## 9. Configuration changes required

`generateCustomLvConf()` in `vite-plugin-compile.ts` rewrites exactly three
macros: `LV_COLOR_DEPTH`, `LV_FONT_FMT_TXT_LARGE` and `LV_FONT_DEFAULT`.
Anything in the table below needs that function generalised first.

| Macro | Now | Needed for |
| --- | --- | --- |
| `LV_USE_TRANSLATION` | undefined (template default `0`) | §3 — everything |
| `LV_USE_BIDI` | `0` | §6 — RTL |
| `LV_USE_ARABIC_PERSIAN_CHARS` | `0` | §6 — Arabic |
| `LV_USE_TINY_TTF` | `0` | §7.3 — vector, not recommended |
| `LV_USE_FONT_COMPRESSED` | `0` | Optional: further shrink after §4 |

And the constraint `docs/lvgl-configuration.md` already states applies here too:
the firmware's `lv_conf.h` and the board definitions in `src/types/hmi.ts` are
**not generated from one another and must be kept in step by hand**. Any macro
added above lands in both places.

## 10. Suggested order

**First — native support, generator-only changes**

1. **Character-set trimming (§4).** Depends on nothing else, and on the
   EVK043027B it converts a multi-MB CJK font into tens of KB of flash. This is
   the one to do first.
2. **Texts tab and the text-id indirection (§3)**, generating into
   `lv_translation_add_static()` + `lv_label_set_translation_tag()`. Needs one
   line of `lv_conf.h`, plus the non-label boilerplate from §3.1.
3. **Typography as a generated `lv_style_t` (§5)**, folding the two font paths
   into one.

**Second — needs an LVGL rebuild**

4. Direction / `base_dir`, BIDI and Arabic shaping (§6), after
   `generateCustomLvConf()` is generalised (§9).
5. Per-language fonts, via the `fallback` chain (§5).
6. Fill in `LV_TEXT_ALIGN_AUTO` and `SCROLL_CIRCULAR`.

**Not recommended**

7. Vector fonts (§7.3), Fallback Characters (§7.1), Ellipsis Character (§7.2).

One addition worth making that TouchGFX has no answer for:
`lv_label_bind_text(obj, subject, fmt)` binds a label to an observer subject, so
a value change updates the text with no event handler at all. That connects
directly to the existing Modbus binding in `src/codegen/hmiBindingGenerator.ts`
and is a cleaner mechanism than wildcards for live values.
