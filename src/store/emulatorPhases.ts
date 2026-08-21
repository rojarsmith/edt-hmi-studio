// Turning the Emulator build's output into something a panel designer reads.
//
// Same rule as deployPhases.ts, for the same reason: the Work pane is the
// product's view of an operation and the Build Output pane beside it is the
// engineering one, so nothing raw crosses over. A line is recognised and
// replaced with a phase written here, or it is ignored — an allow-list can only
// ever emit one of these phrases, where a deny-list leaks the first line nobody
// thought of. See docs/work-progress.md §3.

/** The phases an Emulator build passes through, in the order they happen. */
export const EMULATOR_PHASES = {
  preparing: 'Preparing your screens',
  engine: 'Compiling the display engine',
  fonts: 'Converting fonts',
  screens: 'Compiling your screens',
  starting: 'Starting the emulator',
} as const;

/** How an Emulator build is described once it has ended. */
export const EMULATOR_OUTCOMES = {
  running: 'Running in the Emulator',
  failed: 'Could not build your screens',
  stopped: 'Build stopped',
} as const;

/**
 * The markers the dev server emits, matched against what it actually writes.
 *
 * These are the server's own lines rather than the compiler's: the plugin
 * announces each step in words that suit both panes, so this stays a list of
 * four patterns instead of a compiler-output parser that breaks when emcc
 * changes its mind about phrasing.
 */
const MARKERS: { pattern: RegExp; phase: string }[] = [
  { pattern: /^lvgl: \d+ source files/, phase: EMULATOR_PHASES.engine },
  { pattern: /^Converting \d+ fonts?\b/, phase: EMULATOR_PHASES.fonts },
  { pattern: /^Compiling your screens\b/, phase: EMULATOR_PHASES.screens },
];

/** The phase a line announces, or null when it announces nothing. */
export function emulatorPhaseFor(line: string): string | null {
  for (const marker of MARKERS) {
    if (marker.pattern.test(line)) return marker.phase;
  }
  return null;
}

/**
 * What the Emulator says outside factory dev mode.
 *
 * The same rule as the phases above, applied to the panel's own chrome: a
 * person laying out an HMI has not asked for LVGL, Emscripten or a compiler,
 * and naming them tells them nothing they can act on. Factory dev mode keeps
 * the engineering wording, which is where it is worth reading.
 *
 * The Build Output pane is not on this list: it is the engineering view by
 * definition and keeps its detail in both modes, being the place to look when
 * Work's phase is not enough. See docs/factory-dev-mode.md.
 */
export const EMULATOR_WORDS = {
  preparing: 'Preparing your panel…',
  starting: 'Starting your panel…',
  running: 'Running — click the screen to try it',
  failed: 'Could not prepare your panel',
  pressStart: 'Press Start to run your panel',
  firstRun:
    'The first run takes a few minutes to prepare. After that it starts in seconds.',
  unavailable: 'The Emulator is not available on this machine',
  unavailableDetail:
    'Whoever installed EDT HMI Studio here can switch it on. Until then, use the Deploy tab to try your panel on the board itself.',
} as const;
