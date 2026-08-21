#!/usr/bin/env node
//
// Installs what the Emulator needs, and nothing else.
//
//   npm run emulator:setup
//
// The Emulator compiles the generated C against real LVGL with emcc. Neither
// is something a person designing an HMI should have to source themselves, and
// before this existed the product's answer to a missing toolchain was a path
// inside a stranger's home directory (docs/emulator.md §3.1).
//
// The shape follows firmware/<board>/scripts/bootstrap-deps.ps1, which already
// solved this for the firmware build: pinned versions, a gitignored cache, and
// an archive matched by the commit GitHub stamps into the zip rather than by
// its filename. Written in Node rather than PowerShell because the dev server
// runs wherever node does, and node is already required to run it.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

// Kept in step with server/emulator/toolchain.ts, which is what finds these
// again at build time. LVGL's pin is the firmware's pin — the two rungs
// compiling different LVGL is the hazard docs/preview-ladder.md §5 names.
const LVGL = {
  version: 'v9.5.0',
  commit: '85aa60d18b3d5e5588d7b247abf90198f07c8a63',
  name: 'lvgl-85aa60d',
  marker: '.hmi-version-lvgl-85aa60d',
  sentinel: join('src', 'lv_init.c'),
};
const EMSCRIPTEN_VERSION = '6.0.8';
const EMSDK_REPO = 'https://github.com/emscripten-core/emsdk.git';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(REPO_ROOT, '.hmi-cache', 'emulator');
const VENDOR_ROOT = process.env.HMI_VENDOR_ROOT ?? join(REPO_ROOT, 'firmware', 'vendor');

const force = process.argv.includes('--force');

function say(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with ${code}`));
    });
  });
}

// ------------------------------------------------------------------ LVGL

/**
 * The commit GitHub records in a generated archive's end-of-central-directory
 * comment. It is what lets a hand-downloaded zip satisfy the pin: a filename
 * can be anything, the commit cannot be faked by renaming.
 */
async function archiveCommit(path) {
  let handle;
  try {
    const { size } = await stat(path);
    if (size < 22) return '';
    handle = await open(path, 'r');
    const length = Math.min(512, size);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    for (let offset = length - 22; offset >= 0; offset--) {
      if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
      const commentLength = buffer.readUInt16LE(offset + 20);
      if (commentLength <= 0 || offset + 22 + commentLength > length) return '';
      return buffer.toString('ascii', offset + 22, offset + 22 + commentLength).trim();
    }
    return '';
  } catch {
    return '';
  } finally {
    await handle?.close();
  }
}

/** An archive already on disk that carries the pinned commit, if there is one. */
async function vendoredArchive() {
  if (!existsSync(VENDOR_ROOT)) return null;
  for (const entry of await readdir(VENDOR_ROOT)) {
    if (!entry.toLowerCase().endsWith('.zip')) continue;
    const path = join(VENDOR_ROOT, entry);
    if ((await archiveCommit(path)) === LVGL.commit) return path;
  }
  return null;
}

/** Every board cache the firmware bootstrap may already have populated. */
async function firmwareCheckouts() {
  const firmware = join(REPO_ROOT, 'firmware');
  if (!existsSync(firmware)) return [];
  const entries = await readdir(firmware, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      join(firmware, entry.name, '.hmi-cache', 'Middlewares', 'Third_Party', 'lvgl'),
    )
    .filter((path) => existsSync(join(path, LVGL.sentinel)) && existsSync(join(path, LVGL.marker)));
}

async function download(url, destination) {
  say(`  downloading ${url}`);
  await mkdir(dirname(destination), { recursive: true });
  const partial = `${destination}.download`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'edt-hmi-studio-bootstrap' } });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
      await rename(partial, destination);
      return;
    } catch (error) {
      await rm(partial, { force: true }).catch(() => {});
      if (attempt === 3) throw new Error(`Failed to download ${url}: ${error.message}`);
      say(`  attempt ${attempt} failed (${error.message}); retrying`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/**
 * Extract, dropping the single root directory GitHub wraps its archives in, so
 * the result is a plain LVGL checkout rather than lvgl-<sha>/ inside one.
 */
async function extract(archivePath, target) {
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const names = Object.keys(zip.files);
  const root = names[0].split('/')[0] + '/';
  await rm(target, { recursive: true, force: true });

  let written = 0;
  for (const name of names) {
    const entry = zip.files[name];
    if (!name.startsWith(root)) continue;
    const relative = name.slice(root.length);
    if (!relative) continue;
    const destination = join(target, relative);
    if (entry.dir) {
      await mkdir(destination, { recursive: true });
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await entry.async('nodebuffer'));
    written++;
    if (written % 500 === 0) say(`  extracted ${written} files`);
  }
  say(`  extracted ${written} files`);
}

async function ensureLvgl() {
  say(`LVGL ${LVGL.version}`);

  const own = join(CACHE, 'lvgl');
  if (!force && existsSync(join(own, LVGL.sentinel))) {
    say(`  already installed at ${own}`);
    return;
  }

  // The firmware bootstrap installs the same commit. Reusing it is free, and
  // it is what makes the Emulator and the board agree about LVGL.
  const shared = await firmwareCheckouts();
  if (!force && shared.length > 0) {
    say(`  already on this machine, from the firmware build:`);
    say(`    ${shared[0]}`);
    say(`  the Emulator will use it; nothing to download.`);
    return;
  }

  const downloads = join(CACHE, '.downloads');
  let archive = join(downloads, `${LVGL.name}.zip`);
  if (!existsSync(archive)) {
    const vendored = await vendoredArchive();
    if (vendored) {
      say(`  using the archive already in ${VENDOR_ROOT}`);
      archive = vendored;
    } else {
      await download(`https://codeload.github.com/lvgl/lvgl/zip/${LVGL.commit}`, archive);
    }
  }

  await extract(archive, own);
  if (!existsSync(join(own, LVGL.sentinel))) {
    throw new Error(`${own} is incomplete; ${LVGL.sentinel} is missing.`);
  }
  // The same marker firmware/<board>/scripts/bootstrap-deps.ps1 writes, so the
  // toolchain search can tell a pinned checkout from any other one.
  await writeFile(join(own, LVGL.marker), LVGL.name, 'ascii');
  say(`  installed at ${own}`);
}

