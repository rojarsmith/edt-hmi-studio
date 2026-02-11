# LVGL Editor Property Editing Enhancement — Round Two

## Project path
`/home/xcssa/.openclaw/workspace/projects/lvgl-editor`

## Batch A: extend StyleProps (four-side padding, per-edge borders, per-corner radius, gradient, outline, border side, text decoration, blend mode)

### A.1 Type extensions (`src/types/index.ts`)
Extend StyleProps:
```typescript
// Four-side padding (the existing padding stays as the uniform value)
paddingTop?: number;
paddingBottom?: number;
paddingLeft?: number;
paddingRight?: number;

// Independent corner radii
borderRadiusTopLeft?: number;
borderRadiusTopRight?: number;
borderRadiusBottomLeft?: number;
borderRadiusBottomRight?: number;

// Which border sides are drawn
borderSide?: 'full' | 'top' | 'bottom' | 'left' | 'right' | 'top_bottom' | 'left_right' | 'none';

// Background gradient
bgGradColor?: string;
bgGradDir?: 'none' | 'hor' | 'ver';
bgGradStop?: number;  // 0-255

// Outline
outlineColor?: string;
outlineWidth?: number;
outlinePad?: number;

// Text decoration
textDecor?: 'none' | 'underline' | 'strikethrough';

// Blend mode
blendMode?: 'normal' | 'additive' | 'subtractive' | 'multiply';
```

### A.2 PropertyEditor style sections
- **Padding**: add a uniform/separate toggle. Uniform uses the existing single padding value; separate shows four inputs for top/bottom/left/right in a 2x2 grid
- **Corner radius**: the same uniform/separate toggle, with four corner inputs in separate mode
- **Border**: add a border-side picker (a group of icon buttons, like the 9-cell alignment grid but with 4 sides plus combinations)
- **Gradient** (new collapsible section): direction dropdown, colour picker, gradient stop slider (0-255)
- **Outline** (new collapsible section): colour, width, padding
- **Text decoration**: add a text-decor dropdown to the text section
- **Blend mode**: add a blend mode dropdown at the bottom of the style section

---

## Batch B: percentage and content-based sizing, wired through to code generation

### B.1 Size extensions
Add sizing modes to LvglComponent:
```typescript
widthMode?: 'px' | 'percent' | 'content';  // defaults to px
heightMode?: 'px' | 'percent' | 'content';
```

Rework the PropertyEditor size section:
- Each dimension (width/height) gets a mode toggle group (px / % / fit content)
- px mode: the existing numeric input
- percent mode: numeric input with a % suffix (1-100)
- content mode: show "LV_SIZE_CONTENT" and disable the numeric input

### B.2 Code generation (`src/codegen/templates/ui.c.ts`)
In generatePropsCode and the related functions, emit the matching LVGL C for these new properties:

**Common properties:**
- align → `lv_obj_align(obj, LV_ALIGN_xxx, offsetX, offsetY)`
- flags → `lv_obj_add_flag(obj, LV_OBJ_FLAG_xxx)` / `lv_obj_clear_flag` / `lv_obj_add_state(obj, LV_STATE_DISABLED)`
- widthMode/heightMode → `lv_obj_set_width(obj, lv_pct(50))` or `lv_obj_set_width(obj, LV_SIZE_CONTENT)`

**Style properties (in generateStyleCode):**
- shadow → `lv_obj_set_style_shadow_color/width/ofs_x/ofs_y/spread/opa`
- transform → `lv_obj_set_style_transform_angle/zoom/pivot_x/pivot_y` (v8) or `transform_rotation/scale_x/scale_y` (v9)
- scrollbar → `lv_obj_set_style_scrollbar_mode` (note: this is a flag, not a style)
- font → `lv_obj_set_style_text_font(obj, &lv_font_montserrat_14, 0)`, or a custom font
- four-side padding → `lv_obj_set_style_pad_top/bottom/left/right`
- per-corner radius → `lv_obj_set_style_radius` (LVGL has no per-corner radius, so emit the uniform value or a comment)
- border side → `lv_obj_set_style_border_side(obj, LV_BORDER_SIDE_xxx, 0)`
- gradient → `lv_obj_set_style_bg_grad_color/dir/stop`
- outline → `lv_obj_set_style_outline_color/width/pad`
- text decor → `lv_obj_set_style_text_decor(obj, LV_TEXT_DECOR_xxx, 0)`
- blend mode → `lv_obj_set_style_blend_mode(obj, LV_BLEND_MODE_xxx, 0)`

**Flex/Grid layout:**
- flex properties → `lv_obj_set_flex_flow/flex_align/flex_grow`
- grid properties → `lv_obj_set_grid_dsc_array/grid_align/grid_cell`

**Widget-specific properties:**
- table cellData → `lv_table_set_cell_value(obj, row, col, "text")`
- table columnWidths → `lv_table_set_col_width(obj, col, width)`
- chart series → a loop of `lv_chart_add_series` plus `lv_chart_set_next_value`
- chart yAxis → `lv_chart_set_range(obj, LV_CHART_AXIS_PRIMARY_Y, min, max)`
- calendar highlightedDates → `lv_calendar_set_highlighted_dates(obj, dates, count)`
- calendar showToday → `lv_calendar_set_today_date(obj, year, month, day)`
- tabview tabChildMap → a comment explaining the child assignment
- tileview tileChildMap → a comment
- win headerHeight/headerButtons → `lv_win_add_btn` calls

---

## Batch C: wire the new properties into canvas and preview rendering

### C.1 Canvas rendering (`src/components/Canvas/CanvasComponent.tsx`)
Make the widgets on the canvas reflect the new properties:

- **align** — position the widget within its parent according to the align value (CSS transform or a computed offset)
- **shadow** — CSS box-shadow
- **transform** — CSS transform: rotate() scale()
- **gradient** — CSS linear-gradient for the background
- **outline** — CSS outline
- **border side** — CSS border-top/bottom/left/right individually
- **opacity/blend** — CSS opacity and mix-blend-mode
- **text decoration** — CSS text-decoration
- **four-side padding** — CSS padding, set per side
- **size content/percent** — percentage width/height in percent mode, fit-content in content mode

### C.2 Preview rendering (`src/components/Preview/PreviewPanel.tsx`)
Reflect the new properties in the preview panel's Canvas 2D rendering as far as possible:
- shadow → Canvas shadowColor/shadowBlur/shadowOffsetX/shadowOffsetY
- transform → Canvas rotate/scale
- gradient → Canvas createLinearGradient
- reflect the remaining properties wherever practical

Note: the preview draws with the HTML5 Canvas 2D API rather than the DOM, so some effects have to be implemented through Canvas calls.

---

## Constraints
- All UI text in Chinese
- No new npm dependencies
- Follow the existing code style
- Build before making changes, to confirm the current state passes
- Build again to verify when finished
- Read CLAUDE.md first to understand the architecture
- Read the latest source files before editing them (they have changed substantially)
