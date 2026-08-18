// Resource Management Types

import type { LogicGraph } from '../components/LogicEditor/types';
import type { LvglComponent, Typography, TypographyGroup, ProjectLanguage, TextResource, TextGroup } from '../types';
import type {
  BoardId,
  CanBusConfig,
  CommunicationConfig,
  ProtocolId,
} from '../types/hmi';

export type ImageFormat = 'RGB565' | 'RGB888' | 'ARGB8888';

export interface ImageResource {
  id: string;
  name: string;
  /**
   * Slash-separated folder path this image sits under, taken from the relative
   * path of an uploaded directory. Empty string means the root. Only used to
   * group the resource list; it has no effect on generated code, where every
   * image is a flat C array.
   */
  folder?: string;
  originalName: string;
  width: number;
  height: number;
  format: ImageFormat;
  data: string; // Base64 encoded original image
  cArrayName: string;
  size: number; // File size in bytes
  createdAt: number;
}

export interface FontResource {
  id: string;
  name: string;
  family: string;
  style: string;
  sizes: number[];
  /** How the glyph coverage is decided. See `CharsetMode`. */
  charsetMode: CharsetMode;
  /** Which preset to use. Only meaningful when `charsetMode` is `preset`. */
  charset: CharsetType;
  /** Characters to include on top of the mode's own set — TouchGFX's "wildcard characters". */
  extraChars?: string;
  /** Ranges to include on top, e.g. `"0x4E00-0x4EFF,0xFF00-0xFFEF"`. */
  extraRanges?: string;
  /** @deprecated Pre-`charsetMode` field; `migrateFontResource` moves it into `extraChars`. */
  customChars?: string;
  bpp: 1 | 2 | 4 | 8;
  data: string; // Base64 encoded TTF/OTF
  /**
   * Catalog id when this font ships with the app (see `bundledFonts.ts`).
   * Persisted copies of such fonts drop `data` and rehydrate it on load.
   */
  bundled?: string;
  cFontName: string;
  size: number; // File size in bytes
  createdAt: number;
}

export type CharsetType = 'ascii' | 'latin' | 'cjk-basic' | 'custom';

/**
 * How a font's glyph coverage is decided.
 *
 * - `auto`   — the characters the project's text actually uses, plus an ASCII
 *              baseline and whatever extras the author declares
 * - `preset` — a fixed Unicode block from `CHARSET_PRESETS`
 * - `manual` — exactly the characters and ranges the author lists
 *
 * See docs/charset-trimming-design.md §4.
 */
export type CharsetMode = 'auto' | 'preset' | 'manual';

export interface CharsetPreset {
  id: CharsetType;
  name: string;
  description: string;
  ranges: [number, number][]; // Unicode ranges
}

export const CHARSET_PRESETS: CharsetPreset[] = [
  {
    id: 'ascii',
    name: 'ASCII',
    description: 'Basic ASCII characters (32-126)',
    ranges: [[32, 126]],
  },
  {
    id: 'latin',
    name: 'Latin Extended',
    description: 'ASCII + Latin Extended (32-591)',
    ranges: [[32, 126], [160, 591]],
  },
  {
    id: 'cjk-basic',
    name: 'CJK Basic',
    description: 'ASCII + Common CJK characters',
    ranges: [[32, 126], [0x4E00, 0x9FFF]],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Custom character set',
    ranges: [],
  },
];

export interface IconResource {
  id: string;
  name: string;
  category: string;
  svgData: string;
  width: number;
  height: number;
}

export interface ResourceStore {
  images: ImageResource[];
  fonts: FontResource[];
  icons: IconResource[];
}

// Project file format
export interface ProjectFile {
  version: string;
  name: string;
  /** Optional one-line summary shown on the project card. */
  description?: string;
  /** Optional custom card thumbnail as a data URI. */
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  canvasSize: {
    width: number;
    height: number;
  };
  screens: ProjectScreen[];
  screenGroups?: ProjectScreenGroup[];
  /** @deprecated Pre-rename spelling of `screens`; still read from older project files. */
  pages?: ProjectScreen[];
  resources: {
    images: ImageResource[];
    fonts: FontResource[];
  };
  /**
   * Named text styles shared across widgets. Absent in files written before
   * typographies existed; migration derives them from the styling already
   * there, so nothing renders differently.
   */
  typographies?: Typography[];
  /** Organisational folders for the typography tree. Purely a UI grouping. */
  typographyGroups?: TypographyGroup[];
  /** Languages the project is translated into. The first is the default. */
  languages?: ProjectLanguage[];
  /** Shared text, referenced by widgets through textId. */
  texts?: TextResource[];
  /** Organisational folders for the texts tree. Purely a UI grouping. */
  textGroups?: TextGroup[];
  variables: ProjectVariable[];
  logicGraphs?: LogicGraph[];
  codeGenOptions: CodeGenOptions;
  // Extended fields (optional, for project round-trip)
  boardId?: BoardId;
  /** Absent in files written before the Protocol/Deploy split; those are Modbus. */
  protocol?: ProtocolId;
  communication?: CommunicationConfig;
  canBus?: CanBusConfig;
  display?: {
    width: number;
    height: number;
    colorDepth: 16 | 24 | 32;
    rotation: 0 | 90 | 180 | 270;
  };
  lvglConfig?: {
    version: '9';
    colorFormat: 'RGB565' | 'RGB888' | 'ARGB8888';
    fontLarge: boolean;
    defaultFont: string;
    defaultFontSize?: number;
    useBuiltinSymbols?: boolean;
    symbolFont?: string;
    memSize: number;
  };
}

export interface ProjectScreen {
  id: string;
  name: string;
  components: LvglComponent[];
  backgroundColor?: string;
  groupId?: string | null;
  /**
   * Marks the screen the generated firmware boots into. See `Screen.isEntry`
   * in `src/types`; a file without it boots its first screen, which is what
   * every project written before the flag existed expects.
   */
  isEntry?: boolean;
}

/** Organisational folder for screens. See `ScreenGroup` in `src/types`. */
export interface ProjectScreenGroup {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface ProjectVariable {
  id: string;
  name: string;
  type: 'int' | 'string' | 'bool' | 'float';
  defaultValue: string;
}

export interface CodeGenOptions {
  outputFormat: 'single-file' | 'multi-file';
  includeComments: boolean;
  useStaticAllocation: boolean;
  prefix: string;
  indentSize: number;
  indentStyle: 'spaces' | 'tabs';
}

// Image conversion options
export interface ImageConversionOptions {
  format: ImageFormat;
  dither: boolean;
  compress: boolean;
  swapBytes: boolean; // For RGB565 byte order
}

// Font conversion options
export interface FontConversionOptions {
  sizes: number[];
  charset: CharsetType;
  customChars?: string;
  bpp: 1 | 2 | 4 | 8; // Bits per pixel for anti-aliasing
  compress: boolean;
}

// Built-in icons (Material Icons subset)
export interface BuiltInIcon {
  name: string;
  category: string;
  path: string; // SVG path data
}

export const ICON_CATEGORIES = [
  'action',
  'navigation',
  'content',
  'communication',
  'device',
  'file',
  'hardware',
  'social',
  'toggle',
] as const;

export type IconCategory = typeof ICON_CATEGORIES[number];
