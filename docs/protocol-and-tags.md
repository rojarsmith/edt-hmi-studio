# Protocol, tags, and what survives a change — an analysis

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/protocol-and-tags.md">繁體中文</a>
</p>

Status: **analysis only. Nothing here has been implemented.** It records what
the code does today, answers three questions asked of it, and lists what would
have to change and in what order.

The questions, in the order they were asked:

1. Is it good design to let a project change its **Protocol** after creation?
   (§2, §3)
2. Will the **communication tags** get scrambled when it does? (§3)
3. What happens when a third protocol arrives — specifically a **custom UART
   command architecture**, which is neither Modbus nor CAN in shape? (§4)
4. Can such a command protocol be made **addressable** at all? (§8)
5. Does today's abstraction hold for **all three at once**? (§9)
6. Should the abstraction live in the editor while the firmware stays native —
   and how do the established HMI vendors actually do this? (§10)

If only one section is read, make it **§10**: it contains the one idea that
changes the shape of every other answer here.

Two sequels take §10's conclusion further:
[protocol-coexistence.md](./protocol-coexistence.md) works out what happens when
two of these protocols share **one physical link**, and what that costs the
component bindings and the logic graphs.
[uart-command-protocol.md](./uart-command-protocol.md) picks up §8 and asks what
the author has to see — the command model as a UI, and what the Protocol tab has
to become before a command protocol is usable by someone without a protocol
manual in hand.

## 1. What the code does today

Verified against the source, not from memory.

| Thing | Where | Behaviour |
|---|---|---|
| The protocol | `ProjectConfig.protocol` (`src/store/projectStore.ts`) | One per project. Chosen at creation from the board's list, changeable any time in the Protocol tab |
| Modbus settings | `ProjectConfig.communication` | Serial parameters plus the whole tag table |
| CAN settings | `ProjectConfig.canBus` | Bit timing plus the signal table |
| Switching | `selectProtocol` (`ProtocolPanel.tsx`) | Writes `protocol` and nothing else. **No tag, binding or signal is touched** |
| Build gate | `DeployPanel.tsx` — `buildable = protocolDefinition.implemented` | CAN is `implemented: false`, so a CAN project cannot be built |
| Export / import | `exportProject` / `importProject` (`projectStore.ts`), `migrateProject` (`projectManager.ts`) | All three fields survive a round trip through a `.json` file |

The two per-protocol configurations are stored **side by side rather than
replaced**, which the type already says out loud:

> Which field bus the project drives, chosen from the board's supported set
> when the project is created. The per-protocol settings below are kept side
> by side rather than replaced, so switching back and forth does not discard a
> tag table the user already built.

### The two ways a thing points at a tag

This is where the answer to question 2 lives. A project has two kinds of
consumer, and they reference tags differently:

