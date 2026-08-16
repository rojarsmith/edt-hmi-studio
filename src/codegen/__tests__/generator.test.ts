import { describe, it, expect } from 'vitest';
import { generateCode, generateSingleFile, getGeneratedFileNames } from '../generator';
import { createScreen, createComponent, createEvent, createBuiltinAction, createFontResource, createLogicGraph, createLogicNode, createLogicPort, createLogicConnection, createModbusTag } from './helpers';
import type { GeneratedCode } from '../types';

describe('getGeneratedFileNames', () => {
  it('returns all 6 file names', () => {
    const names = getGeneratedFileNames();
    expect(names).toEqual(['ui.h', 'ui.c', 'ui_events.h', 'ui_events.c', 'ui_logic.h', 'ui_logic.c']);
  });

  it('returns the correct length', () => {
    expect(getGeneratedFileNames()).toHaveLength(6);
  });
});

describe('disabled logic graphs', () => {
  it('a graph switched off is absent from ui_logic.c and ui_logic.h; absent enabled means on', () => {
    const running = createLogicGraph({
      name: 'runs',
      nodes: [createLogicNode('timer_trigger', { outputs: [] })],
    });
    const parked = createLogicGraph({
      name: 'parked',
      enabled: false,
      nodes: [createLogicNode('timer_trigger', { outputs: [] })],
    });
    const code = generateCode([createScreen({ name: 'main' })], {}, [running, parked]);
    expect(code['ui_logic.c']).toContain('logic_runs');
    expect(code['ui_logic.c']).not.toContain('logic_parked');
    expect(code['ui_logic.h']).toContain('logic_runs');
    expect(code['ui_logic.h']).not.toContain('logic_parked');
  });

  it('generateSingleFile applies the same off switch', () => {
    const parked = createLogicGraph({
      name: 'parked',
      enabled: false,
      nodes: [createLogicNode('timer_trigger', { outputs: [] })],
    });
    const result = generateSingleFile([createScreen({ name: 'main' })], 'ui_logic.c', {}, [parked]);
    expect(result).not.toContain('logic_parked');
  });
});

describe('protocol tags through generateCode', () => {
  it('threads tags to ui_logic.c so Write Tag reaches the runtime', () => {
    const tag = createModbusTag({ id: 'sp-tag', name: 'SetPoint', address: 7 });
    const trigger = createLogicNode('event_trigger', {
      id: 'trigger',
      params: { eventType: 'LV_EVENT_CLICKED', targetComponent: 'button' },
      inputs: [],
      outputs: [createLogicPort({ id: 'execute', name: 'Execute', type: 'execution' })],
    });
    const writeNode = createLogicNode('tag_write', {
      id: 'tagwrite',
      type: 'data',
      params: { tagId: 'sp-tag', tagName: 'SetPoint' },
      inputs: [
        createLogicPort({ id: 'exec', name: 'Execute', type: 'execution' }),
        createLogicPort({ id: 'val', name: 'Value', type: 'any', defaultValue: 42 }),
      ],
      outputs: [createLogicPort({ id: 'done', name: 'Done', type: 'execution' })],
    });
    const graph = createLogicGraph({
      name: 'command',
      nodes: [trigger, writeNode],
      connections: [
        createLogicConnection({
          sourceNode: 'trigger',
          sourceOutput: 'execute',
          targetNode: 'tagwrite',
          targetInput: '',
          type: 'execution',
        }),
      ],
    });

    const code = generateCode(
      [createScreen({ name: 'main' })],
      {},
      [graph],
      undefined,
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      [],
      [tag],
    );
    expect(code['ui_logic.c']).toContain(
      '(void)hmi_runtime_write_holding_register(7U, (float)(42));',
    );
  });
});

