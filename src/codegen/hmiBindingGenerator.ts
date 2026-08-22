import type { Screen, LvglComponent } from '../types';
import type { LogicGraph } from '../components/LogicEditor/types';
import type {
  CommunicationConfig,
  ModbusAccess,
  ModbusDataType,
  ModbusRegisterArea,
  ModbusRegisterTag,
  ModbusWidgetProperty,
  ModbusWriteBehavior,
} from '../types/hmi';
import type { CodeGenOptions } from './types';
import { DEFAULT_CODEGEN_OPTIONS } from './types';
import { getComponentVarName } from './utils/nameUtils';

export interface GeneratedHmiBindings {
  'hmi_bindings_generated.h': string;
  'hmi_bindings_generated.c': string;
}

interface BoundComponent {
  component: LvglComponent;
  screenName: string;
  variableName: string;
}

const AREA_ENUM: Record<ModbusRegisterArea, string> = {
  coil: 'HMI_AREA_COIL',
  'discrete-input': 'HMI_AREA_DISCRETE_INPUT',
  'holding-register': 'HMI_AREA_HOLDING_REGISTER',
  'input-register': 'HMI_AREA_INPUT_REGISTER',
};

const DATA_TYPE_ENUM: Record<ModbusDataType, string> = {
  bool: 'HMI_DATA_BOOL',
  uint16: 'HMI_DATA_UINT16',
  int16: 'HMI_DATA_INT16',
  uint32: 'HMI_DATA_UINT32',
  int32: 'HMI_DATA_INT32',
  float32: 'HMI_DATA_FLOAT32',
  string: 'HMI_DATA_STRING',
};

const ACCESS_ENUM: Record<ModbusAccess, string> = {
  read: 'HMI_ACCESS_READ',
  write: 'HMI_ACCESS_WRITE',
  readwrite: 'HMI_ACCESS_READWRITE',
};

const PROPERTY_ENUM: Record<ModbusWidgetProperty, string> = {
  checked: 'HMI_PROPERTY_CHECKED',
  value: 'HMI_PROPERTY_VALUE',
  text: 'HMI_PROPERTY_TEXT',
  selected: 'HMI_PROPERTY_SELECTED',
};

const WRITE_BEHAVIOR_ENUM: Record<ModbusWriteBehavior, string> = {
  'widget-value': 'HMI_WRITE_WIDGET_VALUE',
  set: 'HMI_WRITE_SET',
  toggle: 'HMI_WRITE_TOGGLE',
  increment: 'HMI_WRITE_INCREMENT',
  decrement: 'HMI_WRITE_DECREMENT',
};

const WIDGET_ENUM: Record<string, string> = {
  btn: 'HMI_WIDGET_BUTTON',
  'image-button': 'HMI_WIDGET_IMAGE_BUTTON',
  switch: 'HMI_WIDGET_SWITCH',
  checkbox: 'HMI_WIDGET_CHECKBOX',
  slider: 'HMI_WIDGET_SLIDER',
  bar: 'HMI_WIDGET_BAR',
  arc: 'HMI_WIDGET_ARC',
  textarea: 'HMI_WIDGET_TEXTAREA',
  label: 'HMI_WIDGET_LABEL',
  dropdown: 'HMI_WIDGET_DROPDOWN',
};

function collectLogicHoldingRegisterAddresses(
  graphs: LogicGraph[],
  tags: ModbusRegisterTag[],
): number[] {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const addresses = new Set<number>();

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      if (node.subType === 'modbus_holding_register') {
        addresses.add(integerInRange(node.params.address, 0, 65535, 0));
        continue;
      }
      if (node.subType !== 'tag_read') continue;
      // Read Tag polls through the same raw-uint16 descriptor shape the
      // legacy address node uses; ui_logic.c applies the tag's type and
      // scale where sign survives. Only what codegen can read is polled.
      const tag = tagsById.get(node.params.tagId);
      if (
        !tag
        || tag.area !== 'holding-register'
        || tag.dataType === 'uint32'
        || tag.dataType === 'int32'
        || tag.dataType === 'float32'
        || !(tag.access === 'read' || tag.access === 'readwrite')
      ) {
        continue;
      }
      addresses.add(integerInRange(tag.address, 0, 65535, 0));
    }
  }

  return [...addresses].sort((left, right) => left - right);
}

/**
 * Write Tag needs a descriptor carrying the tag's area, data type and scale
 * for hmi_runtime_write_* to queue onto. Object-less and write-only, so the
 * poll loop never touches it.
 */
