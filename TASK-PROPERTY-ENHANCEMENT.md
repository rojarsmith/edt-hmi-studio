# LVGL Editor Property Editing Enhancement

## Project path
`/home/xcssa/.openclaw/workspace/projects/lvgl-editor`

## Hard constraints
- All UI text in Chinese
- Read CLAUDE.md first to understand the project architecture
- Run `npm run build` before making changes, to confirm the current state compiles
- Run `npm run build` after each batch to verify there are no compile errors
- Do not add dependencies; work with the existing stack (React 19 + TypeScript + Zustand + CSS)
- Put any new CSS in the matching component's stylesheet (PropertyEditor.css)
- Follow the existing code style and patterns

## Architecture landmarks
- Type definitions: `src/types/index.ts`
- Widget definitions: `src/utils/componentDefinitions.ts`
- Property editor: `src/components/PropertyEditor/PropertyEditor.tsx`
- Editor store: `src/store/editorStore.ts`
- Canvas rendering: `src/components/Canvas/CanvasComponent.tsx`
- Code generation: `src/codegen/templates/ui.c.ts`

## Batch 1: common properties — alignment, flags, disabled state

### 1.1 Type extensions (`src/types/index.ts`)
Add fields to the `LvglComponent` interface:
```typescript
// added to the LvglComponent interface
align?: 'default' | 'center' | 'top_left' | 'top_mid' | 'top_right' | 'bottom_left' | 'bottom_mid' | 'bottom_right' | 'left_mid' | 'right_mid';
alignOffsetX?: number;
alignOffsetY?: number;
flags?: {
  clickable?: boolean;
  checkable?: boolean;
  scrollable?: boolean;
  scrollElastic?: boolean;
  scrollMomentum?: boolean;
  scrollOnFocus?: boolean;
  snappable?: boolean;
  pressLock?: boolean;
  eventBubble?: boolean;
  gesturesBubble?: boolean;
  hidden?: boolean;
  disabled?: boolean;  // maps to LV_STATE_DISABLED
};
```

### 1.2 Property editor — common property sections
In PropertyEditor.tsx, add two new sections between "Size" and "Style":

**Alignment section:**
- A 9-cell button grid for the alignment (not a dropdown — a 3x3 grid of buttons)
- Numeric inputs for the X/Y alignment offset

**Flags section:**
- A list of checkbox toggles, one per flag
- Grouped: interaction (clickable, checkable, disabled), scrolling (scrollable and friends), behaviour (hidden, snappable and friends)

### 1.3 Widget definitions
Nothing needs to change in `componentDefinitions.ts` — leaving flags undefined by default is fine, and the editor shows LVGL's defaults.

---

## Batch 2: extend StyleProps — shadow, transform, scrollbar, font

### 2.1 Type extensions (`src/types/index.ts`)
Extend the `StyleProps` interface:
```typescript
export interface StyleProps {
  // existing
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  textColor?: string;
  opacity?: number;
  padding?: number;
  // new
  shadowColor?: string;
  shadowWidth?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowSpread?: number;
  shadowOpacity?: number;
  transformAngle?: number;    // rotation, in 0.1 degree units
  transformZoomX?: number;    // X scale (256 = 100%)
  transformZoomY?: number;    // Y scale (256 = 100%)
  transformPivotX?: number;   // rotation pivot X
  transformPivotY?: number;   // rotation pivot Y
  scrollbarMode?: 'off' | 'on' | 'active' | 'auto';
  scrollbarWidth?: number;
  scrollbarColor?: string;
  textFont?: string;          // font name, referencing a resource
  textFontSize?: number;      // font size
  textLetterSpace?: number;   // letter spacing
  textLineSpace?: number;     // line spacing
}
```

### 2.2 Property editor — style section
Add these as collapsible groups within the existing style section:

**Shadow (collapsible):**
- Shadow colour (colour picker)
- Shadow width, offset X, offset Y, spread (numeric inputs)
- Shadow opacity (slider)

**Transform (collapsible):**
- Rotation (slider plus a number, 0-3600, displayed in degrees)
- X/Y scale (slider plus a number, shown as a percentage)
- Rotation pivot X/Y

**Scrollbar (collapsible):**
- Mode (dropdown)
- Width, colour

**Text (collapsible):**
- Font picker (dropdown, listing the uploaded fonts from resourceStore plus the built-in ones)
- Font size, letter spacing, line spacing

### 2.3 A collapsible section component
Implement a simple `CollapsibleSection` for grouping in the property editor, replacing the plain `section-header` div in use today.

---

## Batch 3: complete the flex layout, and add grid

### 3.1 Container flex properties
An obj container set to Flex currently only has direction and gap. It needs:
- `flexWrap`: 'nowrap' | 'wrap' | 'wrap-reverse'
- `justifyContent`: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
- `alignItems`: 'flex-start' | 'flex-end' | 'center' | 'stretch'
- `alignContent`: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'space-between' | 'space-around'

### 3.2 Container grid properties
An obj container set to Grid needs:
- `gridColumns`: string (for example "1fr 2fr 1fr" — a text input plus a visual editor)
- `gridRows`: string (the same)
- `gridColumnGap`: number
- `gridRowGap`: number

The grid template editor UI:
- A bar chart visualising the current column/row definitions
- Each track's value is editable (fr/px/%)
- Buttons to add and remove tracks

### 3.3 Flex/grid child properties
When a widget's parent container uses a flex or grid layout, show extra sections in that widget's property editor:

**Flex child:**
- `flexGrow`: number (0-10)
- `flexShrink`: number (0-10)
- `alignSelf`: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch'

