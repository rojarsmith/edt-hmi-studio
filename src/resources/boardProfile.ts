// Per-installation extras for the supported boards: the picture the hardware
// picker shows, and the line of description under it.
//
// Both are supplied by a factory engineer rather than shipped, and both are a
// property of the *hardware* rather than of any project — so they live in
// localStorage, follow the installation, and survive every project being
// deleted. See docs/factory-dev-mode.md.
//
// None ship with the editor. A photograph of a development kit is the vendor's
// to distribute, it dates as soon as a revision changes the silkscreen, and a
// wrong one is worse than none — so the picker draws a schematic of the panel
// instead (BoardThumbnail), and a factory engineer supplies the real picture
// per board if they want one.
//
import type { BoardId } from '../types/hmi';

const IMAGE_PREFIX = 'edt-hmi-studio.board-image.';
const SUMMARY_PREFIX = 'edt-hmi-studio.board-summary.';

/**
 * Longest edge a stored picture is scaled to.
 *
 * localStorage is a handful of megabytes for the whole origin and holds no
 * other large values, so the budget is real but generous. 640 px is more than
 * the picker can display at any size and keeps a JPEG-ish photo well under a
 * hundred kilobytes once it is a data URI.
 */
const MAX_EDGE = 640;

function imageKey(boardId: BoardId): string {
  return `${IMAGE_PREFIX}${boardId}`;
}

function summaryKey(boardId: BoardId): string {
  return `${SUMMARY_PREFIX}${boardId}`;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private-browsing modes throw rather than returning null. A picker with
    // the built-in text and a schematic is a working picker.
    return null;
  }
}

/**
 * The description shown under the board, which is the board definition's own
 * `summary` unless this installation has replaced it.
 */
export function getBoardSummary(board: { id: BoardId; summary: string }): string {
  const override = read(summaryKey(board.id));
  return override !== null && override.trim() !== '' ? override : board.summary;
}

/** Whether the text above came from this installation rather than the build. */
export function hasBoardSummaryOverride(boardId: BoardId): boolean {
  const override = read(summaryKey(boardId));
  return override !== null && override.trim() !== '';
}

export function setBoardSummary(boardId: BoardId, text: string): void {
  try {
    if (text.trim() === '') {
      localStorage.removeItem(summaryKey(boardId));
    } else {
      localStorage.setItem(summaryKey(boardId), text);
    }
  } catch {
    /* see read() */
  }
}

/** The stored picture for a board, or null when it should draw a schematic. */
export function getBoardImage(boardId: BoardId): string | null {
  return read(imageKey(boardId));
}

export function clearBoardImage(boardId: BoardId): void {
  try {
    localStorage.removeItem(imageKey(boardId));
  } catch {
    /* see read() */
  }
}

/**
 * Scale a picked file down and store it against the board.
 *
 * Rejects rather than storing a half-result: a quota error here means the
 * picture is not saved, and the caller has to say so instead of leaving the
 * user believing it was.
 */
export async function setBoardImage(boardId: BoardId, file: File): Promise<void> {
  const dataUri = await downscaleToDataUri(file);
  try {
    localStorage.setItem(imageKey(boardId), dataUri);
  } catch {
    throw new Error(
      'Could not store the image — it may be too large, or the browser storage is full.',
    );
  }
}

function downscaleToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not read the image.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // JPEG rather than PNG: these are photographs, and a PNG of a photograph
      // is several times the size for no visible gain at this scale.
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image the browser can read.'));
    };

    image.src = url;
  });
}
