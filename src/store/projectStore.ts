// Project management store — zustand + IndexedDB via idb

import { create } from 'zustand';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectFile, CodeGenOptions, ImageResource, FontResource } from '../resources/types';
import type { Page } from '../types';
import type { LogicGraph } from '../components/LogicEditor/types';
import type { BoardId, CommunicationConfig } from '../types/hmi';
import {
  DEFAULT_BOARD_ID,
  createDefaultCommunicationConfig,
  getBoardDefinition,
} from '../types/hmi';

// ---------------------------------------------------------------------------
// Project config type
// ---------------------------------------------------------------------------

export interface DisplayConfig {
  width: number;
  height: number;
  colorDepth: 16 | 24 | 32;
  rotation: 0 | 90 | 180 | 270;
}

export interface LvglConfig {
  version: '9';
  colorFormat: 'RGB565' | 'RGB888' | 'ARGB8888';
  fontLarge: boolean;
  defaultFont: string;
  defaultFontSize?: number; // Only used when defaultFont is a custom font
  useBuiltinSymbols: boolean; // Inject LVGL built-in symbol font declarations
  symbolFont?: string; // Built-in font for symbols, e.g. 'montserrat_14'
  memSize: number; // KB
}

export interface ProjectConfig {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  boardId: BoardId;
  display: DisplayConfig;
  lvglConfig: LvglConfig;
  communication: CommunicationConfig;
  codeGenOptions: CodeGenOptions;
}

export interface ProjectData {
  projectId: string;
  pages: Page[];
  logicGraphs: LogicGraph[];
  variables: { id: string; name: string; type: string; defaultValue: string }[];
}

export interface ProjectResource {
  id: string; // resourceId
  projectId: string;
  type: 'image' | 'font';
  data: ImageResource | FontResource;
}

