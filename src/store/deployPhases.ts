// Turning build and flash output into something a panel designer should read.
//
// The Work pane is the product's view of an operation; the log panes beside it
// are the engineering one. So nothing raw reaches Work: a line is recognised
// and replaced with a phase, or it is ignored. Never stripped, never trimmed,
// never passed through.
//
// That direction matters. A deny-list - "remove the word LVGL, remove .obj" -
// leaks the first line nobody thought of. An allow-list can only ever emit one
// of the phrases written here, so the toolchain cannot surface through it by
// accident. See docs/work-progress.md §3.

import type { WorkProgress } from './workStore';

/** The phases a firmware build passes through, in the order they happen. */
export const BUILD_PHASES = {
  preparing: 'Preparing your project',
  configuring: 'Setting up the build',
  engine: 'Compiling the display engine',
  board: 'Compiling the panel firmware',
  screens: 'Compiling your screens',
  images: 'Compiling images',
  fonts: 'Compiling fonts',
  assembling: 'Assembling the firmware',
  packaging: 'Packaging the firmware',
} as const;

export const FLASH_PHASES = {
  connecting: 'Connecting to the board',
  erasing: 'Preparing the board',
  images: 'Writing images to the board',
  writing: 'Writing the firmware',
  verifying: 'Checking what was written',
  restarting: 'Restarting the board',
} as const;

/** How an operation is described once it has ended. */
export const OUTCOMES = {
  buildSucceeded: 'Firmware ready to install',
  buildFailed: 'Could not build the firmware',
  buildStopped: 'Build stopped',
  flashSucceeded: 'Firmware installed, board restarted',
  flashFailed: 'Could not install the firmware',
  starting: 'Starting',
} as const;

/**
 * Ninja counts its own work: `[263/585] Building ...`. The count is the only
 * thing read out of a build line; the rest of the line decides the phase and is
 * then discarded.
 */
const COUNTER = /^\[(\d+)\/(\d+)\]/;

export function parseProgress(line: string): WorkProgress | null {
  const match = COUNTER.exec(line.trim());
  if (!match) return null;
  const done = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
  return { done: Math.min(done, total), total };
}

/**
 * Which phase a compile line belongs to.
 *
 * Location decides before filename, and getting that order wrong is not
 * harmless: the display engine has its own files with `font` and `img` in their
 * names, so matching those first reported "Compiling images" while nothing of
 * the author's was being compiled at all. Only what sits under the generated
 * project source is the author's.
 */
function compilePhase(line: string): string {
  const lower = line.toLowerCase();

  if (lower.includes('project-source')) {
    if (/font/.test(lower)) return BUILD_PHASES.fonts;
    if (/(^|[/\\_])(img|image)/.test(lower)) return BUILD_PHASES.images;
    return BUILD_PHASES.screens;
  }
  // The panel's own software: board bring-up, drivers, the runtime.
  if (lower.includes('firmware.dir')) return BUILD_PHASES.board;

  return BUILD_PHASES.engine;
}

export interface PhaseUpdate {
  /** Absent when the line says nothing a designer needs; the phase then holds. */
  label?: string;
  progress?: WorkProgress;
}

export function describeBuildLine(line: string): PhaseUpdate {
  const update: PhaseUpdate = {};
  const progress = parseProgress(line);
  if (progress) update.progress = progress;

  const text = line.trim();
  const lower = text.toLowerCase();

  if (COUNTER.test(text)) {
    // Only the final image counts as assembling; a static library linked along
    // the way still belongs to whatever produced it.
    update.label = /\.elf|\.hex|\.bin\b/.test(lower)
      ? BUILD_PHASES.assembling
      : compilePhase(text);
    return update;
  }

  if (lower.startsWith('generated project source')) {
    update.label = BUILD_PHASES.preparing;
  } else if (
    lower.startsWith('--')
    || lower.includes('configuring done')
    || lower.includes('generating done')
    || lower.includes('build files have been written')
  ) {
    update.label = BUILD_PHASES.configuring;
  } else if (
    lower.includes('firmware artifacts')
    || lower.includes('external flash image')
  ) {
    update.label = BUILD_PHASES.packaging;
  }

  return update;
}

export function describeFlashLine(line: string): PhaseUpdate {
  const lower = line.trim().toLowerCase();

  if (lower.includes('st-link') || lower.includes('connecting') || lower.includes('device id')) {
    return { label: FLASH_PHASES.connecting };
  }
  if (lower.includes('erasing') || lower.includes('mass erase')) {
    return { label: FLASH_PHASES.erasing };
  }
  if (lower.includes('external flash') || lower.includes('external loader')) {
    return { label: FLASH_PHASES.images };
  }
  if (lower.includes('download') || lower.includes('programming') || lower.includes('writing')) {
    return { label: FLASH_PHASES.writing };
  }
  if (lower.includes('verif')) {
    return { label: FLASH_PHASES.verifying };
  }
  if (lower.includes('reset') || lower.includes('reboot')) {
    return { label: FLASH_PHASES.restarting };
  }
  return {};
}
