# The UART command protocol, and the editor that has to manage it

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/uart-command-protocol.md">繁體中文</a>
</p>

Status: **planning only. No code has been changed.** Verified against the
source, not from memory.

Two documents lead here. [protocol-and-tags.md](./protocol-and-tags.md) §8 asked
whether a UART command protocol can be *addressable* and concluded yes —
templates on the connection, an address on the tag.
[protocol-coexistence.md](./protocol-coexistence.md) asked what happens when it
shares a wire with Modbus, and what that costs components, logic and each of the
three boards. Both are about the model. **This one is about the author**: what
the command design has to satisfy to be worth having at all, what it looks like
on the STM32H747I-DISCO where Modbus already runs tag-shaped, whether it is
feasible, and what the Protocol tab has to become before any of it is usable by
someone who is not holding a protocol manual.

The short answers, so the rest can be skipped:

- **Feasible: yes**, and smaller than it looks — the tag table does not change,
  the descriptor changes two fields of thirteen, and the firmware seam is
  already written as a diff between two board files (§3).
- **The command design that satisfies the project's core value** is one where a
  device is described **once** and a value is named **once**, and nothing above
  the tag layer ever learns that ASCII was involved (§1, §2).
- **Graphical management: yes, and it is the larger half of the work** — but
  every item of it improves the Modbus screen that exists today, so none of it
  is speculative spending on a protocol that has not shipped (§4, §5).

## 1. The core value, stated so it can be used as a test

The README's promise is a visual editor that produces C for an LVGL screen
without the author writing code. Carried into the protocol layer, that is one
sentence:

> **The author names values. The tool deals with the wire.**

That is testable, so make it four tests and apply them to every proposed
command feature:

| | Test | Fails when |
|---|---|---|
| **T1** | Nothing above the tag layer knows the protocol | A widget binding or a logic node has to know that a value arrives as ASCII |
| **T2** | A device is described once, a value once | A 40-parameter device costs 40 hand-typed command strings |
| **T3** | What the model cannot express is refused visibly | A stateful, login-first device gets contorted into the tag table instead of being sent to the code hatch |
| **T4** | The author can see it work before the board exists | The only way to find out whether the command was right is to build, flash, and watch a widget stay blank |

T1–T3 are already settled by [protocol-and-tags.md](./protocol-and-tags.md) §8
and are restated in §2 only far enough to build on.

**T4 is the one this document is really about**, and it is new. It is also the
test the current Protocol tab fails hardest — and, importantly, it is a test
Modbus lets you get away with failing:

| | Modbus RTU | A command protocol |
|---|---|---|
| Getting the address wrong | Exception code 02, or a timeout. Loud, and it means one thing | A reply that parses to `0`, or no reply, or a reply for a *different* parameter |
| Getting the framing wrong | CRC fails; the client already handles it | `GET TEMP\r` versus `GET TEMP\r\n` — the device may answer, answer late, or answer once and then never again |
| Getting the value's position wrong | Impossible; a register is a register | `TEMP=25.4` versus `TEMP = 25.4` versus `25.4 C` — three different locators, all plausible |
| Case, spacing, terminators | Not applicable | Every one of them is a silent failure mode |

A Modbus address is either right or wrong, and the failure is legible. A command
protocol has a dozen ways to be *nearly* right, and every one of them looks the
same from a blank widget. **A command protocol without a live view of the
traffic is a guessing game**, and asking a no-code author to play it by
build-flash-squint is not a product.

So T4 is not a nice-to-have that arrives in version two. It is the feature that
makes the other three worth building.

## 2. The model, and the one level the earlier documents left implicit

Recapped in one table, from [protocol-and-tags.md](./protocol-and-tags.md) §8.3
and §8.5 — this part is settled and is not re-argued here:

| Belongs to | What | Why there |
|---|---|---|
| **Link** | Baud, parity, framing/terminator, checksum, echo suppression, inter-command gap | Two devices on one wire must agree on all of it |
| **Device** | `read` / `write` templates: `GET {address}` / `SET {address} {value}` | T2 — the shape is typed once |
| **Tag** | The address string (`TEMP`, `40001`, `MEAS:VOLT`), plus the value's type, scale, access and poll interval | The tag table stays **one** table across all three protocols |
| **Tag, exceptionally** | A per-tag command override and a locator | The exceptions, so the regular case stays empty |

