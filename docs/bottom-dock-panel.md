# A dockable panel above the status bar — evaluation

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/bottom-dock-panel.md">繁體中文</a>
</p>

Status: **evaluated, then built.** §1–§9 are the evaluation as written before
any code existed; §10 records what was implemented and where the evaluation was
wrong. Verified against the source, not from memory.

The proposal: imitate Visual Studio's bottom tool-window strip — a collapsible,
resizable panel occupying the horizontal band **above the status bar**, holding
several switchable panes. Two to begin with, **Build Firmware** and
**Flash & Reset**, shown automatically on the Deploy tab and hidden on the
others.

Verdict up front: **feasible, and the layout half of it is nearly free.** The
cost is not the drawer. It is where the Deploy tab keeps its state.

## 1. The layout is already the right shape

`App.tsx` renders a clean flex column:

```
.app  (display: flex; flex-direction: column; height: 100%)
├── .app-header            fixed height
├── renderMainContent()    .app-body { flex: 1; overflow: hidden; min-height: 0 }
└── <StatusBar />          fixed height
```

The drawer is one more sibling between `renderMainContent()` and `<StatusBar />`
(`App.tsx:656`). Two properties decide whether that works, and **both are already
set**: `.app-body` carries `flex: 1`, `overflow: hidden` **and `min-height: 0`**
(`App.css:140`). `min-height: 0` is the one people forget — without it a flex
child refuses to shrink below its content and the drawer pushes the status bar
off-screen instead of squeezing the workspace.

So the Design canvas, the Preview and every full-panel tab give up height
correctly with **no layout restructuring at all**. That is the single biggest
input to this estimate.

## 2. The interaction parts exist too

This repo has built the same shape before:

| Needed | Already exists | Where |
|---|---|---|
| Drag the top edge to resize | `.panel-grip` — 8 px, `row-resize`, absolutely positioned on the panel's own top edge | `components/panelBar.css:94`, already shared by four panels |
| Pointer-driven resize with min/max clamping | ~30 lines, liftable as-is | `LogicEditor/GraphManager.tsx:24` |
| Collapse chevron | `PanelChevron` | `LogicEditor/` |

One naming note: this codebase already uses **Manager** for content managers —
`GraphManager`, `ScreenManager`, `ProjectManager`. The proposed thing is closer
to a Visual Studio *tool window*. Worth a different word (a **dock** holding
**panes**) so that later conversations stay unambiguous.

## 3. The real cost: Deploy's state is local, and the tab switch destroys it

Everything the drawer would display lives in `useState` inside the component
(`DeployPanel.tsx:72`–`:82`): `busy`, `buildId`, `logs`, `artifactUrl`, `layout`.
And `renderMainContent()` is a `switch` on the active tab, so leaving Deploy
**unmounts `DeployPanel` and discards all of it**.

That is not a new problem introduced by this proposal. It is a defect the
proposal runs into:

> Start a build, switch to Design, come back — the log is empty and `buildId` is
> gone, so **Flash & Reset no longer knows what to flash**.

Which is why the choice below is the whole decision.

## 4. Two architectures

**A — the dock lives inside Deploy** (portalled into the band above the status
bar).

- Cheapest: one component and some CSS.
- But it is the existing log box in a new position. It dies with `DeployPanel`,
  so "this area can hold several managers" cannot be delivered — a third pane
  later (a global error list, say) means building it again.

**B — the dock lives in `App`, and Deploy's state moves to a store.**

- The drawer stays cheap; the work is moving `logs` / `busy` / `buildId` /
  `artifactUrl` into a `deployStore` (zustand, which this project already uses
  everywhere).
- What it buys beyond the drawer: **a build keeps running while you work in
  another tab, and the log is still there when you return.** `buildId` survives,
  so Flash & Reset stays valid. It fixes §3 as a side effect.

**Recommendation: B.** The stated requirement — *this area can hold several
managers* — only holds together with a global dock. A is the version that has to
be thrown away the first time it succeeds.

## 5. What a "manager" should hold: output, not buttons

Worth settling before anything is built. In Visual Studio the bottom strip holds
**output windows** — Error List, Output, Package Manager Console. The two panes
proposed here are named after the two *buttons* on the Deploy card, so there are
two readings:

- **(a) Each pane is one operation's output.** The single combined "Build / Flash
  log" splits in two, each with its own lifecycle and its own Copy/Clear, and
  each pane's toolbar can carry its own trigger — the way Package Manager
  Console has its own controls. The Deploy card keeps the two large buttons and
  a summary. **Recommended.**
- **(b) The buttons move into the panes.** The Deploy tab then has nothing left
  but explanatory text.

