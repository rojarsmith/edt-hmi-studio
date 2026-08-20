# Streaming the build log

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/streaming-build-log.md">繁體中文</a>
</p>

A firmware build takes minutes and used to show nothing until it ended. This is
what was buffering it, what replaced that, and what changed in the output as a
result. Verified against the source, not from memory.

## 1. Four buffers, in a row

Nothing about the old behaviour was accidental — every layer independently
waited for the one below it to finish:

| Layer | Where | What it did |
|---|---|---|
| Child process | `server/hmi/command.ts` | `execFile`'s callback form buffers stdout and stderr in memory (`maxBuffer: 16 MB`) and resolves **only on exit** |
| Service | `server/hmi/service.ts` | `log.push(...commandLog(result))` — nothing to push until the above returned |
| Transport | `vite-plugin-hmi.ts` | One POST, `await service.buildProject(...)`, then a single JSON response |
| Client | `src/store/deployStore.ts` | `await buildHmiProject()`, then one `append(result.log)` |

The bottom one is the root: with `execFile` the server itself does not know a
single line until the process exits, so no amount of work on the three above it
would have helped.

## 2. What replaced it

**`runExecutable` gained an `onLine` option** (`server/hmi/command.ts`).
Supplying it switches to `spawn` and reports each complete line as it arrives;
omitting it keeps the original `execFile` path untouched. Only the build passes
it — the short commands (port listing, probe checks, flashing) stay on the
path that has no partial-line bookkeeping to get wrong.

The streaming path still resolves with the whole `stdout` / `stderr` /
`exitCode`, so **streaming costs the caller nothing**: a caller can follow along
and still read the complete output at the end. Two details that matter:

- **Chunk boundaries are not line boundaries.** A line split across two `data`
  events is held back until its newline arrives, so it is reported once and
  whole. A trailing line that never gets a newline is flushed at exit.
- **`spawn` has no `timeout` option** in the form `execFile` offers, so the
  budget is enforced with a timer that kills the child and still resolves with
  what it managed to say. A timed-out build stays diagnosable.

**A log channel** (`server/hmi/buildLog.ts`) sits between the build and whoever
is watching: lines in, subscribers out, keyed by a **run id**. It replays before
it follows, so a subscriber that connects late — or reconnects after a dropped
socket — sees the whole build rather than its tail. Channels are retained five
minutes after the build ends and then dropped.

**SSE** carries it to the browser: `GET /api/hmi/build-log/:runId`, with
`?from=N` to resume. A heartbeat every 15 s keeps intermediaries from closing a
stream that is merely waiting on a compiler.

## 3. The run id, and why the POST did not have to change

The obvious design — make `POST /api/hmi/build` return a build id immediately
and run the build in the background — would have changed the endpoint's whole
contract: its error handling, its result, and every test around it.

It was not necessary. **The client generates a run id before it POSTs**, so it
can subscribe before the build has produced anything. The POST stays exactly as
it was, still running to completion and still returning the whole log. Live
output is purely additive, which is also what makes the fallback trivial:

```ts
// deployStore.runBuild
const runId = newRunId();
let streamed = 0;
const stopStreaming = subscribeBuildLog(runId, (line) => { streamed += 1; append(line); });
try { result = await buildHmiProject(projectFile, runId); }
finally { stopStreaming(); }
// The stream and the response carry the same sequence, so take it from
// whichever actually arrived rather than from both.
if (streamed === 0) append(result.log);
```

If SSE is unavailable, or the browser has no `EventSource`, or the stream never
connects, the build behaves exactly as it did before. Nothing degrades to
broken; it degrades to slow.

**One sink, one sequence.** Inside `buildProject` every `log.push` became
`emit`, which appends to the returned array *and* pushes to the channel. That is
what lets the client trust `streamed === 0` as the test: the two destinations
cannot drift because there is only one call site feeding them.

## 4. What visibly changed in the log

Two differences are worth knowing about, because they are not bugs.

**stdout and stderr now interleave in arrival order.** They are separate pipes,
so their relative ordering was never guaranteed — the old `commandLog()` hid
that by appending all of stdout and then all of stderr. Streaming shows them as
they come, which means a warning appears next to the line that provoked it
rather than in a block at the end. This is the wanted behaviour, and
`server/hmi/__tests__/command.test.ts` asserts ordering **within** each stream
rather than across them, because across is not a promise anyone can keep.

**Entries are now one line each** rather than one blob per stream. The rendered
text is identical — the client joins with `\n` either way — but a consumer
counting entries would see a different number.

## 5. Measured

A real STM32H747I-DISCO build, sampling the dock's log every two seconds while
`busy` was still `'building'`:

| t | lines shown | still running | last line |
|---|---|---|---|
| 2 s | 16 | yes | `-- The ASM compiler identification is GNU` |
| 6 s | 75 | yes | `[40/585] Building C object …` |
| 12 s | 212 | yes | `[177/585] …` |
| 20 s | 298 | yes | `[263/585] …` |

Before this change every one of those lines was invisible until the build
ended.

Note what Ninja is already printing: `[263/585]`. **A progress indicator is now
almost free** — the number is in the stream, it just is not being read yet.

## 6. What was deliberately left alone

- **Flashing still batches.** It takes seconds, not minutes, and the machinery
  is there the day that stops being true: `flashBuild` needs the same `emit`
  treatment and a run id, nothing more.
- **`GET /api/hmi/builds/:id` is untouched.** The polling path it documents
  still works and is still the right answer for a client that will not hold a
  connection open.
- **No progress bar.** §5 says why it would be cheap; it is a separate change
  with its own UI questions.
