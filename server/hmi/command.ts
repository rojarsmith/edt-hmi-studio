import { execFile } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export function runExecutable(
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
