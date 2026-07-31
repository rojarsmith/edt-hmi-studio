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
} from '../validation';

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

  it('rejects missing and unsupported board ids', () => {
    expect(() => assertSupportedProject({})).toThrow(/Unsupported boardId/);
    expect(() =>
      assertSupportedProject({ boardId: 'another-board' }),
    ).toThrow(/Unsupported boardId/);
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
