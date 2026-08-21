// Where the Emulator's toolchain actually is, on this machine.
//
// It used to be three absolute paths inside one contributor's Linux home
// directory, used as the default for everyone — so the rung that the product
// depends on most reported "toolchain unavailable" on every other checkout.
// See docs/emulator.md §3.1.
//
// The rule here: never assume a location, search an ordered list of candidates
// and confirm each one with a sentinel file. Report which candidate answered,
// so a surprising build is traceable to the copy that ran it rather than to
// folklore.

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * LVGL, pinned to the commit the firmware builds against.
 *
 * The same pin on both sides is the point: docs/preview-ladder.md §5 names
 * "two rungs compiling different LVGL" as the one real hazard in the overlap
 * between the Emulator and Deploy, and sharing the checkout closes it by
 * construction rather than by discipline. The marker file is the one
 * firmware/<board>/scripts/bootstrap-deps.ps1 writes after extracting.
 */
export const LVGL_PIN = {
  version: 'v9.5.0',
  commit: '85aa60d18b3d5e5588d7b247abf90198f07c8a63',
  name: 'lvgl-85aa60d',
  marker: '.hmi-version-lvgl-85aa60d',
  /** Present in every LVGL checkout, absent from a half-extracted one. */
  sentinel: join('src', 'lv_init.c'),
} as const;

/** Emscripten, pinned so a build log from one machine explains one from another. */
export const EMSCRIPTEN_PIN = '6.0.8';

/** The command that installs whatever is missing. Quoted verbatim in the UI. */
export const SETUP_COMMAND = 'npm run emulator:setup';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
/** server/emulator/ → repo root. */
export const REPO_ROOT = resolve(MODULE_DIR, '..', '..');
/** Everything this feature installs lives here, and .gitignore already covers it. */
export const EMULATOR_CACHE = join(REPO_ROOT, '.hmi-cache', 'emulator');

export interface ToolReport {
  found: boolean;
  path: string | null;
  /** Which candidate answered — the UI shows it so the choice is never a mystery. */
  source: string;
  detail?: string;
}

export interface EmscriptenReport extends ToolReport {
  /**
   * Environment the compile commands need in order to find emcc.
   *
   * Deliberately not "source emsdk_env.sh": on Windows that script shells out
   * to `python3`, which under MSYS hits the Microsoft Store's placeholder and
   * exports nothing at all, leaving emcc unfindable on a machine where it is
   * installed and working. Setting the variables directly works on every
   * platform. See docs/emulator.md §3.3.
   */
  env: Record<string, string>;
}

export interface LvglReport extends ToolReport {
  /** True when this checkout is the commit the firmware pins. */
  pinned: boolean;
  version: string | null;
}

export interface ToolchainReport {
  ready: boolean;
  bash: ToolReport;
  emscripten: EmscriptenReport;
  lvgl: LvglReport;
  /** One line per problem, in the product's words rather than the toolchain's. */
  problems: string[];
  /** The command that fixes them, or null when nothing is missing. */
  remedy: string | null;
  pins: { lvgl: string; emscripten: string };
}

function run(
  file: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string }> {
  return new Promise((res) => {
    execFile(
      file,
      args,
      { env: env ?? process.env, timeout: 20_000, windowsHide: true },
      (err, stdout) => {
        res({ code: err ? 1 : 0, stdout: stdout ?? '' });
      },
    );
  });
}

// ---------------------------------------------------------------- bash

function windowsBashCandidates(): { path: string; source: string }[] {
  const candidates: { path: string; source: string }[] = [];

  // git is not optional — the repository was cloned with it — and Git for
  // Windows keeps bash.exe one directory across from git.exe. That makes the
  // shell we want findable from the tool we know is installed.
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    if (!existsSync(join(dir, 'git.exe'))) continue;
    candidates.push({ path: resolve(dir, '..', 'bin', 'bash.exe'), source: 'beside git' });
  }

  for (const base of [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'),
  ]) {
    if (!base) continue;
    candidates.push({ path: join(base, 'Git', 'bin', 'bash.exe'), source: 'Git for Windows' });
  }

  return candidates;
}

/**
 * On Windows the Git Bash candidates are tried *before* whatever PATH offers.
 *
 * That inversion is deliberate and it is not tidiness. The compile commands
 * reach emcc through a PATH this process injects, and only an MSYS shell
 * rewrites an inherited Windows PATH into a form its own command lookup can
 * use. A non-MSYS bash — on the machine this was diagnosed on, PATH answered
 * with one that arrived inside STM32CubeCLT — starts fine and then cannot find
 * a compiler that is right there. Everywhere else PATH is the system shell and
 * goes first.
 */
