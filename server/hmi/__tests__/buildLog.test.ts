import { afterEach, describe, expect, it } from 'vitest';
import {
  closeBuildLog,
  openBuildLog,
  pushBuildLog,
  resetBuildLogs,
  subscribeBuildLog,
} from '../buildLog';

afterEach(() => {
  resetBuildLogs();
});

function collect(runId: string, from = 0) {
  const lines: { index: number; line: string }[] = [];
  let done = false;
  const stop = subscribeBuildLog(
    runId,
    from,
    (line, index) => lines.push({ index, line }),
    () => {
      done = true;
    },
  );
  return { lines, stop, isDone: () => done };
}

describe('build log channel', () => {
  it('delivers lines to a subscriber as they are pushed', () => {
    openBuildLog('run-1');
    const watcher = collect('run-1');

    pushBuildLog('run-1', 'compiling ui.c');
    pushBuildLog('run-1', 'compiling ui_events.c');

    expect(watcher.lines).toEqual([
      { index: 0, line: 'compiling ui.c' },
      { index: 1, line: 'compiling ui_events.c' },
    ]);
  });

  it('replays what a late subscriber missed before following along', () => {
    openBuildLog('run-2');
    pushBuildLog('run-2', 'first');
    pushBuildLog('run-2', 'second');

    // A build takes minutes; a client that arrives at minute two still needs
    // minute one.
    const watcher = collect('run-2');
    expect(watcher.lines.map((entry) => entry.line)).toEqual(['first', 'second']);

    pushBuildLog('run-2', 'third');
    expect(watcher.lines.map((entry) => entry.line)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('resumes from an index so a reconnect does not repeat itself', () => {
    openBuildLog('run-3');
    pushBuildLog('run-3', 'a');
    pushBuildLog('run-3', 'b');
    pushBuildLog('run-3', 'c');

    const watcher = collect('run-3', 2);

    expect(watcher.lines).toEqual([{ index: 2, line: 'c' }]);
  });

  it('tells watchers when the build ends and stops delivering', () => {
    openBuildLog('run-4');
    const watcher = collect('run-4');

    pushBuildLog('run-4', 'done compiling');
    closeBuildLog('run-4');
    pushBuildLog('run-4', 'this arrives after the end');

    expect(watcher.isDone()).toBe(true);
    expect(watcher.lines.map((entry) => entry.line)).toEqual(['done compiling']);
  });

  it('reports completion immediately to a subscriber that arrives too late', () => {
    openBuildLog('run-5');
    pushBuildLog('run-5', 'only line');
    closeBuildLog('run-5');

    const watcher = collect('run-5');

    expect(watcher.lines.map((entry) => entry.line)).toEqual(['only line']);
    expect(watcher.isDone()).toBe(true);
  });

  it('stops delivering to a watcher that unsubscribed', () => {
    openBuildLog('run-6');
    const watcher = collect('run-6');

    pushBuildLog('run-6', 'seen');
    watcher.stop();
    pushBuildLog('run-6', 'not seen');

    expect(watcher.lines.map((entry) => entry.line)).toEqual(['seen']);
  });

  it('starts a reopened channel empty', () => {
    openBuildLog('run-7');
    pushBuildLog('run-7', 'from the first build');
    closeBuildLog('run-7');

    openBuildLog('run-7');
    const watcher = collect('run-7');

    expect(watcher.lines).toEqual([]);
    expect(watcher.isDone()).toBe(false);
  });
});
