/**
 * The Emulator's client half.
 *
 * Sends the generated C to the dev server, which compiles it against real LVGL
 * with emcc, then loads the resulting Emscripten module in the page and hands
 * back a handle the panel can tick and click. See docs/emulator.md.
 */

import type { FontCompileRequest } from '../../codegen/types';

export type EmulatorStatus =
  | 'idle'
  | 'compiling'
  | 'loading'
  | 'running'
  | 'done'
  | 'error';

/** Handle on the running emulator: drive it, read its screen, shut it down. */
export interface EmulatorRuntime {
  tick(ms: number): void;
  mouseEvent(x: number, y: number, pressed: boolean): void;
  keyEvent(key: number, pressed: boolean): void;
  getFramebuffer(): Uint8Array | null;
  getWidth(): number;
  getHeight(): number;
  destroy(): void;
}

export interface EmulatorBuildResult {
  success: boolean;
  output: string;
  runtime: EmulatorRuntime | null;
  width: number;
  height: number;
}

interface BuildResponse {
  success: boolean;
  error?: string;
  buildId: string;
  /**
   * What the build did and what the compiler said, composed by the server.
   *
   * Present on success. It replaced a literal 'Build succeeded' written here,
   * which threw away every warning emcc had produced — see docs/emulator.md §4.5.
   */
  log?: string;
}

/** One entry of the toolchain preflight, mirroring server/emulator/toolchain.ts. */
export interface ToolReport {
  found: boolean;
  path: string | null;
  source: string;
  detail?: string;
}

export interface ToolchainReport {
  ready: boolean;
  bash: ToolReport;
  emscripten: ToolReport;
  lvgl: ToolReport & { pinned: boolean; version: string | null };
  problems: string[];
  remedy: string | null;
  pins: { lvgl: string; emscripten: string };
  /**
   * False until LVGL has been compiled once for this configuration. The panel
   * uses it to warn that the first Start takes minutes rather than seconds,
   * which is the difference between patience and a bug report.
   */
  libraryReady: boolean;
}

/**
 * Ask the dev server what it can build with.
 *
 * Answered before anything is compiled, so a machine without a toolchain says
 * so up front instead of after a build that was never going to start. Returns
 * null when there is no dev server to ask — a static production build has no
 * compile endpoint, and that is not an error worth showing.
 */
export async function fetchToolchain(refresh = false): Promise<ToolchainReport | null> {
  try {
    const resp = await fetch(`/api/emulator/toolchain${refresh ? '?refresh=1' : ''}`);
    if (!resp.ok) return null;
    return (await resp.json()) as ToolchainReport;
  } catch {
    return null;
  }
}

// Emscripten module type
interface EmscriptenModule {
  cwrap: (name: string, returnType: string | null, argTypes: string[]) => (...args: unknown[]) => unknown;
  HEAPU8: Uint8Array;
  _main?: () => number;
}

/**
 * Font data for server-side conversion.
 *
 * Defined in `src/codegen/types.ts` and re-exported here so the firmware deploy
 * path can build the same request — see docs/charset-trimming-design.md §8.
 */
export type { FontCompileRequest };

/**
 * Build the generated C on the server and return a running emulator.
 */
export async function buildAndRun(
  userFiles: Record<string, string>,
  width: number,
  height: number,
  onStatus?: (status: EmulatorStatus, message: string) => void,
  fonts?: FontCompileRequest[],
): Promise<EmulatorBuildResult> {
  const result: EmulatorBuildResult = {
    success: false,
    output: '',
    runtime: null,
    width,
    height,
  };

  try {
    // Step 1: Send code to server for compilation
    onStatus?.('compiling', 'Compiling your screen with LVGL…');

    // Strip "include/" prefix — server expects flat file names
    const files: Record<string, string> = {};
    for (const [name, content] of Object.entries(userFiles)) {
      // userFiles may have both "ui.h" and "include/ui.h" — keep only non-prefixed
      if (!name.startsWith('include/')) {
        files[name] = content;
      }
    }

    const resp = await fetch('/api/emulator/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, fonts: fonts ?? [], width, height }),
    });

    if (!resp.ok) {
      throw new Error(`Server error: ${resp.status} ${resp.statusText}`);
    }

    const data: BuildResponse = await resp.json();

    if (!data.success) {
      result.output = data.error ?? 'Build failed (unknown error)';
      onStatus?.('error', 'Build failed');
      return result;
    }

    // Step 2: Load the Emscripten JS glue
    onStatus?.('loading', 'Starting the emulator…');

    const buildId = data.buildId;
    const runtime = await loadEmscriptenModule(buildId, width, height);

    if (runtime) {
      result.runtime = runtime;
      result.width = runtime.getWidth();
      result.height = runtime.getHeight();
      result.success = true;
      result.output = data.log ?? 'Build succeeded';
      onStatus?.('done', 'Running');
    } else {
      result.output = 'Failed to load Emscripten module';
      onStatus?.('error', 'Module load failed');
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.output = 'Error: ' + msg;
    onStatus?.('error', msg);
    return result;
  }
}

