import { describe, expect, it } from 'vitest';
import {
  NODE_CATEGORIES,
  NODE_DEFINITIONS,
  getNodesByCategory,
  getPaletteCategories,
} from '../nodeDefinitions';

// The palette regrouping is display-level only (docs/logic-node-taxonomy.md
// decision 3): these tests pin the shelves without touching stored types.
describe('palette grouping', () => {
  it('every definition sits on a declared shelf', () => {
    const shelfIds = new Set(NODE_CATEGORIES.map(category => category.id));
    for (const def of NODE_DEFINITIONS) {
      expect(shelfIds, `${def.subType} has no shelf`).toContain(
        def.paletteGroup ?? def.type
      );
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

  it('regrouping left every stored node type untouched', () => {
    // The five stored categories keep their populations - this is the
    // "presentation first, data never forced" contract.
    const byType = (type: string) =>
      NODE_DEFINITIONS.filter(def => def.type === type).length;
    expect(byType('trigger')).toBe(2);
    expect(byType('condition')).toBe(4);
    expect(byType('action')).toBe(7);
    expect(byType('data')).toBe(8);
    expect(byType('custom')).toBe(1);
  });
});
