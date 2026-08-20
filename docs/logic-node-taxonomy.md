# Logic Node Taxonomy — a Decision Record

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/logic-node-taxonomy.md">繁體中文</a>
</p>

Status: **all four steps landed 2026-08-16 — this record is now history,
kept for the reasoning.**
This records why the Logic tab's node palette will be regrouped and how
protocol support enters it, so the work starts from decisions rather than
from re-deriving them.

## The yardstick

This studio is a **no-code HMI editor**: an author who does not program
builds screens that behave the same on the canvas and on the panel. It is
**not a Modbus product** — Modbus is the first protocol, CANbus and others
follow. Two consequences measure every palette decision:

1. **The author thinks in operations on things** — the screen, a value, the
   machine, time — not in computational roles. The palette should group by
   what a node touches, not by what kind of expression it compiles to.
2. **A logic graph must survive a protocol change.** A graph wired to
   "holding register 40001" dies the day the device speaks CAN. Graphs may
   only ever reference protocol-neutral names.

## What the five current categories get right and wrong

| Category | Contents today | Verdict |
| --- | --- | --- |
| **Triggers** | Event Trigger, Timer Trigger | Shape is right — this is the *sources* family (time, user, and one day data). Keeps its place. The Event Trigger's own unresolved binding question is recorded in [logic-event-trigger.md](logic-event-trigger.md) |
| **Conditions** | If/Else, Switch, Compare, Logic Operation | Mixes two natures. If/Else and Switch branch the execution flow (rectangle ports); Compare and Logic Operation are pure expressions (circle ports only, inlined by codegen). Same shelf, different kind — one of the reasons the port shapes confuse |
| **Actions** | Set Property, Navigate to Screen, Show/Hide, Set Text, Set Value, Call Function, Delay | Mixes three targets: screen operations (the heart of an HMI), a flow utility (Delay is not an action, it is flow), and an escape hatch (Call Function is Custom by nature) |
| **Data** | Read/Write Variable, Math, String, Get Property, **Read Holding Register** | Holds the protocol landmine. A Modbus-specific node sits beside protocol-neutral variables; adding CANbus this way means Read CAN Signal next to it, then one node family per protocol, and every graph coupled to the protocol it was drawn against |
| **Custom** | C Code Block | Right shelf — but custom C is the factory engineer's realm, not the no-code author's. A candidate for Factory Mode, same reasoning that moved the Code and Icon tabs there |

## Decision 1 — Tags cut the graph loose from the protocol

The commercial-HMI answer (WinCC, FactoryTalk, Weintek alike): the
**Protocol tab defines named tags** — `MotorSpeed` ← Modbus holding register
40001 today, `MotorSpeed` ← CAN signal `0x123.rpm` tomorrow — and **logic
graphs reference tags only**, through exactly two palette nodes: **Read
Tag** and **Write Tag**. The palette never grows a node per protocol, and
switching a device's protocol re-maps tags in one tab instead of repainting
every graph. The groundwork exists: `ModbusRegisterTag` and the binding
machinery already name registers. Today's *Read Holding Register* node
evolves into *Read Tag* rather than gaining siblings.

The widget side never got this treatment: a widget still binds through
`component.modbusBinding`, which is Modbus in its name, its type and its
fields. What that costs, and what a third protocol would cost, is worked out
in [protocol-and-tags.md](./protocol-and-tags.md).

An honesty note that outranks the cosmetics: **the write path does not
exist at all.** An author can read a register but cannot write anything
back to the device — and a button that commands the machine is the core
HMI use case. Write Tag is worth more than any regrouping below.

## Decision 2 — Regroup the palette by what the author operates on

The author's mental model is *time/user/data → decisions → effects on the
screen or the machine*. The palette follows it:

| New group | Contents | Moves |
| --- | --- | --- |
| **Triggers** | Timer Trigger, Event Trigger, later a Tag Trigger (fires on value change) | unchanged |
| **Flow** | If/Else, Switch, **Delay** | Delay in from Actions |
| **Screen** | Set Property, **Get Property**, Show/Hide, Set Text, Set Value, Navigate to Screen | Get Property in from Data — reading and writing the same widget belong on one shelf |
| **Data** | Read/Write Variable, Math, String, **Compare**, **Logic Operation** | Compare and Logic Operation in from Conditions — they are expressions, and now sit with the other circle-port nodes |
| **Device** | **Read Tag**, **Write Tag** | grows with protocols without growing nodes |
| **Custom** | **Call Function**, C Code Block | Call Function in from Actions; the category is a Factory Mode candidate |

## Decision 3 — Presentation first, data never forced

Each stored node carries a `type` field (`trigger | condition | action |
data | custom`) that also picks its colour, and it is saved inside every
project's graphs. The palette grouping (`NODE_CATEGORIES`), however, is
pure display. So the regrouping lands in two decoupled steps:

1. **Re-shelve the palette** — display-level only, saved projects untouched,
   zero migration risk.
2. Only later, if ever, rename stored types and colours — a data migration
   that must read old spellings forever, so it needs to earn its keep.

## Agreed sequence

1. **Done (2026-08-16):** Read Tag / Write Tag nodes against the Protocol
   tab's tag table. Read Tag covers 16-bit holding-register tags — polled
   raw over an object-less descriptor, with the tag's type and scale applied
   in `ui_logic.c` where int16 sign survives the runtime read API's clamp.
   Write Tag covers coil and holding-register tags of every data type: it
   rides a write-only descriptor carrying the tag's type and scale, queued
   through the new `hmi_runtime_write_holding_register` /
   `hmi_runtime_write_coil` runtime calls (all three boards; the firmware
   side compiles by inspection only — this environment has no ARM
   toolchain). Read Holding Register is deprecated: hidden from the
   palette, saved graphs keep rendering and generating.
2. **Done (2026-08-16):** palette regrouping per the table above. Each
   definition carries a display-only `paletteGroup`; stored node types, the
   colours keyed off them, and every saved graph are untouched, and a test
   pins both the shelf contents and the stored-type populations so the two
   layers cannot drift silently
3. **Done (2026-08-16):** the Custom shelf exists only in Factory Mode
   — palette offer and search alike; nodes already placed keep rendering
   and generating in every mode
4. **Done (2026-08-16):** stored categories renamed to the six shelves, so
   the display grouping and the data agree again and `paletteGroup` is gone.
   Node colours now follow the shelves — Compare turned purple, Delay amber,
   the tag nodes teal, Call Function gray. The migration story:
   `normalizeLogicGraphs` re-derives every node's category from its subType
   (the authority) at every store entry point — project open, project-list
   open, graph import — so files carrying `condition` and `action` read
   forever; an unknown subType keeps a still-valid stored category and falls
   back to `custom`. Server-side code generation needs no migration: it keys
   on subType throughout, and the one category check it had (the
   trigger-less linear fallback) now judges by execution inputs from the
   definition table — which also fixes its old blindness to `var_write` and
   `tag_write`