// ------------------------------------------------------------ Emscripten

function emsdkInstalled(root) {
  return ['emcc.exe', 'emcc.bat', 'emcc'].some((name) =>
    existsSync(join(root, 'upstream', 'emscripten', name)),
  );
}

async function ensureEmscripten() {
  say(`Emscripten ${EMSCRIPTEN_VERSION}`);

  const root = join(CACHE, 'emsdk');
  if (!force && emsdkInstalled(root)) {
    say(`  already installed at ${root}`);
    return;
  }

  if (!existsSync(join(root, 'emsdk.py'))) {
    say('  cloning emsdk');
    await run('git', ['clone', '--depth', '1', EMSDK_REPO, root]);
  }

  // Several hundred megabytes on a first run, and worth saying so before the
  // terminal goes quiet.
  say('  installing — this downloads about 700 MB and takes a few minutes');
  const emsdk = process.platform === 'win32' ? join(root, 'emsdk.bat') : join(root, 'emsdk');
  await run(emsdk, ['install', EMSCRIPTEN_VERSION], { cwd: root });
  await run(emsdk, ['activate', EMSCRIPTEN_VERSION], { cwd: root });

  if (!emsdkInstalled(root)) {
    throw new Error(`emsdk finished but no emcc appeared under ${root}.`);
  }
  say(`  installed at ${root}`);
}

// ------------------------------------------------------------------ main

async function main() {
  say('Setting up the Emulator toolchain.');
  say(`Everything lands in ${CACHE}, which git ignores. Delete it to undo.\n`);

  await mkdir(CACHE, { recursive: true });
  await ensureLvgl();
  say('');
  await ensureEmscripten();

  say('\nDone. Open the Preview tab, choose Emulator, and press Start.');
  say('The first Start compiles LVGL from source and takes a few minutes;');
  say('after that it is seconds.');
}

main().catch((error) => {
  process.stderr.write(`\nSetup failed: ${error.message}\n`);
  process.exitCode = 1;
});
