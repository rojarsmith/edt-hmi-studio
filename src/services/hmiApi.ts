import type { ProjectFile } from '../resources/types';

export interface HmiCapabilities {
  success: boolean;
  available?: boolean;
  programmerAvailable?: boolean;
  localBridge?: boolean;
  canBuild?: boolean;
  canFlash?: boolean;
  programmerPath?: string;
  programmerVersion?: string;
  error?: string;
  [key: string]: unknown;
}

export interface HmiSerialPort {
  path: string;
  displayName: string;
  boardName?: string;
  probeSerial?: string;
}

export interface HmiOperationResult {
  success: boolean;
  log: string[];
  error?: string;
}

export interface HmiPortsResult extends HmiOperationResult {
  ports: HmiSerialPort[];
}

export interface HmiBuildResult extends HmiOperationResult {
  buildId?: string;
  status?: string;
  artifact?: {
    name?: string;
    size?: number;
    downloadUrl?: string;
  };
  artifacts?: {
    name?: string;
    size?: number;
    downloadUrl?: string;
  }[];
}

type JsonRecord = Record<string, unknown>;

function normalizeLog(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/\r?\n/).filter(Boolean);
  }
  return [];
}

function normalizeOperationResult(data: JsonRecord): HmiOperationResult {
  return {
    success: data.success !== false,
    log: normalizeLog(data.log),
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const text = await response.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: text };
    }
  }

  if (!response.ok) {
    const error = (
      typeof data === 'object'
      && data !== null
      && typeof (data as JsonRecord).error === 'string'
    )
      ? String((data as JsonRecord).error)
      : `${response.status} ${response.statusText}`;
    throw new Error(error);
  }

  return data;
}

function postJson(path: string, body: unknown): Promise<unknown> {
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getHmiCapabilities(): Promise<HmiCapabilities> {
  const raw = await requestJson('/api/hmi/capabilities');
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as JsonRecord;
  return {
    ...data,
    success: data.success !== false,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

export async function listHmiPorts(): Promise<HmiPortsResult> {
  const raw = await requestJson('/api/hmi/ports');
  const data = (
    Array.isArray(raw)
      ? { success: true, ports: raw }
      : (typeof raw === 'object' && raw !== null ? raw : {})
  ) as JsonRecord;
  const rawPorts = Array.isArray(data.ports) ? data.ports : [];
  const ports = rawPorts
    .map((item): HmiSerialPort | null => {
      if (typeof item === 'string') {
        return { path: item, displayName: item };
      }
      if (typeof item !== 'object' || item === null) return null;
      const port = item as JsonRecord;
      const path = typeof port.path === 'string'
        ? port.path
        : typeof port.port === 'string'
          ? port.port
          : '';
      if (!path) return null;
      return {
        path,
        displayName: typeof port.displayName === 'string'
          ? port.displayName
          : typeof port.name === 'string'
            ? port.name
            : path,
        boardName: typeof port.boardName === 'string' ? port.boardName : undefined,
        probeSerial: typeof port.probeSerial === 'string' ? port.probeSerial : undefined,
      };
    })
    .filter((port): port is HmiSerialPort => port !== null);

  return {
    ...normalizeOperationResult(data),
    ports,
  };
}

export async function testHmiPort(port: string): Promise<HmiOperationResult> {
  const raw = await postJson('/api/hmi/test-port', { port });
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as JsonRecord;
  return normalizeOperationResult(data);
}

export async function buildHmiProject(project: ProjectFile): Promise<HmiBuildResult> {
  const raw = await postJson('/api/hmi/build', { project });
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as JsonRecord;
  const artifact = (
    typeof data.artifact === 'object' && data.artifact !== null
      ? data.artifact
      : undefined
  ) as JsonRecord | undefined;
  const rawArtifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
  const artifacts = rawArtifacts
    .filter((item): item is JsonRecord => typeof item === 'object' && item !== null)
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name : undefined,
      size: typeof item.size === 'number' ? item.size : undefined,
      downloadUrl: typeof item.downloadUrl === 'string' ? item.downloadUrl : undefined,
    }));
  const preferredArtifact = artifacts.find((item) => item.downloadUrl) ?? artifacts[0];

  return {
    ...normalizeOperationResult(data),
    buildId: typeof data.buildId === 'string' ? data.buildId : undefined,
    status: typeof data.status === 'string' ? data.status : undefined,
    artifact: artifact
      ? {
          name: typeof artifact.name === 'string' ? artifact.name : undefined,
          size: typeof artifact.size === 'number' ? artifact.size : undefined,
          downloadUrl: typeof artifact.downloadUrl === 'string'
            ? artifact.downloadUrl
            : undefined,
        }
      : preferredArtifact,
    artifacts,
  };
}

export async function flashHmiBuild(
  buildId: string,
  probeSerial?: string,
): Promise<HmiOperationResult> {
  const raw = await postJson('/api/hmi/flash', {
    buildId,
    ...(probeSerial ? { probeSerial } : {}),
  });
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as JsonRecord;
  return normalizeOperationResult(data);
}
