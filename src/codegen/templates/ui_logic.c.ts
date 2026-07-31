// ui_logic.c template generator
// Generates C code from logic orchestration graphs

import type { CodeGenOptions } from '../types';
import type { LvglComponent, Page } from '../../types';
import type {
  LogicGraph,
  LogicNode,
  LogicVariable,
  LogicNodeSubType,
} from '../../components/LogicEditor/types';
import {
  generateInclude,
  generateSectionHeader,
  generateUserCodeSection,
  getIndent,
} from '../formatters/cFormatter';
import {
  getComponentVarName,
  getScreenLoadFuncName,
  getScreenVarName,
} from '../utils/nameUtils';

interface ComponentReference {
  component?: LvglComponent;
  pageName: string;
  variableName: string;
}

interface PageReference {
  page: Page;
  variableName: string;
  loadFunctionName: string;
  resolved: boolean;
}

interface LogicCodegenContext {
  options: CodeGenOptions;
  componentsById: Map<string, ComponentReference>;
  componentsByName: Map<string, ComponentReference>;
  pagesById: Map<string, PageReference>;
  pagesByName: Map<string, PageReference>;
}

/**
 * Generate ui_logic.c source file from logic graphs
 */
export function generateLogicSource(
  options: CodeGenOptions,
  graphs: LogicGraph[] = [],
  pages: Page[] = [],
): string {
  const context = createLogicCodegenContext(pages, options);
  const lines: string[] = [];
  const hasHoldingRegisterNodes = graphs.some(graph =>
    graph.nodes.some(node => node.subType === 'modbus_holding_register')
  );
  const hasButtonTextNodes = graphs.some(graph =>
    graph.nodes.some(node =>
      node.subType === 'set_text'
      && resolveComponent(node.params.targetComponent, context, options).component?.type === 'btn'
    )
  );
  
  // Includes
  lines.push(generateInclude('ui.h'));
  lines.push(generateInclude('ui_logic.h'));
  if (hasHoldingRegisterNodes) {
    lines.push(generateInclude('hmi_runtime.h'));
  }
  lines.push(generateInclude('string.h', true));
  lines.push(generateInclude('stdio.h', true));
  lines.push('');

  if (hasHoldingRegisterNodes) {
    lines.push(generateHoldingRegisterReadHelper(options));
    lines.push('');
  }
  if (hasButtonTextNodes) {
    lines.push(generateButtonSetTextHelper(options));
    lines.push('');
  }
  
  // Collect all variables from all graphs
  const allVariables = collectAllVariables(graphs);
  
  // Generate variable declarations
  if (options.generateComments) {
    lines.push(generateSectionHeader('Logic Variables', options));
  }
  lines.push('');
  
  if (allVariables.length > 0) {
    for (const variable of allVariables) {
      lines.push(generateVariableDeclaration(variable));
    }
    lines.push('');
  } else {
    if (options.generateComments) {
      lines.push('// No variables defined');
      lines.push('');
    }
  }

  // Forward declarations for callbacks
  const timerGraphs = graphs.filter(g =>
    g.nodes.some(n => n.subType === 'timer_trigger')
  );
  const eventGraphs = graphs.filter(g =>
    g.nodes.some(n => n.subType === 'event_trigger')
  );
  if (timerGraphs.length > 0 || eventGraphs.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Callback Forward Declarations', options));
      lines.push('');
    }
    for (const graph of eventGraphs) {
      const funcName = toSnakeCase(`logic_${graph.name}`);
      lines.push(`static void ${funcName}_event_cb(lv_event_t *e);`);
    }
    for (const graph of timerGraphs) {
      const funcName = toSnakeCase(`logic_${graph.name}`);
      lines.push(`static void ${funcName}_timer_cb(lv_timer_t *timer);`);
    }
    lines.push('');
  }
  
  // Generate logic functions for each graph
  if (options.generateComments) {
    lines.push(generateSectionHeader('Logic Functions', options));
  }
  lines.push('');
  
  if (graphs.length > 0) {
    for (const graph of graphs) {
      const functionCode = generateLogicFunction(graph, options, context);
      lines.push(functionCode);
      lines.push('');
    }

    // Generate timer callbacks
    for (const graph of timerGraphs) {
      lines.push(generateTimerCallback(graph, options));
      lines.push('');
    }
    
    // Generate init function
    lines.push(generateInitFunction(graphs, options, context));
    lines.push('');
  } else {
    if (options.generateComments) {
      lines.push('// No logic graphs defined');
      lines.push('');
    }
    lines.push('void ui_logic_init(void) {');
    lines.push(getIndent(options) + '// No logic to initialize');
    lines.push('}');
    lines.push('');
  }
  
  // User code section
  if (options.userCodeMarkers) {
    lines.push(generateUserCodeSection('logic_custom', options));
  }
  
  return lines.join('\n');
}

