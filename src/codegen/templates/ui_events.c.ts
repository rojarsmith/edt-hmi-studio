// ui_events.c template generator

import type { Screen, LvglComponent, EventBinding, BuiltinAction, ProjectLanguage } from '../../types';
import { NEXT_LANGUAGE } from '../../types';
import type { LogicGraph } from '../../components/LogicEditor/types';
import { getLogicFuncNames } from '../utils/nameUtils';
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

/** Name of the file-local helper that walks the project's languages in order. */
const NEXT_LANGUAGE_FUNC = 'ui_events_next_language';

/** Does any event cycle the language, and so need the helper defined? */
function usesNextLanguage(screens: Screen[]): boolean {
  return getAllEvents(screens).some(
    ({ event }) =>
      event.handlerType === 'builtin' &&
      event.action?.type === 'setLanguage' &&
      event.action.language === NEXT_LANGUAGE,
  );
}

/**
 * The helper behind "next language".
 *
 * The codes are held here rather than read back from `ui.c`'s `ui_languages`,
 * which is static to that translation unit — and the list is short enough that
 * duplicating it costs less than the export would.
 *
 * A current language outside the list (nothing has called
 * `lv_translation_set_language` yet) starts from the first, which is also the
 * language `ui_init` selects.
 */
function generateNextLanguageHelper(
  languages: ProjectLanguage[],
  options: CodeGenOptions,
): string[] {
  const lines: string[] = [];
  const indent = getIndent(options);
  const indent2 = getIndent(options, 2);
  const indent3 = getIndent(options, 3);

  if (options.generateComments) {
    lines.push(generateSectionHeader('Language Switching', options));
    lines.push('');
    lines.push(generateComment('Advance to the next project language, wrapping at the end', options));
  }
  lines.push(`static void ${NEXT_LANGUAGE_FUNC}(void) {`);
  lines.push(
    `${indent}static const char * const codes[] = {${languages
      .map((language) => `"${escapeCString(language.code)}"`)
      .join(', ')}};`,
  );
  lines.push(`${indent}const uint32_t count = (uint32_t)(sizeof(codes) / sizeof(codes[0]));`);
  lines.push(`${indent}const char * current = lv_translation_get_language();`);
  lines.push(`${indent}uint32_t index;`);
  lines.push('');
  lines.push(`${indent}for (index = 0U; index < count; ++index) {`);
  lines.push(`${indent2}if (current != NULL && lv_streq(current, codes[index])) {`);
  lines.push(`${indent3}lv_translation_set_language(codes[(index + 1U) % count]);`);
  lines.push(`${indent3}return;`);
  lines.push(`${indent2}}`);
  lines.push(`${indent}}`);
  lines.push(`${indent}lv_translation_set_language(codes[0]);`);
  lines.push('}');
  lines.push('');

  return lines;
}

/**
 * Generate code for a builtin action
 */
function generateBuiltinActionCode(
  action: BuiltinAction,
  options: CodeGenOptions,
  screens: Screen[],
  languages: ProjectLanguage[]
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

    // Every widget carrying a text resource follows on its own: labels handle
    // LV_EVENT_TRANSLATION_LANGUAGE_CHANGED themselves and ui.c registers a
    // callback for the ones that do not, so switching the language is the whole
    // action.
    case 'setLanguage': {
      if (action.language === NEXT_LANGUAGE) {
        // A single language has no next; emitting the call would still compile
        // but the button would do nothing, which reads as a defect
        if (languages.length < 2) break;
        if (options.generateComments) {
          lines.push(`${indent}${generateComment('Switch to the next language', options)}`);
        }
        lines.push(`${indent}${NEXT_LANGUAGE_FUNC}();`);
        break;
      }

      // A language deleted after the event was bound leaves a code the project
      // no longer has. Generating it would compile and then silently resolve
      // every tag to its fallback at runtime.
      const target = languages.find((language) => language.code === action.language);
      if (!target) break;
      if (options.generateComments) {
        lines.push(`${indent}${generateComment(`Switch language to: ${target.name}`, options)}`);
      }
      lines.push(`${indent}lv_translation_set_language("${escapeCString(target.code)}");`);
      break;
    }
  }

  return lines;
}

/**
 * The Logic handler: call each selected graph's event entry in list order.
 * A graph that is gone - deleted, or switched off and therefore absent from
 * generated code - gets a comment, never a call to a missing symbol.
 */
function generateLogicHandlerCode(
  event: EventBinding,
  options: CodeGenOptions,
  logicGraphs: LogicGraph[],
  logicFuncNames: Map<string, string>,
): string[] {
  const lines: string[] = [];
  const indent2 = getIndent(options, 2);
  const graphIds = event.logicGraphIds ?? [];

  if (graphIds.length === 0) {
    lines.push(`${indent2}// No logic graphs selected`);
    return lines;
  }

  for (const graphId of graphIds) {
    const graph = logicGraphs.find(g => g.id === graphId);
    const funcName = graph ? logicFuncNames.get(graph.id) : undefined;
    if (!graph || !funcName) {
      lines.push(`${indent2}// Logic graph unavailable (deleted or inactive)`);
      continue;
    }
    if (options.generateComments) {
      lines.push(`${indent2}${generateComment(`Run logic: ${graph.name}`, options)}`);
    }
    lines.push(`${indent2}${funcName}();`);
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
  screens: Screen[],
  languages: ProjectLanguage[],
  logicGraphs: LogicGraph[],
  logicFuncNames: Map<string, string>,
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
    const actionLines = generateBuiltinActionCode(event.action, options, screens, languages);
    lines.push(...actionLines);
  } else if (event.handlerType === 'custom' && event.customCode) {
    // Insert custom code
    const indent2 = getIndent(options, 2);
    const customLines = event.customCode.split('\n').map(line => `${indent2}${line}`);
    lines.push(...customLines);
  } else if (event.handlerType === 'logic') {
    lines.push(...generateLogicHandlerCode(event, options, logicGraphs, logicFuncNames));
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
export function generateEventsSource(
  screens: Screen[],
  options: CodeGenOptions,
  languages: ProjectLanguage[] = [],
  logicGraphs: LogicGraph[] = [],
): string {
  const lines: string[] = [];
  // The same name table ui_logic.h/.c share, computed over the same graph
  // list, so an event handler and the function it calls cannot disagree
  const logicFuncNames = getLogicFuncNames(logicGraphs);
  const hasLogicHandlers = getAllEvents(screens).some(
    ({ event }) => event.handlerType === 'logic'
  );

  // Includes
  lines.push(generateInclude('ui.h'));
  lines.push(generateInclude('ui_events.h'));
  if (hasLogicHandlers) {
    lines.push(generateInclude('ui_logic.h'));
  }
  lines.push('');

  // Emitted before the handlers that call it, and only when one does. The
  // length check matches the one the action itself applies: with a single
  // language there is no next, and nothing calls this.
  if (languages.length > 1 && usesNextLanguage(screens)) {
    lines.push(...generateNextLanguageHelper(languages, options));
  }

  // Event handlers
  const allEvents = getAllEvents(screens);

  if (allEvents.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Event Handlers', options));
      lines.push('');
    }

    for (const { component, event } of allEvents) {
      lines.push(generateEventHandler(component, event, options, screens, languages, logicGraphs, logicFuncNames));
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
