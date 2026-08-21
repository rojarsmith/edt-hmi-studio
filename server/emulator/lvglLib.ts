// The LVGL static library the Emulator links against, built on demand.
//
// It used to be a file someone was expected to produce by hand, by running
// wasm/build_lvgl_lib.sh — a script nothing in the product mentions, whose
// toolchain paths were hardcoded to another machine, and which could not
// succeed against LVGL 9.5 anyway because it compiled the SDL backend that
// this rung does not use and cannot supply headers for. Pressing Start then
// produced "liblvgl_emcc.a not found", which is true and useless.
//
// So the library is now a build product with a cache, keyed by the
// configuration that produced it: change wasm/lv_conf.h, or point the Emulator
// at a different LVGL, and the next run rebuilds. See docs/emulator.md §3.4.

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { EMULATOR_CACHE, REPO_ROOT, type ToolchainReport } from './toolchain';

/** The shared `wasm/` build tree's configuration, which this rung starts from. */
export const LV_CONF_TEMPLATE = join(REPO_ROOT, 'wasm', 'lv_conf.h');

export interface LvglLibrary {
  libPath: string;
  /** Holds the generated lv_conf.h; goes on the include path for every unit. */
  confDir: string;
  /** True when the build ran rather than the cache answering. */
  built: boolean;
}

/** Git Bash chokes on backslashes inside a command; MSYS accepts `C:/...`. */
export function toShellPath(path: string): string {
  return path.replaceAll('\\', '/');
}

/**
 * The Emulator's LVGL configuration: the `wasm/` tree's, with SDL off.
 *
 * Rung 2 draws through `lv_sdl_window_create` and needs `LV_USE_SDL 1`. This
 * rung has its own flush callback into a plain framebuffer and never touches
 * SDL — but leaving the switch on makes LVGL's SDL backend part of the library
 * build, and it fails on `#include <SDL2/SDL.h>` because nothing here provides
 * SDL2 headers. Turning it off is both correct and the difference between a
 * library that builds and one that does not.
 */
export async function generateEmulatorLvConf(): Promise<string> {
  const template = await readFile(LV_CONF_TEMPLATE, 'utf-8');
  return template.replace(
    /#define LV_USE_SDL\s+\d+/,
    '#define LV_USE_SDL              0 /* the Emulator flushes to its own framebuffer */',
  );
}

/**
 * Cache key: the configuration, the LVGL that will be compiled, and the
 * compiler that will compile it. Any of the three changing produces a
 * different library, so any of the three changing has to miss the cache.
 */
function libraryKey(conf: string, lvglPath: string, emccPath: string): string {
  return createHash('md5')
    .update(conf)
    .update('\u0000')
    .update(lvglPath)
    .update('\u0000')
    .update(emccPath)
    .digest('hex')
    .slice(0, 12);
}

/**
 * The build, as a script on disk rather than a `bash -c` string.
 *
 * Two reasons: quoting a hundred-line pipeline through an argument is how
 * escaping bugs are born, and a failed build leaves the exact script that
 * failed sitting next to its log.
 */
function buildScript(lvglPath: string, confDir: string, outDir: string, jobs: number): string {
  const lvgl = toShellPath(lvglPath);
  const conf = toShellPath(confDir);
  const out = toShellPath(outDir);

  return `#!/usr/bin/env bash
set -e

LVGL="${lvgl}"
CONF="${conf}"
OUT="${out}"

mkdir -p "$OUT/objs"

# src/drivers/ is LVGL's collection of host backends — SDL, X11, Wayland, evdev,
# the lot. This rung draws into its own framebuffer and uses none of them, and
# compiling them needs headers no one here has.
find "$LVGL/src" -name '*.c' -not -path '*/src/drivers/*' | sort > "$OUT/objs/sources.txt"
echo "lvgl: $(wc -l < "$OUT/objs/sources.txt") source files, $NPROC at a time"

compile_one() {
  src="$1"
  # Named by the path below src/, not the absolute path: a flattened absolute
  # path carries the drive colon, which Windows will not accept in a filename,
  # and is long enough to reach MAX_PATH on the way.
  rel="\${src#$LVGL/src/}"
  obj="$OUT/objs/$(printf '%s' "$rel" | tr -c 'A-Za-z0-9._-' '_').o"
  if [ -f "$obj" ] && [ "$obj" -nt "$src" ]; then
    return 0
  fi
  emcc -O2 -c "$src" -o "$obj" \\
    -I"$CONF" \\
    -I"$LVGL/.." \\
    -DLV_CONF_INCLUDE_SIMPLE \\
    -Wno-unused-function \\
    -Wno-implicit-function-declaration
}
export -f compile_one
export LVGL CONF OUT

xargs -a "$OUT/objs/sources.txt" -I{} -P ${jobs} "$BASH" -c 'compile_one "$@"' _ {}

echo "lvgl: archiving"
rm -f "$OUT/liblvgl_emcc.a"
# In batches: the object list is long enough to overrun a command line, and
# response files are an ar extension not worth depending on.
ls "$OUT/objs"/*.o | xargs -n 100 emar q "$OUT/liblvgl_emcc.a"
emar s "$OUT/liblvgl_emcc.a"
echo "lvgl: done"
`;
}

