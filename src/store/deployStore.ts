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
  flashHmiBuild,
  getHmiCapabilities,
  getHmiImageLayout,
  listHmiPorts,
  type HmiCapabilities,
  type HmiImageLayout,
  type HmiSerialPort,
} from '../services/hmiApi';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_PROTOCOL_ID,
  type BoardId,
  type ProtocolId,
} from '../types/hmi';

/** Which operation is in flight. One at a time, per the local service. */
export type DeployBusy = 'building' | 'flashing' | null;

/** The two dock panes, and the two log streams behind them. */
export type DeployLogPane = 'build' | 'flash';

interface DeployState {
  /* Project context, refreshed whenever the Deploy tab mounts. */
  boardId: BoardId;
  protocol: ProtocolId;
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
      const result = await buildHmiProject(projectFile);
      append(result.log);

      if (!result.success) {
        append(`Firmware build failed: ${result.error || 'Unknown error'}`);
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

      append(
        result.buildId
          ? `Firmware build complete, buildId: ${result.buildId}`
          : 'Firmware build complete.',
      );
    } catch (error) {
      append(`Firmware build failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
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
    try {
      const probeSerial = ports.find((port) => port.path === runtimePort)?.probeSerial;
      const result = await flashHmiBuild(buildId, probeSerial);
      append(result.log);
      append(
        result.success
          ? 'Firmware flashed and device reset.'
          : `Firmware flashing failed: ${result.error || 'Unknown error'}`,
      );
    } catch (error) {
      append(`Firmware flashing failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      set({ busy: null });
    }
  },
}));
