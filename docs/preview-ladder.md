# The preview ladder — three previews, one Deploy, and what each proves

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/preview-ladder.md">繁體中文</a>
</p>

Why the Preview tab has three sub-tabs, what separates them, how **Build & Run**
relates to **Deploy**, which of the answers were already written down somewhere
else, and — measured against what the product promises — **which single one
would be worth keeping if only one could be** (§8). Verified against the source,
not from memory.

Until now this was recorded only in fragments — [animation-model.md](./animation-model.md)
knows what Quick Preview honours, [language-switching.md](./language-switching.md)
§4.3 has a coverage matrix that omits one of the three,
[font-integration.md](./font-integration.md) and
[charset-trimming-design.md](./charset-trimming-design.md) describe the compile
path, and [lvgl-configuration.md](./lvgl-configuration.md) covers where the
previews' LVGL config diverges from the board's. No document held the ladder
itself, and three of those fragments were wrong; §6 records what they said and
what corrected them.

## 1. The four rungs at a glance

Each rung runs *more of the real thing* than the one below it, and costs more to
reach. That is the whole design, and it is a good one.

| | 📱 Quick Preview | 🖥️ LVGL Preview | 🔨 Build & Run | 🚀 Deploy |
|---|---|---|---|---|
| **What draws it** | The editor itself, HTML5 Canvas 2D | **Real LVGL**, prebuilt as WASM | **Real LVGL + the generated C**, compiled on demand | Real LVGL + the generated C, on the MCU |
| **What it is fed** | The editor store, directly | A UI-description JSON | Every generated `.c`/`.h`, plus converted fonts and images | The whole project file |
| **Where the C comes from** | There is none | There is none | `generateCode()` in the browser | The same `generateCode()`, on the server |
| **Toolchain needed** | None | None — the `.wasm` is checked in | `emcc` on the dev server | CMake + Ninja + arm-none-eabi + STM32_Programmer_CLI |
| **Latency** | Instant, live | Live, 300 ms debounce | Seconds to tens of seconds | Minutes |
| **Interaction** | Simulated clicks, screen navigation, animations | None | Mouse and keyboard forwarded into LVGL | The panel's own touch screen |
| **Implemented in** | `Preview/PreviewPanel.tsx`, 2038 lines | `WasmPreview/WasmPreview.tsx`, 114 lines | `CompilePreview/`, 447 lines + `compilerService.ts` | `DeployPanel.tsx` + `server/hmi/` |

The useful way to read that table is by asking what each rung can be *wrong*
about, which is §2 to §5.

## 2. 📱 Quick Preview — the editor's own drawing

`PreviewPanel.tsx` renders every widget onto a `<canvas>` with 2D drawing calls
written by hand in TypeScript (`canvasRef`, `getContext('2d')`, then two thousand
lines of shape drawing). LVGL is not involved at any point.

It does more than draw. It hit-tests clicks against components, runs their event
bindings (`hit.events` → `runActions`, including `navigate`), plays animations
and honours entry animations on screen load — which is why
[animation-model.md](./animation-model.md) treats it as the reference for
animation behaviour.

**What it proves:** geometry, layout, colours, screen flow, and animation timing
— as the editor understands them.

**What it cannot prove:** that LVGL agrees. Every pixel here is the editor's
second opinion about what LVGL would do. A style LVGL applies differently, a
layout rule the canvas code approximates, a font metric that differs — none of
it can show up on this rung. Nor can anything about the generated code, because
none is generated.

**Its real job** is being instantaneous. It is the rung you keep open while
dragging widgets around, and its accuracy budget should be spent accordingly.

One structural note, because it matters to §8: the **Design canvas is a separate
renderer again**. It draws with DOM and CSS (`Canvas/CanvasComponent.tsx`, 1074
lines) while this rung draws with Canvas 2D (2038 lines), and the two share no
drawing code. So the editor carries *two* independent hand-written imitations of
LVGL's appearance, and neither can be right by construction — LVGL is in
neither. Quick Preview's genuine addition over the Design canvas is animation
playback and click-through navigation.

## 3. 🖥️ LVGL Preview — real LVGL, but not your code

`WasmPreview.tsx` is 114 lines because it does almost nothing itself: it hosts
an `<iframe src="/wasm/lvgl_wasm.html">` and posts a message into it.

