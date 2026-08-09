// ui_events.h template generator

import type { Screen, LvglComponent, EventBinding } from '../../types';
import type { CodeGenOptions } from '../types';
import { getEventHandlerName } from '../utils/nameUtils';
import {
  wrapInIncludeGuard,
  generateInclude,
  formatFuncDecl,
  generateSectionHeader,
} from '../formatters/cFormatter';

/**
 * Collect all events from all screens
 */
function getAllEvents(screens: Screen[]): { component: LvglComponent; event: EventBinding }[] {
  const result: { component: LvglComponent; event: EventBinding }[] = [];
  
  const collectFromComponents = (components: LvglComponent[]) => {
    for (const comp of components) {
      for (const event of comp.events) {
        result.push({ component: comp, event });
      }
      collectFromComponents(comp.children);
    }
  };
  
  for (const screen of screens) {
    collectFromComponents(screen.components);
  }
  
  return result;
}

/**
 * Generate ui_events.h header file
 */
export function generateEventsHeader(screens: Screen[], options: CodeGenOptions): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('lvgl.h'));
  lines.push('');
  
  // Event handler declarations
  const allEvents = getAllEvents(screens);
  
  if (allEvents.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Event Handler Declarations', options));
      lines.push('');
    }
    
    for (const { component, event } of allEvents) {
      const funcName = getEventHandlerName(component.name, event.eventType, options);
      lines.push(formatFuncDecl('void', funcName, ['lv_event_t *e']));
    }
  } else {
    if (options.generateComments) {
      lines.push('// No events defined');
    }
  }
  
  const content = lines.join('\n');
  return wrapInIncludeGuard(content, 'UI_EVENTS_H');
}
