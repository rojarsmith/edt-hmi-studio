import { describe, expect, it } from 'vitest';
import type { LogicGraph } from '../types';
import {
  NODE_CATEGORIES,
  NODE_DEFINITIONS,
  getNodesByCategory,
  getPaletteCategories,
  normalizeLogicGraphs,
  normalizeLogicNodeCategory,
} from '../nodeDefinitions';

describe('palette grouping', () => {
  it('every definition sits on a declared shelf', () => {
    const shelfIds = new Set(NODE_CATEGORIES.map(category => category.id));
    for (const def of NODE_DEFINITIONS) {
      expect(shelfIds, `${def.subType} has no shelf`).toContain(def.type);
    }
  });

  it('shelves hold what the taxonomy table says', () => {
    const shelf = (id: string) =>
      getNodesByCategory(id).map(def => def.subType).sort();

    expect(shelf('trigger')).toEqual(['event_trigger', 'timer_trigger']);
    expect(shelf('flow')).toEqual(['delay', 'if_else', 'switch']);
    expect(shelf('screen')).toEqual([
      'get_property',
      'navigate_page',
      'set_property',
      'set_text',
      'set_value',
      'show_hide',
    ]);
    expect(shelf('data')).toEqual([
      'compare',
      'logic_op',
      'math_op',
      'string_op',
      'var_read',
      'var_write',
    ]);
    expect(shelf('device')).toEqual(['tag_read', 'tag_write']);
    expect(shelf('custom')).toEqual(['c_code_block', 'call_function']);
  });

  it('a deprecated node is on no shelf, but keeps its definition', () => {
    const shelved = NODE_CATEGORIES.flatMap(category =>
      getNodesByCategory(category.id)
    );
    expect(shelved.some(def => def.subType === 'modbus_holding_register')).toBe(false);
    expect(
      NODE_DEFINITIONS.some(def => def.subType === 'modbus_holding_register')
    ).toBe(true);
  });

  it('the Custom shelf exists only in factory dev mode', () => {
    const normal = getPaletteCategories(false).map(category => category.id);
    const factory = getPaletteCategories(true).map(category => category.id);
    expect(normal).toEqual(['trigger', 'flow', 'screen', 'data', 'device']);
    expect(factory).toEqual(['trigger', 'flow', 'screen', 'data', 'device', 'custom']);
  });
});

// Old spellings live in every project saved before the 2026-08 rename;
// the subType is the authority and old files must read forever.
describe('category normalization', () => {
  it('re-derives pre-rename categories from the subType', () => {
    expect(normalizeLogicNodeCategory('if_else', 'condition')).toBe('flow');
    expect(normalizeLogicNodeCategory('compare', 'condition')).toBe('data');
    expect(normalizeLogicNodeCategory('delay', 'action')).toBe('flow');
    expect(normalizeLogicNodeCategory('set_text', 'action')).toBe('screen');
    expect(normalizeLogicNodeCategory('get_property', 'data')).toBe('screen');
    expect(normalizeLogicNodeCategory('call_function', 'action')).toBe('custom');
    expect(normalizeLogicNodeCategory('modbus_holding_register', 'data')).toBe('device');
    expect(normalizeLogicNodeCategory('event_trigger', 'trigger')).toBe('trigger');
  });

  it('an unknown subType keeps a valid stored category and defaults to custom otherwise', () => {
    expect(normalizeLogicNodeCategory('from_the_future', 'device')).toBe('device');
    expect(normalizeLogicNodeCategory('from_the_future', 'condition')).toBe('custom');
  });

  it('normalizes graphs while keeping identity for clean ones', () => {
    const stale: LogicGraph = {
      id: 'g1',
      name: 'old project',
      nodes: [
        {
          id: 'n1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: 'condition' as any,
          subType: 'if_else',
          label: 'If/Else',
          position: { x: 0, y: 0 },
          params: {},
          inputs: [],
          outputs: [],
        },
      ],
      connections: [],
      variables: [],
    };
    const clean: LogicGraph = { ...stale, id: 'g2', nodes: [] };

    const result = normalizeLogicGraphs([stale, clean]);
    expect(result[0].nodes[0].type).toBe('flow');
    // untouched graphs keep reference identity
    expect(result[1]).toBe(clean);
  });
});
