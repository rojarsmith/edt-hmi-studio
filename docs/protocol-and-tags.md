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

A line-oriented UART command protocol usually is not addressable. It looks
like:

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
