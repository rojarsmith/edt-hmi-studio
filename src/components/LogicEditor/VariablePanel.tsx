// Variable Panel - Manage global variables

import React, { useState, useCallback } from 'react';
import { useLogicEditorStore } from './logicEditorStore';
import type { LogicVariable, VariableType } from './types';
import { modal } from '../Modal';
import './VariablePanel.css';

const VARIABLE_TYPES: { type: VariableType; label: string; icon: string; defaultValue: any }[] = [
  { type: 'int', label: 'Integer', icon: '🔢', defaultValue: 0 },
  { type: 'float', label: 'Float', icon: '📊', defaultValue: 0.0 },
  { type: 'string', label: 'String', icon: '📝', defaultValue: '' },
  { type: 'bool', label: 'Boolean', icon: '✓', defaultValue: false },
];

const VariablePanel: React.FC = () => {
  const { getVariables, addVariable, deleteVariable, updateVariable, getCurrentGraph } = useLogicEditorStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [newVarType, setNewVarType] = useState<VariableType>('int');
  const [editingId, setEditingId] = useState<string | null>(null);

  const variables = getVariables();
  const currentGraph = getCurrentGraph();

  const handleAddVariable = useCallback(() => {
    if (!newVarName.trim()) return;
    
    const typeInfo = VARIABLE_TYPES.find(t => t.type === newVarType);
    addVariable(newVarName.trim(), newVarType, typeInfo?.defaultValue ?? 0);
    
    setNewVarName('');
    setNewVarType('int');
    setIsAdding(false);
  }, [newVarName, newVarType, addVariable]);

  const handleDeleteVariable = useCallback(async (id: string) => {
    if (await modal.confirm('Delete this variable?')) {
      deleteVariable(id);
    }
  }, [deleteVariable]);

  const handleUpdateValue = useCallback((id: string, value: string, type: VariableType) => {
    let parsedValue: any = value;
    
    switch (type) {
      case 'int':
        parsedValue = parseInt(value, 10) || 0;
        break;
      case 'float':
        parsedValue = parseFloat(value) || 0;
        break;
      case 'bool':
        parsedValue = value === 'true';
        break;
      case 'string':
      default:
        parsedValue = value;
    }
    
    updateVariable(id, { defaultValue: parsedValue });
    setEditingId(null);
  }, [updateVariable]);

  if (!currentGraph) {
    return (
      <div className="variable-panel">
        <div className="panel-header">
          <h3>Variables</h3>
        </div>
        <div className="no-graph">
          <p>Select or create a logic graph first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="variable-panel">
      <div className="panel-header">
        <h3>Variables</h3>
        <button 
          className="add-var-btn" 
          onClick={() => setIsAdding(true)}
          title="Add variable"
        >
          +
        </button>
      </div>

      {/* Add Variable Form */}
      {isAdding && (
        <div className="add-var-form">
          <input
            type="text"
            placeholder="Variable Name"
            value={newVarName}
            onChange={e => setNewVarName(e.target.value)}
            autoFocus
          />
          <select
            value={newVarType}
            onChange={e => setNewVarType(e.target.value as VariableType)}
          >
            {VARIABLE_TYPES.map(t => (
              <option key={t.type} value={t.type}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          <div className="form-actions">
            <button className="btn-confirm" onClick={handleAddVariable}>
              Add
            </button>
            <button className="btn-cancel" onClick={() => setIsAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Variable List */}
      <div className="variable-list">
        {variables.length === 0 ? (
          <div className="no-variables">
            <p>No variables</p>
            <button onClick={() => setIsAdding(true)}>+ Add variable</button>
          </div>
        ) : (
          variables.map(variable => (
            <VariableItem
              key={variable.id}
              variable={variable}
              isEditing={editingId === variable.id}
              onEdit={() => setEditingId(variable.id)}
              onSave={(value) => handleUpdateValue(variable.id, value, variable.type)}
              onCancel={() => setEditingId(null)}
              onDelete={() => handleDeleteVariable(variable.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// Variable Item Component
interface VariableItemProps {
  variable: LogicVariable;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}

const VariableItem: React.FC<VariableItemProps> = ({
  variable,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}) => {
  const [editValue, setEditValue] = useState(String(variable.defaultValue));
  const typeInfo = VARIABLE_TYPES.find(t => t.type === variable.type);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSave(editValue);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const renderValueInput = () => {
    if (variable.type === 'bool') {
      return (
        <select
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => onSave(editValue)}
          autoFocus
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    
    return (
      <input
        type={variable.type === 'string' ? 'text' : 'number'}
        step={variable.type === 'float' ? '0.1' : '1'}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={() => onSave(editValue)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
    );
  };

  return (
    <div className="variable-item">
      <div className="var-icon">{typeInfo?.icon || '📦'}</div>
      <div className="var-info">
        <span className="var-name">{variable.name}</span>
        <span className="var-type">{typeInfo?.label || variable.type}</span>
      </div>
      <div className="var-value">
        {isEditing ? (
          renderValueInput()
        ) : (
          <span className="value-display" onClick={onEdit}>
            {variable.type === 'string' ? `"${variable.defaultValue}"` : String(variable.defaultValue)}
          </span>
        )}
      </div>
      <div className="var-actions">
        <button className="btn-delete" onClick={onDelete} title="Delete">
          🗑️
        </button>
      </div>
    </div>
  );
};

export default VariablePanel;
