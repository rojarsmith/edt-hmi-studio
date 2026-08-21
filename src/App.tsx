import React, { useCallback, useState, useRef, useEffect } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import ComponentPanel from './components/ComponentPanel';
import Canvas from './components/Canvas';
import PropertyEditor from './components/PropertyEditor';
import AnimationPanel from './components/AnimationPanel';
import ScreenTabs from './components/ScreenTabs';
import ScreenManager from './components/ScreenManager';
import StatusBar from './components/StatusBar';
import DockPanel from './components/DockPanel';
import AlignToolbar from './components/AlignToolbar';
import HelpPanel from './components/HelpPanel';
import AboutDialog from './components/AboutDialog';
import HardwareInfoDialog from './components/HardwareInfoDialog';
import Toast, { useToast } from './components/Toast';
import Modal, { modal } from './components/Modal';
import CodePreview from './components/CodePreview';
import DesktopMenuBar from './components/DesktopMenuBar/DesktopMenuBar';
import { LogicEditor } from './components/LogicEditor';
import PreviewPanel from './components/Preview';
import WasmPreview from './components/WasmPreview';
import Emulator from 'virtual:emulator';
import { HierarchyPanel } from './components/HierarchyPanel';
// ThemeSelector is intentionally unmounted for now — see the toolbar below.
import { ResourceWorkspace, useResourceStore } from './resources';
import { useLogicEditorStore } from './components/LogicEditor';
import { ProjectListPage } from './components/ProjectManager';
import { ProjectSettings } from './components/ProjectSettings';
import ProtocolPanel from './components/ProtocolPanel';
import DeployPanel from './components/DeployPanel';
import {
  downloadProject,
  loadProjectFromFile,
} from './resources/projectManager';
import { useEditorStore } from './store/editorStore';
import { useAppStore, parseFontSize } from './store/appStore';
import { useProjectStore } from './store/projectStore';
import type { LvglComponent, Screen } from './types';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { getComponentDefinition } from './utils/componentDefinitions';
import './App.css';

type TabType =
  | 'design'
  | 'image'
  | 'text'
  | 'icon'
  | 'logic'
  | 'protocol'
  | 'preview'
  | 'deploy'
  | 'code';

/** The three preview rungs, named as docs/preview-ladder.md names them. */
type PreviewMode = 'prototype' | 'simulator' | 'emulator';

/** The main feature tabs, in row order. The description is the hover tooltip. */
const TAB_DEFS: {
  id: TabType;
  icon: string;
  label: string;
  description: string;
  /** Only rendered while factory engineer development mode is unlocked. */
  factoryOnly?: boolean;
}[] = [
  { id: 'design', icon: '🎨', label: 'Design', description: 'Lay out screens and widgets on the canvas' },
  { id: 'image', icon: '🖼️', label: 'Image', description: 'Manage image resources' },
  { id: 'text', icon: '🔤', label: 'Text', description: 'Texts, languages and typography' },
  // Factory-dev only: the library browses and copies, but nothing a no-code
  // author can do with it reaches the panel yet — see docs/icon-library.md.
  { id: 'icon', icon: '⭐', label: 'Icon', description: 'Browse the built-in icon library', factoryOnly: true },
  { id: 'logic', icon: '🔗', label: 'Logic', description: 'Wire up no-code logic graphs' },
  { id: 'protocol', icon: '🔌', label: 'Protocol', description: 'Configure field-bus communication and tags' },
  { id: 'preview', icon: '📱', label: 'Preview', description: 'Run your screens on real LVGL, compiled from this project' },
  { id: 'deploy', icon: '🚀', label: 'Deploy', description: 'Build firmware and flash the board' },
  // Factory-dev only, kept last so the normal tab order is undisturbed.
  { id: 'code', icon: '💻', label: 'Code', description: 'Inspect the generated C code', factoryOnly: true },
];

// VITE_ENABLE_COMPILE_PREVIEW is the name this switch shipped under; it is still
// honoured so an existing CI script or deployment does not break on a rename.
// See docs/emulator.md §5.
const isEmulatorEnabled =
  import.meta.env.VITE_ENABLE_EMULATOR !== 'false' &&
  import.meta.env.VITE_ENABLE_COMPILE_PREVIEW !== 'false';

