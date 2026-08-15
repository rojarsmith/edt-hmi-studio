// Properties Panel - settings for the selected logic graph

import React, { useCallback, useState } from 'react';
import { useLogicEditorStore } from './logicEditorStore';
import { useEditorStore } from '../../store/editorStore';
import PanelChevron from './PanelChevron';
import './PropertiesPanel.css';

const PropertiesPanel: React.FC = () => {
  const { getCurrentGraph, updateGraph } = useLogicEditorStore();
  const { screens } = useEditorStore();
  const [expanded, setExpanded] = useState(true);

  const graph = getCurrentGraph();
  // null or absent means the graph is active on every screen
  const onAllScreens = !graph?.activeScreenIds;

  const handleAllScreensToggle = useCallback(() => {
    if (!graph) return;
    // Leaving "all" starts from an explicit list with every screen still
    // checked, so unchecking one screen is one click, not a rebuild.
    updateGraph(graph.id, {
      activeScreenIds: onAllScreens ? screens.map(s => s.id) : null,
    });
  }, [graph, onAllScreens, screens, updateGraph]);

  const handleScreenToggle = useCallback(
    (screenId: string) => {
      if (!graph || !graph.activeScreenIds) return;
      const current = graph.activeScreenIds;
      const next = current.includes(screenId)
        ? current.filter(id => id !== screenId)
        : [...current, screenId];
      updateGraph(graph.id, { activeScreenIds: next });
    },
    [graph, updateGraph]
  );

  const activeCount = graph?.activeScreenIds
    ? screens.filter(s => graph.activeScreenIds!.includes(s.id)).length
    : screens.length;

  return (
    <div className="props-panel">
      <div
        className="props-panel-header"
        onClick={() => setExpanded(prev => !prev)}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <PanelChevron open={expanded} className="props-panel-toggle" />
        <span className="props-panel-title">Properties</span>
      </div>

      {expanded && (
        <div className="props-panel-body">
          {!graph ? (
            <div className="props-panel-empty">Select a logic graph</div>
          ) : (
            <>
              <div className="props-graph-name" title={graph.name}>
                {graph.name}
              </div>

              <div className="props-section">
                <div className="props-section-title">Active on Screens</div>
                <label className="props-check-row">
                  <input
                    type="checkbox"
                    checked={onAllScreens}
                    onChange={handleAllScreensToggle}
                  />
                  <span>All screens</span>
                </label>

                {!onAllScreens && (
                  <div className="props-screen-list">
                    {screens.map(screen => (
                      <label key={screen.id} className="props-check-row">
                        <input
                          type="checkbox"
                          checked={graph.activeScreenIds!.includes(screen.id)}
                          onChange={() => handleScreenToggle(screen.id)}
                        />
                        <span title={screen.name}>{screen.name}</span>
                      </label>
                    ))}
                  </div>
                )}

                {!onAllScreens && activeCount === 0 && (
                  <div className="props-warning">
                    This graph is active on no screen
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PropertiesPanel;
