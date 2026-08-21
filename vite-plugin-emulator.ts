/**
 * Vite plugin: the Emulator's dev-server half.
 *
 * GET  /api/emulator/toolchain           → what is installed, what is missing, and the fix
 * POST /api/emulator/build               → compile the generated C, return { success, error?, buildId }
 * GET  /api/emulator/build/:id/output.js   → Emscripten JS glue
 * GET  /api/emulator/build/:id/output.wasm → compiled WASM binary
 *
 * Formerly vite-plugin-compile.ts, serving "Build & Run". The rename and the
 * reasons for it are in docs/emulator.md; the toolchain search that replaced
 * three hardcoded absolute paths lives in server/emulator/toolchain.ts.
 */

import type { Plugin } from 'vite';
import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { convertFonts } from './server/fontConv';
import {
  getToolchain,
  refreshToolchain,
  toolchainProblemText,
  type ToolchainReport,
} from './server/emulator/toolchain';
import { ensureLvglLibrary, lvglLibraryReady } from './server/emulator/lvglLib';

// Font data sent from the client for server-side conversion
interface FontRequest {
  data: string;       // base64 data URI (data:font/ttf;base64,...)
  cFontName: string;  // e.g. "ui_font_noto"
  ranges: string;     // pre-computed range args, e.g. "0x20-0x7e"
  variants: FontVariantRequest[];  // one per size; glyphs differ between them
  bpp: number;        // 1 | 2 | 4 | 8
}

interface FontVariantRequest {
  size: number;
  symbols?: string;   // literal characters this size uses, e.g. "中文"
}

// Build cache: buildId → directory path
const builds = new Map<string, string>();

// Cleanup old builds after 10 minutes
const BUILD_TTL_MS = 10 * 60 * 1000;

