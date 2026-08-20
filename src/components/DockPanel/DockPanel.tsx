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
import WorkPane from './WorkPane';
import './DockPanel.css';

const PANES: { id: DockPaneId; label: string }[] = [
  // Work first: it is the one pane that says something about every operation,
  // and the two log panes are candidates for factory mode later.
  { id: 'work', label: 'Work' },
  { id: 'build', label: 'Build Firmware' },
  { id: 'flash', label: 'Flash & Reset' },
];

/**
 * The dock is available on every tab: Work lists operations that outlive the
 * tab they were started from, so hiding it somewhere would hide the one view
 * that is never tab-specific. Expansion is the author's choice alone.
 */
const DockPanel: React.FC = () => {
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

  const runningName = busy === 'building'
    ? 'Build Firmware'
    : busy === 'flashing' ? 'Flash & Reset' : null;

  return (
    <div
      className={`dock-panel ${expanded ? 'expanded' : 'collapsed'}`}
      style={expanded ? { height } : undefined}
    >
      {expanded && (
        <div
          className={`dock-grip ${resizing ? 'resizing' : ''}`}
          onPointerDown={handleResizeStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the panel"
        />
      )}

      <div className="dock-tabs" role="tablist">
        {PANES.map((pane) => (
          <button
            key={pane.id}
            type="button"
            role="tab"
            aria-selected={activePane === pane.id}
            className={`dock-tab ${activePane === pane.id ? 'active' : ''}`}
            onClick={() => setActivePane(pane.id)}
          >
            {pane.label}
            {/* On the Work tab itself rather than off at the strip's end: the
                lamp is about what Work lists, and it reads as belonging to the
                tab that would answer it. */}
            {pane.id === 'work' && runningName && (
              <span
                className="dock-running-lamp"
                role="status"
                aria-label={`${runningName} is running`}
                title={`${runningName} is running`}
              />
            )}
          </button>
        ))}

        <div className="dock-tabs-end">
          <button
            type="button"
            className="dock-toggle"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            title={expanded ? 'Collapse the panel' : 'Expand the panel'}
          >
            <PanelChevron open={expanded} className="dock-chevron" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="dock-body" role="tabpanel">
          {activePane === 'work'
            ? <WorkPane />
            : <DeployLogPane pane={activePane} />}
        </div>
      )}
    </div>
  );
};

export default DockPanel;
