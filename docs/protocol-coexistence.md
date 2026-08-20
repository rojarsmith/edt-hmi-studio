# Two protocols on one wire — planning Modbus and a UART command set together

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/protocol-coexistence.md">繁體中文</a>
</p>

Status: **planning only. No code has been changed.** It records where the
Protocol editor currently reaches into the rest of the project, what breaks when
a second protocol shares the same physical link, and the order in which to move
— verified against the source, not from memory.

This continues [protocol-and-tags.md](./protocol-and-tags.md), which asked
whether one abstraction can carry Modbus, CAN and a UART command protocol, and
concluded that a protocol belongs to a **device** rather than to a project
(§10.4 there). This document starts from that conclusion and answers the four
questions that follow it:

1. Where exactly is the Protocol editor wired into **components** and **logic**,
   and what does each wire cost? (§1)
2. What changes when two protocols share **one physical interface**? (§2, §3)
3. With no CAN adapter on the bench, what is the plan for **Modbus + UART
   command**, and how is it tested with the hardware already here? (§8, §9)
4. What does all of that mean on each of the three supported boards — the EDT
   EVK043027B, the STM32H747I-DISCO and the STM32F746G-DISCO? (§12)

If only two sections are read, make them **§3** — the rules a shared wire
imposes — and **§7**, the model they force.

A companion document, [uart-command-protocol.md](./uart-command-protocol.md),
takes the same model from the author's side: what a command has to look like in
the editor, and why the Protocol tab has to grow a live view before any of this
is usable.

## 1. Where the Protocol editor reaches today

Twenty-four non-test files under `src/` and `server/` name Modbus. Three of them
only in a comment; the rest carry it. Sorted by how hard each would be to
unpick:

| Surface | Where | What it holds |
|---|---|---|
| Project config | `src/types/hmi.ts` | `CommunicationConfig` — serial parameters, unit id **and** the tag table in one object. `CanBusConfig` beside it |
| Widget | `src/types/index.ts:639` | `modbusBinding?: ModbusBinding` on **every** `LvglComponent` |
| Widget editor | `ModbusBindingEditor.tsx` (404 lines), mounted at `PropertyEditor.tsx:1409` | Ten widget types get it, regardless of the project's protocol |
| Tag → binding sync | `src/utils/modbusBindings.ts` | `applyTagToBinding` pushes six fields onto every bound widget, through the undo stack |
| Duplication | `src/store/editorStore.ts:655` | The binding is cloned by field name when a component is copied |
| Tag source | `src/hooks/useProjectModbusTags.ts` | Returns `config.communication.tags`; consumed by `CodePanel`, `CompilePreview` and `NodeEditDialog` |
| Logic node types | `src/components/LogicEditor/types.ts:38` | `tag_read`, `tag_write`, and the older `modbus_holding_register` |
| Logic tag picker | `NodeEditDialog.tsx:414` | Filters by access, refuses non-holding-register and 32-bit tags, marks a vanished tag `(missing)` |
| Logic codegen | `src/codegen/templates/ui_logic.c.ts:833`, `:1250` | Resolves a tag to `hmi_runtime_read_holding_register(address)` / `write_holding_register` / `write_coil` |
| Binding codegen | `src/codegen/hmiBindingGenerator.ts` | One descriptor per **bound widget**, plus extra descriptors synthesised for the addresses logic reads |
| Firmware ABI | `firmware/*/include/hmi_runtime.h` | `hmi_binding_descriptor_t` carries `area` + `address`; the logic API is keyed by address |
| Firmware runtime | `firmware/*/src/hmi_runtime.c` | `static modbus_rtu_async_client_t g_modbus_client`; one transaction at a time |

Two of these rows are load-bearing, and they are the two the question names.

### 1.1 The component side stores a copy, not a reference

`ModbusBinding` is a `tagId` **plus a snapshot** of area, address, data type,
access, scale and poll interval — and the snapshot is what
`hmiBindingGenerator.ts` compiles. `synchronizeModbusBindings` keeps the copies
fresh on every tag edit; a deleted tag clears `tagId` and leaves the copy
behind, still polling.

That design is defensible with one protocol and one device. It has three
properties that stop working with two:

- **A snapshot has a shape.** `area` + `address` cannot describe a value fetched
  by `GET TEMP` and read out of `TEMP=25.4`.
- **A snapshot is per widget.** Three widgets showing one tag generate three
  descriptors and three round trips — see §8 for why that is fatal on a shared
  wire rather than merely wasteful.
- **A snapshot has no owner.** Once two devices exist, address 40001 is not a
  unique key, and the descriptor has no field that says whose it is.

### 1.2 The logic side is tag-shaped in the editor and address-shaped in C

