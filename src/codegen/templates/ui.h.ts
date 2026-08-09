// ui.h template generator

import type { Screen, LvglComponent } from '../../types';
import type { FontResource } from '../../resources/types';
import type { CodeGenOptions } from '../types';
import {
  getScreenVarName,
  getComponentVarName,
  getScreenLoadFuncName,
} from '../utils/nameUtils';
import {
  wrapInIncludeGuard,
  generateInclude,
  formatExtern,
  formatFuncDecl,
  generateSectionHeader,
} from '../formatters/cFormatter';

/**
 * Flatten all components from all screens
 */
function getAllComponents(screens: Screen[]): { component: LvglComponent; screenName: string }[] {
  const result: { component: LvglComponent; screenName: string }[] = [];
  
  const flatten = (components: LvglComponent[], screenName: string) => {
    for (const comp of components) {
      result.push({ component: comp, screenName });
      flatten(comp.children, screenName);
    }
  };
  
  for (const screen of screens) {
    flatten(screen.components, screen.name);
  }
  
  return result;
}

/**
 * Generate ui.h header file
 */
export function generateUiHeader(screens: Screen[], options: CodeGenOptions, fonts: FontResource[] = [], defaultFont?: string, defaultFontSize?: number, useBuiltinSymbols?: boolean): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('lvgl.h'));
  lines.push('');

  // Font declarations — only declare custom font+size combos actually used
  if (fonts.length > 0) {
    const isBuiltin = (name: string) => /^montserrat_\d+$/.test(name);
    const customFontNames = new Set(fonts.map(f => f.cFontName));
    const usedFonts = new Map<string, Set<number>>();

    const addFont = (fontName: string, size: number) => {
      if (!usedFonts.has(fontName)) {
        usedFonts.set(fontName, new Set());
      }
      usedFonts.get(fontName)!.add(size);
    };

    const walkComponents = (components: LvglComponent[]) => {
      for (const comp of components) {
        if (comp.props.fontResource) {
          const fontName = comp.props.fontResource as string;
          if (!isBuiltin(fontName) && customFontNames.has(fontName)) {
            addFont(fontName, (comp.props.fontSize as number) || 16);
          }
        } else if (comp.props.fontSize !== undefined && defaultFont && !isBuiltin(defaultFont) && customFontNames.has(defaultFont)) {
          // No fontResource but has fontSize override — uses default font with different size
          const fontSize = comp.props.fontSize as number;
          if (fontSize !== (defaultFontSize || 16)) {
            addFont(defaultFont, fontSize);
          }
        }
        if (comp.styles.default.textFont) {
          const fontName = comp.styles.default.textFont;
          if (!isBuiltin(fontName) && customFontNames.has(fontName)) {
            addFont(fontName, comp.styles.default.textFontSize || 16);
          }
        }
        for (const state of ['pressed', 'focused', 'disabled'] as const) {
          const stateStyles = comp.styles[state];
          if (stateStyles?.textFont) {
            const fontName = stateStyles.textFont;
            if (!isBuiltin(fontName) && customFontNames.has(fontName)) {
              addFont(fontName, stateStyles.textFontSize || 16);
            }
          }
        }
        walkComponents(comp.children);
      }
    };

    for (const screen of screens) {
      walkComponents(screen.components);
    }

    // Include project default font if custom
    if (defaultFont && !isBuiltin(defaultFont) && customFontNames.has(defaultFont)) {
      // Always include the default font at its default size
      addFont(defaultFont, defaultFontSize || 16);
    }

    if (usedFonts.size > 0) {
      if (options.generateComments) {
        lines.push(generateSectionHeader('Font Declarations', options));
        lines.push('');
      }

      for (const [fontName, sizes] of usedFonts) {
        const sortedSizes = [...sizes].sort((a, b) => a - b);
        for (const size of sortedSizes) {
          lines.push(`LV_FONT_DECLARE(${fontName}_${size});`);
        }
      }
      lines.push('');
    }
  }
  
  // Screen declarations
  if (options.generateComments) {
    lines.push(generateSectionHeader('Screen Declarations', options));
    lines.push('');
  }
  
  for (const screen of screens) {
    const varName = getScreenVarName(screen.name, options);
    lines.push(formatExtern('lv_obj_t', varName));
  }
  lines.push('');
  
  // Component declarations — detect cross-screen name collisions
  const allComponents = getAllComponents(screens);
  const componentsByName = new Map<string, { component: LvglComponent; screenName: string }[]>();
  for (const entry of allComponents) {
    const existing = componentsByName.get(entry.component.name) || [];
    existing.push(entry);
    componentsByName.set(entry.component.name, existing);
  }
  const needsScreenPrefix = new Set<string>();
  for (const [, entries] of componentsByName) {
    if (entries.length > 1) {
      const uniquePages = new Set(entries.map(e => e.screenName));
      if (uniquePages.size > 1) {
        for (const entry of entries) {
          needsScreenPrefix.add(entry.component.id);
        }
      }
    }
  }

  if (allComponents.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Component Declarations', options));
      lines.push('');
    }

    for (const { component, screenName } of allComponents) {
      const varName = needsScreenPrefix.has(component.id)
        ? getComponentVarName(`${screenName}_${component.name}`, options)
        : getComponentVarName(component.name, options);
      lines.push(formatExtern('lv_obj_t', varName));
    }
    lines.push('');
  }
  
  // Symbol font declaration
  if (useBuiltinSymbols) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Symbol Font', options));
      lines.push('');
    }
    lines.push('extern const lv_font_t *ui_symbol_font;');
    lines.push('');
  }

  // Function declarations
  if (options.generateComments) {
    lines.push(generateSectionHeader('Function Declarations', options));
    lines.push('');
  }
  
  // Main init function
  lines.push(formatFuncDecl('void', 'ui_init', []));
  lines.push('');

  const imageButtons = allComponents.filter(
    ({ component }) => component.type === 'image-button',
  );
  if (imageButtons.length > 0) {
    for (const { component, screenName } of imageButtons) {
      const varName = needsScreenPrefix.has(component.id)
        ? getComponentVarName(`${screenName}_${component.name}`, options)
        : getComponentVarName(component.name, options);
      lines.push(
        formatFuncDecl('float', `${varName}_get_value`, [
          'lv_obj_t *object',
        ]),
      );
      lines.push(
        formatFuncDecl('void', `${varName}_set_value`, [
          'lv_obj_t *object',
          'float value',
        ]),
      );
    }
    lines.push('');
  }
  
  // Screen load functions
  for (const screen of screens) {
    const funcName = getScreenLoadFuncName(screen.name, options);
    lines.push(formatFuncDecl('void', funcName, []));
  }
  
  const content = lines.join('\n');
  return wrapInIncludeGuard(content, 'UI_H');
}
