// Deploy state that has to outlive the Deploy tab.
//
// All of this used to be useState inside DeployPanel. App.tsx renders tabs
// through a switch, so leaving Deploy unmounts the panel and discarded the log,
// the busy flag and -- worst of it -- the buildId, which left Flash & Reset
// with nothing to flash. Holding it here means a build keeps running while the
// author works in another tab, and everything is still there on the way back.
// See docs/bottom-dock-panel.md §3.
//
// The operations read their inputs through getState() rather than closing over
// React state, so nothing here depends on a mounted component.

import { create } from 'zustand';
import { useAppStore } from './appStore';
import { useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';
import { useResourceStore } from '../resources';
import { useLogicEditorStore } from '../components/LogicEditor';
import {
  buildHmiProject,
  cancelHmiBuild,
  subscribeBuildLog,
  flashHmiBuild,
  getHmiCapabilities,
  getHmiImageLayout,
  listHmiPorts,
  type HmiCapabilities,
  type HmiImageLayout,
  type HmiSerialPort,
} from '../services/hmiApi';
import { useWorkStore } from './workStore';
import {
  describeBuildLine,
  describeFlashLine,
  OUTCOMES,
} from './deployPhases';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_ORIENTATION,
  DEFAULT_PROTOCOL_ID,
  type BoardId,
  type DisplayOrientation,
  type ProtocolId,
} from '../types/hmi';

/** Which operation is in flight. One at a time, per the local service. */
export type DeployBusy = 'building' | 'flashing' | null;

/** The two dock panes, and the two log streams behind them. */
export type DeployLogPane = 'build' | 'flash';

/** Names one run's log channel. randomUUID is not in every context we build for. */
function newRunId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface DeployState {
  /* Project context, refreshed whenever the Deploy tab mounts. */
  boardId: BoardId;
  protocol: ProtocolId;
  /* Read alongside the board because whether a build is possible depends on
     both — see BoardDefinition.display.orientations. */
  orientation: DisplayOrientation;
  runtimePort: string;
  ports: HmiSerialPort[];
  capabilities: HmiCapabilities | null;
  /**
   * Which project the build state below belongs to. Revisiting the tab must not
   * clear a buildId; opening a different project must.
   */
  loadedProjectId: string | null;

  /* Operation state. This is the part that outlives the tab. */
  busy: DeployBusy;
  buildId: string;
  artifactUrl: string;
  layout: HmiImageLayout | null;
  buildLog: string[];
  flashLog: string[];

  loadProjectContext: (projectId: string) => Promise<void>;
  refreshPorts: () => Promise<void>;
  appendLog: (pane: DeployLogPane, message: string | string[]) => void;
  clearLog: (pane: DeployLogPane) => void;
  runBuild: () => Promise<void>;
  runFlash: () => Promise<void>;
}

