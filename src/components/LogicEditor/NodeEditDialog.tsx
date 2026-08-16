// Node Edit Dialog - Edit node parameters

import React, { useState, useCallback, useEffect } from 'react';
import { useLogicEditorStore } from './logicEditorStore';
import { useEditorStore } from '../../store/editorStore';
import { useProjectModbusTags } from '../../hooks/useProjectModbusTags';
import { useAppStore } from '../../store/appStore';
import { NODE_COLORS } from './nodeDefinitions';
import type { CompareOperator, LogicOperator, MathOperator, StringOperation } from './types';
import type { ModbusRegisterTag } from '../../types/hmi';
import './NodeEditDialog.css';

interface NodeEditDialogProps {
  nodeId: string;
  onClose: () => void;
}

const COMPARE_OPERATORS: { value: CompareOperator; label: string }[] = [
  { value: '==', label: 'Equal (==)' },
  { value: '!=', label: 'Not Equal (!=)' },
  { value: '>', label: 'Greater Than (>)' },
  { value: '<', label: 'Less Than (<)' },
  { value: '>=', label: 'Greater Than or Equal (>=)' },
  { value: '<=', label: 'Less Than or Equal (<=)' },
];

const LOGIC_OPERATORS: { value: LogicOperator; label: string }[] = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
  { value: 'NOT', label: 'NOT' },
];

const MATH_OPERATORS: { value: MathOperator; label: string }[] = [
  { value: '+', label: 'Add (+)' },
  { value: '-', label: 'Subtract (-)' },
  { value: '*', label: 'Multiply (*)' },
  { value: '/', label: 'Divide (/)' },
  { value: '%', label: 'Modulo (%)' },
];

const STRING_OPERATIONS: { value: StringOperation; label: string }[] = [
  { value: 'concat', label: 'Concatenate' },
  { value: 'format', label: 'Format' },
  { value: 'substring', label: 'Substring' },
  { value: 'length', label: 'Length' },
];