What both earlier documents left implicit is the level between a device and its
tags, and it is worth naming because it is the thing the UI has to draw:

```
Link ──── Device ──── (Command) ──── Tag
 │           │             │           └── name, type, scale, access, poll
 │           │             └── one request, one reply, N locators
 │           └── templates, station address, timeout, retries
 └── baud, framing, checksum, gap, half-duplex
```

**A Command is one exchange: one thing sent, one reply expected, and one or more
values found inside it.** In the regular case it is invisible — the device's
template plus the tag's address *is* the command, and the author never sees the
level at all. It becomes visible in exactly one situation, and it is a common
one:

> `STATUS?` → `25.4,60,1,0`

One request, four values. [protocol-and-tags.md](./protocol-and-tags.md) §8.4
already observed that this is the CAN relationship spelled in text — a frame
carries several signals — and §8.6 already observed that the firmware
transaction has to fan out to serve it.

Here is the payoff that observation has not yet been cashed in for: **the editor
needs exactly one "one request, several values" interface, and it serves CAN
frames and bulk text replies with the same controls.** That is one concept to
design, one to test, and one for an author to learn, covering two protocols.

It also fixes something already wrong. The CAN section of the panel today draws
signals as a **flat twelve-column table with `Frame ID` repeated on every row**
(`ProtocolPanel.tsx:925`). The frame → signal relationship exists in the data
and is invisible in the UI. Building the bulk-reply table the same way would
repeat the mistake in a second protocol; building the grouped one fixes both.

Three model decisions follow, and they are the ones to make now:

1. **A Command is a first-class, optional, named object under a device.** Absent
   for a template-driven device; explicit for bulk replies and for one-shot
   verbs like `TARE` that have no address.
2. **Locators belong to the command, not to the link.** Framing says where a
   reply *ends*; a locator says where a value *is*. Those are different
   questions and only the first is per-link.
3. **A tag references a command and a locator, or neither.** Neither is the
   regular case, and it is what keeps T2 true.

## 3. Is it feasible on the STM32H747I-DISCO?

Yes. Piece by piece, with what is actually there:

| Layer | What has to change | Size |
|---|---|---|
| Tag table | **Nothing.** The address cell renders a string instead of area + number | — |
| Widget binding | Nothing beyond what [protocol-coexistence.md](./protocol-coexistence.md) §4 already asks for with one protocol | — |
| Logic | Nothing beyond the tag-keyed runtime API of §5 there — which removes three refusals it should not have had anyway | — |
| Descriptor ABI | `area` + `address` become a tagged `source` union: **two of thirteen fields** ([protocol-and-tags.md](./protocol-and-tags.md) §8.6) | Surgical |
| Firmware transport | Already a diff, not a design problem: five operations, isolated in `modbus_rtu_async_client.c` ([protocol-coexistence.md](./protocol-coexistence.md) §12.4) | Known |
| Firmware driver | New: template substitution, terminator scan, checksum, and the five locators | The real work — a few hundred lines, written **once** if §12.4's hoist happens first |

Nothing there is hard. What *is* board-specific, and is the honest answer to
"on the H747I":

- **That board has one link.** USART1 on PA9/PA10 through the ST-LINK VCP, and
  nothing else ([protocol-coexistence.md](./protocol-coexistence.md) §12.1). So a
  command device there is not an addition — it is a **co-tenant**, and all six
  rules of §3 apply from the first day.
- **R5 has teeth on this board.** A device that pushes unsolicited lines needs a
  link of its own, and the H747I has no second link to give it. On that board the
  editor's answer has to be a refusal, not a warning. The EDT board is where such
  a device can be accommodated, because its RS-485 port is a real second link
  ([protocol-coexistence.md](./protocol-coexistence.md) §12.2).
- **The budget arithmetic is literally true there.** It is a real UART at a real
  baud rate, so §8's numbers apply as written: ≈ 25 ms a Modbus exchange, ≈ 47 ms
  an ASCII round trip, and a four-tag cycle around 122 ms. Which means a command
  device on the H747I *costs* something visible, and the author should see the
  cost while choosing the poll interval, not after flashing.
