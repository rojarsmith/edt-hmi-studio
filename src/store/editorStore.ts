import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  LvglComponent,
  CanvasState,
  SelectionState,
  DragState,
  HistoryEntry,
  AlignmentGuide,
  Screen,
  ScreenGroup,
  Typography,
  ProjectLanguage,
  TextResource,
} from '../types';
import { MAX_SCREEN_GROUP_DEPTH } from '../types';
import type { ModbusRegisterTag } from '../types/hmi';
import { getComponentDefinition } from '../utils/componentDefinitions';
import { synchronizeModbusBindings } from '../utils/modbusBindings';

// Maximum history entries for undo/redo
const MAX_HISTORY = 50;

// Create default screen
function createDefaultScreen(): Screen {
  return {
    id: uuidv4(),
    name: 'Screen 1',
    components: [],
    backgroundColor: '#F5F5F5',
  };
}

/**
 * First unused `${prefix} N` name. Counting from the list length would hand out
 * a duplicate as soon as anything in the middle has been deleted.
 */
function nextDefaultName(existing: { name: string }[], prefix: string): string {
  const taken = new Set(existing.map(item => item.name));
  let n = 1;
  while (taken.has(`${prefix} ${n}`)) n += 1;
  return `${prefix} ${n}`;
}

function nextScreenName(screens: Screen[]): string {
  return nextDefaultName(screens, 'Screen');
}

function nextGroupName(groups: ScreenGroup[]): string {
  return nextDefaultName(groups, 'Group');
}

interface EditorState {
  // Multi-screen support
  screens: Screen[];
  currentScreenId: string;

  /** Organisational folders shown in the screen manager. */
  screenGroups: ScreenGroup[];

  /**
   * Named text styles. Widgets reference one by id; a widget with none
   * inherits the screen's default font, as an unstyled widget always has.
   */
  typographies: Typography[];

  /** Languages the project is translated into. The first is the default. */
  languages: ProjectLanguage[];

  /** Shared text, referenced by widgets through textId. */
  texts: TextResource[];

  /**
   * Screens with a tab open along the bottom of the canvas, in tab order.
   * A screen can exist in the manager without being open.
   */
  openScreenIds: string[];

  // Canvas state
  canvas: CanvasState;
  
  // Selection state
  selection: SelectionState;
  
  // Drag state
  drag: DragState;
  
  // History for undo/redo
  history: HistoryEntry[];
  historyIndex: number;
  
  // Alignment guides
  alignmentGuides: AlignmentGuide[];
  
  // Computed - current screen components (for backward compatibility)
  components: LvglComponent[];
  
  // Actions - Screens
  addScreen: (groupId?: string | null) => string;
  deleteScreen: (screenId: string) => void;
  renameScreen: (screenId: string, name: string) => void;
  setCurrentScreen: (screenId: string) => void;
  updateScreenBackground: (screenId: string, color: string) => void;
  /** Open a tab for the screen (or focus its existing tab) and make it current. */
  openScreen: (screenId: string) => void;
  /** Close the screen's tab. The screen itself stays in the manager. */
  closeScreen: (screenId: string) => void;
  moveScreenToGroup: (screenId: string, groupId: string | null) => void;

  // Actions - Screen groups
  /**
   * Create a group under `parentId`. Returns null when the parent is already at
   * the deepest allowed level, in which case nothing is created.
   */
  addScreenGroup: (parentId?: string | null) => string | null;
  renameScreenGroup: (groupId: string, name: string) => void;
  /** Delete a group, lifting its screens and subgroups up to its own parent. */
  deleteScreenGroup: (groupId: string) => void;
  /** 1-based depth of a group, or 0 when the id is unknown. */
  getScreenGroupDepth: (groupId: string | null | undefined) => number;
  /** Whether a new subgroup may be created under `parentId`. */
  canNestScreenGroup: (parentId: string | null | undefined) => boolean;

  // Actions - Components
  addComponent: (type: string, x: number, y: number, parentId?: string | null) => string;
  updateComponent: (id: string, updates: Partial<LvglComponent>) => void;
  deleteComponents: (ids: string[]) => void;
  moveComponent: (id: string, x: number, y: number) => void;
  resizeComponent: (id: string, width: number, height: number, x?: number, y?: number) => void;
  reparentComponent: (id: string, newParentId: string | null) => void;
  /** Same-level reorder: place `id` immediately before/after `targetId` in the target's parent. */
  reorderComponentAdjacentTo: (
    id: string,
    targetId: string,
    placement: 'before' | 'after'
  ) => void;
  clearComponents: () => void;
  setComponents: (components: LvglComponent[]) => void;
  setScreens: (
    screens: Screen[],
    screenGroups?: ScreenGroup[],
    typographies?: Typography[],
    languages?: ProjectLanguage[],
    texts?: TextResource[],
  ) => void;

  /** Add a language column. The first language added becomes the default. */
  addLanguage: (code: string, name: string) => void;
  /** Removing a language drops its column from every text resource. */
  deleteLanguage: (code: string) => void;
  updateText: (id: string, language: string, value: string) => void;
  renameTextKey: (id: string, key: string) => void;
  /** Create an empty text resource and return its id. */
  addText: () => string;
  /** Removing one leaves its widgets showing their own literal again. */
  deleteText: (id: string) => void;

  /** Create a typography and return its id. Seeded from the project default. */
  addTypography: (seed?: Partial<Typography>) => string;
  updateTypography: (id: string, updates: Partial<Typography>) => void;
  /** Removing one leaves its widgets inheriting the screen default again. */
  deleteTypography: (id: string) => void;
  syncModbusBindings: (tags: ModbusRegisterTag[]) => void;
  