function collectLogicWriteTags(
  graphs: LogicGraph[],
  tags: ModbusRegisterTag[],
): ModbusRegisterTag[] {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const collected = new Map<string, ModbusRegisterTag>();

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      if (node.subType !== 'tag_write') continue;
      const tag = tagsById.get(node.params.tagId);
      if (
        !tag
        || (tag.area !== 'coil' && tag.area !== 'holding-register')
        || !(tag.access === 'write' || tag.access === 'readwrite')
      ) {
        continue;
      }
      collected.set(tag.id, tag);
    }
  }

  return [...collected.values()].sort((left, right) => left.address - right.address);
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function integerInRange(value: number, min: number, max: number, fallback: number): number {
  const integer = Math.trunc(finiteNumber(value, fallback));
  return Math.max(min, Math.min(max, integer));
}

function cFloat(value: number, fallback: number): string {
  const safeValue = finiteNumber(value, fallback);
  return `${Number.isInteger(safeValue) ? safeValue.toFixed(1) : safeValue}f`;
}

function collectBoundComponents(
  screens: Screen[],
  options: CodeGenOptions,
): BoundComponent[] {
  const allComponents: { component: LvglComponent; screenName: string }[] = [];

  const walk = (components: LvglComponent[], screenName: string) => {
    for (const component of components) {
      allComponents.push({ component, screenName });
      walk(component.children, screenName);
    }
  };

  for (const screen of screens) {
    walk(screen.components, screen.name);
  }

  // Keep this collision policy in lockstep with ui.c/ui.h generation.
  const componentsByName = new Map<string, { component: LvglComponent; screenName: string }[]>();
  for (const entry of allComponents) {
    const entries = componentsByName.get(entry.component.name) ?? [];
    entries.push(entry);
    componentsByName.set(entry.component.name, entries);
  }

  const needsScreenPrefix = new Set<string>();
  for (const entries of componentsByName.values()) {
    if (entries.length > 1 && new Set(entries.map((entry) => entry.screenName)).size > 1) {
      for (const entry of entries) {
        needsScreenPrefix.add(entry.component.id);
      }
    }
  }

  return allComponents
    .filter(({ component }) => component.modbusBinding?.enabled)
    .map(({ component, screenName }) => ({
      component,
      screenName,
      variableName: getComponentVarName(
        needsScreenPrefix.has(component.id)
          ? `${screenName}_${component.name}`
          : component.name,
        options,
      ),
    }));
}

function generateHeader(): string {
  return `// Generated by LVGL HMI RAD Tool. Do not edit.
#ifndef HMI_BINDINGS_GENERATED_H
#define HMI_BINDINGS_GENERATED_H

#include <stddef.h>
#include "hmi_runtime.h"

extern const hmi_runtime_config_t hmi_runtime_config;
extern const hmi_binding_descriptor_t hmi_binding_descriptors[];
extern const size_t hmi_binding_descriptor_count;

#endif /* HMI_BINDINGS_GENERATED_H */
`;
}