The editor already got this right: a graph says *MotorSpeed*, not *40001*
([logic-node-taxonomy.md](./logic-node-taxonomy.md), Decision 1). The generated
code then throws the tag away and emits an address:

```c
static uint16_t logic_read_holding_register_cached(uint16_t address);
/* ...and, for a write: */
bool hmi_runtime_write_holding_register(uint16_t address, float value);
```

Which is why `ui_logic.c.ts` has to refuse three things it should not have to: a
tag that is not a holding register, a 32-bit tag, and — implicitly — any tag
whose "where" is not a `uint16`. Under a UART command tag there is no address at
all to pass, and under two devices there is no unique one.

**The runtime API being keyed by Modbus address is the single biggest obstacle
on the logic side**, and it is also the cheapest to remove (§5).

## 2. What "the same physical interface" means on this hardware

The question assumes three protocols might share one interface. On this
hardware, two of them can and the third cannot — and that asymmetry is hardware,
not policy:

| Board | The serial link today | Also fitted |
|---|---|---|
| **EDT EVK043027B** | **USB CDC on the Type-C port** — `hmi_usb_cdc.h`; `configure_transport` in `hmi_runtime.c` brings it up, not a UART | USART2 with an RS-485 transceiver, driver-enable on PD4 — **initialised at boot but with no client bound to it** (§12.2); FDCAN1 with a transceiver behind `CAN_STB` |
| **STM32F746G-DISCO** | USART1 on PA9/PB7, through the ST-LINK VCP | No CAN transceiver |
| **STM32H747I-DISCO** | USART1 on PA9/PA10, through the ST-LINK VCP | No CAN transceiver |

Board by board, with what each one can and cannot prove, is **§12**.

So:

- **Modbus RTU and a UART command protocol are natural co-tenants.** Both are
  byte streams over the same peripheral, the same COM port at the PC end, the
  same RS-485 pair if that route is taken. Nothing separates them but timing.
- **CAN is never a co-tenant.** Different silicon (FDCAN1), different pins,
  different transceiver, frames that arrive on their own. Sharing does not
  arise; CAN is simply a **second link**.

That reduces the general question to a specific one, which is convenient given
what is on the bench: **plan the co-tenancy problem for serial, and treat CAN as
an additional link when a transceiver and an adapter turn up.**

One distinction to keep separate throughout:

| | What it is | Who controls it |
|---|---|---|
| **Logical sharing** | One MCU peripheral, one scheduler, one COM port | **This tool.** Rules in §3 |
| **Electrical sharing** | One RS-485 segment with several listeners | The devices. A Modbus slave will see the ASCII command traffic and reject it on CRC; a command device will see Modbus binary and, usually, ignore it. *Usually* is the operative word |

The tool can guarantee the first. It should **say plainly** that it cannot
guarantee the second, rather than implying that two devices in one list are
electrically compatible.

## 3. Six rules a shared link imposes

These are the whole of the co-tenancy problem. Every one of them is a constraint
the editor can express and the firmware can enforce.

**R1 — The link owns the serial parameters; the device owns its address.**
Today `CommunicationConfig` holds `baudRate`, `parity`, `stopBits` and
`dataBits` in the same object as `unitId` and `tags`. Two devices on one wire
must agree on framing and cannot agree on address, so the object has to split.
This is the one change that makes every later step mechanical.

**R2 — One outstanding transaction per link, always.** Already true:
`hmi_runtime_task` runs a single `g_transaction`, retries it, then starts at
most one more. Keep it. When protocols mix it stops being a simplification and
becomes the correctness argument for R4.

**R3 — The inter-transaction gap is the maximum of the participants'.** Modbus
RTU frames on 3.5 character times of silence; a command device may need tens of
milliseconds before it will accept the next line. The link takes the larger
number, which means adding a slow device slows the whole link — visibly, and
therefore worth showing (§8).

**R4 — Every received byte must be attributable.** With exactly one outstanding
request, it is: the bytes belong to whoever asked. There is no other cheap rule.
Any design that allows two requests in flight on one wire has to reintroduce
addressing at the transport level, which neither protocol offers.

**R5 — A push-driven device cannot share a link with a request/response one.**
A device that emits `TEMP=25.4` unasked will eventually emit it inside someone
else's reply window, and R4 collapses. This is a rule the editor should enforce
outright: a device whose source is receive-driven requires a link of its own.
(CAN, which is entirely receive-driven, is on its own link anyway.)

**R6 — Half duplex costs turnaround and echo.** On RS-485, driver-enable timing
and echo suppression are per-link properties, and a device that echoes what it
receives makes the echo the first thing every reply parser sees.

