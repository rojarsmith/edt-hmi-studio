import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../resources/types';
import {
  buildHmiProject,
  flashHmiBuild,
  listHmiPorts,
  testHmiPort,
} from '../hmiApi';

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
  } as Response;
}

const project = {
  version: '1.0.0',
  name: 'HMI',
  createdAt: 1,
  updatedAt: 1,
  canvasSize: { width: 480, height: 272 },
  screens: [],
  resources: { images: [], fonts: [] },
  variables: [],
  codeGenOptions: {
    outputFormat: 'single-file',
    includeComments: true,
    useStaticAllocation: true,
    prefix: 'ui',
    indentSize: 4,
    indentStyle: 'spaces',
  },
  boardId: 'stm32f746g-disco',
} satisfies ProjectFile;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HMI local bridge API payloads', () => {
  it('sends the exported project and resolves the downloadable firmware artifact', async () => {
    const fetchMock = vi.fn(async (
      _url: string | URL | Request,
      _init?: RequestInit,
    ) => response({
      success: true,
      buildId: 'a9eb8387-7e02-41f6-a874-dca19c2afc8b',
      log: ['compiled'],
      artifacts: [
        { name: 'firmware.map', size: 100 },
        {
          name: 'firmware.hex',
          size: 200,
          downloadUrl:
            '/api/hmi/builds/a9eb8387-7e02-41f6-a874-dca19c2afc8b/artifacts/firmware.hex',
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await buildHmiProject(project);
    const [, init] = fetchMock.mock.calls[0];

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/hmi/build',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(init?.body))).toEqual({ project });
    expect(result.artifact).toMatchObject({
      name: 'firmware.hex',
      downloadUrl:
        '/api/hmi/builds/a9eb8387-7e02-41f6-a874-dca19c2afc8b/artifacts/firmware.hex',
    });
  });

  it('uses the selected COM port for testing and the probe serial for flashing', async () => {
    const fetchMock = vi.fn(async (
      url: string | URL | Request,
      _init?: RequestInit,
    ) => {
      if (String(url).endsWith('/ports')) {
        return response({
          success: true,
          ports: [{
            path: 'COM5',
            displayName: 'STM32 STLink',
            boardName: '32F746GDISCOVERY',
            probeSerial: '066EFF535651727067065821',
          }],
        });
      }
      return response({ success: true, log: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const ports = await listHmiPorts();
    await testHmiPort('COM5');
    await flashHmiBuild(
      'a9eb8387-7e02-41f6-a874-dca19c2afc8b',
      ports.ports[0].probeSerial,
    );

    expect(ports.ports[0]).toMatchObject({
      path: 'COM5',
      probeSerial: '066EFF535651727067065821',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      port: 'COM5',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      buildId: 'a9eb8387-7e02-41f6-a874-dca19c2afc8b',
      probeSerial: '066EFF535651727067065821',
    });
  });
});
