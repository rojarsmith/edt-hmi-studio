// ui_logic.h template generator
// Generates header file for logic orchestration functions

import type { CodeGenOptions } from '../types';
import type { LogicGraph } from '../../components/LogicEditor/types';
import {
  wrapInIncludeGuard,
  generateInclude,
  generateSectionHeader,
} from '../formatters/cFormatter';
import { getLogicFuncNames } from '../utils/nameUtils';

/**
 * Generate ui_logic.h header file
 */
export function generateLogicHeader(
  options: CodeGenOptions,
  graphs: LogicGraph[] = []
): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('lvgl.h'));
  lines.push(generateInclude('stdbool.h', true));
  lines.push(generateInclude('stdint.h', true));
  lines.push('');
  
  if (options.generateComments) {
    lines.push(generateSectionHeader('Logic Function Declarations', options));
    lines.push('');
  }
  
  if (graphs.length > 0) {
    const funcNames = getLogicFuncNames(graphs);

    // Generate function declarations for each graph
    for (const graph of graphs) {
      const functionName = funcNames.get(graph.id)!;


      if (options.generateComments && graph.description) {
        lines.push(`// ${graph.description}`);
      }
      lines.push(`void ${functionName}(void);`);
    }
    lines.push('');
    
    // Generate init function declaration
    if (options.generateComments) {
      lines.push('// Initialize all logic graphs');
    }
    lines.push('void ui_logic_init(void);');
  } else {
    if (options.generateComments) {
      lines.push('// No logic graphs defined');
      lines.push('');
    }
    lines.push('void ui_logic_init(void);');
  }
  
  const content = lines.join('\n');
  return wrapInIncludeGuard(content, 'UI_LOGIC_H');
}
