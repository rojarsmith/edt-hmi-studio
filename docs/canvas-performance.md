# Canvas Performance Optimisation

## 1. Background

Dragging a widget on the design canvas stuttered noticeably. Every mousemove triggered several zustand state updates, which re-rendered the whole widget tree.

## 2. Where the time went

### 2.1 The original problem

Each mousemove made three zustand `set()` calls:
1. `updateDrag()` — update drag.currentX/Y
2. `moveComponent()` — deep-copy the whole pages array and walk the widget tree
3. `startDrag()` — update drag.startX/Y

Every `set()` re-renders every subscribed component.

### 2.2 Store subscriptions were too coarse

Canvas subscribed to the entire store by destructuring `useEditorStore()`:

```typescript
const { canvas, selection, drag, pages, ... } = useEditorStore();
```

Any field changing — including the high-frequency drag state — re-rendered Canvas, and with it every CanvasComponent, recursively.

### 2.3 React.memo was ineffective

- `isSelected` and `isHovered` were computed inline by Canvas and passed down as props, so they were recomputed on every Canvas render
- Even when the values did not change, React.memo's shallow comparison could not tell, because Canvas itself was re-rendering

### 2.4 Widget tree references were unstable

`updateComponentInTree` created new object references while walking the tree even for subtrees it had not modified, so React.memo's comparison always failed.

## 3. What was changed

### 3.1 Merge the state updates

**editorStore.ts**

New combined methods fold the move/resize and drag updates into a single `set()` call:

- `moveComponentAndUpdateDrag(id, x, y, dragStartX, dragStartY)` — one set for both the widget position and the drag state
- `resizeComponentAndUpdateDrag(id, w, h, x, y, dragStartX, dragStartY)` — likewise

The redundant `updateDrag()` calls were removed from the drag path.

### 3.2 Reference stability of the widget tree

**editorStore.ts — `updateComponentInTree`**

Rewritten to create new objects only along the path that actually changed, returning the original reference for untouched subtrees:

```typescript
function updateComponentInTree(components, id, updates) {
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
    return comp; // reference unchanged
  });
  return changed ? result : components;
}
```

### 3.3 Fine-grained store subscriptions

**Canvas.tsx**

Whole-store destructuring gave way to zustand selectors, subscribing only to what is needed:

```typescript
const canvasState = useEditorStore(s => s.canvas);
const selectedIds = useEditorStore(s => s.selection.selectedIds);
const pages = useEditorStore(s => s.pages);
// ...

// The important part: do not subscribe to the drag state.
// It is read through getState() inside the event handlers.
```

`drag` is the most frequently changing state — it changes every frame — so not subscribing to it means Canvas does not re-render while dragging.

### 3.4 Widgets subscribe to their own selection state

**CanvasComponent.tsx**

`isSelected` and `isHovered` are no longer passed down from Canvas as props; each widget subscribes to them itself:

```typescript
const isSelected = useEditorStore(
  useCallback(s => s.selection.selectedIds.includes(component.id), [component.id])
);
const isHovered = useEditorStore(
  useCallback(s => s.selection.hoveredId === component.id, [component.id])
);
```

The effect: when the selection changes, only the widgets actually affected re-render, rather than all of them.

### 3.5 Stable event handlers

**Canvas.tsx**

Every `useCallback` handler reads transient state through a ref or `getState()`, keeping its dependency array as small as possible:

```typescript
// Frequently changing local state lives in refs
const isPanningRef = useRef(false);
const panStartRef = useRef({ x: 0, y: 0 });
const boxSelectionRef = useRef<BoxSelection>(...);

const handleMouseMove = useCallback((e: React.MouseEvent) => {
  // Read through refs and getState(), not through the closure
  const drag = useEditorStore.getState().drag;
  const zoom = useEditorStore.getState().canvas.zoom;
  // ...
}, []); // empty or near-empty dependencies, so the handler identity is stable
```

### 3.6 requestAnimationFrame throttling

**Canvas.tsx**

The mousemove handler is throttled with RAF, so there is at most one state update per frame:

```typescript
if (rafRef.current) cancelAnimationFrame(rafRef.current);
rafRef.current = requestAnimationFrame(() => {
  // the actual move/resize work
});
```

### 3.7 React.memo

**CanvasComponent.tsx**

The component is wrapped in `React.memo`. Together with the reference-stability work above, unchanged widgets now skip re-rendering:

```typescript
export default React.memo(CanvasComponent);
```

## 4. Results

| Measure | Before | After |
|------|--------|--------|
| `set()` calls per mousemove | 3 | 1 |
| Canvas re-renders while dragging | on every set | none |
| CanvasComponent re-render scope | every widget | only the dragged widget |
| mousemove handling rate | every event | once per frame (RAF) |
| Event handler identity | changed constantly | stable |

## 5. Key files

| File | Change |
|------|------|
| `src/store/editorStore.ts` | Combined update methods, widget tree reference stability |
| `src/components/Canvas/Canvas.tsx` | Fine-grained subscriptions, stable handlers, RAF throttling |
| `src/components/Canvas/CanvasComponent.tsx` | Self-subscribed selection, React.memo |

## 6. Design principles

1. **Subscribe to as little as possible**: a component subscribes only to the state slice it needs, so unrelated updates cannot re-render it
2. **Do not subscribe to high-frequency state**: values that change every frame, such as the drag coordinates, are read with `getState()` inside the event handlers
3. **Reference stability**: handlers read state through refs and getState() to keep their identity stable, and tree updates preserve the references of unmodified nodes
4. **Batch updates**: several state updates belonging to one gesture are merged into a single `set()` call
5. **Throttle per frame**: high-frequency events such as mousemove are throttled with RAF and handled at most once per frame
