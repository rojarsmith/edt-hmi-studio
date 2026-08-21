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
