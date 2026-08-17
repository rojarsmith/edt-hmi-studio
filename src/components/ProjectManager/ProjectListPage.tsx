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
import DemoCard from './DemoCard';
import NewProjectDialog from './NewProjectDialog';
import AboutDialog from '../AboutDialog';
import { DEMO_PROJECTS, type DemoEntry } from '../../demos';
import type { ProjectFile } from '../../resources/types';
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
  const [activeTab, setActiveTab] = useState<'projects' | 'demos'>('projects');
  const [demoFiles, setDemoFiles] = useState<Record<string, ProjectFile>>({});
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

  // Load demo project files the first time the Demos tab is opened; they feed
  // the cards' schematic thumbnails.
  useEffect(() => {
    if (activeTab !== 'demos' || Object.keys(demoFiles).length > 0) return;
    let cancelled = false;
    Promise.all(
      DEMO_PROJECTS.map(async entry => [entry.id, await entry.load()] as const),
    )
      .then(pairs => {
        if (!cancelled) setDemoFiles(Object.fromEntries(pairs));
      })
      .catch(err => toast.error('Failed to load demo projects: ' + String(err)));
    return () => {
      cancelled = true;
    };
  }, [activeTab, demoFiles]);

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
    description: string,
  ) => {
    try {
      const id = await createProject(name, boardId, display, lvglConfig, protocol, description);
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

  const handleUseDemo = async (entry: DemoEntry) => {
    try {
      const file = demoFiles[entry.id] ?? (await entry.load());
      // Always a fresh copy: demos are immutable app assets, the import is
      // the user's own editable project. The name is asked first so the copy
      // does not land in the list under the demo's own title.
      const name = await modal.prompt('Name the new project', file.name);
      if (name === null) return;
      const id = await importProject(
        { ...file, description: file.description ?? entry.description },
        name.trim() || file.name,
      );
      toast.success(`Demo "${file.name}" added to your projects`);
      await handleOpenProject(id);
    } catch (err) {
      toast.error('Failed to open demo: ' + String(err));
    }
  };

  // Editing a demo also works on a copy — bundled assets cannot be written in
  // place. The copy keeps the demo's exact name; exporting it produces the
  // JSON that replaces the file under examples/ to update the shipped demo.
  const handleEditDemo = async (entry: DemoEntry) => {
    try {
      const file = demoFiles[entry.id] ?? (await entry.load());
      const id = await importProject(
        { ...file, description: file.description ?? entry.description },
        file.name,
      );
      toast.success('Editing a copy — export it to update the shipped demo');
      await handleOpenProject(id);
    } catch (err) {
      toast.error('Failed to open demo: ' + String(err));
    }
  };

  const filtered = search
    ? projects.filter(p =>
        (p.config.name + ' ' + (p.config.description ?? ''))
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : projects;

  // Factory-only test projects stay hidden until the mode is unlocked.
  const visibleDemos = DEMO_PROJECTS.filter(d => factoryDevMode || !d.factoryOnly).filter(
    d =>
      !search ||
      (d.name + ' ' + d.description).toLowerCase().includes(search.toLowerCase()),
  );

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
        <div className="plp-tabs">
          <button
            className={`plp-tab ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            My Projects
          </button>
          <button
            className={`plp-tab ${activeTab === 'demos' ? 'active' : ''}`}
            onClick={() => setActiveTab('demos')}
          >
            Demos
          </button>
        </div>

        <div className="plp-toolbar">
          <input
            className="plp-search"
            type="text"
            placeholder={activeTab === 'demos' ? 'Search demos...' : 'Search projects...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {activeTab === 'projects' && (
            <div className="plp-actions">
              <button className="plp-btn plp-btn-primary" onClick={() => setShowNewDialog(true)}>
            + New Project
              </button>
              <button className="plp-btn" onClick={() => fileInputRef.current?.click()}>
                📂 Import Project
              </button>
            </div>
          )}
        </div>

        <div className="plp-scroll">
          {activeTab === 'projects' ? (
            loading ? (
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
            )
          ) : visibleDemos.length === 0 ? (
            <div className="plp-empty">No matching demos</div>
          ) : (
            <div className="plp-grid">
              {visibleDemos.map(entry => (
                <DemoCard
                  key={entry.id}
                  entry={entry}
                  file={demoFiles[entry.id] ?? null}
                  onUse={handleUseDemo}
                  onEdit={handleEditDemo}
                />
              ))}
            </div>
          )}
        </div>
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