The interesting part is what it posts. `editorStateToJson.ts` (149 lines) turns
the current screen into a **UI-description JSON** — components, geometry, and
the `default` / `pressed` / `focused` / `disabled` style blocks — and the
prebuilt LVGL WASM in `public/wasm/lvgl_wasm.{js,wasm}` (1.3 MB, checked in)
builds real `lv_obj`s from it. Changes re-post after a 300 ms debounce.

**What it proves:** that **real LVGL**, with real style handling and real font
rendering, draws your screen this way. That is a genuinely different claim from
rung 1, and it is available with no toolchain at all.

**What it cannot prove:** anything about your code, because there is none. And
one specific thing worth stating because a document elsewhere gets it backwards:
**`editorStateToJson.ts` contains no mention of events.** Grep it. Screens and
styles cross the bridge; event bindings do not, and logic graphs do not. This
rung is a renderer, not a runtime.

**And, until recently, not at your resolution either.** `wasm/src/main.c` created
its display with a hard-coded `lv_sdl_window_create(480, 320)` — a size matching
no board here — and `set_screen_size` was a stub that took the editor's numbers
and dropped them. So every claim above was being made about a screen the wrong
size, which moves anything anchored to an edge or centred. It survived because
480x320 is landscape and close enough to 480x272 to look plausible; adding
portrait projects is what made it obvious (see
[display-orientation.md](./display-orientation.md) §4.4). `main.c` now resizes
through `lv_sdl_window_set_size`, and `WasmPreview.tsx` measures the canvas it
actually got and says so in the footer when the runtime ignored the request —
which a checked-in `.wasm` built before this change still does, until it is
rebuilt.

## 4. 🔨 Build & Run — the first rung that tests the product

`CompilePreview` calls `generateCode(...)` — the same generator the export and
the firmware build use — hands **every returned file** (`ui.c`, `ui_events.c`,
`ui_logic.c` and their headers) plus generated image C arrays and
`lv_font_conv`-converted fonts to `POST /api/compile`, and `vite-plugin-compile.ts`
shells out to **`emcc`** to compile all of it against LVGL built from source.
The resulting `output.js` / `output.wasm` are loaded back into the page and
driven through a `WasmRuntime` handle: `tick()`, `mouseEvent()`, `keyEvent()`,
`getFramebuffer()`.

**What it proves, and nothing below it can:**

- **The generated C compiles.** Every codegen bug that produces invalid C
  surfaces here and nowhere earlier.
- **Events are actually wired.** `ui_events.c` runs for real, so a button that
  generates a handler nothing attaches shows up as a dead button.
- **Logic graphs run.** `logicGraphs` is passed into `generateCode`, `ui_logic.c`
  is emitted and forwarded to the compiler, and `ui_events.c` includes
  `ui_logic.h`. This rung is the *only* preview that executes a logic graph.
- **Fonts contain the glyphs.** The font conversion runs with the same charset
  collection the firmware build uses, so a missing CJK range appears as tofu
  here rather than on the panel ([charset-trimming-design.md](./charset-trimming-design.md)).

**What it cannot prove:** flash and RAM cost, real timing, anything touching the
panel or the bus, and anything a difference in LVGL configuration hides — see §5.

**What it needs:** `emcc`, on the machine running the dev server. The toolchain
paths at the top of `vite-plugin-compile.ts` are absolute, so where the
toolchain is absent this rung reports a compile error rather than degrading
([language-switching.md](./language-switching.md) §4.1).

## 5. 🚀 Deploy — and no, it does not make Build & Run redundant

The question is fair, because the two do share something real: **the same
`generateCode()`**. `server/hmi/projectSource.ts` imports it from
`src/codegen/generator`, exactly as `CompilePreview` does in the browser. There
is one code generator in this project, called from two places. That is the
overlap, and it is the *good* kind — the alternative would be two generators
drifting apart.

Everything after that differs:

| | Build & Run | Deploy |
|---|---|---|
| Where codegen runs | In the browser | On the server, from the project file |
| Compiler | `emcc` → WASM | CMake + Ninja + arm-none-eabi → `.elf` |
| LVGL config | `wasm/lv_conf.h` (+ `generateCustomLvConf()`) | `firmware/<board>/include/lv_conf.h` |
| Where it runs | A canvas in the page | The MCU |
| Input | Mouse and keyboard | The capacitive touch panel |
| Protocol | Bindings compiled; nothing on the other end of a wire | The real runtime on a real COM port |
| Failure looks like | A compile log | A board that boots, or does not |
| Cost | Seconds | Minutes, plus a cable |

