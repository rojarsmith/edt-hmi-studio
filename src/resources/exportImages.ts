// Writes the image resources back out as real files, mirroring the folder tree
// shown in the Folders pane.
//
// The plan is separated from the writing so the naming and structure rules can
// be tested without a directory handle or a zip.

import type { ImageResource } from './types';
import { normalizeFolderPath } from './imageTree';

/**
 * The container written inside the directory the user picks. Lowercase on
 * purpose: the tree displays this level as `Images`, but on disk it matches the
 * convention of the other asset directories.
 */
export const EXPORT_ROOT_DIR = 'images';

export interface PlannedFile {
  /** Path segments below the chosen directory, starting with EXPORT_ROOT_DIR. */
  segments: string[];
  /** File name including its extension. */
  fileName: string;
  /** The image this entry writes. */
  image: ImageResource;
}

/**
 * Makes one path segment safe to write. Names come from the OS file picker,
 * so the risk is not control characters but the punctuation Windows reserves,
 * whitespace that makes paths tedious to script, and a trailing dot.
 */
function safeSegment(segment: string): string {
  const cleaned = segment
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned.replace(/\.+$/, '') || '_';
}

function splitExtension(fileName: string): [string, string] {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return [fileName, ''];
  return [fileName.slice(0, dot), fileName.slice(dot)];
}

/**
 * Where each image ends up. Images keep their original file name so that
 * exporting and then re-importing the directory reproduces the same tree.
 *
 * Two images can carry the same original name in the same folder — uploading
 * the same file twice, or moving one across — so names are made unique within
 * each directory rather than silently overwriting.
 */
export function planImageExport(images: readonly ImageResource[]): PlannedFile[] {
  const usedPerDirectory = new Map<string, Set<string>>();
  const plan: PlannedFile[] = [];

  for (const image of images) {
    const folder = normalizeFolderPath(image.folder);
    const segments = [
      EXPORT_ROOT_DIR,
      ...(folder === '' ? [] : folder.split('/').map(safeSegment)),
    ];
    const directoryKey = segments.join('/');
    if (!usedPerDirectory.has(directoryKey)) {
      usedPerDirectory.set(directoryKey, new Set());
    }
    const used = usedPerDirectory.get(directoryKey);
    if (!used) continue;

    const wanted = safeSegment(image.originalName || `${image.name}.png`);
    const [stem, extension] = splitExtension(wanted);
    let fileName = wanted;
    let counter = 2;
    while (used.has(fileName.toLowerCase())) {
      fileName = `${stem}_${counter}${extension}`;
      counter += 1;
    }
    used.add(fileName.toLowerCase());

    plan.push({ segments, fileName, image });
  }

  return plan;
}

/** Decodes the stored `data:` URL into bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const comma = dataUrl.indexOf(',');
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface ExportResult {
  written: number;
  /** 'directory' when written in place, 'zip' when the browser cannot. */
  via: 'directory' | 'zip';
}

/** Whether the browser can write into a directory the user picks. */
export function canExportToDirectory(): boolean {
  return typeof (globalThis as { showDirectoryPicker?: unknown })
    .showDirectoryPicker === 'function';
}

interface DirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{
      write(data: BufferSource | Blob): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

async function writeToDirectory(
  root: DirectoryHandle,
  plan: readonly PlannedFile[],
): Promise<number> {
  // Handles are cached because getDirectoryHandle(create) on an existing name
  // is a round trip per file otherwise.
  const directories = new Map<string, DirectoryHandle>();

  const resolve = async (segments: string[]): Promise<DirectoryHandle> => {
    const key = segments.join('/');
    const cached = directories.get(key);
    if (cached) return cached;
    let handle = root;
    for (const segment of segments) {
      handle = await handle.getDirectoryHandle(segment, { create: true });
    }
    directories.set(key, handle);
    return handle;
  };

  let written = 0;
  for (const entry of plan) {
    const directory = await resolve(entry.segments);
    const file = await directory.getFileHandle(entry.fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(dataUrlToBytes(entry.image.data));
    await writable.close();
    written += 1;
  }
  return written;
}

async function writeToZip(plan: readonly PlannedFile[]): Promise<number> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const entry of plan) {
    zip.file(
      [...entry.segments, entry.fileName].join('/'),
      dataUrlToBytes(entry.image.data),
    );
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${EXPORT_ROOT_DIR}.zip`;
  link.click();
  URL.revokeObjectURL(url);
  return plan.length;
}

/**
 * Writes every image into `<chosen directory>/images/...`, or falls back to a
 * zip of the same structure when the browser has no directory picker.
 *
 * Returns null when the user cancels the picker, which is not an error.
 */
export async function exportImages(
  images: readonly ImageResource[],
): Promise<ExportResult | null> {
  const plan = planImageExport(images);
  if (plan.length === 0) return { written: 0, via: 'directory' };

  if (canExportToDirectory()) {
    const picker = (globalThis as unknown as {
      showDirectoryPicker: (options?: { mode?: string }) => Promise<DirectoryHandle>;
    }).showDirectoryPicker;
    let chosen: DirectoryHandle;
    try {
      chosen = await picker({ mode: 'readwrite' });
    } catch (error) {
      // AbortError is the user dismissing the picker.
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
    return { written: await writeToDirectory(chosen, plan), via: 'directory' };
  }

  return { written: await writeToZip(plan), via: 'zip' };
}
