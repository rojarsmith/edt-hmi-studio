// ui_events.h template generator

import type { Screen } from '../../types';
import type { CodeGenOptions } from '../types';
import { getEventHandlerName } from '../utils/nameUtils';
import { groupEventHandlers } from './ui_events.c';
import {
  wrapInIncludeGuard,
  generateInclude,
  formatFuncDecl,
  generateSectionHeader,
} from '../formatters/cFormatter';


/**
 * Generate ui_events.h header file
 */
export function generateEventsHeader(screens: Screen[], options: CodeGenOptions): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('lvgl.h'));
  lines.push('');
  
  // Event handler declarations
  const groups = groupEventHandlers(screens);

  if (groups.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Event Handler Declarations', options));
      lines.push('');
    }

    for (const group of groups) {
      const funcName = getEventHandlerName(group.handlerBase, group.eventType, options);
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