Add one non-rule, because it will be asked: **there is no useful "interleave"
mode.** Sending a command line into the middle of a Modbus exchange is not a
performance win; it is an unattributable reply and a slave that has seen a
malformed frame.

## 4. What the component side has to become

The recommendation is one sentence: **a binding stops being a copy of a tag and
becomes a reference to one, plus the presentation fields that are genuinely the
widget's.**

| Field | Today, on `ModbusBinding` | Belongs to |
|---|---|---|
| `enabled` | ✔ | the binding |
| `tagId` | optional | the binding, **required** |
| `property` | ✔ | the binding — *which* widget property mirrors the value |
| `writeBehavior`, `writeValue` | ✔ | the binding — what a touch means |
| `area`, `address` | ✔ (snapshot) | **the tag's source** |
| `dataType`, `access`, `scale`, `pollIntervalMs` | ✔ (snapshot) | **the tag** |

```ts
// Neutral in name and shape; nothing here knows which bus is behind the tag.
interface TagBinding {
  enabled: boolean;
  tagId: string;
  property: WidgetProperty;
  writeBehavior: WriteBehavior;
  writeValue: number;
}
```

Four things fall out of that, and all four are wanted:

1. **The generated model becomes two tables instead of one.** A tag table — what
   to ask, of which device, how often — and a binding table saying which widget
   mirrors which tag. Today's single descriptor array conflates them, which is
   exactly why three widgets on one tag cost three round trips.
2. **Coalescing becomes free.** It is the tag table that is polled, and a tag
   appears in it once. On a wire where one ASCII exchange costs ~47 ms (§8),
   this is not an optimisation.
3. **A deleted tag can no longer be papered over.** With no snapshot to fall back
   on, a binding whose `tagId` is gone has to be reported — which is the **LACK**
   badge that [protocol-and-tags.md](./protocol-and-tags.md) §1 asks for, arrived
   at by construction rather than by discipline.
4. **`synchronizeModbusBindings` disappears.** There is nothing to push; the
   widget reads the tag at generate time. That is 112 lines of undo-stack traffic
   removed from every tag edit.

The cost is a migration, and this repo has the pattern for it already (`pages`,
`targetPage`, nested animations): read `component.modbusBinding` for files
written before the change, write `component.binding` afterwards, and use the old
snapshot to **create** a tag where a pre-tag binding carried only an address.
Nothing is lost and nothing has to be re-entered.

One editor consequence: the property panel's binding section becomes a **tag
picker plus four fields**, and the picker is the only place that needs to know
about devices — it groups by device and shows the address in the device's own
dialect. `ModbusBindingEditor.tsx` loses roughly half its surface.

## 5. What the logic side has to become

One change, and it is small: **the runtime API becomes tag-keyed.**

| | Today | Proposed |
|---|---|---|
| Read | `logic_read_holding_register_cached(1U)` | `hmi_tag_read(HMI_TAG_MOTOR_SPEED, &value)` |
| Write | `hmi_runtime_write_holding_register(2U, v)` / `..._write_coil` | `hmi_tag_write(HMI_TAG_SETPOINT, v)` |
| Key | A `uint16` Modbus address | An index into the generated tag table |
| Declared in | `hmi_runtime.h`, fixed | `hmi_bindings_generated.h`, an enum beside the tag table |

The tag id is already the editor's key — `node.params.tagId` — so this is a
change to what codegen *emits*, not to what the graph *stores*. Existing graphs
keep working untouched.

What it buys, immediately and with one protocol still in place:

- **Three current refusals disappear.** `ui_logic.c.ts` rejects a tag that is not
  a holding register, rejects 32-bit tags, and forks coil versus register on
  write. All three exist only because the API's key is a Modbus address; a tag
  index has a data type behind it and needs none of them.
- **The synthetic descriptors go away.** `collectLogicHoldingRegisterAddresses`
  exists to make sure something polls the address logic will read. With a tag
  table, a tag referenced by a graph is simply a tag that is used.
- **It survives two devices.** An index is unique; 40001 is not.
- **It survives a UART tag**, which has no numeric address to pass at all.

Two smaller decisions on this side:

- **`modbus_holding_register` becomes legacy.** It is the one node that names a
  protocol, and it takes a raw address. Keep loading it forever —
  `normalizeLogicGraphs` already re-derives node categories on load, so the
  precedent exists — stop offering it in the palette once tag nodes cover 32-bit
  reads, and interpret it as *device 1's holding register N* for as long as that
  means anything.
- **Writes stay queued, never confirmed.** `hmi_runtime_task` already gives
  writes priority over background reads and cancels an in-flight read to serve
  one. On a shared link that priority now competes with a second protocol's gap
  requirement, so the honest contract for a logic graph is: *the write is
  queued*, and confirmation, where the bus can give it, is a per-tag quality flag
  ([protocol-and-tags.md](./protocol-and-tags.md) §10.2). A graph that writes on
  every tick can starve polling on a shared wire, and the link budget in §8 is
  where that becomes visible.

