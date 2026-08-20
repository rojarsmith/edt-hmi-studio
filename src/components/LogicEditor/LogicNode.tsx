// Custom Logic Node Component for React Flow

import React, { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { LogicNode, LogicPort } from './types';
import type { Screen, LvglComponent } from '../../types';
import { NODE_COLORS } from './nodeDefinitions';
import { useLogicEditorStore } from './logicEditorStore';
import { useAppStore } from '../../store/appStore';
import { useEditorStore } from '../../store/editorStore';
import LackBadge from '../common/LackBadge';
import './LogicNode.css';

// Port type colors
const PORT_COLORS: Record<string, string> = {
  execution: '#ffffff',
  int: '#00bcd4',
  float: '#8bc34a',
  string: '#ff9800',
  bool: '#e91e63',
  any: '#9e9e9e',
};

interface LogicNodeData {
  logicNode: LogicNode;
  onDoubleClick?: (nodeId: string) => void;
}

// Design-side events with the Logic handler are what fire an Event Trigger.
// The node face lists them, because a trigger nothing calls reads exactly
// like one that works.
function collectLogicCallers(screens: Screen[], graphId: string): string[] {
  const callers: string[] = [];
  const walk = (components: LvglComponent[]) => {
    for (const component of components) {
      for (const event of component.events) {
        if (
          event.handlerType === 'logic'
          && (event.logicGraphIds ?? []).includes(graphId)
        ) {
          callers.push(
            `${component.name} (${event.eventType.replace('LV_EVENT_', '')})`
          );
        }
      }
      walk(component.children);
    }
  };
  for (const screen of screens) {
    walk(screen.components);
  }
  return callers;
}

const LogicNodeComponent: React.FC<NodeProps> = ({ 
  data, 
  selected,
}) => {
  const nodeData = data as unknown as LogicNodeData;
  const { logicNode, onDoubleClick } = nodeData;
  const { debugState, getCurrentGraph } = useLogicEditorStore();
  const factoryDevMode = useAppStore(s => s.factoryDevMode);
  const screens = useEditorStore(s => s.screens);

  const logicCallers =
    logicNode.subType === 'event_trigger'
      ? collectLogicCallers(screens, getCurrentGraph()?.id ?? '')
      : [];

  // The Event Object output is factory-dev-only: generated code still
  // discards the event (docs/logic-event-trigger.md), so in normal mode the
  // port only promises what the device cannot deliver. One already wired
  // stays visible either way - hiding it would strand a connection the
  // author can see nowhere and delete nohow.
  const isFactoryHiddenPort = (port: LogicPort): boolean => {
    if (factoryDevMode) return false;
    if (logicNode.subType !== 'event_trigger' || port.name !== 'Event Object') return false;
    const graph = getCurrentGraph();
    return !graph?.connections.some(
      c => c.sourceNode === logicNode.id && c.sourceOutput === port.id
    );
  };

  const nodeColor = NODE_COLORS[logicNode.type as keyof typeof NODE_COLORS] || '#607D8B';
  const isCurrentDebugNode = debugState.currentNodeId === logicNode.id;
  const hasBreakpoint = debugState.breakpoints.includes(logicNode.id);
  const isInExecutionPath = debugState.executionPath.includes(logicNode.id);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(logicNode.id);
  }, [logicNode.id, onDoubleClick]);

  // Get node definition icon
  const getNodeIcon = () => {
    switch (logicNode.subType) {
      case 'event_trigger': return '⚡';
      case 'timer_trigger': return '⏱️';
      case 'if_else': return '🔀';
      case 'switch': return '🔃';
      case 'compare': return '⚖️';
      case 'logic_op': return '🔗';
      case 'set_property': return '🎨';
      case 'navigate_page': return '📄';
      case 'show_hide': return '👁️';
      case 'set_text': return '📝';
      case 'set_value': return '🔢';
      case 'call_function': return '📞';
      case 'delay': return '⏳';
      case 'var_read': return '📖';
      case 'var_write': return '✏️';
      case 'tag_read': return '📥';
      case 'tag_write': return '📤';
      case 'math_op': return '🧮';
      case 'string_op': return '🔤';
      case 'get_property': return '🔍';
      case 'c_code_block': return '💻';
      default: return '📦';
    }
  };

  return (
    <div
      className={`logic-node ${selected ? 'selected' : ''} ${isCurrentDebugNode ? 'debug-current' : ''} ${isInExecutionPath ? 'debug-path' : ''}`}
      style={{ 
        borderColor: nodeColor,
        boxShadow: isCurrentDebugNode ? `0 0 10px ${nodeColor}` : undefined,
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Breakpoint indicator */}
      {hasBreakpoint && (
        <div className="breakpoint-indicator">🔴</div>
      )}

      {/* Node Header */}
      <div className="logic-node-header" style={{ backgroundColor: nodeColor }}>
        <span className="logic-node-icon">{getNodeIcon()}</span>
        <span className="logic-node-title">{logicNode.label}</span>
      </div>

      {/* Node Body */}
      <div className="logic-node-body">
        {/* Input Ports */}
        <div className="logic-node-inputs">
          {logicNode.inputs.map((input: LogicPort) => (
            <div key={input.id} className="logic-port input-port">
              <Handle
                type="target"
                position={Position.Left}
                id={input.id}
                className={`port-handle ${input.type === 'execution' ? 'execution-port' : 'data-port'}`}
                style={{
                  backgroundColor: PORT_COLORS[input.type] || PORT_COLORS.any,
                }}
              />
              <span className="port-label">{input.name}</span>
              {/* Show debug value */}
              {debugState.isDebugging && debugState.nodeValues[logicNode.id]?.[input.id] !== undefined && (
                <span className="port-value">
                  {JSON.stringify(debugState.nodeValues[logicNode.id][input.id])}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Output Ports */}
        <div className="logic-node-outputs">
          {logicNode.outputs.filter(o => !isFactoryHiddenPort(o)).map((output: LogicPort) => (
            <div key={output.id} className="logic-port output-port">
              <span className="port-label">{output.name}</span>
              {/* Show debug value */}
              {debugState.isDebugging && debugState.nodeValues[logicNode.id]?.[output.id] !== undefined && (
                <span className="port-value">
                  {JSON.stringify(debugState.nodeValues[logicNode.id][output.id])}
                </span>
              )}
              <Handle
                type="source"
                position={Position.Right}
                id={output.id}
                className={`port-handle ${output.type === 'execution' ? 'execution-port' : 'data-port'}`}
                style={{
                  backgroundColor: PORT_COLORS[output.type] || PORT_COLORS.any,
                }}
              />
            </div>
          ))}
        </div>

        {/* Node Parameters Preview */}
        {(Object.keys(logicNode.params).length > 0 || logicNode.subType === 'event_trigger') && (
          <div className="logic-node-params">
            {renderParamsPreview(logicNode, screens)}
            {logicNode.subType === 'event_trigger' && (
              logicCallers.length > 0 ? (
                <span className="param-preview">
                  Called by: {logicCallers.slice(0, 2).join(', ')}
                  {logicCallers.length > 2 ? ` +${logicCallers.length - 2} more` : ''}
                </span>
              ) : (
                <span className="param-preview param-preview-warning">
                  Not called by any event
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** The component a node's target names - by id, or by name in older graphs. */
function findComponent(screens: Screen[], target: unknown): LvglComponent | undefined {
  if (typeof target !== 'string' || !target.trim()) return undefined;

  const walk = (components: LvglComponent[]): LvglComponent | undefined => {
    for (const component of components) {
      if (component.id === target || component.name === target) return component;
      const child = walk(component.children);
      if (child) return child;
    }
    return undefined;
  };

  for (const screen of screens) {
    const found = walk(screen.components);
    if (found) return found;
  }
  return undefined;
}

/**
 * The component a node drives, named rather than identified: the params store
 * an id, and an id on the node face tells the reader nothing.
 *
 * A target that resolves to nothing wears a LACK badge, because nothing is
 * generated for it - naming a variable the project does not declare is what
 * used to stop the firmware compiling.
 */
function targetPreview(target: unknown, screens: Screen[]): React.ReactNode {
  const component = findComponent(screens, target);
  if (component) {
    return <span className="param-preview">Target: {component.name}</span>;
  }
  const named = typeof target === 'string' ? target.trim() : '';
  return (
    <span className="param-preview">
      Target: not set
      <LackBadge
        reason={named
          ? `The project has no component "${named}" — this node generates no code`
          : 'No component chosen — this node generates no code'}
      />
    </span>
  );
}

// Render a preview of node parameters
function renderParamsPreview(node: LogicNode, screens: Screen[]): React.ReactNode {
  const { params, subType } = node;

  switch (subType) {
    case 'event_trigger':
      // The binding decides the event type; the face shows the callers
      // instead (rendered by the component alongside this preview). A graph
      // saved before that still names a component here, and nothing is
      // registered against one the project has since lost.
      return params.targetComponent && !findComponent(screens, params.targetComponent)
        ? targetPreview(params.targetComponent, screens)
        : null;
    case 'timer_trigger':
      return <span className="param-preview">{params.mode === 'delay' ? 'Delay' : 'Interval'}: {params.duration}ms</span>;
    case 'compare':
      return <span className="param-preview">Operator: {params.operator}</span>;
    case 'logic_op':
      return <span className="param-preview">Operation: {params.operator}</span>;
    case 'math_op':
      return <span className="param-preview">Operation: {params.operator}</span>;
    case 'string_op':
      return <span className="param-preview">Operation: {params.operation}</span>;
    case 'delay':
      return <span className="param-preview">Delay: {params.duration}ms</span>;
    case 'show_hide':
      return (
        <>
          {targetPreview(params.targetComponent, screens)}
          <span className="param-preview">Action: {params.action}</span>
        </>
      );
    case 'set_property':
    case 'get_property':
      return (
        <>
          {targetPreview(params.targetComponent, screens)}
          <span className="param-preview">Property: {params.property || 'x'}</span>
        </>
      );
    case 'set_text':
    case 'set_value':
      return targetPreview(params.targetComponent, screens);
    case 'navigate_page': {
      // `targetPage` is the pre-rename spelling, still present in older graphs.
      const target = params.targetScreen || params.targetPage;
      const screen = target
        ? screens.find(candidate => candidate.id === target || candidate.name === target)
        : undefined;
      if (screen) {
        // Stored by id, so the name has to be looked up - the id itself tells
        // the reader nothing.
        return <span className="param-preview">Screen: {screen.name}</span>;
      }
      // Nothing is generated for a navigation with no screen behind it, so the
      // node says so rather than looking finished.
      return (
        <span className="param-preview">
          Screen: not set
          <LackBadge
            reason={target
              ? `The project has no screen "${target}" — this node generates no navigation`
              : 'No screen chosen — this node generates no navigation'}
          />
        </span>
      );
    }
    case 'call_function':
      return params.functionName ? <span className="param-preview">Function: {params.functionName}</span> : null;
    case 'modbus_holding_register':
      return <span className="param-preview">Holding Register: {params.address ?? 0}</span>;
    case 'tag_read':
    case 'tag_write':
      return <span className="param-preview">Tag: {params.tagName || '(not set)'}</span>;
    default:
      return null;
  }
}

export default memo(LogicNodeComponent);