So the two answer different questions. Build & Run answers *"does what I
generated work?"* in seconds, with no hardware, and it is the fastest place to
find a codegen bug. Deploy answers *"does it work on the thing I am shipping?"*
— memory, timing, the panel, the bus — and it is the only rung that can.

**The one real risk in the overlap** is not duplication, it is **divergence**:
two different `lv_conf.h` files sit behind two rungs that are supposed to agree.
[lvgl-configuration.md](./lvgl-configuration.md) already records where they part
company, and [charset-trimming-design.md](./charset-trimming-design.md) §8
records the same hazard for fonts and gives the rule that fixed it — put the
shared step in `src/codegen/` so both callers get it. That rule is the thing
protecting the ladder, and it is worth applying deliberately whenever a new
step is added to either path.

Two smaller notes on Deploy's side:

- Codegen is **not** gated by the Code tab. Hiding that tab in factory mode
  still leaves `generateCode()` running for Build & Run and for this build
  ([factory-dev-mode.md](./factory-dev-mode.md)) — the two rungs that call it.
- `Build & Run` can be switched off entirely at build time —
  `VITE_ENABLE_COMPILE_PREVIEW=false` (`App.tsx:84`) removes the tab, and a
  project left on that mode falls back to another rung.

## 6. Where the existing record leaked

Three problems, found while checking the above. All three have been fixed; what
follows is the record of what was wrong, and the rule that keeps it from
recurring.

**The name "WASM preview" carries two meanings, and a blanket rename would be
wrong.** Both rung 2 and rung 3 are WASM, so the phrase looks ambiguous — but a
survey of its ~90 occurrences across `docs/` shows it is used consistently in
two distinct senses, and only one of them is a problem:

| Where | What it means there | Verdict |
|---|---|---|
| `docs/components/*` — 42 files, always spelled "LVGL WASM preview" and cited beside `ui_from_json.c` | **Rung 2, LVGL Preview** | Correct in context. Leave it |
| [lvgl-configuration.md](./lvgl-configuration.md), [lvgl-version.md](./lvgl-version.md), [color-depth.md](./color-depth.md), [text-typography-evaluation.md](./text-typography-evaluation.md) | The shared **`wasm/` build tree** — `wasm/lv_conf.h`, `wasm/build.sh` — which feeds rung 2's checked-in artifacts *and* rung 3's on-demand compile | Not renameable to either rung; it genuinely is both |
| [logic-event-trigger.md](./logic-event-trigger.md), [factory-dev-mode.md](./factory-dev-mode.md) | Meant to be a **rung**, and named the wrong one | **Was wrong. Fixed** |

The rule that follows: **name the rung when the sentence is about a rung; say
"the `wasm/` build tree" when it is about build inputs.** The phrase "the WASM
preview" is only a defect in the first case, which is the case both corrected
documents were in.

**[logic-event-trigger.md](./logic-event-trigger.md) attributed rung 2's limits
to rung 3.** It read: *"The **WASM preview** (Build & Run) ignores logic graphs
entirely — `editorStateToJson.ts` exports screens, styles and events, but no
graphs."* Three things were wrong with that sentence:

1. `editorStateToJson.ts` lives in `src/components/WasmPreview/` and belongs to
   **LVGL Preview**. Build & Run does not use it at all.
2. It exports **no events**. The file contains no occurrence of the word.
3. Build & Run does **not** ignore logic graphs — it passes them to
   `generateCode`, compiles the resulting `ui_logic.c`, and `ui_events.c`
   includes `ui_logic.h`.

The true statement is the one this document's §3 and §4 make: *LVGL Preview*
carries neither events nor graphs, and *Build & Run* is the only preview that
runs either.

Also corrected: **[factory-dev-mode.md](./factory-dev-mode.md) listed rung 2 as a
`generateCode()` consumer.** It said generation still runs "for the WASM preview,
the Build & Run flow and project export". LVGL Preview calls `generateCode()`
nowhere — its four callers are `CodePanel`, `CodePreview`, `CompilePreview` and
`server/hmi/projectSource.ts` — and of those, the first two are the Code tab
that the flag hides. The two that survive the flag are Build & Run and the
Deploy build, which is what it now says.

