# The Emulator — the rung that runs your code, and what it took to make it start

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/emulator.md">繁體中文</a>
</p>

The third rung of the [preview ladder](./preview-ladder.md) used to be called
**Build & Run**, and on a fresh checkout it did neither. This document is the
plan that changed both: **why the name was wrong**, **why it could not start**,
**what was decided**, and **what the decision does not fix**.

It is the follow-through on [preview-ladder.md](./preview-ladder.md) §8, which
ranked this rung first among the three and then attached a bill to that answer:

> *"keep Build & Run" and "make the `emcc` path dependable" are one decision,
> not two. Choosing the first without paying for the second leaves the product's
> only real verification rung reporting a compile error.*

This is the bill being paid.

## 1. What the rung actually is

Real LVGL, compiled from source, linked against **the C this product generated
from your screens**, running in the page with your mouse and keyboard forwarded
into it. Not a drawing of your screen — your screen, running.

That is an **emulator**: the panel, without the panel. Everything the product
promises is on the other side of it, and it is the only rung on which the
promise can fail visibly before hardware is involved (ladder §4, §8).

## 2. Why "Build & Run" was the wrong name

Three reasons, in increasing order of what they cost.

**It named the button, not the place.** The other two sub-tabs are named for
what they show — *Quick Preview*, *LVGL Preview*. This one was named for the
verb on the button inside it. A tab strip that reads as two nouns and an
imperative does not read as a ladder, and the ladder is the whole design.

**"Build" was already taken, twice.** Deploy builds firmware and says
"Building…" while it does; `npm run build` builds the web app. Prose had to
disambiguate every time — in the documents as they stood before this change,
[preview-ladder.md](./preview-ladder.md) §5 has to write "the Build & Run
build", which is nobody's first draft.

**It undersold the rung to the audience it was built for.** "Build & Run" is a
developer's phrase for a developer's convenience. The person this product is for
does not write code and does not want a build; they want to see the panel work.
*Emulator* is the word for that, and it is the more honest one — §4 of the
ladder is a list of things this rung proves that no amount of previewing can.

The button keeps a verb, because a button should have one: **Start** and
**Stop**. The tab is a place; the button is an action. That distinction is the
fix.

## 3. Why it could not start

Five defects, each verified in the source before this change. The first three
stop the toolchain from being found; the last two stop it from being used even
when it is there.

### 3.1 The toolchain pointed at a machine that is not yours

`vite-plugin-compile.ts:43-45`, as it stood:

```ts
const EMSDK_ENV =
  process.env.EMSDK_ENV ?? '/home/xcssa/.openclaw/workspace/tools/emsdk/emsdk_env.sh';
const LVGL_ROOT = process.env.LVGL_ROOT ?? '/home/xcssa/.openclaw/workspace/tools/lvgl';
```

Absolute paths inside one contributor's Linux home directory, as the **default**
for everyone. `wasm/build.sh:7` and `wasm/build_lvgl_lib.sh:7,9` carried the
same two paths again, hardcoded with no environment override at all, and
`src/codegen/__tests__/compile.test.ts` carried a fourth copy (§3.5).

The failure this produces is the one that started this work:

```
emcc toolchain unavailable:
- emcc is not on PATH and no emsdk env script at /home/xcssa/.openclaw/workspace/tools/emsdk/emsdk_env.sh
- LVGL checkout not found at /home/xcssa/.openclaw/workspace/tools/lvgl
```

Two of those lines name a stranger's directory. Neither says what to do.

### 3.2 The LVGL it wanted was already on the disk

The pin the firmware builds against is recorded in
[lvgl-version.md](./lvgl-version.md): LVGL **v9.5.0**, commit `85aa60d`,
installed by `firmware/<board>/scripts/bootstrap-deps.ps1` into that board's
`.hmi-cache/Middlewares/Third_Party/lvgl`. On any machine that has built
firmware once, **that directory exists and holds exactly the checkout this rung
was reporting as missing.** On the machine this was diagnosed on there were two
of them, one per board, both at the pin.

It was never looked for. The Emulator asked one hardcoded path and gave up.

Worse, the two were never required to agree: the firmware pins a commit, and
this rung compiled "whatever is checked out over there" — the divergence hazard
[preview-ladder.md](./preview-ladder.md) §5 names as the one real risk in the
overlap between the Emulator and Deploy.

### 3.3 `bash` was assumed, and `emsdk_env.sh` cannot set an environment on Windows

The compile commands are bash scripts (`find`, `while read`, `sed`), so the
plugin needs a POSIX shell even when `emcc` is on PATH. It looked for one by
running `bash` and taking whatever PATH returned, and it reached emcc by
`source`-ing `emsdk_env.sh`. On Windows both halves fail, and neither failure is
obvious:

