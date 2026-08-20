// Bottom dock: the strip of tool panes between the workspace and the status bar.
//
// Modelled on Visual Studio's bottom tool-window strip. Only the dock's own
// chrome lives here -- which pane is in front, whether it is expanded, how tall
// it is. What a pane shows belongs to whatever subsystem owns it (today:
// deployStore). See docs/bottom-dock-panel.md.

import { create } from 'zustand';

export type DockPaneId = 'work' | 'build' | 'flash';

const HEIGHT_KEY = 'dockPanelHeight';
export const DOCK_MIN_HEIGHT = 120;
export const DOCK_DEFAULT_HEIGHT = 220;
/** The workspace above must never be squeezed to nothing. */
export const DOCK_MIN_WORKSPACE = 240;

function readStoredHeight(): number {
  try {
    const raw = localStorage.getItem(HEIGHT_KEY);
    if (!raw) return DOCK_DEFAULT_HEIGHT;
    const value = Number(raw);
    return Number.isFinite(value) && value >= DOCK_MIN_HEIGHT
      ? value
      : DOCK_DEFAULT_HEIGHT;
  } catch {
    return DOCK_DEFAULT_HEIGHT;
  }
}

interface DockState {
  /**
   * Expanded versus collapsed to just its tab strip. Distinct from *hidden*,
   * which is not stored: the dock is shown when the Deploy tab is open, or
   * while an operation is running, and App decides that from those two facts.
   */
  expanded: boolean;
  activePane: DockPaneId;
  height: number;

  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  /** Brings a pane to the front, expanding the dock if it was collapsed. */
  showPane: (pane: DockPaneId) => void;
  setActivePane: (pane: DockPaneId) => void;
  setHeight: (height: number) => void;
}

export const useDockStore = create<DockState>((set) => ({
  expanded: true,
  activePane: 'work',
  height: readStoredHeight(),

  setExpanded: (expanded) => set({ expanded }),
  toggleExpanded: () => set((state) => ({ expanded: !state.expanded })),
  showPane: (pane) => set({ activePane: pane, expanded: true }),
  setActivePane: (pane) => set({ activePane: pane }),

  setHeight: (height) => {
    const next = Math.max(DOCK_MIN_HEIGHT, Math.round(height));
    set({ height: next });
    try {
      localStorage.setItem(HEIGHT_KEY, String(next));
    } catch {
      // A dock that cannot remember its height is still a usable dock.
    }
  },
}));