**[language-switching.md](./language-switching.md) §4.3's coverage matrix has
three columns and there are four rungs.** It compares "Canvas 🌐", Build & Run
and Hardware, and predates or omits LVGL Preview. It is not wrong about what it
lists; it was incomplete, and a reader using it to choose a rung would not learn
that rung 2 exists. It now says why rung 2 is absent — a language switch is an
event action, and rung 2 carries no events — and links here.

## 7. Opinions, for when this is worth acting on

The three defects of §6 are fixed. What remains, in rough order of value:

1. **Keep one coverage matrix, in one place** — this document's §1 — and have
   `language-switching.md` §4.3 and any future equivalent link to it rather than
   restate it with a column missing. Restated tables drift; the one in §4.3
   already had.
2. **Make the `lv_conf.h` divergence checkable rather than remembered.** Two
   configurations behind two rungs that must agree is exactly the shape that
   produces "it looked right in the preview". A generated diff, or a test that
   asserts the fields the previews rely on match the board's, would turn a
   discipline into a check.
3. **Say on each rung what it cannot prove.** The ladder's danger is a green
   result at the wrong altitude — a screen that draws correctly in Quick Preview
   and has never had a line of its C compiled. One line of text per tab, taken
   from §2–§5, costs nothing and prevents the misreading the ladder invites.

## 8. If only one preview could be kept

Not a plan to remove anything — a way of ranking the three by what the product
actually promises, which is *you do not write code and we produce C that runs*.
Measured against that sentence the answer is not close.

**Keep 🔨 Build & Run.**

- **It is the only rung that tests the deliverable.** The product's output is
  generated C. Every other rung tests a picture of the output.
- **It is the only rung that catches a failure the author cannot fix.** C that
  does not compile is the tool's fault and the user's dead end. It surfaces
  here or on a flashed board, nowhere in between.
- **It is the only rung that runs events and logic graphs** (§4). A no-code tool
  whose logic can only be exercised by flashing hardware has failed the audience
  it was built for.
- **It subsumes the other two.** Keep it and the author still sees the screen,
  clicks it, tests a language switch, and finds a missing glyph.

**Why the other two are the ones to lose:**

*LVGL Preview is strictly dominated.* Its unique claim is "real LVGL with no
toolchain" — but Build & Run is also real LVGL, plus your code, your events and
your graphs. Rung 2 exists to dodge the `emcc` dependency. Remove the dependency
and the claim is empty.

*Quick Preview's loop is mostly the Design tab's loop.* And there is a fact
behind that worth stating plainly: the Design canvas renders with **DOM and CSS**
(`Canvas/CanvasComponent.tsx`, 1074 lines) while Quick Preview renders with
**Canvas 2D** (`Preview/PreviewPanel.tsx`, 2038 lines). They share no drawing
code. **That is two independent hand-written imitations of LVGL's appearance,
about 3,100 lines together, neither of which can ever be right by construction**,
because LVGL is in neither. The same screen has three answers in this tool and
two of them are guesses. Quick Preview's genuine addition over the Design canvas
is animation playback and click-through navigation — real, and small.

**The bill attached to this answer.** The highest-value rung is also the one most
likely to be broken on arrival. `vite-plugin-compile.ts:44` defaults the
toolchain to someone else's Linux workspace:

```ts
const EMSDK_ENV =
  process.env.EMSDK_ENV ?? '/home/xcssa/.openclaw/workspace/tools/emsdk/emsdk_env.sh';
const LVGL_ROOT = process.env.LVGL_ROOT ?? '/home/xcssa/.openclaw/workspace/tools/lvgl';
```

Both are overridable by environment variable, so this is **configuration, not
architecture** — but it means *"keep Build & Run"* and *"make the `emcc` path
dependable"* are one decision, not two. Choosing the first without paying for
the second leaves the product's only real verification rung reporting a compile
error.

**The one condition that flips the answer.** If that bill genuinely cannot be
paid — shipping to end users who will never have a toolchain — then keep
**LVGL Preview** instead, because it is the only rung that is real LVGL with a
checked-in binary and zero setup. That is second best, not first.

**Deploy is not a candidate.** It is not a preview; it is the product's output
path. Worth noting in passing that keeping Build & Run also keeps Deploy honest:
the two share `generateCode()` (§5), so **Build & Run is the only thing that
exercises the deploy path daily.**
