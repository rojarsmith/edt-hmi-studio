// Resource Store - Zustand store for resource management

import { create } from 'zustand';
import type {
  ImageResource,
  FontResource,
  IconResource,
  ImageFormat,
} from './types';
import {
  fileToBase64,
  getImageDimensions,
  loadImageFromBase64,
  generateImageCCode,
  DEFAULT_IMAGE_OPTIONS,
} from './converters/imageConverter';
import {
  fontFileToBase64,
  parseFontMetadata,
  migrateFontResource,
} from './converters/fontConverter';

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/** Local copies so the store does not depend on the view layer's tree module. */
const normalizeFolder = (input: string | undefined): string => (input || '')
  .replace(/\\/g, '/')
  .split('/')
  .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
  .join('/');

const isWithin = (path: string, folder: string): boolean =>
  folder === '' || path === folder || path.startsWith(`${folder}/`);

/** A path plus every ancestor, so creating a/b/c materializes a and a/b too. */
const chainOf = (path: string): string[] => {
  const segments = path.split('/');
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
};

/** Rewrites `from` and everything under it to sit at `to`. */
function remapFolders(
  state: { imageFolders: string[]; images: ImageResource[] },
  from: string,
  to: string,
) {
  const rewrite = (path: string) => (
    isWithin(path, from) ? to + path.slice(from.length) : path
  );
  return {
    imageFolders: [...new Set([
      ...state.imageFolders.map(rewrite),
      ...chainOf(to),
    ])].sort(),
    images: state.images.map((image) => {
      const path = normalizeFolder(image.folder);
      return isWithin(path, from) ? { ...image, folder: rewrite(path) } : image;
    }),
  };
}

// Generate C-safe name
const toCName = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&')
    .toLowerCase();
};

interface ResourceState {
  // Resources
  images: ImageResource[];
  /**
   * Folders that exist independently of the images in them. Folder paths are
   * otherwise derivable from image.folder, but an empty folder has no image to
   * derive it from and would vanish on reload.
   */
  imageFolders: string[];
  fonts: FontResource[];
  icons: IconResource[];
  
  // UI State. Which resource kind is showing is a routing concern now that
  // Image, Text and Icon are top-level tabs, so it no longer lives here.
  searchQuery: string;
  selectedResourceId: string | null;
  
  // Actions - Images
  /** `folder` is the slash-separated group path, from an uploaded directory. */
  addImage: (file: File, folder?: string) => Promise<ImageResource>;
  updateImage: (id: string, updates: Partial<ImageResource>) => void;
  deleteImage: (id: string) => void;
  getImageById: (id: string) => ImageResource | undefined;
  generateImageCode: (id: string, format?: ImageFormat) => Promise<string>;
  
  // Actions - Fonts
  addFont: (file: File) => Promise<FontResource>;
  updateFont: (id: string, updates: Partial<FontResource>) => void;
  deleteFont: (id: string) => void;
  getFontById: (id: string) => FontResource | undefined;
  
  // Actions - Icons
  addIcon: (icon: Omit<IconResource, 'id'>) => IconResource;
  deleteIcon: (id: string) => void;
  
  // Actions - Folders
  createFolder: (path: string) => void;
  renameFolder: (path: string, nextName: string) => void;
  moveFolder: (path: string, nextParent: string) => void;
  /** Removes the folder and its subfolders; images inside move to the parent. */
  deleteFolder: (path: string) => void;
  moveImages: (ids: readonly string[], folder: string) => void;

  // Actions - UI
  setSearchQuery: (query: string) => void;
  setSelectedResource: (id: string | null) => void;
  
  // Actions - Project
  exportResources: () => { images: ImageResource[]; fonts: FontResource[] };
  importResources: (resources: { images: ImageResource[]; fonts: FontResource[] }) => void;
  clearAllResources: () => void;
  
  // Computed
  getFilteredImages: () => ImageResource[];
  getFilteredFonts: () => FontResource[];
  getResourceUsage: (resourceId: string) => string[]; // Returns component IDs using this resource
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  // Initial state
  images: [],
  imageFolders: [],
  fonts: [],
  icons: [],
  searchQuery: '',
  selectedResourceId: null,
  
  // Image actions
  addImage: async (file: File, folder?: string) => {
    const base64Data = await fileToBase64(file);
    const { width, height } = await getImageDimensions(base64Data);

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const cArrayName = `ui_img_${toCName(baseName)}`;

    const newImage: ImageResource = {
      id: generateId(),
      name: baseName,
      folder: folder || '',
      originalName: file.name,
      width,
      height,
      format: 'ARGB8888',
      data: base64Data,
      cArrayName,
      size: file.size,
      createdAt: Date.now(),
    };
    
    set(state => ({
      images: [...state.images, newImage],
    }));
    
    return newImage;
  },
  
  updateImage: (id, updates) => {
    set(state => ({
      images: state.images.map(img =>
        img.id === id ? { ...img, ...updates } : img
      ),
    }));
  },
  
  deleteImage: (id) => {
    set(state => ({
      images: state.images.filter(img => img.id !== id),
      selectedResourceId: state.selectedResourceId === id ? null : state.selectedResourceId,
    }));
  },
  
  getImageById: (id) => {
    return get().images.find(img => img.id === id);
  },
  