export async function resolveBash(): Promise<ToolReport> {
  const candidates: { path: string; source: string }[] = [];
  if (process.env.HMI_BASH) {
    candidates.push({ path: process.env.HMI_BASH, source: 'HMI_BASH' });
  }
  if (process.platform === 'win32') {
    candidates.push(...windowsBashCandidates());
    candidates.push({ path: 'bash', source: 'PATH' });
  } else {
    candidates.push({ path: 'bash', source: 'PATH' });
    candidates.push({ path: '/bin/bash', source: '/bin/bash' });
    candidates.push({ path: '/usr/bin/bash', source: '/usr/bin/bash' });
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    if (candidate.path !== 'bash' && !existsSync(candidate.path)) continue;
    // Existing is not the same as working; ask it to run something.
    if ((await run(candidate.path, ['-c', 'exit 0'])).code !== 0) continue;
    return { found: true, path: candidate.path, source: candidate.source };
  }

  return {
    found: false,
    path: null,
    source: 'none',
    detail:
      process.platform === 'win32'
        ? 'Install Git for Windows — the Emulator compiles through a POSIX shell, and Git ships one.'
        : 'Install bash — the Emulator compiles through a POSIX shell.',
  };
}

// ---------------------------------------------------------- emscripten

/** The launcher name emsdk installs, which differs by platform. */
function emccNames(): string[] {
  return process.platform === 'win32' ? ['emcc.exe', 'emcc.bat', 'emcc'] : ['emcc'];
}