function runScript(
  bash: string,
  scriptPath: string,
  cwd: string,
  env: Record<string, string>,
  onLine?: (line: string) => void,
): Promise<{ code: number; output: string }> {
  return new Promise((res) => {
    const child = spawn(bash, [toShellPath(scriptPath)], {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
    });

    let output = '';
    let pending = '';
    const consume = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      // Forwarded as they arrive so a five-minute first build is not five
      // minutes of silence in the dev server's terminal.
      for (const line of lines) onLine?.(line);
    };

    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.on('error', (err) => res({ code: 1, output: `${output}\n${err.message}` }));
    child.on('close', (code) => {
      if (pending) onLine?.(pending);
      res({ code: code ?? 1, output });
    });
  });
}

/**
 * Whether the library for this configuration has already been built.
 *
 * The first build compiles LVGL from source and takes minutes; every later one
 * is a cache hit. Saying which of the two is about to happen costs one
 * existsSync and saves the user wondering whether it has hung.
 */
export async function lvglLibraryReady(toolchain: ToolchainReport): Promise<boolean> {
  const location = await lvglLibraryLocation(toolchain);
  return location !== null && existsSync(location.libPath);
}

/**
 * Where the library for this configuration lives, whether or not it exists yet.
 *
 * Separate from ensureLvglLibrary so a caller can link against a library that
 * is already there without risking a several-minute build as a side effect —
 * which is what the codegen compile tests need.
 */
export async function lvglLibraryLocation(
  toolchain: ToolchainReport,
): Promise<{ libPath: string; confDir: string } | null> {
  if (!toolchain.lvgl.path) return null;
  try {
    const conf = await generateEmulatorLvConf();
    const key = libraryKey(conf, toolchain.lvgl.path, toolchain.emscripten.path ?? 'emcc');
    const dir = join(EMULATOR_CACHE, 'lib', key);
    return { libPath: join(dir, 'liblvgl_emcc.a'), confDir: dir };
  } catch {
    return null;
  }
}

/** One build per key at a time; a second caller waits for the first. */
const inFlight = new Map<string, Promise<LvglLibrary>>();

export async function ensureLvglLibrary(
  toolchain: ToolchainReport,
  onLine?: (line: string) => void,
): Promise<LvglLibrary> {
  if (!toolchain.ready || !toolchain.bash.path || !toolchain.lvgl.path) {
    throw new Error('The toolchain is not ready; nothing to build the LVGL library with.');
  }

  const conf = await generateEmulatorLvConf();
  const key = libraryKey(conf, toolchain.lvgl.path, toolchain.emscripten.path ?? 'emcc');
  const outDir = join(EMULATOR_CACHE, 'lib', key);
  const libPath = join(outDir, 'liblvgl_emcc.a');


  if (existsSync(libPath)) {
    return { libPath, confDir: outDir, built: false };
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const build = (async (): Promise<LvglLibrary> => {
    await mkdir(join(outDir, 'objs'), { recursive: true });
    await writeFile(join(outDir, 'lv_conf.h'), conf, 'utf-8');

    const scriptPath = join(outDir, 'build-lvgl.sh');
    const jobs = Math.max(1, Math.min(16, cpus().length));
    await writeFile(
      scriptPath,
      buildScript(toolchain.lvgl.path!, outDir, outDir, jobs),
      'utf-8',
    );

    const result = await runScript(
      toolchain.bash.path!,
      scriptPath,
      outDir,
      { ...toolchain.emscripten.env, NPROC: String(jobs) },
      onLine,
    );

    await writeFile(join(outDir, 'build.log'), result.output, 'utf-8').catch(() => {});

    if (result.code !== 0 || !existsSync(libPath)) {
      throw new Error(
        `Building the LVGL library failed. The script and its log are in ${outDir}.\n\n${result.output.slice(-4000)}`,
      );
    }

    return { libPath, confDir: outDir, built: true };
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, build);
  return build;
}