export interface ProjectListItem {
  config: ProjectConfig;
  size: number; // approximate bytes
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_BOARD = getBoardDefinition(DEFAULT_BOARD_ID);

export const DEFAULT_DISPLAY: DisplayConfig = {
  width: DEFAULT_BOARD.display.width,
  height: DEFAULT_BOARD.display.height,
  colorDepth: DEFAULT_BOARD.display.colorDepth,
  rotation: 0,
};

export const DEFAULT_LVGL_CONFIG: LvglConfig = {
  version: '9',
  colorFormat: DEFAULT_BOARD.display.colorFormat,
  fontLarge: true,
  defaultFont: 'montserrat_14',
  useBuiltinSymbols: true,
  symbolFont: 'montserrat_14',
  memSize: 64,
};

export const DEFAULT_COMMUNICATION_CONFIG: CommunicationConfig =
  createDefaultCommunicationConfig();

export const DEFAULT_CODEGEN_OPTIONS: CodeGenOptions = {
  outputFormat: 'single-file',
  includeComments: true,
  useStaticAllocation: true,
  prefix: 'ui',
  indentSize: 4,
  indentStyle: 'spaces',
};

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

const DB_NAME = 'edt-gui-studio-projects';
const DB_VERSION = 1;

// Database used before the project was renamed to EDT GUI Studio
const LEGACY_DB_NAME = 'lvgl-editor-projects';
const STORE_NAMES = ['projects', 'projectData', 'projectResources'] as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

function normalizeCommunicationConfig(
  communication?: Partial<CommunicationConfig>,
): CommunicationConfig {
  const defaults = createDefaultCommunicationConfig();
  return {
    ...defaults,
    ...communication,
    tags: (communication?.tags || []).map((tag) => ({
      ...tag,
      scale: Number.isFinite(tag.scale) ? tag.scale : 1,
      pollIntervalMs: Number.isFinite(tag.pollIntervalMs)
        ? tag.pollIntervalMs
        : defaults.pollIntervalMs,
    })),
  };
}

function normalizeProjectConfig(
  config: ProjectConfig | (Omit<ProjectConfig, 'boardId' | 'communication'> & {
    boardId?: BoardId;
    communication?: Partial<CommunicationConfig>;
  }),
): ProjectConfig {
  return {
    ...config,
    boardId: config.boardId ?? DEFAULT_BOARD_ID,
    communication: normalizeCommunicationConfig(config.communication),
  };
}

/**
 * Open the pre-rename database without creating it.
 * Returns null when it never existed (the accidental empty database that
 * `openDB` creates in that case is deleted again).
 */
async function openLegacyDB(): Promise<IDBPDatabase | null> {
  let created = false;
  const db = await openDB(LEGACY_DB_NAME, undefined, {
    upgrade() {
      created = true;
    },
  });

  if (created) {
    db.close();
    await deleteDB(LEGACY_DB_NAME);
    return null;
  }

  return db;
}

/**
 * Copy projects saved under the old database name into the current one.
 * Only runs while the current database is still empty, so it can never
 * overwrite newer data; the legacy database is dropped once copied.
 */
async function migrateLegacyDB(db: IDBPDatabase): Promise<void> {
  try {
    if (await db.count('projects')) return;

    const legacy = await openLegacyDB();
    if (!legacy) return;

    try {
      for (const storeName of STORE_NAMES) {
        if (!legacy.objectStoreNames.contains(storeName)) continue;
        const records = await legacy.getAll(storeName);
        if (records.length === 0) continue;

        const tx = db.transaction(storeName, 'readwrite');
        await Promise.all(records.map((record) => tx.store.put(record)));
        await tx.done;
      }
    } finally {
      legacy.close();
    }

    await deleteDB(LEGACY_DB_NAME);
  } catch (error) {
    console.error('Failed to migrate the legacy project database:', error);
  }
}

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('projectData')) {
          db.createObjectStore('projectData', { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains('projectResources')) {
          const store = db.createObjectStore('projectResources', { keyPath: 'id' });
          store.createIndex('byProject', 'projectId');
        }
      },
    }).then(async (db) => {
      await migrateLegacyDB(db);
      return db;
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// CRUD operations (raw IndexedDB)
// ---------------------------------------------------------------------------

async function dbCreateProject(config: ProjectConfig): Promise<void> {
  const db = await getDB();
  await db.put('projects', normalizeProjectConfig(config));
  await db.put('projectData', {
    projectId: config.id,
    pages: [{ id: uuidv4(), name: 'Page 1', components: [], backgroundColor: '#F5F5F5' }],
    logicGraphs: [],
    variables: [],
  } satisfies ProjectData);
}

async function dbGetProjectConfig(id: string): Promise<ProjectConfig | undefined> {
  const db = await getDB();
  const config = await db.get('projects', id) as ProjectConfig | undefined;
  return config ? normalizeProjectConfig(config) : undefined;
}

async function dbGetProjectData(id: string): Promise<ProjectData | undefined> {
  const db = await getDB();
  return db.get('projectData', id);
}

async function dbGetProjectResources(projectId: string): Promise<ProjectResource[]> {
  const db = await getDB();
  return db.getAllFromIndex('projectResources', 'byProject', projectId);
}

async function dbUpdateProjectConfig(config: ProjectConfig): Promise<void> {
  const db = await getDB();
  await db.put('projects', normalizeProjectConfig(config));
}

async function dbUpdateProjectData(data: ProjectData): Promise<void> {
  const db = await getDB();
  await db.put('projectData', data);
}

async function dbPutResource(resource: ProjectResource): Promise<void> {
  const db = await getDB();
  await db.put('projectResources', resource);
}

async function dbDeleteResource(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('projectResources', id);
}

async function dbDeleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('projects', id);
  await db.delete('projectData', id);
  // Delete all resources for this project
  const resources = await db.getAllFromIndex('projectResources', 'byProject', id);
  const tx = db.transaction('projectResources', 'readwrite');
  for (const r of resources) {
    await tx.store.delete(r.id);
  }
  await tx.done;
}

async function dbListProjects(): Promise<ProjectConfig[]> {
  const db = await getDB();
  const configs = await db.getAll('projects') as ProjectConfig[];
  return configs.map(normalizeProjectConfig);
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

interface ProjectStoreState {
  projects: ProjectListItem[];
  loading: boolean;
  initialized: boolean;

  // Actions
  init: () => Promise<void>;
  refreshList: () => Promise<void>;
  createProject: (name: string, boardId: BoardId, display: DisplayConfig, lvglConfig: LvglConfig) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  getProjectConfig: (id: string) => Promise<ProjectConfig | undefined>;
  updateProjectConfig: (config: ProjectConfig) => Promise<void>;

  // Load / save project data (pages, logic, resources)
  loadProjectData: (id: string) => Promise<{ data: ProjectData; images: ImageResource[]; fonts: FontResource[] }>;
  saveProjectData: (id: string, pages: Page[], logicGraphs: LogicGraph[], images: ImageResource[], fonts: FontResource[]) => Promise<void>;

  // Import / export
  exportProject: (id: string) => Promise<ProjectFile>;
  importProject: (file: ProjectFile, name?: string) => Promise<string>;

  // Resource sync helpers
  syncResources: (projectId: string, images: ImageResource[], fonts: FontResource[]) => Promise<void>;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  loading: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ loading: true });
    await get().refreshList();
    set({ initialized: true, loading: false });
  },

  refreshList: async () => {
    const configs = await dbListProjects();
    // Calculate approximate sizes
    const items: ProjectListItem[] = [];
    for (const config of configs) {
      const data = await dbGetProjectData(config.id);
      const resources = await dbGetProjectResources(config.id);
      let size = JSON.stringify(config).length + JSON.stringify(data).length;
      for (const r of resources) {
        size += JSON.stringify(r.data).length;
      }
      items.push({ config, size });
    }
    // Sort by updatedAt descending
    items.sort((a, b) => b.config.updatedAt - a.config.updatedAt);
    set({ projects: items });
  },

  createProject: async (name, boardId, display, lvglConfig) => {
    const id = uuidv4();
    const now = Date.now();
    const config: ProjectConfig = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      boardId,
      display,
      lvglConfig,
      communication: createDefaultCommunicationConfig(),
      codeGenOptions: { ...DEFAULT_CODEGEN_OPTIONS },
    };
    await dbCreateProject(config);
    await get().refreshList();
    return id;
  },

  deleteProject: async (id) => {
    await dbDeleteProject(id);
    await get().refreshList();
  },

  getProjectConfig: async (id) => {
    return dbGetProjectConfig(id);
  },

  updateProjectConfig: async (config) => {
    await dbUpdateProjectConfig({ ...config, updatedAt: Date.now() });
    await get().refreshList();
  },

  loadProjectData: async (id) => {
    const data = await dbGetProjectData(id);
    if (!data) {
      throw new Error('Project data not found');
    }
    const resources = await dbGetProjectResources(id);
    const images: ImageResource[] = [];
    const fonts: FontResource[] = [];
    for (const r of resources) {
      if (r.type === 'image') images.push(r.data as ImageResource);
      else if (r.type === 'font') fonts.push(r.data as FontResource);
    }
    return { data, images, fonts };
  },

  saveProjectData: async (id, pages, logicGraphs, images, fonts) => {
    const config = await dbGetProjectConfig(id);
    if (config) {
      await dbUpdateProjectConfig({ ...config, updatedAt: Date.now() });
    }
    await dbUpdateProjectData({ projectId: id, pages, logicGraphs, variables: [] });
    await get().syncResources(id, images, fonts);
  },

  syncResources: async (projectId, images, fonts) => {
    // Get existing resources
    const existing = await dbGetProjectResources(projectId);
    const existingIds = new Set(existing.map(r => r.id));
    const newIds = new Set<string>();

    // Upsert images
    for (const img of images) {
      const resId = `${projectId}-img-${img.id}`;
      newIds.add(resId);
      await dbPutResource({ id: resId, projectId, type: 'image', data: img });
    }
    // Upsert fonts
    for (const font of fonts) {
      const resId = `${projectId}-font-${font.id}`;
      newIds.add(resId);
      await dbPutResource({ id: resId, projectId, type: 'font', data: font });
    }
    // Delete removed resources
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        await dbDeleteResource(id);
      }
    }
  },

  exportProject: async (id) => {
    const config = await dbGetProjectConfig(id);
    if (!config) throw new Error('Project not found');
    const { data, images, fonts } = await get().loadProjectData(id);

    const projectFile: ProjectFile = {
      version: '1.0.0',
      name: config.name,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      canvasSize: { width: config.display.width, height: config.display.height },
      pages: data.pages.map(p => ({
        id: p.id,
        name: p.name,
        components: p.components,
        backgroundColor: p.backgroundColor,
      })),
      resources: { images, fonts },
      variables: data.variables.map(v => ({
        id: v.id,
        name: v.name,
        type: v.type as 'int' | 'string' | 'bool' | 'float',
        defaultValue: v.defaultValue,
      })),
      logicGraphs: data.logicGraphs,
      codeGenOptions: config.codeGenOptions,
      // Extended fields for round-trip
      boardId: config.boardId,
      display: config.display,
      lvglConfig: config.lvglConfig,
      communication: config.communication,
    };
    return projectFile;
  },

  importProject: async (file, name) => {
    const id = uuidv4();
    const now = Date.now();
    // Extract display config from file if available
    const display: DisplayConfig = (file as ProjectFile & { display?: DisplayConfig }).display ?? {
      width: file.canvasSize.width,
      height: file.canvasSize.height,
      colorDepth: 32,
      rotation: 0,
    };
    const lvglConfig: LvglConfig = (file as ProjectFile & { lvglConfig?: LvglConfig }).lvglConfig ?? { ...DEFAULT_LVGL_CONFIG };
    const boardId = file.boardId ?? DEFAULT_BOARD_ID;
    const communication = normalizeCommunicationConfig(file.communication);

    const config: ProjectConfig = {
      id,
      name: name || file.name || 'Imported Project',
      createdAt: now,
      updatedAt: now,
      boardId,
      display,
      lvglConfig,
      communication,
      codeGenOptions: file.codeGenOptions || { ...DEFAULT_CODEGEN_OPTIONS },
    };
    await dbUpdateProjectConfig(config);

    const pages: Page[] = (file.pages || []).map(p => ({
      id: p.id,
      name: p.name,
      components: p.components,
      backgroundColor: p.backgroundColor ?? '#F5F5F5',
    }));
    await dbUpdateProjectData({
      projectId: id,
      pages,
      logicGraphs: file.logicGraphs || [],
      variables: (file.variables || []).map(v => ({ ...v, type: v.type as string })),
    });

    // Save resources
    const images = file.resources?.images || [];
    const fonts = file.resources?.fonts || [];
    for (const img of images) {
      await dbPutResource({ id: `${id}-img-${img.id}`, projectId: id, type: 'image', data: img });
    }
    for (const font of fonts) {
      await dbPutResource({ id: `${id}-font-${font.id}`, projectId: id, type: 'font', data: font });
    }

    await get().refreshList();
    return id;
  },
}));