describe('generateCode', () => {
  it('returns an object with all 6 file keys', () => {
    const code = generateCode([]);
    const keys = Object.keys(code) as (keyof GeneratedCode)[];
    expect(keys).toEqual(['ui.h', 'ui.c', 'ui_events.h', 'ui_events.c', 'ui_logic.h', 'ui_logic.c']);
  });

  it('all values are non-empty strings', () => {
    const code = generateCode([createScreen({ name: 'main' })]);
    for (const content of Object.values(code)) {
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('generates correct ui.h content', () => {
    const screens = [createScreen({ name: 'home' })];
    const code = generateCode(screens);
    expect(code['ui.h']).toContain('#ifndef UI_H');
    expect(code['ui.h']).toContain('extern lv_obj_t *ui_screen_home;');
    expect(code['ui.h']).toContain('void ui_init(void);');
  });

  it('generates correct ui_events.h content', () => {
    const btn = createComponent('btn', {
      name: 'myBtn',
      events: [createEvent({ eventType: 'LV_EVENT_CLICKED' })],
    });
    const screens = [createScreen({ name: 'main', components: [btn] })];
    const code = generateCode(screens);
    expect(code['ui_events.h']).toContain('#ifndef UI_EVENTS_H');
    expect(code['ui_events.h']).toContain('ui_event_my_btn_clicked');
  });

  it('generates correct ui_events.c content', () => {
    const btn = createComponent('btn', {
      name: 'myBtn',
      events: [createEvent({
        eventType: 'LV_EVENT_CLICKED',
        handlerType: 'builtin',
        action: createBuiltinAction({ type: 'show', targetComponent: 'panel' }),
      })],
    });
    const screens = [createScreen({ name: 'main', components: [btn] })];
    const code = generateCode(screens);
    expect(code['ui_events.c']).toContain('#include "ui.h"');
    expect(code['ui_events.c']).toContain('lv_obj_clear_flag(ui_panel, LV_OBJ_FLAG_HIDDEN)');
  });

  it('handles empty screens', () => {
    const code = generateCode([]);
    expect(code['ui.h']).toContain('#ifndef UI_H');
    expect(code['ui_events.h']).toContain('#ifndef UI_EVENTS_H');
  });

  it('applies custom options', () => {
    const btn = createComponent('btn', { name: 'my_button' });
    const screens = [createScreen({ name: 'main_page', components: [btn] })];
    const code = generateCode(screens, { namingStyle: 'camelCase', generateComments: false });
    expect(code['ui.h']).toContain('ui_screen_mainPage');
    expect(code['ui.h']).toContain('ui_myButton');
    expect(code['ui.h']).not.toContain('Screen Declarations');
  });

  it('passes font resources to ui.h', () => {
    const font = createFontResource({ cFontName: 'font_custom', sizes: [12] });
    const screens = [
      createScreen({
        components: [
          createComponent('label', {
            name: 'title',
            props: { text: 'x', fontResource: 'font_custom', fontSize: 12 },
          }),
        ],
      }),
    ];
    const code = generateCode(screens, {}, [], undefined, [], [font]);
    expect(code['ui.h']).toContain('LV_FONT_DECLARE(font_custom_12);');
  });

  it('uses default options when none provided', () => {
    const code = generateCode([createScreen({ name: 'test' })]);
    // Default has generateComments: true
    expect(code['ui.h']).toContain('Screen Declarations');
  });
});

describe('generateSingleFile', () => {
  it('returns ui.h content', () => {
    const screens = [createScreen({ name: 'main' })];
    const content = generateSingleFile(screens, 'ui.h');
    expect(content).toContain('#ifndef UI_H');
    expect(content).toContain('extern lv_obj_t *ui_screen_main;');
  });

  it('returns ui.c content', () => {
    const screens = [createScreen({ name: 'main' })];
    const content = generateSingleFile(screens, 'ui.c');
    expect(content).toContain('#include "ui.h"');
  });

  it('returns ui_events.h content', () => {
    const content = generateSingleFile([], 'ui_events.h');
    expect(content).toContain('#ifndef UI_EVENTS_H');
  });

  it('returns ui_events.c content', () => {
    const content = generateSingleFile([], 'ui_events.c');
    expect(content).toContain('#include "ui_events.h"');
  });

  it('returns ui_logic.h content', () => {
    const content = generateSingleFile([], 'ui_logic.h');
    expect(content).toContain('#ifndef UI_LOGIC_H');
  });

  it('returns ui_logic.c content', () => {
    const content = generateSingleFile([], 'ui_logic.c');
    expect(content).toContain('#include "ui_logic.h"');
  });

  it('applies custom options', () => {
    const btn = createComponent('btn', { name: 'my_button' });
    const screens = [createScreen({ name: 'main', components: [btn] })];
    const content = generateSingleFile(screens, 'ui.h', { namingStyle: 'camelCase' });
    expect(content).toContain('ui_myButton');
  });

  it('matches corresponding generateCode output', () => {
    const screens = [createScreen({ name: 'main' })];
    const opts = { generateComments: true };
    const allCode = generateCode(screens, opts);
    const single = generateSingleFile(screens, 'ui.h', opts);
    expect(single).toBe(allCode['ui.h']);
  });
});