- **Memory is a non-issue.** Locator tables are static, and one reply buffer per
  link is a couple of hundred bytes against 4 MB of LVGL heap in external SDRAM.
- **Do not reach for the Cortex-M4** ([protocol-coexistence.md](./protocol-coexistence.md)
  §12.5). The cycle above is 122 ms of waiting.

So: feasible, and the H747I is a reasonable board to prove it on — with the
caveat that on a single-link board every command tag competes with every Modbus
tag for the same wire, which makes the link budget of §5 part of the feature
rather than a follow-up to it.

## 4. Why the Protocol tab as it stands cannot manage this

The screen today is two cards of fields and one flat table. That is survivable
for one Modbus device with a handful of registers. Against a command protocol it
fails, and the failures are worth listing precisely, because each one is a
specification for §5.

**It is a settings form, not a workspace.** Everything on it is a value to be
stored. Nothing on it shows state, traffic, consequence, or whether any of it is
correct.

**There is no validation of any kind.** Verified: the panel reports service-level
errors only — failing to list ports, failing to save, a failed port test
(`ProtocolPanel.tsx:163`, `:253`, `:331`). Nothing checks a single field. Two tags
may share a name. An address may exceed the area. A poll interval may be shorter
than the link can physically serve. A scale may be `0`, which silently zeroes
every reading. All of these are accepted, saved, compiled and shipped.

**The tag table does not know who uses it.** There is no "used by" column, so
deleting a tag is a silent act with consequences elsewhere — the failure
[protocol-and-tags.md](./protocol-and-tags.md) §1 wants a **LACK** badge for.

**"Test" does not test the link.** Verified: `HmiService.testPort`
(`server/hmi/service.ts:393`) lists ports by shelling out to
`STM32_Programmer_CLI -l uart` and checks whether the chosen name appears in the
output. It never opens the port and never sends a byte. The button reports
success for a port that nothing is attached to. For Modbus that is merely
misleading; for a command protocol it is useless, because everything that can go
wrong happens *after* the port opens.

**Nothing anywhere in the tool shows traffic.** Not a byte, in either direction,
at any point in the workflow. This is the T4 failure, and it is total.

**The flat table does not scale.** Eight columns and one row per tag, with no
search, no sort, no grouping, no multi-select, no duplicate, no import. A
command device with forty named parameters is precisely the case that breaks
it — and forty parameters is a small device.

**The address cell is untyped, and its meaning lives somewhere else.** The cell
says `0`; the sentence explaining that `0` means holding register 400001 is a
line of prose at the bottom of a *different* card. Under a second protocol that
same cell has to mean a parameter name, and prose-at-the-bottom does not survive
the change.

None of this is an argument that the current screen was built wrong. It is an
argument that it was built for one device, one protocol and a short table, and
that a command protocol is the point where each of those assumptions stops
holding.

## 5. The editor it should become

A three-region layout, replacing two stacked cards:

```
┌ Connections ───┬ Tags ──────────────────────────────────────────────┐
│ ▾ COM  9600 8N1│  Search […]            Device: [all ▾]  + Add Tag  │
│   ● PLC   mbus │ ┌────────┬────────┬──────────┬──────┬─────┬──────┐ │
│   ● Scale uart │ │ Name   │ Device │ Address  │ Type │ Poll│ Used │ │
│     ▸ STATUS?  │ │ Motor… │ PLC    │ 4x 40001 │ u16  │ 250 │ 3    │ │
│ ▾ RS-485  idle │ │ Weight │ Scale  │ WT       │ f32  │ 500 │ 1    │ │
│   (no devices) │ │ Tare   │ Scale  │ TARE  ⚠  │ —    │  —  │ 0    │ │
│ ✚ Add link     │ └────────┴────────┴──────────┴──────┴─────┴──────┘ │
├────────────────┴────────────────────────────────────────────────────┤
│ Budget  COM ▰▰▰▰▰▰▱▱▱▱ 122 ms / 250 ms cycle · 49 %                 │
├─────────────────────────────────────────────────────────────────────┤
│ Monitor                                          ⏵ Live   ⧉ Clear   │
│ 19:21:04.118  ⇢ Scale   47 45 54 20 57 54 0D 0A   GET WT␍␊          │
│ 19:21:04.161  ⇠ Scale   57 54 3D 31 32 2E 33 0D…  WT=12.345 → 12.345│
│ 19:21:04.166  ⇢ PLC     01 03 00 00 00 02 C4 0B   read 40001×2      │
│ 19:21:04.191  ⇠ PLC     01 03 04 …                MotorSpeed = 1450 │
└─────────────────────────────────────────────────────────────────────┘
```

