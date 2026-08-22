/**
 * What a Video widget plays, read the one way every layer agrees on.
 *
 * A video used to name one file in the root of the card. It now names a
 * playlist: either a list of files, each with a folder in front of it if it
 * lives in one, or a folder the panel scans for every .avi in it. Projects
 * written before that carry `fileName`, and every reader — the property
 * editor, the canvas, the prototype, the generator — goes through
 * `normalizeVideoProps` so that a file from then plays exactly as it did.
 * See docs/video-playback.md §1.
 */

/** Where the playlist comes from. */
export type VideoSource = 'list' | 'folder';

export interface VideoPlaylist {
  source: VideoSource;
  /** The files, in play order, when `source` is `list`. Paths use `/`. */
  files: string[];
  /** The folder scanned for .avi files when `source` is `folder`. `''` is the root. */
  folder: string;
  autoPlay: boolean;
  loop: boolean;
  /**
   * Random order. The panel draws the next file at random and never the one
   * it just played, so a two-file list alternates and a longer one never
   * shows the same clip twice running.
   */
  shuffle: boolean;
}

const BACKSLASH = String.fromCharCode(92);

/**
 * A path as the card's file system wants it: forward slashes, no leading
 * slash or `./`, no trailing slash, no doubled separators.
 *
 * Backslashes are accepted because that is how a Windows user reads a path off
 * their own screen, and refusing it would be a rule about typing rather than
 * about the card. Whitespace at either end is never part of a file name a
 * person meant.
 */
export function normalizeCardPath(raw: string): string {
  let path = raw.split(BACKSLASH).join('/').trim();
  path = path.replace(/\/{2,}/g, '/');
  while (path.startsWith('./')) path = path.slice(2);
  while (path.startsWith('/')) path = path.slice(1);
  while (path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

/** The file's own name, with any folder in front of it removed. */
export function baseName(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? path : path.slice(index + 1);
}

/**
 * The playlist this widget's props describe, whichever shape they were
 * written in.
 *
 * `files` lines are kept as typed apart from normalisation — an empty line is
 * dropped rather than kept as an empty entry, because a blank line in a list
 * is a person's spacing, not a file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeVideoProps(props: Record<string, any> | undefined): VideoPlaylist {
  const p = props ?? {};
  const source: VideoSource = p.source === 'folder' ? 'folder' : 'list';

  let files: string[] = [];
  if (Array.isArray(p.files)) {
    files = p.files
      .filter((entry: unknown): entry is string => typeof entry === 'string')
      .map(normalizeCardPath)
      .filter((entry: string) => entry !== '');
  } else if (typeof p.fileName === 'string' && normalizeCardPath(p.fileName) !== '') {
    // The one-file shape every project before playlists was written in.
    files = [normalizeCardPath(p.fileName)];
  }

  const folder = typeof p.folder === 'string' ? normalizeCardPath(p.folder) : '';

  return {
    source,
    files,
    folder,
    autoPlay: p.autoPlay !== false,
    loop: p.loop !== false,
    /**
     * One named file has no order to shuffle, so the switch reads off however
     * it was stored — here rather than in each reader, so the canvas badge,
     * the generated table and the property editor's toggle cannot disagree.
     * A folder scan keeps the setting: how many files the folder holds is the
     * panel's to find out.
     */
    shuffle: p.shuffle === true && !(source === 'list' && files.length <= 1),
  };
}

/**
 * One line naming what the widget plays, for the canvas and the prototype:
 * `intro.avi`, `intro.avi +2`, `clips/ (every .avi)`. Empty when nothing is
 * named, which the caller turns into its own "no file named".
 */
export function describeVideoPlaylist(playlist: VideoPlaylist): string {
  if (playlist.source === 'folder') {
    return `${playlist.folder === '' ? '/' : `${playlist.folder}/`} (every .avi)`;
  }
  if (playlist.files.length === 0) return '';
  const first = playlist.files[0];
  return playlist.files.length === 1 ? first : `${first} +${playlist.files.length - 1}`;
}

/** Whether the panel will have anything to look for at all. */
export function videoPlaylistIsEmpty(playlist: VideoPlaylist): boolean {
  return playlist.source === 'list' && playlist.files.length === 0;
}
