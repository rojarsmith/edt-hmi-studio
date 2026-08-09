// ui_events.c template generator

import type { Screen, LvglComponent, EventBinding, BuiltinAction } from '../../types';
import type { CodeGenOptions } from '../types';
import {
  getEventHandlerName,
  getScreenLoadFuncName,
  getComponentVarName,
  colorToLvgl,
  escapeCString,
} from '../utils/nameUtils';
import {
  generateInclude,
  generateSectionHeader,
  getIndent,
  generateComment,
  generateUserCodeSection,
} from '../formatters/cFormatter';

/**
 * Collect all events from all screens
 */
function getAllEvents(screens: Screen[]): { component: LvglComponent; event: EventBinding; screenName: string }[] {
  const result: { component: LvglComponent; event: EventBinding; screenName: string }[] = [];

  const collectFromComponents = (components: LvglComponent[], screenName: string) => {
    for (const comp of components) {
      for (const event of comp.events) {
        result.push({ component: comp, event, screenName });
      }
      collectFromComponents(comp.children, screenName);
    }
  };

  for (const screen of screens) {
    collectFromComponents(screen.components, screen.name);
  }

  return result;
}

/**
 * Find a component by name across all screens
 */
function findComponentByName(screens: Screen[], name: string): LvglComponent | null {
  const search = (components: LvglComponent[]): LvglComponent | null => {
    for (const comp of components) {
      if (comp.name === name) return comp;
      const found = search(comp.children);
      if (found) return found;
    }
    return null;
  };

  for (const screen of screens) {
    const found = search(screen.components);
    if (found) return found;
  }
  return null;
}

/**
 * Generate code for a builtin action
 */
function generateBuiltinActionCode(
  action: BuiltinAction,
  options: CodeGenOptions,
  screens: Screen[]
): string[] {
  const lines: string[] = [];
  const indent = getIndent(options, 2);
  
  switch (action.type) {
    case 'navigate': {
      // `targetPage` is the pre-rename spelling, still present in older projects.
      const targetName = action.targetScreen ?? action.targetPage;
      if (targetName) {
        // Find the screen to get the load function name
        const targetScreen = screens.find(s => s.name === targetName);
        if (targetScreen) {
          const loadFunc = getScreenLoadFuncName(targetScreen.name, options);
          if (options.generateComments) {
            lines.push(`${indent}${generateComment(`Navigate to: ${targetName}`, options)}`);
          }
          lines.push(`${indent}${loadFunc}();`);
        }
      }
      break;
    }
      
    case 'setProperty':
      if (action.targetComponent && action.property) {
        const targetVar = getComponentVarName(action.targetComponent, options);
        if (options.generateComments) {
          lines.push(`${indent}${generateComment(`Set property: ${action.property}`, options)}`);
        }
        
        // Handle different property types
        switch (action.property) {
          case 'bg_color':
            lines.push(`${indent}lv_obj_set_style_bg_color(${targetVar}, ${colorToLvgl(String(action.value || '#000000'))}, 0);`);
            break;
          case 'border_color':
            lines.push(`${indent}lv_obj_set_style_border_color(${targetVar}, ${colorToLvgl(String(action.value || '#000000'))}, 0);`);
            break;
          case 'border_width':
            lines.push(`${indent}lv_obj_set_style_border_width(${targetVar}, ${action.value || 0}, 0);`);
            break;
          case 'radius':
            lines.push(`${indent}lv_obj_set_style_radius(${targetVar}, ${action.value || 0}, 0);`);
            break;
          case 'opa':
            lines.push(`${indent}lv_obj_set_style_opa(${targetVar}, ${action.value || 255}, 0);`);
            break;
          case 'x':
            lines.push(`${indent}lv_obj_set_x(${targetVar}, ${action.value || 0});`);
            break;
          case 'y':
            lines.push(`${indent}lv_obj_set_y(${targetVar}, ${action.value || 0});`);
            break;
          case 'width':
            lines.push(`${indent}lv_obj_set_width(${targetVar}, ${action.value || 100});`);
            break;
          case 'height':
            lines.push(`${indent}lv_obj_set_height(${targetVar}, ${action.value || 100});`);
            break;
          default:
            lines.push(`${indent}// Unknown property: ${action.property}`);
        }
      }
      break;
      
    case 'show':
      if (action.targetComponent) {
        const targetVar = getComponentVarName(action.targetComponent, options);
        if (options.generateComments) {
          lines.push(`${indent}${generateComment(`Show component: ${action.targetComponent}`, options)}`);
        }
        lines.push(`${indent}lv_obj_clear_flag(${targetVar}, LV_OBJ_FLAG_HIDDEN);`);
      }
      break;
      
    case 'hide':
      if (action.targetComponent) {
        const targetVar = getComponentVarName(action.targetComponent, options);
        if (options.generateComments) {
          lines.push(`${indent}${generateComment(`Hide component: ${action.targetComponent}`, options)}`);
        }
        lines.push(`${indent}lv_obj_add_flag(${targetVar}, LV_OBJ_FLAG_HIDDEN);`);
      }
      break;
      
    case 'enable':
      if (action.targetComponent) {
        const targetVar = getComponentVarName(action.targetComponent, options);
        if (options.generateComments) {
          lines.push(`${indent}${generateComment(`Enable component: ${action.targetComponent}`, options)}`);
        }
        lines.push(`${indent}lv_obj_clear_state(${targetVar}, LV_STATE_DISABLED);`);
      }
      break;
      
    case 'disable':
      if (action.targetComponent) {
        const targetVar = getComponentVarName(action.targetComponent, options);
        if (options.generateComments) {
          lines.push(`${indent}${generateComment(`Disable component: ${action.targetComponent}`, options)}`);
        }
        lines.push(`${indent}lv_obj_add_state(${targetVar}, LV_STATE_DISABLED);`);
      }
      break;
      
    case 'setText':
      if (action.targetComponent) {
        const targetVar = getComponentVarName(action.targetComponent, options);
        const targetComp = findComponentByName(screens, action.targetComponent);
        const targetType = targetComp?.type || 'label';
        if (options.generateComments) {
          lines.push(`${indent}${generateComment(`Set text: ${action.value}`, options)}`);
        }
        const escapedText = escapeCString(String(action.value || ''));
        switch (targetType) {
          case 'textarea':
            lines.push(`${indent}lv_textarea_set_text(${targetVar}, "${escapedText}");`);
            break;
          case 'btn':
            lines.push(`${indent}lv_label_set_text(lv_obj_get_child(${targetVar}, 0), "${escapedText}");`);
            break;
          case 'checkbox':
            lines.push(`${indent}lv_checkbox_set_text(${targetVar}, "${escapedText}");`);
            break;
          case 'dropdown':
            lines.push(`${indent}lv_dropdown_set_text(${targetVar}, "${escapedText}");`);
            break;
          default:
            lines.push(`${indent}lv_label_set_text(${targetVar}, "${escapedText}");`);
            break;
        }
      }
      break;

    case 'setValue':
      if (action.targetComponent) {
        const targetVar = getComponentVarName(action.targetComponent, options);
        const targetComp = findComponentByName(screens, action.targetComponent);
        const targetType = targetComp?.type || 'slider';
        if (options.generateComments) {
          lines.push(`${indent}${generateComment(`Set value: ${action.value}`, options)}`);
        }
        switch (targetType) {
          case 'bar':
            lines.push(`${indent}lv_bar_set_value(${targetVar}, ${action.value || 0}, LV_ANIM_ON);`);
            break;
          case 'arc':
            lines.push(`${indent}lv_arc_set_value(${targetVar}, ${action.value || 0});`);
            break;
          default:
            lines.push(`${indent}lv_slider_set_value(${targetVar}, ${action.value || 0}, LV_ANIM_ON);`);
            break;
        }
      }
      break;
  }
  
  return lines;
}

