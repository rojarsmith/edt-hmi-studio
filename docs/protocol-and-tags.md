# Protocol, tags, and what survives a change — an analysis

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/protocol-and-tags.md">繁體中文</a>
</p>

Status: **analysis only. Nothing here has been implemented.** It records what
the code does today, answers three questions asked of it, and lists what would
have to change and in what order.

The three questions:

1. Is it good design to let a project change its **Protocol** after creation?
2. Will the **communication tags** get scrambled when it does?
3. What happens when a third protocol arrives — specifically a **custom UART
   command architecture**, which is neither Modbus nor CAN in shape?

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
