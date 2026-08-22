// ui.h template generator

import type { Animation, Screen, LvglComponent, Typography } from '../../types';
import type { FontResource } from '../../resources/types';
import type { CodeGenOptions } from '../types';
import { collectUsedCustomFonts } from '../fontUsage';
import {
  animStartFuncName,
  animStopFuncName,
  collectAnimationSymbols,
} from '../animationSymbols';
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
export function generateUiHeader(screens: Screen[], options: CodeGenOptions, fonts: FontResource[] = [], defaultFont?: string, defaultFontSize?: number, useBuiltinSymbols?: boolean, typographies: Typography[] = [], animations: Animation[] = []): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('lvgl.h'));
  lines.push('');

  // Font declarations — only declare custom font+size combos actually used
  if (fonts.length > 0) {
    const usedFonts = collectUsedCustomFonts(screens, fonts, defaultFont, defaultFontSize, typographies);

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

  const qrcodes = allComponents.filter(
    ({ component }) => component.type === 'qrcode',
  );
  if (qrcodes.length > 0) {
    for (const { component, screenName } of qrcodes) {
      const varName = needsScreenPrefix.has(component.id)
        ? getComponentVarName(`${screenName}_${component.name}`, options)
        : getComponentVarName(component.name, options);
      // What a string binding calls when communication replaces the content.
      lines.push(
        formatFuncDecl('void', `${varName}_qr_set_text`, [
          'lv_obj_t *object',
          'const char *text',
        ]),
      );
    }
    lines.push('');
  }

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

  // Animations. Declared for everything that can trigger one — a screen
  // appearing today, an event or a logic graph next.
  const animationSymbols = collectAnimationSymbols(animations, screens, options, needsScreenPrefix)
    .filter((symbol) => symbol.tracks.length > 0);
  if (animationSymbols.length > 0) {
    lines.push('');
    for (const symbol of animationSymbols) {
      lines.push(formatFuncDecl('void', animStartFuncName(symbol), []));
      lines.push(formatFuncDecl('void', animStopFuncName(symbol), []));
    }
  }
  
  const content = lines.join('\n');
  return wrapInIncludeGuard(content, 'UI_H');
}
