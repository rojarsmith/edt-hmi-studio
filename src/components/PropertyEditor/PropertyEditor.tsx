import React, { useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { LvglComponent, StyleProps } from '../../types';
import { getComponentDefinition } from '../../utils/componentDefinitions';
import './PropertyEditor.css';

const PropertyEditor: React.FC = () => {
  const { selection, getComponentById, updateComponent } = useEditorStore();
  
  const selectedId = selection.selectedIds[0];
  const component = selectedId ? getComponentById(selectedId) : undefined;
  const definition = component ? getComponentDefinition(component.type) : undefined;

  const handlePropertyChange = useCallback(
    (property: keyof LvglComponent, value: any) => {
      if (!selectedId) return;
      updateComponent(selectedId, { [property]: value });
    },
    [selectedId, updateComponent]
  );

  const handleStyleChange = useCallback(
    (styleKey: keyof StyleProps, value: any) => {
      if (!selectedId || !component) return;
      updateComponent(selectedId, {
        styles: {
          ...component.styles,
          default: {
            ...component.styles.default,
            [styleKey]: value,
          },
        },
      });
    },
    [selectedId, component, updateComponent]
  );

  const handlePropsChange = useCallback(
    (propKey: string, value: any) => {
      if (!selectedId || !component) return;
      updateComponent(selectedId, {
        props: {
          ...component.props,
          [propKey]: value,
        },
      });
    },
    [selectedId, component, updateComponent]
  );

  if (!component) {
    return (
      <div className="property-editor">
        <div className="panel-header">
          <h3>Properties</h3>
        </div>
        <div className="no-selection">
          <p>No widget selected</p>
          <p className="hint">Select a widget on the canvas to edit it</p>
        </div>
      </div>
    );
  }

  return (
    <div className="property-editor">
      <div className="panel-header">
        <h3>Properties</h3>
      </div>
      
      <div className="property-sections">
        {/* Component Info */}
        <div className="property-section">
          <div className="section-header">Widget Information</div>
          <div className="property-row">
            <label>Type</label>
            <div className="property-value readonly">
              <span className="component-type-icon">{definition?.icon}</span>
              {definition?.name || component.type}
            </div>
          </div>
          <div className="property-row">
            <label>Name</label>
            <input
              type="text"
              value={component.name}
              onChange={(e) => handlePropertyChange('name', e.target.value)}
            />
          </div>
        </div>

        {/* Position */}
        <div className="property-section">
          <div className="section-header">Position</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>X</label>
              <input
                type="number"
                value={component.x}
                onChange={(e) => handlePropertyChange('x', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Y</label>
              <input
                type="number"
                value={component.y}
                onChange={(e) => handlePropertyChange('y', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div className="property-section">
          <div className="section-header">Size</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Width</label>
              <input
                type="number"
                value={component.width}
                min={10}
                onChange={(e) => handlePropertyChange('width', Math.max(10, parseInt(e.target.value) || 10))}
              />
            </div>
            <div className="property-field">
              <label>Height</label>
              <input
                type="number"
                value={component.height}
                min={10}
                onChange={(e) => handlePropertyChange('height', Math.max(10, parseInt(e.target.value) || 10))}
              />
            </div>
          </div>
        </div>

        {/* Styles */}
        <div className="property-section">
          <div className="section-header">Style</div>
          
          <div className="property-row">
            <label>Background Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={component.styles.default.bgColor || '#ffffff'}
                onChange={(e) => handleStyleChange('bgColor', e.target.value)}
              />
              <input
                type="text"
                value={component.styles.default.bgColor || '#ffffff'}
                onChange={(e) => handleStyleChange('bgColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>
          
          <div className="property-row">
            <label>Border Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={component.styles.default.borderColor || '#cccccc'}
                onChange={(e) => handleStyleChange('borderColor', e.target.value)}
              />
              <input
                type="text"
                value={component.styles.default.borderColor || '#cccccc'}
                onChange={(e) => handleStyleChange('borderColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>
          
          <div className="property-row two-col">
            <div className="property-field">
              <label>Border Width</label>
              <input
                type="number"
                value={component.styles.default.borderWidth || 0}
                min={0}
                onChange={(e) => handleStyleChange('borderWidth', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Corner Radius</label>
              <input
                type="number"
                value={component.styles.default.borderRadius || 0}
                min={0}
                onChange={(e) => handleStyleChange('borderRadius', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          
          <div className="property-row">
            <label>Opacity</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={component.styles.default.opacity ?? 1}
              onChange={(e) => handleStyleChange('opacity', parseFloat(e.target.value))}
            />
            <span className="range-value">{((component.styles.default.opacity ?? 1) * 100).toFixed(0)}%</span>
          </div>

          <div className="property-row">
            <label>Text Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={component.styles.default.textColor || '#333333'}
                onChange={(e) => handleStyleChange('textColor', e.target.value)}
              />
              <input
                type="text"
                value={component.styles.default.textColor || '#333333'}
                onChange={(e) => handleStyleChange('textColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>

          <div className="property-row">
            <label>Padding</label>
            <input
              type="number"
              value={component.styles.default.padding || 0}
              min={0}
              onChange={(e) => handleStyleChange('padding', parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Component-specific props */}
        {renderComponentProps(component, handlePropsChange)}
      </div>
    </div>
  );
};

// Render component-specific properties
function renderComponentProps(
  component: LvglComponent,
  onChange: (key: string, value: any) => void
): React.ReactNode {
  const { type, props } = component;

  switch (type) {
    case 'btn':
      return (
        <div className="property-section">
          <div className="section-header">Button</div>
          <div className="property-row">
            <label>Text</label>
            <input
              type="text"
              value={props.text || ''}
              onChange={(e) => onChange('text', e.target.value)}
            />
          </div>
          <div className="property-row">
            <label>Font Size</label>
            <input
              type="number"
              value={props.fontSize || 14}
              min={8}
              max={72}
              onChange={(e) => onChange('fontSize', parseInt(e.target.value) || 14)}
            />
          </div>
          <div className="property-row">
            <label>Text Alignment</label>
            <select
              value={props.textAlign || 'center'}
              onChange={(e) => onChange('textAlign', e.target.value)}
            >
              <option value="left">Align Left</option>
              <option value="center">Center</option>
              <option value="right">Align Right</option>
            </select>
          </div>
        </div>
      );

    case 'label':
      return (
        <div className="property-section">
          <div className="section-header">Label</div>
          <div className="property-row">
            <label>Text</label>
            <input
              type="text"
              value={props.text || ''}
              onChange={(e) => onChange('text', e.target.value)}
            />
          </div>
          <div className="property-row">
            <label>Font Size</label>
            <input
              type="number"
              value={props.fontSize || 14}
              min={8}
              max={72}
              onChange={(e) => onChange('fontSize', parseInt(e.target.value) || 14)}
            />
          </div>
          <div className="property-row">
            <label>Text Alignment</label>
            <select
              value={props.textAlign || 'left'}
              onChange={(e) => onChange('textAlign', e.target.value)}
            >
              <option value="left">Align Left</option>
              <option value="center">Center</option>
              <option value="right">Align Right</option>
            </select>
          </div>
          <div className="property-row">
            <label>Long Text Mode</label>
            <select
              value={props.longMode || 'wrap'}
              onChange={(e) => onChange('longMode', e.target.value)}
            >
              <option value="wrap">Wrap</option>
              <option value="scroll">Scrolling</option>
              <option value="dot">Ellipsis</option>
              <option value="clip">Clip</option>
            </select>
          </div>
        </div>
      );

    case 'textarea':
      return (
        <div className="property-section">
          <div className="section-header">Text Area</div>
          <div className="property-row">
            <label>Content</label>
            <textarea
              value={props.text || ''}
              onChange={(e) => onChange('text', e.target.value)}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div className="property-row">
            <label>Placeholder</label>
            <input
              type="text"
              value={props.placeholder || ''}
              onChange={(e) => onChange('placeholder', e.target.value)}
            />
          </div>
          <div className="property-row">
            <label>Maximum Length</label>
            <input
              type="number"
              value={props.maxLength || 0}
              min={0}
              onChange={(e) => onChange('maxLength', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row">
            <label>Password Mode</label>
            <input
              type="checkbox"
              checked={props.password || false}
              onChange={(e) => onChange('password', e.target.checked)}
            />
          </div>
          <div className="property-row">
            <label>Single-Line Mode</label>
            <input
              type="checkbox"
              checked={props.oneLine || false}
              onChange={(e) => onChange('oneLine', e.target.checked)}
            />
          </div>
        </div>
      );

    case 'checkbox':
      return (
        <div className="property-section">
          <div className="section-header">Checkbox</div>
          <div className="property-row">
            <label>Text</label>
            <input
              type="text"
              value={props.text || ''}
              onChange={(e) => onChange('text', e.target.value)}
            />
          </div>
          <div className="property-row">
            <label>Checked</label>
            <input
              type="checkbox"
              checked={props.checked || false}
              onChange={(e) => onChange('checked', e.target.checked)}
            />
          </div>
        </div>
      );

    case 'switch':
      return (
        <div className="property-section">
          <div className="section-header">Switch</div>
          <div className="property-row">
            <label>On</label>
            <input
              type="checkbox"
              checked={props.checked || false}
              onChange={(e) => onChange('checked', e.target.checked)}
            />
          </div>
        </div>
      );

    case 'slider':
      return (
        <div className="property-section">
          <div className="section-header">Slider</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Minimum</label>
              <input
                type="number"
                value={props.min ?? 0}
                onChange={(e) => onChange('min', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Maximum</label>
              <input
                type="number"
                value={props.max ?? 100}
                onChange={(e) => onChange('max', parseInt(e.target.value) || 100)}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Current Value</label>
            <input
              type="number"
              value={props.value ?? 50}
              onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row">
            <label>Step</label>
            <input
              type="number"
              value={props.step || 1}
              min={1}
              onChange={(e) => onChange('step', parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="property-row">
            <label>Direction</label>
            <select
              value={props.orientation || 'horizontal'}
              onChange={(e) => onChange('orientation', e.target.value)}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
        </div>
      );

    case 'bar':
      return (
        <div className="property-section">
          <div className="section-header">Progress Bar</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Minimum</label>
              <input
                type="number"
                value={props.min ?? 0}
                onChange={(e) => onChange('min', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Maximum</label>
              <input
                type="number"
                value={props.max ?? 100}
                onChange={(e) => onChange('max', parseInt(e.target.value) || 100)}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Current Value</label>
            <input
              type="number"
              value={props.value ?? 50}
              onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row">
            <label>Direction</label>
            <select
              value={props.orientation || 'horizontal'}
              onChange={(e) => onChange('orientation', e.target.value)}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
        </div>
      );

    case 'win':
      return (
        <div className="property-section">
          <div className="section-header">Window</div>
          <div className="property-row">
            <label>Title</label>
            <input
              type="text"
              value={props.title || ''}
              onChange={(e) => onChange('title', e.target.value)}
            />
          </div>
        </div>
      );

    case 'table':
      return (
        <div className="property-section">
          <div className="section-header">Table</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Rows</label>
              <input
                type="number"
                value={props.rows ?? 3}
                min={1}
                onChange={(e) => onChange('rows', Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="property-field">
              <label>Columns</label>
              <input
                type="number"
                value={props.cols ?? 3}
                min={1}
                onChange={(e) => onChange('cols', Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
        </div>
      );

    case 'img':
      return (
        <div className="property-section">
          <div className="section-header">Image</div>
          <div className="property-row">
            <label>Image Source</label>
            <input
              type="text"
              value={props.src || ''}
              onChange={(e) => onChange('src', e.target.value)}
              placeholder="Image URL or resourceID"
            />
          </div>
          <div className="property-row">
            <label>Scale Mode</label>
            <select
              value={props.scaleMode || 'none'}
              onChange={(e) => onChange('scaleMode', e.target.value)}
            >
              <option value="none">Original</option>
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </div>
          <div className="property-row">
            <label>Rotation</label>
            <input
              type="number"
              value={props.rotation || 0}
              min={0}
              max={360}
              onChange={(e) => onChange('rotation', parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      );

    case 'line':
      return (
        <div className="property-section">
          <div className="section-header">Line</div>
          <div className="property-row">
            <label>Line Width</label>
            <input
              type="number"
              value={props.lineWidth || 2}
              min={1}
              onChange={(e) => onChange('lineWidth', parseInt(e.target.value) || 2)}
            />
          </div>
          <div className="property-row">
            <label>Line Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={props.lineColor || '#333333'}
                onChange={(e) => onChange('lineColor', e.target.value)}
              />
              <input
                type="text"
                value={props.lineColor || '#333333'}
                onChange={(e) => onChange('lineColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>
        </div>
      );

    case 'dropdown':
      return (
        <div className="property-section">
          <div className="section-header">Dropdown</div>
          <div className="property-row">
            <label>Options</label>
            <textarea
              value={(props.options || ['Option 1', 'Option 2', 'Option 3']).join('\n')}
              onChange={(e) => onChange('options', e.target.value.split('\n').filter((s: string) => s.trim()))}
              placeholder="One option per line"
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div className="property-row">
            <label>Default Selection</label>
            <input
              type="number"
              value={props.selected || 0}
              min={0}
              onChange={(e) => onChange('selected', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row">
            <label>Opening Direction</label>
            <select
              value={props.direction || 'down'}
              onChange={(e) => onChange('direction', e.target.value)}
            >
              <option value="down">Down</option>
              <option value="up">Up</option>
            </select>
          </div>
        </div>
      );

    case 'arc':
      return (
        <div className="property-section">
          <div className="section-header">Arc</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Start Angle</label>
              <input
                type="number"
                value={props.startAngle || 135}
                min={0}
                max={360}
                onChange={(e) => onChange('startAngle', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>End Angle</label>
              <input
                type="number"
                value={props.endAngle || 45}
                min={0}
                max={360}
                onChange={(e) => onChange('endAngle', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Minimum</label>
              <input
                type="number"
                value={props.min || 0}
                onChange={(e) => onChange('min', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Maximum</label>
              <input
                type="number"
                value={props.max || 100}
                onChange={(e) => onChange('max', parseInt(e.target.value) || 100)}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Current Value</label>
            <input
              type="number"
              value={props.value || 0}
              onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row">
            <label>Mode</label>
            <select
              value={props.mode || 'normal'}
              onChange={(e) => onChange('mode', e.target.value)}
            >
              <option value="normal">Normal</option>
              <option value="symmetrical">Symmetrical</option>
              <option value="reverse">Reverse</option>
            </select>
          </div>
        </div>
      );

    case 'spinner':
      return (
        <div className="property-section">
          <div className="section-header">Spinner</div>
          <div className="property-row">
            <label>Spin Speed(ms)</label>
            <input
              type="number"
              value={props.speed || 1000}
              min={100}
              step={100}
              onChange={(e) => onChange('speed', parseInt(e.target.value) || 1000)}
            />
          </div>
          <div className="property-row">
            <label>Arc Length</label>
            <input
              type="number"
              value={props.arcLength || 60}
              min={10}
              max={360}
              onChange={(e) => onChange('arcLength', parseInt(e.target.value) || 60)}
            />
          </div>
        </div>
      );

    case 'chart':
      return (
        <div className="property-section">
          <div className="section-header">Chart</div>
          <div className="property-row">
            <label>Type</label>
            <select
              value={props.type || 'line'}
              onChange={(e) => onChange('type', e.target.value)}
            >
              <option value="line">Line Chart</option>
              <option value="bar">Bar Chart</option>
              <option value="scatter">Scatter Plot</option>
            </select>
          </div>
          <div className="property-row">
            <label>Data Points</label>
            <input
              type="text"
              value={(props.data || [10, 20, 30, 25, 40]).join(', ')}
              onChange={(e) => onChange('data', e.target.value.split(',').map((v: string) => parseInt(v.trim()) || 0))}
              placeholder="10, 20, 30, 40"
            />
          </div>
          <div className="property-row">
            <label>Show Grid</label>
            <input
              type="checkbox"
              checked={props.showGrid !== false}
              onChange={(e) => onChange('showGrid', e.target.checked)}
            />
          </div>
          <div className="property-row">
            <label>Line Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={props.lineColor || '#2196F3'}
                onChange={(e) => onChange('lineColor', e.target.value)}
              />
              <input
                type="text"
                value={props.lineColor || '#2196F3'}
                onChange={(e) => onChange('lineColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>
        </div>
      );

    case 'calendar':
      return (
        <div className="property-section">
          <div className="section-header">Calendar</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Year</label>
              <input
                type="number"
                value={props.year || new Date().getFullYear()}
                min={1970}
                max={2100}
                onChange={(e) => onChange('year', parseInt(e.target.value) || 2024)}
              />
            </div>
            <div className="property-field">
              <label>Month</label>
              <input
                type="number"
                value={props.month || 1}
                min={1}
                max={12}
                onChange={(e) => onChange('month', Math.min(12, Math.max(1, parseInt(e.target.value) || 1)))}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Show Weekday Header</label>
            <input
              type="checkbox"
              checked={props.showDayNames !== false}
              onChange={(e) => onChange('showDayNames', e.target.checked)}
            />
          </div>
        </div>
      );

    case 'tabview':
      return (
        <div className="property-section">
          <div className="section-header">Tab View</div>
          <div className="property-row">
            <label>Label</label>
            <textarea
              value={(props.tabs || ['Tab 1', 'Tab 2']).join('\n')}
              onChange={(e) => onChange('tabs', e.target.value.split('\n').filter((s: string) => s.trim()))}
              placeholder="One label per line"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div className="property-row">
            <label>Current Tab</label>
            <input
              type="number"
              value={props.activeTab || 0}
              min={0}
              onChange={(e) => onChange('activeTab', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row">
            <label>Tab Position</label>
            <select
              value={props.tabPosition || 'top'}
              onChange={(e) => onChange('tabPosition', e.target.value)}
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>
      );

    case 'tileview':
      return (
        <div className="property-section">
          <div className="section-header">Tile View</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Rows</label>
              <input
                type="number"
                value={props.rows || 2}
                min={1}
                onChange={(e) => onChange('rows', Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="property-field">
              <label>Columns</label>
              <input
                type="number"
                value={props.cols || 2}
                min={1}
                onChange={(e) => onChange('cols', Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Current Row</label>
              <input
                type="number"
                value={props.currentRow || 0}
                min={0}
                onChange={(e) => onChange('currentRow', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Current Column</label>
              <input
                type="number"
                value={props.currentCol || 0}
                min={0}
                onChange={(e) => onChange('currentCol', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      );

    case 'obj':
      return (
        <div className="property-section">
          <div className="section-header">Container</div>
          <div className="property-row">
            <label>Scroll Direction</label>
            <select
              value={props.scrollDir || 'none'}
              onChange={(e) => onChange('scrollDir', e.target.value)}
            >
              <option value="none">None</option>
              <option value="hor">Horizontal</option>
              <option value="ver">Vertical</option>
              <option value="all">Both Directions</option>
            </select>
          </div>
          <div className="property-row">
            <label>Layout Mode</label>
            <select
              value={props.layout || 'none'}
              onChange={(e) => onChange('layout', e.target.value)}
            >
              <option value="none">None</option>
              <option value="flex">Flex</option>
              <option value="grid">Grid</option>
            </select>
          </div>
          {props.layout === 'flex' && (
            <>
              <div className="property-row">
                <label>Direction</label>
                <select
                  value={props.flexDirection || 'row'}
                  onChange={(e) => onChange('flexDirection', e.target.value)}
                >
                  <option value="row">Horizontal</option>
                  <option value="column">Vertical</option>
                </select>
              </div>
              <div className="property-row">
                <label>Spacing</label>
                <input
                  type="number"
                  value={props.gap || 0}
                  min={0}
                  onChange={(e) => onChange('gap', parseInt(e.target.value) || 0)}
                />
              </div>
            </>
          )}
        </div>
      );

    default:
      return null;
  }
}

export default PropertyEditor;
