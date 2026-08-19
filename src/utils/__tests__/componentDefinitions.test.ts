import { describe, it, expect } from 'vitest';
import {
  componentDefinitions,
  componentCategories,
  getComponentDefinition,
  getComponentsByCategory,
} from '../componentDefinitions';

describe('componentDefinitions', () => {
  // --- getComponentDefinition ---
  describe('getComponentDefinition', () => {
    it('should return definition for btn type', () => {
      const def = getComponentDefinition('btn');
      expect(def).toBeDefined();
      expect(def!.type).toBe('btn');
      expect(def!.name).toBe('Button');
      expect(def!.isContainer).toBe(true);
    });

    it('should return definition for label type', () => {
      const def = getComponentDefinition('label');
      expect(def).toBeDefined();
      expect(def!.type).toBe('label');
      expect(def!.name).toBe('Label');
      expect(def!.isContainer).toBe(false);
    });

    it('should return undefined for unknown type', () => {
      const def = getComponentDefinition('nonexistent');
      expect(def).toBeUndefined();
    });

    it('should return definition with default styles', () => {
      const def = getComponentDefinition('slider');
      expect(def).toBeDefined();
      expect(def!.defaultStyles).toBeDefined();
      expect(def!.defaultStyles.default).toBeDefined();
      expect(def!.defaultStyles.default.bgColor).toBeDefined();
    });

    it('should return definition with default props', () => {
      const def = getComponentDefinition('slider');
      expect(def).toBeDefined();
      expect(def!.defaultProps).toHaveProperty('min');
      expect(def!.defaultProps).toHaveProperty('max');
      expect(def!.defaultProps).toHaveProperty('value');
    });

    it('should return definition with correct dimensions', () => {
      const def = getComponentDefinition('btn');
      expect(def).toBeDefined();
      expect(def!.defaultWidth).toBe(100);
      expect(def!.defaultHeight).toBe(40);
    });
  });

  // --- getComponentsByCategory ---
  describe('getComponentsByCategory', () => {
    it('should return basic components', () => {
      const basics = getComponentsByCategory('basic');
      expect(basics.length).toBeGreaterThan(0);
      expect(basics.every(c => c.category === 'basic')).toBe(true);
    });

    it('should return input components', () => {
      const inputs = getComponentsByCategory('input');
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every(c => c.category === 'input')).toBe(true);
    });

    it('should return shape components', () => {
      const shapes = getComponentsByCategory('shape');
      expect(shapes.map(c => c.type)).toEqual(['rectangle', 'line']);
      expect(shapes.every(c => c.category === 'shape')).toBe(true);
      // Shapes are drawn, not filled with children
      expect(shapes.every(c => !c.isContainer)).toBe(true);
      // And every one of them reports the family, not its own name
      expect(shapes.every(c => c.typeName === 'Shape')).toBe(true);
    });

    it('should return container components', () => {
      const containers = getComponentsByCategory('container');
      expect(containers.length).toBeGreaterThan(0);
      expect(containers.every(c => c.category === 'container')).toBe(true);
      // All container components should have isContainer = true
      expect(containers.every(c => c.isContainer)).toBe(true);
    });

    it('should return display components', () => {
      const displays = getComponentsByCategory('display');
      expect(displays.length).toBeGreaterThan(0);
      expect(displays.every(c => c.category === 'display')).toBe(true);
    });

    it('should return empty array for unknown category', () => {
      const unknown = getComponentsByCategory('nonexistent');
      expect(unknown).toHaveLength(0);
    });
  });

  // --- all component types ---
  describe('all component types coverage', () => {
    const expectedTypes = [
      'btn', 'label', 'img', 'image-button', 'line',
      'textarea', 'dropdown', 'checkbox', 'switch', 'slider',
      'rectangle',
      'obj', 'tabview', 'tileview', 'win',
      'bar', 'arc', 'spinner', 'chart', 'table', 'calendar',
    ];

    it('should have at least 16 component definitions', () => {
      expect(componentDefinitions.length).toBeGreaterThanOrEqual(16);
    });

    it('should have all expected component types defined', () => {
      for (const type of expectedTypes) {
        const def = getComponentDefinition(type);
        expect(def, `Missing definition for type: ${type}`).toBeDefined();
      }
    });

    it('every definition should have required fields', () => {
      for (const def of componentDefinitions) {
        expect(def.type).toBeTruthy();
        expect(def.name).toBeTruthy();
        expect(def.icon).toBeTruthy();
        expect(def.category).toBeTruthy();
        expect(def.defaultWidth).toBeGreaterThan(0);
        expect(def.defaultHeight).toBeGreaterThan(0);
        expect(def.defaultStyles).toBeDefined();
        expect(def.defaultStyles.default).toBeDefined();
        expect(typeof def.isContainer).toBe('boolean');
      }
    });

    it('every definition should belong to a valid category', () => {
      const validCategoryIds = componentCategories.map(c => c.id);
      for (const def of componentDefinitions) {
        expect(validCategoryIds).toContain(def.category);
      }
    });

    it('all categories should have at least one component', () => {
      for (const cat of componentCategories) {
        const components = getComponentsByCategory(cat.id);
        expect(components.length, `Category "${cat.name}" has no components`).toBeGreaterThan(0);
      }
    });
  });

  describe('image-button definition', () => {
    it('provides an ordered two-state Resource Manager schema', () => {
      const def = getComponentDefinition('image-button');

      expect(def).toBeDefined();
      expect(def!.category).toBe('basic');
      expect(def!.isContainer).toBe(false);
      expect(def!.defaultProps).toEqual({
        states: [
          { id: 'state-1', name: 'State 1', imageId: '', value: 0 },
          { id: 'state-2', name: 'State 2', imageId: '', value: 1 },
        ],
        initialState: 0,
        currentState: 0,
        value: 0,
        cycleOnClick: true,
      });
    });
  });

  describe('line definition', () => {
    it('is a shape, drawn rather than operated', () => {
      const def = getComponentDefinition('line');

      expect(def).toBeDefined();
      expect(def!.name).toBe('Line');
      expect(def!.typeName).toBe('Shape');
      expect(def!.category).toBe('shape');
      expect(def!.isContainer).toBe(false);
      // Its points survived the move out of the basic category
      expect(def!.defaultProps.points).toEqual([[0, 0], [100, 0]]);
    });
  });

  describe('rectangle definition', () => {
    it('is a style-only shape reported as a Shape', () => {
      const def = getComponentDefinition('rectangle');

      expect(def).toBeDefined();
      expect(def!.name).toBe('Rectangle');
      expect(def!.typeName).toBe('Shape');
      expect(def!.category).toBe('shape');
      expect(def!.isContainer).toBe(false);
      // Everything a rectangle draws is a style, so it carries no props
      expect(def!.defaultProps).toEqual({});
      // Square corners, or it would not be the rectangle it is named after
      expect(def!.defaultStyles.default.borderRadius).toBe(0);
    });
  });

  // --- componentCategories ---
  describe('componentCategories', () => {
    it('should have 5 categories', () => {
      expect(componentCategories).toHaveLength(5);
    });

    it('should have basic, input, shape, container, display categories', () => {
      const ids = componentCategories.map(c => c.id);
      expect(ids).toContain('basic');
      expect(ids).toContain('input');
      expect(ids).toContain('shape');
      expect(ids).toContain('container');
      expect(ids).toContain('display');
    });

    it('lists Shapes between Input and Containers, as the palette shows them', () => {
      const ids = componentCategories.map(c => c.id);
      expect(ids.indexOf('shape')).toBe(ids.indexOf('input') + 1);
      expect(ids.indexOf('container')).toBe(ids.indexOf('shape') + 1);
    });
  });
});
