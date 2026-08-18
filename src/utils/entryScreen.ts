import type { Screen } from '../types';

/**
 * The project's entry screen — the one the generated firmware boots into and
 * the project card uses for its thumbnail.
 *
 * Exactly one screen is the entry at all times: the one flagged `isEntry`, or
 * the first screen when no flag is present (projects saved before the flag
 * existed). Null only when the project has no screens at all.
 */
export function getEntryScreen(screens: Screen[]): Screen | null {
  return screens.find(s => s.isEntry) ?? screens[0] ?? null;
}
