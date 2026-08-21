# Event Trigger — What It Does Today, and Where the Chain Breaks

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/logic-event-trigger.md">繁體中文</a>
</p>

The **Event Trigger** node starts a logic graph when a widget fires an LVGL
event. The question this document tracked — *who fires the trigger?* — was
answered on 2026-08-16 by the Design side: a component's event gains the
**Logic Graphs** handler type, beside Built-in Action and Custom Code. The
component owns the wiring; the graph stays a reusable named action several
events can run. (A Target Component selector *inside* the trigger's dialog
was tried first and taken out the same day — pinning "who fires me" into
the node buried an application-wiring decision in the wrong place.)

This document records how the chain works now and the history that shaped
it. The palette-wide taxonomy decisions live in
[logic-node-taxonomy.md](logic-node-taxonomy.md).

## How firing works now

1. On the Design tab, a component's event picks **Handler Type: Logic
   Graphs** and checks one or more graphs; the picker labels graphs that are
   inactive or have no Event Trigger, and warns about empty or stale
   selections.
2. `ui_events.c` generates the component's event callback as always, and
   inside it calls each checked graph's **event entry** in list order —
   `logic_<graph>();` — including `ui_logic.h` for the declarations. A graph
   that is deleted, or switched off by its Active toggle (and therefore
   absent from generated code), produces an honest comment instead of a call
   to a missing symbol.
3. `ui_logic.c` gives every trigger its own entry: the exported graph
   function runs only the **event-trigger chains**, and each timer trigger
   owns a private callback running only its own chain (with its own
   delay-mode deletion). A graph mixing timers and events can no longer
   cross-fire — which was a real defect of the old one-function-per-graph
   shape.
4. The Event Trigger node face lists its callers — `Called by:
   Button_a8da (CLICKED)` — and warns **Not called by any event** when
   nothing does.

Two leftovers, deliberate: the node's **Event Type** dropdown is gone — the
binding's event type does the filtering, so the node has nothing to
configure (a stored `eventType` from older graphs is still read by the
legacy `targetComponent` registration, invisible in the dialog); and the
**Event Object** output stays behind Factory Mode until the entry
functions learn to carry the `lv_event_t` through. The Edit Node dialog
also moved its type chip above the name field, and shows the raw subtype
identifier only in Factory Mode — the machine name is factory
territory, the same reasoning as the Code tab.

## The legacy chain, stage by stage (kept for the record)

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

- An Event Trigger graph runs on hardware once a component's event checks it
  under the Logic handler. A graph nothing checks generates its entry
  function and nothing calls it — the node face says so.
- The **Debug** button in the Logic tab is a manual walkthrough that starts at
  the first trigger node and follows execution wires as you press Step. It
  simulates no click and evaluates no values.
- **Simulator** ignores logic graphs entirely, and events with them:
  `editorStateToJson.ts` exports screens and styles, and nothing else. It feeds
  real LVGL a widget tree, so it is a renderer rather than a runtime.
- **The Emulator** is the only preview that runs a graph. `Emulator.tsx` passes
  the graphs to `generateCode`, which emits `ui_logic.c`; every generated file
  goes to the compiler, and `ui_events.c` includes `ui_logic.h`. What runs there
  is the same C that runs on hardware. See
  [preview-ladder.md](./preview-ladder.md) for what each preview does and does
  not cover.

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

## The shapes tried, for the record

**Node-side target — tried 2026-08-16, taken out the same day.** The dialog
briefly carried a Target Component selector writing
`params.targetComponent`; the dormant chain lit up end to end. Removed on
reflection: the wiring belongs with the component. Codegen still understands
`params.targetComponent` (UUID or name), so the legacy registration path
keeps generating for any graph that carries it.

**Design-side binding — chosen, landed 2026-08-16.** The Logic handler
described above. (`LogicGraph.eventBindingId`, the old vestige of this idea,
is still dead — the binding stores `logicGraphIds` on the event instead.)

One adjacent decision that stands either way:

- **The Event Object output lives behind Factory Mode** (2026-08-16, on
  request): the callback wrapper still discards the event, so in normal mode
  the port only promised what the device cannot deliver. The port stays in
  the node's data — hiding is render-only — and one already wired stays
  visible in both modes so a connection is never stranded. Feeding the event
  into the data flow is still the real follow-up.
