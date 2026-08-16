# Event Trigger — What It Does Today, and Where the Chain Breaks

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/logic-event-trigger.md">繁體中文</a>
</p>

The **Event Trigger** node is meant to start a logic graph when a widget
fires an LVGL event — a button's `LV_EVENT_CLICKED`, a slider's
`LV_EVENT_VALUE_CHANGED`. Almost the entire chain for that exists and is
tested: the data model carries a target component, the code generator
registers the callback, the firmware templates call the init function at the
right moment. Exactly one link is missing — **the editor does not say which
component fires the event** — so today the whole chain generates code that
runs nothing.

A Target Component selector on the node's dialog was tried on 2026-08-16 and
taken out again shortly after: pinning "who fires me" inside the trigger's
own dialog was judged the wrong shape, and the question is deliberately back
open. This document records the state of each stage and the shapes
considered, so the next attempt starts from facts.

## The chain, stage by stage

### 1. The node and its dialog

`nodeDefinitions.ts` gives `event_trigger` one default parameter,
`eventType: 'LV_EVENT_CLICKED'`, and two outputs: **Execute** (execution
flow) and **Event Object** (`any`, factory-dev-only — see below). The Edit
Node dialog (`NodeEditDialog.tsx`) exposes one field: an **Event Type**
dropdown listing the nine events shared with the Design tab's event system
(Clicked, Pressed, Released, Long Pressed, Value Changed, Focused,
Defocused, Ready, Cancel).

There is deliberately no Target Component field. Worth spelling out, because
the dropdown invites the misreading: an event type with no target does *not*
mean "any widget's click fires this graph". With no target stored the code
generator emits no registration at all, so the graph listens to nothing, not
to everything.

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

- An Event Trigger graph **never runs on hardware** today: the editor stores
  no target, so the registration line is never generated. (Timer Trigger
  graphs are unaffected — their registration needs no target and works.)
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

## The shapes tried, and the question still open

**Node-side target — tried 2026-08-16, taken out again.** The dialog briefly
carried the same Target Component selector its sibling nodes have, writing
`params.targetComponent`, and the dormant chain lit up end to end, tests
already in place. It was removed on reflection: pinning "who fires me"
inside the trigger's own dialog was judged the wrong shape for the product,
and the direction wants rethinking before the UI hardens it. Codegen keeps
understanding `params.targetComponent` (UUID or name) untouched, so nothing
needs rebuilding once a shape is chosen.

**Design-side binding — never wired.** `LogicGraph.eventBindingId` is the
vestige of the other shape: a component's event in the Design tab points at
a graph, so "who fires me" lives with the component rather than inside the
graph. Nothing reads the field today.

Until one of these lands, an event graph generates a function and a callback
wrapper that nothing references.

One adjacent decision that stands either way:

- **The Event Object output lives behind Factory Dev Mode** (2026-08-16, on
  request): the callback wrapper still discards the event, so in normal mode
  the port only promised what the device cannot deliver. The port stays in
  the node's data — hiding is render-only — and one already wired stays
  visible in both modes so a connection is never stranded. Feeding the event
  into the data flow is still the real follow-up.
