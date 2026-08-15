# Event Trigger — What It Does Today, and Where the Chain Breaks

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/logic-event-trigger.md">繁體中文</a>
</p>

The **Event Trigger** node starts a logic graph when a widget fires an LVGL
event — a button's `LV_EVENT_CLICKED`, a slider's `LV_EVENT_VALUE_CHANGED`.
Almost the entire chain for that existed and was tested from the start: the
data model carries a target component, the code generator registers the
callback, the firmware templates call the init function at the right moment.
Exactly one link was missing — **the Edit Node dialog never asked which
component fires the event** — and without it the whole chain generated code
that ran nothing. That link was wired on 2026-08-16: the dialog now has a
Target Component selector, and warns while none is chosen.

This document records the state of each stage, so future work starts from
facts.

## The chain, stage by stage

### 1. The node and its dialog

`nodeDefinitions.ts` gives `event_trigger` one default parameter,
`eventType: 'LV_EVENT_CLICKED'`, and two outputs: **Execute** (execution flow)
and **Event Object** (`any`). The Edit Node dialog (`NodeEditDialog.tsx`)
exposes two fields for it: a **Target Component** dropdown over every
component of every screen — the same selector `show_hide`, `set_property`,
`get_property`, `set_text` and `set_value` already had — writing
`params.targetComponent`, and an **Event Type** dropdown listing the nine
events shared with the Design tab's event system (Clicked, Pressed, Released,
Long Pressed, Value Changed, Focused, Defocused, Ready, Cancel).

While no component is chosen, the dialog says plainly that the trigger will
not be registered in generated code. (Until 2026-08-16 the Target Component
field did not exist at all, which made every event graph dead code — the
history the rest of this document explains.)

### 2. The generated code (`ui_logic.c`)

Each graph becomes a `static void logic_<name>(void)` function. A graph
containing an Event Trigger additionally gets a callback wrapper:

```c
static void logic_<name>_event_cb(lv_event_t *e) {
    (void)e;
    logic_<name>();
}
```

Registration happens in `ui_logic_init()` — and here is the branch that
decides everything (`ui_logic.c.ts`, `generateInitFunction`):

```c
/* only if trigger.params.targetComponent is set: */
lv_obj_add_event_cb(ui_run_button, logic_<name>_event_cb, LV_EVENT_CLICKED, NULL);
```

`targetComponent` may be a component UUID or a literal name —
`resolveComponent` looks it up in both indexes and falls back to deriving a
variable name. The full chain (click on a named button → callback → graph
navigates to another screen) is covered by tests in `ui_logic.c.test.ts`, which
all set `targetComponent` in their fixtures.

**Without `targetComponent` — the only shape the editor can produce today —
no registration line is generated at all.** The graph function and its
`_event_cb` wrapper are still emitted, but nothing ever references them. The
graph is dead code on the device.

### 3. The firmware

All three board templates (`firmware/*/src/main.c`) call `ui_logic_init()`
right after `ui_init()`. Since `ui_init()` creates every screen up front and
navigation loads screens without deleting them, a callback registered on any
screen's widget at init time stays valid for the life of the firmware. The
runtime side is sound; it is only ever handed nothing to register.

## What this means in practice

- An Event Trigger graph runs on hardware once its Target Component is chosen.
  **Without a target it still generates no registration** — the dialog now
  warns about exactly that instead of leaving a silently dead graph. (Timer
  Trigger graphs never needed a target and work either way.)
- The **Debug** button in the Logic tab is a manual walkthrough that starts at
  the first trigger node and follows execution wires as you press Step. It
  simulates no click and evaluates no values.
- The **WASM preview** (Build & Run) ignores logic graphs entirely —
  `editorStateToJson.ts` exports screens, styles and events, but no graphs.
  Only exported C code carries logic.

## Adjacent facts, recorded while the ground was open

- **`LogicGraph.eventBindingId`** — the type carries this field and
  `createGraph` accepts it, but nothing in the codebase ever passes or reads
  it. It is the vestige of a planned Design-side link (component event →
  logic graph) that was never wired; the Design tab's event system has no
  knowledge of logic graphs today.
- **The Event Object output** — the callback wrapper discards its
  `lv_event_t *` (`(void)e;`), so the node's second output feeds nothing in
  generated code. No downstream node can currently read "which object",
  "which key" or any other event payload.
- The compile-verification suite only exercises event graphs *with* a target,
  so the editor-produced shape (wrapper emitted, never referenced) is outside
  what the compile tests check.

## The repair, and what it deliberately left alone

The fix was the one dropdown described above — `event_trigger` gained the
same Target Component selector the dialog already rendered for `show_hide`,
writing `params.targetComponent`, and the existing codegen, resolution and
firmware path lit up unchanged, tests already in place.

Two adjacent questions were considered and deliberately left as they are:

- **A stale component id** (component deleted after being chosen) still falls
  back to name-derivation in the resolver, silently — the same behaviour every
  other targeted node has; fixing it for one node alone would be misleading.
- **The Event Object output moved behind Factory Dev Mode** (2026-08-16,
  same day, on request): the callback wrapper still discards the event, so in
  normal mode the port only promised what the device cannot deliver. The port
  stays in the node's data — hiding is render-only — and one already wired
  stays visible in both modes so a connection is never stranded. Feeding the
  event into the data flow is still the real follow-up.
