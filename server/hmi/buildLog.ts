// Live build output, from the build that produces it to whoever is watching.
//
// A firmware build takes minutes, and until now every line of it was buffered
// four times over and arrived at once when the process exited. This is the
// server half of fixing that: the build pushes lines here as they happen, and
// the SSE endpoint in vite-plugin-hmi.ts subscribes on the client's behalf.
//
// Channels are keyed by a run id the client generates before it POSTs, so it
// can subscribe before the build has anything to report. See
// docs/streaming-build-log.md.

type LineListener = (line: string, index: number) => void;

interface Channel {
  lines: string[];
  done: boolean;
  listeners: Set<LineListener>;
  doneListeners: Set<() => void>;
  /** Cleared when a channel is reopened, set when it closes. */
  reaper?: ReturnType<typeof setTimeout>;
}

/**
 * How long a finished channel stays readable. A client that connects late, or
 * reconnects after a dropped socket, can still replay the whole build; after
 * this the lines are only in the build's own result.
 */
const RETENTION_MS = 5 * 60_000;

/** A run that never closes must not pin its lines forever. */
const MAX_LINES = 50_000;

const channels = new Map<string, Channel>();

function channel(runId: string): Channel {
  let existing = channels.get(runId);
  if (!existing) {
    existing = { lines: [], done: false, listeners: new Set(), doneListeners: new Set() };
    channels.set(runId, existing);
  }
  return existing;
}

/** Starts a channel, or reopens one a subscriber has already created. */
export function openBuildLog(runId: string): void {
  const target = channel(runId);
  if (target.reaper) {
    clearTimeout(target.reaper);
    target.reaper = undefined;
  }
  target.lines = [];
  target.done = false;
}

export function pushBuildLog(runId: string, line: string): void {
  const target = channel(runId);
  if (target.done || target.lines.length >= MAX_LINES) return;
  const index = target.lines.length;
  target.lines.push(line);
  for (const listener of target.listeners) listener(line, index);
}

export function closeBuildLog(runId: string): void {
  const target = channels.get(runId);
  if (!target || target.done) return;
  target.done = true;
  for (const listener of target.doneListeners) listener();
  target.reaper = setTimeout(() => channels.delete(runId), RETENTION_MS);
  // A build that outlives the dev server's usefulness should not keep it alive.
  target.reaper.unref?.();
}

/**
 * Replays everything from `from` onwards, then follows. Returns the unsubscribe.
 *
 * Replay-then-follow rather than follow-only is what makes a late subscriber,
 * or one that reconnected, see the whole build rather than its tail.
 */
export function subscribeBuildLog(
  runId: string,
  from: number,
  onLine: LineListener,
  onDone: () => void,
): () => void {
  const target = channel(runId);

  for (let index = Math.max(0, from); index < target.lines.length; index += 1) {
    onLine(target.lines[index], index);
  }
  if (target.done) {
    onDone();
    return () => {};
  }

  target.listeners.add(onLine);
  target.doneListeners.add(onDone);
  return () => {
    target.listeners.delete(onLine);
    target.doneListeners.delete(onDone);
  };
}

/** Test seam: forget every channel. */
export function resetBuildLogs(): void {
  for (const target of channels.values()) {
    if (target.reaper) clearTimeout(target.reaper);
  }
  channels.clear();
}
