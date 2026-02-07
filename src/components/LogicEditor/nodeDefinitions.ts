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
    label: 'Event Trigger',
    description: 'Receives an event from a component',
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
    label: 'Timer Trigger',
    description: 'Runs after a delay or on an interval',
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
    label: 'Set property',
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
    label: 'Navigate to Page',
    description: 'Switch to the specified page',
    icon: '📄',
    color: NODE_COLORS.action,
    defaultParams: {
      targetPage: '',
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
    label: 'Show or hide',
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
    label: 'Set text',
    description: 'Changes the text',
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
    label: 'Set value',
    description: 'Changes a numeric property',
    icon: '🔢',
    color: NODE_COLORS.action,
    defaultParams: {
      targetComponent: '',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Value', type: 'int' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
    ],
  },
  {
    type: 'action',
    subType: 'call_function',
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
      { name: 'Parameters1', type: 'any' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
      { name: 'Return Value', type: 'any' },
    ],
  },
  {
    type: 'action',
    subType: 'delay',
    label: 'Delay',
    description: 'Waits for a set time',
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
    label: 'Reads a variable',
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
    label: 'Writes a variable',
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
    label: 'Math Operation',
    description: 'Add, subtract, multiply, divide, modulo',
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
    label: 'String Operation',
    description: 'Concatenate and format',
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
    label: 'Get Property',
    description: 'Reads a component's current property value',
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

  // ============ CUSTOM NODES (Gray) ============
  {
    type: 'custom',
    subType: 'c_code_block',
    label: 'C Code Block',
    description: 'Embeds custom C code',
    icon: '💻',
    color: NODE_COLORS.custom,
    defaultParams: {
      code: '// Custom code\n',
    },
    inputs: [
      { name: 'Execute', type: 'execution' },
      { name: 'Input1', type: 'any' },
    ],
    outputs: [
      { name: 'Done', type: 'execution' },
      { name: 'Output1', type: 'any' },
    ],
  },
];

// Get node definition by subType
export function getNodeDefinition(subType: string): LogicNodeDefinition | undefined {
  return NODE_DEFINITIONS.find(def => def.subType === subType);
}

// Get nodes by category
export function getNodesByCategory(category: string): LogicNodeDefinition[] {
  return NODE_DEFINITIONS.filter(def => def.type === category);
}

// Node categories for palette
export const NODE_CATEGORIES = [
  { id: 'trigger', name: 'Triggers', icon: '⚡', color: NODE_COLORS.trigger },
  { id: 'condition', name: 'Condition', icon: '🔀', color: NODE_COLORS.condition },
  { id: 'action', name: 'Action', icon: '🎬', color: NODE_COLORS.action },
  { id: 'data', name: 'Data', icon: '📊', color: NODE_COLORS.data },
  { id: 'custom', name: 'Custom', icon: '💻', color: NODE_COLORS.custom },
];