**Grid child:**
- `gridColumn`: number (starting column)
- `gridColumnSpan`: number (columns spanned)
- `gridRow`: number (starting row)
- `gridRowSpan`: number (rows spanned)
- `gridCellAlignX`: 'start' | 'center' | 'end' | 'stretch'
- `gridCellAlignY`: 'start' | 'center' | 'end' | 'stretch'

These live in the widget's own props. PropertyEditor has to inspect the parent's layout type to decide whether to show them.

---

## Batch 4: table cell editing

### 4.1 Table props
```typescript
// the table widget's props
{
  rows: number;
  cols: number;
  cellData: string[][];        // 2D array, cellData[row][col]
  columnWidths: number[];      // width of each column
  headerRow: boolean;          // whether the first row is a header
  cellAligns: ('left' | 'center' | 'right')[][]; // per-cell alignment
}
```

### 4.2 Table editor UI
Not a plain text box — this needs an inline table editor:
- Render an editable HTML table directly in the property panel
- Click a cell to edit its text
- Column widths adjustable by dragging, or by a numeric input
- A header row toggle
- Add and delete rows and columns, from a context menu or buttons
- Alignment settable per cell

### 4.3 componentDefinitions
Update the table defaultProps:
```typescript
defaultProps: { 
  rows: 3, 
  cols: 3, 
  cellData: [['', '', ''], ['', '', ''], ['', '', '']], 
  columnWidths: [60, 60, 60],
  headerRow: true,
  cellAligns: [['left','left','left'],['left','left','left'],['left','left','left']]
}
```

---

## Batch 5: chart multi-series, and calendar highlighted dates

### 5.1 Chart props
```typescript
{
  type: 'line' | 'bar' | 'scatter';
  series: Array<{
    name: string;
    data: number[];
    color: string;
    lineWidth?: number;
    pointSize?: number;
  }>;
  yAxisMin?: number;
  yAxisMax?: number;
  xLabels?: string[];
  yLabels?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  lineColor?: string;  // kept for backward compatibility
}
```

### 5.2 Chart editor UI
- A series list (add, delete, rename)
- Per series: name, colour picker, data point input
- Y axis range (min/max)
- X axis labels (comma separated)
- Legend toggle
- Backward compatibility: if the props still carry the old `data` field, migrate it into `series[0].data` automatically

### 5.3 Calendar props
```typescript
{
  year: number;
  month: number;
  showDayNames?: boolean;
  showToday?: boolean;           // today marker
  highlightedDates?: string[];   // "YYYY-MM-DD" format
  dateRangeMode?: boolean;       // date range selection mode
  rangeStart?: string;
  rangeEnd?: string;
}
```

### 5.4 Calendar editor UI
- Year and month pickers (already present)
- Today marker toggle
- Highlighted date list: a tag input (type a date and press Enter to add, click the x to remove)
- Date range mode toggle plus start/end pickers

---

## Batch 6: child management for the TabView / TileView / Window containers

### 6.1 The TabView model
The hardest part. Each tab in a TabView has to act as its own container area.

**Approach:** group the TabView's children by tab, keeping the mapping in props:
```typescript
{
  tabs: string[];           // tab names
  activeTab: number;        // the tab currently shown
  tabPosition: 'top' | 'bottom' | 'left' | 'right';
  tabChildMap: Record<string, string[]>;  // tabIndex -> childId[]
}
```

A widget dragged into a TabView is assigned to the currently active tab.

**Property editor UI:**
- A tab list (add, delete, rename, reorder by dragging)
- Each tab shows how many children it holds
- Clicking a tab switches the active tab, and the canvas then shows only that tab's children

**HierarchyPanel:**
- Group a TabView's children by tab

### 6.2 The TileView model
Like TabView, with each tile as its own container:
```typescript
{
  rows: number;
  cols: number;
  currentRow: number;
  currentCol: number;
  tileChildMap: Record<string, string[]>;  // "row-col" -> childId[]
}
```

**Property editor UI:**
- Row and column counts
- A visual grid of small squares; click one to select the tile being edited
- Each tile shows how many children it holds

### 6.3 The Window model
A Window separates its title bar from its content area:
```typescript
{
  title: string;
  headerHeight: number;        // title bar height, default 40
  showCloseBtn: boolean;       // close button
  headerButtons: Array<{       // custom title bar buttons
    icon: string;              // icon name
    id: string;
  }>;
  // children all go in the content area by default
}
```

**Property editor UI:**
- Title text
- Title bar height
- Close button toggle
- Title bar button list (add, delete)

---

## UI conventions

### General principles
- The property editor is narrow (around 260px), so the UI has to be compact
- Manage complex properties with collapsible groups
- Colour pickers use the existing pattern: a colour input paired with a text input
- Numeric inputs use type="number" with sensible min/max/step
- Toggles use a checkbox
- Enumerations use a select dropdown
- List editing (chart series, table cells) gets a purpose-built inline editor, not just a text box

### Purpose-built UI components needed
1. **9-cell alignment picker** — a 3x3 button grid
2. **Collapsible section** — a section with an expand/collapse arrow
3. **Tag input** — for date lists and similar (type, press Enter to add, click x to remove)
4. **Inline table editor** — for table cell editing
5. **Series list editor** — for chart multi-series
6. **Grid template editor** — for grid column/row definitions
7. **Tab manager** — for the TabView tab list

---

## Order of work
Batches 1 → 2 → 3 → 4 → 5 → 6, in that order. Build to verify after each batch.
