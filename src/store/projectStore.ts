// Project management store — zustand + IndexedDB via idb

import { create } from 'zustand';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectFile, CodeGenOptions, ImageResource, FontResource } from '../resources/types';
import type { Animation, Screen, ScreenGroup, Typography, TypographyGroup, ProjectLanguage, TextResource, TextGroup } from '../types';
import type { LogicGraph } from '../components/LogicEditor/types';
import { applyTypographies } from '../codegen/typography';
import { getEntryScreen } from '../utils/entryScreen';
import { hoistComponentAnimations, migrateScreenLoadAnimations } from '../utils/animationAssets';
import { normalizeBuiltinSizes } from '../resources/builtinFonts';
import { applyTextResources } from '../codegen/textResources';
import { migrateFontResource } from '../resources/converters/fontConverter';
import { ensureBundledFonts, hydrateBundledFonts, stripBundledFontData } from '../resources/bundledFonts';
import { loadBundledFontData } from '../resources/bundledFontLoader';
import type {
  BoardId,
  CanBusConfig,
  CommunicationConfig,
  ProtocolId,
} from '../types/hmi';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_PROTOCOL_ID,
  createDefaultCanBusConfig,
  createDefaultCommunicationConfig,
  getBoardDefinition,
  isSupportedProtocolId,
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
  /** Optional one-line summary shown on the project card. */
  description?: string;
  /**
   * Optional custom card thumbnail as a data URI. Absent means the card
   * renders a schematic of the entry screen instead.
   */
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  boardId: BoardId;
  display: DisplayConfig;
  lvglConfig: LvglConfig;
  /**
   * Which field bus the project drives, chosen from the board's supported set
   * when the project is created. The per-protocol settings below are kept side
   * by side rather than replaced, so switching back and forth does not discard
   * a tag table the user already built.
   */
  protocol: ProtocolId;
  communication: CommunicationConfig;
  canBus: CanBusConfig;
  codeGenOptions: CodeGenOptions;
}

