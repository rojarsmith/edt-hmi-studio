// Logic Editor - Main component with React Flow

import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  Node,
  NodeTypes,
  OnNodesChange,
  OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useLogicEditorStore } from './logicEditorStore';
import LogicNodeComponent from './LogicNode';
import NodePalette from './NodePalette';
import GraphManager, { promptCreateGraph } from './GraphManager';
import VariablePanel from './VariablePanel';
import NodeEditDialog from './NodeEditDialog';
import type { LogicNodeDefinition, LogicNode as LogicNodeType, LogicConnection as LogicConnectionType } from './types';
import { NODE_COLORS } from './nodeDefinitions';
import './LogicEditor.css';

// Custom node types
const nodeTypes: NodeTypes = {
  logicNode: LogicNodeComponent,
};

// Convert logic nodes to React Flow nodes
function toFlowNodes(nodes: LogicNodeType[], onDoubleClick: (id: string) => void): Node[] {
  return nodes.map(node => ({
    id: node.id,
    type: 'logicNode',
    position: node.position,
    data: {
      logicNode: node,
      onDoubleClick,
    } as Record<string, unknown>,
  }));
}

// Convert logic connections to React Flow edges
function toFlowEdges(connections: LogicConnectionType[]): Edge[] {
  return connections.map(conn => ({
    id: conn.id,
    source: conn.sourceNode,
    sourceHandle: conn.sourceOutput,
    target: conn.targetNode,
    targetHandle: conn.targetInput,
    type: 'smoothstep',
    animated: conn.type === 'execution',
    style: {
      stroke: conn.type === 'execution' ? '#ffffff' : '#888888',
      strokeWidth: conn.type === 'execution' ? 3 : 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: conn.type === 'execution' ? '#ffffff' : '#888888',
    },
  }));
}

// Inner component that uses React Flow hooks
const LogicEditorInner: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  const {
    getCurrentGraph,
    addNode,
    deleteNodes,
    updateNodePosition,
    addConnection,
    deleteConnection,
    selectedNodeIds,
    selectNodes,
    clearSelection,
    debugState,
    startDebug,
    stopDebug,
    stepDebug,
    graphs,
    createGraph,
  } = useLogicEditorStore();

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const currentGraph = getCurrentGraph();

  // Handle node double click for editing
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
  }, []);

  // Convert to React Flow format
  const flowNodes = useMemo(() => {
    if (!currentGraph) return [];
    return toFlowNodes(currentGraph.nodes, handleNodeDoubleClick);
  }, [currentGraph, handleNodeDoubleClick]);

  const flowEdges = useMemo(() => {
    if (!currentGraph) return [];
    return toFlowEdges(currentGraph.connections);
  }, [currentGraph]);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Sync with store when graph changes
  React.useEffect(() => {
    if (currentGraph) {
      setNodes(toFlowNodes(currentGraph.nodes, handleNodeDoubleClick));
      setEdges(toFlowEdges(currentGraph.connections));
    }
  }, [currentGraph, setNodes, setEdges, handleNodeDoubleClick]);

  // Handle node position change
  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    
    // Update store for position changes
    changes.forEach((change) => {
      if (change.type === 'position' && 'position' in change && change.position && !('dragging' in change && change.dragging)) {
        updateNodePosition(change.id, change.position.x, change.position.y);
      }
    });
  }, [onNodesChange, updateNodePosition]);

  // Handle connection
  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.sourceHandle && 
        connection.target && connection.targetHandle) {
      addConnection(
        connection.source,
        connection.sourceHandle,
        connection.target,
        connection.targetHandle
      );
    }
  }, [addConnection]);

  // Handle edge delete
  const handleEdgesChange: OnEdgesChange = useCallback((changes) => {
    onEdgesChange(changes);
    
    changes.forEach((change) => {
      if (change.type === 'remove') {
        deleteConnection(change.id);
      }
    });
  }, [onEdgesChange, deleteConnection]);

  // Handle node selection
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    selectNodes(selectedNodes.map(n => n.id));
  }, [selectNodes]);

  // Handle drop from palette
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const data = event.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const definition: LogicNodeDefinition = JSON.parse(data);
      
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(definition.type, definition.subType, position.x, position.y);
    } catch (e) {
      console.error('Failed to parse dropped node:', e);
    }
  }, [screenToFlowPosition, addNode]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedNodeIds.length > 0) {
        deleteNodes(selectedNodeIds);
      }
    }
    if (event.key === 'Escape') {
      clearSelection();
      setEditingNodeId(null);
    }
  }, [selectedNodeIds, deleteNodes, clearSelection]);

  // Create new graph
  const handleCreateGraph = useCallback(async () => {
    await promptCreateGraph(graphs, createGraph);
  }, [createGraph, graphs]);

  // Drag start handler for palette
  const handlePaletteDragStart = useCallback(() => {
    // Could add visual feedback here
  }, []);

  // Get node color for minimap
  const getNodeColor = useCallback((node: Node) => {
    const logicNode = (node.data as { logicNode?: LogicNodeType })?.logicNode;
    if (logicNode) {
      return NODE_COLORS[logicNode.type as keyof typeof NODE_COLORS] || '#666';
    }
    return '#666';
  }, []);

  return (
    <div className="logic-editor" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Left Panel - Node Palette + Graph Manager */}
      <div className="logic-left-panel">
        <NodePalette onDragStart={handlePaletteDragStart} />
        <GraphManager />
      </div>

      {/* Center - Flow Canvas */}
      <div 
        className="logic-canvas"
        ref={reactFlowWrapper}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {!currentGraph ? (
          <div className="no-graph-message">
            <h3>No Logic Graph Selected</h3>
            <p>Create or select a logic graph to start editing</p>
            <button onClick={handleCreateGraph}>+ Create Logic Graph</button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onSelectionChange={handleSelectionChange}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              type: 'smoothstep',
            }}
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
            <Controls />
            <MiniMap 
              nodeColor={getNodeColor}
              maskColor="rgba(0, 0, 0, 0.8)"
              style={{ background: '#1a1a1a' }}
            />

            {/* Debug Panel */}
            <Panel position="top-right" className="debug-panel">
              {debugState.isDebugging ? (
                <>
                  <button className="debug-btn stop" onClick={stopDebug}>
                    ⏹️ Stop
                  </button>
                  <button 
                    className="debug-btn step" 
                    onClick={stepDebug}
                    disabled={!debugState.currentNodeId}
                  >
                    ⏭️ Step
                  </button>
                  <span className="debug-status">
                    {debugState.isPaused ? '⏸️ Paused' : '▶️ Running'}
                  </span>
                </>
              ) : (
                <button className="debug-btn start" onClick={startDebug}>
                  🐛 Debug
                </button>
              )}
            </Panel>
          </ReactFlow>
        )}
      </div>

      {/* Right Panel - Variables */}
      <VariablePanel />

      {/* Node Edit Dialog */}
      {editingNodeId && (
        <NodeEditDialog
          nodeId={editingNodeId}
          onClose={() => setEditingNodeId(null)}
        />
      )}
    </div>
  );
};

// Main component with provider
const LogicEditor: React.FC = () => {
  return (
    <ReactFlowProvider>
      <LogicEditorInner />
    </ReactFlowProvider>
  );
};

export default LogicEditor;