function emccInside(emsdkRoot: string): string | null {
  const dir = join(emsdkRoot, 'upstream', 'emscripten');
  for (const name of emccNames()) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Read the tool paths `emsdk activate` recorded, so the compile can be handed
 * an interpreter rather than left to guess one from PATH.
 *
 * The file is Python-ish assignments with $CFGDIR standing in for the emsdk
 * root; only the two entries the launchers consult are needed here.
 */
function emsdkToolEnv(emsdkRoot: string): Record<string, string> {
  const config = join(emsdkRoot, '.emscripten');
  const env: Record<string, string> = {};
  if (!existsSync(config)) return env;

  let text: string;
  try {
    text = readFileSync(config, 'utf-8');
  } catch {
    return env;
  }

  for (const [key, variable] of [
    ['PYTHON', 'EMSDK_PYTHON'],
    ['NODE_JS', 'EMSDK_NODE'],
  ] as const) {
    const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*['"](.+?)['"]`, 'm'));
    if (!match) continue;
    const value = match[1].replace('$CFGDIR', emsdkRoot).replace('${CFGDIR}', emsdkRoot);
    if (existsSync(value)) env[variable] = value;
  }

  env.EM_CONFIG = config;
  return env;
}

function emsdkEnv(emsdkRoot: string): Record<string, string> {
  const emscriptenDir = join(emsdkRoot, 'upstream', 'emscripten');
  return {
    EMSDK: emsdkRoot,
    ...emsdkToolEnv(emsdkRoot),
    PATH: `${emscriptenDir}${delimiter}${process.env.PATH ?? ''}`,
  };
}

/**
 * Candidate order: explicit configuration, then the copy this repository
 * installed, then the machine's own.
 *
 * The pinned copy outranks PATH on purpose. A pin exists to make two build
 * logs comparable, and an ambient emcc quietly outranking the version the
 * project installed is the class of difference that only ever surfaces in
 * somebody else's failure. Whichever copy wins is named in the report.
 */
export async function resolveEmscripten(): Promise<EmscriptenReport> {
  const roots: { path: string; source: string }[] = [];

  // EMSDK_ENV is the variable the old hardcoded default used, and it points at
  // emsdk_env.sh rather than at the SDK. Honoured so nobody's existing setup
  // breaks; the directory holding it is what we actually want.
  if (process.env.EMSDK_ENV) {
    roots.push({ path: dirname(process.env.EMSDK_ENV), source: 'EMSDK_ENV' });
  }
  roots.push({ path: join(EMULATOR_CACHE, 'emsdk'), source: `${SETUP_COMMAND} (pinned)` });
  if (process.env.EMSDK) {
    roots.push({ path: process.env.EMSDK, source: 'EMSDK' });
  }
  roots.push({ path: join(homedir(), 'emsdk'), source: '~/emsdk' });
  if (process.platform === 'win32') {
    roots.push({ path: 'C:\\emsdk', source: 'C:\\emsdk' });
  } else {
    roots.push({ path: '/opt/emsdk', source: '/opt/emsdk' });
    roots.push({ path: '/usr/lib/emsdk', source: '/usr/lib/emsdk' });
  }

  let installedButNotActivated: string | null = null;

  for (const root of roots) {
    const emcc = emccInside(root.path);
    if (!emcc) {
      // An emsdk that was cloned but never installed is worth naming
      // separately: the fix is one command, not a download.
      if (!installedButNotActivated && existsSync(join(root.path, 'emsdk_env.sh'))) {
        installedButNotActivated = root.path;
      }
      continue;
    }
    return { found: true, path: emcc, source: root.source, env: emsdkEnv(root.path) };
  }

  // Last: an emcc the machine already puts on PATH, used as-is with no extra
  // environment. Common on Linux and in CI images.
  if ((await run('emcc', ['--version'])).code === 0) {
    return { found: true, path: 'emcc', source: 'PATH', env: {} };
  }

  return {
    found: false,
    path: null,
    source: 'none',
    env: {},
    detail: installedButNotActivated
      ? `Emscripten is downloaded at ${installedButNotActivated} but not installed. Run ${SETUP_COMMAND}.`
      : `Emscripten ${EMSCRIPTEN_PIN} is not installed. Run ${SETUP_COMMAND}.`,
  };
}

// ---------------------------------------------------------------- LVGL

function lvglVersion(root: string): string | null {
  try {
    const header = readFileSync(join(root, 'lv_version.h'), 'utf-8');
    const part = (name: string) =>
      header.match(new RegExp(`#define\\s+LVGL_VERSION_${name}\\s+(\\d+)`))?.[1];
    const major = part('MAJOR');
    const minor = part('MINOR');
    const patch = part('PATCH');
    return major && minor && patch ? `v${major}.${minor}.${patch}` : null;
  } catch {
    return null;
  }
}

/** Every board cache that already holds an LVGL checkout, in directory order. */
function firmwareLvglCheckouts(): { path: string; source: string }[] {
  const firmware = join(REPO_ROOT, 'firmware');
  let boards: string[];
  try {
    boards = readdirSync(firmware, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  return boards.map((board) => ({
    path: join(firmware, board, '.hmi-cache', 'Middlewares', 'Third_Party', 'lvgl'),
    source: `firmware/${board} cache`,
  }));
}

/**
 * The checkout the firmware bootstrap already placed is preferred over
 * downloading a second one: it is the same commit, it is already on the disk,
 * and using it is what makes the two rungs agree about LVGL.
 */
export function resolveLvgl(): LvglReport {
  const usable = (candidates: { path: string; source: string }[]) =>
    candidates.filter((candidate) => existsSync(join(candidate.path, LVGL_PIN.sentinel)));

  // Explicit configuration wins outright, even over a pinned checkout sitting
  // next to it: someone who set LVGL_ROOT meant that one.
  const explicit = process.env.LVGL_ROOT
    ? usable([{ path: process.env.LVGL_ROOT, source: 'LVGL_ROOT' }])[0]
    : undefined;

  const discovered = usable([
    { path: join(EMULATOR_CACHE, 'lvgl'), source: `${SETUP_COMMAND} (pinned)` },
    ...firmwareLvglCheckouts(),
  ]);

  // Among the rest, a checkout at the pin beats one that merely exists.
  const chosen =
    explicit ??
    discovered.find((candidate) => existsSync(join(candidate.path, LVGL_PIN.marker))) ??
    discovered[0];

  if (!chosen) {
    return {
      found: false,
      path: null,
      source: 'none',
      pinned: false,
      version: null,
      detail: `LVGL ${LVGL_PIN.version} is not on this machine. Run ${SETUP_COMMAND}.`,
    };
  }

  const pinned = existsSync(join(chosen.path, LVGL_PIN.marker));
  const version = lvglVersion(chosen.path);
  return {
    found: true,
    path: chosen.path,
    source: chosen.source,
    pinned,
    version,
    detail: pinned
      ? undefined
      : `This checkout is ${version ?? 'an unknown version'}, not the pinned ${LVGL_PIN.version}. The Emulator and the board may disagree.`,
  };
}

// -------------------------------------------------------------- report

export async function detectToolchain(): Promise<ToolchainReport> {
  const [bash, emscripten] = await Promise.all([resolveBash(), resolveEmscripten()]);
  const lvgl = resolveLvgl();

  const problems: string[] = [];
  if (!bash.found) problems.push(bash.detail ?? 'No POSIX shell found.');
  if (!emscripten.found) problems.push(emscripten.detail ?? 'Emscripten not found.');
  if (!lvgl.found) problems.push(lvgl.detail ?? 'LVGL not found.');

  const ready = bash.found && emscripten.found && lvgl.found;
  const fixableBySetup = !emscripten.found || !lvgl.found;

  return {
    ready,
    bash,
    emscripten,
    lvgl,
    problems,
    remedy: ready ? null : fixableBySetup ? SETUP_COMMAND : null,
    pins: { lvgl: LVGL_PIN.version, emscripten: EMSCRIPTEN_PIN },
  };
}

let cached: Promise<ToolchainReport> | null = null;

/**
 * Detected once and kept for the dev server's lifetime, because the answer only
 * changes when someone installs something — at which point they can ask for it
 * again from the Emulator tab rather than restart the server.
 */
export function getToolchain(): Promise<ToolchainReport> {
  cached ??= detectToolchain();
  return cached;
}

export function refreshToolchain(): Promise<ToolchainReport> {
  cached = detectToolchain();
  return cached;
}

/** What went wrong, phrased for someone who did not write the compile command. */
export function toolchainProblemText(report: ToolchainReport): string {
  const lines = ['The Emulator cannot build yet:', ...report.problems.map((p) => `- ${p}`)];
  if (report.remedy) {
    lines.push('', `Run this once, then press Start again:`, `    ${report.remedy}`);
  }
  return lines.join('\n');
}