| Consumer | What it stores | What the generated C reads | When the tag is deleted |
|---|---|---|---|
| **A widget** — `component.modbusBinding` | `tagId` **plus a full snapshot** of area, address, data type, access, scale, poll interval | The **snapshot** (`hmiBindingGenerator.ts`) | `tagId` is cleared, the snapshot stays. The widget keeps polling the same address, silently |
| **A logic node** — Read Tag / Write Tag | `tagId` (and `tagName`, for the node's face only) | The **tag** (`ui_logic.c.ts`) | Generates a comment and no call: `/* tag X no longer exists */` |

Both are defensible on their own. Together they mean one project answers the
same question — *what happens when this tag is deleted?* — two different ways.

`synchronizeModbusBindings` (`src/utils/modbusBindings.ts`) keeps the widget
snapshots fresh: whenever the tag table is edited, every bound widget is
rewritten from its tag, through the undo stack. So a snapshot is only stale
in one case — the tag is gone.

## 2. Is a changeable protocol good design?

**Yes, and the part that makes it safe is already right.** Two properties
carry it:

- **The switch is non-destructive.** Modbus tags and CAN signals live in
  different fields, so switching to CAN and back returns the project exactly
  as it was. Anything else would make the selector a trap: one wrong click and
  a tag table is gone.
- **One protocol per project, not per tag.** The board has one bus. A tag
  table that mixed protocols would need a protocol discriminator on every tag,
  every binding and every generated descriptor, to express something no
  hardware here can do.

**What is missing is not restraint but disclosure.** Switching today says
nothing, while it can strand a great deal:

- every widget whose `modbusBinding` points at the Modbus table,
- every Read Tag / Write Tag node in every logic graph,
- and, if the outgoing protocol was the implemented one, the ability to build
  at all.

The Protocol tab already knows how to say this — it prints a "no firmware
support yet" notice for CAN. Counting what a switch would strand, before it
happens, is the smallest useful change on this whole page.

One narrower defect belongs here too. `server/hmi/projectSource.ts` calls
`generateHmiBindings(screens, communication, …)` **without consulting
`projectFile.protocol`**, so the generator would happily emit Modbus
descriptors for a CAN project. Only the Deploy button stands between that and
a build. When a second protocol becomes buildable, that ordering has to be the
other way round: the generator decides from the project's protocol, and the UI
merely reflects it.

## 3. Will the tags get scrambled?

Scenario by scenario:

| Scenario | What actually happens | Verdict |
|---|---|---|
| Switch protocol and switch back | Both tables persist untouched | ✅ Safe |
| Edit a tag's address while widgets are bound | Pushed onto every bound widget, in one undoable step | ✅ Safe |
| Rename a tag | Bindings reference the id, so nothing breaks | ✅ Safe |
| Delete a bound tag | Widget: `tagId` cleared, keeps polling the old address, no warning. Logic node: refuses and says so | ⚠️ **Inconsistent** |
| Switch to a protocol whose table is empty | Widget bindings and tag nodes still point at the old table; nothing says so | ⚠️ **Silent** |
| Export to `.json` and open it again | Protocol, Modbus config and CAN config all survive | ✅ Safe |

**So the protocol selector is not what scrambles tags.** The two real risks
are the deletion asymmetry and the silence of the switch, and neither is
caused by letting the protocol change.

A note on the one that reads worst. A widget that keeps polling a deleted
tag's address is not obviously wrong — the address is still an address, and
"unbind the tag but keep working" is a legitimate reading. What makes it a
problem is that nothing on the widget says the reference was dropped. This
project already has the vocabulary for exactly this situation: the purple
**LACK** badge that an animation wears when its target is gone, reported and
never repaired. A binding whose tag has vanished should wear the same badge.

## 4. The third protocol: a UART command architecture

This is the question that decides the shape, because a command protocol is
**not** the same kind of thing as the first two.

Modbus and CAN are both **addressable** models. A tag answers three questions:
*where* is the value (`area` + `address`; `frameId` + bit window), *what* is
it (data type, scale), and *how often* to ask (poll interval). That common
shape is why [Decision 1 of the logic node taxonomy](./logic-node-taxonomy.md)
works: a graph says `MotorSpeed`, and the Protocol tab decides whether that is
holding register 40001 or CAN `0x123.rpm`.

A line-oriented UART command protocol is not addressable *in that same way*.
It looks like:

```
> GET TEMP\r\n
< TEMP=25.4\r\n
> SET TEMP 30\r\n
< OK\r\n
```

Three things about that have no home in today's tag:

1. **There is no address.** There is a command string, sometimes with
   parameters substituted into it.
2. **Reading and writing are different commands**, not one address with an
   access mode.
3. **The reply has to be parsed** — a prefix, a delimiter, a field index, a
   unit suffix. No field expresses that today.

None of that means it *cannot* be addressable, only that it is not addressable
by accident. [§8](#8-can-a-uart-command-protocol-be-addressable) works out what
it would take, and concludes that most such protocols can be — through one
decision about where the command shape lives.

### Two shapes, and which one to reserve

**Shape A — one Tags table, a per-protocol payload.** A tag keeps its
protocol-neutral half (name, data type, access, scale, poll interval) and its
"where" becomes a discriminated payload:

```ts
type TagSource =
  | { kind: 'modbus'; area: ModbusRegisterArea; address: number }
  | { kind: 'can'; frameId: number; startBit: number; bitLength: number; byteOrder: CanByteOrder }
  | { kind: 'uart'; readCommand?: string; writeCommand?: string; parse: ReplyParse };
```

Everything downstream keeps working unchanged: widgets bind to a tag, Read Tag
and Write Tag stay the only two nodes, the poll loop stays a poll loop. It
also collapses today's two tables into one, which removes the question the
current design cannot answer — *what happens to my bindings when I switch?*
becomes *which tags have a source for the protocol I switched to?*, and that
one has a visible answer.

**Shape B — a separate Commands table.** Truer to a protocol whose verbs are
not values at all: `REBOOT`, `TARE`, `START CYCLE`. Nothing is read back and
nothing polls. But it forks every consumer — a second binding editor, two more
logic nodes, a second generated descriptor table.

**Recommendation: reserve Shape A, and reach for B only if one-shot verbs
turn out to matter.** A verb with no value behind it can be expressed as a
write-only tag with a fixed write value, which is close to what
`writeBehavior: 'set'` already does. That is worth trying before doubling the
model.

### What must not happen

The trajectory the current naming sets up: `communication` for Modbus,
`canBus` for CAN, then `uartCommands` for the third — three top-level fields
and, on the widget side, `modbusBinding` plus `canBinding` plus
`uartBinding`. Every property editor, every generator and every migration
would then fork three ways, and a project's bindings would silently belong to
whichever field the protocol happened to be on.

**The widget side is the half that never got Decision 1.** Logic graphs were
cut loose from the protocol; widget bindings were not. `component.modbusBinding`
is Modbus in its name, its type and its fields, and it is what the firmware
actually compiles.

## 5. What it would cost

| Change | Reach | Notes |
|---|---|---|
| Say what a switch will strand | Protocol tab only | Counting bindings and tag nodes; no model change |
| LACK badge on a binding whose tag is gone | Property editor | The pattern already exists |
| Gate the binding generator on the project's protocol | `server/hmi/projectSource.ts` | One condition |
| `modbusBinding` → `busBinding`, discriminated | **6 non-test files** (`types/index.ts`, `utils/modbusBindings.ts`, `codegen/hmiBindingGenerator.ts`, `PropertyEditor.tsx`, `ModbusBindingEditor.tsx`, `store/editorStore.ts`) | Read the old field for old projects, the migration pattern this repo already uses for `pages`, `targetPage` and nested animations |
| One Tags table with a per-protocol source | The above plus the Protocol tab and the logic tag nodes | Worth doing **with** the UART work, not before it |
| Compile only the chosen protocol's runtime | Firmware CMake | `modbus_rtu_client.c` is linked into every build today; a second stack makes that a size question |

## 6. Recommended order

1. **Disclose the switch.** Before changing protocol, say how many widget
   bindings and tag nodes point at the table being left behind.
2. **Badge a binding whose tag is gone**, so the widget side answers deletion
   the way the logic side already does.
3. **Gate the generator on the project's protocol**, so the UI is not the only
   thing preventing a wrong build.
4. **Rename the widget binding** to something protocol-neutral, before a third
   protocol makes the rename a three-way fork.
5. **Design the UART model last**, with the real device's command set in hand.
   Shape A above is the one to reserve, but the parse rules should be written
   against a protocol that exists rather than an imagined one.

Steps 1–3 are each small, independent, and worth doing whether or not a third
protocol ever arrives. Step 4 is the one with a deadline: it is cheap today
and expensive once two more protocols reference the same field.

## 7. Deliberately not recommended

- **Per-tag protocol.** One bus per board; a discriminator on every tag would
  express something the hardware cannot do.
- **Clearing the other protocol's configuration on switch.** The current
  non-destructive behaviour is the property that makes the selector safe.
- **Making the widget binding a pure reference.** The snapshot is what the
  firmware compiles into its descriptor table — it is not duplication for its
  own sake. The fix is to name it protocol-neutrally, not to remove it.
- **Blocking the switch when bindings exist.** An author retargeting a project
  at a new device is doing something legitimate. Tell them what it costs;
  do not decide for them.

## 8. Can a UART command protocol be addressable?

Short answer: **most of them, yes — and the way to get there is to move the
command shape up to the connection and leave only an address on the tag.**

### 8.1 What "addressable" actually requires

Not a number. A tag is addressable when it carries a stable key that answers
two questions: **how do I ask**, and **where in the answer is the value**.
Under that lens the three protocols are the same shape:

| | How to ask | Where the answer is |
|---|---|---|
| **Modbus** | function code, implied by the area | the register at `address` |
| **CAN** | nothing — the frame arrives on its own | `frameId` + bit window |
| **UART** | a command line | a position in the reply |

CAN already proves the model has to allow **no request at all**: a receive-only
tag whose key is purely a locator. That same allowance covers a UART device
that pushes unsolicited lines, which is otherwise the hardest case to fit.

### 8.2 Which command protocols fit

| Style | Example | Addressable? | The key |
|---|---|---|---|
| ASCII register | `RD 40001` / `WR 40001 25` | Yes, directly | the register number |
| Named parameter | `GET TEMP` / `SET TEMP 30` | Yes | the parameter name |
| SCPI-like | `MEAS:VOLT?` | Yes | the node path |
| Bulk reply | `STATUS?` → `25.4,60,1,0` | Yes — this is the CAN case in text | (command, field index) |
| Binary framed | `STX 03 … ETX` | Yes | (command byte, byte offset + length) |
| One-shot verb | `TARE`, `REBOOT` | Not a value — model as a write-only tag | the verb |
| Unsolicited push | device sends `TEMP=25.4` unasked | Yes to decode, no to poll | (match pattern, field) |
| **Stateful session** | log in, switch mode, then read | **No** | needs a script, not a table |

The last row is the honest limit, and it is worth stating plainly: a protocol
where a command's meaning depends on what was sent before it is not a table of
independent tags, and no amount of column-adding makes it one. That case needs
the escape hatch in §8.7, and the tool should say so rather than contort.

### 8.3 The design: template up, address down

The obvious first attempt — give every tag its own command string — makes a
register-like device unusable: `RD 40001`, `RD 40002`, `RD 40003`, typed a
hundred times, each one a chance to mistype the verb.

Put the **shape** on the connection and the **address** on the tag:

| Connection template | Tag's address | Produces |
|---|---|---|
| `RD {address}` / `WR {address} {value}` | `40001` | `RD 40001` |
| `GET {address}` / `SET {address} {value}` | `TEMP` | `GET TEMP` |
| `{address}?` / `{address} {value}` | `MEAS:VOLT` | `MEAS:VOLT?` |

The tag table then looks **identical for all three protocols** — a name, a
where, a type, a scale, a poll interval — and only the meaning of the "where"
column changes. That is what makes a UART tag as addressable as a Modbus one,
and it is what lets the same widget binding, the same Read Tag node and the
same poll loop serve all three.

```ts
type TagSource =
  | { kind: 'modbus'; area: ModbusRegisterArea; address: number }
  | { kind: 'can'; frameId: number; startBit: number; bitLength: number; byteOrder: CanByteOrder }
  | { kind: 'uart';
      /** Substituted into the connection's templates. */
      address: string;
      /** Per-tag overrides, for the tags the templates do not fit. */
      readCommand?: string;
      writeCommand?: string;
      locate?: ReplyLocator;
    };
```

The overrides carry the exceptions: a bulk reply shared by several tags, a
one-shot verb with no address, a single oddly-spelled command on an otherwise
regular device. **The regular case needs no per-tag command at all.**

### 8.4 Where the answer is: a ladder of locators

A no-code tool should offer these in order, and stop at the first that fits:

| Locator | Fits | Example |
|---|---|---|
| **Whole reply** | the reply is the value | `25.4` |
| **Strip affix** | a labelled value | `TEMP=25.4`, prefix `TEMP=` |
| **Field** | delimited records | `25.4,60,1`, separator `,`, index 0 |
| **Bytes** | binary frames | offset 3, length 2, big-endian |
| **Pattern** | everything else | a regex with one capture group |

The first four are structured fields an author can fill in without knowing what
a regex is. The fifth is the escape hatch: put it last, label it as such, and
do not let it become the default answer to a protocol that one of the first
four would have covered.

A **bulk reply is one request with several locators** — the same relationship
CAN has between a frame and its signals. That is not a new concept to teach; it
is the concept CAN already introduced, spelled in text.

### 8.5 What belongs to the connection, not the tag

Getting this boundary right is what stops the tag table growing a column per
device quirk. These are per-link and belong beside the baud rate:

- **Framing** — how a reply ends: line terminator, fixed length, STX/ETX, or an
  idle gap. Without it the runtime cannot tell a complete reply from a partial
  one, and nothing else works.
- **Checksum** — none, XOR, sum, CRC-16; verified on receive, appended on send.
- **Echo suppression** — half-duplex links that return what was sent.
- **Inter-command delay** — devices that need a gap before the next request.
- **Command templates** — §8.3.

None of these is per-value, and a tag table that carries them is a tag table
that has to be re-entered for every tag on the device.

### 8.6 What the firmware already has, and what it lacks

The generated descriptor is **already mostly protocol-neutral**. Of its
thirteen fields, exactly two are Modbus:

| Concern | Fields | Protocol-specific? |
|---|---|---|
| Where the value lives | `area`, `address` | **Yes — these two** |
| What the value is | `data_type`, `access`, `scale`, `poll_ms` | No |
| What it drives | `object`, `widget`, `property`, `write_behavior`, `write_value`, `value_reader`, `value_writer` | No |

Even the header's one Modbus sentence is confined to a comment: *"Addresses are
zero-based Modbus PDU addresses."* Replacing those two fields with a tagged
`source` union is a surgical change to the ABI, not a rewrite.

The runtime is further along than expected too: `hmi_runtime.c` already has a
**transaction** with a kind, a retry counter and a timeout, and a round-robin
poll cursor over the bindings. Three things are missing:

1. **A transaction serves exactly one binding.** `hmi_transaction_t` holds a
   single `hmi_binding_state_t *`. A bulk reply updates several tags from one
   round trip, so a transaction has to be able to fan out.
2. **The transport is a concrete global.** `static modbus_rtu_async_client_t
   g_modbus_client;` — a second protocol needs an interface here, or a second
   runtime.
3. **Widget descriptors are per binding, not per tag.** Three widgets showing
   one tag generate three descriptors and three round trips. The logic side
   already deduplicates: `collectLogicHoldingRegisterAddresses` collects into a
   `Set`.

Point 3 changes character under a command protocol. A Modbus RTU read at 9600
baud is a few milliseconds; an ASCII request and its reply, with an
inter-command gap, is tens of milliseconds. Three widgets on one tag at 250 ms
therefore go from *wasteful* to *impossible*. **Coalescing stops being an
optimisation and becomes a requirement**, and the natural unit to coalesce on is
the tag — another reason for widgets to reference tags rather than carry
snapshots (§1).

### 8.7 The escape hatch, and when to reach for it

For protocols the table cannot express — a login handshake, a mode that changes
what a command means, length-prefixed variable records — the honest answer is a
generated hook rather than another column. The generator already emits
`USER_CODE_START` / `USER_CODE_END` markers that survive regeneration; a UART
transport can expose the same seam: *here is the line that arrived, here is
where to put the value*.

A tool that says "this protocol needs code, and here is where to write it" is
more useful than one that grows a checkbox per device.

### 8.8 Recommendation

**Yes, design it as addressable** — for a device whose protocol is
register-like, named-parameter or SCPI-like, which is most industrial serial
equipment. The shape to reserve:

1. **Command templates on the connection**, an address string on the tag. This
   single decision is what keeps the tag table one table.
2. **A locator ladder**, structured first and regex last.
3. **Framing and checksum at the connection**, never per tag.
4. **Per-tag command overrides** for the exceptions, so the regular case stays
   empty.
5. **A transaction that can fan out to several tags**, because bulk replies and
   coalescing both need it.

What to decide **now**: only the shape above, and only far enough to stop
`modbusBinding` becoming a three-way fork (§6 step 4). What to decide **with a
real device in hand**: the locator vocabulary, the framing options and the
checksum list — these should be written against a protocol that exists. A
locator ladder invented against an imagined device will have exactly the wrong
four rungs.

And the test for whether this route is right at all, applied to whatever device
turns up: **can every value the screen needs be named, asked for independently,
and found in a reply without remembering what was asked before?** If yes, it is
addressable and belongs in the tag table. If no, it needs the escape hatch, and
forcing it into the table would cost more than writing the code.

## 9. Does today's abstraction hold for all three at once?

**No — but it fails in three specific places, and it already succeeds in more
places than it fails.** The gap is not that the design is wrong; it is that
one protocol was implemented and the abstraction was never asked to carry a
second.

### 9.1 The three layers an abstraction has to separate

| Layer | Question it answers | Must be per-protocol? |
|---|---|---|
| **Link** | What is on the wire, and how do I talk to it | **Yes** — serial parameters, CAN bit timing and UART framing have nothing in common |
| **Value** | What is this number, and how do I get at it | **Half.** *What it is* is neutral; *where it lives* is not |
| **Binding** | What does this value drive on screen | **No** — a slider tracking a value does not care which bus fed it |

The test this yields is one sentence: **can the word "Modbus" be deleted from
the Value layer's neutral half and from the Binding layer entirely?** Today it
cannot be deleted from either.

### 9.2 Layer by layer

| Layer | What is there today | Holds for three? |
|---|---|---|
| Project config | `protocol` + `communication` + `canBus`, side by side | ⚠️ Works, but grows one top-level field per protocol |
| Tag | `ModbusRegisterTag` **and** `CanSignalTag` — two whole types | ❌ **Fails** — see §9.3 |
| Widget binding | `ModbusBinding` only, mounted on every widget regardless of protocol | ❌ **Fails** |
| Logic nodes | Read Tag / Write Tag, resolved from `communication.tags` | ⚠️ Right shape, Modbus wiring |
| Generated descriptor | 11 of 13 fields protocol-neutral | ✅ Nearly holds |
| Firmware runtime | `static modbus_rtu_async_client_t g_modbus_client`; one binding per transaction | ❌ **Fails** |
| Protocol tab | 1104 lines, one top-level `protocol === 'modbus-rtu' ? … : …` | ⚠️ Honest fork — see §9.6 |
| Previews | Neither simulates a tag at all | ➖ Neutral by omission |

The widget-binding row is the one with a visible symptom today: a CAN project
still shows a **Modbus** binding editor on every widget, offering a tag list
that is empty because the CAN signals live in a different field.

### 9.3 The evidence is in the two tag types

Put them side by side:

| | `ModbusRegisterTag` | `CanSignalTag` |
|---|---|---|
| Identity | `id`, `name` | `id`, `name` |
| Where | `area`, `address` | `frameId`, `frameFormat`, `startBit`, `bitLength`, `byteOrder` |
| What | `dataType: ModbusDataType` | `dataType: CanSignalDataType` |
| Access | `access: ModbusAccess` | `access: BusAccess` |
| Scaling | `scale` | `scale`, **`offset`** |
| Schedule | `pollIntervalMs` | `pollIntervalMs` |

Three things stand out, and none of them is a real protocol difference:

1. **`offset` exists on one and not the other.** A linear scale of
   `raw × scale + offset` is arithmetic, not a bus feature. A Modbus register
   holding tenths-of-a-degree above -40 cannot be expressed today; a CAN signal
   with the same physics can. That is the abstraction leaking, not the
   protocols differing.
2. **Two vocabularies for "what is this value".** `ModbusDataType` is
   `uint16 | int16 | uint32 | …` — width *and* interpretation in one word.
   `CanSignalDataType` is `unsigned | signed | float32` — interpretation only,
   with the width in `bitLength`. Both describe the same thing and neither can
   read the other.
3. **`BusAccess` is already shared.** `export type ModbusAccess = BusAccess`
   is one line, and it is the whole unification, already done — for exactly one
   field. The seam exists; it is one field wide.

One more, from the binding side: `ModbusWidgetProperty` can target `text`, but
no tag type can carry a string. Today that means "format the number as text".
A UART device answering `RUNNING` / `STOPPED` would want a real one.

### 9.4 What a model that holds all three looks like

The split that falls out of §9.1:

```ts
interface Tag {
  id: string;
  name: string;
  /** Neutral: fillable without knowing which bus is behind it. */
  value: {
    dataType: TagDataType;   // bool | int | uint | float | string
    access: BusAccess;       // already shared today
    scale: number;
    offset: number;          // CAN has it; everyone should
    unit?: string;           // for the label, not the wire
  };
  /** Protocol-specific: where the value lives, and how it is scheduled. */
  source: TagSource;
}
```

The load-bearing decision is the one that resolves §9.3's second point:

> **The semantic type belongs to the value; the width belongs to the source.**

`uint16` is two facts wearing one name. Split them and all three protocols fit
the same vocabulary: Modbus says *uint, two bytes at register N*; CAN says
*uint, 12 bits at frame 0x123 bit 8*; UART says *uint, parsed from the reply* —
with no width at all, because text has none.

The schedule follows the same rule. A poll interval is meaningful for Modbus,
meaningless for a CAN signal that arrives when the frame arrives, and belongs
to the **command** rather than the value for UART. So it sits in the source,
where a receive-driven source can simply not have one — instead of sitting on
`CanSignalTag`, where it does today and means nothing.

### 9.5 The runtime shape that serves all three

Three operations, and every protocol is a filling-in of them:

| | Request | Decode | Schedule |
|---|---|---|---|
| **Modbus** | read N registers at A | registers → value | per tag, coalescable |
| **CAN** | *none* | frame payload → several signals | driven by arrival |
| **UART** | a command line | reply → one or several values | per command |

`hmi_runtime.c` already has this in Modbus-shaped form: `hmi_transaction_t`
carries a kind, a retry counter and a timeout, and a round-robin cursor decides
what goes next. Making it serve all three needs exactly two changes and no
redesign:

1. **A transaction fans out.** It holds one `hmi_binding_state_t *` today; a
   CAN frame and a UART bulk reply both update several tags from one event.
2. **The transport becomes an interface.** `static modbus_rtu_async_client_t
   g_modbus_client` is a concrete global; the loop above it is already generic.

### 9.6 What should **not** be unified

An abstraction that covers everything covers nothing, so two things are worth
leaving alone:

- **The link layer.** Baud rate, parity and unit id have no CAN counterpart;
  bitrate, sample point and FD have no serial counterpart; framing and checksum
  are UART's alone. A common "connection" type would be two-thirds irrelevant
  whichever protocol was selected. Keeping `communication` and `canBus`
  separate is correct — the only cost is one top-level field per protocol,
  which is honest bookkeeping rather than a leak.
- **The Protocol tab's fork.** `protocol === 'modbus-rtu' ? … : …` over the
  link section is the UI reflecting a real difference. What should *not* fork
  is the tag table below it: that is one table with one shape, and today it is
  two.

The rule separating the two cases: **fork where the protocols genuinely
differ, unify where they only appear to.** The link differs. The value does
not.

### 9.7 Recommendation

Ordered by what pays off soonest, and by what can be done before a second
protocol exists:

| # | Change | Pays off |
|---|---|---|
| 1 | Add `offset` to the Modbus tag | **Immediately, with one protocol.** It is a missing feature today, not preparation |
| 2 | One `TagDataType` vocabulary, width moved into the source | Immediately — it is also what lets a Modbus tag say `uint32` and a UART tag say `uint` without two enums |
| 3 | `modbusBinding` → a neutral name, source behind a discriminator | Before a second protocol; cheap now, a three-way fork later |
| 4 | Gate the binding editor on the project's protocol | Immediately — a CAN project should not be offered a Modbus tag list |
| 5 | One `Tag` type with a `source` union, replacing the two tables | With the second implemented protocol |
| 6 | Transport interface + fan-out transaction in the runtime | With the second implemented protocol |

Items 1, 2 and 4 are worth doing whether or not CAN or UART ever ships: each
fixes something that is wrong with the single protocol that exists. Item 3 is
the one with a deadline. Items 5 and 6 should wait for a second protocol that
is actually being built, because an abstraction with one implementation is a
guess.

### 9.8 The test to keep applying

For every field added to a tag or a binding from here on:

> **Can this be filled in without knowing which bus is behind it?**

Yes → it belongs in the neutral half, and no protocol name should appear in it.
No → it belongs in the source, behind the discriminator.

Applied to today's fields, that test puts `scale`, `offset`, `access`,
`dataType` and everything about the widget in the neutral half, and `area`,
`address`, `frameId`, the bit window, the command template and the reply
locator in the source. It also explains the one field that is currently in the
wrong place: `pollIntervalMs` on a CAN signal, which cannot be answered without
knowing that CAN does not poll.

## 10. Where the abstraction belongs, and how the industry does it

The proposal on the table — **abstract in the editor, keep each protocol
native once compiled** — is right. It is also incomplete in one specific way,
and it turns out the industry answer changes the question rather than answering
it.

### 10.1 Right instinct, one layer short

"Abstract in the editor, native in the firmware" is two layers. It needs three,
because *native* must not be allowed to mean *unrelated*:

| Layer | Knows the protocol? | What lives here |
|---|---|---|
| **Application** — screens, bindings, logic, alarms, trends | **No** | Tags by name. Nothing else |
| **Runtime** — scheduler, value cache, write queue, retry, widget update | **No** | One implementation, shared by every protocol |
| **Driver** — encode a request, decode a response, transaction rules | **Yes, entirely** | One per protocol, sharing nothing |

Two layers rather than three is the trap: three protocols become three code
generators emitting three unrelated firmware shapes, and then scaling, retry,
staleness and write-queue bugs exist in three places and behave differently in
each. The editor would be promising the author "these are all just tags" while
the firmware quietly disagrees — the same class of lie this tool works hard to
avoid between the canvas and the panel.

The good news is that `hmi_runtime.c` is **already** mostly the middle layer.
The scheduler, the cache, the retry counter, the write queue and the widget
update are all protocol-blind; what is Modbus is the client global and the
encode/decode inside it.

One property worth naming, because it answers the cost objection before it is
raised: **the abstraction is editor-time and link-time, not run-time.** The tag
table is generated as a `static const` array, so a project that uses one driver
links one driver. Abstracting costs zero bytes on the panel.

### 10.2 The two promises the neutral layer has to make

This is where an abstraction stops being a naming exercise. Two questions have
three different answers per protocol, and the neutral layer must pick one
answer and hold it:

**1. What does "the write succeeded" mean?**

| | Modbus | CAN | UART command |
|---|---|---|---|
| Write is | a request with a response | a frame sent, unacknowledged at signal level | a command, usually with `OK` / `ERR` |
| Can the runtime confirm it? | Yes | **No** | Usually |

If the neutral layer promises *confirmed*, CAN cannot keep the promise. If it
promises *queued*, a Modbus project loses information it already has. The
honest resolution is to promise **queued**, and let a driver optionally report
confirmation as a per-tag quality flag — so a screen can show "sent" everywhere
and "acknowledged" where the bus can say so. Today's `writeBehavior` quietly
assumes the Modbus answer.

**2. What does a value's age mean?**

| | Modbus | CAN | UART command |
|---|---|---|---|
| A value arrives | when polled | when the frame happens to arrive | when the command is answered |
| "Never arrived" looks like | a timeout | silence, indefinitely | a timeout |

A polled protocol has an error; a receive-driven one just has nothing. So the
neutral layer needs **staleness** as a first-class property of every tag —
*valid*, *stale beyond N ms*, *never received* — not an error code borrowed
from Modbus. The runtime already has half of it: `cached_value_valid`.

Get these two right and the rest of the abstraction follows. Get them wrong and
every protocol added afterwards bends them further.

### 10.3 How the established HMI vendors do it

The pattern is remarkably uniform across the industry — Siemens WinCC / TIA
Portal, Weintek EasyBuilder Pro, Rockwell FactoryTalk View, Mitsubishi GT
Designer, Pro-face GP-Pro EX, Advantech WebAccess, Ignition. Described at the
level of observable behaviour:

| | What it is called | Shape |
|---|---|---|
| **Siemens WinCC** | *Connections* + *Tags* | A tag names a connection, a data type, an address in the driver's own notation (`DB1.DBW20`, `4x0001`), an acquisition cycle and a linear conversion |
| **Weintek EasyBuilder Pro** | *Device list* + address picker | An object's address is *device · address-type · number*; the address-type dropdown changes to whatever the selected driver offers. Internal memory (`LW`, `LB`, `RW`) belongs to no device |
| **Rockwell FactoryTalk View** | *Data servers* | Tags resolve through an OPC or direct server; the address is the PLC's own tag name |
| **Ignition** | *OPC-UA in the middle* | Everything above is an OPC tag; every driver is an OPC server. The extreme form of the same idea |

Five things every one of them shares:

1. **The device (connection) is a first-class object, not a project setting.**
   You do not set "the project's protocol". You add devices, and each device
   names its driver.
2. **The tag is the abstraction; the address stays native.** Nobody attempts to
   make addresses portable between drivers. The tag carries name, type, scale,
   deadband and cycle; the address is spelled in the driver's dialect.
3. **Internal tags exist, belonging to no device.** HMI-local state is a
   first-class citizen — see §10.7.
4. **Everything above tags is protocol-blind**: screens, alarms, trends,
   recipes, scripts, schedulers.
5. **There is always an escape hatch**: a macro language, a "free protocol"
   editor, or a driver SDK. No vendor claims the table covers every device.

And one thing none of them does: **none makes the protocol a project-level
choice that can be switched.** Not because switching is dangerous, but because
in their model there is nothing to switch — the protocol is an attribute of a
device, and a project has as many devices as it has.

### 10.4 The idea that dissolves the question

Move `protocol` from the **project** to a **device**, and every question in
this document changes shape:

| Question, today | Same question, with devices |
|---|---|
| "Is a changeable protocol good design?" | Does not arise. You edit or add a device |
| "Will my tags get scrambled?" | No — tags belong to a device and go where it goes |
| "Should creation lock the protocol?" | Does not arise |
| "What does this switch strand?" | Visible: the device's own tag list |
| "Can we support Modbus *and* UART?" | Yes, by construction |

That last row is not hypothetical for this product. A panel reading a PLC over
Modbus while talking to a barcode scanner or a weighing head over a UART
command protocol is an ordinary industrial arrangement. And the board model
already admits it: `BoardDefinition.protocols` is an **array**, and
`edt-evk043027b` declares `['modbus-rtu', 'can-bus']` — the hardware carries
the wiring for two. The single-protocol constraint is in the project model
alone.

```ts
interface Device {
  id: string;
  name: string;              // "PLC 1", "Scanner"
  protocol: ProtocolId;
  link: LinkConfig;          // per-protocol: serial params / bit timing / framing
  enabled: boolean;
}

interface Tag {
  id: string;
  name: string;
  deviceId: string | null;   // null = internal, see §10.7
  value: { dataType; access; scale; offset; unit? };
  source: TagSource;
}
```

The project's `protocol` field becomes derived — `devices[0].protocol` — until
the cap of one device is lifted, at which point it stops existing.

### 10.5 So should creation lock the protocol?

**No — and locking would be worse than what exists today.**

- It does not prevent the mess; it converts "my bindings are stranded" into
  "I have to rebuild the project from scratch", which is the same loss with
  more work.
- Real projects change device mid-life. The customer swaps the meter, the PLC
  vendor changes, the prototype talks Modbus and the product talks CAN.
- This board already supports two protocols, so locking would forbid something
  the hardware can do.

The right sequence is: **disclose now, devices later.** Before the device model
exists, the switch should say what it will strand (§6 step 1). After it exists,
the question disappears.

### 10.6 Two ways to spell an address

There is a real fork here, and both branches are used in industry:

| | **A. Structured union** | **B. Driver dialect string** |
|---|---|---|
| Storage | `{ kind: 'modbus'; area; address }` | `address: "4x0001"`, parsed by the driver |
| Editor | Proper fields — an area dropdown, a numeric address | One text box plus a driver-supplied validator |
| Validation | Compile-time, in TypeScript | Runtime, in the driver |
| Adding a driver | Editor code for its fields | **No editor code at all** |
| Used by | Tools with a handful of protocols | Weintek, Siemens — hundreds of drivers |

For this product, **A now, with one escape variant**:

```ts
| { kind: 'raw'; address: string }   // for a driver not worth an editor
```

The rationale is scale. With two or three protocols and a high bar for editing
experience, structured fields are better: a Modbus area belongs in a dropdown,
not in a string someone has to spell correctly. B wins at Weintek's scale — a
catalogue of hundreds of PLCs — which is not the position this product is in
and may never be. The `raw` variant means the choice is not irreversible.

### 10.7 Internal tags — the cheapest proof the abstraction holds

Every vendor has them: Weintek's `LW`/`LB`, Siemens' internal tags. A tag with
no device behind it, living in HMI memory. For this product they are worth more
than they look:

1. **They prove the abstraction is protocol-free without a second protocol.**
   If `TagSource` has an `internal` variant with no wire at all, and screens,
   bindings and logic still work unchanged, then the neutral layer really is
   neutral. That is a test that can be run *today*, with one protocol
   implemented, and it is far cheaper than discovering the answer while
   implementing CAN.
2. **They give the previews something to simulate.** Neither preview models a
   tag today, so a bound widget shows its design-time value. An internal tag
   has no device to emulate — the preview can just hold the value and let a
   Write Tag node change it. Suddenly a logic graph is testable without
   hardware.
3. **They give HMI-local state a home**: an operator's setpoint before it is
   sent, a screen-brightness setting, a "confirm" flag between two screens.
   Today that state has nowhere to live — `LogicVariable` is graph-local, and
   the project-level `variables: []` array is dormant, written as `[]`
   everywhere and read by nothing.
4. **They are the natural landing place for retained values** — the ones that
   should survive a reboot in flash.

### 10.8 What else a mature tag layer carries

Breadth, for calibration. These are all standard in the products above and none
exists here yet:

| Feature | What it buys | Cost here |
|---|---|---|
| **Deadband** | Do not update the screen unless the value moved by X | A field and a comparison |
| **Block reads** | Coalesce adjacent registers into one request | Real work, big win at 9600 baud |
| **Per-device status tags** | "Is device 1 online", error counters, bindable to a widget | Nearly free — `hmi_runtime_status_t` already tracks them |
| **Value staleness** | A widget can show last-known versus unknown | §10.2; half-present as `cached_value_valid` |
| **Scaling with offset** | `raw × scale + offset` | One field — and already missing for Modbus (§9.3) |
| **Engineering unit** | Label text follows the tag | One field |
| **Simulation mode** | Drive tags from a pattern with no device attached | Falls out of internal tags |

The third row is the sharpest: the runtime already counts successful and failed
transactions and knows whether communication is up. Exposing that as read-only
tags makes a "device offline" banner a binding rather than a feature.

### 10.9 What the firmware split actually looks like

The driver interface is small, because everything else stays in the shared
runtime:

```c
typedef struct {
    bool     (*begin)(const void *link_config);
    /* Build the next request. Returns false for a receive-driven driver. */
    bool     (*encode)(const hmi_request_t *request, uint8_t *out, size_t *len);
    /* Feed received bytes; yields values for zero or more tags. */
    size_t   (*decode)(const uint8_t *in, size_t len, hmi_value_t *out, size_t max);
    void     (*poll)(void);
} hmi_driver_t;
```

What stays shared: the poll scheduler, the value cache and staleness, deadband,
the write queue, retry and timeout, and the widget update path. That is most of
`hmi_runtime.c` as it stands — the file is already the middle layer, with one
driver hard-wired into it.

Two consequences worth stating:

- **`encode` returning false is how CAN fits.** A receive-driven driver never
  builds a request; the scheduler simply has nothing to send for it and the
  decode path does all the work. The same door lets a UART device push
  unsolicited lines.
- **One driver per device, not per project.** Once devices exist, the runtime
  holds an array of `{ driver, link_config, transport }`, and the tag table
  says which one each tag belongs to.

### 10.10 A staged path

Each stage is shippable on its own and useful on its own:

| Stage | What changes | What it buys | When |
|---|---|---|---|
| **0** | `offset` on Modbus tags; one `TagDataType`; gate the binding editor on the protocol; disclose what a switch strands | Fixes things wrong with the one protocol that exists | Now |
| **1** | Introduce `Device`, **capped at one**. `protocol` becomes `devices[0].protocol`. Tags gain `deviceId`. Migrate the existing config into a device | The pivotal rename; no UI change needed while the cap holds | Before a second protocol |
| **2** | One `Tag` table with `source`; internal tags; the Protocol tab becomes a Devices tab | Proves the abstraction with no second protocol implemented; makes the preview useful | With, or just before, the second protocol |
| **3** | Lift the cap: several devices, possibly different protocols. Driver interface in the runtime | Modbus *and* UART on one panel | When a project needs two buses |

Stage 1 is the one that matters most and is mostly mechanical: wrapping today's
single configuration in a one-element list. Everything after it becomes an
addition rather than a rewrite.

### 10.11 What to decide now

**Decide now:**

- That `protocol` belongs to a device, not to a project — even if the device
  list is capped at one for a year. It is the decision that makes every later
  step additive.
- The two promises in §10.2: writes are **queued**, with confirmation as an
  optional per-tag quality; values carry **staleness**, not a Modbus error
  code.
- That the tag's neutral half and its source are separate, with the semantic
  type on the value and the width on the source (§9.4).

**Do not decide now:**

- The UART locator vocabulary — it needs a real device (§8.8).
- Whether addresses are structured or dialect strings for *future* drivers.
  Start structured, keep the `raw` variant as the exit.
- Anything about multiple simultaneous devices beyond leaving room for them.

**Do not do:**

- Lock the protocol at project creation. It trades a recoverable problem for an
  unrecoverable one.
- Abstract the link layer. Serial parameters, CAN bit timing and UART framing
  have nothing in common, and a union of them is two-thirds noise whichever is
  selected (§9.6).
