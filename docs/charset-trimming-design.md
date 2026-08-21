# Character Set Trimming

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/charset-trimming-design.md">繁體中文</a>
</p>

> **Status.** Design, not implemented. This is the detailed design for item 1 of
> the first tier in [text-typography-evaluation.md](./text-typography-evaluation.md)
> §10 — the only item there with no LVGL dependency at all, and the reason it is
> first.

Today a font's glyph coverage is chosen by hand from four coarse presets, the
broadest of which (`cjk-basic`) is the whole of `0x4E00`–`0x9FFF`. This document
designs the replacement: derive the glyph set from the text the project actually
contains, with declared escape hatches for the text that static analysis cannot
see.

## 1. What is actually wrong today

The pipeline itself is fine and works end to end:

```
FontResource.charset (one of four presets)
  → getCharsetRanges()          src/resources/converters/fontConverter.ts
  → Emulator.tsx          joined into "0x20-0x7e,0x4e00-0x9fff"
  → FontCompileRequest.ranges   src/components/Emulator/emulatorService.ts
  → convertFonts()              vite-plugin-emulator.ts
  → lv_font_conv --range=… --range=…
```

What is wrong is that two different questions are answered by one field: **which
glyphs the font should contain**, and **which glyphs the UI actually uses**. Only
the first is asked, and it is asked of a human.

There is also a trap waiting in the existing `custom` path. `getCharsetRanges()`
merges the author's characters into *contiguous ranges*. CJK code points are
scattered, so 800 characters produce roughly 800 single-character ranges, hence
roughly 800 `--range=` arguments — and `convertFonts()` assembles the whole
invocation as **one shell string**. `cmd.exe` caps a command line at 8191
characters.

Measured (§11, case A): 800 Han characters produce a **17,996-character command
line**, and it fails outright with `The command line is too long.` Automatic
collection down the existing range path therefore breaks *sooner* than the
presets do. §5 is not an optimisation; it is a precondition.

## 2. Shape of the design

```
  collectGlyphs()                    new, in src/codegen/
    ├── walk every text-bearing prop on every screen
    ├── walk runtime-set text (events, logic graph, Modbus bindings)
    └── attribute each string to the font that will actually render it
         │
         ▼
  one code-point set per (font, size)
         │
    ┌────┴─────┐
    │ 3-layer  │  ASCII baseline ∪ collected ∪ author-declared extras
    │  union   │
    └────┬─────┘
         ▼
  FontCompileRequest { symbols, ranges, … }      symbols is new
         ▼
  convertFonts() via argv spawn, no shell string
         ▼
  lv_font_conv --symbols "…" [--range=…]
```

**Granularity is per (font, size), not per font.** That is already the unit
`lv_font_conv` is invoked at, so it costs nothing extra, and it is strictly
smaller: a 48px title and a 14px status line rarely share characters.

## 3. What has to be collected

Every one of these produces a user-visible string in the generated C. Missing
one means a missing glyph on the board, so the list is the specification:

| Widget | Prop | Generated call | Source |
| --- | --- | --- | --- |
| label | `text` | `lv_label_set_text` | `ui.c.ts` |
| btn | `text` | inner label | `ui.c.ts` |
| checkbox | `text` | `lv_checkbox_set_text` | `ui.c.ts` |
| textarea | `text`, `placeholder` | `lv_textarea_set_text`, `…_set_placeholder_text` | `ui.c.ts` |
| dropdown / roller | `options` (array or `\n` string) | `lv_dropdown_set_options` | `ui.c.ts` |
| table | `cells` (2-D) | `lv_table_set_cell_value` | `ui.c.ts` |
| tabview | tab names | `lv_tabview_add_tab` | `ui.c.ts` |
| win | `title` | `lv_win_add_title` | `ui.c.ts` |

Text that is set at runtime needs separate treatment:

| Source | Statically analysable |
| --- | --- |
| `setText` builtin action's `action.value` (`ui_events.c.ts`) | Yes — a literal in the project |
| Logic-graph setText node (`ui_logic.c.ts`) | Yes |
| Modbus bindings formatting a value (`hmiBindingGenerator.ts`) | Nothing needed — `ModbusBinding` carries no format string, the firmware formats the value, and the digits, point and minus sign it needs are inside the ASCII baseline |
| `LV_SYMBOL_*` | **Must be excluded** — those come from the symbol font, not the text font |
| Custom C in events or logic nodes (`customCode`) | **No** — this is why §4 exists |

Note that `escapeCString()` passes UTF-8 through untouched, so the code points
the collector gathers are exactly the bytes that reach the `.c` file. There is no
second encoding to reconcile.

## 4. The three-layer union

Automatic collection is only safe if text the analysis cannot see has somewhere
to be declared.

**Layer 1 — unconditional baseline.** ASCII `0x20`–`0x7E`: 95 glyphs, negligible
at any bpp, and it covers most printf-style runtime text. `extractCharsFromText()`
already makes exactly this decision today, so this is a continuation rather than
a new rule.