const App: React.FC = () => {
  const { currentView, currentProjectId, showProjectSettings, openProject, goToProjectList, setShowProjectSettings, setLastSaveTime, setDefaultFontSize } = useAppStore();
  const { loadProjectData, getProjectConfig, saveProjectData, exportProject, importProject } = useProjectStore();

  // On mount: check lastOpenProjectId
  useEffect(() => {
    const lastId = localStorage.getItem('lastOpenProjectId');
    if (lastId) {
      // Verify project still exists, then open
      getProjectConfig(lastId).then(cfg => {
        if (cfg) {
          // Load project data into stores
          loadProjectData(lastId).then(({ data, images, fonts }) => {
            useEditorStore.getState().setScreens(data.screens as Screen[], data.screenGroups, data.typographies, data.languages, data.texts, data.typographyGroups, data.textGroups, data.animations);
            useEditorStore.getState().setCanvasSize(cfg.display.width, cfg.display.height);
            useResourceStore.getState().importResources({ images, fonts });
            if (data.logicGraphs) {
              useLogicEditorStore.getState().setGraphs(data.logicGraphs);
            }
            // Set default font size from project config
            const fontRes = fonts.find(f => f.cFontName === cfg.lvglConfig.defaultFont);
            setDefaultFontSize(parseFontSize(cfg.lvglConfig.defaultFont, fontRes?.sizes, cfg.lvglConfig.defaultFontSize));
            openProject(lastId);
          }).catch(() => {
            // Failed to load, show project list
          });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toast hook must be called unconditionally (before any early return)
  const { messages: toastMessages, removeToast: removeGlobalToast } = useToast();

  if (currentView === 'projectList') {
    return (
      <div className="app">
        <ProjectListPage />
        <Toast messages={toastMessages} onRemove={removeGlobalToast} />
        <Modal />
      </div>
    );
  }

  return <EditorView
    currentProjectId={currentProjectId}
    showProjectSettings={showProjectSettings}
    setShowProjectSettings={setShowProjectSettings}
    goToProjectList={goToProjectList}
    setLastSaveTime={setLastSaveTime}
    setDefaultFontSize={setDefaultFontSize}
    saveProjectData={saveProjectData}
    exportProject={exportProject}
    importProject={importProject}
    loadProjectData={loadProjectData}
    getProjectConfig={getProjectConfig}
    openProject={openProject}
  />;
};

// Separate editor view to keep hooks stable
interface EditorViewProps {
  currentProjectId: string | null;
  showProjectSettings: boolean;
  setShowProjectSettings: (v: boolean) => void;
  goToProjectList: () => void;
  setLastSaveTime: (t: number) => void;
  setDefaultFontSize: (size: number) => void;
  saveProjectData: (id: string, screens: Screen[], logicGraphs: import('./components/LogicEditor/types').LogicGraph[], images: import('./resources/types').ImageResource[], fonts: import('./resources/types').FontResource[], screenGroups?: import('./types').ScreenGroup[], typographies?: import('./types').Typography[], languages?: import('./types').ProjectLanguage[], texts?: import('./types').TextResource[], typographyGroups?: import('./types').TypographyGroup[], textGroups?: import('./types').TextGroup[], animations?: import('./types').Animation[]) => Promise<void>;
  exportProject: (id: string) => Promise<import('./resources/types').ProjectFile>;
  importProject: (file: import('./resources/types').ProjectFile, name?: string) => Promise<string>;
  loadProjectData: (id: string) => Promise<{ data: { screens: Screen[]; screenGroups?: import('./types').ScreenGroup[]; typographies?: import('./types').Typography[]; languages?: import('./types').ProjectLanguage[]; texts?: import('./types').TextResource[]; typographyGroups?: import('./types').TypographyGroup[]; textGroups?: import('./types').TextGroup[]; animations?: import('./types').Animation[]; logicGraphs: import('./components/LogicEditor/types').LogicGraph[] }; images: import('./resources/types').ImageResource[]; fonts: import('./resources/types').FontResource[] }>;
  getProjectConfig: (id: string) => Promise<import('./store/projectStore').ProjectConfig | undefined>;
  openProject: (id: string) => void;
}

const EditorView: React.FC<EditorViewProps> = ({
  currentProjectId,
  showProjectSettings,
  setShowProjectSettings,
  goToProjectList,
  setLastSaveTime,
  setDefaultFontSize,
  saveProjectData,
  exportProject,
  importProject,
  loadProjectData,
  getProjectConfig,
  openProject,
}) => {
  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  const { addComponent, screens, screenGroups, typographies, typographyGroups, languages, texts, textGroups, animations, setScreens, setCanvasSize } = useEditorStore();
  const { images, fonts, importResources } = useResourceStore();
  const { messages, removeToast, success, error } = useToast();

  // UI State
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showHardwareInfo, setShowHardwareInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('design');
  // The Code and Icon tabs are factory-dev-mode only — see
  // docs/factory-dev-mode.md and docs/icon-library.md.
  const factoryDevMode = useAppStore(s => s.factoryDevMode);
  // Derived rather than synced: leaving the mode makes those tabs disappear,
  // and everything downstream should immediately read as 'design' instead.
  const effectiveTab: TabType = (activeTab === 'code' || activeTab === 'icon') && !factoryDevMode
    ? 'design'
    : activeTab;
  // Opening Preview means opening the Emulator. The other two rungs are the
  // editor's own approximations of LVGL — useful for working on the editor,
  // misleading as an answer about the panel (docs/preview-ladder.md §8) — so
  // the choice between rungs belongs with the rest of the factory-dev tools.
  // The exception is a build with the Emulator switched off, where hiding the
  // strip would leave the two remaining rungs unreachable.
  const canChoosePreviewRung = factoryDevMode || !isEmulatorEnabled;
  const [previewMode, setPreviewMode] = useState<PreviewMode>('emulator');
  const resolvedPreviewMode: PreviewMode = !canChoosePreviewRung
    ? 'emulator'
    : !isEmulatorEnabled && previewMode === 'emulator'
      ? 'prototype'
      : previewMode;
  const [projectName, setProjectName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load project name
  useEffect(() => {
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then(cfg => {
      if (cfg) setProjectName(cfg.name);
    });
  }, [currentProjectId, getProjectConfig]);

  // Configure drag sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  });
  const sensors = useSensors(mouseSensor);

  // Track dragging state for overlay
  const [activeDragType, setActiveDragType] = React.useState<string | null>(null);

  // Auto-save to IndexedDB
  useEffect(() => {
    if (!currentProjectId) return;

    const doSave = async () => {
      try {
        const logicGraphs = useLogicEditorStore.getState().graphs;
        await saveProjectData(currentProjectId, screens, logicGraphs, images, fonts, screenGroups, typographies, languages, texts, typographyGroups, textGroups, animations);
        setLastSaveTime(Date.now());
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    };

    // Debounce: save shortly after any change, plus periodic interval
    const debounceTimer = setTimeout(doSave, 1000);
    const saveInterval = setInterval(doSave, 30000);

    // Save on beforeunload
    const handleBeforeUnload = () => {
      // Fire-and-forget; IndexedDB transactions may or may not complete
      doSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(debounceTimer);
      clearInterval(saveInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentProjectId, screens, screenGroups, typographies, typographyGroups, languages, texts, textGroups, animations, images, fonts, saveProjectData, setLastSaveTime]);

  // Project management handlers
  const handleSaveProject = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const logicGraphs = useLogicEditorStore.getState().graphs;
      await saveProjectData(currentProjectId, screens, logicGraphs, images, fonts, screenGroups, typographies, languages, texts, typographyGroups, textGroups, animations);
      setLastSaveTime(Date.now());
      success('Project saved');
    } catch (err) {
      error('Save failed: ' + String(err));
    }
  }, [currentProjectId, screens, screenGroups, typographies, typographyGroups, languages, texts, textGroups, animations, images, fonts, saveProjectData, setLastSaveTime, success, error]);

  const handleExportProject = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      // Save first
      const logicGraphs = useLogicEditorStore.getState().graphs;
      await saveProjectData(currentProjectId, screens, logicGraphs, images, fonts, screenGroups, typographies, languages, texts, typographyGroups, textGroups, animations);
      const project = await exportProject(currentProjectId);
      downloadProject(project);
      success('Project exported');
    } catch (err) {
      error('Export failed: ' + String(err));
    }
  }, [currentProjectId, screens, screenGroups, typographies, typographyGroups, languages, texts, textGroups, animations, images, fonts, saveProjectData, exportProject, success, error]);

  const handleImportProject = () => {
    fileInputRef.current?.click();
  };

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await loadProjectFromFile(file);
      const id = await importProject(project, project.name);
      const cfg = await getProjectConfig(id);
      if (cfg) {
        const { data, images: imgs, fonts: fnts } = await loadProjectData(id);
        setScreens(data.screens as Screen[], data.screenGroups, data.typographies, data.languages, data.texts, data.typographyGroups, data.textGroups, data.animations);
        setCanvasSize(cfg.display.width, cfg.display.height);
        importResources({ images: imgs, fonts: fnts });
        if (data.logicGraphs) {
          useLogicEditorStore.getState().setGraphs(data.logicGraphs);
        }
        const fontRes = fnts.find(f => f.cFontName === cfg.lvglConfig.defaultFont);
        setDefaultFontSize(parseFontSize(cfg.lvglConfig.defaultFont, fontRes?.sizes, cfg.lvglConfig.defaultFontSize));
        openProject(id);
        setProjectName(cfg.name);
      }
      success(`Project "${project.name}" imported successfully`);
    } catch (err) {
      error('Import failed: ' + String(err));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNewProjectClick = useCallback(async () => {
    if (await modal.confirm('Creating a new project will return to the project list. The current project will be saved automatically. Continue?')) {
      // Save current project first
      if (currentProjectId) {
        const logicGraphs = useLogicEditorStore.getState().graphs;
        await saveProjectData(currentProjectId, screens, logicGraphs, images, fonts, screenGroups, typographies, languages, texts, typographyGroups, textGroups, animations);
      }
      goToProjectList();
    }
  }, [currentProjectId, screens, screenGroups, typographies, typographyGroups, languages, texts, textGroups, animations, images, fonts, saveProjectData, goToProjectList]);

  const handleBackToList = useCallback(async () => {
    if (!(await modal.confirm('Return to the project list? The current project will be saved automatically.'))) {
      return;
    }
    // Save current project first
    if (currentProjectId) {
      try {
        const logicGraphs = useLogicEditorStore.getState().graphs;
        await saveProjectData(currentProjectId, screens, logicGraphs, images, fonts, screenGroups, typographies, languages, texts, typographyGroups, textGroups, animations);
      } catch {
        // ignore
      }
    }
    goToProjectList();
  }, [currentProjectId, screens, screenGroups, typographies, typographyGroups, languages, texts, textGroups, animations, images, fonts, saveProjectData, goToProjectList]);

  // Listen for keyboard shortcut events
  useEffect(() => {
    const handleToggleHelp = () => setShowHelpPanel(prev => !prev);
    const handleSaveProjectEvt = () => handleSaveProject();
    const handleNewProject = () => handleNewProjectClick();

    window.addEventListener('toggle-help-panel', handleToggleHelp);
    window.addEventListener('save-project', handleSaveProjectEvt);
    window.addEventListener('new-project', handleNewProject);

    return () => {
      window.removeEventListener('toggle-help-panel', handleToggleHelp);
      window.removeEventListener('save-project', handleSaveProjectEvt);
      window.removeEventListener('new-project', handleNewProject);
    };
  }, [handleSaveProject, handleNewProjectClick]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'new-component') {
      setActiveDragType(active.data.current.componentType);
    }
  }, []);

  // Track last mouse position for accurate drop placement
  const lastMousePos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragType(null);

    // Check if dropped on canvas
    if (over?.id === 'canvas-drop-area' && active.data.current?.type === 'new-component') {
      const componentType = active.data.current.componentType;

      const canvasElement = document.querySelector('.canvas');
      if (canvasElement) {
        const rect = canvasElement.getBoundingClientRect();
        const currentCanvas = useEditorStore.getState().canvas;

        // Use tracked mouse position — immune to CSS transform issues with dnd-kit delta
        const dropX = (lastMousePos.current.x - rect.left) / currentCanvas.zoom;
        const dropY = (lastMousePos.current.y - rect.top) / currentCanvas.zoom;

        // Find the deepest container component under the drop point
        const state = useEditorStore.getState();
        const currentScreen = state.screens.find(p => p.id === state.currentScreenId);
        const components = currentScreen?.components || [];

        type HitResult = { comp: LvglComponent; absX: number; absY: number } | null;

        const findDeepestContainer = (
          comps: LvglComponent[],
          offsetX: number,
          offsetY: number,
        ): HitResult => {
          // Iterate in reverse so top-most (last rendered) components are checked first
          for (let i = comps.length - 1; i >= 0; i--) {
            const comp = comps[i];
            const absX = comp.x + offsetX;
            const absY = comp.y + offsetY;

            if (
              dropX >= absX && dropX <= absX + comp.width &&
              dropY >= absY && dropY <= absY + comp.height
            ) {
              const def = getComponentDefinition(comp.type);
              if (def?.isContainer) {
                // Check children first for a deeper container
                const deeper = findDeepestContainer(comp.children, absX, absY);
                return deeper || { comp, absX, absY };
              }
            }
          }
          return null;
        };

        const container = findDeepestContainer(components, 0, 0);

        // Calculate position relative to the container (or canvas root)
        let x = dropX;
        let y = dropY;
        let parentId: string | null = null;

        if (container) {
          x = dropX - container.absX;
          y = dropY - container.absY;
          parentId = container.comp.id;
        }

        // Center the component on the drop point
        const definition = getComponentDefinition(componentType);
        if (definition) {
          x -= definition.defaultWidth / 2;
          y -= definition.defaultHeight / 2;
        }

        // Clamp within bounds
        if (container) {
          x = Math.max(0, Math.min(x, container.comp.width - (definition?.defaultWidth || 50)));
          y = Math.max(0, Math.min(y, container.comp.height - (definition?.defaultHeight || 50)));
        } else {
          x = Math.max(0, Math.min(x, currentCanvas.width - 50));
          y = Math.max(0, Math.min(y, currentCanvas.height - 50));
        }

        addComponent(componentType, x, y, parentId);
      }
    }
  }, [addComponent]);

  // Render drag overlay
  const renderDragOverlay = () => {
    if (!activeDragType) return null;

    const definition = getComponentDefinition(activeDragType);
    if (!definition) return null;

    return (
      <div className="drag-overlay-item">
        <span className="drag-overlay-icon">{definition.icon}</span>
        <span className="drag-overlay-name">{definition.name}</span>
      </div>
    );
  };

  // Render main content based on active tab
  const renderMainContent = () => {
    switch (effectiveTab) {
      case 'design':
        return (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="app-body">
              <div className="left-panel">
                <ComponentPanel />
                <HierarchyPanel />
                <ScreenManager />
                <AnimationPanel />
              </div>
              <div className="canvas-area">
                <AlignToolbar />
                <Canvas />
                <ScreenTabs />
              </div>
              <div className="right-panel">
                <PropertyEditor />
              </div>
            </div>
            <DragOverlay dropAnimation={null}>
              {renderDragOverlay()}
            </DragOverlay>
          </DndContext>
        );

      case 'image':
      case 'text':
      case 'icon':
        return (
          <div className="app-body full-panel">
            <ResourceWorkspace kind={effectiveTab} />
          </div>
        );

      case 'logic':
        return (
          <div className="app-body full-panel">
            <LogicEditor />
          </div>
        );

      case 'protocol':
        return (
          <div className="app-body full-panel">
            <ProtocolPanel />
          </div>
        );

      case 'deploy':
        return (
          <div className="app-body full-panel">
            <DeployPanel />
          </div>
        );

      case 'code':
        return (
          <div className="app-body full-panel">
            <CodePreview />
          </div>
        );

      case 'preview':
        return (
          <div className="app-body full-panel">
            {canChoosePreviewRung && (
              <div className="preview-sub-tabs">
                <button
                  className={`preview-sub-tab ${resolvedPreviewMode === 'prototype' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('prototype')}
                >
                  📱 Prototype
                </button>
                <button
                  className={`preview-sub-tab ${resolvedPreviewMode === 'simulator' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('simulator')}
                >
                  🖥️ Simulator
                </button>
                {isEmulatorEnabled && (
                  <button
                    className={`preview-sub-tab ${resolvedPreviewMode === 'emulator' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('emulator')}
                  >
                    🎛️ Emulator
                  </button>
                )}
              </div>
            )}
            <div className="preview-sub-content">
              {resolvedPreviewMode === 'prototype'
                ? <PreviewPanel />
                : resolvedPreviewMode === 'simulator'
                  ? <WasmPreview />
                  : <Emulator />}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app">
      <div className="app-header">
        <DesktopMenuBar
          projectName={projectName}
          activeTab={effectiveTab}
          onNewProject={handleNewProjectClick}
          onSaveProject={handleSaveProject}
          onExportProject={handleExportProject}
          onImportProject={handleImportProject}
          onUndo={() => useEditorStore.getState().undo()}
          onRedo={() => useEditorStore.getState().redo()}
          onSelectTab={setActiveTab}
          onOpenSettings={() => setShowProjectSettings(true)}
          onOpenHelp={() => setShowHelpPanel(true)}
          onOpenAbout={() => setShowAboutDialog(true)}
          onExitProject={handleBackToList}
        />

        <div className="app-command-bar">
          {/* Main tabs */}
          <div className="app-tabs">
            {TAB_DEFS.filter(tab => !tab.factoryOnly || factoryDevMode).map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${effectiveTab === tab.id ? 'active' : ''}`}
                title={tab.description}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-btn-icon">{tab.icon}</span>
                <span className="tab-btn-label">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="app-toolbar">
            <ToolbarButton icon="💾" label="Save" onClick={handleSaveProject} shortcut="Ctrl+S" />
            <ToolbarButton icon="📤" label="Export" onClick={handleExportProject} />
            <ToolbarButton icon="📥" label="Import" onClick={handleImportProject} />
            <ToolbarButton icon="🚪" label="Exit Project" onClick={handleBackToList} />
            <div className="toolbar-divider" />
            <ToolbarButton icon="↩️" label="Undo" onClick={() => useEditorStore.getState().undo()} shortcut="Ctrl+Z" />
            <ToolbarButton icon="↪️" label="Redo" onClick={() => useEditorStore.getState().redo()} shortcut="Ctrl+Y" />
            <div className="toolbar-divider" />
            <ToolbarButton
              icon="ℹ️"
              label="Info"
              onClick={() => setShowHardwareInfo(true)}
            />
            <ToolbarButton
              icon="⚙️"
              label="Settings"
              onClick={() => setShowProjectSettings(true)}
            />
            {/* Theme switching is parked for now; <ThemeSelector /> goes back here. */}
            <div className="toolbar-divider" />
            <ToolbarButton
              icon="❓"
              label="Help"
              onClick={() => setShowHelpPanel(true)}
              shortcut="F1"
            />
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.lvgl.json"
          onChange={handleFileLoad}
          style={{ display: 'none' }}
        />
      </div>

      {renderMainContent()}

      <DockPanel />

      <StatusBar />

      {/* Help Panel */}
      <HelpPanel isOpen={showHelpPanel} onClose={() => setShowHelpPanel(false)} />

      {/* About */}
      {showAboutDialog && <AboutDialog onClose={() => setShowAboutDialog(false)} />}

      {/* Hardware information — read-only counterpart to Project Settings */}
      {showHardwareInfo && (
        <HardwareInfoDialog onClose={() => setShowHardwareInfo(false)} />
      )}

      {/* Project Settings */}
      {showProjectSettings && <ProjectSettings />}

      {/* Toast notifications */}
      <Toast messages={messages} onRemove={removeToast} />

      {/* Global modal dialogs */}
      <Modal />
    </div>
  );
};

// Toolbar button component
interface ToolbarButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  shortcut?: string;
}

// Icon-only: the label survives as the tooltip and the accessible name.
const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, label, onClick, disabled, active, shortcut }) => (
  <button
    className={`toolbar-button ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={shortcut ? `${label} (${shortcut})` : label}
    aria-label={label}
  >
    <span className="toolbar-icon">{icon}</span>
  </button>
);

export default App;
