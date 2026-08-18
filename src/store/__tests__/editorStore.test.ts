import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';
import { getEntryScreen } from '../../utils/entryScreen';

// Reset store before each test
function resetStore() {
  useEditorStore.getState();
  // Reset to a clean state by replacing screens with a single default screen
  useEditorStore.setState({
    screens: [{ id: 'test-screen-1', name: 'Screen 1', components: [], backgroundColor: '#ffffff' }],
    currentScreenId: 'test-screen-1',
    screenGroups: [],
    openScreenIds: ['test-screen-1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
  return useEditorStore.getState();
}

describe('editorStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // --- addComponent ---
  describe('addComponent', () => {
    it('should add a button component to the current screen', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 10, 20);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(id).toBeTruthy();
      expect(screen.components).toHaveLength(1);
      expect(screen.components[0].type).toBe('btn');
    });

    it('should snap position to grid when snapToGrid is enabled', () => {
      const store = useEditorStore.getState();
      // Default gridSize is 10, snapToGrid is true
      store.addComponent('label', 13, 27);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].x).toBe(10);
      expect(screen.components[0].y).toBe(30);
    });

    it('should add a child component to a parent', () => {
      const store = useEditorStore.getState();
      const parentId = store.addComponent('obj', 0, 0);
      store.addComponent('label', 5, 5, parentId);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(1);
      expect(screen.components[0].children).toHaveLength(1);
      expect(screen.components[0].children[0].type).toBe('label');
    });

    it('numbers component ids from 1 per type, without duplicates', () => {
      const store = useEditorStore.getState();
      store.addComponent('btn', 0, 0);
      store.addComponent('btn', 10, 10);
      store.addComponent('label', 20, 20);
      const screen = () =>
        useEditorStore.getState().screens.find(p => p.id === useEditorStore.getState().currentScreenId)!;
      expect(screen().components.map(c => c.name)).toEqual(['Button_1', 'Button_2', 'Label_1']);
    });

    it('reuses a freed number before growing the count', () => {
      const store = useEditorStore.getState();
      const first = store.addComponent('btn', 0, 0);
      store.addComponent('btn', 10, 10);
      store.deleteComponents([first]);
      store.addComponent('btn', 20, 20);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      // Button_1 was deleted, so the gap fills before Button_3 is handed out.
      expect(screen.components.map(c => c.name).sort()).toEqual(['Button_1', 'Button_2']);
    });

    it('counts names on children and other screens when numbering', () => {
      const store = useEditorStore.getState();
      const parentId = store.addComponent('obj', 0, 0);
      store.addComponent('btn', 5, 5, parentId);
      store.addComponent('btn', 10, 10);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].children[0].name).toBe('Button_1');
      expect(screen.components[1].name).toBe('Button_2');
    });

    it('should return empty string for unknown component type', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('nonexistent', 0, 0);
      expect(id).toBe('');
    });

    it('should use default props from component definition', () => {
      const store = useEditorStore.getState();
      store.addComponent('slider', 0, 0);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      const slider = screen.components[0];
      expect(slider.props.min).toBe(0);
      expect(slider.props.max).toBe(100);
      expect(slider.props.value).toBe(50);
    });
  });

  // --- deleteComponents ---
  describe('deleteComponents', () => {
    it('should delete a component by id', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.deleteComponents([id]);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(0);
    });

    it('should delete multiple components', () => {
      const store = useEditorStore.getState();
      const id1 = store.addComponent('btn', 0, 0);
      const id2 = store.addComponent('label', 50, 50);
      store.deleteComponents([id1, id2]);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(0);
    });

    it('should remove deleted ids from selection', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.selectComponent(id);
      store.deleteComponents([id]);
      const state = useEditorStore.getState();
      expect(state.selection.selectedIds).not.toContain(id);
    });

    it('should delete nested child components', () => {
      const store = useEditorStore.getState();
      const parentId = store.addComponent('obj', 0, 0);
      const childId = store.addComponent('label', 5, 5, parentId);
      store.deleteComponents([childId]);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].children).toHaveLength(0);
    });

    it('should do nothing when deleting empty array', () => {
      const store = useEditorStore.getState();
      store.addComponent('btn', 0, 0);
      store.deleteComponents([]);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(1);
    });
  });

  // --- moveComponent ---
  describe('moveComponent', () => {
    it('should update component position', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.moveComponent(id, 100, 200);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].x).toBe(100);
      expect(screen.components[0].y).toBe(200);
    });

    it('should snap to grid when moving', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.moveComponent(id, 13, 27);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].x).toBe(10);
      expect(screen.components[0].y).toBe(30);
    });

    it('should not snap when snapToGrid is disabled', () => {
      const store = useEditorStore.getState();
      store.setSnapToGrid(false);
      const id = store.addComponent('btn', 0, 0);
      store.moveComponent(id, 13, 27);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].x).toBe(13);
      expect(screen.components[0].y).toBe(27);
    });

    it('should move a nested child component', () => {
      const store = useEditorStore.getState();
      const parentId = store.addComponent('obj', 0, 0);
      const childId = store.addComponent('label', 0, 0, parentId);
      store.moveComponent(childId, 50, 60);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].children[0].x).toBe(50);
      expect(screen.components[0].children[0].y).toBe(60);
    });

    it('should handle moving to negative coordinates', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.moveComponent(id, -10, -20);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components[0].x).toBe(-10);
      expect(screen.components[0].y).toBe(-20);
    });
  });

  // --- undo/redo ---
  describe('undo/redo', () => {
    it('should undo adding a component', () => {
      const store = useEditorStore.getState();
      store.addComponent('btn', 0, 0);
      let state = useEditorStore.getState();
      let screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(1);

      store.undo();
      state = useEditorStore.getState();
      screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(0);
    });

    it('should redo after undo', () => {
      const store = useEditorStore.getState();
      store.addComponent('btn', 0, 0);
      // addComponent calls saveToHistory before mutation:
      //   history[0] = empty state, historyIndex = 0, then mutation adds btn
      // undo: restores history[0] (empty), saves current (with btn) at history[1], historyIndex = -1
      // redo: goes to history[0] (empty), historyIndex = 0
      // redo again: goes to history[1] (with btn), historyIndex = 1
      store.undo();
      let state = useEditorStore.getState();
      let screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(0);

      // Two redos needed: first restores the pre-mutation snapshot, second restores post-mutation
      store.redo();
      store.redo();
      state = useEditorStore.getState();
      screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(1);
    });

    it('should do nothing when undo with no history', () => {
      const store = useEditorStore.getState();
      store.undo(); // should not throw
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(0);
    });

    it('should do nothing when redo with no future', () => {
      const store = useEditorStore.getState();
      store.redo(); // should not throw
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(0);
    });

    it('should handle multiple undo/redo cycles', () => {
      const store = useEditorStore.getState();
      store.addComponent('btn', 0, 0);
      store.addComponent('label', 50, 50);

      let state = useEditorStore.getState();
      let screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(2);

      store.undo(); // undo label add → 1 component
      state = useEditorStore.getState();
      screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(1);

      store.undo(); // undo btn add → 0 components
      state = useEditorStore.getState();
      screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(0);

      // Redo twice to get back to 1 component (pre-mutation + post-mutation of first add)
      store.redo();
      store.redo();
      state = useEditorStore.getState();
      screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(1);
    });
  });

  // --- addScreen/deleteScreen/renameScreen ---
  describe('screen management', () => {
    it('should add a new screen', () => {
      const store = useEditorStore.getState();
      const newPageId = store.addScreen();
      const state = useEditorStore.getState();
      expect(state.screens).toHaveLength(2);
      expect(state.currentScreenId).toBe(newPageId);
    });

    it('should delete a screen', () => {
      const store = useEditorStore.getState();
      const newPageId = store.addScreen();
      store.deleteScreen(newPageId);
      const state = useEditorStore.getState();
      expect(state.screens).toHaveLength(1);
    });

    it('should not delete the last screen', () => {
      const store = useEditorStore.getState();
      const state = useEditorStore.getState();
      store.deleteScreen(state.currentScreenId);
      const afterState = useEditorStore.getState();
      expect(afterState.screens).toHaveLength(1);
    });

    it('should rename a screen', () => {
      const store = useEditorStore.getState();
      const state = useEditorStore.getState();
      store.renameScreen(state.currentScreenId, 'My Screen');
      const afterState = useEditorStore.getState();
      expect(afterState.screens[0].name).toBe('My Screen');
    });

    it('should switch current screen when deleting the active screen', () => {
      const store = useEditorStore.getState();
      const firstPageId = useEditorStore.getState().currentScreenId;
      store.addScreen();
      store.deleteScreen(useEditorStore.getState().currentScreenId);
      const state = useEditorStore.getState();
      expect(state.currentScreenId).toBe(firstPageId);
    });
  });

  // --- selectComponent/clearSelection ---
  describe('selection', () => {
    it('should select a single component', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.selectComponent(id);
      const state = useEditorStore.getState();
      expect(state.selection.selectedIds).toEqual([id]);
    });

    it('should replace selection when selecting without addToSelection', () => {
      const store = useEditorStore.getState();
      const id1 = store.addComponent('btn', 0, 0);
      const id2 = store.addComponent('label', 50, 50);
      store.selectComponent(id1);
      store.selectComponent(id2);
      const state = useEditorStore.getState();
      expect(state.selection.selectedIds).toEqual([id2]);
    });

    it('should add to selection with addToSelection flag', () => {
      const store = useEditorStore.getState();
      const id1 = store.addComponent('btn', 0, 0);
      const id2 = store.addComponent('label', 50, 50);
      store.selectComponent(id1);
      store.selectComponent(id2, true);
      const state = useEditorStore.getState();
      expect(state.selection.selectedIds).toContain(id1);
      expect(state.selection.selectedIds).toContain(id2);
    });

    it('should toggle off when addToSelection and already selected', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.selectComponent(id);
      store.selectComponent(id, true);
      const state = useEditorStore.getState();
      expect(state.selection.selectedIds).not.toContain(id);
    });

    it('should clear all selection', () => {
      const store = useEditorStore.getState();
      const id = store.addComponent('btn', 0, 0);
      store.selectComponent(id);
      store.clearSelection();
      const state = useEditorStore.getState();
      expect(state.selection.selectedIds).toHaveLength(0);
    });
  });

  // --- reorderComponentAdjacentTo ---
  describe('reorderComponentAdjacentTo', () => {
    const rootTypes = () => {
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      return screen.components.map(c => c.type);
    };

    it('reorders siblings without nesting them', () => {
      const store = useEditorStore.getState();
      const img = store.addComponent('img', 0, 0);
      store.addComponent('label', 0, 0);
      const slider = store.addComponent('slider', 0, 0);
      expect(rootTypes()).toEqual(['img', 'label', 'slider']);

      // Move the image to sit directly after the slider.
      useEditorStore.getState().reorderComponentAdjacentTo(img, slider, 'after');

      expect(rootTypes()).toEqual(['label', 'slider', 'img']);
      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      // Nothing gained a child — this is a same-level move.
      expect(screen.components.every(c => c.children.length === 0)).toBe(true);
    });

    it('places a component before its target', () => {
      const store = useEditorStore.getState();
      store.addComponent('img', 0, 0);
      const label = store.addComponent('label', 0, 0);
      const slider = store.addComponent('slider', 0, 0);

      useEditorStore.getState().reorderComponentAdjacentTo(slider, label, 'before');

      expect(rootTypes()).toEqual(['img', 'slider', 'label']);
    });

    it('keeps indices correct when moving forwards within one list', () => {
      const store = useEditorStore.getState();
      const first = store.addComponent('img', 0, 0);
      store.addComponent('label', 0, 0);
      const third = store.addComponent('slider', 0, 0);
      store.addComponent('btn', 0, 0);

      // Removing `first` shifts `third` down one slot; the insert must account
      // for that rather than using the pre-removal index.
      useEditorStore.getState().reorderComponentAdjacentTo(first, third, 'before');

      expect(rootTypes()).toEqual(['label', 'img', 'slider', 'btn']);
    });

    it('moves a component out of a container into the root list', () => {
      const store = useEditorStore.getState();
      const container = store.addComponent('obj', 0, 0);
      const nested = store.addComponent('label', 0, 0, container);
      const sibling = store.addComponent('btn', 0, 0);

      useEditorStore.getState().reorderComponentAdjacentTo(nested, sibling, 'after');

      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components.map(c => c.id)).toEqual([container, sibling, nested]);
      expect(screen.components[0].children).toHaveLength(0);
      expect(screen.components[2].parentId).toBeNull();
    });

    it('refuses to move a component into its own subtree', () => {
      const store = useEditorStore.getState();
      const parent = store.addComponent('obj', 0, 0);
      const child = store.addComponent('label', 0, 0, parent);

      useEditorStore.getState().reorderComponentAdjacentTo(parent, child, 'after');

      const state = useEditorStore.getState();
      const screen = state.screens.find(p => p.id === state.currentScreenId)!;
      expect(screen.components).toHaveLength(1);
      expect(screen.components[0].id).toBe(parent);
      expect(screen.components[0].children[0].id).toBe(child);
    });

    it('is a no-op when target and source are the same', () => {
      const store = useEditorStore.getState();
      const a = store.addComponent('img', 0, 0);
      store.addComponent('label', 0, 0);

      useEditorStore.getState().reorderComponentAdjacentTo(a, a, 'after');

      expect(rootTypes()).toEqual(['img', 'label']);
    });
  });

  // --- screens: open / close tabs ---
  describe('screen tabs', () => {
    it('opens a screen and makes it current', () => {
      const created = useEditorStore.getState().addScreen();
      useEditorStore.getState().setCurrentScreen('test-screen-1');

      useEditorStore.getState().openScreen(created);

      const state = useEditorStore.getState();
      expect(state.currentScreenId).toBe(created);
      expect(state.openScreenIds).toEqual(['test-screen-1', created]);
    });

    it('jumps to an already open screen without opening it twice', () => {
      const created = useEditorStore.getState().addScreen();
      useEditorStore.getState().setCurrentScreen('test-screen-1');

      useEditorStore.getState().openScreen(created);
      useEditorStore.getState().openScreen(created);

      const state = useEditorStore.getState();
      expect(state.currentScreenId).toBe(created);
      expect(state.openScreenIds.filter(id => id === created)).toHaveLength(1);
    });

    it('closing a tab keeps the screen in the manager', () => {
      const created = useEditorStore.getState().addScreen();

      useEditorStore.getState().closeScreen(created);

      const state = useEditorStore.getState();
      expect(state.openScreenIds).toEqual(['test-screen-1']);
      expect(state.screens.some(s => s.id === created)).toBe(true);
    });

    it('closing the active tab activates its neighbour', () => {
      const second = useEditorStore.getState().addScreen();

      useEditorStore.getState().closeScreen(second);

      expect(useEditorStore.getState().currentScreenId).toBe('test-screen-1');
    });

    it('refuses to close the last open tab', () => {
      useEditorStore.getState().closeScreen('test-screen-1');

      expect(useEditorStore.getState().openScreenIds).toEqual(['test-screen-1']);
    });
  });

  // --- screens: creation and deletion ---
  describe('screen lifecycle', () => {
    it('names new screens by filling the first free slot', () => {
      const store = useEditorStore.getState();
      const second = store.addScreen();
      useEditorStore.getState().addScreen();
      useEditorStore.getState().deleteScreen(second);

      const created = useEditorStore.getState().addScreen();

      const screen = useEditorStore.getState().screens.find(s => s.id === created)!;
      expect(screen.name).toBe('Screen 2');
    });

    it('refuses to delete the last screen', () => {
      useEditorStore.getState().deleteScreen('test-screen-1');

      expect(useEditorStore.getState().screens).toHaveLength(1);
    });

    it('undo restores a deleted screen along with its tab', () => {
      const created = useEditorStore.getState().addScreen();
      useEditorStore.getState().addComponent('btn', 10, 10);
      const before = useEditorStore.getState().screens.find(s => s.id === created)!;
      expect(before.components).toHaveLength(1);

      useEditorStore.getState().deleteScreen(created);
      expect(useEditorStore.getState().screens.some(s => s.id === created)).toBe(false);

      useEditorStore.getState().undo();

      const state = useEditorStore.getState();
      const restored = state.screens.find(s => s.id === created);
      expect(restored).toBeDefined();
      expect(restored!.components).toHaveLength(1);
      expect(state.openScreenIds).toContain(created);
    });

    it('redo re-applies the deletion', () => {
      const created = useEditorStore.getState().addScreen();
      useEditorStore.getState().deleteScreen(created);
      useEditorStore.getState().undo();

      // Two redos, matching the existing history semantics: the first lands on
      // the pre-mutation snapshot, the second on the post-mutation state.
      useEditorStore.getState().redo();
      useEditorStore.getState().redo();

      const state = useEditorStore.getState();
      expect(state.screens.some(s => s.id === created)).toBe(false);
      expect(state.openScreenIds).not.toContain(created);
    });
  });

  // --- entry screen ---
  describe('entry screen', () => {
    it('defaults to the first screen when no flag is set', () => {
      useEditorStore.getState().addScreen();

      const entry = getEntryScreen(useEditorStore.getState().screens);
      expect(entry?.id).toBe('test-screen-1');
    });

    it('moves the flag so exactly one screen carries it', () => {
      const second = useEditorStore.getState().addScreen();
      useEditorStore.getState().setEntryScreen(second);

      let screens = useEditorStore.getState().screens;
      expect(getEntryScreen(screens)?.id).toBe(second);
      expect(screens.filter(s => s.isEntry)).toHaveLength(1);

      useEditorStore.getState().setEntryScreen('test-screen-1');

      screens = useEditorStore.getState().screens;
      expect(getEntryScreen(screens)?.id).toBe('test-screen-1');
      expect(screens.filter(s => s.isEntry)).toHaveLength(1);
    });

    it('ignores unknown screen ids', () => {
      useEditorStore.getState().setEntryScreen('nope');

      expect(getEntryScreen(useEditorStore.getState().screens)?.id).toBe('test-screen-1');
      expect(useEditorStore.getState().history).toHaveLength(0);
    });

    it('setting the current entry again leaves history untouched', () => {
      const second = useEditorStore.getState().addScreen();
      useEditorStore.getState().setEntryScreen(second);
      const historyBefore = useEditorStore.getState().history.length;

      useEditorStore.getState().setEntryScreen(second);

      expect(useEditorStore.getState().history).toHaveLength(historyBefore);
    });

    it('falls back to the first remaining screen when the entry is deleted', () => {
      const second = useEditorStore.getState().addScreen();
      useEditorStore.getState().setEntryScreen(second);

      useEditorStore.getState().deleteScreen(second);

      const screens = useEditorStore.getState().screens;
      expect(getEntryScreen(screens)?.id).toBe('test-screen-1');
    });

    it('undo restores the previous entry', () => {
      const second = useEditorStore.getState().addScreen();
      useEditorStore.getState().setEntryScreen(second);

      useEditorStore.getState().undo();

      expect(getEntryScreen(useEditorStore.getState().screens)?.id).toBe('test-screen-1');
    });
  });

  // --- screen groups ---
  describe('screen groups', () => {
    it('creates a top-level group', () => {
      const groupId = useEditorStore.getState().addScreenGroup(null);

      expect(groupId).toBeTruthy();
      const group = useEditorStore.getState().screenGroups.find(g => g.id === groupId)!;
      expect(group.name).toBe('Group 1');
      expect(group.parentId).toBeNull();
    });

    it('allows a second level of nesting', () => {
      const parent = useEditorStore.getState().addScreenGroup(null)!;

      const child = useEditorStore.getState().addScreenGroup(parent);

      expect(child).toBeTruthy();
      expect(useEditorStore.getState().getScreenGroupDepth(child)).toBe(2);
    });

    it('refuses a third level', () => {
      const level1 = useEditorStore.getState().addScreenGroup(null)!;
      const level2 = useEditorStore.getState().addScreenGroup(level1)!;

      expect(useEditorStore.getState().canNestScreenGroup(level2)).toBe(false);
      expect(useEditorStore.getState().addScreenGroup(level2)).toBeNull();
      expect(useEditorStore.getState().screenGroups).toHaveLength(2);
    });

    it('deleting a group lifts its screens and subgroups to the parent', () => {
      const level1 = useEditorStore.getState().addScreenGroup(null)!;
      const level2 = useEditorStore.getState().addScreenGroup(level1)!;
      const screenId = useEditorStore.getState().addScreen(level2);

      useEditorStore.getState().deleteScreenGroup(level2);

      const state = useEditorStore.getState();
      expect(state.screenGroups.map(g => g.id)).toEqual([level1]);
      expect(state.screens.find(s => s.id === screenId)!.groupId).toBe(level1);
    });

    it('undo restores a deleted group', () => {
      const level1 = useEditorStore.getState().addScreenGroup(null)!;
      const screenId = useEditorStore.getState().addScreen(level1);

      useEditorStore.getState().deleteScreenGroup(level1);
      useEditorStore.getState().undo();

      const state = useEditorStore.getState();
      expect(state.screenGroups.map(g => g.id)).toEqual([level1]);
      expect(state.screens.find(s => s.id === screenId)!.groupId).toBe(level1);
    });
  });
});
