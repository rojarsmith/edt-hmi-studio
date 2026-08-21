# Switching Language at Runtime

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/language-switching.md">繁體中文</a>
</p>

How a button on the running UI changes the language every translated widget
shows, and how to see it working before it reaches hardware.

Read alongside [text-typography-evaluation.md](./text-typography-evaluation.md)
§3, which is where the translation model itself is set out.

## 1. What has to be in place first

A language switch moves widgets between **columns of the text table**. A widget
that still carries its own literal has no column to move to, and will not
change. So, in order:

1. **Add the languages.** Texts panel → add each language with the code that
   reaches `lv_translation_set_language()` at runtime (`en`, `zh-TW`, `ja`) and
   a name for the editor.
2. **Link the widgets.** For each label, checkbox, dropdown or textarea, use
   the Property editor's link-to-text control. The widget's literal becomes a
   text resource, and the widget stores its id instead of the words.
3. **Fill in the other columns.** Texts panel, one column per language.

A widget with a 🌐 link switches; a widget with a literal does not. That is the
whole rule, and it is the same rule at design time and at runtime.

### 1.1 Keys, and the trap they used to set

The Key dropdown in the Property editor is how a widget picks its row. It is
worth using rather than retyping the literal until it happens to match: the
alternative is how a widget ends up on a near-identical duplicate row.

Keys are unique **case-insensitively**, which closes the specific version of
that trap. Auto-derived keys are lowercased — a label reading "newText" derives
`newtext` — so a hand-written `newText` and a derived `newtext` used to sit next
to each other in the table, one translated and one not, indistinguishable at a
glance. They are now one key, and the editor refuses the second.

### 1.2 A row can carry its own typography

The Texts tab has a Typography column. A row that names one imposes it on every
widget bound to that row, and the widget's own assignment steps aside — the
words and the face that suits them travel together, which is TouchGFX's
TypedText → Typography pairing.

This is also why the Property editor has no font control: a face and a size set
on one widget are invisible to every other widget that should match it, and
only a typography can carry a per-language font. Set the typography; the font
follows.

## 2. Design time: the canvas preview

The canvas has a 🌐 selector in the bottom corner, which appears once a project
has more than one language. It picks **which column of the text table the canvas
renders** — text, placeholders, dropdown options, and the per-language font each
typography names.

This is the fastest check that the translations are complete, but it is a
designer's control, not a button in the UI being designed. Pressing a button on
the canvas does not run event handlers; the canvas is a design surface.

## 3. Runtime: the Switch Language action

Event panel → add an event → **Built-in Action** → **Switch Language**:

| Choice | Generated |
| --- | --- |
| A named language | `lv_translation_set_language("zh-TW");` |
| Next language (cycle) | `ui_events_next_language();` |

The cycling helper is emitted into `ui_events.c` once, holding the project's
language codes in order, and wraps at the end. It is the shape a one-button
language toggle wants; naming a language explicitly is the shape a settings
screen with one button per language wants.

Nothing else is generated, and nothing else is needed:

- **Labels re-read their own text.** `lv_label.c` handles
  `LV_EVENT_TRANSLATION_LANGUAGE_CHANGED` internally, and `ui.c` gives each
  translated label its tag with `lv_label_set_translation_tag()`.
- **Checkboxes, textareas and dropdowns** get a generated callback each, because
  `lv_label` is the only widget in LVGL that handles the event itself.
- **Per-language fonts follow too.** A typography with a language override has
  its style's font swapped by `ui_typography_language_cb`, registered on the
  first screen — `lv_translation_set_language()` walks every screen of every
  display, so an inactive screen is updated as well.

Two cases generate nothing rather than something that would half-work: a
language code the project no longer has (deleted after the event was bound), and
cycling in a project with a single language.

## 4. Testing it

### 4.1 In the browser — 🎛️ Emulator

The **🎛️ Emulator** tab compiles the generated C against a real LVGL and runs
it as WASM, with mouse and keyboard forwarded. Clicking the button there runs
the real `ui_events.c` handler, so a language switch is fully exercised —
including the font swap, which is where a missing glyph range shows up.

This needs the compile server: the `/api/emulator/build` endpoint in
`vite-plugin-emulator.ts` runs `emcc` against LVGL built from source with
`wasm/lv_conf.h` (`LV_USE_TRANSLATION 1`). The toolchain is searched for rather
than assumed, and installed by `npm run emulator:setup` where it is absent — see
[emulator.md](./emulator.md). Where it is still missing the tab says so, with the
command that provides it, before anything is compiled.

### 4.2 On hardware — the Deploy panel

All three board templates ship `LV_USE_TRANSLATION 1`
(`firmware/*/include/lv_conf.h`), so a flashed build switches language for real.
This is the only test that covers what actually matters on a device: whether the
font carries the glyphs of the language being switched to. See
[charset-trimming-design.md](./charset-trimming-design.md) — the character set
is collected from every language's column, so a translation added after a font
was converted needs the font rebuilding.

### 4.3 What each level does not cover

The editor has a fourth level this table omits, **Simulator**. It is left out
because it cannot exercise a language switch at all: switching is an event
action, and `editorStateToJson.ts` carries no events across to it. For the full
ladder and what separates the four, see
[preview-ladder.md](./preview-ladder.md) §1.

| | Canvas 🌐 | Emulator | Hardware |
| --- | --- | --- | --- |
| Translations complete | ✅ | ✅ | ✅ |
| Event actually wired to the button | ❌ | ✅ | ✅ |
| Generated C compiles | ❌ | ✅ | ✅ |
| Glyphs present in the built font | ❌ | ✅ | ✅ |
| Flash and RAM cost of the fonts | ❌ | ❌ | ✅ |
| Panel legibility of CJK at size | ❌ | ❌ | ✅ |

## 5. Doing it by hand

The action generates one call, so custom C code reaches the same place:

```c
lv_translation_set_language("zh-TW");
```

Worth knowing for a switch that has to be driven by something the editor does
not model — a Modbus register, a boot preference read from flash — where the
built-in action has no trigger to hang from.
