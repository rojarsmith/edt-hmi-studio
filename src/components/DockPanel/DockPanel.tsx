// The bottom dock: a collapsible, resizable strip of tool panes sitting between
// the workspace and the status bar, after Visual Studio's bottom tool windows.
//
// Visibility is decided by the caller and passed in as `visible`; expansion,
// height and which pane is in front belong to dockStore.
// See docs/bottom-dock-panel.md.

import React, { useCallback, useState } from 'react';
import PanelChevron from '../LogicEditor/PanelChevron';
import { useWorkStore } from '../../store/workStore';
import {
  useDockStore,
  DOCK_MIN_HEIGHT,
  DOCK_MIN_WORKSPACE,
  type DockPaneId,
} from '../../store/dockStore';
import DeployLogPane from './DeployLogPane';
import EmulatorOutputPane from './EmulatorOutputPane';
import WorkPane from './WorkPane';
import './DockPanel.css';

const PANES: { id: DockPaneId; label: string }[] = [
  // Work first: it is the one pane that says something about every operation,
  // and the two log panes are candidates for factory mode later.
  { id: 'work', label: 'Work' },
  // Between Work and the firmware log, which is where it belongs in the
  // ladder: the Emulator compiles before Deploy does.
  { id: 'output', label: 'Build Output' },
  { id: 'build', label: 'Build Firmware' },
  { id: 'flash', label: 'Flash & Reset' },
];

interface DockPanelProps {
  /**
   * Whether to offer the Emulator's Build Output pane. Unlike the others it is
   * tab-specific — it describes what the Preview tab just did, and on the
   * Design tab it would be a log for something not on screen. The caller knows
   * both facts that decide it: which tab is open, and whether the Emulator was
   * built into this app at all.
   */
  showBuildOutput?: boolean;
}

/**
 * The rest of the dock is available on every tab: Work lists operations that
 * outlive the tab they were started from, so hiding it somewhere would hide the
 * one view that is never tab-specific. Expansion is the author's choice alone.
 */
const DockPanel: React.FC<DockPanelProps> = ({ showBuildOutput = false }) => {
  const expanded = useDockStore((state) => state.expanded);
  const activePane = useDockStore((state) => state.activePane);
  const height = useDockStore((state) => state.height);
  const toggleExpanded = useDockStore((state) => state.toggleExpanded);
  const setActivePane = useDockStore((state) => state.setActivePane);
  const setHeight = useDockStore((state) => state.setHeight);
  // Anything unfinished, not just a firmware operation: the lamp answers "is
  // something still going?", and an Emulator build left the answer wrong until
  // it became a Work item. Two primitive selectors rather than a filtered
  // array, which would be a new object on every store write.
  const runningCount = useWorkStore((state) =>
    state.items.reduce((count, item) => count + (item.status === 'running' ? 1 : 0), 0),
  );
  const firstRunningName = useWorkStore(
    (state) => state.items.find((item) => item.status === 'running')?.name ?? null,
  );

  const [resizing, setResizing] = useState(false);

  const panes = PANES.filter((pane) => pane.id !== 'output' || showBuildOutput);
  // Derived rather than synced, the way App resolves its own factory-only tabs:
  // leaving Preview while Build Output is in front should immediately read as
  // Work, without a write that would then have to be undone on the way back.
  const visiblePane: DockPaneId =
    activePane === 'output' && !showBuildOutput ? 'work' : activePane;

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

  const runningLabel = runningCount === 0
    ? null
    : runningCount > 1
      ? `${runningCount} operations are running`
      : `${firstRunningName} is running`;

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
        {panes.map((pane) => (
          <button
            key={pane.id}
            type="button"
            role="tab"
            aria-selected={visiblePane === pane.id}
            className={`dock-tab ${visiblePane === pane.id ? 'active' : ''}`}
            onClick={() => setActivePane(pane.id)}
          >
            {pane.label}
            {/* On the Work tab itself rather than off at the strip's end: the
                lamp is about what Work lists, and it reads as belonging to the
                tab that would answer it. */}
            {pane.id === 'work' && runningLabel && (
              <span
                className="dock-running-lamp"
                role="status"
                aria-label={runningLabel}
                title={runningLabel}
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
          {visiblePane === 'work'
            ? <WorkPane />
            : visiblePane === 'output'
              ? <EmulatorOutputPane />
              : <DeployLogPane pane={visiblePane} />}
        </div>
      )}
    </div>
  );
};

export default DockPanel;
