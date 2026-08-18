import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { componentCategories, getComponentsByCategory } from '../../utils/componentDefinitions';
import type { ComponentDefinition, ComponentCategory } from '../../types';
import PanelChevron from '../LogicEditor/PanelChevron';
import './ComponentPanel.css';

interface DraggableComponentProps {
  definition: ComponentDefinition;
}

const DraggableComponent: React.FC<DraggableComponentProps> = ({ definition }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: {
      type: 'new-component',
      componentType: definition.type,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`component-item ${isDragging ? 'dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <span className="component-icon">{definition.icon}</span>
      <span className="component-name">{definition.name}</span>
    </div>
  );
};

interface CategorySectionProps {
  category: ComponentCategory;
  components: ComponentDefinition[];
  isCollapsed: boolean;
  onToggle: () => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  components,
  isCollapsed,
  onToggle,
}) => {
  return (
    <div className="category-section">
      {/* Same header language as the screen manager: left twisty, no icon. */}
      <div className="category-header" onClick={onToggle}>
        <PanelChevron open={!isCollapsed} className="category-chevron" />
        <span className="category-name">{category.name}</span>
      </div>
      {!isCollapsed && (
        <div className="category-components">
          {components.map(def => (
            <DraggableComponent key={def.type} definition={def} />
          ))}
        </div>
      )}
    </div>
  );
};

const ComponentPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const componentCount = useMemo(
    () => componentCategories.reduce((sum, c) => sum + getComponentsByCategory(c.id).length, 0),
    [],
  );

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    return componentCategories.map(category => {
      const components = getComponentsByCategory(category.id);
      const filteredComponents = query
        ? components.filter(
            comp =>
              comp.name.toLowerCase().includes(query) ||
              comp.type.toLowerCase().includes(query)
          )
        : components;
      
      return {
        category,
        components: filteredComponents,
      };
    }).filter(item => item.components.length > 0);
  }, [searchQuery]);

  return (
    <div className={`component-panel ${collapsed ? 'collapsed' : ''}`}>
      {/* Header mirrors the screen manager: left twisty, title, count badge,
          the whole bar toggles collapse. */}
      <div
        className="cp-header"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <PanelChevron open={!collapsed} className="cp-toggle" />
        <span className="cp-title">Components</span>
        <span className="cp-count">{componentCount}</span>
      </div>

      {!collapsed && (
        <>
          <div className="search-box">
            <input
              type="text"
              placeholder="Search components..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')}>
                ×
              </button>
            )}
          </div>

          <div className="categories-container">
            {filteredCategories.map(({ category, components }) => (
              <CategorySection
                key={category.id}
                category={category}
                components={components}
                isCollapsed={collapsedCategories.has(category.id)}
                onToggle={() => toggleCategory(category.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ComponentPanel;
