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
import type { Page } from '../../types';
import type { BoardId } from '../../types/hmi';
import './ProjectListPage.css';

const ProjectListPage: React.FC = () => {
  const { projects, loading, init, createProject, deleteProject, importProject, loadProjectData, getProjectConfig } = useProjectStore();
  const { openProject } = useAppStore();
  const { setPages, setCanvasSize } = useEditorStore();
  const { importResources } = useResourceStore();

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [migrationChecked, setMigrationChecked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize store
  useEffect(() => {
    init();
  }, [init]);

  // Check for legacy localStorage data migration
  useEffect(() => {
    if (migrationChecked) return;
    setMigrationChecked(true);

    const autoSaved = loadAutoSavedProject();
    if (autoSaved && autoSaved.pages && autoSaved.pages.length > 0) {
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
      setPages(data.pages as Page[]);
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

  const handleCreate = async (name: string, boardId: BoardId, display: DisplayConfig, lvglConfig: LvglConfig) => {
    try {
      const id = await createProject(name, boardId, display, lvglConfig);
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

  return (
    <div className="project-list-page">
      <div className="plp-header">
        <div className="plp-logo">
          <span className="plp-logo-icon">📐</span>
          <span className="plp-logo-text">EDT GUI Studio</span>
        </div>
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
    </div>
  );
};

export default ProjectListPage;