## 6. What the Protocol editor becomes

`ProtocolPanel.tsx` is 1104 lines with one top-level
`protocol === 'modbus-rtu' ? ... : ...` and two inline tag tables. The shape it
should grow into:

| Section | Forks by protocol? | Notes |
|---|---|---|
| **Links** | **Yes** — legitimately | Serial parameters, or CAN bit timing. Two-thirds of a merged "connection" type would be irrelevant whichever was chosen |
| **Devices** under a link | **Partly** | Name, protocol, enabled, plus the protocol's own station fields: a unit id for Modbus; command templates, framing, checksum and inter-command gap for UART |
| **Tags** | **No** | One table for the whole project, with a Device column. Only the *address* cell changes shape with the device's protocol — an area dropdown plus a number, or a parameter name |
| **Budget** | No | Per link: the cycle time its tags imply, against the poll intervals they ask for (§8) |

The rule separating the three: **fork where the protocols genuinely differ,
unify where they only appear to.** The link differs. The value does not. Today
the tag table is forked and it should not be.

Two practical notes. The panel is already past the size where the two tables
should be their own components, and splitting it is a prerequisite for the
master-detail shape rather than a tidy-up. And the "Protocol" tab is by then
named for a field that no longer exists at project level: it becomes
**Connections**, which is what every vendor surveyed in
[protocol-and-tags.md](./protocol-and-tags.md) §10.3 calls it.

## 7. The model: Link → Device → Tag

[protocol-and-tags.md](./protocol-and-tags.md) §10.4 proposed moving `protocol`
from the project to a **device**. Co-tenancy adds one level above it, because
two devices can share a wire and must then share its settings:

```ts
interface Link {
  id: string;
  name: string;                    // "COM port", "RS-485", "CAN 1"
  kind: 'serial' | 'can';
  transport: 'usb-cdc' | 'uart';   // serial only; the EDT board is usb-cdc today
  serial?: {
    baudRate: number; parity: 'none' | 'even' | 'odd';
    dataBits: 8; stopBits: 1 | 2;
    /** R3: the link takes the largest gap any device on it needs. */
    minGapMs: number;
    /** R6. */
    halfDuplex: boolean; suppressEcho: boolean;
  };
  can?: { bitrate: number; fd: boolean; dataBitrate: number; samplePointPercent: number; mode: CanBusMode };
}

interface Device {
  id: string;
  name: string;                    // "PLC 1", "Weighing head"
  linkId: string;
  protocol: ProtocolId;            // 'modbus-rtu' | 'uart-command' | 'can-bus'
  station: DeviceStation;          // the protocol's own per-device settings
  timeoutMs: number; retries: number;
  enabled: boolean;
}

type DeviceStation =
  | { kind: 'modbus-rtu'; unitId: number }
  | { kind: 'uart-command';
      readTemplate: string;        // "GET {address}"
      writeTemplate: string;       // "SET {address} {value}"
      terminator: 'crlf' | 'cr' | 'lf' | 'etx' | 'idle';
      checksum: 'none' | 'xor' | 'sum' | 'crc16';
      interCommandGapMs: number; }
  | { kind: 'can-bus'; defaultFrameFormat: CanFrameFormat };

interface Tag {
  id: string;
  name: string;
  deviceId: string | null;         // null = internal, no wire at all
  value: { dataType: TagDataType; access: BusAccess; scale: number; offset: number; unit?: string };
  source: TagSource;               // where it lives, per protocol
}
```

Three properties of this shape are worth stating, because they are what make the
migration cheap:

- **Today's project is a one-element list at each level.** One link (the CDC
  port), one device (unit id 1), and `communication.tags` with `deviceId` filled
  in. The migration is a wrap, not a rewrite, and the UI need not change while
  the cap holds at one.
- **`project.protocol` becomes derived** — `devices[0].protocol` — and then stops
  existing. Every "what does switching strand?" question dissolves with it,
  because a device's tags travel with the device.
- **`deviceId: null` is the cheapest test of the whole abstraction.** An internal
  tag with no wire behind it proves the neutral layer is neutral *without a
  second protocol implemented*, and gives the previews something to simulate
  ([protocol-and-tags.md](./protocol-and-tags.md) §10.7). It is worth building
  first, precisely because it needs no hardware.

The firmware mirror is one array per level: links, each with a transport and a
scheduler; devices, each with a driver and a station; tags, each naming a device.
`hmi_runtime.c` is already the middle of that — the poll cursor, the retry
counter, the write queue and the widget update are all protocol-blind. What is
Modbus is `g_modbus_client` and the encode/decode inside it.

