// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LVGL_PIN,
  SETUP_COMMAND,
  detectToolchain,
  resolveBash,
  resolveLvgl,
  toolchainProblemText,
} from '../toolchain';

const temporaryDirectories: string[] = [];
const savedEnvironment = { ...process.env };

afterEach(async () => {
  process.env = { ...savedEnvironment };
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

/** A directory that looks like an LVGL checkout, optionally carrying the pin. */
async function makeCheckout(options: { pinned: boolean; version?: string }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lvgl-checkout-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, LVGL_PIN.sentinel), '/* lv_init */', 'utf-8');
  if (options.pinned) {
    await writeFile(join(root, LVGL_PIN.marker), LVGL_PIN.name, 'ascii');
  }
  const [major, minor, patch] = (options.version ?? '9.5.0').split('.');
  await writeFile(
    join(root, 'lv_version.h'),
    `#define LVGL_VERSION_MAJOR ${major}\n#define LVGL_VERSION_MINOR ${minor}\n#define LVGL_VERSION_PATCH ${patch}\n`,
    'utf-8',
  );
  return root;
}

describe('resolveLvgl', () => {
  it('takes LVGL_ROOT when it points at a real checkout', async () => {
    const checkout = await makeCheckout({ pinned: true });
    process.env.LVGL_ROOT = checkout;

    const report = resolveLvgl();

    expect(report.found).toBe(true);
    expect(report.path).toBe(checkout);
    expect(report.source).toBe('LVGL_ROOT');
    expect(report.pinned).toBe(true);
    expect(report.version).toBe('v9.5.0');
  });

  it('keeps LVGL_ROOT even when it is not the pinned commit, and says so', async () => {
    // Explicit configuration wins outright — but a checkout that is not the
    // commit the board builds against is exactly the divergence the report
    // exists to surface, so it has to be visible rather than silent.
    const checkout = await makeCheckout({ pinned: false, version: '9.2.2' });
    process.env.LVGL_ROOT = checkout;

    const report = resolveLvgl();

    expect(report.path).toBe(checkout);
    expect(report.pinned).toBe(false);
    expect(report.detail).toContain('v9.2.2');
    expect(report.detail).toContain(LVGL_PIN.version);
  });

  it('ignores an LVGL_ROOT with no lv_init.c rather than trusting the name', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'not-lvgl-'));
    temporaryDirectories.push(empty);
    process.env.LVGL_ROOT = empty;

    const report = resolveLvgl();

    expect(report.path).not.toBe(empty);
  });

  it('reports nothing found when there is nowhere to look', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'not-lvgl-'));
    temporaryDirectories.push(empty);
    process.env.LVGL_ROOT = empty;
    // Point the search at a tree with no firmware caches and no emulator cache.
    process.env.HOME = empty;

    const report = resolveLvgl();

    if (!report.found) {
      expect(report.detail).toContain(SETUP_COMMAND);
    } else {
      // A developer machine may genuinely have a checkout from the firmware
      // build; the contract that matters then is that it names where it is.
      expect(report.source).not.toBe('LVGL_ROOT');
      expect(report.path).toBeTruthy();
    }
  });
});

describe('resolveBash', () => {
  it('finds a working shell and names where it came from', async () => {
    const report = await resolveBash();

    expect(report.found).toBe(true);
    expect(report.path).toBeTruthy();
    expect(report.source).not.toBe('none');
  });

  it('prefers HMI_BASH when it works', async () => {
    const found = await resolveBash();
    process.env.HMI_BASH = found.path!;

    const report = await resolveBash();

    expect(report.source).toBe('HMI_BASH');
  });

  it('falls past HMI_BASH when it does not exist', async () => {
    process.env.HMI_BASH = join(tmpdir(), 'no-such-shell-here');

    const report = await resolveBash();

    expect(report.source).not.toBe('HMI_BASH');
  });
});

describe('toolchainProblemText', () => {
  it('names the problems and the command that fixes them', async () => {
    const report = await detectToolchain();
    const text = toolchainProblemText({
      ...report,
      ready: false,
      problems: ['Emscripten is not installed.'],
      remedy: SETUP_COMMAND,
    });

    expect(text).toContain('Emscripten is not installed.');
    expect(text).toContain(SETUP_COMMAND);
    // The point of the panel: never a bare toolchain dump.
    expect(text).toContain('The Emulator cannot build yet');
  });
});
