// @vitest-environment node

import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertBuildId,
  assertSupportedProject,
  getProjectBoardId,
  isPathInside,
  normalizeComPort,
  normalizeProbeSerial,
  resolveBuildDirectory,
  resolveProjectBoardId,
  SUPPORTED_BOARD_IDS,
} from '../validation';
import { SUPPORTED_BOARDS } from '../../../src/types/hmi';

const VALID_BUILD_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('project validation', () => {
  it('accepts the supported top-level boardId', () => {
    const project = { boardId: 'stm32f746g-disco' };
    expect(() => assertSupportedProject(project)).not.toThrow();
    expect(getProjectBoardId(project)).toBe('stm32f746g-disco');
  });

  it('accepts the supported nested board id', () => {
    const project = { board: { id: 'stm32f746g-disco' } };
    expect(() => assertSupportedProject(project)).not.toThrow();
  });

  it('accepts every board the editor offers', () => {
    for (const board of SUPPORTED_BOARDS) {
      expect(() => assertSupportedProject({ boardId: board.id })).not.toThrow();
      expect(resolveProjectBoardId({ boardId: board.id })).toBe(board.id);
    }
    // Guards against the list silently collapsing back to a single board.
    expect(SUPPORTED_BOARD_IDS).toContain('stm32f746g-disco');
    expect(SUPPORTED_BOARD_IDS).toContain('stm32h747i-disco');
    expect(SUPPORTED_BOARD_IDS).toContain('edt-evk043027b');
  });

  it('rejects missing and unsupported board ids', () => {
    expect(() => assertSupportedProject({})).toThrow(/Unsupported boardId/);
    expect(() =>
      assertSupportedProject({ boardId: 'another-board' }),
    ).toThrow(/Unsupported boardId/);
    // The message names what is accepted, so a stale project says why.
    expect(() => resolveProjectBoardId({ boardId: 'another-board' }))
      .toThrow(/stm32f746g-disco/);
  });
});

describe('board catalogue', () => {
  it('gives every self-identifying board a distinct ST-LINK probe pattern', () => {
    // The flash step matches the attached probe's reported board name against
    // this, so an image built for one board cannot land on another.
    const probes = [
      { boardName: '32F746GDISCOVERY', expected: 'stm32f746g-disco' },
      { boardName: 'DISCO-H747XI', expected: 'stm32h747i-disco' },
    ];

    for (const { boardName, expected } of probes) {
      const matching = SUPPORTED_BOARDS.filter(
        (board) =>
          board.probeBoardPattern !== null &&
          new RegExp(board.probeBoardPattern, 'i').test(boardName),
      );
      expect(matching.map((board) => board.id)).toEqual([expected]);
    }
  });

  it('gives a board flashed by a standalone probe a device ID instead', () => {
    // An ST-LINK/V2 on a flying lead reports no board name, so there is nothing
    // to pattern match; the device ID read back on connect is what identifies
    // the target before anything is written.
    for (const board of SUPPORTED_BOARDS) {
      expect(board.deviceId, board.id).toMatch(/^0x[0-9a-f]{3}$/i);
    }
    const generic = SUPPORTED_BOARDS.filter(
      (board) => board.probeBoardPattern === null,
    );
    expect(generic.map((board) => board.id)).toEqual(['edt-evk043027b']);
  });

  it('names an external loader for every board that links images out of flash', () => {
    for (const board of SUPPORTED_BOARDS) {
      if (board.externalFlash === null) {
        continue;
      }
      expect(board.externalFlash.baseAddress, board.id).toMatch(/^0x[0-9a-f]+$/i);
      expect(board.externalFlash.loaderName, board.id).toMatch(/\.stldr$/);
    }
  });

  it('keeps each board template in step with its externalFlash setting', async () => {
    // These two have to agree in both directions, and neither failure is
    // visible at build time. Define HMI_IMAGES_IN_EXTERNAL_FLASH without an
    // `externalFlash` entry and the images are linked into a NOR that nothing
    // ever programs -- the build succeeds and the board draws blank images.
    // Set `externalFlash` without the define and every flash pays for a loader
    // it does not need.
    const { existsSync } = await import('node:fs');
    const { readFile } = await import('node:fs/promises');
    const repoRoot = resolve(__dirname, '..', '..', '..');

    for (const board of SUPPORTED_BOARDS) {
      const cmakeLists = join(repoRoot, 'firmware', board.id, 'CMakeLists.txt');
      if (!existsSync(cmakeLists)) {
        continue;
      }
      const contents = await readFile(cmakeLists, 'utf-8');
      // Ignore the word where it only appears in a comment explaining itself.
      const defined = contents
        .split(/\r?\n/)
        .some(
          (line) =>
            !line.trimStart().startsWith('#') &&
            line.includes('HMI_IMAGES_IN_EXTERNAL_FLASH'),
        );
      expect(defined, `${board.id} CMakeLists.txt`).toBe(
        board.externalFlash !== null,
      );
    }
  });

  it('ships a firmware template for every offered board', async () => {
    const { existsSync } = await import('node:fs');
    const repoRoot = resolve(__dirname, '..', '..', '..');
    for (const board of SUPPORTED_BOARDS) {
      const buildScript = join(
        repoRoot, 'firmware', board.id, 'scripts', 'build.ps1',
      );
      expect(existsSync(buildScript), `missing ${buildScript}`).toBe(true);
    }
  });
});

describe('device identifier validation', () => {
  it('normalizes valid COM ports and probe serials', () => {
    expect(normalizeComPort(' com5 ')).toBe('COM5');
    expect(normalizeProbeSerial(' 066eff535651727067065821 ')).toBe(
      '066EFF535651727067065821',
    );
  });

  it('rejects path-like COM ports and argument-like probe serials', () => {
    expect(() => normalizeComPort('\\\\.\\COM5')).toThrow(/Invalid COM port/);
    expect(() => normalizeComPort('../COM5')).toThrow(/Invalid COM port/);
    expect(() => normalizeProbeSerial('-c port=SWD')).toThrow(
      /Invalid probeSerial/,
    );
  });
});

describe('build path validation', () => {
  const buildRoot = resolve('test-build-root');

  it('accepts UUID v4 build ids and resolves them below the build root', () => {
    expect(() => assertBuildId(VALID_BUILD_ID)).not.toThrow();
    const buildDirectory = resolveBuildDirectory(
      buildRoot,
      VALID_BUILD_ID,
    );
    expect(buildDirectory).toBe(join(buildRoot, VALID_BUILD_ID));
    expect(isPathInside(buildRoot, buildDirectory)).toBe(true);
  });

  it('rejects traversal, absolute paths, and non-v4 identifiers', () => {
    for (const invalid of [
      '..',
      '../firmware',
      'C:\\Windows',
      '/tmp/build',
      '123e4567-e89b-12d3-a456-426614174000',
    ]) {
      expect(() => resolveBuildDirectory(buildRoot, invalid)).toThrow(
        /Invalid buildId/,
      );
    }
  });

  it('detects sibling paths outside the root', () => {
    expect(
      isPathInside(buildRoot, resolve(buildRoot, '..', 'other-build')),
    ).toBe(false);
  });
});