## 8. A worked example, with the arithmetic

One link, two protocols, which is the case actually being planned for:

| | Device A | Device B |
|---|---|---|
| Name | `PLC` | `Scale` |
| Protocol | Modbus RTU, unit 1 | UART command |
| Station | — | `GET {address}` / `SET {address} {value}`, CRLF, 20 ms gap |
| Tags | `MotorSpeed` 40001 uint16, `Pressure` 40002 uint16, `Running` coil 1 | `Weight` — address `WT`; `Tare` — address `TARE`, write-only |

At **9600 8N1** one character is 10 bits, so ≈ 1.04 ms:

| Exchange | Bytes | Time |
|---|---|---|
| Modbus read, 2 registers | 8 out, 9 back, plus 3.5 characters of silence each side | ≈ **25 ms** |
| `GET WT` → `WT=12.345` | 8 out, 11 back, plus a 20 ms gap and the device's own think time | ≈ **47 ms** |

A cycle that refreshes three Modbus tags and one UART tag costs
`3 × 25 + 47 ≈ 122 ms`. Asking for a 250 ms poll interval on all four is
comfortable — about 49 % of the link. Asking for 100 ms is arithmetically
impossible, and nothing in the tool says so today.

Two conclusions the arithmetic forces, neither of which is visible in the UI:

- **A link budget belongs in the editor.** Cycle time implied by the tags,
  against the intervals they ask for, per link. Every vendor product has some
  form of this; here it becomes necessary the moment a 47 ms exchange sits next
  to a 25 ms one.
- **Per-widget descriptors stop being viable.** Three widgets showing `Weight`
  would add 94 ms to that cycle — a 77 % increase for zero information. §4's
  two-table model is what prevents it, and this is the number that makes it a
  requirement rather than a preference.

## 9. Testing it with the hardware already on the bench

No CAN adapter is needed for any of this, because the interesting case is two
*serial* protocols. What is needed is a device at the other end of the COM port
that answers both, and that is a change to a tool that already exists.

`tools/modbus-rtu-test-server.ps1` (621 lines) is already a Modbus RTU slave with
a live dashboard. Extended, it owns the COM port and dispatches each received
chunk:

| Chunk | Route |
|---|---|
| Printable ASCII terminated by CRLF | The command device: match against the templates, answer `WT=12.345` or `OK` |
| Parses as a Modbus ADU with a valid CRC-16 and a known unit id | The existing Modbus path |
| Anything else | Count as noise and show it on the dashboard |

Order matters: test the line rule **first**. A printable line will essentially
never CRC valid, but a Modbus frame can contain printable bytes, and a false
positive in that direction is silent whereas the other is loud.

That rig reproduces the whole of §3 with one USB cable: R2 and R4 are exercised
by the firmware being unable to tell whose reply is whose if it ever allows two
in flight; R3 is exercised by the gap; R5 is exercised by adding an unsolicited
line to the simulator and watching what it corrupts.

Two notes on the alternatives:

- **The RS-485 route is closer than it looks.** USART2 is brought up at boot
  through `HAL_RS485Ex_Init`, DE on PD4 and all — what it lacks is a client bound
  to it, not bring-up (§12.2, which corrects both this document's earlier draft
  and [edt-evk043027b.md](./edt-evk043027b.md) §5). It is still not the *first*
  step, because it needs the per-link driver interface of §7 to exist; it is the
  first thing that interface can prove on real wire.
- **Internal tags need no rig at all** (§7). They are the first thing to build
  and the only part of this plan testable with nothing plugged in.

## 10. A staged plan

Each stage is shippable and useful on its own. The hardware column is the point:
only the last stage is blocked by what is not on the bench.

| Stage | What changes | What it buys | Needs hardware? |
|---|---|---|---|
| **0** | `offset` on Modbus tags; one `TagDataType`; gate the binding editor on the project's protocol; say what a protocol switch strands | Fixes things that are wrong with the one protocol that exists | No |
| **1** | `Link` and `Device`, **capped at one each**. Serial parameters move to the link, `unitId` to the device, `deviceId` onto every tag. `project.protocol` becomes derived | The pivotal rename. No UI change while the cap holds | No |
| **2** | Binding becomes a tag reference (§4); logic API becomes tag-keyed (§5); the generated model splits into a tag table and a binding table | Coalescing, the LACK badge, and the three logic refusals removed — all with one protocol | No |
| **3** | Internal tags (`deviceId: null`); previews simulate them | Proves the abstraction is protocol-free; makes logic graphs testable with nothing attached | No |
| **4** | Hoist the triplicated firmware: one `hmi_runtime.c` and one Modbus client behind a five-function transport interface, three thin board files (§12.4) | Every later firmware change is written once instead of three times | No |
| **5** | `uart-command` as a second device on the same link. Per-link scheduler and a driver interface in the firmware. Link budget, per transport, in the editor (§12.3) | **Modbus and a command device on one wire** — the actual goal | Only the PC-side simulator of §9 |
| **6** | RS-485 as a second link on the EDT board (§12.2); then CAN as a third | Two links, R6, and finally the third protocol where it belongs | RS-485: nothing new. CAN: a transceiver enable and an adapter |

