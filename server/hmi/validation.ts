import { isAbsolute, relative, resolve } from 'node:path';

export const SUPPORTED_BOARD_ID = 'stm32f746g-disco';

const BUILD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COM_PORT_PATTERN = /^COM[1-9]\d{0,3}$/i;
const PROBE_SERIAL_PATTERN = /^[a-z0-9]{8,64}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getProjectBoardId(project: unknown): string | null {
  if (!isRecord(project)) {
    return null;
  }

  if (typeof project.boardId === 'string') {
    return project.boardId;
  }

  if (isRecord(project.board) && typeof project.board.id === 'string') {
    return project.board.id;
  }

  return null;
}

export function assertSupportedProject(project: unknown): asserts project is Record<string, unknown> {
  if (!isRecord(project)) {
    throw new Error('project must be an object');
  }

  const boardId = getProjectBoardId(project);
  if (boardId !== SUPPORTED_BOARD_ID) {
    throw new Error(`Unsupported boardId. Expected "${SUPPORTED_BOARD_ID}".`);
  }
}

export function assertBuildId(buildId: unknown): asserts buildId is string {
  if (typeof buildId !== 'string' || !BUILD_ID_PATTERN.test(buildId)) {
    throw new Error('Invalid buildId');
  }
}

export function normalizeComPort(port: unknown): string {
  if (typeof port !== 'string') {
    throw new Error('port must be a string');
  }

  const normalized = port.trim().toUpperCase();
  if (!COM_PORT_PATTERN.test(normalized)) {
    throw new Error('Invalid COM port');
  }
  return normalized;
}

export function normalizeProbeSerial(probeSerial: unknown): string | undefined {
  if (probeSerial === undefined || probeSerial === null || probeSerial === '') {
    return undefined;
  }
  if (typeof probeSerial !== 'string') {
    throw new Error('probeSerial must be a string');
  }

  const normalized = probeSerial.trim().toUpperCase();
  if (!PROBE_SERIAL_PATTERN.test(normalized)) {
    throw new Error('Invalid probeSerial');
  }
  return normalized;
}

export function isPathInside(rootPath: string, candidatePath: string): boolean {
  const root = resolve(rootPath);
  const candidate = resolve(candidatePath);
  const relativePath = relative(root, candidate);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

export function resolveBuildDirectory(buildRoot: string, buildId: unknown): string {
  assertBuildId(buildId);
  const buildDirectory = resolve(buildRoot, buildId);
  if (!isPathInside(buildRoot, buildDirectory)) {
    throw new Error('Build directory escapes the configured build root');
  }
  return buildDirectory;
}