- **Git for Windows installs `bash.exe` into a directory it does not add to
  PATH.** The default installation puts `C:\Program Files\Git\cmd` on PATH,
  which holds `git.exe` and not `bash.exe`. A machine with a perfectly good bash
  reports "bash not found".
- **Something else answers instead.** On the machine this was diagnosed on,
  `bash` resolved to `C:\ST\STM32CubeCLT_1.22.0\Make\bin\bash.exe` — a shell
  that arrived with the ST toolchain, that the product never chose, and whose
  `uname` prints nothing. It is not an MSYS shell, which matters in §4.1.
- **`source emsdk_env.sh` exports nothing.** The script runs `emsdk construct_env`
  through `python3`; under MSYS that name hits the Microsoft Store's placeholder
  executable, which prints an advertisement to stderr and exits. Measured
  directly, with a working Emscripten 6.0.8 installed:

  ```
  $ source .hmi-cache/emulator/emsdk/emsdk_env.sh
  Python was not found; run without arguments to install from the Microsoft Store...
  $ echo "EMSDK=$EMSDK"
  EMSDK=
  $ command -v emcc
  (nothing)
  ```

  So even after a correct install, the compiler stayed unreachable.

### 3.4 The LVGL library was a manual step nobody mentions

Even with a toolchain, the build needed `wasm/build/liblvgl_emcc.a` to exist,
and nothing produced it. The plugin could build a per-project library —
`buildLvglLib()` behind `POST /api/project/build-lvgl` — but **no client ever
called either**: `compilerService.ts` sent `{ files, fonts, width, height }` and
never an `lvglConfig`, so every request took the default path, which only
checked whether the file was there and otherwise answered:

```
liblvgl_emcc.a not found at …/wasm/build/liblvgl_emcc.a.
Run wasm/build_lvgl_lib.sh first (or set LVGL_LIB).
```

True, and useless: that script is mentioned in no product surface, and it could
not have succeeded anyway. It compiles **every** `.c` under `lvgl/src`, and
`wasm/lv_conf.h` sets `LV_USE_SDL 1` for rung 2's benefit, so the six files
under `src/drivers/sdl/` stop the build on `fatal error: 'SDL2/SDL.h' file not
found`. With `set -e` at the top, the first one ends it.

### 3.5 The tests that verify the product's core claim were skipping

`src/codegen/__tests__/compile.test.ts` generates C with `generateCode()` and
compiles it — 48 tests whose entire subject is *the C this product emits is
valid C*. Its toolchain block was a fourth copy of the paths in §3.1, so
`describe.skipIf(missing.length > 0)` was true on every machine and the suite
reported "48 skipped" forever. The product's strongest safety net was switched
off by a default value.

## 4. The decision

Four parts, in the order a person meets them.

### 4.1 Discover, do not assume

One resolver, [`server/emulator/toolchain.ts`](../server/emulator/toolchain.ts),
with an ordered search per tool and a **stated reason for the order**. Explicit
configuration always wins; after that the pinned copy this repository installed;
after that the machine's own.

| | Order |
|---|---|
| **LVGL** | `LVGL_ROOT` → `.hmi-cache/emulator/lvgl` → any `firmware/*/.hmi-cache/…/lvgl` |
| **emcc** | `EMSDK_ENV` → `.hmi-cache/emulator/emsdk` → `EMSDK` → `~/emsdk`, `/opt/emsdk`, `C:\emsdk` → `emcc` on PATH |
| **bash** | `HMI_BASH` → (Windows) beside `git`, then the usual Git for Windows locations → PATH |

Four things about that table are deliberate.

**Every candidate is confirmed by a sentinel**, never by the directory existing:
`src/lv_init.c` for LVGL, an `emcc` launcher under `upstream/emscripten/` for
emsdk, and for the shell, actually running `-c "exit 0"`. A half-extracted cache
directory is not a toolchain and should not be reported as one.

**The repo-local pin outranks PATH.** A pin exists to make two build logs
comparable, and an ambient emcc quietly outranking the version the project
installed is the class of difference that only ever surfaces in somebody else's
failure. Whichever copy wins is named in the status panel, so it is never a
mystery which one ran.

**On Windows, Git Bash outranks PATH** — the one inversion in the table. It is
not tidiness. The compile reaches emcc through a PATH this process injects, and
only an MSYS shell rewrites an inherited Windows PATH into a form its own
command lookup can use. The non-MSYS bash from §3.3 starts fine and then cannot
find a compiler that is sitting right there. `git` is not optional — the
repository was cloned with it — and Git for Windows keeps `bash.exe` one
directory across from `git.exe`, which makes the shell findable from the tool we
know is installed. On Linux and macOS, PATH is the system shell and goes first.