export interface ProjectData {
  projectId: string;
  screens: Screen[];
  screenGroups?: ScreenGroup[];
  /** Named text styles shared across widgets. */
  typographies?: Typography[];
  /** Organisational folders shown in the typography tree. */
  typographyGroups?: TypographyGroup[];
  /** Languages the project is translated into. The first is the default. */
  languages?: ProjectLanguage[];
  /** Shared text, referenced by widgets through textId. */
  texts?: TextResource[];
  /** Organisational folders shown in the texts tree. */
  textGroups?: TextGroup[];
  /** Project-level animations, each naming the widget it drives. */
  animations?: Animation[];
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
  /**
   * The project's entry screen (the flagged one, or the first screen when
   * none is flagged), kept for the card's schematic thumbnail. Null for a
   * project whose data record is missing.
   */
  entryScreen: Screen | null;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

/** Language existing literals are recorded under when a project first gains a text table. */
export const DEFAULT_LANGUAGE_CODE = 'en';
export const DEFAULT_LANGUAGE_NAME = 'English';

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

export const DEFAULT_CAN_BUS_CONFIG: CanBusConfig = createDefaultCanBusConfig();

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

const DB_NAME = 'edt-hmi-studio-projects';
const DB_VERSION = 1;

// Databases used before the project was renamed to EDT HMI Studio,
// newest first
const LEGACY_DB_NAMES = ['edt-gui-studio-projects', 'lvgl-editor-projects'];
const STORE_NAMES = ['projects', 'projectData', 'projectResources'] as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

/** Tail of every configuration write issued so far. See flushProjectConfigWrites. */
let configWriteQueue: Promise<void> = Promise.resolve();

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

function normalizeCanBusConfig(
  canBus?: Partial<CanBusConfig>,
): CanBusConfig {
  const defaults = createDefaultCanBusConfig();
  return {
    ...defaults,
    ...canBus,
    signals: (canBus?.signals || []).map((signal) => ({
      ...signal,
      scale: Number.isFinite(signal.scale) ? signal.scale : 1,
      offset: Number.isFinite(signal.offset) ? signal.offset : 0,
      pollIntervalMs: Number.isFinite(signal.pollIntervalMs)
        ? signal.pollIntervalMs
        : defaults.pollIntervalMs,
    })),
  };
}

function normalizeProjectConfig(
  config: ProjectConfig | (Omit<
    ProjectConfig,
    'boardId' | 'communication' | 'protocol' | 'canBus'
  > & {
    boardId?: BoardId;
    protocol?: ProtocolId;
    communication?: Partial<CommunicationConfig>;
    canBus?: Partial<CanBusConfig>;
  }),
): ProjectConfig {
  return {
    ...config,
    boardId: config.boardId ?? DEFAULT_BOARD_ID,
    // Projects created before the protocol split carry no value, and every one
    // of them is Modbus.
    protocol: isSupportedProtocolId(config.protocol)
      ? config.protocol
      : DEFAULT_PROTOCOL_ID,
    communication: normalizeCommunicationConfig(config.communication),
    canBus: normalizeCanBusConfig(config.canBus),
  };
}

/**
 * Open the pre-rename database without creating it.
 * Returns null when it never existed (the accidental empty database that
 * `openDB` creates in that case is deleted again).
 */
async function openLegacyDB(name: string): Promise<IDBPDatabase | null> {
  let created = false;
  const db = await openDB(name, undefined, {
    upgrade() {
      created = true;
    },
  });

  if (created) {
    db.close();
    await deleteDB(name);
    return null;
  }

  return db;
}

/**
 * Copy projects saved under an old database name into the current one.
 * Only runs while the current database is still empty, so it can never
 * overwrite newer data; a legacy database is dropped once copied.
 */
async function migrateLegacyDB(db: IDBPDatabase): Promise<void> {
  try {
    for (const legacyName of LEGACY_DB_NAMES) {
      if (await db.count('projects')) return;

      const legacy = await openLegacyDB(legacyName);
      if (!legacy) continue;

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

      await deleteDB(legacyName);
    }
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
    screens: [{ id: uuidv4(), name: 'Screen 1', components: [], backgroundColor: '#F5F5F5' }],
    logicGraphs: [],
    variables: [],
  } satisfies ProjectData);
}

async function dbGetProjectConfig(id: string): Promise<ProjectConfig | undefined> {
  const db = await getDB();
  const config = await db.get('projects', id) as ProjectConfig | undefined;
  return config ? normalizeProjectConfig(config) : undefined;
}

/**
 * Records written before the Page → Screen rename carry `pages` instead of
 * `screens`. Normalise on read so old projects open unchanged; the next save
 * writes them back under the current name.
 */
function normalizeProjectData(data: ProjectData | undefined): ProjectData | undefined {
  if (!data) return data;
  const legacy = data as ProjectData & { pages?: Screen[] };
  if (Array.isArray(data.screens)) return data;
  return { ...data, screens: legacy.pages ?? [] };
}

