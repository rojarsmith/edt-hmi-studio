// What the Emulator's last build had to say.
//
// It lived inside the Emulator panel as local state, behind a toggle button
// that opened a box on top of the canvas. It is a build log, and this product
// already has a place for build logs: the bottom dock, beside the firmware
// build's own (docs/bottom-dock-panel.md). Moving it there means the output and
// the running screen are visible at once instead of one covering the other,
// which is the position you want when a build has just failed.
//
// Only the text lives here. Which pane is in front and whether the dock is open
// belong to dockStore, exactly as the deploy logs do.

import { create } from 'zustand';

interface EmulatorState {
  /** Everything the last build said, or '' when nothing has run. */
  output: string;
  /** Replaces the whole log. Used for the summary a finished build composes. */
  setOutput: (output: string) => void;
  /**
   * Adds one line as it arrives.
   *
   * The build streams over the same SSE channel the firmware build uses, so the
   * pane fills while the compiler works instead of appearing all at once when
   * it stops. See docs/streaming-build-log.md.
   */
  appendOutput: (line: string) => void;
  clearOutput: () => void;
}

export const useEmulatorStore = create<EmulatorState>((set) => ({
  output: '',
  setOutput: (output) => set({ output }),
  appendOutput: (line) =>
    set((state) => ({ output: state.output ? `${state.output}\n${line}` : line })),
  clearOutput: () => set({ output: '' }),
}));
