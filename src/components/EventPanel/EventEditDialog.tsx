import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useEditorStore } from '../../store/editorStore';
import type { EventBinding, LvglEventType, BuiltinActionType, BuiltinAction } from '../../types';
import { LVGL_EVENTS } from './EventPanel';
import CodeEditor from './CodeEditor';
import './EventEditDialog.css';

interface EventEditDialogProps {
  event: EventBinding | null;
  isCreating: boolean;
  onSave: (event: EventBinding) => void;
  onClose: () => void;
}

const BUILTIN_ACTIONS: { type: BuiltinActionType; label: string; description: string }[] = [
  { type: 'navigate', label: 'Navigate to Screen', description: 'Switch to the specified screen' },
  { type: 'setProperty', label: 'Set Property', description: 'Set a component property value' },
  { type: 'show', label: 'Show Component', description: 'Show the specified component' },
  { type: 'hide', label: 'Hide Component', description: 'Hide the specified component' },
  { type: 'enable', label: 'Enable Component', description: 'Enable the specified component' },
  { type: 'disable', label: 'Disable Component', description: 'Disable the specified component' },
  { type: 'setText', label: 'Set Text', description: 'Set the component text' },
  { type: 'setValue', label: 'Set Value', description: 'Set the component value' },
];

const CODE_TEMPLATE = `// Event handler code
// Available variables: e (lv_event_t*), obj (the object that triggered the event)

// Example: log a message
// LV_LOG_USER("Button clicked!");

// Example: change label text
// lv_label_set_text(my_label, "Clicked!");

`;

