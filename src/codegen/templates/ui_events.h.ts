// ui_events.h template generator

import type { Animation, Screen } from '../../types';
import type { CodeGenOptions } from '../types';
import {
  animCompletedFuncName,
  collectAnimationSymbols,
  hasCompletedBindings,
} from '../animationSymbols';
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
export function generateEventsHeader(
  screens: Screen[],
  options: CodeGenOptions,
  animations: Animation[] = [],
): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('lvgl.h'));
  lines.push('');
  
  // Event handler declarations
  const groups = groupEventHandlers(screens);
  // ui.c hands these to lv_anim_set_completed_cb, so they are declared here
  // with the object handlers it hands to lv_obj_add_event_cb.
  const completed = collectAnimationSymbols(animations, screens, options)
    .filter(hasCompletedBindings);

  if (groups.length > 0 || completed.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Event Handler Declarations', options));
      lines.push('');
    }

    for (const group of groups) {
      const funcName = getEventHandlerName(group.handlerBase, group.eventType, options);
      lines.push(formatFuncDecl('void', funcName, ['lv_event_t *e']));
    }
    for (const symbol of completed) {
      lines.push(formatFuncDecl('void', animCompletedFuncName(symbol), ['lv_anim_t *a']));
    }
  } else {
    if (options.generateComments) {
      lines.push('// No events defined');
    }
  }
  
  const content = lines.join('\n');
  return wrapInIncludeGuard(content, 'UI_EVENTS_H');
}
