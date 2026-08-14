import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { pipeline } from 'node:stream/promises';
import type {
  Connect,
  Plugin,
  PreviewServer,
  ViteDevServer,
} from 'vite';
import { HmiService } from './server/hmi/service';
import { isRecord } from './server/hmi/validation';

const JSON_BODY_LIMIT = 64 * 1024 * 1024;

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  // A build outlives most sockets; when the client has already given up,
  // writing would only raise 'error' on a destroyed stream.
  if (response.destroyed || response.writableEnded) {
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);
    totalLength += buffer.length;
    if (totalLength > JSON_BODY_LIMIT) {
      throw new HttpError(413, 'Request body is too large');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new HttpError(400, 'JSON request body is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.concat(chunks).toString('utf-8'),
    ) as unknown;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new HttpError(400, 'JSON request body must be an object');
  }
  return parsed;
}

function assertLocalOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    throw new HttpError(403, 'Invalid request origin');
  }
  if (
    hostname !== '127.0.0.1' &&
    hostname !== 'localhost' &&
    hostname !== '::1'
  ) {
    throw new HttpError(403, 'HMI bridge only accepts loopback origins');
  }
}

function methodNotAllowed(
  response: ServerResponse,
  allowedMethod: 'GET' | 'POST',
): void {
  response.setHeader('Allow', allowedMethod);
  sendJson(response, 405, {
    success: false,
    error: 'Method Not Allowed',
  });
}

function createHmiMiddleware(
  service: HmiService,
): Connect.NextHandleFunction {
  return async (request, response, next) => {
    let path: string;
    try {
      path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    } catch {
      sendJson(response, 400, {
        success: false,
        error: 'Invalid request URL',
      });
      return;
    }
    if (!path.startsWith('/api/hmi/')) {
      next();
      return;
    }

    // A client that gives up mid-build tears the socket down while the
    // handler is still awaiting; the next write then emits 'error' on these
    // streams, and without a listener that is an uncaught exception that
    // takes the whole dev server with it.
    request.on('error', () => {});
    response.on('error', () => {});

    try {
      assertLocalOrigin(request);

      if (path === '/api/hmi/capabilities') {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET');
          return;
        }
        sendJson(response, 200, service.getCapabilities());
        return;
      }

      if (path === '/api/hmi/ports') {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET');
          return;
        }
        const ports = await service.listPorts();
        sendJson(response, 200, { success: true, ports });
        return;
      }

      if (path === '/api/hmi/test-port') {
        if (request.method !== 'POST') {
          methodNotAllowed(response, 'POST');
          return;
        }
        const body = await readJsonBody(request);
        const result = await service.testPort(body.port);
        sendJson(response, 200, result);
        return;
      }

      if (path === '/api/hmi/build') {
        if (request.method !== 'POST') {
          methodNotAllowed(response, 'POST');
          return;
        }
        const body = await readJsonBody(request);
        if (!Object.hasOwn(body, 'project')) {
          throw new HttpError(400, 'project is required');
        }
        const result = await service.buildProject(body.project);
        sendJson(response, 200, result);
        return;
      }

      if (path === '/api/hmi/flash') {
        if (request.method !== 'POST') {
          methodNotAllowed(response, 'POST');
          return;
        }
        const body = await readJsonBody(request);
        const result = await service.flashBuild(
          body.buildId,
          body.probeSerial,
        );
        sendJson(response, 200, result);
        return;
      }

      const statusMatch = path.match(/^\/api\/hmi\/builds\/([^/]+)$/);
      if (statusMatch) {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET');
          return;
        }
        sendJson(response, 200, await service.getBuildStatus(statusMatch[1]));
        return;
      }

      const layoutMatch = path.match(
        /^\/api\/hmi\/builds\/([^/]+)\/image-layout$/,
      );
      if (layoutMatch) {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET');
          return;
        }
        sendJson(response, 200, await service.getImageLayout(layoutMatch[1]));
        return;
      }

      const artifactMatch = path.match(
        /^\/api\/hmi\/builds\/([^/]+)\/artifacts\/([^/]+)$/,
      );
      if (artifactMatch) {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET');
          return;
        }
        const artifact = await service.resolveArtifactDownload(
          artifactMatch[1],
          artifactMatch[2],
        );
        response.statusCode = 200;
        response.setHeader('Content-Type', artifact.contentType);
        response.setHeader('Content-Length', String(artifact.size));
        response.setHeader(
          'Content-Disposition',
          `attachment; filename="${artifact.name}"`,
        );
        response.setHeader('Cache-Control', 'no-store');
        await pipeline(
          createReadStream(artifact.path),
          response,
        );
        return;
      }

      next();
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const statusCode =
        error instanceof HttpError ? error.statusCode : 400;
      const message =
        error instanceof Error ? error.message : String(error);
      sendJson(response, statusCode, {
        success: false,
        error: message,
      });
    }
  };
}

function installHmiMiddleware(
  server: ViteDevServer | PreviewServer,
): void {
  const service = new HmiService(server.config.root);
  server.middlewares.use(createHmiMiddleware(service));
}

export default function hmiPlugin(): Plugin {
  return {
    name: 'lvgl-hmi-local-bridge',
    config() {
      return {
        server: {
          watch: {
            // Firmware builds churn thousands of short-lived toolchain files
            // in these trees. Watched, every build backs the watcher up for
            // minutes, and chokidar racing the archiver for a temp file dies
            // on EBUSY — an unhandled 'error' that kills the dev server.
            ignored: ['**/.hmi-builds/**', '**/.hmi-cache/**'],
          },
        },
      };
    },
    configureServer(server) {
      installHmiMiddleware(server);
    },
    configurePreviewServer(server) {
      installHmiMiddleware(server);
    },
  };
}
