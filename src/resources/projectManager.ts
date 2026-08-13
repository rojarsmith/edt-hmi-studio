// Project Manager - Save/Load project files

import type { ProjectFile, ProjectScreen, ImageResource, FontResource } from './types';
import type { LogicGraph } from '../components/LogicEditor/types';
import type { CanvasState, Screen, ScreenGroup } from '../types';
import type { BoardId, CommunicationConfig } from '../types/hmi';
import {
  DEFAULT_BOARD_ID,
  createDefaultCommunicationConfig,
} from '../types/hmi';
import { migrateFontResource } from './converters/fontConverter';
import { applyTypographies } from '../codegen/typography';

const PROJECT_VERSION = '1.0.0';

/**
 * Create a new project file structure
 */
export function createProjectFile(
  name: string,
  screens: Screen[],
  canvas: CanvasState,
  images: ImageResource[],
  fonts: FontResource[],
  logicGraphs: LogicGraph[] = [],
  boardId: BoardId = DEFAULT_BOARD_ID,
  communication: CommunicationConfig = createDefaultCommunicationConfig(),
  screenGroups: ScreenGroup[] = [],
): ProjectFile {
  return {
    version: PROJECT_VERSION,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    canvasSize: {
      width: canvas.width,
      height: canvas.height,
    },
    screens: screens.map(screen => ({
      id: screen.id,
      name: screen.name,
      components: screen.components,
      backgroundColor: screen.backgroundColor,
      groupId: screen.groupId ?? null,
    })),
    screenGroups: screenGroups.map(group => ({ ...group })),
    resources: {
      images,
      fonts,
    },
    variables: [],
    logicGraphs,
    boardId,
    communication,
    codeGenOptions: {
      outputFormat: 'single-file',
      includeComments: true,
      useStaticAllocation: true,
      prefix: 'ui',
      indentSize: 4,
      indentStyle: 'spaces',
    },
  };
}

/**
 * Serialize project to JSON string
 */
export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Parse project from JSON string
 */
export function parseProject(jsonString: string): ProjectFile {
  const project = JSON.parse(jsonString) as ProjectFile;
  
  // Version compatibility check
  if (!project.version) {
    throw new Error('Invalid project file: missing version');
  }
  
  // Migrate old versions if needed
  const migrated = migrateProject(project);
  
  return migrated;
}

/**
 * Migrate project from older versions
 */
function migrateProject(project: ProjectFile): ProjectFile {
  const [major] = project.version.split('.').map(Number);
  
  // Currently only version 1.x.x is supported
  if (major !== 1) {
    console.warn(`Project version ${project.version} may not be fully compatible`);
  }
  
  const screens = (project.screens ?? project.pages ?? []) as ProjectScreen[];

  // Typographies are derived from the styling already present, so a project
  // written before they existed keeps rendering exactly as it did. Projects
  // that already have them are left alone — re-deriving would discard renaming.
  // Length rather than existence: an empty array is truthy, and a saved project
  // carries [] rather than omitting the field
  const typographyMigration = project.typographies?.length
    ? { screens, typographies: project.typographies }
    : applyTypographies(
        screens as unknown as Screen[],
        project.lvglConfig?.defaultFont,
        project.lvglConfig?.defaultFontSize,
      );

  // Ensure all required fields exist
  return {
    ...project,
    typographies: typographyMigration.typographies,
    // `pages` is what this field was called before the Page → Screen rename.
    screens: typographyMigration.screens as ProjectScreen[],
    screenGroups: project.screenGroups || [],
    pages: undefined,
    resources: {
      images: project.resources?.images || [],
      // Fonts saved before charsetMode existed are read as the mode that keeps
      // their output the same — see docs/charset-trimming-design.md §4
      fonts: (project.resources?.fonts || []).map(migrateFontResource),
    },
    variables: project.variables || [],
    logicGraphs: project.logicGraphs || [],
    boardId: project.boardId || DEFAULT_BOARD_ID,
    communication: {
      ...createDefaultCommunicationConfig(),
      ...(project.communication || {}),
      tags: project.communication?.tags || [],
    },
    codeGenOptions: project.codeGenOptions || {
      outputFormat: 'single-file',
      includeComments: true,
      useStaticAllocation: true,
      prefix: 'ui',
      indentSize: 4,
      indentStyle: 'spaces',
    },
  };
}