export const useDeployStore = create<DeployState>((set, get) => ({
  boardId: DEFAULT_BOARD_ID,
  protocol: DEFAULT_PROTOCOL_ID,
  orientation: DEFAULT_ORIENTATION,
  runtimePort: '',
  ports: [],
  capabilities: null,
  loadedProjectId: null,

  busy: null,
  buildId: '',
  artifactUrl: '',
  layout: null,
  buildLog: [],
  flashLog: [],

  appendLog: (pane, message) => {
    const lines = (Array.isArray(message) ? message : [message]).filter(Boolean);
    if (lines.length === 0) return;
    set((state) =>
      pane === 'build'
        ? { buildLog: [...state.buildLog, ...lines] }
        : { flashLog: [...state.flashLog, ...lines] },
    );
  },

  clearLog: (pane) =>
    set(pane === 'build' ? { buildLog: [] } : { flashLog: [] }),

  refreshPorts: async () => {
    try {
      const result = await listHmiPorts();
      set({ ports: result.ports });
    } catch {
      // The port list only supplies the ST-LINK serial number here; the local
      // service picks a probe on its own when it is missing.
    }
  },

  loadProjectContext: async (projectId) => {
    // A different project invalidates the build; the same one revisited does
    // not, which is the whole point of holding this outside the component.
    if (get().loadedProjectId !== projectId) {
      set({
        loadedProjectId: projectId,
        buildId: '',
        artifactUrl: '',
        layout: null,
        buildLog: [],
        flashLog: [],
      });
    }

    const project = useProjectStore.getState();
    try {
      // The Protocol tab debounces its saves and may have unmounted moments
      // ago, so wait for those writes before reading the board and protocol
      // back.
      await project.flushProjectConfigWrites();
      const config = await project.getProjectConfig(projectId);
      if (config) {
        set({
          boardId: config.boardId,
          protocol: config.protocol ?? DEFAULT_PROTOCOL_ID,
          orientation: config.display?.orientation ?? DEFAULT_ORIENTATION,
          runtimePort: config.communication?.port ?? '',
        });
      }
    } catch (error) {
      get().appendLog('build', `Failed to load project settings: ${String(error)}`);
    }

    try {
      const capabilities = await getHmiCapabilities();
      set({ capabilities });
      if (capabilities.error) {
        get().appendLog('build', `Local HMI service: ${capabilities.error}`);
      }
    } catch (error) {
      set({ capabilities: { success: false, available: false, error: String(error) } });
      get().appendLog(
        'build',
        `Local HMI service unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await get().refreshPorts();
  },

  runBuild: async () => {
    const projectId = useAppStore.getState().currentProjectId;
    if (!projectId) return;
    // Two triggers reach this now -- the Deploy card and the dock pane's own
    // toolbar -- so the guard is no longer just a disabled button.
    if (get().busy !== null) return;

    set({ busy: 'building', buildId: '', artifactUrl: '', layout: null });
    const append = (message: string | string[]) => get().appendLog('build', message);
    const work = useWorkStore.getState();
    let workId: number | null = null;

    try {
      const project = useProjectStore.getState();
      const { screens, animations } = useEditorStore.getState();
      const logicGraphs = useLogicEditorStore.getState().graphs;
      const { images, fonts } = useResourceStore.getState();

      // Anything the user typed on the Protocol tab has to be on disk before
      // the project is exported, or the firmware is built from stale settings.
      await project.flushProjectConfigWrites();
      await project.saveProjectData(
        projectId, screens, logicGraphs, images, fonts,
        undefined, undefined, undefined, undefined, undefined, undefined,
        animations,
      );
      const projectFile = await project.exportProject(projectId);

      // Live output. The run id is ours, and the subscription opens before the
      // POST, so the first line of a build that takes minutes does not have to
      // wait for its last. See docs/streaming-build-log.md.
      const runId = newRunId();
      let streamed = 0;
      let stopped = false;

      // A build is the one operation here that may be interrupted: it writes
      // to a scratch directory, not to the board. See docs/work-progress.md.
      const buildWorkId = work.start('Build Firmware', {
        cancellable: true,
        cancel: () => {
          stopped = true;
          void cancelHmiBuild(runId);
        },
      });
      workId = buildWorkId;

      const stopStreaming = subscribeBuildLog(runId, (line) => {
        streamed += 1;
        append(line);
        // The log pane keeps the line; Work gets the phase it implies.
        work.note(buildWorkId, describeBuildLine(line));
      });

      let result;
      try {
        result = await buildHmiProject(projectFile, runId);
      } finally {
        stopStreaming();
      }

      // The stream and the response carry the same sequence, so take it from
      // whichever actually arrived rather than from both.
      if (streamed === 0) append(result.log);

      if (!result.success) {
        const message = stopped
          ? 'Firmware build stopped.'
          : `Firmware build failed: ${result.error || 'Unknown error'}`;
        append(message);
        work.finish(
          buildWorkId,
          stopped ? 'cancelled' : 'failed',
          stopped ? OUTCOMES.buildStopped : OUTCOMES.buildFailed,
        );
        workId = null;
        return;
      }
      if (result.buildId) set({ buildId: result.buildId });
      if (result.artifact?.downloadUrl) set({ artifactUrl: result.artifact.downloadUrl });

      if (result.buildId && useAppStore.getState().factoryDevMode) {
        // Only read back when the section is on screen; it is a file parse.
        try {
          set({ layout: await getHmiImageLayout(result.buildId) });
        } catch {
          // The layout is diagnostic; a build is not less successful without it.
        }
      }

      const done = result.buildId
        ? `Firmware build complete, buildId: ${result.buildId}`
        : 'Firmware build complete.';
      append(done);
      work.finish(buildWorkId, 'succeeded', OUTCOMES.buildSucceeded);
      workId = null;
    } catch (error) {
      const message = `Firmware build failed: ${error instanceof Error ? error.message : String(error)}`;
      append(message);
      if (workId !== null) work.finish(workId, 'failed', OUTCOMES.buildFailed);
      workId = null;
    } finally {
      // A work item must never be left running by a path that forgot it.
      if (workId !== null) work.finish(workId, 'failed', OUTCOMES.buildFailed);
      set({ busy: null });
    }
  },

  runFlash: async () => {
    const { buildId, busy, ports, runtimePort } = get();
    const append = (message: string | string[]) => get().appendLog('flash', message);

    if (!buildId) {
      append('Build the firmware first.');
      return;
    }
    if (busy !== null) return;

    set({ busy: 'flashing' });
    // Not cancellable, and that is the point of the capability being per item:
    // this one writes to the board, and a half-written image is worse than a
    // slow one. See docs/work-progress.md.
    const work = useWorkStore.getState();
    const workId = work.start('Flash & Reset', { cancellable: false });
    work.note(workId, { label: 'Connecting to the board' });
    let settled = false;

    try {
      const probeSerial = ports.find((port) => port.path === runtimePort)?.probeSerial;
      const result = await flashHmiBuild(buildId, probeSerial);
      append(result.log);
      // Flashing answers in one go, so its phases are read back from the log
      // it returns rather than as they happen.
      for (const line of result.log) work.note(workId, describeFlashLine(line));
      const message = result.success
        ? 'Firmware flashed and device reset.'
        : `Firmware flashing failed: ${result.error || 'Unknown error'}`;
      append(message);
      work.finish(
        workId,
        result.success ? 'succeeded' : 'failed',
        result.success ? OUTCOMES.flashSucceeded : OUTCOMES.flashFailed,
      );
      settled = true;
    } catch (error) {
      const message = `Firmware flashing failed: ${error instanceof Error ? error.message : String(error)}`;
      append(message);
      work.finish(workId, 'failed', OUTCOMES.flashFailed);
      settled = true;
    } finally {
      if (!settled) work.finish(workId, 'failed', OUTCOMES.flashFailed);
      set({ busy: null });
    }
  },
}));