Stages 0–4 are worth doing whether or not a second protocol ever ships: every one
of them fixes something that is wrong today. Stage 1 is the one with a deadline —
it is mechanical now and a three-way fork later. Stage 4 has the same property
for the firmware: it is a mechanical de-duplication today, and a three-way merge
conflict once a driver interface is being designed inside it.

## 11. What to decide now, and what not to

**Decide now:**

- **A link is a level above a device.** Two protocols sharing a wire share its
  settings and its scheduler; that cannot be expressed with devices alone.
- **The widget binding is a reference, not a copy** (§4). It is the decision that
  makes coalescing possible, and coalescing is not optional at 47 ms an exchange.
- **The logic runtime API is keyed by tag, not by address** (§5). Small, worth it
  today, impossible to retrofit cheaply once two devices exist.
- **R2 and R5** (§3): one transaction in flight per link, and no push-driven
  device sharing a link. Both are constraints the editor can state and the
  firmware can hold; neither is recoverable if designed around later.
- **A board declares links, not protocols** (§12.6). It is the same rename as
  stage 1, it costs nothing extra while every board has one link, and it is what
  makes retargeting a project checkable instead of silent.
- **The firmware core is hoisted before a driver interface is designed in it**
  (§12.4). Three copies of 826 lines is a de-duplication today and a merge
  conflict later.

**Do not decide now:**

- The UART locator vocabulary — reply-parsing rules should be written against a
  device that exists, not an imagined one
  ([protocol-and-tags.md](./protocol-and-tags.md) §8.8).
- How many devices a link may carry. Two is the interesting number; the model
  above does not care, and the cap can be lifted when a project needs it.
- Whether future drivers spell addresses as structured fields or dialect strings.
  Start structured, keep a `raw` variant as the exit (§10.6 there).

**Do not do:**

- **Do not interleave transactions on one link.** There is no cheap way to
  attribute the replies (R4).
- **Do not add a protocol discriminator to the tag while devices do not exist.**
  It expresses per-tag something that is per-device, and it is the fork that §4's
  rename is meant to avoid.
- **Do not let the editor imply electrical compatibility.** Two devices in one
  list means the firmware will not talk over itself. It does not mean the devices
  tolerate each other's traffic on a shared RS-485 segment (§2).
- **Do not merge the link layer across protocols.** Serial parameters, CAN bit
  timing and UART framing have nothing in common, and a union of them is
  two-thirds noise whichever is selected.
- **Do not compute one link budget for every board.** Characters times 1/baud is
  right on the Discovery boards and close to meaningless on the EDT board's CDC
  link (§12.3).
- **Do not put the protocol scheduler on the H747's Cortex-M4** (§12.5). The
  bottleneck is 122 ms of waiting, not CPU, and USART1 sits in the domain that
  core owns.

## 12. The three boards, one at a time

Everything above is written for the tool. The tool compiles for three boards,
and they do not offer the same wire. What follows is verified against
`firmware/`, and one item in it — §12.2 — is a correction that has since been
carried back into [edt-evk043027b.md](./edt-evk043027b.md) §5.

### 12.1 What each board can actually carry

| Board | Link 1 — carrying Modbus today | Link 2 — fitted | Link 3 | Ceiling under §7's model |
|---|---|---|---|---|
| **EDT EVK043027B** | USB CDC on the Type-C port (`hmi_usb_cdc.c`), bound to `g_modbus_client` | **USART2 / RS-485**, PD5 TX, PD6 RX, DE on PD4 — *brought up at boot*, see §12.2 | FDCAN1 behind `CAN_STB` (PB5, `main.h:48`); `HAL_FDCAN_MODULE_ENABLED` is **commented out** (`stm32u5xx_hal_conf.h:58`) | **2 serial links + 1 CAN.** The only board that can host the whole model |
| **STM32F746G-DISCO** | USART1, PA9 TX / PB7 RX, through the ST-LINK VCP on CN14 | — | No CAN transceiver | **1 serial link** |
| **STM32H747I-DISCO** | USART1, PA9 TX / PA10 RX, through the ST-LINK VCP | — | No CAN transceiver | **1 serial link** |

