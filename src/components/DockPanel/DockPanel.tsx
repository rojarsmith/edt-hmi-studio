// The bottom dock: a collapsible, resizable strip of tool panes sitting between
// the workspace and the status bar, after Visual Studio's bottom tool windows.
//
// Visibility is decided by the caller and passed in as `visible`; expansion,
// height and which pane is in front belong to dockStore.
// See docs/bottom-dock-panel.md.

import React, { useCallback, useState } from 'react';
import PanelChevron from '../LogicEditor/PanelChevron';
import { useDeployStore } from '../../store/deployStore';
import {
  useDockStore,
  DOCK_MIN_HEIGHT,
  DOCK_MIN_WORKSPACE,
  type DockPaneId,
} from '../../store/dockStore';
import DeployLogPane from './DeployLogPane';
import './DockPanel.css';

const PANES: { id: DockPaneId; label: string }[] = [
  { id: 'build', label: 'Build Firmware' },
  { id: 'flash', label: 'Flash & Reset' },
];

interface DockPanelProps {
  /** False keeps the dock out of the layout entirely, height and all. */
  visible: boolean;
}

const DockPanel: React.FC<DockPanelProps> = ({ visible }) => {
  const expanded = useDockStore((state) => state.expanded);
  const activePane = useDockStore((state) => state.activePane);
  const height = useDockStore((state) => state.height);
  const toggleExpanded = useDockStore((state) => state.toggleExpanded);
  const setActivePane = useDockStore((state) => state.setActivePane);
  const setHeight = useDockStore((state) => state.setHeight);
  const busy = useDeployStore((state) => state.busy);

  const [resizing, setResizing] = useState(false);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = height;
      // The workspace and the dock share the band between the top of .app-body
      // and the status bar, so measure that band rather than the window: the
      // header and the status bar are not the dock's to spend.
      const workspace = document.querySelector('.app-body');
      const statusBar = document.querySelector('.status-bar');
      const available = workspace && statusBar
        ? statusBar.getBoundingClientRect().top - workspace.getBoundingClientRect().top
        : window.innerHeight;
      const maxHeight = Math.max(DOCK_MIN_HEIGHT, available - DOCK_MIN_WORKSPACE);
      setResizing(true);

      const onMove = (moveEvent: PointerEvent) => {
        setHeight(
          Math.min(maxHeight, Math.max(DOCK_MIN_HEIGHT, startHeight + startY - moveEvent.clientY)),
        );
      };
      const onUp = () => {
        setResizing(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [height, setHeight],
  );

  const busyPane: DockPaneId | null =
    busy === 'building' ? 'build' : busy === 'flashing' ? 'flash' : null;

  // Three states, not two. The strip is always in the layout, so the workspace
  // never jumps by its height when a tab changes; what varies is whether it
  // carries anything. Inert is the strip with no panes and a dead chevron.
  const open = visible && expanded;

  return (
    <div
      className={`dock-panel ${visible ? (expanded ? 'expanded' : 'collapsed') : 'inert'}`}
      style={open ? { height } : undefined}
    >
      {open && (
        <div
          className={`dock-grip ${resizing ? 'resizing' : ''}`}
          onPointerDown={handleResizeStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the panel"
        />
      )}

      <div className="dock-tabs" role={visible ? 'tablist' : undefined}>
        {visible && PANES.map((pane) => (
          <button
            key={pane.id}
            type="button"
            role="tab"
            aria-selected={activePane === pane.id}
            className={`dock-tab ${activePane === pane.id ? 'active' : ''}`}
            onClick={() => setActivePane(pane.id)}
          >
            {busyPane === pane.id && <span className="dock-tab-busy" aria-hidden="true" />}
            {pane.label}
          </button>
        ))}

        <div className="dock-tabs-end">
          <button
            type="button"
            className="dock-toggle"
            onClick={toggleExpanded}
            disabled={!visible}
            aria-expanded={open}
            title={
              visible
                ? expanded ? 'Collapse the panel' : 'Expand the panel'
                : 'Open the Deploy tab to use this panel'
            }
          >
            <PanelChevron open={open} className="dock-chevron" />
          </button>
        </div>
      </div>

      {open && (
        <div className="dock-body" role="tabpanel">
          <DeployLogPane pane={activePane} />
        </div>
      )}
    </div>
  );
};

export default DockPanel;