function generateHoldingRegisterReadHelper(options: CodeGenOptions): string {
  const indent = getIndent(options);
  return [
    'static uint16_t logic_read_holding_register_cached(uint16_t address) {',
    `${indent}uint16_t value = 0U;`,
    `${indent}if (!hmi_runtime_read_holding_register(address, &value)) {`,
    `${indent}${indent}return 0U;`,
    `${indent}}`,
    `${indent}return value;`,
    '}',
  ].join('\n');
}

function generateButtonSetTextHelper(options: CodeGenOptions): string {
  const indent = getIndent(options);
  return [
    'static void logic_set_button_text(lv_obj_t *button, const char *text) {',
    `${indent}if (button == NULL) {`,
    `${indent}${indent}return;`,
    `${indent}}`,
    `${indent}lv_obj_t *label = lv_obj_get_child(button, 0);`,
    `${indent}if (label == NULL) {`,
    `${indent}${indent}label = lv_label_create(button);`,
    `${indent}${indent}lv_obj_center(label);`,
    `${indent}}`,
    `${indent}lv_label_set_text(label, text);`,
    '}',
  ].join('\n');
}

function createLogicCodegenContext(
  pages: Page[],
  options: CodeGenOptions,
): LogicCodegenContext {
  const componentEntries: Array<{ component: LvglComponent; pageName: string }> = [];

  const collectComponents = (components: LvglComponent[], pageName: string) => {
    for (const component of components) {
      componentEntries.push({ component, pageName });
      collectComponents(component.children, pageName);
    }
  };

  for (const page of pages) {
    collectComponents(page.components, page.name);
  }

  // Keep the cross-page collision policy in lockstep with ui.c/ui.h generation.
  const componentsByOriginalName = new Map<
    string,
    Array<{ component: LvglComponent; pageName: string }>
  >();
  for (const entry of componentEntries) {
    const matchingEntries = componentsByOriginalName.get(entry.component.name) ?? [];
    matchingEntries.push(entry);
    componentsByOriginalName.set(entry.component.name, matchingEntries);
  }

  const needsPagePrefix = new Set<string>();
  for (const matchingEntries of componentsByOriginalName.values()) {
    if (
      matchingEntries.length > 1
      && new Set(matchingEntries.map(entry => entry.pageName)).size > 1
    ) {
      for (const entry of matchingEntries) {
        needsPagePrefix.add(entry.component.id);
      }
    }
  }

  const componentsById = new Map<string, ComponentReference>();
  const componentsByName = new Map<string, ComponentReference>();
  const ambiguousComponentNames = new Set<string>();

  for (const { component, pageName } of componentEntries) {
    const reference: ComponentReference = {
      component,
      pageName,
      variableName: getComponentVarName(
        needsPagePrefix.has(component.id)
          ? `${pageName}_${component.name}`
          : component.name,
        options,
      ),
    };
    componentsById.set(component.id, reference);
    if (componentsByName.has(component.name)) {
      componentsByName.delete(component.name);
      ambiguousComponentNames.add(component.name);
    } else if (!ambiguousComponentNames.has(component.name)) {
      componentsByName.set(component.name, reference);
    }
  }

  const pagesById = new Map<string, PageReference>();
  const pagesByName = new Map<string, PageReference>();
  for (const page of pages) {
    const reference: PageReference = {
      page,
      variableName: getScreenVarName(page.name, options),
      loadFunctionName: getScreenLoadFuncName(page.name, options),
      resolved: true,
    };
    pagesById.set(page.id, reference);
    pagesByName.set(page.name, reference);
  }

  return {
    options,
    componentsById,
    componentsByName,
    pagesById,
    pagesByName,
  };
}

