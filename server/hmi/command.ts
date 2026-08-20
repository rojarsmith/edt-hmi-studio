import { execFile, spawn } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /**
   * Called for each complete line as it is produced, rather than once the
   * process exits. Supplying it switches to `spawn`, because `execFile`'s
   * callback form buffers everything until exit and cannot report progress.
   *
   * The resolved CommandResult is unchanged either way, so a caller can stream
   * and still read the whole output at the end.
   */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  /**
   * Aborting kills the child and resolves with what it said before it died.
   * Only the streaming path honours it: the buffered callers are short enough
   * that there is nothing to interrupt.
   */
  signal?: AbortSignal;
}

export function runExecutable(
  executablePath: string,
  args: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return options.onLine
    ? runStreaming(executablePath, args, options, options.onLine)
    : runBuffered(executablePath, args, options);
}

/**
 * Streams stdout and stderr line by line while still resolving with the whole
 * output. Only the build uses this; the short commands stay on the buffered
 * path below, which has no partial-line bookkeeping to get wrong.
 */
function runStreaming(
  executablePath: string,
  args: readonly string[],
  options: CommandOptions,
  onLine: (line: string, stream: 'stdout' | 'stderr') => void,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executablePath, [...args], {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    /* Held back until a newline arrives, so a line split across two chunks is
       reported once and whole rather than twice and broken. */
    const pending: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

    const consume = (stream: 'stdout' | 'stderr', chunk: string) => {
      const text = pending[stream] + chunk;
      const lines = text.split(/\r?\n/);
      pending[stream] = lines.pop() ?? '';
      for (const line of lines) onLine(line, stream);
    };

    const flush = () => {
      for (const stream of ['stdout', 'stderr'] as const) {
        if (pending[stream]) {
          onLine(pending[stream], stream);
          pending[stream] = '';
        }
      }
    };

    const settle = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      flush();
      resolve({ stdout, stderr, exitCode });
    };

    const onAbort = () => {
      child.kill();
      settle(1);
    };
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    // spawn has no `timeout` option in the form execFile offers, so the budget
    // is enforced here. The output collected so far is still returned, which is
    // what makes a timed-out build diagnosable rather than silent.
    const timer = setTimeout(() => {
      child.kill();
      settle(1);
    }, options.timeoutMs ?? 120_000);

    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      consume('stdout', chunk);
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      consume('stderr', chunk);
    });

    child.on('error', (error) => {
      stderr += `${stderr ? '\n' : ''}${error.message}`;
      settle(1);
    });
    child.on('close', (code) => settle(code ?? 0));
  });
}

function runBuffered(
  executablePath: string,
  args: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      executablePath,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 120_000,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const commandError = error as (NodeJS.ErrnoException & {
          code?: string | number;
        }) | null;
        const numericCode =
          typeof commandError?.code === 'number'
            ? commandError.code
            : error
              ? 1
              : 0;

        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: numericCode,
        });
      },
    );
  });
}