(a) matches the model being imitated, and leaves the Deploy tab a reason to
exist.

## 6. The auto-hide rule has a trap

"Show on Deploy, hide everywhere else" reads naturally, but **the moment the
panel is most useful is exactly the moment you leave the tab.** Visual Studio
does not close Output because you opened another file.

Suggested rule instead: **expand on entering Deploy; on leaving, collapse only
if no operation is running** — and if one is, either keep the dock visible or
leave a progress indicator in the status bar. Note this is implementable *only*
under architecture B, since it requires the operation's state to outlive the
tab.

## 7. Details to settle

| Item | Note |
|---|---|
| Height persistence | `GraphManager` keeps its height in `useState`, so a reload loses it. The dock should at least use `localStorage` — the app already reads it directly (`App.tsx:92`), no wrapper needed |
| Collapsed vs hidden | "Collapsed to just the tab strip" and "gone entirely" are different states; Visual Studio has both |
| Small screens | The dock needs a max-height clamp so the workspace can never be squeezed to zero |
| Simulator | Its `<iframe>` re-renders on resize; dragging the dock while that tab is open needs a look |
| Factory mode | The Deploy tab itself is not factory-gated (`TAB_DEFS` gates only `code` and `icon`), but parts of the panel are (`DeployPanel.tsx:218`, `:397`). The dock's rules must not accidentally expose them |
| Keyboard and a11y | The tab strip needs keyboard switching, and the drag grip needs a keyboard alternative |

## 8. Sizing