const NodeEditDialog: React.FC<NodeEditDialogProps> = ({ nodeId, onClose }) => {
  const { getNode, updateNode, getVariables } = useLogicEditorStore();
  const { screens, getAllComponents } = useEditorStore();
  
  const node = getNode(nodeId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [params, setParams] = useState<Record<string, any>>(node?.params || {});
  const [label, setLabel] = useState(node?.label || '');

  const variables = getVariables();
  const allComponents = getAllComponents();

  // Protocol tags for the tag nodes
  const modbusTags = useProjectModbusTags();
  const factoryDevMode = useAppStore(state => state.factoryDevMode);

  const handleTagSelect = useCallback(
    (tagId: string) => {
      setParams(prev => ({
        ...prev,
        tagId,
        // Snapshot the name so the node face can say which tag without
        // loading the protocol config.
        tagName: modbusTags.find(tag => tag.id === tagId)?.name ?? prev.tagName ?? '',
      }));
    },
    [modbusTags]
  );

  useEffect(() => {
    if (node) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local state with node props
      setParams(node.params);
      setLabel(node.label);
    }
  }, [node]);

  const handleSave = useCallback(() => {
    updateNode(nodeId, { params, label });
    onClose();
  }, [nodeId, params, label, updateNode, onClose]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleParamChange = useCallback((key: string, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  if (!node) {
    return null;
  }

  const renderParamEditor = () => {
    switch (node.subType) {
      case 'event_trigger':
        // Which event fires this graph is the binding's decision - the
        // component's Events panel picks the event type when it checks the
        // graph under the Logic handler. Nothing to configure here.
        return (
          <div className="no-params">
            <p>
              Fired by component events: bind this graph under a component's
              Events → Logic Graphs. The event type is chosen there.
            </p>
          </div>
        );

      case 'timer_trigger':
        return (
          <>
            <div className="param-group">
              <label>Mode</label>
              <select
                value={params.mode || 'delay'}
                onChange={e => handleParamChange('mode', e.target.value)}
              >
                <option value="delay">Run After Delay</option>
                <option value="interval">Run at Interval</option>
              </select>
            </div>
            <div className="param-group">
              <label>Time (ms)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={params.duration || 1000}
                onChange={e => handleParamChange('duration', parseInt(e.target.value) || 0)}
              />
            </div>
          </>
        );

      case 'compare':
        return (
          <div className="param-group">
            <label>Comparison Operator</label>
            <select
              value={params.operator || '=='}
              onChange={e => handleParamChange('operator', e.target.value)}
            >
              {COMPARE_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
        );

      case 'logic_op':
        return (
          <div className="param-group">
            <label>Logical Operator</label>
            <select
              value={params.operator || 'AND'}
              onChange={e => handleParamChange('operator', e.target.value)}
            >
              {LOGIC_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
        );

      case 'math_op':
        return (
          <div className="param-group">
            <label>Math Operator</label>
            <select
              value={params.operator || '+'}
              onChange={e => handleParamChange('operator', e.target.value)}
            >
              {MATH_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
        );

      case 'string_op':
        return (
          <div className="param-group">
            <label>String Operation</label>
            <select
              value={params.operation || 'concat'}
              onChange={e => handleParamChange('operation', e.target.value)}
            >
              {STRING_OPERATIONS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
        );

      case 'delay':
        return (
          <div className="param-group">
            <label>Delay (ms)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={params.duration || 1000}
              onChange={e => handleParamChange('duration', parseInt(e.target.value) || 0)}
            />
          </div>
        );

      case 'navigate_page':
        return (
          <>
            <div className="param-group">
              <label>Target Screen</label>
              <select
                value={params.targetScreen || params.targetPage || ''}
                onChange={e => handleParamChange('targetScreen', e.target.value)}
              >
                <option value="">Select a screen...</option>
                {screens.map(screen => (
                  <option key={screen.id} value={screen.id}>{screen.name}</option>
                ))}
              </select>
            </div>
            <div className="param-group">
              <label>Transition</label>
              <select
                value={params.animation || 'none'}
                onChange={e => handleParamChange('animation', e.target.value)}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="slide_left">Slide Left</option>
                <option value="slide_right">Slide Right</option>
              </select>
            </div>
          </>
        );

      case 'show_hide':
        return (
          <>
            <div className="param-group">
              <label>Target Component</label>
              <select
                value={params.targetComponent || ''}
                onChange={e => handleParamChange('targetComponent', e.target.value)}
              >
                <option value="">Select a component...</option>
                {allComponents.map(comp => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name} ({comp.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="param-group">
              <label>Action</label>
              <select
                value={params.action || 'toggle'}
                onChange={e => handleParamChange('action', e.target.value)}
              >
                <option value="show">Show</option>
                <option value="hide">Hide</option>
                <option value="toggle">Toggle</option>
              </select>
            </div>
          </>
        );

      case 'set_property':
      case 'get_property':
        return (
          <>
            <div className="param-group">
              <label>Target Component</label>
              <select
                value={params.targetComponent || ''}
                onChange={e => handleParamChange('targetComponent', e.target.value)}
              >
                <option value="">Select a component...</option>
                {allComponents.map(comp => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name} ({comp.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="param-group">
              <label>Property</label>
              <select
                value={params.property || ''}
                onChange={e => handleParamChange('property', e.target.value)}
              >
                <option value="">Select a property...</option>
                <option value="x">X Position</option>
                <option value="y">Y Position</option>
                <option value="width">Width</option>
                <option value="height">Height</option>
                <option value="visible">Visibility</option>
                <option value="opacity">Opacity</option>
                <option value="text">Text</option>
                <option value="value">Value</option>
              </select>
            </div>
          </>
        );

      case 'set_text':
      case 'set_value':
        return (
          <div className="param-group">
            <label>Target Component</label>
            <select
              value={params.targetComponent || ''}
              onChange={e => handleParamChange('targetComponent', e.target.value)}
            >
              <option value="">Select a component...</option>
              {allComponents.map(comp => (
                <option key={comp.id} value={comp.id}>
                  {comp.name} ({comp.type})
                </option>
              ))}
            </select>
          </div>
        );

      case 'var_read':
      case 'var_write':
        return (
          <div className="param-group">
            <label>Variable</label>
            <select
              value={params.variableId || ''}
              onChange={e => handleParamChange('variableId', e.target.value)}
            >
              <option value="">Select a variable...</option>
              {variables.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>
          </div>
        );

      case 'tag_read':
      case 'tag_write': {
        const forWrite = node.subType === 'tag_write';
        const candidates = modbusTags.filter(tag =>
          forWrite
            ? tag.access === 'write' || tag.access === 'readwrite'
            : tag.access === 'read' || tag.access === 'readwrite'
        );
        // What codegen can actually deliver today; a disabled option with its
        // reason beats a tag that silently vanished from the list.
        const unsupportedReason = (tag: ModbusRegisterTag): string | null => {
          if (forWrite) {
            return tag.area === 'discrete-input' || tag.area === 'input-register'
              ? 'read-only area'
              : null;
          }
          if (tag.area !== 'holding-register') {
            return 'only holding registers are readable';
          }
          if (
            tag.dataType === 'uint32'
            || tag.dataType === 'int32'
            || tag.dataType === 'float32'
          ) {
            return '32-bit reads not supported yet';
          }
          return null;
        };
        const selectedMissing =
          !!params.tagId && !modbusTags.some(tag => tag.id === params.tagId);
        return (
          <div className="param-group">
            <label>Tag</label>
            <select
              value={params.tagId || ''}
              onChange={e => handleTagSelect(e.target.value)}
            >
              <option value="">Select a tag...</option>
              {selectedMissing && (
                <option value={params.tagId}>
                  {params.tagName || params.tagId} (missing)
                </option>
              )}
              {candidates.map(tag => {
                const reason = unsupportedReason(tag);
                return (
                  <option key={tag.id} value={tag.id} disabled={!!reason}>
                    {tag.name} — {tag.area} {tag.address} ({tag.dataType})
                    {reason ? ` — ${reason}` : ''}
                  </option>
                );
              })}
            </select>
            {!params.tagId && (
              <div className="param-warning">
                Without a tag this node generates no code. Tags are defined on
                the Protocol tab.
              </div>
            )}
            {selectedMissing && (
              <div className="param-warning">
                This tag no longer exists on the Protocol tab, so this node
                generates no code.
              </div>
            )}
          </div>
        );
      }

      case 'modbus_holding_register':
        return (
          <div className="param-group">
            <label>Holding Register Address (zero-based)</label>
            <input
              type="number"
              min="0"
              max="65535"
              step="1"
              value={params.address ?? 0}
              title="PDU address 0 maps to Holding Register 400001"
              onChange={e => {
                const parsed = Number.parseInt(e.target.value, 10);
                const address = Number.isFinite(parsed)
                  ? Math.max(0, Math.min(65535, parsed))
                  : 0;
                handleParamChange('address', address);
              }}
            />
          </div>
        );

      case 'call_function':
        return (
          <>
            <div className="param-group">
              <label>Function Name</label>
              <input
                type="text"
                placeholder="my_function"
                value={params.functionName || ''}
                onChange={e => handleParamChange('functionName', e.target.value)}
              />
            </div>
            <div className="param-group">
              <label>Arguments</label>
              <textarea
                placeholder="Describe function arguments..."
                value={params.description || ''}
                onChange={e => handleParamChange('description', e.target.value)}
                rows={2}
              />
            </div>
          </>
        );

      case 'c_code_block':
        return (
          <div className="param-group">
            <label>C Code</label>
            <textarea
              className="code-textarea"
              placeholder="// Custom C code"
              value={params.code || ''}
              onChange={e => handleParamChange('code', e.target.value)}
              rows={8}
              spellCheck={false}
            />
          </div>
        );

      case 'switch':
        return (
          <div className="param-group">
            <label>Branch Count</label>
            <input
              type="number"
              min="2"
              max="10"
              value={params.cases?.length || 3}
              onChange={e => {
                const count = Math.max(2, Math.min(10, parseInt(e.target.value) || 2));
                handleParamChange('cases', Array.from({ length: count }, (_, i) => i));
              }}
            />
          </div>
        );

      default:
        return (
          <div className="no-params">
            <p>This node has no configurable parameters</p>
          </div>
        );
    }
  };

  return (
    <div className="node-edit-dialog-overlay" onClick={onClose}>
      <div className="node-edit-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Edit Node</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="dialog-body">
          {/* Node type chip above the name; the raw subtype identifier is
              factory territory, same reasoning as the Code tab */}
          <div className="node-type-info">
            <span
              className="type-badge"
              style={{ backgroundColor: NODE_COLORS[node.type] ?? '#666' }}
            >
              {node.type}
            </span>
            {factoryDevMode && <span className="subtype-label">{node.subType}</span>}
          </div>

          {/* Node Label */}
          <div className="param-group">
            <label>Node Name</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Node name"
            />
          </div>

          {/* Parameters */}
          <div className="params-section">
            <h4>Parameters</h4>
            {renderParamEditor()}
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default NodeEditDialog;
