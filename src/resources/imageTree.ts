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
 * The folder of a File from a directory upload.
 *
 * `webkitRelativePath` is `<chosen dir>/<subdirs...>/<file>`. Both the file
 * name and the chosen directory itself are dropped, so picking `images/`
 * puts `images/ui/battery/x.png` in `ui/battery` rather than nesting
 * everything under a redundant `images` node.
 */
export function folderFromRelativePath(relativePath: string): string {
  const segments = normalizeFolderPath(relativePath).split('/');
  // segments = [chosenDir, ...subdirs, fileName]
  return segments.length <= 2 ? ROOT_PATH : segments.slice(1, -1).join('/');
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

/**
 * @param folders Paths that exist on their own. A folder the user created but
 *   has not put anything in yet has no image to derive it from, so it has to be
 *   supplied separately or it would not appear.
 */
export function buildImageTree(
  images: readonly ImageResource[],
  folders: readonly string[] = [],
): ImageFolderNode {
  const nodes = new Map<string, ImageFolderNode>();
  const makeNode = (path: string): ImageFolderNode => ({
    path,
    name: path === ROOT_PATH ? ROOT_NAME : path.slice(path.lastIndexOf('/') + 1),
    children: [],
    ownCount: 0,
    totalCount: 0,
  });

  nodes.set(ROOT_PATH, makeNode(ROOT_PATH));

  for (const folder of folders) {
    const path = normalizeFolderPath(folder);
    for (const ancestor of [...ancestorsOf(path), path]) {
      if (!nodes.has(ancestor)) nodes.set(ancestor, makeNode(ancestor));
    }
  }

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
 * Images shown for a selected folder, narrowed by a case-insensitive search
 * over name and folder path.
 *
 * `includeChildren` is the Show child toggle. Off, only images sitting directly
 * in the folder appear; on, the whole subtree does. Note that the root with
 * children off means "images in no folder at all", which is a real answer
 * rather than a degenerate one.
 */
export function selectImages(
  images: readonly ImageResource[],
  folder: string,
  query: string,
  includeChildren = true,
): ImageResource[] {
  const needle = query.trim().toLowerCase();
  return images.filter((image) => {
    const path = normalizeFolderPath(image.folder);
    const inScope = includeChildren
      ? isWithinFolder(path, folder)
      : path === folder;
    if (!inScope) return false;
    if (needle === '') return true;
    return image.name.toLowerCase().includes(needle)
      || path.toLowerCase().includes(needle);
  });
}
