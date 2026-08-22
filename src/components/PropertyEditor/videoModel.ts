import { normalizeCardPath, type VideoPlaylist } from '../../utils/videoPlaylist';

/**
 * What is wrong with one typed file entry, in the words the user needs to fix
 * it, or null when nothing is.
 *
 * Advisory, never blocking. The editor has no way to see the SD card, so the
 * only things it can honestly catch are the ones that are wrong whatever is on
 * the card: an extension the runtime does not read, a name that is nothing but
 * a folder. Everything else — a name that matches nothing there, a file whose
 * video track is not Motion JPEG — waits for the panel, which is the only
 * thing that can actually look.
 *
 * A folder in front of the name is fine, either slash: the panel opens paths
 * anywhere on the card. See docs/video-playback.md §1.
 */
export function videoFileNameWarning(name: string): string | null {
  const path = normalizeCardPath(name);
  if (path === '') {
    return 'No file named yet. Type the name of a file on the SD card, with its folder in front if it is in one — intro.avi, or clips/intro.avi.';
  }
  if (!/\.avi$/i.test(path)) {
    return `“${path}” is not an .avi file. Only an AVI container is read — rename the file to end in .avi, or remux it; the video track inside must be Motion JPEG.`;
  }
  return null;
}

/**
 * Everything worth saying about a whole playlist, one line per problem.
 * Empty when the list is ready to hand to the panel.
 */
export function videoPlaylistWarnings(playlist: VideoPlaylist): string[] {
  if (playlist.source === 'folder') {
    // Nothing to check: any folder is a valid thing to scan, and whether it
    // holds an .avi is the panel's to find out.
    return [];
  }
  if (playlist.files.length === 0) {
    return [videoFileNameWarning('')!];
  }
  const warnings: string[] = [];
  for (const file of playlist.files) {
    const warning = videoFileNameWarning(file);
    if (warning) warnings.push(warning);
  }
  const seen = new Set<string>();
  for (const file of playlist.files) {
    const key = file.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`“${file}” is listed more than once. It will play each time it comes round; drop the repeat unless that is what you want.`);
      break;
    }
    seen.add(key);
  }
  return warnings;
}
