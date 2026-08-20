// ui_events.c template generator

import type { Animation, Screen, LvglComponent, EventBinding, BuiltinAction, ProjectLanguage } from '../../types';
import { NEXT_LANGUAGE } from '../../types';
import type { LogicGraph } from '../../components/LogicEditor/types';

/** One object's one event type, and every binding the panel listed for it. */
export interface EventHandlerGroup {
  /** Component name, or `screen_<name>` for a screen's own events. */
  handlerBase: string;
  eventType: EventBinding['eventType'];
  bindings: EventBinding[];
  /** Set when the screen itself carries the bindings, rather than a widget. */
  screen?: Screen;
}
import { getLogicFuncNames } from '../utils/nameUtils';
import {
  animStartFuncName,
  animStopFuncName,
  animationSymbolsById,
  type AnimationSymbol,
} from '../animationSymbols';
import { screenLoadStatement } from '../screenTransition';
import type { CodeGenOptions } from '../types';
import {
  getEventHandlerName,
  getComponentVarName,
  getScreenVarName,
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
  languages: ProjectLanguage[],
  animations: Map<string, AnimationSymbol>,
  /** The screen carrying the binding, when a screen rather than a widget does. */
  ownerScreen?: Screen,
): string[] {
  const lines: string[] = [];
  const indent = getIndent(options, 2);
  
  switch (action.type) {
    case 'navigate': {
      // `targetPage` is the pre-rename spelling, still present in older projects.
      const targetName = action.targetScreen ?? action.targetPage;
      if (targetName) {
        const targetScreen = screens.find(s => s.name === targetName);
        if (targetScreen) {
          // The load call is written out here rather than delegated to the
          // screen's load function, because the transition belongs to this
          // navigation - two buttons can enter the same screen from opposite
          // directions.
          if (options.generateComments) {
            lines.push(`${indent}${generateComment(`Navigate to: ${targetName}`, options)}`);
          }
          const screenVar = getScreenVarName(targetScreen.name, options);
          lines.push(`${indent}${screenLoadStatement(screenVar, action)}`);
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

    case 'playAnimation':
    case 'stopAnimation': {
      const play = action.type === 'playAnimation';
      // An animation deleted after the event was bound, or one whose property
      // cannot be animated, generates no function at all — calling it would
      // fail to link rather than merely do nothing.
      const symbol = action.animationId ? animations.get(action.animationId) : undefined;
      if (!symbol || symbol.tracks.length === 0) {
        lines.push(
          `${indent}// ${play ? 'Play' : 'Stop'} animation skipped: this binding names no animation the project still has`,
        );
        break;
      }
      // A screen can only animate what it shows. Driving a widget on another
      // screen moves something invisible and looks like nothing happening.
      if (ownerScreen && symbol.screen.id !== ownerScreen.id) {
        lines.push(
          `${indent}// ${play ? 'Play' : 'Stop'} animation skipped: "${symbol.animation.name}" drives a widget on screen "${symbol.screen.name}"`,
        );
        break;
      }
      if (options.generateComments) {
        lines.push(
          `${indent}${generateComment(`${play ? 'Play' : 'Stop'} animation: ${symbol.animation.name}`, options)}`,
        );
      }
      lines.push(`${indent}${play ? animStartFuncName(symbol) : animStopFuncName(symbol)}();`);
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
/**
 * Every object that carries events — widgets and the screens themselves —
 * grouped so one handler serves one object's one event type.
 *
 * Emitting a function per binding gave two bindings of the same type the same
 * symbol, which does not compile; a screen playing several entry animations
 * has exactly that by construction.
 */
export function groupEventHandlers(screens: Screen[]): EventHandlerGroup[] {
  const groups = new Map<string, EventHandlerGroup>();

  const add = (handlerBase: string, event: EventBinding, screen?: Screen) => {
    const key = `${handlerBase}::${event.eventType}`;
    const existing = groups.get(key);
    if (existing) existing.bindings.push(event);
    else groups.set(key, { handlerBase, eventType: event.eventType, bindings: [event], screen });
  };

  for (const screen of screens) {
    // A screen's own bindings share the screen variable's base, so the handler
    // reads ui_event_screen_main_screen_loaded.
    for (const event of screen.events ?? []) add(`screen_${screen.name}`, event, screen);
    const visit = (components: LvglComponent[]) => {
      for (const component of components) {
        for (const event of component.events) add(component.name, event);
        visit(component.children);
      }
    };
    visit(screen.components);
  }

  return [...groups.values()];
}

function generateEventHandler(
  group: EventHandlerGroup,
  options: CodeGenOptions,
  screens: Screen[],
  languages: ProjectLanguage[],
  logicGraphs: LogicGraph[],
  logicFuncNames: Map<string, string>,
  animations: Map<string, AnimationSymbol>,
): string {
  const lines: string[] = [];
  const indent = getIndent(options);
  const indent2 = getIndent(options, 2);
  const funcName = getEventHandlerName(group.handlerBase, group.eventType, options);
  const hasAction = group.bindings.some(
    (event) => event.handlerType === 'builtin' && event.action,
  );

  lines.push(`void ${funcName}(lv_event_t *e) {`);
  lines.push(`${indent}lv_event_code_t code = lv_event_get_code(e);`);

  // Suppress unused variable warning if needed
  if (hasAction) {
    lines.push(`${indent}(void)code; // Suppress unused variable warning`);
  }

  lines.push('');
  lines.push(`${indent}if (code == ${group.eventType}) {`);

  // Every binding of this type runs here, in the order the panel lists them.
  for (const event of group.bindings) {
    if (event.handlerType === 'builtin' && event.action) {
      lines.push(...generateBuiltinActionCode(event.action, options, screens, languages, animations, group.screen));
    } else if (event.handlerType === 'custom' && event.customCode) {
      lines.push(...event.customCode.split('\n').map(line => `${indent2}${line}`));
    } else if (event.handlerType === 'logic') {
      lines.push(...generateLogicHandlerCode(event, options, logicGraphs, logicFuncNames));
    } else if (options.userCodeMarkers) {
      lines.push(`${indent2}${generateUserCodeSection(`${group.handlerBase}_${group.eventType}`, options)}`);
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
  projectAnimations: Animation[] = [],
): string {
  const lines: string[] = [];
  // The same name table ui_logic.h/.c share, computed over the same graph
  // list, so an event handler and the function it calls cannot disagree
  const logicFuncNames = getLogicFuncNames(logicGraphs);
  // Resolved once: the same table ui.c named the animation functions from, so
  // a button and the animation it plays cannot disagree about the symbol.
  const animations = animationSymbolsById(projectAnimations, screens, options);
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
  const hasScreenEvents = screens.some((screen) => (screen.events ?? []).length > 0);

  if (allEvents.length > 0 || hasScreenEvents) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Event Handlers', options));
      lines.push('');
    }

    for (const group of groupEventHandlers(screens)) {
      lines.push(generateEventHandler(group, options, screens, languages, logicGraphs, logicFuncNames, animations));
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