Six things in that sketch are the actual proposal:

**1. Connections as a tree, with links derived from the board.** Link → device →
command, statuses on the nodes. The link list comes from the board definition
([protocol-coexistence.md](./protocol-coexistence.md) §12.6), so a project cannot
ask for a wire the board does not have, and the RS-485 row on the EDT board can
say *fitted, no device* honestly.

**2. One tag table for the whole project**, with a Device column, search,
grouping and a **Used by** count that opens a popover listing the widgets and
logic nodes — one click to the thing that would break. The address cell renders
per protocol: an area dropdown plus a number for Modbus, a parameter name for
UART, a frame plus bit window for CAN. Same table, same columns, one cell that
changes shape.

**3. The Command Composer**, which is where a command protocol is actually
authored:

```
Device: Scale        Protocol: UART command
Read   [ GET ][{address}]                    ⌄ terminator CRLF
Write  [ SET ][{address}][ ][{value}]        ⌄ checksum   none
                                             ⌄ gap        20 ms
Preview  for tag  [ Weight ▾ ]
   send  47 45 54 20 57 54 0D 0A
         G  E  T  ␣  W  T  ␍  ␊
   ⏵ Try it        against  ( ) COM7   (•) Simulator
   reply WT=12.345␍␊
   locate ( ) whole  (•) strip affix  ( ) field  ( ) bytes  ( ) pattern
          prefix [WT=]  suffix [ ]        → WT=[12.345]  =  12.345 ✓
```

The parts that carry the weight:

- **Templates are built from chips, not typed as strings.** `{address}` and
  `{value}` are tokens the author drops in, so they cannot be misspelled.
- **The preview shows the bytes, with invisible characters made visible.**
  Terminators, spacing and case are where command protocols actually fail
  (§1), and a hex line with `␍␊` under it removes an entire class of bug before
  it reaches hardware. This single control is, in my opinion, the highest
  value-per-line item in the whole feature.
- **The locator ladder is a radio group over a real reply**, with the match
  highlighted inside the string as the author switches rungs. It turns
  [protocol-and-tags.md](./protocol-and-tags.md) §8.4's ladder from a
  specification into something learnable by trying it — and keeps the regex rung
  last and visibly last, where it belongs.
- **Try it, against the simulator or a real port.** With the simulator selected
  it needs no board and no device, which is what makes T4 satisfiable during
  design rather than after deployment.

**4. A grouped bulk-reply / frame view.** A command with several locators draws
as a parent row with its tags beneath it, and CAN frames adopt the same control
(§2). The flat repeated-`Frame ID` table goes away.

**5. A link budget bar**, per link, recomputed as poll intervals change
([protocol-coexistence.md](./protocol-coexistence.md) §8 and §12.3). Arithmetic
that is visible while the author is choosing, not a warning after a build. On
the CDC link it is computed per transport rather than from the baud rate.

**6. The Monitor.** One row per exchange: timestamp, direction, device, raw
bytes, decoded meaning, and which tag the value landed on. Errors — timeout, bad
checksum, no match for the locator — as rows in the same stream, in place. This
is a *protocol* view, not a terminal: it is grouped by exchange and annotated
with meaning. It should not grow a free-typing send box as its primary control;
that is a different tool, and making it the main path invites authoring by
guesswork instead of by composer.

Two smaller items worth having in the same pass: **inline validation** on every
field with the rule stated in place (duplicate names, address range for the
area, scale ≠ 0, poll interval below what the link can serve), and **CSV import**
for the tag table, because a forty-parameter device arrives as a table in a PDF
and nobody should retype it.

## 6. What a live view costs, and the one dependency decision in it