function resolveComponent(
  target: unknown,
  context: LogicCodegenContext,
  options: CodeGenOptions,
): ComponentReference {
  const targetValue = typeof target === 'string' && target.trim()
    ? target
    : 'obj';
  const resolved =
    context.componentsById.get(targetValue)
    ?? context.componentsByName.get(targetValue);

  if (resolved) {
    return resolved;
  }

  return {
    pageName: '',
    variableName: getComponentVarName(targetValue, options),
  };
}

function resolvePage(
  target: unknown,
  context: LogicCodegenContext,
  options: CodeGenOptions,
): PageReference {
  const targetValue = typeof target === 'string' && target.trim()
    ? target
    : 'page1';
  const resolved =
    context.pagesById.get(targetValue)
    ?? context.pagesByName.get(targetValue);

  if (resolved) {
    return resolved;
  }

  return {
    page: {
      id: targetValue,
      name: targetValue,
      components: [],
    },
    variableName: getScreenVarName(targetValue, options),
    loadFunctionName: getScreenLoadFuncName(targetValue, options),
    resolved: false,
  };
}

function resolveVariableName(graph: LogicGraph, node: LogicNode): string {
  const requestedVariable =
    node.params.variableId
    || node.params.variableName
    || 'unknown';
  const variable = graph.variables.find(
    candidate =>
      candidate.id === requestedVariable
      || candidate.name === requestedVariable,
  );
  return toSnakeCase(`var_${variable?.name ?? requestedVariable}`);
}

/**
 * Generate timer callback wrapper
 */
