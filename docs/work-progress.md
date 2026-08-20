# The Work pane

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/work-progress.md">繁體中文</a>
</p>

Every long-running operation the session has started, newest first, in the
first tab of the bottom dock. Eclipse's Progress view is the model; the
differences from it are the interesting part. Verified against the source, not
from memory.

## 1. What it is for

The two log panes beside it answer *what did it say*. Work answers the three
questions a log cannot:

- **What is running right now, and how far in is it?**
- **What ran earlier this session, and how did each one end?**
- **Can I stop this one?**

The second is the difference from Eclipse. There, a finished job is swept out of
the view; here a finished item stays until the app closes. "What did that build
twenty minutes ago actually say" should not require running another one.

The history is **memory only and never persisted**, the same choice
`factoryDevMode` makes: it is about this sitting, not about the project.

## 2. A row

```
 #   time      name              progress            action
┌──────────────────────────────────────────────────────────────┐
│ 2  23:33:20  Build Firmware   ▓▓▓▓▓▓▓▓▓▓ 585/585      ✓      │
│              Firmware build complete, buildId: 9c887a5b…     │
│ 1  23:32:25  Build Firmware   ▓▓▓▓▓▓▓░░░ 458/585      ⊘      │
│              Firmware build stopped.                         │
└──────────────────────────────────────────────────────────────┘
```

The columns are as specified — id from 1, time, name, progress bar, and an
untitled column carrying either a stop button or an outcome mark. Three things
were added on top, each because the table alone leaves a question open:

- **A detail line under each row.** The most informative part of the Eclipse
  view is its subtitle, and it costs nothing here: while running it is the most
  recent output line, and when finished it is how the operation ended.
- **Elapsed rather than a second clock.** A finished row says *Finished in 45s*;
  a running one counts up. The start time answers "which run was that"; elapsed
  answers "how long am I waiting", which is the question actually being asked.
- **A grid rather than a `<table>`.** Every row carries that detail line under
  its middle columns, which a table can only do with a second `<tr>` kept in
  step with the first. The columns still line up, which is what a table was for.

## 3. Progress: determinate when it can be, honest when it cannot

Ninja counts its own work — `[263/585] Building C object …` — and that line is
already streaming past ([streaming-build-log.md](./streaming-build-log.md)). So
the bar reads the count back out of the log and needs nothing from the build
system:

| Phase | Bar |
|---|---|
| CMake configuring, dependencies downloading | **Indeterminate** — a sweep, claiming no fraction it does not know |
| Compiling | **Determinate**, from `[N/M]` |
| Finished successfully | Filled |
| Stopped or failed | **Left where it stopped** — a build that died at 458/585 should still say 458/585 |

That last row is deliberate. A bar that snaps to full on failure tells the
reader the opposite of what happened.

Flashing has no counter and stays indeterminate throughout.

## 4. The stop button, and why it is per item

The specification said *if allowed*, and that conditionality earns its keep
immediately, because the two operations differ:

| | Cancellable | Why |
|---|---|---|
| **Build Firmware** | **Yes** | It writes to a scratch directory. Killing it costs the build and nothing else |
| **Flash & Reset** | **No** | It writes to the board. A half-written image is worse than a slow one |

So the column shows a stop button only for work that is running *and* declares
itself cancellable; everything else shows its outcome mark — `✓` finished, `✕`
failed, `⊘` stopped, and a spinner while running uncancellably.

Cancelling is real, not cosmetic. The chain, all of which had to be built:

```
work row stop button
  → deployStore's cancel handle
  → POST /api/hmi/build-cancel/:runId
  → HmiService.cancelBuild  → AbortController for that run
  → runExecutable's signal  → child.kill()
```

`runExecutable` gained a `signal` option beside the `onLine` it already had, and
only the streaming path honours it — the buffered callers are short enough that
there is nothing to interrupt. The run id doing the routing is the same one the
log stream already uses, so cancellation cost no new identity.

A cancel that arrives after the build has finished is **not an error**: the
endpoint reports `cancelled: false` and the client ignores it. It is a race the
client lost, not a fault.

## 5. Where the dock is, and the lamp

The dock is available **on every tab**. Work lists operations that outlive the
tab they were started from — a build keeps running while its author designs a
screen — so hiding it somewhere would hide the one view that is never
tab-specific. Expansion is the author's choice alone, from the chevron; nothing
opens or closes it automatically except the Deploy card's own buttons, which
bring their output forward when pressed.

Because the dock can sit collapsed on any tab, it needs one signal: **a red lamp
at the right of the tab strip whenever anything is running**, gone the moment
nothing is. It breathes rather than blinks — a blink demands attention, and a
two-minute build should not demand attention for two minutes — and it carries
the name of what is running in its tooltip. It replaced a per-tab marker, which
said the same thing three times and said nothing while collapsed.

## 6. Measured

Two runs, both watched from the **Design** tab to prove the dock is not
tab-specific:

| id | time | status | count | bar | mark | title | detail |
|---|---|---|---|---|---|---|---|
| 2 | 23:33:20 | succeeded | 585/585 | 100 % | `✓` | Finished in 45s | `Firmware build complete, buildId: 9c887a5b…` |
| 1 | 23:32:25 | cancelled | 458/585 | 78 % | `⊘` | Stopped in 29s | `Firmware build stopped.` |

Item 1 was stopped by hand at 458/585 and the compiler really stopped counting;
item 2 ran to completion afterwards. The lamp was lit throughout both and absent
between and after. No console errors.

## 7. Left for later

- **Factory mode.** The two log panes are candidates for being hidden behind it,
  leaving Work as the everyday view. Nothing here assumes either way.
- **Clicking a row.** A row does not yet open the log it produced. Doing that
  properly means each run owning its own log rather than the pane holding only
  the latest, which is a bigger change than this one.
- **More producers.** `useWorkStore.start(name, { cancellable })` is all a new
  operation needs; nothing in the pane knows about building or flashing
  specifically.