**Layer 2 — everything in §3.**

**Layer 3 — author-declared extras**, which is TouchGFX's Wildcard Characters and
Wildcard Ranges carried over unchanged.

```ts
export type CharsetMode = 'auto' | 'preset' | 'manual';

export interface FontResource {
  // …
  charsetMode: CharsetMode;   // new; 'auto' for newly added fonts
  charset: CharsetType;       // kept, meaningful only when mode === 'preset'
  extraChars?: string;        // Wildcard Characters
  extraRanges?: string;       // "0x4E00-0x4EFF,0xFF00-0xFFEF"
  /** @deprecated migrated into extraChars */
  customChars?: string;
}
```

Migration, which must not change any existing project's output:

| Existing value | Becomes |
| --- | --- |
| `charset: 'custom'` + `customChars` | `charsetMode: 'manual'`, `extraChars = customChars` |
| `charset: 'ascii' \| 'latin' \| 'cjk-basic'` | `charsetMode: 'preset'`, `charset` unchanged |
| Newly added font | `charsetMode: 'auto'` |

So existing projects keep the glyph set they already had, and only new fonts
take the new path. That is a regression test, not a hope — see §9.

The guarantee is about **the glyphs that reach the font, not the command that
produces them**. Migrated `manual` fonts are converted with `--symbols` rather
than one `--range` per character: the same glyph set, by a command that no
longer breaks past a few hundred characters. Anyone who had hit the `cmd.exe`
ceiling is fixed by the migration rather than preserved in it.

Writing that regression first was worth it. It failed on the first run, on the
empty-custom-charset case, and the reason was instructive: `getCharsetRanges()`
returns an *empty* list there, and the ASCII fallback everyone assumes is in it
actually lives in the callers — `Emulator` and `convertFonts` each carry
their own copy. Any replacement has to reproduce the caller's behaviour, not
the function's.

## 5. Transport: `--symbols` and an argv spawn

`lv_font_conv` accepts `--symbols "…"` alongside `--range`, taking the union.
`FontCompileRequest` gains `symbols?: string`; `ranges` stays, now carrying only
the layer-3 extras.

The font conversion step must also **stop assembling a shell string and pass an
argv array instead**. The reason is not the one that seems obvious, so it is
worth stating precisely — the measurements are in §11.

**Length is not the problem.** `--symbols` is compact: the same 800 Han
characters that blow past the command-line limit as ranges come to a
1,209-character command line as symbols (§11, case B), and that invocation
succeeds. The 8191 ceiling would not be reached until roughly 6,000 characters.

**Quoting is the problem, and it is a new exposure.** Today only hex ranges
reach the command line, so no user text is ever quoted and nothing can break.
The moment `--symbols` carries authored text, an ordinary `"` in a label
destroys the invocation: measured (§11, case E1), a symbols string containing
`"` swallowed the `--output` argument and `lv_font_conv` failed with
`Output is required for "lvgl" writer`. Passing the same string as argv works
correctly. A double quote in a label is not an edge case.

**On Windows, argv must bypass the `.cmd` shim.** `execFile` against
`node_modules/.bin/lv_font_conv.cmd` with `shell: false` fails `EINVAL` on
current Node (§11, case C) — the mitigation Node adopted for CVE-2024-27980
refuses to spawn `.cmd`/`.bat` without a shell. Spawning `process.execPath`
against the package's JS entry (`lv_font_conv/lv_font_conv.js`) works (§11, case
D).

That last point has a consequence worth taking: resolving the JS entry means
`lv_font_conv` should become a **project dependency in `package.json`** rather
than the global install `vite-plugin-emulator.ts` assumes today. That also
retires the "Server dependency" item from `docs/font-integration.md` §11 — the
conversion stops failing on machines that never ran `npm install -g`.

The symbol string must be **deduplicated and sorted** before it is sent. §6 is
the reason.

## 6. Caching

`docs/font-integration.md` §11 lists "no caching" as a known limitation and a
conversion cache as future work #1. This design makes a cache more necessary —
the glyph set now moves whenever anyone edits a label — and also easier, because
the collector emits a canonical value:

```
key = sha256(fontData + cFontName + size + bpp + sorted(ranges) + sorted(symbols))
```

`cFontName` belongs in that key and is easy to leave out. **`lv_font_conv` names
the global it emits after the output file**, so the same glyphs under a
different name are a different file — verified by converting one glyph set to
two names and diffing: `const lv_font_t nameA` against `const lv_font_t nameB`.
Serving one for the other would produce C declaring a font nothing refers to.

Two properties were checked rather than assumed, because the cache depends on
both:

- **The output is deterministic.** Two identical runs differ only in a comment
  line recording the invocation.
