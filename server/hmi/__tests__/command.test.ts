import { describe, expect, it } from 'vitest';
import { runExecutable } from '../command';

/**
 * Node itself is the one executable guaranteed to be here, so the fixtures are
 * `node -e` scripts rather than a shell.
 */
const NODE = process.execPath;

describe('runExecutable streaming', () => {
  it('reports lines before the process exits, and still returns the whole output', async () => {
    const seen: { line: string; stream: string }[] = [];

    const result = await runExecutable(
      NODE,
      ['-e', 'console.log("one"); console.log("two"); console.error("problem");'],
      { onLine: (line, stream) => seen.push({ line, stream }) },
    );

    // Order holds within a stream but not across them: stdout and stderr are
    // separate pipes, so a build's warnings interleave with its progress in
    // arrival order rather than being grouped the way the batched path grouped
    // them. That is a real behaviour change and it is the wanted one - an error
    // shows up next to the line that provoked it.
    expect(seen.filter((entry) => entry.stream === 'stdout').map((e) => e.line))
      .toEqual(['one', 'two']);
    expect(seen.filter((entry) => entry.stream === 'stderr').map((e) => e.line))
      .toEqual(['problem']);
    // The whole point of streaming is that it costs the caller nothing: the
    // buffered result is still there for anyone who wants it at the end.
    expect(result.stdout).toContain('one');
    expect(result.stderr).toContain('problem');
    expect(result.exitCode).toBe(0);
  });

  it('joins a line split across two writes rather than reporting half of it', async () => {
    const seen: string[] = [];

    await runExecutable(
      NODE,
      [
        '-e',
        'process.stdout.write("half a "); setTimeout(() => process.stdout.write("line\\n"), 20);',
      ],
      { onLine: (line) => seen.push(line) },
    );

    expect(seen).toEqual(['half a line']);
  });

  it('reports a trailing line that never got its newline', async () => {
    const seen: string[] = [];

    await runExecutable(
      NODE,
      ['-e', 'process.stdout.write("no newline at the end");'],
      { onLine: (line) => seen.push(line) },
    );

    expect(seen).toEqual(['no newline at the end']);
  });

  it('carries a non-zero exit code through', async () => {
    const result = await runExecutable(
      NODE,
      ['-e', 'process.exit(3);'],
      { onLine: () => {} },
    );

    expect(result.exitCode).toBe(3);
  });

  it('keeps the output collected so far when the budget runs out', async () => {
    const seen: string[] = [];

    const result = await runExecutable(
      NODE,
      ['-e', 'console.log("before the wait"); setTimeout(() => {}, 10_000);'],
      { onLine: (line) => seen.push(line), timeoutMs: 300 },
    );

    // A timed-out build has to be diagnosable, which means keeping what it did
    // manage to say.
    expect(seen).toContain('before the wait');
    expect(result.exitCode).not.toBe(0);
  });

  it('leaves the buffered path alone when no line handler is given', async () => {
    const result = await runExecutable(NODE, ['-e', 'console.log("batched");']);

    expect(result.stdout.trim()).toBe('batched');
    expect(result.exitCode).toBe(0);
  });
});
