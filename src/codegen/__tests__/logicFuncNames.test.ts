import { describe, it, expect } from 'vitest';
import { generateLogicSource } from '../templates/ui_logic.c';
import { generateLogicHeader } from '../templates/ui_logic.h';
import { getLogicFuncNames } from '../utils/nameUtils';
import { createLogicGraph, createLogicNode, defaultOptions } from './helpers';

/** Two graphs carrying the same name, which the editor does not prevent. */
const duplicates = () => [
  createLogicGraph({ id: 'g1', name: 'New Logic Graph' }),
  createLogicGraph({ id: 'g2', name: 'New Logic Graph' }),
];

function definitionsOf(source: string, name: string): number {
  return source.match(new RegExp(`^void ${name}\\(void\\) \\{`, 'gm'))?.length ?? 0;
}

describe('getLogicFuncNames', () => {
  it('leaves a unique name exactly as it was', () => {
    const names = getLogicFuncNames([{ id: 'g1', name: 'New Logic Graph' }]);
    expect(names.get('g1')).toBe('logic_new_logic_graph');
  });

  it('suffixes the later of two identical names', () => {
    const names = getLogicFuncNames(duplicates());
    expect(names.get('g1')).toBe('logic_new_logic_graph');
    expect(names.get('g2')).toBe('logic_new_logic_graph_2');
  });

  it('separates names that only differ by punctuation', () => {
    // Both sanitise to the same identifier, so the collision is invisible in
    // the editor and only appears in the generated C
    const names = getLogicFuncNames([
      { id: 'g1', name: 'Pump control' },
      { id: 'g2', name: 'Pump-control' },
    ]);
    expect(names.get('g2')).not.toBe(names.get('g1'));
  });

  it('steps past a suffix a real graph already occupies', () => {
    const names = getLogicFuncNames([
      { id: 'g1', name: 'Alarm' },
      { id: 'g2', name: 'Alarm 2' },
      { id: 'g3', name: 'Alarm' },
    ]);
    expect(names.get('g2')).toBe('logic_alarm_2');
    expect(names.get('g3')).toBe('logic_alarm_3');
  });
});

describe('ui_logic.c with duplicate graph names', () => {
  it('defines each graph once, under its own name', () => {
    // The bug this covers stopped the firmware build at
    // "redefinition of 'logic_new_logic_graph'"
    const source = generateLogicSource(defaultOptions(), duplicates());
    expect(definitionsOf(source, 'logic_new_logic_graph')).toBe(1);
    expect(definitionsOf(source, 'logic_new_logic_graph_2')).toBe(1);
  });

  it('gives the timer callbacks separate names too', () => {
    const graphs = [
      createLogicGraph({
        id: 'g1',
        name: 'Poll',
        nodes: [createLogicNode('timer_trigger', { params: { duration: 1000, mode: 'repeat' } })],
      }),
      createLogicGraph({
        id: 'g2',
        name: 'Poll',
        nodes: [createLogicNode('timer_trigger', { params: { duration: 500, mode: 'repeat' } })],
      }),
    ];
    const source = generateLogicSource(defaultOptions(), graphs);
    expect(source).toContain('static void logic_poll_timer_cb(lv_timer_t *timer)');
    expect(source).toContain('static void logic_poll_2_timer_cb(lv_timer_t *timer)');
  });

  it('still generates the plain name when nothing collides', () => {
    const source = generateLogicSource(defaultOptions(), [
      createLogicGraph({ id: 'g1', name: 'New Logic Graph' }),
    ]);
    expect(source).toContain('void logic_new_logic_graph(void) {');
    expect(source).not.toContain('logic_new_logic_graph_2');
  });
});

describe('ui_logic.h and ui_logic.c agree', () => {
  it('declares every name the source defines', () => {
    const graphs = duplicates();
    const header = generateLogicHeader(defaultOptions(), graphs);
    const source = generateLogicSource(defaultOptions(), graphs);

    for (const name of ['logic_new_logic_graph', 'logic_new_logic_graph_2']) {
      expect(header).toContain(`void ${name}(void);`);
      expect(definitionsOf(source, name)).toBe(1);
    }
  });
});