const EventEditDialog: React.FC<EventEditDialogProps> = ({
  event,
  isCreating,
  onSave,
  onClose,
}) => {
  const { screens, currentScreenId, getAllComponents } = useEditorStore();
  
  // Suppress unused variable warning - currentScreenId is used for reactivity
  void currentScreenId;
  
  // Form state
  const [eventType, setEventType] = useState<LvglEventType>(
    event?.eventType || 'LV_EVENT_CLICKED'
  );
  const [handlerType, setHandlerType] = useState<'builtin' | 'custom'>(
    event?.handlerType || 'builtin'
  );
  const [actionType, setActionType] = useState<BuiltinActionType>(
    event?.action?.type || 'navigate'
  );
  // `targetPage` is the pre-rename spelling, still present in older projects.
  const [targetScreen, setTargetScreen] = useState(
    event?.action?.targetScreen || event?.action?.targetPage || ''
  );
  const [targetComponent, setTargetComponent] = useState(event?.action?.targetComponent || '');
  const [property, setProperty] = useState(event?.action?.property || '');
  const [value, setValue] = useState<string>(
    event?.action?.value !== undefined ? String(event.action.value) : ''
  );
  const [customCode, setCustomCode] = useState(event?.customCode || CODE_TEMPLATE);
  const [showCodePreview, setShowCodePreview] = useState(false);

  // Get all components for target selection
  const allComponents = getAllComponents ? getAllComponents() : [];

  // Reset action fields when action type changes
  useEffect(() => {
    if (!event) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset fields when action type changes
      setTargetScreen('');
      setTargetComponent('');
      setProperty('');
      setValue('');
    }
  }, [actionType, event]);

  const handleSave = useCallback(() => {
    const newEvent: EventBinding = {
      id: event?.id || uuidv4(),
      eventType,
      handlerType,
    };

    if (handlerType === 'builtin') {
      const action: BuiltinAction = { type: actionType };
      
      switch (actionType) {
        case 'navigate':
          action.targetScreen = targetScreen;
          break;
        case 'setProperty':
          action.targetComponent = targetComponent;
          action.property = property;
          action.value = value;
          break;
        case 'show':
        case 'hide':
        case 'enable':
        case 'disable':
          action.targetComponent = targetComponent;
          break;
        case 'setText':
          action.targetComponent = targetComponent;
          action.value = value;
          break;
        case 'setValue':
          action.targetComponent = targetComponent;
          action.value = parseFloat(value) || 0;
          break;
      }
      
      newEvent.action = action;
    } else {
      newEvent.customCode = customCode;
    }

    onSave(newEvent);
  }, [
    event, eventType, handlerType, actionType,
    targetScreen, targetComponent, property, value, customCode, onSave
  ]);

  const generateCodePreview = (): string => {
    if (handlerType === 'custom') {
      return customCode;
    }

    let code = `static void event_handler(lv_event_t *e) {\n`;
    code += `    lv_obj_t *obj = lv_event_get_target(e);\n`;
    code += `    lv_event_code_t code = lv_event_get_code(e);\n\n`;
    code += `    if (code == ${eventType}) {\n`;

    switch (actionType) {
      case 'navigate':
        code += `        // Navigate to screen: ${targetScreen || 'page_name'}\n`;
        code += `        lv_scr_load(${targetScreen || 'page_name'});\n`;
        break;
      case 'setProperty':
        code += `        // Set property: ${property || 'property'} = ${value || 'value'}\n`;
        code += `        lv_obj_set_style_${property || 'bg_color'}(${targetComponent || 'target'}, ${value || '0'}, 0);\n`;
        break;
      case 'show':
        code += `        // Show component\n`;
        code += `        lv_obj_clear_flag(${targetComponent || 'target'}, LV_OBJ_FLAG_HIDDEN);\n`;
        break;
      case 'hide':
        code += `        // Hide component\n`;
        code += `        lv_obj_add_flag(${targetComponent || 'target'}, LV_OBJ_FLAG_HIDDEN);\n`;
        break;
      case 'enable':
        code += `        // Enable component\n`;
        code += `        lv_obj_clear_state(${targetComponent || 'target'}, LV_STATE_DISABLED);\n`;
        break;
      case 'disable':
        code += `        // Disable component\n`;
        code += `        lv_obj_add_state(${targetComponent || 'target'}, LV_STATE_DISABLED);\n`;
        break;
      case 'setText':
        code += `        // Set text\n`;
        code += `        lv_label_set_text(${targetComponent || 'target'}, "${value || ''}");\n`;
        break;
      case 'setValue':
        code += `        // Set value\n`;
        code += `        lv_slider_set_value(${targetComponent || 'target'}, ${value || '0'}, LV_ANIM_ON);\n`;
        break;
    }

    code += `    }\n`;
    code += `}\n`;

    return code;
  };

  const renderActionConfig = () => {
    switch (actionType) {
      case 'navigate':
        return (
          <div className="action-config">
            <div className="config-row">
              <label>Target Screen</label>
              <select 
                value={targetScreen} 
                onChange={(e) => setTargetScreen(e.target.value)}
              >
                <option value="">Select a screen...</option>
                {screens?.map(screen => (
                  <option key={screen.id} value={screen.name}>
                    {screen.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );

      case 'setProperty':
        return (
          <div className="action-config">
            <div className="config-row">
              <label>Target Component</label>
              <select 
                value={targetComponent} 
                onChange={(e) => setTargetComponent(e.target.value)}
              >
                <option value="">Select a component...</option>
                {allComponents.map(comp => (
                  <option key={comp.id} value={comp.name}>
                    {comp.name} ({comp.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="config-row">
              <label>Property</label>
              <select 
                value={property} 
                onChange={(e) => setProperty(e.target.value)}
              >
                <option value="">Select a property...</option>
                <option value="bg_color">Background Color (bg_color)</option>
                <option value="border_color">Border Color (border_color)</option>
                <option value="border_width">Border Width (border_width)</option>
                <option value="radius">Corner Radius (radius)</option>
                <option value="opa">Opacity (opa)</option>
                <option value="x">X Coordinate (x)</option>
                <option value="y">Y Coordinate (y)</option>
                <option value="width">Width (width)</option>
                <option value="height">Height (height)</option>
              </select>
            </div>
            <div className="config-row">
              <label>Property Value</label>
              <input 
                type="text" 
                value={value} 
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter a property value"
              />
            </div>
          </div>
        );

      case 'show':
      case 'hide':
      case 'enable':
      case 'disable':
        return (
          <div className="action-config">
            <div className="config-row">
              <label>Target Component</label>
              <select 
                value={targetComponent} 
                onChange={(e) => setTargetComponent(e.target.value)}
              >
                <option value="">Select a component...</option>
                {allComponents.map(comp => (
                  <option key={comp.id} value={comp.name}>
                    {comp.name} ({comp.type})
                  </option>
                ))}
              </select>
            </div>
          </div>
        );

      case 'setText':
        return (
          <div className="action-config">
            <div className="config-row">
              <label>Target Component</label>
              <select 
                value={targetComponent} 
                onChange={(e) => setTargetComponent(e.target.value)}
              >
                <option value="">Select a component...</option>
                {allComponents.filter(c => ['label', 'btn', 'textarea'].includes(c.type)).map(comp => (
                  <option key={comp.id} value={comp.name}>
                    {comp.name} ({comp.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="config-row">
              <label>Text</label>
              <input 
                type="text" 
                value={value} 
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter text"
              />
            </div>
          </div>
        );

      case 'setValue':
        return (
          <div className="action-config">
            <div className="config-row">
              <label>Target Component</label>
              <select 
                value={targetComponent} 
                onChange={(e) => setTargetComponent(e.target.value)}
              >
                <option value="">Select a component...</option>
                {allComponents.filter(c => ['slider', 'bar', 'arc'].includes(c.type)).map(comp => (
                  <option key={comp.id} value={comp.name}>
                    {comp.name} ({comp.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="config-row">
              <label>Value</label>
              <input 
                type="number" 
                value={value} 
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter a value"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="event-dialog-overlay" onClick={onClose}>
      <div className="event-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{isCreating ? 'Add Event' : 'Edit Event'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="dialog-content">
          {/* Event Type Selection */}
          <div className="form-section">
            <label className="section-label">Event Type</label>
            <select 
              value={eventType} 
              onChange={(e) => setEventType(e.target.value as LvglEventType)}
              className="event-type-select"
            >
              {LVGL_EVENTS.map(evt => (
                <option key={evt.type} value={evt.type}>
                  {evt.label} ({evt.type})
                </option>
              ))}
            </select>
            <p className="field-hint">
              {LVGL_EVENTS.find(e => e.type === eventType)?.description}
            </p>
          </div>

          {/* Handler Type Selection */}
          <div className="form-section">
            <label className="section-label">Handler Type</label>
            <div className="handler-type-tabs">
              <button 
                className={`tab-btn ${handlerType === 'builtin' ? 'active' : ''}`}
                onClick={() => setHandlerType('builtin')}
              >
                Built-in Action
              </button>
              <button 
                className={`tab-btn ${handlerType === 'custom' ? 'active' : ''}`}
                onClick={() => setHandlerType('custom')}
              >
                Custom Code
              </button>
            </div>
          </div>

          {/* Handler Configuration */}
          {handlerType === 'builtin' ? (
            <div className="form-section">
              <label className="section-label">Action Type</label>
              <select 
                value={actionType} 
                onChange={(e) => setActionType(e.target.value as BuiltinActionType)}
                className="action-type-select"
              >
                {BUILTIN_ACTIONS.map(action => (
                  <option key={action.type} value={action.type}>
                    {action.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                {BUILTIN_ACTIONS.find(a => a.type === actionType)?.description}
              </p>
              
              {renderActionConfig()}
            </div>
          ) : (
            <div className="form-section">
              <label className="section-label">C Code</label>
              <CodeEditor 
                value={customCode}
                onChange={setCustomCode}
                language="c"
              />
            </div>
          )}

          {/* Code Preview */}
          <div className="form-section">
            <div className="preview-header">
              <label className="section-label">Code Preview</label>
              <button 
                className="toggle-preview-btn"
                onClick={() => setShowCodePreview(!showCodePreview)}
              >
                {showCodePreview ? 'Hide' : 'Show'}
              </button>
            </div>
            {showCodePreview && (
              <pre className="code-preview">
                {generateCodePreview()}
              </pre>
            )}
          </div>
        </div>

        <div className="dialog-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default EventEditDialog;
