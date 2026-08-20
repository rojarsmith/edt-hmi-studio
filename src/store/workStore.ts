// The Work history: every long-running operation this session has started.
//
// Modelled on Eclipse's Progress view, with one deliberate difference — a
// finished item is not swept away. The list keeps every run of the session,
// newest first, so "what did that build say twenty minutes ago" is answerable
// without having started a fresh one. It is memory only and never persisted:
// the history is about this sitting, not about the project.

import { create } from 'zustand';

export type WorkStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface WorkProgress {
  done: number;
  total: number;
}

export interface WorkItem {
  /** 1-based and monotonic for the life of the session. */
  id: number;
  /** 'Build Firmware', 'Flash & Reset', and whatever comes later. */
  name: string;
  startedAt: number;
  endedAt?: number;
  status: WorkStatus;
  /**
   * The most recent thing the operation said while it ran, and how it ended
   * once it has. The single most useful column in Eclipse's version.
   */
  detail: string;
  /**
   * Absent until the operation can say how much of it there is. A build is
   * indeterminate while CMake configures and determinate once the compiler
   * starts counting, which is exactly how the build feels to wait through.
   */
  progress?: WorkProgress;
  /**
   * Whether stopping it is offered. Not every operation may be interrupted:
   * flashing writes to the board, and a half-written image is worse than a
   * slow one.
   */
  cancellable: boolean;
  /** Set while running and cancellable; cleared when the item settles. */
  cancel?: () => void;
}

interface WorkState {
  items: WorkItem[];
  nextId: number;

  start: (name: string, options?: { cancellable?: boolean; cancel?: () => void }) => number;
  update: (id: number, patch: Partial<Omit<WorkItem, 'id' | 'name' | 'startedAt'>>) => void;
  /** Records the most recent output line, and any count it carries. */
  note: (id: number, detail: string) => void;
  finish: (id: number, status: Exclude<WorkStatus, 'running'>, detail?: string) => void;
  clearFinished: () => void;
}

/**
 * Ninja counts its own work: `[263/585] Building C object ...`. Reading it back
 * out of the log costs nothing and turns an indeterminate bar into a real one.
 */
const NINJA_PROGRESS = /^\[(\d+)\/(\d+)\]/;

export function parseProgress(line: string): WorkProgress | null {
  const match = NINJA_PROGRESS.exec(line.trim());
  if (!match) return null;
  const done = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
  return { done: Math.min(done, total), total };
}

export const useWorkStore = create<WorkState>((set) => ({
  items: [],
  nextId: 1,

  start: (name, options) => {
    let id = 0;
    set((state) => {
      id = state.nextId;
      const item: WorkItem = {
        id,
        name,
        startedAt: Date.now(),
        status: 'running',
        detail: 'Starting...',
        cancellable: options?.cancellable ?? false,
        cancel: options?.cancel,
      };
      // Newest first: the one you are waiting on should never be scrolled to.
      return { items: [item, ...state.items], nextId: id + 1 };
    });
    return id;
  },

  update: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),

  note: (id, detail) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id !== id) return item;
        const progress = parseProgress(detail);
        return {
          ...item,
          detail,
          progress: progress ?? item.progress,
        };
      }),
    })),

  finish: (id, status, detail) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          status,
          endedAt: Date.now(),
          detail: detail ?? item.detail,
          // A finished bar reads as full only when it finished successfully;
          // one that stopped at 263/585 should still say so.
          progress: status === 'succeeded' && item.progress
            ? { done: item.progress.total, total: item.progress.total }
            : item.progress,
          cancel: undefined,
        };
      }),
    })),

  clearFinished: () =>
    set((state) => ({
      items: state.items.filter((item) => item.status === 'running'),
    })),
}));