| Stage | Work | Rough size |
|---|---|---|
| 1 | Dock shell in `App`: tab strip, collapse, drag-resize (reusing `.panel-grip` and `GraphManager`'s ~30 lines), `localStorage` height | 1 component + 1 stylesheet, ~200–250 lines |
| 2 | `deployStore`: lift `logs` / `busy` / `buildId` / `artifactUrl`; `DeployPanel` reads the store | new store ~80 lines, ~40–60 lines changed in `DeployPanel` |
| 3 | The two panes, each with its own log and toolbar | 2 small components, 60–100 lines each |
| 4 | Visibility rules (§6) | ~20 lines |

**Total roughly 500–600 new lines, one medium pull request.** No stage is an
architecturally risky change. Stage 2 needs the most care, because it touches an
in-flight `fetch` and unmount timing.

## 9. What to decide before starting

1. **A or B** (§4). Everything else follows from it, and B is recommended.
2. **What a pane holds** (§5) — output with its own toolbar, or the buttons
   themselves.
3. **Whether the dock may stay visible off the Deploy tab while an operation
   runs** (§6). Saying no is a legitimate choice; it just has to be made
   deliberately, because it decides whether §3's defect gets fixed.

## 10. What was built

All three decisions of §9 were taken as recommended: **B**, **(a)**, and the
amended visibility rule. What landed:

| File | Role |
|---|---|
| `src/store/deployStore.ts` | The operation state and the operations themselves. `runBuild` / `runFlash` read their inputs through `getState()` rather than closing over React state, so nothing depends on a mounted component |
| `src/store/dockStore.ts` | Dock chrome only — expanded, active pane, height (in `localStorage`) |
| `src/components/DockPanel/DockPanel.tsx` | The shell: tab strip, collapse, drag-resize |
| `src/components/DockPanel/DeployLogPane.tsx` | One pane, parameterised by which log it shows and which operation its toolbar runs |
| `src/components/DockPanel/EmulatorOutputPane.tsx` | The Emulator's build log (§11) |
| `src/App.tsx` | Renders the dock between `renderMainContent()` and `<StatusBar />`, and owns the visibility rule |

Three things worth recording because they are not obvious from §1–§9.

**The visibility rule is one expression.** `effectiveTab === 'deploy' ||
deployBusy !== null` — the Deploy tab shows it, and a running operation outranks
the tab. It does not auto-close when the operation ends off-tab: the moment a
build finishes is the moment its last lines matter most, so the dock stays until
the author leaves Deploy again with nothing running.

**The visibility rule was replaced, twice, and the second answer is simpler
than either draft.** §6's rule tied the dock to the Deploy tab; the first
revision kept the band in place as an inert strip rather than removing it. Both
are gone: the dock is now available on **every** tab, because the Work pane it
gained lists operations that outlive the tab they were started from, so hiding
it anywhere hides the one view that is never tab-specific
([work-progress.md](./work-progress.md) §5). Expansion is the author's choice
alone, and a red lamp on the tab strip covers the case the auto-show existed
for: something is running while the dock sits collapsed.

What survives from the drafts is the measurement discipline. The strip's height
is pinned in CSS rather than derived from its contents, so it cannot shift when
its panes change; measured at 29 px collapsed and 220 px expanded, with
`.app-body` absorbing the difference and the status bar never moving.

**§7's max-height clamp was wrong the first time, in a way worth keeping.** The
first attempt clamped against `window.innerHeight - 240`, which quietly ignores
the header and the status bar: at a 720 px window it left the workspace 127 px,
not 240 px. The fix measures the band the workspace and the dock actually share
— from the top of `.app-body` to the top of `.status-bar` — and subtracts the
minimum from that. The lesson generalises: a constant named for the workspace
has to be subtracted from the workspace, not from the window.

Verified in the browser, by measured geometry rather than by eye: hidden on the
Design tab with `.app-body` reclaiming the full 607 px; 220 px on Deploy with
the status bar unmoved; 30 px collapsed with the tab strip still switchable;
drag up 100 px giving exactly 320 px and `localStorage` holding it; the max
clamp stopping with exactly 240 px of workspace left; the min clamp stopping at
120 px with the toolbar and log both still visible. Full suite: 1355 passing,
no console errors.

**Not done, and deliberately.** Keyboard switching for the tab strip and a
keyboard alternative to the drag grip (§7) are still open — the panes carry
`role="tab"` / `role="tabpanel"` and the grip carries `role="separator"`, but
arrow-key navigation is not wired. That is the first thing to add if this dock
grows a third pane.

## 11. The fourth pane: the Emulator's Build Output

§10 ended by saying keyboard navigation was the first thing to add "if this dock
grows a third pane". It grew a fourth instead, and the note still stands — see
the bottom of this section.

**Where it came from.** The Emulator kept its compiler output in local state
behind a `📋 Build Output` toggle that opened a box **over its own canvas**.
That is the wrong shape twice over: it is a build log, which this dock already
holds two of, and the moment you most want to read it — a build has just failed
— is the moment you also want to see what is on the screen behind it.

**Where it sits.** Between **Work** and **Build Firmware**. That is ladder
order, not alphabetical: the Emulator compiles before Deploy does
([preview-ladder.md](./preview-ladder.md)), so the two build logs read
left-to-right in the order a project passes through them.

**It is the first tab-specific pane, and that needed a rule.** §10 replaced the
original per-tab visibility with "available on every tab", because Work lists
operations that outlive the tab that started them. Build Output is the
exception that does not contradict it: it describes what the *Preview* tab just
did, and on the Design tab it would be a log for something not on screen. So the
strip is filtered rather than hidden — `App.tsx` passes
`showBuildOutput={effectiveTab === 'preview' && isEmulatorEnabled}`, the caller
being the only place that knows both facts.

Leaving Preview while Build Output is in front resolves to **Work**, and the
resolution is *derived, not written*: `dockStore` keeps `activePane` as the
author left it and `DockPanel` renders `visiblePane`. Coming back to Preview
therefore lands on Build Output again, which is the behaviour someone switching
between Design and Preview during a debugging session wants. It is the same
pattern `App.tsx` uses for the factory-only tabs, for the same reason — a write
on the way out is a write you have to undo on the way back.

**A failed build opens it.** `showPane('output')` brings the pane forward and
expands the dock if it was collapsed, so the log arrives without being asked
for. A successful build changes nothing about the dock; the panel above already
says it is running.

**It fills while the build runs.** The pane subscribes to the same SSE channel
the firmware build streams over — `/api/hmi/build-log/:runId`, one endpoint and
one `buildLog.ts` for both ([streaming-build-log.md](./streaming-build-log.md))
— so the phases arrive as they happen and the summary lands at the end of the
same transcript rather than replacing it. The compiler's own output is streamed
once and the summary omits it, so nothing is printed twice.

**And it feeds the Work pane next door.** An Emulator build is a Work item like
any other, moving through *Preparing your screens*, *Compiling the display
engine* on a first run, *Compiling your screens*, and finishing as *Running in
the Emulator* or *Could not build your screens*. The phases come from an
allow-list in `emulatorPhases.ts` matched against markers the server emits
deliberately, so nothing raw from a compiler can surface in the product's view
of the operation — the same rule `deployPhases.ts` follows and for the same
reason ([work-progress.md](./work-progress.md) §3).

**It keeps its detail in both modes, for now.** The pane is the engineering
view by definition — the place to look when the Work pane's phase is not enough
— so it is not reworded for factory dev mode the way the Emulator's own chrome
is ([factory-dev-mode.md](./factory-dev-mode.md)). The intended end state is the
whole tab behind that flag, which answers the question rather than translating
a compiler transcript into words it does not have.

**Still not done.** Arrow-key navigation of the tab strip and a keyboard
alternative to the drag grip. Four panes make that more pressing than three
did, not less.