**The environment is built, not sourced.** Instead of `source emsdk_env.sh`,
the resolver reads the tool paths `emsdk activate` recorded in `.emscripten` and
hands the compile `EMSDK`, `EM_CONFIG`, `EMSDK_PYTHON`, `EMSDK_NODE` and a
prepended `PATH` directly. That works on every platform, and it is what makes
§3.3's third bullet stop mattering.

Reusing the firmware board's LVGL is worth stating twice: it costs nothing, it
is already the right commit, and it makes **the two rungs share one LVGL by
construction** rather than by discipline — closing §5 of the ladder's hazard on
the LVGL source side.

### 4.2 Provide what is missing, with one command

```bash
npm run emulator:setup
```

[`tools/bootstrap-emulator.mjs`](../tools/bootstrap-emulator.mjs), following the
convention `firmware/<board>/scripts/bootstrap-deps.ps1` already set: pinned
versions, a gitignored cache, an archive matched **by the commit GitHub stamps
into the zip** rather than by filename, and a sentinel checked after extraction.
Node rather than PowerShell, because this path has to work wherever the dev
server runs and node is already required to run it.

| Dependency | Pin | Where it comes from |
|---|---|---|
| LVGL | `v9.5.0`, commit `85aa60d` — **the same pin as the firmware** | A firmware board's cache when one is already populated; otherwise `firmware/vendor/*.zip` matched by commit; otherwise codeload |
| Emscripten | `6.0.8` | `emsdk install` / `activate` into `.hmi-cache/emulator/emsdk` |

Nothing lands outside `.hmi-cache/`, which `.gitignore` already covers, and
nothing is installed system-wide. Deleting that directory undoes the whole thing.

Two consequences of installing a toolchain inside the working tree, both handled
rather than discovered later: `eslint.config.js` and the Vitest `exclude` list
now ignore `.hmi-cache/`. Emscripten ships tens of thousands of files including
its own test suite and deliberately malformed JS fixtures, and without those two
lines `npm run lint` reports 233 errors from Emscripten's tree and `npm test`
runs Emscripten's tests.

**The honest cost:** Emscripten is about 700 MB compressed and takes several
minutes on a first run. The command says so before it starts.

### 4.3 Build the LVGL library on demand, and cache it

[`server/emulator/lvglLib.ts`](../server/emulator/lvglLib.ts) replaces §3.4's
manual step. The library is a build product with a cache keyed by **the
configuration that produced it** — the generated `lv_conf.h`, the LVGL path, and
the compiler — so editing `wasm/lv_conf.h` or pointing at a different LVGL
rebuilds, and nothing else does.

- **Its `lv_conf.h` is the `wasm/` tree's with `LV_USE_SDL` forced to 0.** This
  rung flushes into its own framebuffer and never touches SDL; leaving the
  switch on is what made §3.4's build fail. `src/drivers/` is skipped from the
  source list for the same reason.
- **The build is a script written to disk, not a `bash -c` string**, so a
  failure leaves the exact script that failed next to its log.
- **It compiles in parallel**, one job per core rather than the original serial
  loop, and **streams its output to the dev server's terminal** so a first build
  is not several minutes of silence.
- **Objects are named by their path below `src/`**, not by a flattened absolute
  path — which on Windows carries the drive colon, an illegal filename
  character, and is long enough to reach `MAX_PATH` on the way.

The link step no longer goes through a shell at all: `emcc` is invoked directly
with an argument array, which removes the need to quote
`-sEXPORTED_FUNCTIONS=[…]` correctly on two platforms.

### 4.4 Say what is missing, and the command that fixes it

`GET /api/emulator/toolchain` reports the resolution — every tool, whether it was
found, which candidate won, and the pin it matched. The Emulator tab asks on
mount, so a machine that cannot build **says so before you press Start**, and
Start is disabled rather than leading to a compile that was never going to
happen. What the panel shows is the setup command and what it will do, not a
toolchain dump. The rule from commit `7b65574` — *say what a build is doing in
the product's words, not the toolchain's* — applies equally to saying why a
build cannot start.

The same report carries `libraryReady`, so the panel can say **"first run
compiles LVGL from source — a few minutes; every run after that takes seconds"**
exactly once, rather than leaving the first user of a fresh checkout to guess
whether it has hung.

## 5. What was renamed, and what was deliberately left alone