function generateMainWrapper(width: number, height: number): string {
  return `#include "lvgl/lvgl.h"
#include <string.h>
#include <emscripten.h>

#define MAX_FB_WIDTH  800
#define MAX_FB_HEIGHT 600

static uint32_t framebuffer[MAX_FB_WIDTH * MAX_FB_HEIGHT];
static volatile int fb_ready = 0;
static int disp_width, disp_height;
static uint8_t draw_buf[MAX_FB_WIDTH * MAX_FB_HEIGHT * 4];

EMSCRIPTEN_KEEPALIVE uint32_t* wasi_get_framebuffer(void) { return framebuffer; }
EMSCRIPTEN_KEEPALIVE int wasi_get_fb_ready(void) { return fb_ready; }
EMSCRIPTEN_KEEPALIVE void wasi_clear_fb_ready(void) { fb_ready = 0; }
EMSCRIPTEN_KEEPALIVE int wasi_get_width(void) { return disp_width; }
EMSCRIPTEN_KEEPALIVE int wasi_get_height(void) { return disp_height; }

static void flush_cb(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map) {
    int32_t w = area->x2 - area->x1 + 1;
    int32_t h = area->y2 - area->y1 + 1;
    uint32_t *src = (uint32_t *)px_map;
    for (int32_t y = 0; y < h; y++) {
        int32_t dst_y = area->y1 + y;
        if (dst_y < 0 || dst_y >= disp_height) continue;
        for (int32_t x = 0; x < w; x++) {
            int32_t dst_x = area->x1 + x;
            if (dst_x < 0 || dst_x >= disp_width) continue;
            framebuffer[dst_y * disp_width + dst_x] = src[y * w + x];
        }
    }
    fb_ready = 1;
    lv_display_flush_ready(disp);
}

static lv_indev_data_t mouse_data;
static void mouse_read_cb(lv_indev_t *indev, lv_indev_data_t *data) {
    (void)indev;
    data->point.x = mouse_data.point.x;
    data->point.y = mouse_data.point.y;
    data->state = mouse_data.state;
}

static uint32_t last_key = 0;
static lv_indev_state_t key_state = LV_INDEV_STATE_RELEASED;

/* Simple key event queue */
#define KEY_QUEUE_SIZE 32
static struct { uint32_t key; uint8_t pressed; } key_queue[KEY_QUEUE_SIZE];
static int key_queue_head = 0;
static int key_queue_tail = 0;

static void keyboard_read_cb(lv_indev_t *indev, lv_indev_data_t *data) {
    (void)indev;
    if (key_queue_head != key_queue_tail) {
        data->key = key_queue[key_queue_tail].key;
        data->state = key_queue[key_queue_tail].pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
        key_queue_tail = (key_queue_tail + 1) % KEY_QUEUE_SIZE;
        data->continue_reading = (key_queue_head != key_queue_tail);
    } else {
        data->key = last_key;
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

EMSCRIPTEN_KEEPALIVE void app_tick(uint32_t ms) {
    lv_tick_inc(ms);
    lv_timer_handler();
}

EMSCRIPTEN_KEEPALIVE void app_mouse_event(int x, int y, int pressed) {
    mouse_data.point.x = x;
    mouse_data.point.y = y;
    mouse_data.state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

EMSCRIPTEN_KEEPALIVE void app_key_event(uint32_t key, int pressed) {
    last_key = key;
    int next = (key_queue_head + 1) % KEY_QUEUE_SIZE;
    if (next != key_queue_tail) {
        key_queue[key_queue_head].key = key;
        key_queue[key_queue_head].pressed = (uint8_t)pressed;
        key_queue_head = next;
    }
}

#include "ui.h"

int main(void) {
    lv_init();

    disp_width = ${width};
    disp_height = ${height};
    lv_display_t *disp = lv_display_create(disp_width, disp_height);
    lv_display_set_flush_cb(disp, flush_cb);
    lv_display_set_buffers(disp, draw_buf, NULL, disp_width * disp_height * 4, LV_DISPLAY_RENDER_MODE_FULL);
    lv_display_set_color_format(disp, LV_COLOR_FORMAT_ARGB8888);

    memset(&mouse_data, 0, sizeof(mouse_data));
    mouse_data.state = LV_INDEV_STATE_RELEASED;
    lv_indev_t *mouse_indev = lv_indev_create();
    lv_indev_set_type(mouse_indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(mouse_indev, mouse_read_cb);

    lv_indev_t *kb_indev = lv_indev_create();
    lv_indev_set_type(kb_indev, LV_INDEV_TYPE_KEYPAD);
    lv_indev_set_read_cb(kb_indev, keyboard_read_cb);

    /* Create a default group so that editable widgets (e.g. textarea)
       are automatically added to it, and link the keypad indev to it. */
    lv_group_t *g = lv_group_create();
    lv_group_set_default(g);
    lv_indev_set_group(kb_indev, g);

    ui_init();

    for (int i = 0; i < 10; i++) {
        lv_timer_handler();
        lv_tick_inc(33);
    }

    return 0;
}
`;
}

/**
 * The link step, run as emcc directly rather than through a shell.
 *
 * The argument list carries `-sEXPORTED_FUNCTIONS="['_main',...]"` and a file
 * list that grows with the project; handing that to a shell means quoting it
 * correctly on two platforms, and there is nothing here a shell is needed for.
 */
function runEmcc(
  toolchain: ToolchainReport,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      toolchain.emscripten.path ?? 'emcc',
      args,
      {
        cwd,
        env: { ...process.env, ...toolchain.emscripten.env },
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: err ? 1 : 0 });
      },
    );
  });
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

async function artifactSizes(buildDir: string): Promise<string> {
  const parts: string[] = [];
  for (const name of ['output.wasm', 'output.js']) {
    try {
      parts.push(`${name} ${formatBytes((await stat(join(buildDir, name))).size)}`);
    } catch {
      // A missing artifact is the link's problem to report, not this line's.
    }
  }
  return parts.join(' · ');
}

/**
 * What the Build Output pane shows when a build works.
 *
 * Until this existed the client replaced the whole thing with the literal
 * string "Build succeeded", so emcc's warnings — the entire reason a build log
 * exists — were collected by the server and dropped. A build that succeeded is
 * still worth a page: what it compiled, what came out, how big, and everything
 * the compiler said on the way. See docs/emulator.md §4.5.
 */