  // Actions - Z-order
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  
  // Actions - Selection
  selectComponent: (id: string, addToSelection?: boolean) => void;
  selectComponents: (ids: string[]) => void;
  clearSelection: () => void;
  setHoveredComponent: (id: string | null) => void;
  
  // Actions - Canvas
  setCanvasSize: (width: number, height: number) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  toggleGrid: () => void;
  setSnapToGrid: (snap: boolean) => void;
  
  // Actions - Drag
  startDrag: (dragType: DragState['dragType'], data: Partial<DragState>) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
  
  // Combined move/resize + drag update (single set call for performance)
  moveComponentAndUpdateDrag: (id: string, x: number, y: number, dragStartX: number, dragStartY: number) => void;
  resizeComponentAndUpdateDrag: (id: string, width: number, height: number, dragStartX: number, dragStartY: number, x?: number, y?: number) => void;
  
  // Actions - History
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
  
  // Actions - Alignment
  updateAlignmentGuides: (guides: AlignmentGuide[]) => void;
  clearAlignmentGuides: () => void;
  
  // Helpers
  getComponentById: (id: string) => LvglComponent | undefined;
  getComponentsByParent: (parentId: string | null) => LvglComponent[];
  findComponentAtPoint: (x: number, y: number) => LvglComponent | undefined;
  getAllComponents: () => LvglComponent[];
  getCurrentScreen: () => Screen | undefined;
}

// Helper to find component in tree
function findComponentInTree(components: LvglComponent[], id: string): LvglComponent | undefined {
  for (const comp of components) {
    if (comp.id === id) return comp;
    const found = findComponentInTree(comp.children, id);
    if (found) return found;
  }
  return undefined;
}

// Helper to flatten component tree
function flattenComponents(components: LvglComponent[]): LvglComponent[] {
  const result: LvglComponent[] = [];
  for (const comp of components) {
    result.push(comp);
    result.push(...flattenComponents(comp.children));
  }
  return result;
}

// Helper to update component in tree (reference-stable: unchanged subtrees keep original references)
function updateComponentInTree(
  components: LvglComponent[],
  id: string,
  updates: Partial<LvglComponent>
): LvglComponent[] {
  let changed = false;
  const result = components.map(comp => {
    if (comp.id === id) {
      changed = true;
      return { ...comp, ...updates };
    }
    if (comp.children.length > 0) {
      const newChildren = updateComponentInTree(comp.children, id, updates);
      if (newChildren !== comp.children) {
        changed = true;
        return { ...comp, children: newChildren };
      }
    }
    return comp;
  });
  return changed ? result : components;
}

// Helper to delete component from tree
function deleteComponentFromTree(components: LvglComponent[], ids: string[]): LvglComponent[] {
  return components
    .filter(comp => !ids.includes(comp.id))
    .map(comp => ({
      ...comp,
      children: deleteComponentFromTree(comp.children, ids),
    }));
}

// Helper to add component to tree
function addComponentToTree(
  components: LvglComponent[],
  newComponent: LvglComponent,
  parentId: string | null
): LvglComponent[] {
  if (parentId === null) {
    return [...components, newComponent];
  }
  
  return components.map(comp => {
    if (comp.id === parentId) {
      return {
        ...comp,
        children: [...comp.children, newComponent],
      };
    }
    if (comp.children.length > 0) {
      return {
        ...comp,
        children: addComponentToTree(comp.children, newComponent, parentId),
      };
    }
    return comp;
  });
}

// Helper to change z-order of component in array
function changeZOrder(
  components: LvglComponent[],
  componentId: string,
  operation: 'front' | 'back' | 'forward' | 'backward'
): LvglComponent[] {
  // First check if component is at this level
  const index = components.findIndex(c => c.id === componentId);
  
  if (index !== -1) {
    const newComponents = [...components];
    const [component] = newComponents.splice(index, 1);
    
    switch (operation) {
      case 'front':
        // Move to end (top)
        newComponents.push(component);
        break;
      case 'back':
        // Move to beginning (bottom)
        newComponents.unshift(component);
        break;
      case 'forward':
        // Move up one position (higher index = more on top)
        if (index < components.length - 1) {
          newComponents.splice(index + 1, 0, component);
        } else {
          newComponents.push(component);
        }
        break;
      case 'backward':
        // Move down one position
        if (index > 0) {
          newComponents.splice(index - 1, 0, component);
        } else {
          newComponents.unshift(component);
        }
        break;
    }
    return newComponents;
  }
  
  // Not found at this level, search in children
  return components.map(comp => ({
    ...comp,
    children: changeZOrder(comp.children, componentId, operation),
  }));
}

// Helper to move component to new parent
function moveComponentToParent(
  components: LvglComponent[],
  componentId: string,
  newParentId: string | null
): LvglComponent[] {
  // First, find and remove the component
  let movedComponent: LvglComponent | undefined;
  
  const removeFromTree = (comps: LvglComponent[]): LvglComponent[] => {
    return comps
      .filter(comp => {
        if (comp.id === componentId) {
          movedComponent = comp;
          return false;
        }
        return true;
      })
      .map(comp => ({
        ...comp,
        children: removeFromTree(comp.children),
      }));
  };
  
  const newComponents = removeFromTree(components);
  
  if (!movedComponent) return components;
  
  // Update parent reference
  movedComponent = { ...movedComponent, parentId: newParentId };
  
  // Add to new parent
  return addComponentToTree(newComponents, movedComponent, newParentId);
}

// Helper to find a component's actual parent id (null = screen root, undefined = absent)
function findParentIdInTree(
  components: LvglComponent[],
  id: string,
  parentId: string | null = null
): string | null | undefined {
  for (const comp of components) {
    if (comp.id === id) return parentId;
    const found = findParentIdInTree(comp.children, id, comp.id);
    if (found !== undefined) return found;
  }
  return undefined;
}