/**
 * Download project as JSON file
 */
export function downloadProject(project: ProjectFile): void {
  const json = serializeProject(project);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name || 'project'}.lvgl.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
}

/**
 * Load project from file input
 */
export function loadProjectFromFile(file: File): Promise<ProjectFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        const json = reader.result as string;
        const project = parseProject(json);
        resolve(project);
      } catch (error) {
        reject(new Error(`Failed to parse project file: ${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read project file'));
    };
    
    reader.readAsText(file);
  });
}

const AUTOSAVE_KEY = 'edt-gui-studio-autosave';
const AUTOSAVE_TIME_KEY = 'edt-gui-studio-autosave-time';

// Keys used before the project was renamed to EDT GUI Studio
const LEGACY_AUTOSAVE_KEY = 'lvgl-editor-autosave';
const LEGACY_AUTOSAVE_TIME_KEY = 'lvgl-editor-autosave-time';

/**
 * Move an auto-save written under the old key names to the current ones.
 * Runs at most once: the legacy keys are dropped afterwards.
 */
function migrateLegacyAutoSave(): void {
  try {
    const legacyJson = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    if (legacyJson === null) return;

    if (localStorage.getItem(AUTOSAVE_KEY) === null) {
      localStorage.setItem(AUTOSAVE_KEY, legacyJson);
      const legacyTime = localStorage.getItem(LEGACY_AUTOSAVE_TIME_KEY);
      if (legacyTime !== null) {
        localStorage.setItem(AUTOSAVE_TIME_KEY, legacyTime);
      }
    }

    localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
    localStorage.removeItem(LEGACY_AUTOSAVE_TIME_KEY);
  } catch (error) {
    console.error('Auto-save migration failed:', error);
  }
}

/**
 * Save project to localStorage (auto-save)
 */
export function autoSaveProject(project: ProjectFile): void {
  try {
    const json = serializeProject(project);
    localStorage.setItem(AUTOSAVE_KEY, json);
    localStorage.setItem(AUTOSAVE_TIME_KEY, Date.now().toString());
  } catch (error) {
    console.error('Auto-save failed:', error);
  }
}

/**
 * Load auto-saved project from localStorage
 */
export function loadAutoSavedProject(): ProjectFile | null {
  try {
    migrateLegacyAutoSave();
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (!json) return null;

    return parseProject(json);
  } catch (error) {
    console.error('Failed to load auto-saved project:', error);
    return null;
  }
}

/**
 * Get auto-save timestamp
 */
export function getAutoSaveTime(): Date | null {
  migrateLegacyAutoSave();
  const timestamp = localStorage.getItem(AUTOSAVE_TIME_KEY);
  if (!timestamp) return null;
  return new Date(parseInt(timestamp, 10));
}

/**
 * Clear auto-saved project
 */
export function clearAutoSave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
  localStorage.removeItem(AUTOSAVE_TIME_KEY);
  localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
  localStorage.removeItem(LEGACY_AUTOSAVE_TIME_KEY);
}

/**
 * Validate project structure
 */
export function validateProject(project: unknown): project is ProjectFile {
  if (!project || typeof project !== 'object') return false;
  
  const p = project as Record<string, unknown>;
  
  if (typeof p.version !== 'string') return false;
  if (typeof p.name !== 'string') return false;
  if (!p.canvasSize || typeof p.canvasSize !== 'object') return false;
  // Accept the pre-rename `pages` spelling so older files still validate.
  if (!Array.isArray(p.screens) && !Array.isArray(p.pages)) return false;
  
  return true;
}

/**
 * Calculate project file size (approximate)
 */
export function calculateProjectSize(project: ProjectFile): number {
  const json = serializeProject(project);
  return new Blob([json]).size;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
