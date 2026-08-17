import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { isDesktopHostAvailable } from '../../utils/desktopHost';
import { useAppStore } from '../../store/appStore';
import './DesktopMenuBar.css';

type EditorTab =
  | 'design'
  | 'image'
  | 'text'
  | 'icon'
  | 'logic'
  | 'protocol'
  | 'preview'
  | 'deploy'
  | 'code';

interface MenuAction {
  id: string;
  label: string;
  shortcut?: string;
  active?: boolean;
  /** Draw a separator line above this item. */
  dividerBefore?: boolean;
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
  onNewProject: () => void;
  onSaveProject: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectTab: (tab: EditorTab) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenAbout: () => void;
  onExitProject: () => void;
}

const DesktopMenuBar = ({
  projectName,
  activeTab,
  onNewProject,
  onSaveProject,
  onExportProject,
  onImportProject,
  onUndo,
  onRedo,
  onSelectTab,
  onOpenSettings,
  onOpenHelp,
  onOpenAbout,
  onExitProject,
}: DesktopMenuBarProps) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmExitDevMode, setConfirmExitDevMode] = useState(false);
  const factoryDevMode = useAppStore(s => s.factoryDevMode);
  const lockFactoryDevMode = useAppStore(s => s.lockFactoryDevMode);
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
          { id: 'save', label: 'Save Project', shortcut: 'Ctrl+S', onClick: onSaveProject },
          { id: 'export', label: 'Export Project', onClick: onExportProject },
          { id: 'import', label: 'Import Project', onClick: onImportProject },
          // Leaves the editor for the project list; kept apart from the file
          // operations above, like a classic File menu's exit entry.
          { id: 'exit', label: 'Exit Project', dividerBefore: true, onClick: onExitProject },
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
          { id: 'image', label: 'Image', active: activeTab === 'image', onClick: () => onSelectTab('image') },
          { id: 'text', label: 'Text', active: activeTab === 'text', onClick: () => onSelectTab('text') },
          // Icon is factory-dev-mode only, same as Code below — the library
          // has no no-code path to the panel yet; see docs/icon-library.md.
          ...(factoryDevMode
            ? [{ id: 'icon', label: 'Icon', active: activeTab === 'icon', onClick: () => onSelectTab('icon') }]
            : []),
          { id: 'logic', label: 'Logic', active: activeTab === 'logic', onClick: () => onSelectTab('logic') },
          { id: 'protocol', label: 'Protocol', active: activeTab === 'protocol', onClick: () => onSelectTab('protocol') },
          { id: 'preview', label: 'Preview', active: activeTab === 'preview', onClick: () => onSelectTab('preview') },
          { id: 'deploy', label: 'Deploy', active: activeTab === 'deploy', onClick: () => onSelectTab('deploy') },
          // Code is factory-dev-mode only, and sits after Deploy to match the
          // tab row — see docs/factory-dev-mode.md.
          ...(factoryDevMode
            ? [{ id: 'code', label: 'Code', active: activeTab === 'code', onClick: () => onSelectTab('code') }]
            : []),
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
      factoryDevMode,
      onExitProject,
      onExportProject,
      onImportProject,
      onNewProject,
      onOpenAbout,
      onOpenHelp,
      onOpenSettings,
      onRedo,
      onSaveProject,
      onSelectTab,
      onUndo,
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
                  <Fragment key={item.id}>
                    {item.dividerBefore && <div className="desktop-menu-separator" />}
                    <button
                      type="button"
                      className={`desktop-menu-item ${item.active ? 'active' : ''}`}
                      onClick={() => handleMenuAction(item)}
                    >
                      <span className="desktop-menu-item-label">{item.label}</span>
                      {item.shortcut && <span className="desktop-menu-shortcut">{item.shortcut}</span>}
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="desktop-menu-meta">
        <span className="desktop-menu-project">{projectName || 'EDT HMI Studio'}</span>
        {factoryDevMode && (
          <button
            type="button"
            className="desktop-menu-badge factory-dev"
            onClick={() => setConfirmExitDevMode(true)}
            title="Factory engineer development mode — click to leave"
          >
            Factory Mode
          </button>
        )}
        <span className="desktop-menu-badge">{hostMode}</span>
      </div>

      {confirmExitDevMode && (
        <div className="modal-global-overlay" onClick={() => setConfirmExitDevMode(false)}>
          <div className="modal-dialog exit-dev-mode-dialog" onClick={e => e.stopPropagation()}>
            <h4>Leave Factory Mode?</h4>
            <p>
              The editor returns to its normal state and anything this mode
              exposes is hidden again. Re-entering needs the access code.
            </p>
            <div className="modal-dialog-footer">
              <button
                className="modal-dialog-btn modal-btn-cancel"
                onClick={() => setConfirmExitDevMode(false)}
              >
                Cancel
              </button>
              <button
                className="modal-dialog-btn modal-btn-confirm"
                onClick={() => {
                  lockFactoryDevMode();
                  setConfirmExitDevMode(false);
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesktopMenuBar;
