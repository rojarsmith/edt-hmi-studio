// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HmiService } from '../service';

const BUILD_ID = '123e4567-e89b-42d3-a456-426614174000';
const BOARD_ID = 'stm32f746g-disco';

describe('getBuildStatus', () => {
  let repoRoot: string;
  let service: HmiService;
  let buildDirectory: string;

  const writeMetadata = async (metadata: Record<string, unknown>) => {
    await writeFile(
      join(buildDirectory, 'build-metadata.json'),
      JSON.stringify(metadata),
      'utf-8',
    );
  };

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'hmi-service-test-'));
    service = new HmiService(repoRoot);
    buildDirectory = join(repoRoot, '.hmi-builds', BUILD_ID);
    await mkdir(buildDirectory, { recursive: true });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('reports a build still in progress without artifacts', async () => {
    await writeMetadata({
      buildId: BUILD_ID,
      boardId: BOARD_ID,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      status: 'building',
    });

    const status = await service.getBuildStatus(BUILD_ID);
    expect(status).toEqual({
      success: true,
      buildId: BUILD_ID,
      boardId: BOARD_ID,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      status: 'building',
    });
  });

  it('lists artifacts once the build has succeeded', async () => {
    await writeMetadata({
      buildId: BUILD_ID,
      boardId: BOARD_ID,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:01:30.000Z',
      status: 'succeeded',
    });
    await writeFile(join(buildDirectory, 'firmware.hex'), ':00000001FF\n');
    await writeFile(join(buildDirectory, 'firmware.map'), 'MEMORY MAP\n');

    const status = await service.getBuildStatus(BUILD_ID);
    expect(status.status).toBe('succeeded');
    expect(status.artifacts).toEqual([
      {
        name: 'firmware.hex',
        size: 12,
        downloadUrl: `/api/hmi/builds/${BUILD_ID}/artifacts/firmware.hex`,
      },
      { name: 'firmware.map', size: 11 },
    ]);
  });

  it('carries the recorded error for a failed build', async () => {
    await writeMetadata({
      buildId: BUILD_ID,
      boardId: BOARD_ID,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:01:30.000Z',
      status: 'failed',
      error: 'Firmware build exited with code 1',
    });

    const status = await service.getBuildStatus(BUILD_ID);
    expect(status.status).toBe('failed');
    expect(status.error).toBe('Firmware build exited with code 1');
    expect(status.artifacts).toBeUndefined();
  });

  it('rejects a malformed build id', async () => {
    await expect(
      service.getBuildStatus('../escape'),
    ).rejects.toThrow('Invalid buildId');
  });

  it('rejects metadata naming a different build', async () => {
    await writeMetadata({
      buildId: '00000000-0000-4000-8000-000000000000',
      boardId: BOARD_ID,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      status: 'succeeded',
    });

    await expect(service.getBuildStatus(BUILD_ID)).rejects.toThrow(
      'Build metadata does not match the requested build',
    );
  });
});
