// Main code generator

import type { Screen, Theme, Typography, TextResource, ProjectLanguage } from '../types';
import type { LogicGraph } from '../components/LogicEditor/types';
import type { ImageResource, FontResource } from '../resources/types';
import type { CodeGenOptions, GeneratedCode } from './types';
import { DEFAULT_CODEGEN_OPTIONS } from './types';
import { generateUiHeader } from './templates/ui.h';
import { deriveTypographies } from './typography';
import { generateUiSource } from './templates/ui.c';
import { generateEventsHeader } from './templates/ui_events.h';
import { generateEventsSource } from './templates/ui_events.c';
import { generateLogicHeader } from './templates/ui_logic.h';
import { generateLogicSource } from './templates/ui_logic.c';
import {
  loadImageFromBase64,
  generateImageCCode,
  DEFAULT_IMAGE_OPTIONS,
} from '../resources/converters/imageConverter';

/**
 * Generate all LVGL C code files from screens and logic graphs
 */
export function generateCode(
  screens: Screen[],
  options: Partial<CodeGenOptions> = {},
  logicGraphs: LogicGraph[] = [],
  theme?: Theme,
  imageResources: ImageResource[] = [],
  fontResources: FontResource[] = [],
  defaultFont?: string,
  defaultFontSize?: number,
  useBuiltinSymbols?: boolean,
  symbolFont?: string,
  typographies?: Typography[],
  texts: TextResource[] = [],
  languages: ProjectLanguage[] = []
): GeneratedCode {
  // The same stored-or-derived rule ui.c applies internally: ui.h must declare
  // fonts for exactly the typography set ui.c initialises.
  const effectiveTypographies = typographies?.length
    ? typographies
    : deriveTypographies(screens, defaultFont, defaultFontSize).typographies;

  const opts: CodeGenOptions = { ...DEFAULT_CODEGEN_OPTIONS, ...options };
  
  return {
    'ui.h': generateUiHeader(screens, opts, fontResources, defaultFont, defaultFontSize, useBuiltinSymbols, effectiveTypographies),
    'ui.c': generateUiSource(screens, opts, theme, imageResources, defaultFont, defaultFontSize, fontResources, useBuiltinSymbols, symbolFont, typographies, texts, languages),
    'ui_events.h': generateEventsHeader(screens, opts),
    'ui_events.c': generateEventsSource(screens, opts, languages),
    'ui_logic.h': generateLogicHeader(opts, logicGraphs),
    'ui_logic.c': generateLogicSource(opts, logicGraphs, screens),
  };
}

/**
 * Generate a single file
 */
export function generateSingleFile(
  screens: Screen[],
  fileName: keyof GeneratedCode,
  options: Partial<CodeGenOptions> = {},
  logicGraphs: LogicGraph[] = [],
  theme?: Theme,
  imageResources: ImageResource[] = [],
  fontResources: FontResource[] = [],
  defaultFont?: string,
  defaultFontSize?: number,
  useBuiltinSymbols?: boolean,
  symbolFont?: string,
  typographies?: Typography[],
  texts: TextResource[] = [],
  languages: ProjectLanguage[] = []
): string {
  const opts: CodeGenOptions = { ...DEFAULT_CODEGEN_OPTIONS, ...options };
  // Same stored-or-derived rule as generateCode, for the same reason
  const effectiveTypographies = typographies?.length
    ? typographies
    : deriveTypographies(screens, defaultFont, defaultFontSize).typographies;

  switch (fileName) {
    case 'ui.h':
      return generateUiHeader(screens, opts, fontResources, defaultFont, defaultFontSize, useBuiltinSymbols, effectiveTypographies);
    case 'ui.c':
      return generateUiSource(screens, opts, theme, imageResources, defaultFont, defaultFontSize, fontResources, useBuiltinSymbols, symbolFont, typographies, texts, languages);
    case 'ui_events.h':
      return generateEventsHeader(screens, opts);
    case 'ui_events.c':
      return generateEventsSource(screens, opts, languages);
    case 'ui_logic.h':
      return generateLogicHeader(opts, logicGraphs);
    case 'ui_logic.c':
      return generateLogicSource(opts, logicGraphs, screens);
    default:
      throw new Error(`Unknown file: ${fileName}`);
  }
}

/**
 * Get list of generated file names
 */
export function getGeneratedFileNames(): (keyof GeneratedCode)[] {
  return ['ui.h', 'ui.c', 'ui_events.h', 'ui_events.c', 'ui_logic.h', 'ui_logic.c'];
}

/**
 * Create a ZIP blob containing all generated files
 * Note: This requires JSZip library to be installed
 */
export async function generateZipBlob(
  screens: Screen[],
  options: Partial<CodeGenOptions> = {},
  logicGraphs: LogicGraph[] = [],
  theme?: Theme,
  imageResources: ImageResource[] = []
): Promise<Blob> {
  // Dynamic import to avoid bundling JSZip if not needed
  const JSZip = (await import('jszip')).default;
  
  const code = generateCode(screens, options, logicGraphs, theme, imageResources);
  const zip = new JSZip();
  
  // Add all files to zip
  for (const [fileName, content] of Object.entries(code)) {
    zip.file(fileName, content);
  }

  // Generate and add image C array files for used resources
  if (imageResources.length > 0) {
    // Collect which images are actually used
    const usedIds = new Set<string>();
    const walk = (components: import('../types').LvglComponent[]) => {
      for (const comp of components) {
        if (comp.type === 'img' && comp.props.src) {
          const matched = imageResources.find(
            (img) =>
              img.id === comp.props.src ||
              img.name === comp.props.src ||
              img.cArrayName === comp.props.src
          );
          if (matched) usedIds.add(matched.id);
        }
        if (comp.type === 'image-button' && Array.isArray(comp.props.states)) {
          for (const state of comp.props.states) {
            const imageId =
              state && typeof state === 'object'
                ? (state as { imageId?: string }).imageId
                : undefined;
            if (!imageId) continue;
            const matched = imageResources.find(
              (img) =>
                img.id === imageId ||
                img.name === imageId ||
                img.cArrayName === imageId
            );
            if (matched) usedIds.add(matched.id);
          }
        }
        walk(comp.children);
      }
    };
    for (const screen of screens) walk(screen.components);

    const usedImages = imageResources.filter((img) => usedIds.has(img.id));
    for (const img of usedImages) {
      try {
        const { imageData } = await loadImageFromBase64(img.data);
        const convOptions = { ...DEFAULT_IMAGE_OPTIONS, format: img.format };
        const result = generateImageCCode(img.cArrayName, imageData, convOptions);
        zip.file(`${img.cArrayName}.c`, result.cCode);
      } catch (err) {
        console.error(`Failed to generate C code for image ${img.name}:`, err);
      }
    }
  }
  
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Download generated code as ZIP file
 */
export async function downloadAsZip(
  screens: Screen[],
  options: Partial<CodeGenOptions> = {},
  logicGraphs: LogicGraph[] = [],
  zipFileName: string = 'lvgl_ui.zip',
  theme?: Theme,
  imageResources: ImageResource[] = []
): Promise<void> {
  const blob = await generateZipBlob(screens, options, logicGraphs, theme, imageResources);
  
  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