  generateImageCode: async (id, format) => {
    const image = get().getImageById(id);
    if (!image) {
      throw new Error('Image not found');
    }
    
    const { imageData } = await loadImageFromBase64(image.data);
    const options = {
      ...DEFAULT_IMAGE_OPTIONS,
      format: format || image.format,
    };
    
    const result = generateImageCCode(image.cArrayName, imageData, options);
    return result.cCode;
  },
  
  // Font actions
  addFont: async (file: File) => {
    const base64Data = await fontFileToBase64(file);
    const metadata = await parseFontMetadata(base64Data);
    
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const cFontName = `ui_font_${toCName(baseName)}`;
    
    const newFont: FontResource = {
      id: generateId(),
      name: baseName,
      family: metadata.family !== 'Unknown' ? metadata.family : baseName,
      style: metadata.style,
      sizes: [16],
      // New fonts derive their coverage from the project's text; existing ones
      // keep whatever they were tuned to. See docs/charset-trimming-design.md §4.
      charsetMode: 'auto',
      charset: 'ascii',
      bpp: 4,
      data: base64Data,
      cFontName,
      size: file.size,
      createdAt: Date.now(),
    };
    
    set(state => ({
      fonts: [...state.fonts, newFont],
    }));
    
    return newFont;
  },
  
  updateFont: (id, updates) => {
    set(state => ({
      fonts: state.fonts.map(font =>
        font.id === id ? { ...font, ...updates } : font
      ),
    }));
  },
  
  deleteFont: (id) => {
    set(state => ({
      fonts: state.fonts.filter(font => font.id !== id),
      selectedResourceId: state.selectedResourceId === id ? null : state.selectedResourceId,
    }));
  },
  
  getFontById: (id) => {
    return get().fonts.find(font => font.id === id);
  },
  
  // Icon actions
  addIcon: (iconData) => {
    const newIcon: IconResource = {
      ...iconData,
      id: generateId(),
    };
    
    set(state => ({
      icons: [...state.icons, newIcon],
    }));
    
    return newIcon;
  },
  
  deleteIcon: (id) => {
    set(state => ({
      icons: state.icons.filter(icon => icon.id !== id),
    }));
  },
  
  // Folder actions
  createFolder: (path) => {
    const clean = normalizeFolder(path);
    if (clean === '') return;
    set((state) => ({
      imageFolders: [...new Set([...state.imageFolders, ...chainOf(clean)])].sort(),
    }));
  },

  renameFolder: (path, nextName) => {
    const from = normalizeFolder(path);
    const leaf = normalizeFolder(nextName);
    // A rename replaces the last segment only; a slash would silently reparent.
    if (from === '' || leaf === '' || leaf.includes('/')) return;
    const parent = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
    const to = parent === '' ? leaf : `${parent}/${leaf}`;
    if (to === from) return;
    set((state) => remapFolders(state, from, to));
  },

  moveFolder: (path, nextParent) => {
    const from = normalizeFolder(path);
    const parent = normalizeFolder(nextParent);
    if (from === '') return;
    // Moving a folder inside itself would detach the whole subtree.
    if (parent === from || parent.startsWith(`${from}/`)) return;
    const leaf = from.slice(from.lastIndexOf('/') + 1);
    const to = parent === '' ? leaf : `${parent}/${leaf}`;
    if (to === from) return;
    set((state) => remapFolders(state, from, to));
  },

  deleteFolder: (path) => {
    const target = normalizeFolder(path);
    if (target === '') return;
    const parent = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '';
    set((state) => ({
      imageFolders: state.imageFolders.filter(
        (folder) => folder !== target && !folder.startsWith(`${target}/`),
      ),
      // Images are never destroyed by a folder operation; they surface in the
      // parent instead.
      images: state.images.map((image) => (
        isWithin(normalizeFolder(image.folder), target)
          ? { ...image, folder: parent }
          : image
      )),
    }));
  },

  moveImages: (ids, folder) => {
    const target = normalizeFolder(folder);
    const wanted = new Set(ids);
    set((state) => ({
      images: state.images.map((image) => (
        wanted.has(image.id) ? { ...image, folder: target } : image
      )),
    }));
  },

  // UI actions
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
  
  setSelectedResource: (id) => {
    set({ selectedResourceId: id });
  },
  
  // Project actions
  exportResources: () => {
    const { images, fonts } = get();
    return { images, fonts };
  },
  
  importResources: (resources) => {
    set({
      images: resources.images || [],
      // Fonts saved before charsetMode existed carry no mode of their own
      fonts: (resources.fonts || []).map(migrateFontResource),
    });
  },
  
  clearAllResources: () => {
    set({
      images: [],
      imageFolders: [],
      fonts: [],
      icons: [],
      selectedResourceId: null,
    });
  },
  
  // Computed
  getFilteredImages: () => {
    const { images, searchQuery } = get();
    if (!searchQuery) return images;
    
    const query = searchQuery.toLowerCase();
    return images.filter(img =>
      img.name.toLowerCase().includes(query) ||
      img.originalName.toLowerCase().includes(query)
    );
  },
  
  getFilteredFonts: () => {
    const { fonts, searchQuery } = get();
    if (!searchQuery) return fonts;
    
    const query = searchQuery.toLowerCase();
    return fonts.filter(font =>
      font.name.toLowerCase().includes(query) ||
      font.family.toLowerCase().includes(query)
    );
  },
  
  getResourceUsage: (_resourceId: string) => {
    // This would integrate with the editor store to find components using this resource
    // For now, return empty array - will be connected later
    return [];
  },
}));

export default useResourceStore;