/**
 * Load the Emscripten JS glue via dynamic script injection,
 * initialize the module, and return an EmulatorRuntime.
 */
async function loadEmscriptenModule(
  buildId: string,
  width: number,
  height: number,
): Promise<EmulatorRuntime | null> {
  const jsUrl = `/api/emulator/build/${buildId}/output.js`;
  const wasmUrl = `/api/emulator/build/${buildId}/output.wasm`;

  // Fetch the JS glue as text and evaluate it
  const jsResp = await fetch(jsUrl);
  if (!jsResp.ok) throw new Error('Failed to load output.js');
  const jsCode = await jsResp.text();

  // Evaluate the module factory — Emscripten MODULARIZE creates a global factory.
  // Temporarily hide the global AMD `define` so the Emscripten UMD wrapper
  // doesn't try to register via define(), which causes
  // "Can only have one anonymous define call per script file" errors
  // when Monaco Editor (or another AMD loader) is present on the screen.
  const prevDefine = (globalThis as Record<string, unknown>).define;
  (globalThis as Record<string, unknown>).define = undefined;
  let factory: (opts: Record<string, unknown>) => Promise<EmscriptenModule>;
  try {
    factory = new Function(jsCode + '\nreturn LvglModule;')() as (
      opts: Record<string, unknown>,
    ) => Promise<EmscriptenModule>;
  } finally {
    (globalThis as Record<string, unknown>).define = prevDefine;
  }

  // Initialize the module
  const module = await factory({
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) return wasmUrl;
      return path;
    },
  });

  // Wrap exported functions
  const appTick = module.cwrap('app_tick', null, ['number']) as (ms: number) => void;
  const appMouseEvent = module.cwrap('app_mouse_event', null, ['number', 'number', 'number']) as (
    x: number,
    y: number,
    pressed: number,
  ) => void;
  const appKeyEvent = module.cwrap('app_key_event', null, ['number', 'number']) as (
    key: number,
    pressed: number,
  ) => void;
  const getFb = module.cwrap('wasi_get_framebuffer', 'number', []) as () => number;
  const getFbReady = module.cwrap('wasi_get_fb_ready', 'number', []) as () => number;
  const clearFbReady = module.cwrap('wasi_clear_fb_ready', null, []) as () => void;
  const getWidth = module.cwrap('wasi_get_width', 'number', []) as () => number;
  const getHeight = module.cwrap('wasi_get_height', 'number', []) as () => number;

  const w = getWidth() || width;
  const h = getHeight() || height;
  let destroyed = false;

  return {
    tick(ms: number) {
      if (destroyed) return;
      appTick(ms);
    },

    mouseEvent(x: number, y: number, pressed: boolean) {
      if (destroyed) return;
      appMouseEvent(x, y, pressed ? 1 : 0);
    },

    keyEvent(key: number, pressed: boolean) {
      if (destroyed) return;
      appKeyEvent(key, pressed ? 1 : 0);
    },

    getFramebuffer(): Uint8Array | null {
      if (destroyed) return null;
      const ready = getFbReady();
      if (!ready) return null;
      const fbPtr = getFb();
      if (fbPtr <= 0) return null;
      clearFbReady();
      const fbSize = w * h * 4;
      // Copy from HEAPU8 — the underlying buffer may detach on growth
      return new Uint8Array(module.HEAPU8.buffer.slice(fbPtr, fbPtr + fbSize));
    },

    getWidth() { return w; },
    getHeight() { return h; },

    destroy() {
      destroyed = true;
    },
  };
}