async function dbGetProjectData(id: string): Promise<ProjectData | undefined> {
  const db = await getDB();
  return normalizeProjectData(await db.get('projectData', id));
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
  createProject: (name: string, boardId: BoardId, display: DisplayConfig, lvglConfig: LvglConfig, protocol?: ProtocolId, description?: string) => Promise<string>;
  /**
   * Resolves once every configuration write issued so far has landed. Panels
   * that edit configuration debounce their saves, so an action on another tab —
   * a firmware build, most importantly — awaits this before reading the project
   * back, rather than racing whatever the user typed last.
   */
  flushProjectConfigWrites: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  getProjectConfig: (id: string) => Promise<ProjectConfig | undefined>;
  updateProjectConfig: (config: ProjectConfig) => Promise<void>;

  // Load / save project data (screens, logic, resources)
  loadProjectData: (id: string) => Promise<{ data: ProjectData; images: ImageResource[]; fonts: FontResource[] }>;
  /** Omit  to leave the stored list untouched. */
  saveProjectData: (id: string, screens: Screen[], logicGraphs: LogicGraph[], images: ImageResource[], fonts: FontResource[], screenGroups?: ScreenGroup[], typographies?: Typography[], languages?: ProjectLanguage[], texts?: TextResource[], typographyGroups?: TypographyGroup[], textGroups?: TextGroup[], animations?: Animation[]) => Promise<void>;

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
      items.push({ config, size, entryScreen: getEntryScreen(data?.screens ?? []) });
    }
    // Sort by updatedAt descending
    items.sort((a, b) => b.config.updatedAt - a.config.updatedAt);
    set({ projects: items });
  },

  createProject: async (name, boardId, display, lvglConfig, protocol, description) => {
    const id = uuidv4();
    const now = Date.now();
    const config: ProjectConfig = {
      id,
      name,
      description: description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      boardId,
      display,
      lvglConfig,
      protocol: protocol ?? DEFAULT_PROTOCOL_ID,
      communication: createDefaultCommunicationConfig(),
      canBus: createDefaultCanBusConfig(),
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
    const write = (async () => {
      await dbUpdateProjectConfig({ ...config, updatedAt: Date.now() });
      await get().refreshList();
    })();
    // Chained so flushProjectConfigWrites() waits for every write in flight,
    // including ones a panel issued on its way out during an unmount. The queue
    // itself never rejects; a failure reaches whoever awaited `write` below.
    configWriteQueue = configWriteQueue.then(() => write).catch(() => undefined);
    await write;
  },

  flushProjectConfigWrites: async () => {
    await configWriteQueue;
  },

  loadProjectData: async (id) => {
    const stored = await dbGetProjectData(id);
    if (!stored) {
      throw new Error('Project data not found');
    }
    const resources = await dbGetProjectResources(id);
    const images: ImageResource[] = [];
    const storedFonts: FontResource[] = [];
    for (const r of resources) {
      if (r.type === 'image') images.push(r.data as ImageResource);
      // A font stored before charsetMode existed has none, and the panel reads
      // that field directly
      else if (r.type === 'font') storedFonts.push(migrateFontResource(r.data as FontResource));
    }

    // Bundled fonts are stored without their payload; read it back from the
    // app's own files. A failed read leaves the font dataless rather than
    // failing the whole open — the canvas falls back and the panel still lists
    // the resource.
    const hydrated = await hydrateBundledFonts(storedFonts, async (file) => {
      try {
        return (await loadBundledFontData(file)).data;
      } catch (error) {
        console.error('Failed to load bundled font:', error);
        return '';
      }
    });

    // Bundled fonts are default-present: a project that does not carry one
    // yet gains it on open, exactly as choosing it by hand would have. Unused
    // ones cost nothing — neither declared, converted, nor saved by payload.
    const fonts = await ensureBundledFonts(hydrated, loadBundledFontData, uuidv4);

    // Opening a stored project is the common path, and it has to migrate for
    // the same reason opening a file does: a project saved before typographies
    // existed carries none, so without this every existing project shows an
    // empty Typographies panel however much styling it has.
    const config = await dbGetProjectConfig(id);
    // Length, not existence. An empty array is truthy, so testing the field
    // alone would skip migration for every project that has once been saved —
    // and saving writes [] rather than leaving the field out.
    let data: ProjectData = stored.typographies?.length
      ? stored
      : {
          ...stored,
          ...applyTypographies(
            stored.screens,
            config?.lvglConfig?.defaultFont,
            config?.lvglConfig?.defaultFontSize,
          ),
        };

    // A built-in size the build does not compile in has no symbol to link
    // against, so a project carrying one cannot build at all until it is
    // changed. Snapping on open makes it buildable and shows the truth on the
    // canvas, rather than failing thousands of lines into an LVGL compile.
    data = { ...data, typographies: normalizeBuiltinSizes(data.typographies ?? []) };

    // A project written before text resources existed has its words inside the
    // widgets. Derive them into a table under one default language, so the
    // Texts panel has something to show and nothing renders differently.
    if (!data.texts?.length) {
      const languages: ProjectLanguage[] = data.languages?.length
        ? data.languages
        : [{ code: DEFAULT_LANGUAGE_CODE, name: DEFAULT_LANGUAGE_NAME }];
      const derived = applyTextResources(data.screens, languages[0].code);
      data = { ...data, screens: derived.screens, texts: derived.texts, languages };
    }

    // Animations lived inside the component they drove before they became
    // project-level assets. Hoisting them on open is the same shape of
    // migration as the two above.
    if (!data.animations) {
      const hoisted = hoistComponentAnimations(data.screens);
      data = { ...data, screens: hoisted.screens, animations: hoisted.animations };
    }

    // Screens gained events of their own, and an entry animation is now one of
    // them rather than something the generator did on its own. A project from
    // before that gets the bindings that reproduce exactly what it used to do.
    data = {
      ...data,
      screens: migrateScreenLoadAnimations(data.screens, data.animations ?? [], uuidv4),
    };

    return { data, images, fonts };
  },

  saveProjectData: async (id, screens, logicGraphs, images, fonts, screenGroups = [], typographies, languages, texts, typographyGroups, textGroups, animations) => {
    // Omitting typographies means "leave them alone", not "delete them". They
    // are written once by migration and then only by the editor, so defaulting
    // to an empty array let every autosave quietly wipe the list while the
    // widgets kept pointing at ids that no longer resolved.
    const previous = (typographies && languages && texts && animations) ? undefined : await dbGetProjectData(id);
    const nextTypographies = typographies ?? previous?.typographies ?? [];
    const nextLanguages = languages ?? previous?.languages ?? [];
    const nextTexts = texts ?? previous?.texts ?? [];
    const config = await dbGetProjectConfig(id);
    if (config) {
      await dbUpdateProjectConfig({ ...config, updatedAt: Date.now() });
    }
    // Same rule as typographies: omitting them means "leave them alone", so an
    // autosave from a panel that does not know about groups cannot wipe them
    const nextTypographyGroups = typographyGroups ?? previous?.typographyGroups ?? [];
    const nextTextGroups = textGroups ?? previous?.textGroups ?? [];
    // Same rule again: an omitted list means "leave it alone", never "wipe it".
    const nextAnimations = animations ?? previous?.animations ?? [];
    await dbUpdateProjectData({ projectId: id, screens, screenGroups, typographies: nextTypographies, typographyGroups: nextTypographyGroups, languages: nextLanguages, texts: nextTexts, textGroups: nextTextGroups, animations: nextAnimations, logicGraphs, variables: [] });
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
    // Upsert fonts. Bundled ones are stored without their payload — loading
    // reads it back from the app's own files, so autosaves stay small.
    for (const font of fonts) {
      const resId = `${projectId}-font-${font.id}`;
      newIds.add(resId);
      await dbPutResource({ id: resId, projectId, type: 'font', data: stripBundledFontData(font) });
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
      description: config.description,
      thumbnail: config.thumbnail,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      canvasSize: { width: config.display.width, height: config.display.height },
      screens: data.screens.map(s => ({
        id: s.id,
        name: s.name,
        components: s.components,
        backgroundColor: s.backgroundColor,
        groupId: s.groupId ?? null,
        // The firmware build reads its boot screen from here, so dropping the
        // flag would silently start the device on the first screen instead.
        isEntry: s.isEntry,
        // Likewise these: without them an exported project boots with nothing
        // animating, because the entry animation is one of these bindings.
        events: s.events,
      })),
      screenGroups: (data.screenGroups || []).map(g => ({ ...g })),
      typographyGroups: (data.typographyGroups || []).map(g => ({ ...g })),
      textGroups: (data.textGroups || []).map(g => ({ ...g })),
      // Without these an exported project loses every translation and named
      // style on the way out, and import re-derives a single-language table
      typographies: (data.typographies || []).map(t => ({ ...t })),
      languages: (data.languages || []).map(l => ({ ...l })),
      texts: (data.texts || []).map(t => ({ ...t, values: { ...t.values } })),
      // Dropping these would leave the firmware with no animations at all —
      // the same field-by-field trap the entry-screen flag fell into.
      animations: (data.animations || []).map(a => ({ ...a })),
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
      protocol: config.protocol,
      communication: config.communication,
      canBus: config.canBus,
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

    const config: ProjectConfig = normalizeProjectConfig({
      id,
      name: name || file.name || 'Imported Project',
      description: file.description,
      thumbnail: file.thumbnail,
      createdAt: now,
      updatedAt: now,
      boardId,
      display,
      lvglConfig,
      protocol: file.protocol,
      communication,
      canBus: file.canBus,
      codeGenOptions: file.codeGenOptions || { ...DEFAULT_CODEGEN_OPTIONS },
    });
    await dbUpdateProjectConfig(config);

    // `pages` is the pre-rename spelling, still present in older project files.
    const rawScreens: Screen[] = (file.screens || file.pages || []).map(s => ({
      id: s.id,
      name: s.name,
      components: s.components,
      backgroundColor: s.backgroundColor ?? '#F5F5F5',
      groupId: s.groupId ?? null,
      isEntry: s.isEntry,
      events: s.events,
    }));

    // Import is its own path into the app, so it has to run the same migrations
    // as opening a file. Without this an imported project would arrive with no
    // typographies at all, however much styling it carries.
    const lifted = file.animations
      ? { screens: rawScreens, animations: file.animations.map(a => ({ ...a })) }
      : hoistComponentAnimations(rawScreens);
    const migrated = file.typographies?.length
      ? { screens: lifted.screens, typographies: file.typographies }
      : applyTypographies(lifted.screens, lvglConfig.defaultFont, lvglConfig.defaultFontSize);

    await dbUpdateProjectData({
      projectId: id,
      screens: migrateScreenLoadAnimations(migrated.screens, lifted.animations, uuidv4),
      screenGroups: (file.screenGroups || []).map(g => ({ ...g })),
      typographyGroups: (file.typographyGroups || []).map(g => ({ ...g })),
      // Same reason as the read path: a built-in size the build does not
      // compile in has no symbol, and the project could not build at all
      typographies: normalizeBuiltinSizes(migrated.typographies),
      // A file that carries its own translations keeps them; one that does not
      // gets a table derived on first load, as the read-side migration does
      languages: file.languages || [],
      texts: file.texts || [],
      textGroups: (file.textGroups || []).map(g => ({ ...g })),
      animations: lifted.animations,
      logicGraphs: file.logicGraphs || [],
      variables: (file.variables || []).map(v => ({ ...v, type: v.type as string })),
    });

    // Save resources
    const images = file.resources?.images || [];
    const fonts = file.resources?.fonts || [];
    for (const img of images) {
      await dbPutResource({ id: `${id}-img-${img.id}`, projectId: id, type: 'image', data: img });
    }
    for (const rawFont of fonts) {
      // Same reason as the typographies above: a font imported from an older
      // file carries no charsetMode, and the panel reads that field directly
      const font = migrateFontResource(rawFont);
      // Same shape syncResources writes: a bundled font's payload comes from
      // the app, not the database
      await dbPutResource({ id: `${id}-font-${font.id}`, projectId: id, type: 'font', data: stripBundledFontData(font) });
    }

    await get().refreshList();
    return id;
  },
}));