function generateTimerCallback(graph: LogicGraph, options: CodeGenOptions): string {
  const funcName = toSnakeCase(`logic_${graph.name}`);
  const indent = getIndent(options);
  const lines: string[] = [];

  if (options.generateComments) {
    lines.push(`/** Timer callback for ${graph.name} */`);
  }
  lines.push(`static void ${funcName}_timer_cb(lv_timer_t *timer) {`);
  lines.push(`${indent}(void)timer;`);
  lines.push(`${indent}${funcName}();`);

  // Check if any timer trigger is one-shot (delay mode)
  const timerNodes = graph.nodes.filter(n => n.subType === 'timer_trigger');
  for (const tn of timerNodes) {
    if (tn.params.mode === 'delay') {
      lines.push(`${indent}lv_timer_del(timer);`);
      break;
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate init function that registers event callbacks and timers
 */
function generateInitFunction(
  graphs: LogicGraph[],
  options: CodeGenOptions,
  context: LogicCodegenContext,
): string {
  const lines: string[] = [];
  const indent = getIndent(options);
  
  if (options.generateComments) {
    lines.push('/**');
    lines.push(' * Initialize logic system');
    lines.push(' */');
  }
  lines.push('void ui_logic_init(void) {');
  
  let hasContent = false;

  for (const graph of graphs) {
    const functionName = toSnakeCase(`logic_${graph.name}`);

    // Register event triggers
    const eventTriggers = graph.nodes.filter(n => n.subType === 'event_trigger');
    for (const trigger of eventTriggers) {
      const eventType = trigger.params.eventType || 'LV_EVENT_CLICKED';
      const targetComp = trigger.params.targetComponent;
      if (targetComp) {
        const target = resolveComponent(targetComp, context, options);
        if (options.generateComments) {
          lines.push(`${indent}// ${graph.name}: ${eventType} on ${target.component?.name ?? targetComp}`);
        }
        // Use a wrapper — the logic function has void(void) signature,
        // so we generate an inline event callback
        lines.push(`${indent}lv_obj_add_event_cb(${target.variableName}, ${functionName}_event_cb, ${eventType}, NULL);`);
        hasContent = true;
      }
    }

    // Register timer triggers
    const timerTriggers = graph.nodes.filter(n => n.subType === 'timer_trigger');
    for (const trigger of timerTriggers) {
      const duration = trigger.params.duration || 1000;
      const mode = trigger.params.mode || 'repeat';
      if (options.generateComments) {
        lines.push(`${indent}// ${graph.name}: timer ${mode}, ${duration}ms`);
      }
      lines.push(`${indent}lv_timer_create(${functionName}_timer_cb, ${duration}, NULL);`);
      hasContent = true;
    }
  }

  if (!hasContent) {
    lines.push(`${indent}// No triggers to register`);
  }
  
  lines.push('}');

  // Generate event callback wrappers for graphs that have event triggers
  const eventGraphs = graphs.filter(g =>
    g.nodes.some(n => n.subType === 'event_trigger')
  );
  if (eventGraphs.length > 0) {
    lines.push('');
    for (const graph of eventGraphs) {
      const functionName = toSnakeCase(`logic_${graph.name}`);
      if (options.generateComments) {
        lines.push(`/** Event callback wrapper for ${graph.name} */`);
      }
      lines.push(`static void ${functionName}_event_cb(lv_event_t *e) {`);
      lines.push(`${indent}(void)e;`);
      lines.push(`${indent}${functionName}();`);
      lines.push('}');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Collect all unique variables from all graphs
 */
function collectAllVariables(graphs: LogicGraph[]): LogicVariable[] {
  const variableMap = new Map<string, LogicVariable>();
  
  for (const graph of graphs) {
    for (const variable of graph.variables) {
      if (!variableMap.has(variable.name)) {
        variableMap.set(variable.name, variable);
      }
    }
  }
  
  return Array.from(variableMap.values());
}

/**
 * Generate C variable declaration
 */
function generateVariableDeclaration(variable: LogicVariable): string {
  const cType = getCType(variable.type);
  const defaultValue = formatDefaultValue(variable.type, variable.defaultValue);
  const varName = toSnakeCase(`var_${variable.name}`);
  
  return `static ${cType} ${varName} = ${defaultValue};`;
}

/**
 * Get C type from variable type
 */
function getCType(type: string): string {
  switch (type) {
    case 'int': return 'int32_t';
    case 'float': return 'float';
    case 'string': return 'char*';
    case 'bool': return 'bool';
    default: return 'int32_t';
  }
}

/**
 * Format default value for C
 */
function formatDefaultValue(type: string, value: unknown): string {
  switch (type) {
    case 'int': return String(Number(value) || 0);
    case 'float': return (Number(value) || 0).toFixed(1) + 'f';
    case 'string': return value ? `"${String(value).replace(/"/g, '\\"')}"` : '""';
    case 'bool': return value ? 'true' : 'false';
    default: return '0';
  }
}

/**
 * Convert string to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_/, '');
}

/**
 * Generate a logic function from a graph
 */
function generateLogicFunction(
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
): string {
  const lines: string[] = [];
  const functionName = toSnakeCase(`logic_${graph.name}`);
  
  if (options.generateComments) {
    lines.push(`/**`);
    lines.push(` * Logic: ${graph.name}`);
    if (graph.description) {
      lines.push(` * ${graph.description}`);
    }
    lines.push(` */`);
  }
  
  lines.push(`void ${functionName}(void) {`);
  
  const body = generateFunctionBody(graph, options, context);
  if (body.trim()) {
    lines.push(body);
  } else {
    lines.push(getIndent(options) + '// Empty logic graph');
  }
  
  lines.push('}');
  
  return lines.join('\n');
}

/**
 * Generate function body from graph nodes by following execution flow
 */
function generateFunctionBody(
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
): string {
  // Find trigger nodes (entry points)
  const triggerNodes = graph.nodes.filter(n => n.type === 'trigger');
  
  if (triggerNodes.length === 0) {
    // No trigger nodes — generate all action nodes linearly
    const lines: string[] = [];
    for (const node of graph.nodes) {
      if (node.type === 'action' || node.type === 'custom') {
        const code = generateNodeCode(node, graph, options, context, 1);
        if (code) lines.push(code);
      }
    }
    return lines.join('\n');
  }
  
  // Follow execution flow from each trigger
  const visited = new Set<string>();
  const lines: string[] = [];
  
  for (const trigger of triggerNodes) {
    const code = generateExecutionChain(trigger.id, graph, options, context, 1, visited);
    if (code) lines.push(code);
  }
  
  return lines.join('\n');
}

/**
 * Recursively follow execution chain and generate code
 */
function generateExecutionChain(
  nodeId: string,
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indentLevel: number,
  visited: Set<string>
): string {
  if (visited.has(nodeId)) return '';
  visited.add(nodeId);
  
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return '';
  
  const lines: string[] = [];
  
  // Generate code for this node
  const nodeCode = generateNodeCode(node, graph, options, context, indentLevel);
  if (nodeCode) lines.push(nodeCode);
  
  // For branching nodes (if_else, switch), the branches are handled inside generateNodeCode
  // For linear nodes, follow the execution output
  if (node.subType !== 'if_else' && node.subType !== 'switch') {
    const nextNodeId = getNextExecutionNode(node, graph);
    if (nextNodeId) {
      const nextCode = generateExecutionChain(nextNodeId, graph, options, context, indentLevel, visited);
      if (nextCode) lines.push(nextCode);
    }
  }
  
  return lines.join('\n');
}

/**
 * Find the next node connected via execution output
 */
function getNextExecutionNode(node: LogicNode, graph: LogicGraph): string | null {
  const execOutput = node.outputs.find(o => o.type === 'execution');
  if (!execOutput) return null;
  
  const connection = graph.connections.find(
    c => c.sourceNode === node.id && c.sourceOutput === execOutput.id
  );
  
  return connection?.targetNode || null;
}

/**
 * Find the node connected to a specific named output
 */
function getOutputTargetNode(node: LogicNode, outputName: string, graph: LogicGraph): string | null {
  const output = node.outputs.find(o => o.name === outputName);
  if (!output) return null;
  
  const connection = graph.connections.find(
    c => c.sourceNode === node.id && c.sourceOutput === output.id
  );
  
  return connection?.targetNode || null;
}

/**
 * Get input value for a node port (traces back through connections)
 */
function getInputValue(
  node: LogicNode,
  inputName: string,
  graph: LogicGraph,
  context: LogicCodegenContext,
  ...legacyNames: string[]
): string {
  const acceptedNames = [inputName, ...legacyNames];
  const inputPort = node.inputs.find(i => acceptedNames.includes(i.name));
  if (!inputPort) return '0';
  
  const connection = graph.connections.find(
    c => c.targetNode === node.id && c.targetInput === inputPort.id
  );
  
  if (!connection) {
    return inputPort.defaultValue !== undefined ? String(inputPort.defaultValue) : '0';
  }
  
  const sourceNode = graph.nodes.find(n => n.id === connection.sourceNode);
  if (!sourceNode) return '0';
  
  return generateNodeExpression(sourceNode, graph, context);
}

/**
 * Generate expression for a data node
 */
function generateNodeExpression(
  node: LogicNode,
  graph: LogicGraph,
  context: LogicCodegenContext,
): string {
  switch (node.subType) {
    case 'var_read': {
      return resolveVariableName(graph, node);
    }
    case 'math_op': {
      const a = getInputValue(node, 'A', graph, context);
      const b = getInputValue(node, 'B', graph, context);
      const op = node.params.operator || '+';
      return `(${a} ${op} ${b})`;
    }
    case 'compare': {
      const a = getInputValue(node, 'A', graph, context);
      const b = getInputValue(node, 'B', graph, context);
      const op = node.params.operator || '==';
      return `(${a} ${op} ${b})`;
    }
    case 'logic_op': {
      const a = getInputValue(node, 'A', graph, context);
      const b = getInputValue(node, 'B', graph, context);
      const op = node.params.operator || 'AND';
      if (op === 'NOT') return `(!${a})`;
      const cOp = op === 'AND' ? '&&' : '||';
      return `(${a} ${cOp} ${b})`;
    }
    case 'string_op': {
      const a = getInputValue(node, 'A', graph, context);
      const b = getInputValue(node, 'B', graph, context);
      const operation = node.params.operation || 'concat';
      if (operation === 'length') return `strlen(${a})`;
      if (operation === 'concat') return `/* strcat(${a}, ${b}) */`;
      return a;
    }
    case 'modbus_holding_register': {
      const address = normalizeHoldingRegisterAddress(node.params.address);
      return `logic_read_holding_register_cached(${address}U)`;
    }
    case 'get_property': {
      const target = resolveComponent(
        node.params.targetComponent,
        context,
        context.options,
      );
      const prop = node.params.property || 'x';
      const targetVar = target.variableName;
      const propGetters: Record<string, string> = {
        x: `lv_obj_get_x(${targetVar})`,
        y: `lv_obj_get_y(${targetVar})`,
        width: `lv_obj_get_width(${targetVar})`,
        height: `lv_obj_get_height(${targetVar})`,
        opacity: `lv_obj_get_style_opa(${targetVar}, LV_PART_MAIN)`,
      };
      return propGetters[prop] || `lv_obj_get_${prop}(${targetVar})`;
    }
    default:
      return '0';
  }
}

function normalizeHoldingRegisterAddress(address: unknown): number {
  const numericAddress = Number(address);
  if (!Number.isFinite(numericAddress)) {
    return 0;
  }
  return Math.max(0, Math.min(65535, Math.trunc(numericAddress)));
}

// ============ Node Code Generators ============

/**
 * Generate C code for a single node
 */
function generateNodeCode(
  node: LogicNode,
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indentLevel: number
): string {
  const subType = node.subType as LogicNodeSubType;
  const indent = getIndent(options).repeat(indentLevel);
  
  switch (subType) {
    case 'event_trigger': {
      const target = resolveComponent(
        node.params.targetComponent,
        context,
        options,
      );
      return options.generateComments
        ? `${indent}// Event: ${node.params.eventType || 'LV_EVENT_CLICKED'} on ${target.component?.name ?? node.params.targetComponent ?? '?'}`
        : '';
    }
    case 'timer_trigger':
      return options.generateComments
        ? `${indent}// Timer: ${node.params.mode || 'repeat'}, ${node.params.duration || 1000}ms`
        : '';
    case 'if_else':
      return generateIfElseCode(node, graph, options, context, indentLevel);
    case 'switch':
      return generateSwitchCode(node, graph, options, context, indentLevel);
    case 'compare':
    case 'logic_op':
      return ''; // Inline expression nodes
    case 'set_property':
      return generateSetPropertyCode(node, options, context, indent);
    case 'navigate_page':
      return generateNavigatePageCode(node, options, context, indent);
    case 'show_hide':
      return generateShowHideCode(node, options, context, indent);
    case 'set_text':
      return generateSetTextCode(node, graph, options, context, indent);
    case 'set_value':
      return generateSetValueCode(node, graph, options, context, indent);
    case 'call_function':
      return generateCallFunctionCode(node, indent);
    case 'delay':
      return generateDelayCode(node, indent, options);
    case 'var_read':
    case 'math_op':
    case 'string_op':
    case 'get_property':
      return ''; // Data nodes don't generate standalone code
    case 'var_write':
      return generateVarWriteCode(node, graph, context, indent);
    case 'c_code_block':
      return generateCustomCodeBlock(node, indent);
    default:
      return options.generateComments ? `${indent}// Unknown node type: ${subType}` : '';
  }
}

function generateIfElseCode(
  node: LogicNode,
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indentLevel: number
): string {
  const indent = getIndent(options).repeat(indentLevel);
  const condition = getInputValue(node, 'Condition', graph, context, '条件');
  const lines: string[] = [];
  
  lines.push(`${indent}if (${condition}) {`);
  
  // Follow "True" / "真" execution output
  const trueNodeId = getOutputTargetNode(node, 'True', graph)
    || getOutputTargetNode(node, '真', graph);
  if (trueNodeId) {
    const visited = new Set<string>();
    const trueCode = generateExecutionChain(trueNodeId, graph, options, context, indentLevel + 1, visited);
    if (trueCode.trim()) {
      lines.push(trueCode);
    } else {
      lines.push(`${indent}${getIndent(options)}// True branch`);
    }
  } else {
    lines.push(`${indent}${getIndent(options)}// True branch`);
  }
  
  // Follow "False" / "假" execution output
  const falseNodeId = getOutputTargetNode(node, 'False', graph)
    || getOutputTargetNode(node, '假', graph);
  if (falseNodeId) {
    lines.push(`${indent}} else {`);
    const visited = new Set<string>();
    const falseCode = generateExecutionChain(falseNodeId, graph, options, context, indentLevel + 1, visited);
    if (falseCode.trim()) {
      lines.push(falseCode);
    } else {
      lines.push(`${indent}${getIndent(options)}// False branch`);
    }
    lines.push(`${indent}}`);
  } else {
    lines.push(`${indent}}`);
  }
  
  return lines.join('\n');
}

function generateSwitchCode(
  node: LogicNode,
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indentLevel: number
): string {
  const indent = getIndent(options).repeat(indentLevel);
  const innerIndent = getIndent(options).repeat(indentLevel + 1);
  const bodyIndent = getIndent(options).repeat(indentLevel + 2);
  const value = getInputValue(node, 'Value', graph, context, '值');
  const cases = node.params.cases || [0, 1, 2];
  const lines: string[] = [];
  
  lines.push(`${indent}switch (${value}) {`);
  
  for (const caseVal of cases) {
    lines.push(`${innerIndent}case ${caseVal}: {`);
    
    // Try to find execution output for this case
    const caseNodeId = getOutputTargetNode(node, `Case ${caseVal}`, graph)
      || getOutputTargetNode(node, String(caseVal), graph);
    if (caseNodeId) {
      const visited = new Set<string>();
      const caseCode = generateExecutionChain(caseNodeId, graph, options, context, indentLevel + 2, visited);
      if (caseCode.trim()) {
        lines.push(caseCode);
      }
    }
    
    lines.push(`${bodyIndent}break;`);
    lines.push(`${innerIndent}}`);
  }
  
  // Default case
  const defaultNodeId = getOutputTargetNode(node, 'Default', graph)
    || getOutputTargetNode(node, '默认', graph);
  lines.push(`${innerIndent}default: {`);
  if (defaultNodeId) {
    const visited = new Set<string>();
    const defaultCode = generateExecutionChain(defaultNodeId, graph, options, context, indentLevel + 2, visited);
    if (defaultCode.trim()) {
      lines.push(defaultCode);
    }
  }
  lines.push(`${bodyIndent}break;`);
  lines.push(`${innerIndent}}`);
  
  lines.push(`${indent}}`);
  
  return lines.join('\n');
}

function generateSetPropertyCode(
  node: LogicNode,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indent: string,
): string {
  const target = resolveComponent(node.params.targetComponent, context, options);
  const property = node.params.property || 'x';
  const value = node.params.value !== undefined ? node.params.value : 'value';
  const targetName = target.variableName;
  
  const setters: Record<string, string> = {
    x: `lv_obj_set_x(${targetName}, ${value});`,
    y: `lv_obj_set_y(${targetName}, ${value});`,
    width: `lv_obj_set_width(${targetName}, ${value});`,
    height: `lv_obj_set_height(${targetName}, ${value});`,
    opacity: `lv_obj_set_style_opa(${targetName}, ${value}, LV_PART_MAIN);`,
  };
  
  return `${indent}${setters[property] || `// Set property: ${property} on ${targetName}`}`;
}

function generateNavigatePageCode(
  node: LogicNode,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indent: string,
): string {
  const targetPage = resolvePage(node.params.targetPage, context, options);
  const animation = node.params.animation || 'none';
  const legacyVariableName = `ui_${toSnakeCase(targetPage.page.name)}`;
  
  if (animation === 'none') {
    return targetPage.resolved
      ? `${indent}${targetPage.loadFunctionName}();`
      : `${indent}lv_scr_load(${legacyVariableName});`;
  }
  const animMap: Record<string, string> = {
    fade: 'LV_SCR_LOAD_ANIM_FADE_IN',
    slide_left: 'LV_SCR_LOAD_ANIM_MOVE_LEFT',
    slide_right: 'LV_SCR_LOAD_ANIM_MOVE_RIGHT',
    slide_up: 'LV_SCR_LOAD_ANIM_MOVE_TOP',
    slide_down: 'LV_SCR_LOAD_ANIM_MOVE_BOTTOM',
  };
  const animType = animMap[animation] || 'LV_SCR_LOAD_ANIM_FADE_IN';
  const variableName = targetPage.resolved
    ? targetPage.variableName
    : legacyVariableName;
  return `${indent}lv_scr_load_anim(${variableName}, ${animType}, 300, 0, false);`;
}

function generateShowHideCode(
  node: LogicNode,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indent: string,
): string {
  const target = resolveComponent(node.params.targetComponent, context, options);
  const action = node.params.action || 'toggle';
  const targetName = target.variableName;
  
  switch (action) {
    case 'show':
      return `${indent}lv_obj_clear_flag(${targetName}, LV_OBJ_FLAG_HIDDEN);`;
    case 'hide':
      return `${indent}lv_obj_add_flag(${targetName}, LV_OBJ_FLAG_HIDDEN);`;
    case 'toggle':
      return [
        `${indent}if (lv_obj_has_flag(${targetName}, LV_OBJ_FLAG_HIDDEN)) {`,
        `${indent}    lv_obj_clear_flag(${targetName}, LV_OBJ_FLAG_HIDDEN);`,
        `${indent}} else {`,
        `${indent}    lv_obj_add_flag(${targetName}, LV_OBJ_FLAG_HIDDEN);`,
        `${indent}}`,
      ].join('\n');
    default:
      return `${indent}// Unknown show/hide action: ${action}`;
  }
}

function generateSetTextCode(
  node: LogicNode,
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indent: string,
): string {
  const target = resolveComponent(node.params.targetComponent || 'label', context, options);
  const text = getInputValue(node, 'Text', graph, context, '文本');
  const targetName = target.variableName;

  const setters: Record<string, string> = {
    label: `lv_label_set_text(${targetName}, ${text});`,
    textarea: `lv_textarea_set_text(${targetName}, ${text});`,
    btn: `logic_set_button_text(${targetName}, ${text});`,
    checkbox: `lv_checkbox_set_text(${targetName}, ${text});`,
    dropdown: `lv_dropdown_set_options(${targetName}, ${text});`,
  };

  // Preserve legacy graphs that stored a component name without page metadata.
  return `${indent}${setters[target.component?.type ?? 'label'] ?? `// Set Text is not supported for ${target.component?.type ?? 'this component'}`}`;
}

function generateSetValueCode(
  node: LogicNode,
  graph: LogicGraph,
  options: CodeGenOptions,
  context: LogicCodegenContext,
  indent: string,
): string {
  const target = resolveComponent(node.params.targetComponent || 'slider', context, options);
  const value = getInputValue(node, 'Number', graph, context, '数值');
  const targetName = target.variableName;
  const compType = target.component?.type || node.params.componentType || 'slider';
  
  // Choose the correct LVGL API based on component type
  const valueSetters: Record<string, string> = {
    slider: `lv_slider_set_value(${targetName}, ${value}, LV_ANIM_ON);`,
    bar: `lv_bar_set_value(${targetName}, ${value}, LV_ANIM_ON);`,
    arc: `lv_arc_set_value(${targetName}, ${value});`,
    spinner: `// Spinner value cannot be set directly`,
  };
  
  return `${indent}${valueSetters[compType] || `lv_slider_set_value(${targetName}, ${value}, LV_ANIM_ON);`}`;
}

function generateCallFunctionCode(node: LogicNode, indent: string): string {
  const functionName = node.params.functionName || 'custom_function';
  const args = node.params.arguments || [];
  const argsStr = args.length > 0 ? args.join(', ') : '';
  
  return `${indent}${functionName}(${argsStr});`;
}

function generateDelayCode(node: LogicNode, indent: string, options: CodeGenOptions): string {
  const duration = node.params.duration || 1000;
  
  if (options.generateComments) {
    return [
      `${indent}// Delay ${duration}ms — subsequent actions should be in a timer callback`,
      `${indent}// Consider restructuring with lv_timer_create for non-blocking delay`,
    ].join('\n');
  }
  return `${indent}// Delay ${duration}ms`;
}

function generateVarWriteCode(
  node: LogicNode,
  graph: LogicGraph,
  context: LogicCodegenContext,
  indent: string,
): string {
  const value = getInputValue(node, 'Value', graph, context, '值');
  const cVarName = resolveVariableName(graph, node);
  
  return `${indent}${cVarName} = ${value};`;
}

function generateCustomCodeBlock(node: LogicNode, indent: string): string {
  const code = (node.params.code || '// Custom code').trim();
  
  // Indent each line of custom code
  return code.split('\n').map((line: string) => `${indent}${line}`).join('\n');
}
