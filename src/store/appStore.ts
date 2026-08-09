// Application-level state store

import { create } from 'zustand';

export type AppView = 'projectList' | 'editor';

/**
 * Extract pixel font size from a defaultFont identifier.
 * Built-in: "montserrat_14" → 14
 * Custom font: uses explicit defaultFontSize if provided, else first size from FontResource.sizes.
 * Fallback: 14
 */
export function parseFontSize(defaultFont: string, customFontSizes?: number[], defaultFontSize?: number): number {
  const builtinMatch = defaultFont.match(/^montserrat_(\d+)$/);
  if (builtinMatch) return parseInt(builtinMatch[1], 10);
  if (defaultFontSize !== undefined) return defaultFontSize;
  if (customFontSizes && customFontSizes.length > 0) return customFontSizes[0];
  return 14;
}

interface AppState {
  currentView: AppView;
  currentProjectId: string | null;
  showProjectSettings: boolean;
  lastSaveTime: number | null;
  /** Default font size derived from project lvglConfig.defaultFont */
  defaultFontSize: number;
  /**
   * Factory engineer development mode ("原廠人員研發模式").
   *
   * Unlocked from the About dialog — see docs/factory-dev-mode.md. Deliberately
   * held in memory only and never persisted, so it lasts until the app is
   * reloaded or restarted and can never be left on by accident.
   */
  factoryDevMode: boolean;

  setView: (view: AppView) => void;
  setCurrentProjectId: (id: string | null) => void;
  setShowProjectSettings: (show: boolean) => void;
  setLastSaveTime: (time: number) => void;
  setDefaultFontSize: (size: number) => void;
  /** Returns false when the passphrase does not match; state is left untouched. */
  unlockFactoryDevMode: (passphrase: string) => boolean;
  goToProjectList: () => void;
  openProject: (id: string) => void;
}

/**
 * Passphrase for factory engineer development mode. This is a discoverability
 * gate, not a security control: it ships in the client bundle and is documented
 * in docs/factory-dev-mode.md. Do not put anything behind it that actually
 * needs protecting.
 */
export const FACTORY_DEV_MODE_PASSPHRASE = 'edt321';

export const useAppStore = create<AppState>((set) => ({
  currentView: 'projectList',
  currentProjectId: null,
  showProjectSettings: false,
  lastSaveTime: null,
  defaultFontSize: 14,
  factoryDevMode: false,

  setView: (view) => set({ currentView: view }),
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setShowProjectSettings: (show) => set({ showProjectSettings: show }),
  setLastSaveTime: (time) => set({ lastSaveTime: time }),
  setDefaultFontSize: (size) => set({ defaultFontSize: size }),

  unlockFactoryDevMode: (passphrase) => {
    if (passphrase !== FACTORY_DEV_MODE_PASSPHRASE) return false;
    set({ factoryDevMode: true });
    return true;
  },

  goToProjectList: () => {
    set({ currentView: 'projectList', currentProjectId: null, lastSaveTime: null });
    localStorage.removeItem('lastOpenProjectId');
  },

  openProject: (id) => {
    set({ currentView: 'editor', currentProjectId: id });
    localStorage.setItem('lastOpenProjectId', id);
  },
}));
