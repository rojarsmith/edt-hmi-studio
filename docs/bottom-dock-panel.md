# A dockable panel above the status bar — evaluation

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/bottom-dock-panel.md">繁體中文</a>
</p>

Status: **planning only. No code has been changed.** Verified against the
source, not from memory.

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
| LVGL Preview | Its `<iframe>` re-renders on resize; dragging the dock while that tab is open needs a look |
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