// Helper to test whether `id` sits anywhere inside `root`'s subtree
function subtreeContains(root: LvglComponent, id: string): boolean {
  for (const child of root.children) {
    if (child.id === id || subtreeContains(child, id)) return true;
  }
  return false;
}

/**
 * Move a component so it sits immediately before or after `targetId` inside the
 * target's own parent — i.e. a same-level reorder rather than a reparent.
 *
 * Placement is expressed in array terms: 'before' lands on a lower index (drawn
 * earlier, further back), 'after' on a higher index (drawn later, in front).
 */
function moveComponentAdjacentTo(
  components: LvglComponent[],
  componentId: string,
  targetId: string,
  placement: 'before' | 'after'
): LvglComponent[] {
  let moved: LvglComponent | undefined;

  const removeFromTree = (comps: LvglComponent[]): LvglComponent[] =>
    comps
      .filter(comp => {
        if (comp.id === componentId) {
          moved = comp;
          return false;
        }
        return true;
      })
      .map(comp => ({ ...comp, children: removeFromTree(comp.children) }));

  const withoutMoved = removeFromTree(components);
  if (!moved) return components;

  // Resolve the target's index only after the removal, so a same-list move
  // does not insert at a stale position.
  let inserted = false;
  const insertInto = (
    comps: LvglComponent[],
    parentId: string | null
  ): LvglComponent[] => {
    const index = comps.findIndex(comp => comp.id === targetId);
    if (index !== -1) {
      inserted = true;
      const next = [...comps];
      next.splice(
        placement === 'before' ? index : index + 1,
        0,
        { ...moved!, parentId }
      );
      return next;
    }
    return comps.map(comp =>
      comp.children.length > 0
        ? { ...comp, children: insertInto(comp.children, comp.id) }
        : comp
    );
  };

  const result = insertInto(withoutMoved, null);
  // The target vanished (it was inside the moved subtree) — leave the tree be.
  return inserted ? result : components;
}

// Deep clone components for history
function cloneComponents(components: LvglComponent[]): LvglComponent[] {
  return components.map(comp => ({
    ...comp,
    props: { ...comp.props },
    styles: {
      default: { ...comp.styles.default },
      pressed: comp.styles.pressed ? { ...comp.styles.pressed } : undefined,
      focused: comp.styles.focused ? { ...comp.styles.focused } : undefined,
      disabled: comp.styles.disabled ? { ...comp.styles.disabled } : undefined,
    },
    events: comp.events.map(e => ({ ...e, action: e.action ? { ...e.action } : undefined })),
    animations: (comp.animations || []).map(a => ({ ...a })),
    modbusBinding: comp.modbusBinding ? { ...comp.modbusBinding } : undefined,
    children: cloneComponents(comp.children),
  }));
}

// Deep clone screens for history
function cloneScreens(screens: Screen[]): Screen[] {
  return screens.map(screen => ({
    ...screen,
    components: cloneComponents(screen.components),
  }));
}

/** State captured by one undo step. */
interface SnapshotSource {
  screens: Screen[];
  screenGroups: ScreenGroup[];
  openScreenIds: string[];
  currentScreenId: string;
}

function snapshotState(state: SnapshotSource): HistoryEntry {
  return {
    screens: cloneScreens(state.screens),
    screenGroups: state.screenGroups.map(g => ({ ...g })),
    openScreenIds: [...state.openScreenIds],
    currentScreenId: state.currentScreenId,
    timestamp: Date.now(),
  };
}

/**
 * Rebuild editor state from a snapshot. Tab state is re-derived against the
 * restored screen list rather than trusted outright, so an entry saved before
 * `openScreenIds` existed — or one referring to a screen that later vanished —
 * still lands on something valid.
 */
function restoreSnapshot(
  entry: HistoryEntry,
  fallback: SnapshotSource,
): SnapshotSource & { selection: SelectionState } {
  const screens = cloneScreens(entry.screens || []);
  const validIds = new Set(screens.map(s => s.id));

  const openScreenIds = (entry.openScreenIds ?? fallback.openScreenIds).filter(id =>
    validIds.has(id),
  );
  if (openScreenIds.length === 0 && screens.length > 0) {
    openScreenIds.push(screens[0].id);
  }

  const requestedCurrent = entry.currentScreenId ?? fallback.currentScreenId;
  const currentScreenId = openScreenIds.includes(requestedCurrent)
    ? requestedCurrent
    : openScreenIds[0] ?? '';

  return {
    screens,
    screenGroups: (entry.screenGroups ?? []).map(g => ({ ...g })),
    openScreenIds,
    currentScreenId,
    selection: { selectedIds: [], hoveredId: null },
  };
}