- **Symbol order does not affect the data.** `--symbols "中文"` and
  `--symbols "文中"` produce byte-identical output once that comment is
  excluded, so normalising the order in the key is safe and stops a
  meaningless reordering from missing the cache.

The existing `tmpdir()/lvgl-lib-<hash>` convention carries over directly.

One consequence should be stated rather than discovered: because the key
includes the glyph set, **editing one label invalidates that font's cache**. Hit
rates during active editing will be lower than they look. A two-tier scheme
(baseline layer cached separately from the project layer) is possible, but it is
not worth building before the first measurement.

## 7. Editor surface

The charset dropdown in `FontManager.tsx` becomes:

- **Mode**: `Auto (characters in use)` / `Preset` / `Manual`
- In Auto mode, live feedback: `312 characters from 47 texts · 95 ASCII baseline · 12 extra`
- **Preview collected characters** — dump the set so the author can eyeball it
- Extra Characters and Extra Ranges always visible; they apply in Auto and Preset
  modes alike

**Worth doing at the same time: an editor-time missing-glyph warning.**
`parseFontMetadata()` already walks the TTF table directory to read `name` and
`head`. Extending it to `cmap` is a modest addition, and it converts "lv_font_conv
silently drops a glyph, the board shows a blank" into a warning next to the text
that caused it.

That is also the honest answer to the Fallback Character field that LVGL cannot
implement ([text-typography-evaluation.md](./text-typography-evaluation.md) §7.1):
the fix is not a runtime substitution, it is not letting the situation arise.

## 8. A gap that must be closed with this

`vite-plugin-hmi.ts` has **no font handling at all**. The WASM compile preview
runs `lv_font_conv`; the firmware deploy path does not. If the collector lives
inside `Emulator.tsx`, the preview and the real board will disagree about
which glyphs exist.

So the collector belongs in `src/codegen/`, at the same level as
`collectUsedCustomFonts`, and `FontCompileRequest` has to move to a shared type.
This is a precondition of the work, not an optional extra.

## 9. Tests

- **Unit** — collector over a fixture project against an expected code-point set:
  CJK, characters outside the BMP, duplicates, empty strings
- **Unit** — the symbols string is sorted and deduplicated, and stable across
  runs (cache-key stability)
- **Unit** — `LV_SYMBOL_*` never reaches the text font's set
- **Integration** — `compile.test.ts` already compiles real projects; add a CJK
  label case, and assert that a character appearing only inside a `setText`
  action survives into the font
- **Regression** — a project with `charset: 'custom'` produces byte-identical
  output after migration

## 10. Expected result

Measured, not estimated — see §11 for how:

| | C source | Embedded data | Glyphs | Convert time |
| --- | --- | --- | --- | --- |
| `cjk-basic` preset (today) | 16.94 MB | **1369 KB** | 21,072 | 72.0 s |
| Trimmed: 800 Han + ASCII | 0.70 MB | **54 KB** | 896 | 0.9 s |

**25× less flash, 24× less C source, 80× faster to convert.**

The two size columns are different things and both matter. The embedded data is
what lands in flash; the C source size is what the compiler has to chew through,
which is where the 72 seconds goes.

For scale on the EVK043027B, whose linker script gives `FLASH` 2048 KB: one
font at one size under the current preset is **1369 KB, or 67% of the entire
internal flash** — before the firmware, and before a second size. Trimmed, the
same font is 54 KB, or 2.6%. This is not an optimisation that buys headroom; it
is the difference between the font fitting at all.

## 11. Measurements

Run against `SourceHanSansSC-Normal.otf` (the OFL font shipped in LVGL's own
`scripts/built_in_font/`), at 16px / 4bpp, with `lv_font_conv` 1.5.3 on Node
24.19 / Windows 11. The character set was 800 Han code points spread across the
CJK block, chosen deterministically.

| Case | What | Result |
| --- | --- | --- |
| A | 800 × `--range`, one shell string | **FAIL** — 17,996-char command, `The command line is too long.` |
| B | `--symbols`, one shell string | OK — 1,209-char command, 3.8 s |
| C | `--symbols`, argv against `.bin/lv_font_conv.cmd` | **FAIL** — `spawn EINVAL` |
| D | `--symbols`, argv against `node lv_font_conv.js` | OK — 1.0 s, 801 glyphs |
| E1 | Symbols containing `" & % ^ < > \| ! $ \` `, shell string | **FAIL** — quoting collapsed, `--output` lost |
| E2 | The same string as argv | OK — 27 glyphs, all present |
| F | `cjk-basic` preset (`0x20-0x7E` + `0x4E00-0x9FFF`) | OK — 72.0 s, 16.94 MB source, 1369 KB data |
| G | ASCII range + 800-symbol set | OK — 0.9 s, 0.70 MB source, 54 KB data |

Embedded-data figures are the count of `0x..` byte literals in the generated C,
which is the array that reaches flash — not the size of the `.c` file.
