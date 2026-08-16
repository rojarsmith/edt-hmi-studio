// Logic Node Definitions - All available node types

import type { LogicNodeDefinition } from './types';

// Color scheme for node categories
export const NODE_COLORS = {
  trigger: '#4CAF50',   // Green
  condition: '#FFC107', // Yellow/Amber
  action: '#2196F3',    // Blue
  data: '#9C27B0',      // Purple
  custom: '#607D8B',    // Gray
};

// All node definitions
export const NODE_DEFINITIONS: LogicNodeDefinition[] = [
  // ============ TRIGGER NODES (Green) ============
  {
    type: 'trigger',
    subType: 'event_trigger',
    paletteGroup: 'trigger',
    label: 'Event Trigger',
    description: 'Receives events from a component',
    icon: '⚡',
    color: NODE_COLORS.trigger,
    defaultParams: {
      eventType: 'LV_EVENT_CLICKED',
    },
    inputs: [],
    outputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Event Object', type: 'any' },
    ],
  },
  {
    type: 'trigger',
    subType: 'timer_trigger',
    paletteGroup: 'trigger',
    label: 'Timer Trigger',
    description: 'Runs after a delay or at an interval',
    icon: '⏱️',
    color: NODE_COLORS.trigger,
    defaultParams: {
      mode: 'delay', // 'delay' | 'interval'
      duration: 1000, // ms
    },
    inputs: [
      { name: 'Start', type: 'execution' },
    ],
    outputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Count', type: 'int' },
    ],
  },

  // ============ CONDITION NODES (Yellow) ============
  {
    type: 'condition',
    subType: 'if_else',
    paletteGroup: 'flow',
    label: 'If/Else',
    description: 'Conditional branch',
    icon: '🔀',
    color: NODE_COLORS.condition,
    defaultParams: {},
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Condition', type: 'bool' },
    ],
    outputs: [
      { name: 'True', type: 'execution' },
      { name: 'False', type: 'execution' },
    ],
  },
  {
    type: 'condition',
    subType: 'switch',
    paletteGroup: 'flow',
    label: 'Switch',
    description: 'Multi-branch selection',
    icon: '🔃',
    color: NODE_COLORS.condition,
    defaultParams: {
      cases: [0, 1, 2],
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Value', type: 'int' },
    ],
    outputs: [
      { name: 'Case 0', type: 'execution' },
      { name: 'Case 1', type: 'execution' },
      { name: 'Case 2', type: 'execution' },
      { name: 'Default', type: 'execution' },
    ],
  },
  {
    type: 'condition',
    subType: 'compare',
    paletteGroup: 'data',
    label: 'Compare',
    description: 'Compares two values',
    icon: '⚖️',
    color: NODE_COLORS.condition,
    defaultParams: {
      operator: '==',
    },
    inputs: [
      { name: 'A', type: 'any' },
      { name: 'B', type: 'any' },
    ],
    outputs: [
      { name: 'Result', type: 'bool' },
    ],
  },
  {
    type: 'condition',
    subType: 'logic_op',
    paletteGroup: 'data',
    label: 'Logic Operation',
    description: 'AND, OR, NOT',
    icon: '🔗',
    color: NODE_COLORS.condition,
    defaultParams: {
      operator: 'AND',
    },
    inputs: [
      { name: 'A', type: 'bool' },
      { name: 'B', type: 'bool' },
    ],
    outputs: [
      { name: 'Result', type: 'bool' },
    ],
  },

  // ============ ACTION NODES (Blue) ============
  {
    type: 'action',
    subType: 'set_property',
    paletteGroup: 'screen',
    label: 'Set Property',
    description: 'Changes a component property',
    icon: '🎨',
    color: NODE_COLORS.action,
    defaultParams: {
      targetComponent: '',
      property: '',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Value', type: 'any' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    type: 'action',
    subType: 'navigate_page',
    paletteGroup: 'screen',
    label: 'Navigate to Screen',
    description: 'Switches to the specified screen',
    icon: '📄',
    color: NODE_COLORS.action,
    defaultParams: {
      targetScreen: '',
      animation: 'none',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    type: 'action',
    subType: 'show_hide',
    paletteGroup: 'screen',
    label: 'Show/Hide',
    description: 'Controls component visibility',
    icon: '👁️',
    color: NODE_COLORS.action,
    defaultParams: {
      targetComponent: '',
      action: 'toggle', // 'show' | 'hide' | 'toggle'
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    type: 'action',
    subType: 'set_text',
    paletteGroup: 'screen',
    label: 'Set Text',
    description: 'Changes text content',
    icon: '📝',
    color: NODE_COLORS.action,
    defaultParams: {
      targetComponent: '',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Text', type: 'string' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    type: 'action',
    subType: 'set_value',
    paletteGroup: 'screen',
    label: 'Set Value',
    description: 'Changes a numeric value',
    icon: '🔢',
    color: NODE_COLORS.action,
    defaultParams: {
      targetComponent: '',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Number', type: 'int' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    type: 'action',
    subType: 'call_function',
    paletteGroup: 'custom',
    label: 'Call Function',
    description: 'Calls a custom C function',
    icon: '📞',
    color: NODE_COLORS.action,
    defaultParams: {
      functionName: '',
      arguments: [],
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Argument 1', type: 'any' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
      { name: 'Return Value', type: 'any' },
    ],
  },
  {
    type: 'action',
    subType: 'delay',
    paletteGroup: 'flow',
    label: 'Delay',
    description: 'Waits for the specified time',
    icon: '⏳',
    color: NODE_COLORS.action,
    defaultParams: {
      duration: 1000, // ms
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },

  // ============ DATA NODES (Purple) ============
  {
    type: 'data',
    subType: 'var_read',
    paletteGroup: 'data',
    label: 'Read Variable',
    description: 'Reads a global or local variable',
    icon: '📖',
    color: NODE_COLORS.data,
    defaultParams: {
      variableId: '',
    },
    inputs: [],
    outputs: [
      { name: 'Value', type: 'any' },
    ],
  },
  {
    type: 'data',
    subType: 'var_write',
    paletteGroup: 'data',
    label: 'Write Variable',
    description: 'Sets a variable value',
    icon: '✏️',
    color: NODE_COLORS.data,
    defaultParams: {
      variableId: '',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Value', type: 'any' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    type: 'data',
    subType: 'math_op',
    paletteGroup: 'data',
    label: 'Math Operation',
    description: 'Add, subtract, multiply, divide, or modulo',
    icon: '🧮',
    color: NODE_COLORS.data,
    defaultParams: {
      operator: '+',
    },
    inputs: [
      { name: 'A', type: 'float' },
      { name: 'B', type: 'float' },
    ],
    outputs: [
      { name: 'Result', type: 'float' },
    ],
  },
  {
    type: 'data',
    subType: 'string_op',
    paletteGroup: 'data',
    label: 'String Operation',
    description: 'Concatenates or formats strings',
    icon: '🔤',
    color: NODE_COLORS.data,
    defaultParams: {
      operation: 'concat',
    },
    inputs: [
      { name: 'A', type: 'string' },
      { name: 'B', type: 'string' },
    ],
    outputs: [
      { name: 'Result', type: 'string' },
    ],
  },
  {
    type: 'data',
    subType: 'get_property',
    paletteGroup: 'screen',
    label: 'Get Property',
    description: 'Reads the current component property value',
    icon: '🔍',
    color: NODE_COLORS.data,
    defaultParams: {
      targetComponent: '',
      property: '',
    },
    inputs: [],
    outputs: [
      { name: 'Value', type: 'any' },
    ],
  },
  {
    type: 'data',
    subType: 'tag_read',
    paletteGroup: 'device',
    label: 'Read Tag',
    description: 'Reads a protocol tag defined on the Protocol tab',
    icon: '📥',
    color: NODE_COLORS.data,
    defaultParams: {
      tagId: '',
      tagName: '',
    },
    inputs: [],
    outputs: [
      { name: 'Value', type: 'any' },
    ],
  },
  {
    type: 'data',
    subType: 'tag_write',
    paletteGroup: 'device',
    label: 'Write Tag',
    description: 'Writes a value to a protocol tag',
    icon: '📤',
    color: NODE_COLORS.data,
    defaultParams: {
      tagId: '',
      tagName: '',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Value', type: 'any' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    // Superseded by Read Tag: an address typed into a node is exactly the
    // protocol coupling the tag table exists to prevent. Saved graphs keep
    // working; the palette no longer offers it.
    deprecated: true,
    type: 'data',
    subType: 'modbus_holding_register',
    paletteGroup: 'device',
    label: 'Read Holding Register',
    description: 'Reads a cached Modbus Holding Register value',
    icon: '📥',
    color: NODE_COLORS.data,
    defaultParams: {
      address: 0,
    },
    inputs: [],
    outputs: [
      { name: 'Value', type: 'int' },
    ],
  },

  // ============ CUSTOM NODES (Gray) ============
  {
    type: 'custom',
    subType: 'c_code_block',
    paletteGroup: 'custom',
    label: 'C Code Block',
    description: 'Embeds custom C code',
    icon: '💻',
    color: NODE_COLORS.custom,
    defaultParams: {
      code: '// Custom code\n',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Input 1', type: 'any' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
      { name: 'Output 1', type: 'any' },
    ],
  },
];

// Get node definition by subType
export function getNodeDefinition(subType: string): LogicNodeDefinition | undefined {
  return NODE_DEFINITIONS.find(def => def.subType === subType);
}

// Get nodes for one palette shelf (display grouping - deprecated stays hidden)
export function getNodesByCategory(category: string): LogicNodeDefinition[] {
  return NODE_DEFINITIONS.filter(
    def => (def.paletteGroup ?? def.type) === category && !def.deprecated
  );
}

// Palette shelves, grouped by what the author operates on - time and flow,
// the screen, values, the machine. Display-level only: stored node types and
// the colours keyed off them are untouched (docs/logic-node-taxonomy.md).
export const NODE_CATEGORIES = [
  { id: 'trigger', name: 'Triggers', icon: '⚡', color: NODE_COLORS.trigger },
  { id: 'flow', name: 'Flow', icon: '🔀', color: NODE_COLORS.condition },
  { id: 'screen', name: 'Screen', icon: '🖥️', color: NODE_COLORS.action },
  { id: 'data', name: 'Data', icon: '📊', color: NODE_COLORS.data },
  { id: 'device', name: 'Device', icon: '🔌', color: '#00bcd4' },
  { id: 'custom', name: 'Custom', icon: '💻', color: NODE_COLORS.custom },
];

// The Custom shelf is the factory engineer's realm - hand-written C has no
// place in a no-code author's palette, the same reasoning that moved the
// Code and Icon tabs behind Factory Dev Mode. Nodes already placed in a
// graph keep rendering and generating in every mode; only the offer hides.
export function getPaletteCategories(factoryDevMode: boolean) {
  return factoryDevMode
    ? NODE_CATEGORIES
    : NODE_CATEGORIES.filter(category => category.id !== 'custom');
}
