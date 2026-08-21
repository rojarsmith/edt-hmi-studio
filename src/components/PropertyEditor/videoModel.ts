/** A path separator, either way round. Anything holding one is not a name. */
const PATH_SEPARATORS = ['/', String.fromCharCode(92)];

/**
 * What is wrong with a Video widget's file name, in the words the user needs
 * to fix it, or null when nothing is.
 *
 * Advisory, never blocking. The editor has no way to see the SD card, so the
 * only things it can honestly catch are the ones that are wrong whatever is on
 * the card: no name at all, a path where a name belongs, or an extension the
 * runtime does not read. Everything else — a name that matches nothing there, a
 * file whose video track is not Motion JPEG — waits for the panel, which is the
 * only thing that can actually look.
 *
 * See docs/video-playback.md §6.
 */
export function videoFileNameWarning(name: string): string | null {
  if (name === '') {
    return 'No file named yet. Type the name of the file as it appears in the root of the SD card, for example intro.avi.';
  }
  if (PATH_SEPARATORS.some((separator) => name.includes(separator))) {
    return 'The runtime opens the file from the root of the card, so this is a name rather than a path — drop the folders and leave just the file, for example intro.avi.';
  }
  if (!/\.avi$/i.test(name)) {
    return 'Only an AVI container is read. Rename the file to end in .avi, or remux it — the video track inside must be Motion JPEG.';
  }
  return null;
}
