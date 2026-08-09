import { useEffect, useMemo, useRef, useState } from 'react';
import { isDesktopHostAvailable } from '../../utils/desktopHost';
import { useAppStore } from '../../store/appStore';
import './DesktopMenuBar.css';

type EditorTab = 'design' | 'logic' | 'communication' | 'code' | 'preview';

interface MenuAction {
  id: string;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}

interface MenuGroup {
  id: string;
  label: string;
  items: MenuAction[];
}

interface DesktopMenuBarProps {
  projectName: string;
  activeTab: EditorTab;
  showResourcePanel: boolean;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectTab: (tab: EditorTab) => void;
  onToggleResources: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenAbout: () => void;
}

const DesktopMenuBar = ({
  projectName,
  activeTab,
  showResourcePanel,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onExportProject,
  onImportProject,
  onUndo,
  onRedo,
  onSelectTab,
  onToggleResources,
  onOpenSettings,
  onOpenHelp,
  onOpenAbout,
}: DesktopMenuBarProps) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const factoryDevMode = useAppStore(s => s.factoryDevMode);
  const hostMode = isDesktopHostAvailable() ? 'Desktop' : 'Web';
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const menus = useMemo<MenuGroup[]>(
    () => [
      {
        id: 'file',
        label: 'File',
        items: [
          { id: 'new', label: 'New Project', shortcut: 'Ctrl+N', onClick: onNewProject },
          { id: 'open', label: 'Open Project', shortcut: 'Ctrl+O', onClick: onOpenProject },
          { id: 'save', label: 'Save Project', shortcut: 'Ctrl+S', onClick: onSaveProject },
          { id: 'export', label: 'Export Project', onClick: onExportProject },
          { id: 'import', label: 'Import Project', onClick: onImportProject },
        ] satisfies MenuAction[],
      },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', onClick: onUndo },
          { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', onClick: onRedo },
        ] satisfies MenuAction[],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { id: 'design', label: 'Design', active: activeTab === 'design', onClick: () => onSelectTab('design') },
          { id: 'logic', label: 'Logic', active: activeTab === 'logic', onClick: () => onSelectTab('logic') },
          { id: 'communication', label: 'Communication', active: activeTab === 'communication', onClick: () => onSelectTab('communication') },
          { id: 'code', label: 'Code', active: activeTab === 'code', onClick: () => onSelectTab('code') },
          { id: 'preview', label: 'Preview', active: activeTab === 'preview', onClick: () => onSelectTab('preview') },
          { id: 'resources', label: showResourcePanel ? 'Hide Resources' : 'Show Resources', active: showResourcePanel, onClick: onToggleResources },
          { id: 'settings', label: 'Project Settings', onClick: onOpenSettings },
        ] satisfies MenuAction[],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { id: 'shortcuts', label: 'Keyboard Shortcuts', shortcut: 'F1', onClick: onOpenHelp },
          // Deliberately menu-only: there is no toolbar button for About.
          { id: 'about', label: 'About', onClick: onOpenAbout },
        ] satisfies MenuAction[],
      },
    ],
    [
      activeTab,
      onExportProject,
      onImportProject,
      onNewProject,
      onOpenAbout,
      onOpenHelp,
      onOpenProject,
      onOpenSettings,
      onRedo,
      onSaveProject,
      onSelectTab,
      onToggleResources,
      onUndo,
      showResourcePanel,
    ],
  );

  const handleMenuAction = (action: MenuAction) => {
    setOpenMenuId(null);
    action.onClick();
  };

  return (
    <div className="desktop-menu-bar" ref={containerRef}>
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
                    className={`desktop-menu-item ${item.active ? 'active' : ''}`}
                    onClick={() => handleMenuAction(item)}
                  >
                    <span className="desktop-menu-item-label">{item.label}</span>
                    {item.shortcut && <span className="desktop-menu-shortcut">{item.shortcut}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="desktop-menu-meta">
        <span className="desktop-menu-project">{projectName || 'EDT GUI Studio'}</span>
        {factoryDevMode && (
          <span
            className="desktop-menu-badge factory-dev"
            title="原廠人員研發模式 — 重新啟動後失效"
          >
            原廠人員研發模式
          </span>
        )}
        <span className="desktop-menu-badge">{hostMode}</span>
      </div>
    </div>
  );
};

export default DesktopMenuBar;