function generateSource(
  screens: Screen[],
  communication: CommunicationConfig,
  options: CodeGenOptions,
  logicGraphs: LogicGraph[],
): string {
  const bindings = collectBoundComponents(screens, options);
  const logicHoldingRegisterAddresses =
    collectLogicHoldingRegisterAddresses(logicGraphs, communication.tags ?? []);
  const logicWriteTags = collectLogicWriteTags(logicGraphs, communication.tags ?? []);
  const parity = {
    none: 'HMI_PARITY_NONE',
    even: 'HMI_PARITY_EVEN',
    odd: 'HMI_PARITY_ODD',
  }[communication.parity];

  const lines: string[] = [
    '// Generated by LVGL HMI RAD Tool. Do not edit.',
    '#include "ui.h"',
    '#include "hmi_bindings_generated.h"',
    '',
    'const hmi_runtime_config_t hmi_runtime_config = {',
    `    .enabled = ${communication.enabled ? 'true' : 'false'},`,
    `    .unit_id = ${integerInRange(communication.unitId, 1, 247, 1)},`,
    `    .baud_rate = ${integerInRange(communication.baudRate, 1200, 4000000, 9600)}U,`,
    `    .parity = ${parity},`,
    `    .stop_bits = ${communication.stopBits === 2 ? 2 : 1},`,
    `    .timeout_ms = ${integerInRange(communication.timeoutMs, 10, 60000, 1000)}U,`,
    `    .retry_count = ${integerInRange(communication.retries, 0, 10, 2)},`,
    `    .default_poll_ms = ${integerInRange(communication.pollIntervalMs, 10, 60000, 250)}U,`,
    '};',
    '',
  ];

  if (
    bindings.length === 0
    && logicHoldingRegisterAddresses.length === 0
    && logicWriteTags.length === 0
  ) {
    lines.push(
      'const hmi_binding_descriptor_t hmi_binding_descriptors[1] = {{0}};',
      'const size_t hmi_binding_descriptor_count = 0U;',
      '',
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push('const hmi_binding_descriptor_t hmi_binding_descriptors[] = {');
  for (const { component, variableName } of bindings) {
    const binding = component.modbusBinding!;
    const readOnlyArea =
      binding.area === 'discrete-input' || binding.area === 'input-register';
    const access = readOnlyArea ? 'read' : binding.access;

    lines.push(
      '    {',
      `        .object = &${variableName},`,
      `        .area = ${AREA_ENUM[binding.area]},`,
      `        .data_type = ${DATA_TYPE_ENUM[binding.dataType]},`,
      `        .access = ${ACCESS_ENUM[access]},`,
      `        .widget = ${WIDGET_ENUM[component.type] ?? 'HMI_WIDGET_GENERIC'},`,
      `        .property = ${PROPERTY_ENUM[binding.property]},`,
      `        .write_behavior = ${WRITE_BEHAVIOR_ENUM[binding.writeBehavior]},`,
      `        .address = ${integerInRange(binding.address, 0, 65535, 0)}U,`,
      `        .scale = ${cFloat(binding.scale, 1)},`,
      `        .poll_ms = ${integerInRange(binding.pollIntervalMs, 10, 60000, communication.pollIntervalMs)}U,`,
      `        .write_value = ${cFloat(binding.writeValue, 0)},`,
      `        .value_reader = ${component.type === 'image-button' ? `${variableName}_get_value` : 'NULL'},`,
      `        .value_writer = ${component.type === 'image-button' ? `${variableName}_set_value` : 'NULL'},`,
      // A string binding routes to the widget's own text writer — for a QR
      // code, the generated function that re-encodes and redraws it. The
      // remaining descriptor fields are designated-initialised, so numeric
      // rows need not name these at all.
      ...(binding.dataType === 'string'
        ? [
          `        .text_writer = ${variableName}_qr_set_text,`,
          `        .string_registers = ${integerInRange(binding.stringRegisters ?? 16, 1, 64, 16)}U,`,
        ]
        : []),
      '    },',
    );
  }
  for (const address of logicHoldingRegisterAddresses) {
    lines.push(
      '    {',
      '        .object = NULL,',
      '        .area = HMI_AREA_HOLDING_REGISTER,',
      '        .data_type = HMI_DATA_UINT16,',
      '        .access = HMI_ACCESS_READ,',
      '        .widget = HMI_WIDGET_GENERIC,',
      '        .property = HMI_PROPERTY_VALUE,',
      '        .write_behavior = HMI_WRITE_WIDGET_VALUE,',
      `        .address = ${address}U,`,
      '        .scale = 1.0f,',
      `        .poll_ms = ${integerInRange(communication.pollIntervalMs, 10, 60000, 250)}U,`,
      '        .write_value = 0.0f,',
      '        .value_reader = NULL,',
      '        .value_writer = NULL,',
      '    },',
    );
  }
  for (const tag of logicWriteTags) {
    lines.push(
      '    {',
      '        .object = NULL,',
      `        .area = ${AREA_ENUM[tag.area]},`,
      `        .data_type = ${DATA_TYPE_ENUM[tag.dataType]},`,
      // Write-only regardless of the tag's own access: reads for this tag
      // travel on their own descriptor, and a readwrite one here would put
      // an object-less binding into the poll rotation for nothing.
      '        .access = HMI_ACCESS_WRITE,',
      '        .widget = HMI_WIDGET_GENERIC,',
      '        .property = HMI_PROPERTY_VALUE,',
      '        .write_behavior = HMI_WRITE_WIDGET_VALUE,',
      `        .address = ${integerInRange(tag.address, 0, 65535, 0)}U,`,
      `        .scale = ${cFloat(tag.scale, 1)},`,
      '        .poll_ms = 0U,',
      '        .write_value = 0.0f,',
      '        .value_reader = NULL,',
      '        .value_writer = NULL,',
      '    },',
    );
  }
  lines.push(
    '};',
    'const size_t hmi_binding_descriptor_count =',
    '    sizeof(hmi_binding_descriptors) / sizeof(hmi_binding_descriptors[0]);',
    '',
  );

  return `${lines.join('\n')}\n`;
}

/**
 * Generate the immutable project-level Modbus configuration and widget binding
 * table consumed by the STM32 board runtime.
 */
export function generateHmiBindings(
  screens: Screen[],
  communication: CommunicationConfig,
  options: Partial<CodeGenOptions> = {},
  logicGraphs: LogicGraph[] = [],
): GeneratedHmiBindings {
  const resolvedOptions: CodeGenOptions = {
    ...DEFAULT_CODEGEN_OPTIONS,
    ...options,
  };

  return {
    'hmi_bindings_generated.h': generateHeader(),
    'hmi_bindings_generated.c': generateSource(
      screens,
      communication,
      resolvedOptions,
      logicGraphs,
    ),
  };
}