The asymmetry matters in one direction only: **the co-tenancy problem of §3 is
identical on all three**, because it is a problem of sharing *one* link. What the
EDT board adds is the ability to prove the level above — two links, and a home
for the device that R5 refuses to let share.

### 12.2 A correction: the EDT board's second link is already up

An earlier draft of §9 above, and [edt-evk043027b.md](./edt-evk043027b.md) §5,
both said the RS-485 path was driven by nothing and that `HAL_RS485Ex_Init` was
never called. **That is not what the code does**, and both have since been
corrected; this section is the record of why.
`board_init` calls `board_uart1_apply(115200, none, 1)`
(`board.c:293`), which runs `HAL_RS485Ex_Init` with DE polarity high and zero
assertion times (`board.c:227`), disables the FIFOs so inter-frame gaps are
measured honestly, and `stm32u5xx_it.c:57` vectors `USART2_IRQHandler` into
`HAL_UART_IRQHandler(&huart1)`.

What is actually missing is **a client bound to it**. `g_modbus_client`'s
transport is the CDC ring; nothing else in the firmware reads or writes
`huart1`. So the distance between "one link" and "two links" on this board is
not bring-up work — it is exactly the per-link driver interface of §7. That
moves RS-485 from "a firmware task in its own right" to *the cheapest real-wire
proof the link model has*.

One detail worth keeping, because it is R1 in miniature: USART2 is initialised
at **115200**, while the Protocol tab's baud rate feeds the *CDC* link's
inter-frame silence. Two links, two sets of framing, one project-level field
that belongs to neither. The split R1 asks for is already overdue on this board.

### 12.3 The link budget does not survive a change of board

§8's arithmetic — 9600 8N1, 1.04 ms a character, ≈ 25 ms a Modbus exchange,
≈ 47 ms a `GET WT` round trip — is a **UART** budget. It is literally true on
both Discovery boards. On the EDT board the same project runs over USB CDC,
where the baud rate has no effect on the wire at all: bytes cross as USB
transfers, and the configured baud survives only as the number the RTU
inter-frame silence is derived from ([edt-evk043027b.md](./edt-evk043027b.md) §5).

Three consequences, all of which land on the editor rather than the firmware:

- **Cycle time on the CDC link is set by USB frame scheduling, the host, and the
  device's think time**, not by character count. R3's gap is still real — it is
  the *device's* requirement, not the wire's — but the transmission term nearly
  vanishes.
- **The budget of §6 is per link and per transport.** A budget that multiplies
  characters by 1/baud is correct on the Discovery boards and roughly
  meaningless on EDT's CDC link. The board is known at edit time, so this is
  computable rather than guesswork.
- **Retargeting can break a budget silently.** A project authored on EDT/CDC with
  100 ms intervals is arithmetically impossible on a 9600 UART. The editor can
  say so at the moment the board changes — which is the only moment anyone would
  think to look.

### 12.4 The runtime is triplicated, and the seam is already written as a diff

| File | F746G vs H747I | vs EDT |
|---|---|---|
| `hmi_runtime.c` (826 / 826 / 820 lines) | **byte-identical** | 58 lines differ, all transport |
| `modbus_rtu_client.c` | **byte-identical** | **byte-identical** |
| `modbus_rtu_async_client.c` (529 lines) | **byte-identical** | 134 lines differ |

Those 134 lines are not scattered. They are: how a byte arrives
(`HAL_UART_Receive_IT` plus `HAL_UART_RxCpltCallback`, versus a CDC ring drained
by `modbus_rtu_async_poll`), how a frame is written, how stale receive data is
flushed (`__HAL_UART_FLUSH_DRREGISTER` versus `hmi_usb_cdc_flush_rx`), and where
the baud rate comes from (`client->uart->Init.BaudRate` versus
`client->baud_rate`). The EDT copy says as much in a comment at the top of the
file.

Two conclusions:

1. **Every firmware change this plan asks for lands three times.** The tag-keyed
   API (§5), the per-link scheduler and the driver interface (§7) each get
   written, reviewed and debugged once per board unless the shared core is
   hoisted first. That is the argument for making consolidation *its own stage*
   rather than doing it in passing while adding a protocol — a three-way merge
   conflict is a bad place to be designing an interface.
2. **The interface to hoist to already exists**, as the difference between two
   files that are otherwise the same. Five operations, no more:

```c
/* Naming only — not an API to commit to. The point is the size of the seam. */
typedef struct {
    bool     (*open)(void *ctx, const hmi_link_config_t *config);
    size_t   (*write)(void *ctx, const uint8_t *data, size_t len);
    size_t   (*read)(void *ctx, uint8_t *out, size_t max);
    void     (*flush_rx)(void *ctx);
    /* 10000000 / baud on a UART; ~0 on CDC. This one function is §12.3. */
    uint32_t (*char_time_us)(void *ctx);
} hmi_transport_vtable_t;
```