/**
 * Generate event handler function
 */
function generateEventHandler(
  component: LvglComponent,
  event: EventBinding,
  options: CodeGenOptions,
  screens: Screen[]
): string {
  const lines: string[] = [];
  const indent = getIndent(options);
  const funcName = getEventHandlerName(component.name, event.eventType, options);
  
  lines.push(`void ${funcName}(lv_event_t *e) {`);
  lines.push(`${indent}lv_event_code_t code = lv_event_get_code(e);`);
  
  // Suppress unused variable warning if needed
  if (event.handlerType === 'builtin' && event.action) {
    lines.push(`${indent}(void)code; // Suppress unused variable warning`);
  }
  
  lines.push('');
  lines.push(`${indent}if (code == ${event.eventType}) {`);
  
  if (event.handlerType === 'builtin' && event.action) {
    // Generate builtin action code
    const actionLines = generateBuiltinActionCode(event.action, options, screens);
    lines.push(...actionLines);
  } else if (event.handlerType === 'custom' && event.customCode) {
    // Insert custom code
    const indent2 = getIndent(options, 2);
    const customLines = event.customCode.split('\n').map(line => `${indent2}${line}`);
    lines.push(...customLines);
  } else {
    // Empty handler with user code marker
    if (options.userCodeMarkers) {
      const indent2 = getIndent(options, 2);
      lines.push(`${indent2}${generateUserCodeSection(`${component.name}_${event.eventType}`, options)}`);
    }
  }
  
  lines.push(`${indent}}`);
  lines.push('}');
  
  return lines.join('\n');
}

/**
 * Generate ui_events.c source file
 */
export function generateEventsSource(screens: Screen[], options: CodeGenOptions): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('ui.h'));
  lines.push(generateInclude('ui_events.h'));
  lines.push('');
  
  // Event handlers
  const allEvents = getAllEvents(screens);
  
  if (allEvents.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Event Handlers', options));
      lines.push('');
    }
    
    for (const { component, event } of allEvents) {
      lines.push(generateEventHandler(component, event, options, screens));
      lines.push('');
    }
  } else {
    if (options.generateComments) {
      lines.push('// No events defined');
      lines.push('');
    }
  }
  
  // User code section at the end
  if (options.userCodeMarkers) {
    lines.push(generateUserCodeSection('events_custom', options));
  }
  
  return lines.join('\n');
}