The Monitor and *Try it* both need the editor to open a serial port, which it
cannot do today. Verified: the local HMI service enumerates ports by shelling out
to `STM32_Programmer_CLI -l uart` (`server/hmi/service.ts:349`) and there is no
serial dependency anywhere in `package.json`. Two routes:

| | Route | Cost | Consequence |
|---|---|---|---|
| **A** | A serial library in the Node service | A **native** module. The desktop plan ships the backend as an esbuild bundle plus `node.exe` ([desktop-installer-packaging.md](./desktop-installer-packaging.md) §2), and a native binding has to be carried per platform | The service can drive the port headlessly — useful later for automated checks |
| **B** | Web Serial in the front end | No new backend dependency; works in the browser build and in the WebView2 shell; the user grants the port from the host's own prompt | The port is held by the front end, not the service. No headless use |

**Recommendation: B first.** *Try it* and the Monitor are author-time tools with
a human present, which is exactly the case Web Serial is for, and B keeps the
installer story of the packaging document untouched. Revisit A only when
something needs the port with no window open.

One practical note either way: the PC-side two-protocol simulator
([protocol-coexistence.md](./protocol-coexistence.md) §9) and the editor's
*Try it* both want the same COM port, and only one process can hold it. Either
the simulator gets a second virtual port pair, or *Try it* asks the simulator
over its own channel rather than over the wire. The second is simpler and is
what the sketch above assumes.

## 7. Order of work

Mapped onto the stages in [protocol-coexistence.md](./protocol-coexistence.md)
§10, so the two plans stay one plan:

| Editor work | Belongs with stage | Needs hardware? | Useful with only Modbus? |
|---|---|---|---|
| Inline validation on every field | 0 | No | **Yes** |
| Typed address cell; the mapping hint moves into the cell | 0 | No | **Yes** |
| Tag table: search, sort, grouping, **Used by**, CSV import | 0–2 | No | **Yes** |
| Connections tree, links derived from the board | 1 | No | Yes |
| Monitor + *Try it* against the simulator | 1–2 | No | **Yes** |
| Link budget bar | 2 | No | **Yes** |
| Grouped frame/bulk view; CAN signals adopt it | 2 | No | Yes (fixes CAN today) |
| Command Composer with byte preview and locator ladder | 5 | No — simulator | No |
| Rename/repair *Test* into a real link check | 0 | No | **Yes** |

Nine of ten rows need no hardware, and seven improve the screen with the one
protocol that exists. That is the answer to whether the editor rework is
speculative spending: it is not, and it should start before the second protocol
rather than alongside it.

## 8. What to decide now, and what not to

**Decide now:**

- **A Command is a first-class optional object** between device and tag, shared
  in the UI with CAN frames (§2). Deciding this late means two "one request,
  several values" interfaces instead of one.
- **The composer previews bytes, with invisible characters shown** (§5). It is
  small, and it removes the failure mode that makes command protocols hard.
- **The locator ladder is structured-first and regex-last**, and the UI must make
  the last rung feel last ([protocol-and-tags.md](./protocol-and-tags.md) §8.4).
- **Live traffic is part of the feature, not a follow-up** (T4). A command
  protocol without it is not usable by the audience this tool is for.

**Do not decide now:**

- The locator vocabulary and the framing and checksum lists — write them against
  a device that exists ([protocol-and-tags.md](./protocol-and-tags.md) §8.8).
- Web Serial versus a native serial module (§6). Ship the Monitor against the
  simulator first and let the requirement prove itself.
- How many commands a device may have, and whether commands can be reordered.

**Do not do:**

- **Do not put a command string on every tag.** It breaks T2 and makes a
  forty-parameter device forty chances to mistype a verb.
- **Do not let the Monitor become a terminal.** A free-text send box as the
  primary control turns authoring back into guesswork, which is the thing the
  composer exists to end.
- **Do not add a locator rung that only a regex author understands** before the
  four structured rungs have been tried against a real device.
- **Do not contort a stateful device into the tag table.** Log-in-then-read is
  the documented limit; the answer is the generated code hatch
  ([protocol-and-tags.md](./protocol-and-tags.md) §8.7), and saying so plainly is
  T3.
