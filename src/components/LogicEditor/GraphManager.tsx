// Logic Graph Manager - collapsible graph list below the node palette

import React, { useCallback, useMemo, useState } from 'react';
import { useLogicEditorStore } from './logicEditorStore';
import { modal } from '../Modal';
import './GraphManager.css';

// Prompt for a new graph name, suggesting one no existing graph uses.
// Two graphs with the same name are indistinguishable in the list, so a
// duplicate is rejected and the prompt reopens with the rejected name.
export async function promptCreateGraph(
  graphs: { name: string }[],
  createGraph: (name: string) => string
): Promise<string | null> {
  const taken = new Set(graphs.map(graph => graph.name));
  let suggestion = 'New Logic Graph';
  for (let index = 2; taken.has(suggestion); index++) suggestion = `New Logic Graph ${index}`;

  for (;;) {
    const name = (await modal.prompt('Enter a logic graph name:', suggestion))?.trim();
    if (!name) return null;
    if (!taken.has(name)) return createGraph(name);
    await modal.alert(`A logic graph named "${name}" already exists.`);
    suggestion = name;
  }
}

const GraphManager: React.FC = () => {
  const { graphs, currentGraphId, createGraph, deleteGraph, setCurrentGraph } =
    useLogicEditorStore();
  const [expanded, setExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const visibleGraphs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return graphs;
    return graphs.filter(g => g.name.toLowerCase().includes(query));
  }, [graphs, searchQuery]);

  const handleCreate = useCallback(async () => {
    await promptCreateGraph(graphs, createGraph);
  }, [graphs, createGraph]);

  const handleDelete = useCallback(
    async (graphId: string, name: string) => {
      if (await modal.confirm(`Delete logic graph "${name}"?`)) {
        deleteGraph(graphId);
      }
    },
    [deleteGraph]
  );

  return (
    <div className="graph-manager">
      <div
        className="graph-manager-header"
        onClick={() => setExpanded(prev => !prev)}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <span className="graph-manager-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="graph-manager-title">Logic Graphs</span>
        <span className="graph-manager-count">{graphs.length}</span>
        <button
          className="graph-manager-add"
          title="New logic graph"
          onClick={e => {
            e.stopPropagation();
            handleCreate();
          }}
        >
          ＋
        </button>
      </div>

      {expanded && (
        <>
          <div className="graph-manager-search">
            <input
              type="text"
              placeholder="Search graphs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="graph-manager-clear-search"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          <div className="graph-manager-list">
            {visibleGraphs.length === 0 ? (
              <div className="graph-manager-empty">
                {graphs.length === 0 ? 'No logic graphs yet' : 'No matching graphs'}
              </div>
            ) : (
              visibleGraphs.map(g => (
                <div
                  key={g.id}
                  className={`graph-row ${g.id === currentGraphId ? 'active' : ''}`}
                  onClick={() => setCurrentGraph(g.id)}
                  title={g.name}
                >
                  <span className="graph-row-name">{g.name}</span>
                  <button
                    className="graph-row-delete"
                    title="Delete logic graph"
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(g.id, g.name);
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default GraphManager;
