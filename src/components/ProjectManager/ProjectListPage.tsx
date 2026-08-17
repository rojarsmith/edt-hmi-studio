import React, { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { DisplayConfig, LvglConfig } from '../../store/projectStore';
import { useAppStore } from '../../store/appStore';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources';
import { useLogicEditorStore } from '../LogicEditor';
import { loadProjectFromFile, loadAutoSavedProject, clearAutoSave } from '../../resources/projectManager';
import { modal } from '../Modal';
import { toast } from '../Toast';
import ProjectCard from './ProjectCard';
import NewProjectDialog from './NewProjectDialog';
import AboutDialog from '../AboutDialog';
import type { Screen } from '../../types';
import type { BoardId, ProtocolId } from '../../types/hmi';
import tealLogo from '../../assets/logo-square-teal.svg';
import './ProjectListPage.css';

const ProjectListPage: React.FC = () => {
  const { projects, loading, init, createProject, deleteProject, importProject, loadProjectData, getProjectConfig } = useProjectStore();
  const { openProject } = useAppStore();
  const { setScreens, setCanvasSize } = useEditorStore();
  const { importResources } = useResourceStore();

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [migrationChecked, setMigrationChecked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Factory engineer development mode — entered through the About dialog,
  // left through the header badge. See docs/factory-dev-mode.md.
  const factoryDevMode = useAppStore(s => s.factoryDevMode);
  const lockFactoryDevMode = useAppStore(s => s.lockFactoryDevMode);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Initialize store
  useEffect(() => {
    init();
  }, [init]);

  // Check for legacy localStorage data migration
  useEffect(() => {
    if (migrationChecked) return;
    setMigrationChecked(true);

    const autoSaved = loadAutoSavedProject();
    if (autoSaved && autoSaved.screens && autoSaved.screens.length > 0) {
      modal.confirm('Legacy auto-save data was found. Import it as a new project?').then(async (yes) => {
        if (yes) {
          try {
            const id = await importProject(autoSaved, autoSaved.name || 'Migrated Project');
            clearAutoSave();
            toast.success('Legacy data imported as a new project');
            handleOpenProject(id);
          } catch (err) {
            toast.error('Import failed: ' + String(err));
          }
        } else {
          clearAutoSave();
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenProject = async (id: string) => {
    try {
      const config = await getProjectConfig(id);
      if (!config) { toast.error('Project not found'); return; }

      const { data, images, fonts } = await loadProjectData(id);
      // Everything setScreens is given, or it clears it: this is the path most
      // projects are opened by, and passing only the screens dropped the screen
      // groups, typographies, languages and texts on the way in.
      setScreens(
        data.screens as Screen[],
        data.screenGroups,
        data.typographies,
        data.languages,
        data.texts,
      );
      setCanvasSize(config.display.width, config.display.height);
      importResources({ images, fonts });
      if (data.logicGraphs) {
        useLogicEditorStore.getState().setGraphs(data.logicGraphs);
      }
      openProject(id);
    } catch (err) {
      toast.error('Failed to open project: ' + String(err));
    }
  };

  const handleCreate = async (
    name: string,
    boardId: BoardId,
    display: DisplayConfig,
    lvglConfig: LvglConfig,
    protocol: ProtocolId,
  ) => {
    try {
      const id = await createProject(name, boardId, display, lvglConfig, protocol);
      setShowNewDialog(false);
      await handleOpenProject(id);
    } catch (err) {
      console.error('Failed to create project:', err);
      toast.error('Failed to create project: ' + String(err));
    }
  };

  const handleDelete = async (id: string) => {
    const config = await getProjectConfig(id);
    const confirmed = await modal.confirm(`Delete project "${config?.name || id}"? This action cannot be undone.`);
    if (confirmed) {
      await deleteProject(id);
      toast.success('Project deleted');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await loadProjectFromFile(file);
      const id = await importProject(project, project.name);
      toast.success(`Project "${project.name}" imported successfully`);
      handleOpenProject(id);
    } catch (err) {
      toast.error('Import failed: ' + String(err));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filtered = search
    ? projects.filter(p => p.config.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  // Same menu markup and classes as DesktopMenuBar so the dropdowns render
  // identically; that stylesheet is loaded globally via App.tsx.
  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New Project', onClick: () => setShowNewDialog(true) },
        { id: 'import', label: 'Import Project', onClick: () => fileInputRef.current?.click() },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        // Deliberately menu-only, like the editor: About is also the entry
        // point to factory engineer development mode.
        { id: 'about', label: 'About', onClick: () => setShowAboutDialog(true) },
      ],
    },
  ];

  const handleLeaveFactoryMode = () => {
    modal
      .confirm('Leave Factory Mode? Re-entering needs the access code.')
      .then(yes => {
        if (yes) lockFactoryDevMode();
      });
  };

  return (
    <div className="project-list-screen">
      <div className="plp-header" ref={headerRef}>
        <img className="plp-logo-img" src={tealLogo} alt="EDT HMI Studio" />
        <div className="desktop-menu-list">
          {menus.map(menu => (
            <div key={menu.id} className="desktop-menu-group">
              <button
                type="button"
                className={`desktop-menu-trigger ${openMenuId === menu.id ? 'active' : ''}`}
                onClick={() => setOpenMenuId(current => (current === menu.id ? null : menu.id))}
              >
                {menu.label}
              </button>
              {openMenuId === menu.id && (
                <div className="desktop-menu-dropdown">
                  {menu.items.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className="desktop-menu-item"
                      onClick={() => {
                        setOpenMenuId(null);
                        item.onClick();
                      }}
                    >
                      <span className="desktop-menu-item-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {factoryDevMode && (
          <button
            type="button"
            className="desktop-menu-badge factory-dev plp-factory-badge"
            onClick={handleLeaveFactoryMode}
            title="Factory engineer development mode — click to leave"
          >
            Factory Mode
          </button>
        )}
      </div>

      <div className="plp-content">
        <div className="plp-toolbar">
          <input
            className="plp-search"
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="plp-actions">
            <button className="plp-btn plp-btn-primary" onClick={() => setShowNewDialog(true)}>
          + New Project
            </button>
            <button className="plp-btn" onClick={() => fileInputRef.current?.click()}>
              📂 Import Project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="plp-empty">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="plp-empty">
            {search ? 'No matching projects' : 'No projects yet. Click "New Project" to get started.'}
          </div>
        ) : (
          <div className="plp-grid">
            {filtered.map(item => (
              <ProjectCard
                key={item.config.id}
                item={item}
                onOpen={handleOpenProject}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.lvgl.json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      {showNewDialog && (
        <NewProjectDialog
          onClose={() => setShowNewDialog(false)}
          onCreate={handleCreate}
        />
      )}

      {showAboutDialog && <AboutDialog onClose={() => setShowAboutDialog(false)} />}
    </div>
  );
};

export default ProjectListPage;
