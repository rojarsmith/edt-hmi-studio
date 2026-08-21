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
  /** stdout and stderr of the last build, or '' when nothing has run. */
  output: string;
  setOutput: (output: string) => void;
  clearOutput: () => void;
}

export const useEmulatorStore = create<EmulatorState>((set) => ({
  output: '',
  setOutput: (output) => set({ output }),
  clearOutput: () => set({ output: '' }),
}));
