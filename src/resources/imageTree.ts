// Folder tree over the flat image list. Folders come from the relative paths of
// an uploaded directory, so the tree is derived on every render rather than
// stored — there is no folder entity to keep in sync with the images.

import type { ImageResource } from './types';

export interface ImageFolderNode {
  /** Full slash-separated path. '' is the root. */
  path: string;
  /** Last segment, or ROOT_NAME for the root. */
  name: string;
  children: ImageFolderNode[];
  /** Images whose folder is exactly this path. */
  ownCount: number;
  /** ownCount plus every descendant's, which is what the table shows. */
  totalCount: number;
}

export const ROOT_PATH = '';

/**
 * Not 'images': uploading a directory called `images` creates a real folder of
 * that name directly under the root, and two identically named nodes in a row
 * is unreadable.
 */
export const ROOT_NAME = 'All Images';

/**
 * Normalizes a folder path: no leading or trailing slashes, no empty or
 * relative segments, no backslashes. A browser directory upload reports paths
 * like `images/battery_screen/x.png`, and Windows drag-and-drop can produce
 * backslashes.
 */
export function normalizeFolderPath(input: string | undefined): string {
  if (!input) return ROOT_PATH;
  return input
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');
}

/**
 * The folder of a File from a directory upload. `webkitRelativePath` includes
 * the file name and the dropped directory itself, both of which are stripped:
 * `images/battery/x.png` becomes `images/battery`.
 */
export function folderFromRelativePath(relativePath: string): string {
  const normalized = normalizeFolderPath(relativePath);
  const cut = normalized.lastIndexOf('/');
  return cut === -1 ? ROOT_PATH : normalized.slice(0, cut);
}

/** Every ancestor of a path, root first, excluding the path itself. */
function ancestorsOf(path: string): string[] {
  if (path === ROOT_PATH) return [];
  const segments = path.split('/');
  const result: string[] = [ROOT_PATH];
  for (let i = 1; i < segments.length; i += 1) {
    result.push(segments.slice(0, i).join('/'));
  }
  return result;
}

export function buildImageTree(images: readonly ImageResource[]): ImageFolderNode {
  const nodes = new Map<string, ImageFolderNode>();
  const makeNode = (path: string): ImageFolderNode => ({
    path,
    name: path === ROOT_PATH ? ROOT_NAME : path.slice(path.lastIndexOf('/') + 1),
    children: [],
    ownCount: 0,
    totalCount: 0,
  });

  nodes.set(ROOT_PATH, makeNode(ROOT_PATH));

  for (const image of images) {
    const path = normalizeFolderPath(image.folder);
    // Materialize the whole chain: a folder with no direct images still has to
    // appear when a deeper one does.
    for (const ancestor of [...ancestorsOf(path), path]) {
      if (!nodes.has(ancestor)) nodes.set(ancestor, makeNode(ancestor));
    }
    const node = nodes.get(path);
    if (node) node.ownCount += 1;
  }

  for (const [path, node] of nodes) {
    if (path === ROOT_PATH) continue;
    const parentPath = path.includes('/')
      ? path.slice(0, path.lastIndexOf('/'))
      : ROOT_PATH;
    nodes.get(parentPath)?.children.push(node);
  }

  const finish = (node: ImageFolderNode): number => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.totalCount = node.ownCount
      + node.children.reduce((sum, child) => sum + finish(child), 0);
    return node.totalCount;
  };
  const root = nodes.get(ROOT_PATH);
  if (!root) throw new Error('image tree lost its root');
  finish(root);
  return root;
}

/** True when `path` is `folder` or sits inside it. Root contains everything. */
export function isWithinFolder(path: string, folder: string): boolean {
  if (folder === ROOT_PATH) return true;
  return path === folder || path.startsWith(`${folder}/`);
}

/**
 * Images shown for a selected folder: everything in it and in its subfolders,
 * optionally narrowed by a case-insensitive search over name and folder.
 */
export function selectImages(
  images: readonly ImageResource[],
  folder: string,
  query: string,
): ImageResource[] {
  const needle = query.trim().toLowerCase();
  return images.filter((image) => {
    const path = normalizeFolderPath(image.folder);
    if (!isWithinFolder(path, folder)) return false;
    if (needle === '') return true;
    return image.name.toLowerCase().includes(needle)
      || path.toLowerCase().includes(needle);
  });
}
