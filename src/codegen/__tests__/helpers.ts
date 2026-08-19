// Test helpers and factory functions for codegen tests

import type { Screen, LvglComponent, EventBinding, Animation, StyleProps, Theme, BuiltinAction } from '../../types';
import type { CodeGenOptions } from '../types';
import type { ImageResource, FontResource } from '../../resources/types';
import type { ModbusRegisterTag } from '../../types/hmi';
import type { LogicGraph, LogicNode, LogicConnection, LogicVariable, LogicNodeCategory, LogicNodeSubType, LogicPort } from '../../components/LogicEditor/types';
import { DEFAULT_CODEGEN_OPTIONS } from '../types';

let _idCounter = 0;
function uid(): string {
  return `test-${++_idCounter}`;
}

export function resetIdCounter(): void {
  _idCounter = 0;
}

export function defaultOptions(overrides: Partial<CodeGenOptions> = {}): CodeGenOptions {
  return { ...DEFAULT_CODEGEN_OPTIONS, ...overrides };
}

export function createModbusTag(
  overrides: Partial<ModbusRegisterTag> = {}
): ModbusRegisterTag {
  return {
    id: overrides.id ?? uid(),
    name: 'tag',
    area: 'holding-register',
    address: 0,
    dataType: 'uint16',
    access: 'readwrite',
    scale: 1,
    pollIntervalMs: 250,
    ...overrides,
  };
}

export function createStyleProps(overrides: Partial<StyleProps> = {}): StyleProps {
  return { ...overrides };
}

export function createComponent(
  type: string = 'obj',
  overrides: Partial<LvglComponent> = {}
): LvglComponent {
  const id = overrides.id ?? uid();
  return {
    id,
    type,
    name: overrides.name ?? `${type}_${id}`,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
    ...overrides,
  };
}

export function createScreen(overrides: Partial<Screen> = {}): Screen {
  return {
    id: overrides.id ?? uid(),
    name: overrides.name ?? 'main',
    components: [],
    ...overrides,
  };
}

export function createEvent(overrides: Partial<EventBinding> = {}): EventBinding {
  return {
    id: overrides.id ?? uid(),
    eventType: 'LV_EVENT_CLICKED',
    handlerType: 'builtin',
    ...overrides,
  };
}

export function createBuiltinAction(overrides: Partial<BuiltinAction> = {}): BuiltinAction {
  return {
    type: 'navigate',
    ...overrides,
  };
}

export function createAnimation(overrides: Partial<Animation> = {}): Animation {
  return {
    id: overrides.id ?? uid(),
    name: 'fade_in_anim',
    targetComponentId: 'comp1',
    type: 'fade_in',
    easing: 'linear',
    duration: 500,
    delay: 0,
    repeat: 0,
    property: 'opa',
    startValue: 0,
    endValue: 255,
    ...overrides,
  };
}

export function createTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: overrides.id ?? uid(),
    name: 'Default',
    colors: {
      primary: '#2196F3',
      secondary: '#FF9800',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      text: '#212121',
      border: '#E0E0E0',
      ...overrides.colors,
    },
    ...overrides,
  };
}

export function createImageResource(overrides: Partial<ImageResource> = {}): ImageResource {
  return {
    id: overrides.id ?? uid(),
    name: 'test_image',
    originalName: 'test.png',
    width: 64,
    height: 64,
    format: 'RGB565',
    data: 'base64data',
    cArrayName: 'img_test_image',
    size: 1024,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createFontResource(overrides: Partial<FontResource> = {}): FontResource {
  return {
    id: overrides.id ?? uid(),
    name: 'custom_font',
    family: 'Roboto',
    style: 'Regular',
    sizes: [16, 24],
    // 'preset' + 'ascii' is what these fixtures meant before charsetMode existed
    charsetMode: 'preset',
    charset: 'ascii',
    bpp: 4,
    data: 'base64fontdata',
    cFontName: 'font_roboto',
    size: 2048,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createLogicPort(overrides: Partial<LogicPort> = {}): LogicPort {
  return {
    id: overrides.id ?? uid(),
    name: 'output',
    type: 'execution',
    ...overrides,
  };
}

export function createLogicNode(
  subType: LogicNodeSubType = 'event_trigger',
  overrides: Partial<LogicNode> = {}
): LogicNode {
  const categoryMap: Record<string, LogicNodeCategory> = {
    event_trigger: 'trigger',
    timer_trigger: 'trigger',
    if_else: 'flow',
    switch: 'flow',
    compare: 'data',
    logic_op: 'data',
    set_property: 'screen',
    navigate_page: 'screen',
    show_hide: 'screen',
    set_text: 'screen',
    set_value: 'screen',
    call_function: 'custom',
    delay: 'flow',
    var_read: 'data',
    var_write: 'data',
    math_op: 'data',
    string_op: 'data',
    get_property: 'screen',
    modbus_holding_register: 'device',
    c_code_block: 'custom',
  };

  return {
    id: overrides.id ?? uid(),
    type: categoryMap[subType] || 'action',
    subType,
    label: overrides.label ?? subType,
    position: { x: 0, y: 0 },
    params: {},
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

export function createLogicConnection(overrides: Partial<LogicConnection> = {}): LogicConnection {
  return {
    id: overrides.id ?? uid(),
    sourceNode: 'node1',
    sourceOutput: 'out1',
    targetNode: 'node2',
    targetInput: 'in1',
    type: 'execution',
    ...overrides,
  };
}

export function createLogicVariable(overrides: Partial<LogicVariable> = {}): LogicVariable {
  return {
    id: overrides.id ?? uid(),
    name: 'counter',
    type: 'int',
    defaultValue: 0,
    ...overrides,
  };
}

export function createLogicGraph(overrides: Partial<LogicGraph> = {}): LogicGraph {
  return {
    id: overrides.id ?? uid(),
    name: 'test_graph',
    nodes: [],
    connections: [],
    variables: [],
    ...overrides,
  };
}

/**
 * A component and the project animations aimed at it. Animations are
 * project-level assets, so a test needs both halves: the widget on a screen,
 * and the animation naming it from the project list.
 */
export function animatedComponent(
  type: string,
  overrides: Partial<LvglComponent>,
  ...animations: (Partial<Animation> | undefined)[]
): { component: LvglComponent; animations: Animation[] } {
  const component = createComponent(type, overrides);
  return {
    component,
    animations: animations.map((animation) =>
      createAnimation({ targetComponentId: component.id, ...animation }),
    ),
  };
}
