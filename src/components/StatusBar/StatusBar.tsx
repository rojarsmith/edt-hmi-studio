import React from 'react';
import { useEditorStore } from '../../store/editorStore';
import { getComponentDefinition } from '../../utils/componentDefinitions';
import './StatusBar.css';

const StatusBar: React.FC = () => {
  const { canvas, selection, components, getComponentById, setZoom, toggleGrid, setSnapToGrid } = useEditorStore();
  
  const selectedCount = selection.selectedIds.length;
  const selectedComponent = selectedCount === 1 ? getComponentById(selection.selectedIds[0]) : undefined;
  const definition = selectedComponent ? getComponentDefinition(selectedComponent.type) : undefined;

  // Count total components recursively
  const countComponents = (comps: typeof components): number => {
    return comps.reduce((acc, comp) => acc + 1 + countComponents(comp.children), 0);
  };
  const totalComponents = countComponents(components);

  const handleZoomIn = () => setZoom(canvas.zoom + 0.1);
  const handleZoomOut = () => setZoom(canvas.zoom - 0.1);
  const handleZoomReset = () => setZoom(1);

  return (
    <div className="status-bar">
      <div className="status-left">
        {/* Selection info */}
        <div className="status-item">
          {selectedCount === 0 && (
            <span className="status-text">No selection</span>
          )}
          {selectedCount === 1 && selectedComponent && (
            <span className="status-text">
              <span className="component-icon">{definition?.icon}</span>
              {selectedComponent.name}
              <span className="component-size">
                ({selectedComponent.x}, {selectedComponent.y}) - {selectedComponent.width} × {selectedComponent.height}
              </span>
            </span>
          )}
          {selectedCount > 1 && (
            <span className="status-text">Selected {selectedCount} widgets</span>
          )}
        </div>
        
        <div className="status-divider" />
        
        {/* Component count */}
        <div className="status-item">
          <span className="status-text">Components: {totalComponents}</span>
        </div>
      </div>

      <div className="status-right">
        {/* Canvas size */}
        <div className="status-item">
          <span className="status-text">Canvas: {canvas.width} × {canvas.height}</span>
        </div>
        
        <div className="status-divider" />
        
        {/* Grid toggle */}
        <button
          className={`status-button ${canvas.showGrid ? 'active' : ''}`}
          onClick={toggleGrid}
          title="Show or hide grid"
        >
          <span className="icon">⊞</span>
          Grid
        </button>
        
        {/* Snap toggle */}
        <button
          className={`status-button ${canvas.snapToGrid ? 'active' : ''}`}
          onClick={() => setSnapToGrid(!canvas.snapToGrid)}
          title="Snap to grid"
        >
          <span className="icon">⊡</span>
          Snap
        </button>
        
        <div className="status-divider" />
        
        {/* Zoom controls */}
        <div className="zoom-controls">
          <button onClick={handleZoomOut} title="Zoom Out">−</button>
          <button className="zoom-level" onClick={handleZoomReset} title="Reset Zoom">
            {Math.round(canvas.zoom * 100)}%
          </button>
          <button onClick={handleZoomIn} title="Zoom In">+</button>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
