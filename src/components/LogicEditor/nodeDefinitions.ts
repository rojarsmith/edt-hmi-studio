// Logic Node Definitions - All available node types

import type { LogicGraph, LogicNodeCategory, LogicNodeDefinition } from './types';

// Color scheme for node categories - one colour per shelf, now that the
// stored category and the palette shelf are the same thing (step 4 of
// docs/logic-node-taxonomy.md).
export const NODE_COLORS = {
  trigger: '#4CAF50', // Green - time and the user
  flow: '#FFC107',    // Amber - branching and pacing
  screen: '#2196F3',  // Blue - the panel
  data: '#9C27B0',    // Purple - values and expressions
  device: '#00BCD4',  // Teal - the machine behind the tags
  custom: '#607D8B',  // Gray - hand-written C
};

// All node definitions
export const NODE_DEFINITIONS: LogicNodeDefinition[] = [
  // ============ TRIGGER NODES (Green) ============
  {
    type: 'trigger',
    subType: 'event_trigger',
    label: 'Event Trigger',
    description: 'Fired by component events bound on the Design tab',
    icon: '⚡',
    color: NODE_COLORS.trigger,
    // Which event fires the graph is the binding's decision; the node
    // carries no parameters of its own. Saved graphs may still hold an
    // eventType from before - the legacy registration path reads it.
    defaultParams: {},
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
    type: 'flow',
    subType: 'if_else',
    label: 'If/Else',
    description: 'Conditional branch',
    icon: '🔀',
    color: NODE_COLORS.flow,
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
    type: 'flow',
    subType: 'switch',
    label: 'Switch',
    description: 'Multi-branch selection',
    icon: '🔃',
    color: NODE_COLORS.flow,
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
    type: 'data',
    subType: 'compare',
    label: 'Compare',
    description: 'Compares two values',
    icon: '⚖️',
    color: NODE_COLORS.data,
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
    type: 'data',
    subType: 'logic_op',
    label: 'Logic Operation',
    description: 'AND, OR, NOT',
    icon: '🔗',
    color: NODE_COLORS.data,
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
    type: 'screen',
    subType: 'set_property',
    label: 'Set Property',
    description: 'Changes a component property',
    icon: '🎨',
    color: NODE_COLORS.screen,
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
    type: 'screen',
    subType: 'navigate_page',
    label: 'Navigate to Screen',
    description: 'Switches to the specified screen',
    icon: '📄',
    color: NODE_COLORS.screen,
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
    type: 'screen',
    subType: 'show_hide',
    label: 'Show/Hide',
    description: 'Controls component visibility',
    icon: '👁️',
    color: NODE_COLORS.screen,
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
    type: 'screen',
    subType: 'set_text',
    label: 'Set Text',
    description: 'Changes text content',
    icon: '📝',
    color: NODE_COLORS.screen,
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
    type: 'screen',
    subType: 'set_value',
    label: 'Set Value',
    description: 'Changes a numeric value',
    icon: '🔢',
    color: NODE_COLORS.screen,
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
    type: 'custom',
    subType: 'call_function',
    label: 'Call Function',
    description: 'Calls a custom C function',
    icon: '📞',
    color: NODE_COLORS.custom,
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
    type: 'flow',
    subType: 'delay',
    label: 'Delay',
    description: 'Waits for the specified time',
    icon: '⏳',
    color: NODE_COLORS.flow,
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
    type: 'screen',
    subType: 'get_property',
    label: 'Get Property',
    description: 'Reads the current component property value',
    icon: '🔍',
    color: NODE_COLORS.screen,
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
    type: 'device',
    subType: 'tag_read',
    label: 'Read Tag',
    description: 'Reads a protocol tag defined on the Protocol tab',
    icon: '📥',
    color: NODE_COLORS.device,
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
    type: 'device',
    subType: 'tag_write',
    label: 'Write Tag',
    description: 'Writes a value to a protocol tag',
    icon: '📤',
    color: NODE_COLORS.device,
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
    type: 'device',
    subType: 'modbus_holding_register',
    label: 'Read Holding Register',
    description: 'Reads a cached Modbus Holding Register value',
    icon: '📥',
    color: NODE_COLORS.device,
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

// Get nodes for one palette shelf (deprecated stays hidden)
export function getNodesByCategory(category: string): LogicNodeDefinition[] {
  return NODE_DEFINITIONS.filter(
    def => def.type === category && !def.deprecated
  );
}

// Palette shelves, grouped by what the author operates on - time and flow,
// the screen, values, the machine. Since the 2026-08 rename the stored node
// category IS the shelf; old spellings are normalized on load, see
// normalizeLogicGraphs below.
export const NODE_CATEGORIES = [
  { id: 'trigger', name: 'Triggers', icon: '⚡', color: NODE_COLORS.trigger },
  { id: 'flow', name: 'Flow', icon: '🔀', color: NODE_COLORS.flow },
  { id: 'screen', name: 'Screen', icon: '🖥️', color: NODE_COLORS.screen },
  { id: 'data', name: 'Data', icon: '📊', color: NODE_COLORS.data },
  { id: 'device', name: 'Device', icon: '🔌', color: NODE_COLORS.device },
  { id: 'custom', name: 'Custom', icon: '💻', color: NODE_COLORS.custom },
];

// Projects saved before the 2026-08 rename carry 'condition' and 'action',
// and the old five-way split of 'data'. The subType is the authority:
// normalization re-derives every node's category from the definition table,
// so old files keep loading forever. An unknown subType (a newer file
// visiting an older editor's vocabulary) keeps its stored value when that is
// still a category, and falls back to 'custom' otherwise.
export function normalizeLogicNodeCategory(
  subType: string,
  storedType: string,
): LogicNodeCategory {
  const definition = getNodeDefinition(subType);
  if (definition) return definition.type;
  return NODE_CATEGORIES.some(category => category.id === storedType)
    ? (storedType as LogicNodeCategory)
    : 'custom';
}

/** Applied wherever graphs enter the store; keeps identity when clean. */
export function normalizeLogicGraphs(graphs: LogicGraph[]): LogicGraph[] {
  let changed = false;
  const normalized = graphs.map(graph => {
    let nodesChanged = false;
    const nodes = graph.nodes.map(node => {
      const type = normalizeLogicNodeCategory(node.subType, node.type);
      if (type === node.type) return node;
      nodesChanged = true;
      return { ...node, type };
    });
    if (!nodesChanged) return graph;
    changed = true;
    return { ...graph, nodes };
  });
  return changed ? normalized : graphs;
}

// The Custom shelf is the factory engineer's realm - hand-written C has no
// place in a no-code author's palette, the same reasoning that moved the
// Code and Icon tabs behind Factory Dev Mode. Nodes already placed in a
// graph keep rendering and generating in every mode; only the offer hides.
export function getPaletteCategories(factoryDevMode: boolean) {
  return factoryDevMode
    ? NODE_CATEGORIES
    : NODE_CATEGORIES.filter(category => category.id !== 'custom');
}