async function successLog(options: {
  elapsedMs: number;
  toolchain: ToolchainReport;
  libraryBuilt: boolean;
  sources: string[];
  fonts: string[];
  buildDir: string;
  emcc: { stdout: string; stderr: string };
}): Promise<string> {
  const { elapsedMs, toolchain, libraryBuilt, sources, fonts, buildDir, emcc } = options;
  const lines = [
    `Build succeeded in ${(elapsedMs / 1000).toFixed(1)} s`,
    '',
    `LVGL      ${toolchain.lvgl.version ?? 'unknown version'} · ${toolchain.lvgl.source}`,
    `Library   ${libraryBuilt ? 'compiled from source for this configuration' : 'reused from the cache'}`,
    `Compiled  ${sources.join(', ')}`,
  ];
  if (fonts.length > 0) {
    lines.push(`Fonts     ${fonts.join(', ')}`);
  }
  const sizes = await artifactSizes(buildDir);
  if (sizes) lines.push(`Output    ${sizes}`);

  // emcc on Windows ends its lines with CRLF; the pane renders the stray CR as
  // nothing useful, so normalise before anyone has to look at it.
  const said = [emcc.stdout, emcc.stderr]
    .map((part) => part.replace(/\r\n?/g, '\n').trim())
    .filter(Boolean)
    .join('\n');
  // The same deprecation warning arrives once per translation unit, so the
  // count is what makes the tail scannable rather than the tail itself.
  const warnings = (said.match(/\bwarning:/g) ?? []).length;
  if (warnings > 0) {
    lines.push(`Warnings  ${warnings}`);
  }

  lines.push('', said ? `emcc said:\n${said}` : 'emcc said nothing — no warnings.');
  return lines.join('\n');
}