| Surface | Before | After |
|---|---|---|
| Sub-tab | `🔨 Build & Run` | `🎛️ Emulator` |
| Button in it | `🔨 Build & Run` | `▶ Start` / `⏹ Stop` |
| Component | `src/components/CompilePreview/` | `src/components/Emulator/` |
| Client service | `compilerService.ts` | `emulatorService.ts` |
| Dev-server plugin | `vite-plugin-compile.ts` | `vite-plugin-emulator.ts` |
| Virtual module | `virtual:compile-preview` | `virtual:emulator` |
| Build-time switch | `VITE_ENABLE_COMPILE_PREVIEW` | `VITE_ENABLE_EMULATOR` |
| Build endpoint | `POST /api/compile` | `POST /api/emulator/build` |
| Artifact endpoint | `GET /api/build/:id/output.{js,wasm}` | `GET /api/emulator/build/:id/output.{js,wasm}` |
| Preflight | — | `GET /api/emulator/toolchain` |
| Unused endpoint | `POST /api/project/build-lvgl` | removed — it had no caller (§3.4) |
| Unused module | `CompilePreview/cTemplates.ts` | removed — a second copy of the server's `main_wrapper.c`, referenced by nothing |

**`VITE_ENABLE_COMPILE_PREVIEW` still works.** It is in the README's
instructions and in whatever CI a reader has already written; setting either
variable to `false` disables the tab. The old name is documented as deprecated
rather than deleted, because breaking someone's deployment to tidy a variable
name is a bad trade.

**"WASM preview" in `docs/components/*` is still not renamed**, for the reason
[preview-ladder.md](./preview-ladder.md) §6 established: in those 42 files the
phrase means *rung 2*, and it is correct there. This change touches the rung-3
name only.

## 6. What it does now

Measured on the machine from §3.3 — Windows 11, no emcc, no LVGL of its own, a
`bash` on PATH that came from STM32CubeCLT:

| Step | Result |
|---|---|
| `npm run emulator:setup` | Found LVGL v9.5.0 already present from the firmware build; installed Emscripten 6.0.8 into `.hmi-cache/emulator/emsdk` |
| `GET /api/emulator/toolchain` | `ready: true` — bash `beside git`, emcc from the pinned emsdk, LVGL from `firmware/stm32f746g-disco cache`, `pinned: true`, `v9.5.0` |
| First **Start** | LVGL compiled from source, 457 objects, archived; then the project's `ui.c` / `ui_events.c` / `ui_logic.c` compiled and linked to `output.wasm` |
| The panel | 480×272 canvas showing the running screen, mouse and keyboard live |
| `npm test` | The 48 compile-verification tests of §3.5 run instead of skipping |

## 7. What this does not fix

Stated plainly, because a document that only lists wins is not a plan.

- **`lv_conf.h` still diverges.** `wasm/lv_conf.h` and
  `firmware/<board>/include/lv_conf.h` remain two files that must agree and are
  not checked against each other. Sharing the LVGL *source* between the rungs
  does not share their *configuration*. [lvgl-configuration.md](./lvgl-configuration.md)
  records where they part; ladder §7.2 proposes the check that would end it.
  Still open.
- **The project's own LVGL settings still do not reach the Emulator.** A project
  set to RGB565 is emulated at whatever `wasm/lv_conf.h` says, because the
  framebuffer path is fixed at `LV_COLOR_FORMAT_ARGB8888` on both sides of the
  bridge — changing `LV_COLOR_DEPTH` under it needs the flush callback and the
  JS colour conversion changed together. Removing the unused per-project
  endpoint (§5) does not make this worse; it removes the appearance of a feature
  that was never wired.
- **Rung 2's checked-in artifacts are still LVGL 9.2.** `public/wasm/lvgl_wasm.wasm`
  is prebuilt and committed; nothing here rebuilds it. It now *can* be rebuilt on
  any machine — `wasm/build.sh` resolves its toolchain through the shared
  `wasm/toolchain.sh` — but it has not been. See [lvgl-version.md](./lvgl-version.md) §1.2.
- **The library build still needs bash.** Discovery makes the shell dependable;
  it does not remove it. The link step no longer uses one (§4.3), so the
  remaining dependency is the LVGL library build alone. Reimplementing that in
  Node would remove it entirely and allow per-file progress. Not done here.
- **`npm run emulator:setup` needs network.** The offline paths are dropping an
  LVGL archive into `firmware/vendor/` beforehand, which works, and installing
  emsdk yourself anywhere the search in §4.1 looks.

## 8. Related documents

- [preview-ladder.md](./preview-ladder.md) — the four rungs, what each proves,
  and the §8 argument this document acts on
- [lvgl-version.md](./lvgl-version.md) — the pins, and which paths honour them
- [lvgl-configuration.md](./lvgl-configuration.md) — where the two `lv_conf.h`
  files diverge
- [charset-trimming-design.md](./charset-trimming-design.md) — the shared-step
  rule (§8) that keeps the two `generateCode()` callers from drifting
- [factory-dev-mode.md](./factory-dev-mode.md) — why hiding the Code tab does not
  stop codegen