// Initial screen
const initialScreen = createDefaultScreen();

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state - Multi-screen
  screens: [initialScreen],
  currentScreenId: initialScreen.id,
  typographies: [],
  languages: [],
  texts: [],
  screenGroups: [],
  openScreenIds: [initialScreen.id],

  // Computed components (current screen)
  get components() {
    const state = get();
    const currentScreen = state.screens.find(p => p.id === state.currentScreenId);
    return currentScreen?.components || [];
  },
  
  canvas: {
    width: 480,
    height: 320,
    zoom: 1,
    panX: 0,
    panY: 0,
    showGrid: true,
    gridSize: 10,
    snapToGrid: true,
  },
  
  selection: {
    selectedIds: [],
    hoveredId: null,
  },
  
  drag: {
    isDragging: false,
    dragType: null,
    draggedComponentType: null,
    draggedComponentId: null,
    resizeHandle: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  },
  
  history: [],
  historyIndex: -1,
  
  alignmentGuides: [],
  
  // Screen Actions
  addScreen: (groupId = null) => {
    const id = uuidv4();
    get().saveToHistory();

    set(state => ({
      screens: [
        ...state.screens,
        {
          id,
          name: nextScreenName(state.screens),
          components: [],
          backgroundColor: '#F5F5F5',
          groupId,
        },
      ],
      openScreenIds: [...state.openScreenIds, id],
      currentScreenId: id,
      selection: { ...state.selection, selectedIds: [] },
    }));

    return id;
  },

  deleteScreen: (screenId) => {
    const { screens, currentScreenId, openScreenIds } = get();
    if (screens.length <= 1) return; // Don't delete last screen
    if (!screens.some(s => s.id === screenId)) return;

    get().saveToHistory();

    const newScreens = screens.filter(s => s.id !== screenId);
    const newOpenIds = openScreenIds.filter(id => id !== screenId);
    // Keep a tab open so the canvas always has something to show.
    if (newOpenIds.length === 0) newOpenIds.push(newScreens[0].id);

    set({
      screens: newScreens,
      openScreenIds: newOpenIds,
      currentScreenId: screenId === currentScreenId ? newOpenIds[0] : currentScreenId,
      selection: { selectedIds: [], hoveredId: null },
    });
  },

  renameScreen: (screenId, name) => {
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(s =>
        s.id === screenId ? { ...s, name } : s
      ),
    }));
  },

  setCurrentScreen: (screenId) => {
    set({
      currentScreenId: screenId,
      selection: { selectedIds: [], hoveredId: null },
    });
  },

  updateScreenBackground: (screenId, color) => {
    set(state => ({
      screens: state.screens.map(s =>
        s.id === screenId ? { ...s, backgroundColor: color } : s
      ),
    }));
  },

  openScreen: (screenId) => {
    const { screens, openScreenIds, currentScreenId } = get();
    if (!screens.some(s => s.id === screenId)) return;

    // Already open — just jump to it.
    if (openScreenIds.includes(screenId)) {
      if (screenId !== currentScreenId) get().setCurrentScreen(screenId);
      return;
    }

    set(state => ({
      openScreenIds: [...state.openScreenIds, screenId],
      currentScreenId: screenId,
      selection: { selectedIds: [], hoveredId: null },
    }));
  },

  closeScreen: (screenId) => {
    const { openScreenIds, currentScreenId } = get();
    if (openScreenIds.length <= 1) return; // Never close the last tab
    if (!openScreenIds.includes(screenId)) return;

    const index = openScreenIds.indexOf(screenId);
    const newOpenIds = openScreenIds.filter(id => id !== screenId);
    // Closing the active tab hands focus to its neighbour, like an editor would.
    const nextCurrentId =
      screenId === currentScreenId
        ? newOpenIds[Math.min(index, newOpenIds.length - 1)]
        : currentScreenId;

    set(state => ({
      openScreenIds: newOpenIds,
      currentScreenId: nextCurrentId,
      selection:
        nextCurrentId === currentScreenId
          ? state.selection
          : { selectedIds: [], hoveredId: null },
    }));
  },

  moveScreenToGroup: (screenId, groupId) => {
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(s =>
        s.id === screenId ? { ...s, groupId } : s
      ),
    }));
  },

  // Screen Group Actions
  getScreenGroupDepth: (groupId) => {
    if (!groupId) return 0;
    const { screenGroups } = get();
    let depth = 0;
    let current = screenGroups.find(g => g.id === groupId);
    // Bounded by MAX_SCREEN_GROUP_DEPTH so a corrupted parent cycle can't hang.
    while (current && depth <= MAX_SCREEN_GROUP_DEPTH) {
      depth += 1;
      if (!current.parentId) break;
      current = screenGroups.find(g => g.id === current!.parentId);
    }
    return depth;
  },

  canNestScreenGroup: (parentId) => {
    if (!parentId) return true;
    return get().getScreenGroupDepth(parentId) < MAX_SCREEN_GROUP_DEPTH;
  },

  addScreenGroup: (parentId = null) => {
    if (!get().canNestScreenGroup(parentId)) return null;

    const id = uuidv4();
    get().saveToHistory();
    set(state => ({
      screenGroups: [
        ...state.screenGroups,
        { id, name: nextGroupName(state.screenGroups), parentId: parentId ?? null },
      ],
    }));

    return id;
  },

  renameScreenGroup: (groupId, name) => {
    get().saveToHistory();
    set(state => ({
      screenGroups: state.screenGroups.map(g =>
        g.id === groupId ? { ...g, name } : g
      ),
    }));
  },

  deleteScreenGroup: (groupId) => {
    const { screenGroups } = get();
    const group = screenGroups.find(g => g.id === groupId);
    if (!group) return;

    get().saveToHistory();
    const parentId = group.parentId ?? null;

    set(state => ({
      // Contents are lifted rather than deleted — removing a folder should
      // never take screens with it.
      screenGroups: state.screenGroups
        .filter(g => g.id !== groupId)
        .map(g => (g.parentId === groupId ? { ...g, parentId } : g)),
      screens: state.screens.map(s =>
        s.groupId === groupId ? { ...s, groupId: parentId } : s
      ),
    }));
  },


  // Component Actions
  addComponent: (type, x, y, parentId = null) => {
    const definition = getComponentDefinition(type);
    if (!definition) return '';
    
    const id = uuidv4();
    const { canvas, currentScreenId } = get();
    
    // Snap to grid if enabled
    let finalX = x;
    let finalY = y;
    if (canvas.snapToGrid) {
      finalX = Math.round(x / canvas.gridSize) * canvas.gridSize;
      finalY = Math.round(y / canvas.gridSize) * canvas.gridSize;
    }
    
    const newComponent: LvglComponent = {
      id,
      type,
      name: `${definition.name}_${id.slice(0, 4)}`,
      x: finalX,
      y: finalY,
      width: definition.defaultWidth,
      height: definition.defaultHeight,
      children: [],
      props: { ...definition.defaultProps },
      styles: {
        default: { ...definition.defaultStyles.default },
      },
      events: [],
      animations: [],
      parentId,
      locked: false,
      visible: true,
    };
    
    get().saveToHistory();
    
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: addComponentToTree(screen.components, newComponent, parentId),
          };
        }
        return screen;
      }),
    }));
    
    // Auto-update tabChildMap / tileChildMap when adding to tabview / tileview
    if (parentId) {
      const parent = get().getComponentById(parentId);
      if (parent?.type === 'tabview') {
        const tabChildMap: Record<string, string[]> = { ...(parent.props?.tabChildMap || {}) };
        const activeTab = String(parent.props?.activeTab || 0);
        if (!tabChildMap[activeTab]) tabChildMap[activeTab] = [];
        tabChildMap[activeTab] = [...tabChildMap[activeTab], id];
        get().updateComponent(parentId, { props: { ...parent.props, tabChildMap } });
      } else if (parent?.type === 'tileview') {
        const tileChildMap: Record<string, string[]> = { ...(parent.props?.tileChildMap || {}) };
        const key = `${parent.props?.currentRow || 0}-${parent.props?.currentCol || 0}`;
        if (!tileChildMap[key]) tileChildMap[key] = [];
        tileChildMap[key] = [...tileChildMap[key], id];
        get().updateComponent(parentId, { props: { ...parent.props, tileChildMap } });
      }
    }
    
    return id;
  },
  
  updateComponent: (id, updates) => {
    const { currentScreenId } = get();
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: updateComponentInTree(screen.components, id, updates),
          };
        }
        return screen;
      }),
    }));
  },
  
  deleteComponents: (ids) => {
    if (ids.length === 0) return;
    const { currentScreenId } = get();
    
    // Remove from parent's childMap before deleting
    for (const id of ids) {
      const comp = get().getComponentById(id);
      if (comp?.parentId) {
        const parent = get().getComponentById(comp.parentId);
        if (parent?.type === 'tabview') {
          const tabChildMap: Record<string, string[]> = { ...(parent.props?.tabChildMap || {}) };
          for (const key of Object.keys(tabChildMap)) {
            tabChildMap[key] = tabChildMap[key].filter((cid: string) => cid !== id);
          }
          get().updateComponent(comp.parentId, { props: { ...parent.props, tabChildMap } });
        } else if (parent?.type === 'tileview') {
          const tileChildMap: Record<string, string[]> = { ...(parent.props?.tileChildMap || {}) };
          for (const key of Object.keys(tileChildMap)) {
            tileChildMap[key] = tileChildMap[key].filter((cid: string) => cid !== id);
          }
          get().updateComponent(comp.parentId, { props: { ...parent.props, tileChildMap } });
        }
      }
    }
    
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: deleteComponentFromTree(screen.components, ids),
          };
        }
        return screen;
      }),
      selection: {
        ...state.selection,
        selectedIds: state.selection.selectedIds.filter(id => !ids.includes(id)),
      },
    }));
  },
  
  moveComponent: (id, x, y) => {
    const { canvas, currentScreenId } = get();
    let finalX = x;
    let finalY = y;
    
    if (canvas.snapToGrid) {
      finalX = Math.round(x / canvas.gridSize) * canvas.gridSize;
      finalY = Math.round(y / canvas.gridSize) * canvas.gridSize;
    }
    
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: updateComponentInTree(screen.components, id, { x: finalX, y: finalY }),
          };
        }
        return screen;
      }),
    }));
  },
  
  resizeComponent: (id, width, height, x, y) => {
    const { canvas, currentScreenId } = get();
    let finalWidth = Math.max(10, width);
    let finalHeight = Math.max(10, height);
    
    if (canvas.snapToGrid) {
      finalWidth = Math.round(width / canvas.gridSize) * canvas.gridSize;
      finalHeight = Math.round(height / canvas.gridSize) * canvas.gridSize;
      finalWidth = Math.max(canvas.gridSize, finalWidth);
      finalHeight = Math.max(canvas.gridSize, finalHeight);
    }
    
    const updates: Partial<LvglComponent> = { width: finalWidth, height: finalHeight };
    if (x !== undefined) {
      updates.x = canvas.snapToGrid ? Math.round(x / canvas.gridSize) * canvas.gridSize : x;
    }
    if (y !== undefined) {
      updates.y = canvas.snapToGrid ? Math.round(y / canvas.gridSize) * canvas.gridSize : y;
    }
    
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: updateComponentInTree(screen.components, id, updates),
          };
        }
        return screen;
      }),
    }));
  },
  
  reparentComponent: (id, newParentId) => {
    const { currentScreenId } = get();
    
    // Remove from old parent's childMap before reparenting
    const comp = get().getComponentById(id);
    if (comp?.parentId) {
      const oldParent = get().getComponentById(comp.parentId);
      if (oldParent?.type === 'tabview') {
        const tabChildMap: Record<string, string[]> = { ...(oldParent.props?.tabChildMap || {}) };
        for (const key of Object.keys(tabChildMap)) {
          tabChildMap[key] = tabChildMap[key].filter((cid: string) => cid !== id);
        }
        get().updateComponent(comp.parentId, { props: { ...oldParent.props, tabChildMap } });
      } else if (oldParent?.type === 'tileview') {
        const tileChildMap: Record<string, string[]> = { ...(oldParent.props?.tileChildMap || {}) };
        for (const key of Object.keys(tileChildMap)) {
          tileChildMap[key] = tileChildMap[key].filter((cid: string) => cid !== id);
        }
        get().updateComponent(comp.parentId, { props: { ...oldParent.props, tileChildMap } });
      }
    }
    
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: moveComponentToParent(screen.components, id, newParentId),
          };
        }
        return screen;
      }),
    }));
    
    // Add to new parent's childMap after reparenting
    if (newParentId) {
      const newParent = get().getComponentById(newParentId);
      if (newParent?.type === 'tabview') {
        const tabChildMap: Record<string, string[]> = { ...(newParent.props?.tabChildMap || {}) };
        const activeTab = String(newParent.props?.activeTab || 0);
        if (!tabChildMap[activeTab]) tabChildMap[activeTab] = [];
        tabChildMap[activeTab] = [...tabChildMap[activeTab], id];
        get().updateComponent(newParentId, { props: { ...newParent.props, tabChildMap } });
      } else if (newParent?.type === 'tileview') {
        const tileChildMap: Record<string, string[]> = { ...(newParent.props?.tileChildMap || {}) };
        const key = `${newParent.props?.currentRow || 0}-${newParent.props?.currentCol || 0}`;
        if (!tileChildMap[key]) tileChildMap[key] = [];
        tileChildMap[key] = [...tileChildMap[key], id];
        get().updateComponent(newParentId, { props: { ...newParent.props, tileChildMap } });
      }
    }
  },

  reorderComponentAdjacentTo: (id, targetId, placement) => {
    if (id === targetId) return;
    const dragged = get().getComponentById(id);
    const target = get().getComponentById(targetId);
    // Dropping a component inside its own subtree would detach the tree.
    if (!dragged || !target || subtreeContains(dragged, targetId)) return;

    const { screens, currentScreenId } = get();
    const currentScreen = screens.find(screen => screen.id === currentScreenId);
    if (!currentScreen) return;
    const draggedParentId = findParentIdInTree(currentScreen.components, id);
    const targetParentId = findParentIdInTree(currentScreen.components, targetId);
    if (draggedParentId === undefined || targetParentId === undefined) return;

    if (draggedParentId !== targetParentId) {
      // Reuse the reparent path first so tabview/tileview child maps and the
      // history entry stay consistent; it appends, and we reposition below.
      get().reparentComponent(id, targetParentId);
    } else {
      get().saveToHistory();
    }

    set(state => ({
      screens: state.screens.map(screen =>
        screen.id === state.currentScreenId
          ? {
              ...screen,
              components: moveComponentAdjacentTo(
                screen.components,
                id,
                targetId,
                placement,
              ),
            }
          : screen,
      ),
    }));
  },
  
  setComponents: (components) => {
    const { currentScreenId } = get();
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: cloneComponents(components),
          };
        }
        return screen;
      }),
      selection: { selectedIds: [], hoveredId: null },
    }));
  },

  addLanguage: (code, name) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (get().languages.some((language) => language.code === trimmed)) return;
    set({ languages: [...get().languages, { code: trimmed, name: name.trim() || trimmed }] });
  },

  deleteLanguage: (code) => {
    const remaining = get().languages.filter((language) => language.code !== code);
    // Dropping the column means dropping its words: leaving them would keep
    // translations for a language the project no longer has, and the next
    // export would silently disagree with the table
    set({
      languages: remaining,
      texts: get().texts.map((text) => {
        if (!(code in text.values)) return text;
        const values = { ...text.values };
        delete values[code];
        return { ...text, values };
      }),
    });
  },

  updateText: (id, language, value) => {
    set({
      texts: get().texts.map((text) =>
        text.id === id ? { ...text, values: { ...text.values, [language]: value } } : text,
      ),
    });
  },

  renameTextKey: (id, key) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    // The key is the generated tag, so a duplicate would make two texts
    // indistinguishable to lv_translation_get
    if (get().texts.some((text) => text.id !== id && text.key === trimmed)) return;
    set({
      texts: get().texts.map((text) => (text.id === id ? { ...text, key: trimmed } : text)),
    });
  },

  addText: () => {
    const id = `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const taken = new Set(get().texts.map((text) => text.key));
    let key = 'newText';
    for (let suffix = 2; taken.has(key); suffix++) key = `newText${suffix}`;

    set({ texts: [...get().texts, { id, key, values: {} }] });
    return id;
  },

  deleteText: (id) => {
    get().saveToHistory();
    // Widgets pointing at it fall back to their own props.text, which is what
    // they showed before text resources existed
    const clearReferences = (components: LvglComponent[]): LvglComponent[] =>
      components.map((comp) => ({
        ...comp,
        ...(comp.textId === id ? { textId: undefined } : {}),
        children: clearReferences(comp.children ?? []),
      }));

    set({
      texts: get().texts.filter((text) => text.id !== id),
      screens: get().screens.map((screen) => ({
        ...screen,
        components: clearReferences(screen.components),
      })),
    });
  },

  addTypography: (seed = {}) => {
    const existing = get().typographies;
    const id = `typo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const taken = new Set(existing.map((t) => t.name));
    let name = seed.name ?? 'New typography';
    for (let suffix = 2; taken.has(name); suffix++) {
      name = `${seed.name ?? 'New typography'} (${suffix})`;
    }

    set({
      typographies: [
        ...existing,
        {
          id,
          name,
          fontResource: seed.fontResource ?? 'montserrat_14',
          fontSize: seed.fontSize ?? 14,
          letterSpace: seed.letterSpace ?? 0,
          lineSpace: seed.lineSpace ?? 0,
          align: seed.align ?? 'auto',
          decor: seed.decor ?? 'none',
          baseDir: seed.baseDir ?? 'auto',
        },
      ],
    });
    return id;
  },

  updateTypography: (id, updates) => {
    set({
      typographies: get().typographies.map((typography) =>
        typography.id === id ? { ...typography, ...updates } : typography,
      ),
    });
  },

  deleteTypography: (id) => {
    get().saveToHistory();
    // Widgets pointing at it fall back to inheriting the screen default, which
    // is what they did before a typography existed
    const clearReferences = (components: LvglComponent[]): LvglComponent[] =>
      components.map((comp) => ({
        ...comp,
        ...(comp.typographyId === id ? { typographyId: undefined } : {}),
        children: clearReferences(comp.children ?? []),
      }));

    set({
      typographies: get().typographies.filter((typography) => typography.id !== id),
      screens: get().screens.map((screen) => ({
        ...screen,
        components: clearReferences(screen.components),
      })),
    });
  },

  setScreens: (screens, screenGroups, typographies, languages, texts) => {
    get().saveToHistory();
    const firstId = screens.length > 0 ? screens[0].id : get().currentScreenId;
    set({
      screens: cloneScreens(screens),
      screenGroups: screenGroups ? screenGroups.map(g => ({ ...g })) : [],
      typographies: typographies ? typographies.map(t => ({ ...t })) : [],
      languages: languages ? languages.map(l => ({ ...l })) : [],
      texts: texts ? texts.map(t => ({ ...t, values: { ...t.values } })) : [],
      // A freshly loaded project starts with just its first screen open.
      openScreenIds: screens.length > 0 ? [firstId] : [],
      currentScreenId: firstId,
      selection: { selectedIds: [], hoveredId: null },
    });
  },

  syncModbusBindings: (tags) => {
    const nextScreens = synchronizeModbusBindings(get().screens, tags);
    if (nextScreens === get().screens) return;
    get().saveToHistory();
    set({ screens: nextScreens });
  },
  
  clearComponents: () => {
    const { currentScreenId } = get();
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: [],
          };
        }
        return screen;
      }),
      selection: { selectedIds: [], hoveredId: null },
    }));
  },
  
  // Z-order Actions
  bringToFront: (id) => {
    const { currentScreenId } = get();
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: changeZOrder(screen.components, id, 'front'),
          };
        }
        return screen;
      }),
    }));
  },
  
  sendToBack: (id) => {
    const { currentScreenId } = get();
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: changeZOrder(screen.components, id, 'back'),
          };
        }
        return screen;
      }),
    }));
  },
  
  bringForward: (id) => {
    const { currentScreenId } = get();
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: changeZOrder(screen.components, id, 'forward'),
          };
        }
        return screen;
      }),
    }));
  },
  
  sendBackward: (id) => {
    const { currentScreenId } = get();
    get().saveToHistory();
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          return {
            ...screen,
            components: changeZOrder(screen.components, id, 'backward'),
          };
        }
        return screen;
      }),
    }));
  },
  
  // Selection Actions
  selectComponent: (id, addToSelection = false) => {
    set(state => {
      if (addToSelection) {
        const isSelected = state.selection.selectedIds.includes(id);
        return {
          selection: {
            ...state.selection,
            selectedIds: isSelected
              ? state.selection.selectedIds.filter(sid => sid !== id)
              : [...state.selection.selectedIds, id],
          },
        };
      }
      return {
        selection: {
          ...state.selection,
          selectedIds: [id],
        },
      };
    });
  },
  
  selectComponents: (ids) => {
    set(state => ({
      selection: {
        ...state.selection,
        selectedIds: ids,
      },
    }));
  },
  
  clearSelection: () => {
    set(state => ({
      selection: {
        ...state.selection,
        selectedIds: [],
      },
    }));
  },
  
  setHoveredComponent: (id) => {
    set(state => ({
      selection: {
        ...state.selection,
        hoveredId: id,
      },
    }));
  },
  
  // Canvas Actions
  setCanvasSize: (width, height) => {
    set(state => ({
      canvas: { ...state.canvas, width, height },
    }));
  },
  
  setZoom: (zoom) => {
    const clampedZoom = Math.max(0.1, Math.min(3, zoom));
    set(state => ({
      canvas: { ...state.canvas, zoom: clampedZoom },
    }));
  },
  
  setPan: (x, y) => {
    set(state => ({
      canvas: { ...state.canvas, panX: x, panY: y },
    }));
  },
  
  toggleGrid: () => {
    set(state => ({
      canvas: { ...state.canvas, showGrid: !state.canvas.showGrid },
    }));
  },
  
  setSnapToGrid: (snap) => {
    set(state => ({
      canvas: { ...state.canvas, snapToGrid: snap },
    }));
  },
  
  // Drag Actions
  startDrag: (dragType, data) => {
    set(state => ({
      drag: {
        ...state.drag,
        isDragging: true,
        dragType,
        ...data,
      },
    }));
  },
  
  updateDrag: (x, y) => {
    set(state => ({
      drag: {
        ...state.drag,
        currentX: x,
        currentY: y,
      },
    }));
  },
  
  endDrag: () => {
    set(() => ({
      drag: {
        isDragging: false,
        dragType: null,
        draggedComponentType: null,
        draggedComponentId: null,
        resizeHandle: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      },
    }));
  },
  
  // Combined move + drag update in a single set call
  moveComponentAndUpdateDrag: (id, x, y, dragStartX, dragStartY) => {
    const { canvas, currentScreenId } = get();
    let finalX = x;
    let finalY = y;
    
    if (canvas.snapToGrid) {
      finalX = Math.round(x / canvas.gridSize) * canvas.gridSize;
      finalY = Math.round(y / canvas.gridSize) * canvas.gridSize;
    }
    
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          const newComponents = updateComponentInTree(screen.components, id, { x: finalX, y: finalY });
          if (newComponents === screen.components) return screen;
          return { ...screen, components: newComponents };
        }
        return screen;
      }),
      drag: {
        ...state.drag,
        startX: dragStartX,
        startY: dragStartY,
      },
    }));
  },
  
  // Combined resize + drag update in a single set call
  resizeComponentAndUpdateDrag: (id, width, height, dragStartX, dragStartY, x, y) => {
    const { canvas, currentScreenId } = get();
    let finalWidth = Math.max(10, width);
    let finalHeight = Math.max(10, height);
    
    if (canvas.snapToGrid) {
      finalWidth = Math.round(width / canvas.gridSize) * canvas.gridSize;
      finalHeight = Math.round(height / canvas.gridSize) * canvas.gridSize;
      finalWidth = Math.max(canvas.gridSize, finalWidth);
      finalHeight = Math.max(canvas.gridSize, finalHeight);
    }
    
    const updates: Partial<LvglComponent> = { width: finalWidth, height: finalHeight };
    if (x !== undefined) {
      updates.x = canvas.snapToGrid ? Math.round(x / canvas.gridSize) * canvas.gridSize : x;
    }
    if (y !== undefined) {
      updates.y = canvas.snapToGrid ? Math.round(y / canvas.gridSize) * canvas.gridSize : y;
    }
    
    set(state => ({
      screens: state.screens.map(screen => {
        if (screen.id === currentScreenId) {
          const newComponents = updateComponentInTree(screen.components, id, updates);
          if (newComponents === screen.components) return screen;
          return { ...screen, components: newComponents };
        }
        return screen;
      }),
      drag: {
        ...state.drag,
        startX: dragStartX,
        startY: dragStartY,
      },
    }));
  },
  
  // History Actions
  // Model: history is an array of snapshots. historyIndex points to the "current" snapshot.
  // saveToHistory() is called BEFORE a mutation: it saves the current state, truncates future,
  // and then the mutation changes screens (which becomes the "unsaved current" state).
  // undo: save current state as a redo point, restore history[historyIndex], decrement index.
  // redo: increment index, restore history[historyIndex].

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < 0) return;

    const entry = history[historyIndex];

    // Save current state as a redo point (one past historyIndex)
    const newHistory = [...history];
    // If there's no entry after historyIndex, push current state for redo
    if (historyIndex === history.length - 1) {
      newHistory.push(snapshotState(get()));
    } else {
      // Replace the entry right after historyIndex with current state
      newHistory[historyIndex + 1] = snapshotState(get());
    }

    set({
      ...restoreSnapshot(entry, get()),
      history: newHistory,
      historyIndex: historyIndex - 1,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex + 1 >= history.length) return;

    // The entry at historyIndex + 1 is the state to restore
    // (either a previously saved state or the state saved during undo)
    const nextIndex = historyIndex + 1;
    const entry = history[nextIndex];

    set({
      ...restoreSnapshot(entry, get()),
      historyIndex: nextIndex,
    });
  },

  saveToHistory: () => {
    const { history, historyIndex } = get();

    // Remove any future history (redo states) beyond current position
    const newHistory = history.slice(0, historyIndex + 1);

    // Add current state as a snapshot we can undo to
    newHistory.push(snapshotState(get()));

    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },
  
  // Alignment Actions
  updateAlignmentGuides: (guides) => {
    set({ alignmentGuides: guides });
  },
  
  clearAlignmentGuides: () => {
    set({ alignmentGuides: [] });
  },
  
  // Helpers
  getComponentById: (id) => {
    const { screens, currentScreenId } = get();
    const currentScreen = screens.find(p => p.id === currentScreenId);
    if (!currentScreen) return undefined;
    return findComponentInTree(currentScreen.components, id);
  },
  
  getComponentsByParent: (parentId) => {
    const { screens, currentScreenId } = get();
    const currentScreen = screens.find(p => p.id === currentScreenId);
    if (!currentScreen) return [];
    
    if (parentId === null) {
      return currentScreen.components;
    }
    const parent = findComponentInTree(currentScreen.components, parentId);
    return parent?.children || [];
  },
  
  findComponentAtPoint: (x, y) => {
    const { screens, currentScreenId } = get();
    const currentScreen = screens.find(p => p.id === currentScreenId);
    if (!currentScreen) return undefined;
    
    // Recursive search, preferring deeper (child) components
    const findAtPoint = (comps: LvglComponent[], offsetX = 0, offsetY = 0): LvglComponent | undefined => {
      // Search in reverse order (top-most first)
      for (let i = comps.length - 1; i >= 0; i--) {
        const comp = comps[i];
        const compX = comp.x + offsetX;
        const compY = comp.y + offsetY;
        
        if (
          x >= compX &&
          x <= compX + comp.width &&
          y >= compY &&
          y <= compY + comp.height
        ) {
          // Check children first
          const childHit = findAtPoint(comp.children, compX, compY);
          if (childHit) return childHit;
          return comp;
        }
      }
      return undefined;
    };
    
    return findAtPoint(currentScreen.components);
  },
  
  getAllComponents: () => {
    const { screens, currentScreenId } = get();
    const currentScreen = screens.find(p => p.id === currentScreenId);
    if (!currentScreen) return [];
    return flattenComponents(currentScreen.components);
  },
  
  getCurrentScreen: () => {
    const { screens, currentScreenId } = get();
    return screens.find(p => p.id === currentScreenId);
  },
}));
