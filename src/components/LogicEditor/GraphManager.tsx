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

// Resize limits: the panel keeps room for its own header and search,
// and the palette above keeps room to stay usable.
const MIN_PANEL_HEIGHT = 120;
const MIN_PALETTE_HEIGHT = 140;
const DEFAULT_PANEL_HEIGHT = 260;

const GraphManager: React.FC = () => {
  const { graphs, currentGraphId, createGraph, deleteGraph, setCurrentGraph } =
    useLogicEditorStore();
  const [expanded, setExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [height, setHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [resizing, setResizing] = useState(false);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height;
      const leftPanel = e.currentTarget.closest('.logic-left-panel');
      const maxHeight = leftPanel
        ? Math.max(MIN_PANEL_HEIGHT, leftPanel.clientHeight - MIN_PALETTE_HEIGHT)
        : startHeight;
      setResizing(true);

      const onMove = (ev: PointerEvent) => {
        setHeight(Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, startHeight + startY - ev.clientY)));
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
    [height]
  );

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
    <div className="graph-manager" style={expanded ? { height } : undefined}>
      {expanded && (
        <div
          className={`graph-manager-resizer ${resizing ? 'resizing' : ''}`}
          onPointerDown={handleResizeStart}
        />
      )}
      <div
        className="graph-manager-header"
        onClick={() => setExpanded(prev => !prev)}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <svg
          className={`graph-manager-toggle ${expanded ? 'open' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