The driver seam — Modbus versus command — is the layer *above* this one. Getting
the transport seam right first is what makes "two devices on one link" and "a
second link on one board" the same mechanism instead of two.

### 12.5 The H747's second core is not a second link

It will be proposed, so it is worth refusing here. Putting the protocol
scheduler on the Cortex-M4 is wrong on this board as built:

- **The image is Cortex-M7 only** (`CORE_CM7`, `CMakeLists.txt:56`), and the M4's
  boot is disabled at the option bytes (`BCM4 = 0`) as the documented setup
  ([stm32h747i-disco-dual-core.md](./stm32h747i-disco-dual-core.md)).
- **USART1 lives in domain D2 — the M4's domain.** `board_init` already waits for
  `RCC_FLAG_D2CKRDY` and force-enables the domain if it never reports ready, so
  that the HMI still runs without Modbus rather than hanging (`board.c:49`).
  A link whose peripheral sits in a domain the application does not own is
  already the subtlest thing about this board; giving it a second owner adds an
  IPC and a shared-memory protocol to the one board that least needs them.
- **Nothing here is CPU-bound.** §8's cycle is 122 ms of *waiting*. A second core
  buys nothing that the single-transaction state machine of R2 does not already
  give.

Dual-core on this board is a display and throughput topic. Keep it out of the
protocol plan.

### 12.6 A board's capability is a list of links, not a list of protocols

`BoardDefinition.protocols: readonly ProtocolId[]` (`src/types/hmi.ts:109`) is
exactly right for one link, and one level short under §7. Today the Discovery
boards declare `['modbus-rtu']` and EDT declares `['modbus-rtu', 'can-bus']` —
but what actually differs between those boards is that one has three ports and
the others have one. The same rename as stage 1 can fix it:

```ts
interface BoardLink {
  id: string;                       // 'cdc' | 'rs485' | 'fdcan1' | 'vcp'
  name: string;                     // "Type-C virtual COM port"
  kind: 'serial' | 'can';
  transport: 'usb-cdc' | 'uart';
  /** What a device on this link may speak. */
  protocols: readonly ProtocolId[];
  status: 'ready' | 'fitted-unbound' | 'absent-transceiver';
  note?: string;                    // why, in one line, for the UI to show
}
```

`BoardDefinition.protocols` becomes the union of these while anything still
reads it. What it buys in the editor:

- **A link is chosen from the board, not typed in.** §6's Links section stops
  being free-form, and a project cannot ask for a wire the board does not have.
- **`status` is where the honest hardware caveats live.** EDT's RS-485 row reads
  `fitted-unbound` and points at §12.2; its FDCAN row says the transceiver is
  fitted but the HAL module is not compiled; the Discovery boards have no CAN row
  at all. This is the same honesty §2 asks for about electrical compatibility,
  in a place the user actually looks.
- **Retargeting becomes checkable.** Every device's link has to map onto a link
  the new board has. Today, moving a two-device project from the EDT board to a
  Discovery board would compile happily and talk to one wire.

### 12.7 Which board proves which rule

| Rule (§3) | Provable on | With what |
|---|---|---|
| **R1** link owns framing | all three | The two-protocol simulator of §9. No firmware change |
| **R2** one transaction in flight | all three | Already true; the regression is the simulator answering slowly |
| **R3** gap is the maximum | all three | The simulator's 20 ms gap — though what it costs differs by transport (§12.3) |
| **R4** every byte attributable | all three | Inject an unsolicited line; watch the next reply mis-parse |
| **R5** no push device on a shared link | all three | The same rig. This is the rule the rig exists to demonstrate |
| **R6** half duplex, turnaround, echo | **EDT only** | USART2 plus a second RS-485 node. DE is already handled in hardware (`board.c:227`) |
| CAN as a second link | **EDT only** | `CAN_STB` driven, `HAL_FDCAN_MODULE_ENABLED` uncommented, and a USB-CAN adapter |

Which gives the order of work a bench recommendation:

**Develop the co-tenancy work on the STM32F746G-DISCO.** It is a plain UART,
§8's arithmetic is literally true on it, and the budget is legible with a
stopwatch. **Port to the EDT board to prove the transport seam** (§12.4) — if the
same project runs over CDC with only `char_time_us` differing, the seam is
right. **Then reach for RS-485** (§12.2), which is the first thing on any of
these boards that exercises R6 and the two-link model at once. The EDT board is
the destination; the Discovery board is the bench.