function sendJson(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default function emulatorPlugin(): Plugin {
  return {
    name: 'lvgl-emulator',
    configureServer(server) {
      // GET /api/emulator/toolchain — the preflight the Emulator tab runs on
      // mount, so a machine that cannot build says so before Start is pressed
      // rather than after a compile that was never going to happen.
      server.middlewares.use('/api/emulator/toolchain', async (req, res) => {
        const refresh = (req.url ?? '').includes('refresh');
        const report = refresh ? await refreshToolchain() : await getToolchain();
        // The injected environment carries the whole PATH and is of no use to
        // the page; the panel needs to know what was found, not how it is run.
        const { env: _env, ...emscripten } = report.emscripten;
        sendJson(res, 200, {
          ...report,
          emscripten,
          libraryReady: await lvglLibraryReady(report),
        });
      });

      // POST /api/emulator/build
      server.middlewares.use('/api/emulator/build', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        // Read body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
          files: Record<string, string>;
          fonts?: FontRequest[];
          width: number;
          height: number;
        };

        const { files, fonts, width, height } = body;

        // Re-detected on every build rather than cached for the server's life:
        // someone who just ran the setup command should not have to restart the
        // dev server to be believed.
        const toolchain = await refreshToolchain();
        if (!toolchain.ready) {
          sendJson(res, 200, {
            success: false,
            error: toolchainProblemText(toolchain),
            toolchain,
            buildId: '',
          });
          return;
        }

        const startedAt = Date.now();
        const buildId = randomUUID();
        const buildDir = join(tmpdir(), `lvgl-build-${buildId}`);

        try {
          await mkdir(buildDir, { recursive: true });

          let libPath: string;
          let confIncludeDir: string;
          let libraryBuilt = false;
          try {
            const library = await ensureLvglLibrary(toolchain, (line) => {
              server.config.logger.info(`[emulator] ${line}`);
            });
            libPath = library.libPath;
            confIncludeDir = library.confDir;
            libraryBuilt = library.built;
          } catch (libErr) {
            await rm(buildDir, { recursive: true, force: true }).catch(() => {});
            sendJson(res, 200, {
              success: false,
              error: String(libErr instanceof Error ? libErr.message : libErr),
              toolchain,
              buildId: '',
            });
            return;
          }

          // Write user files
          for (const [name, content] of Object.entries(files)) {
            await writeFile(join(buildDir, name), content, 'utf-8');
          }

          // Write main_wrapper.c
          await writeFile(join(buildDir, 'main_wrapper.c'), generateMainWrapper(width, height), 'utf-8');

          // Convert font resources via lv_font_conv
          let fontCFiles: Record<string, string> = {};
          if (fonts && fonts.length > 0) {
            try {
              fontCFiles = await convertFonts(fonts, buildDir);
              // Write generated font .c files into buildDir
              for (const [name, content] of Object.entries(fontCFiles)) {
                await writeFile(join(buildDir, name), content, 'utf-8');
              }
            } catch (fontErr) {
              await rm(buildDir, { recursive: true, force: true }).catch(() => {});
              sendJson(res, 200, {
                success: false,
                error: `Font conversion failed: ${String(fontErr)}`,
                buildId: '',
              });
              return;
            }
          }

          // Collect .c files from user
          const cFiles = Object.keys(files).filter(f => f.endsWith('.c'));
          const fontFiles = Object.keys(fontCFiles);
          const lvglRoot = toolchain.lvgl.path!;

          const args = [
            'main_wrapper.c',
            ...cFiles,
            ...fontFiles,
            '-O2',
            '-DLV_CONF_INCLUDE_SIMPLE',
            `-I${join(lvglRoot, '..')}`,
            `-I${lvglRoot}`,
            `-I${join(lvglRoot, 'src')}`,
            `-I${confIncludeDir}`,
            '-I.',
            libPath,
            '-sALLOW_MEMORY_GROWTH=1',
            '-sINITIAL_MEMORY=33554432',
            "-sEXPORTED_FUNCTIONS=['_main','_app_tick','_app_mouse_event','_app_key_event','_wasi_get_framebuffer','_wasi_get_fb_ready','_wasi_clear_fb_ready','_wasi_get_width','_wasi_get_height']",
            "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPU32']",
            '-sNO_EXIT_RUNTIME=1',
            '-sMODULARIZE=1',
            '-sEXPORT_NAME=LvglModule',
            '-sENVIRONMENT=web',
            '-Wno-unused-function',
            '-Wno-implicit-function-declaration',
            '-o',
            'output.js',
          ];

          const result = await runEmcc(toolchain, args, buildDir);

          if (result.code !== 0) {
            // Cleanup on failure
            await rm(buildDir, { recursive: true, force: true }).catch(() => {});
            sendJson(res, 200, {
              success: false,
              error: [
                `Build failed after ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
                '',
                result.stderr || result.stdout,
              ].join('\n'),
              buildId: '',
            });
            return;
          }

          // Store build directory
          builds.set(buildId, buildDir);

          // Schedule cleanup
          setTimeout(async () => {
            builds.delete(buildId);
            await rm(buildDir, { recursive: true, force: true }).catch(() => {});
          }, BUILD_TTL_MS);

          sendJson(res, 200, {
            success: true,
            buildId,
            log: await successLog({
              elapsedMs: Date.now() - startedAt,
              toolchain,
              libraryBuilt,
              sources: ['main_wrapper.c', ...cFiles],
              fonts: fontFiles,
              buildDir,
              emcc: result,
            }),
          });
        } catch (err) {
          await rm(buildDir, { recursive: true, force: true }).catch(() => {});
          sendJson(res, 500, { success: false, error: String(err), buildId: '' });
        }
      });

      // GET /api/emulator/build/:buildId/output.{js,wasm}
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(
          /^\/api\/emulator\/build\/([a-f0-9-]+)\/(output\.js|output\.wasm)$/,
        );
        if (!match || req.method !== 'GET') {
          next();
          return;
        }

        const buildId = match[1];
        const fileName = match[2];
        const buildDir = builds.get(buildId);

        if (!buildDir) {
          res.statusCode = 404;
          res.end('Build not found');
          return;
        }

        const filePath = join(buildDir, fileName);
        readFile(filePath)
          .then((data) => {
            if (fileName === 'output.js') {
              res.setHeader('Content-Type', 'application/javascript');
            } else {
              res.setHeader('Content-Type', 'application/wasm');
            }
            res.setHeader('Cache-Control', 'no-cache');
            res.end(data);
          })
          .catch(() => {
            res.statusCode = 404;
            res.end('File not found');
          });
      });
    },
  };
}
