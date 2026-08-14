// Name conversion utilities for code generation

import type { CodeGenOptions } from '../types';

/**
 * Convert a name to snake_case
 */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');
}

/**
 * Convert a name to camelCase
 */
export function toCamelCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .filter(Boolean)
    .map((word, index) => 
      index === 0 
        ? word.toLowerCase() 
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * Convert a name to PascalCase
 */
export function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert a name based on the naming style option
 */
export function convertName(name: string, options: CodeGenOptions): string {
  return options.namingStyle === 'snake_case' 
    ? toSnakeCase(name) 
    : toCamelCase(name);
}

/**
 * Generate a valid C identifier from a component name
 */
export function toValidCIdentifier(name: string): string {
  // Remove invalid characters and ensure it starts with a letter or underscore
  let result = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(result)) {
    result = '_' + result;
  }
  return result;
}

/**
 * Generate UI variable name for a component
 */
export function getComponentVarName(componentName: string, options: CodeGenOptions): string {
  const baseName = toValidCIdentifier(componentName);
  const converted = convertName(baseName, options);
  return `ui_${converted}`;
}

/**
 * Generate screen variable name
 */
export function getScreenVarName(screenName: string, options: CodeGenOptions): string {
  const baseName = toValidCIdentifier(screenName);
  const converted = convertName(baseName, options);
  return `ui_screen_${converted}`;
}

/**
 * Generate event handler function name
 */
export function getEventHandlerName(componentName: string, eventType: string, options: CodeGenOptions): string {
  const baseName = toValidCIdentifier(componentName);
  const eventName = eventType.replace('LV_EVENT_', '').toLowerCase();
  const converted = convertName(`${baseName}_${eventName}`, options);
  return `ui_event_${converted}`;
}

/**
 * Generate screen init function name
 */
export function getScreenInitFuncName(screenName: string, options: CodeGenOptions): string {
  const baseName = toValidCIdentifier(screenName);
  const converted = convertName(baseName, options);
  return `ui_screen_${converted}_init`;
}

/**
 * Generate screen load function name
 */
export function getScreenLoadFuncName(screenName: string, options: CodeGenOptions): string {
  const baseName = toValidCIdentifier(screenName);
  const converted = convertName(baseName, options);
  return `ui_load_screen_${converted}`;
}

/** snake_case exactly as the logic templates have always produced it. */
function toLogicSnakeCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_/, '');
}

/**
 * Graph id → the C function name it generates, unique across the project.
 *
 * Nothing stops two logic graphs sharing a name — adding one twice gives two
 * called "New Logic Graph" — but two C functions cannot share one, and the
 * duplicate definition surfaces only when the firmware compiles. The first
 * graph keeps the plain name, so existing projects generate what they always
 * did; a later collision takes a numeric suffix, in graph order.
 *
 * `ui_logic.h` and `ui_logic.c` both call this over the same array, which is
 * what keeps a declaration and its definition agreeing.
 */
export function getLogicFuncNames(graphs: { id: string; name: string }[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();

  for (const graph of graphs) {
    const base = toLogicSnakeCase(`logic_${graph.name}`);
    let name = base;
    for (let suffix = 2; taken.has(name); suffix++) name = `${base}_${suffix}`;
    taken.add(name);
    names.set(graph.id, name);
  }

  return names;
}

/**
 * Convert hex color string to LVGL color format
 */
export function colorToLvgl(color: string): string {
  // Handle transparent / invalid colors
  if (!color || color.toLowerCase() === 'transparent') {
    return `lv_color_hex(0x000000)`;
  }
  // Remove # if present
  const hex = color.replace('#', '');
  // Validate hex
  if (!/^[0-9a-fA-F]{3,8}$/.test(hex)) {
    return `lv_color_hex(0x000000)`;
  }
  return `lv_color_hex(0x${hex.slice(0, 6).toUpperCase()})`;
}

/**
 * Convert opacity (0-1) to LVGL opacity (0-255)
 */
export function opacityToLvgl(opacity: number): number {
  return Math.round(opacity * 255);
}

/**
 * Escape a string for use in a C string literal
 */
export function escapeCString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
