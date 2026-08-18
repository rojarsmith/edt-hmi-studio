import type { ModbusBinding } from './hmi';

export type {
  BoardDefinition,
  BoardId,
  CommunicationConfig,
  ModbusAccess,
  ModbusBinding,
  ModbusDataType,
  ModbusRegisterArea,
  ModbusRegisterTag,
  ModbusWidgetProperty,
  ModbusWriteBehavior,
} from './hmi';

// Theme Types

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  border: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
}

export type ThemePreset = 'light' | 'dark' | 'custom';

// Animation Types
export type AnimationType =
  | 'fade_in'
  | 'fade_out'
  | 'slide_left'
  | 'slide_right'
  | 'slide_up'
  | 'slide_down'
  | 'zoom_in'
  | 'zoom_out'
  | 'custom';

export type AnimationEasing =
  | 'linear'
  | 'ease_in'
  | 'ease_out'
  | 'ease_in_out'
  | 'overshoot'
  | 'bounce';

export interface Animation {
  id: string;
  name: string;
  targetComponentId: string;
  type: AnimationType;
  easing: AnimationEasing;
  duration: number;
  delay: number;
  repeat: number;
  property: string;
  startValue: number;
  endValue: number;
}

// LVGL Component Types

export interface StyleProps {
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  textColor?: string;
  opacity?: number;
  padding?: number;
  // Shadow
  shadowColor?: string;
  shadowWidth?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowSpread?: number;
  shadowOpacity?: number;
  // Transform
  transformAngle?: number;
  transformZoomX?: number;
  transformZoomY?: number;
  transformPivotX?: number;
  transformPivotY?: number;
  // Scrollbar
  scrollbarMode?: 'off' | 'on' | 'active' | 'auto';
  scrollbarWidth?: number;
  scrollbarColor?: string;
  // Text / Font
  textFont?: string;
  textFontSize?: number;
  textLetterSpace?: number;
  textLineSpace?: number;
  // Four-direction padding
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  // Four-corner border radius
  borderRadiusTopLeft?: number;
  borderRadiusTopRight?: number;
  borderRadiusBottomLeft?: number;
  borderRadiusBottomRight?: number;
  // Border side
  borderSide?: 'full' | 'top' | 'bottom' | 'left' | 'right' | 'top_bottom' | 'left_right' | 'none';
  // Background gradient
  bgGradColor?: string;
  bgGradDir?: 'none' | 'hor' | 'ver';
  bgGradStop?: number; // 0-255
  // Outline
  outlineColor?: string;
  outlineWidth?: number;
  outlinePad?: number;
  // Text decoration
  textDecor?: 'none' | 'underline' | 'strikethrough';
  // Blend mode
  blendMode?: 'normal' | 'additive' | 'subtractive' | 'multiply';
}

// LVGL Event Types
export type LvglEventType = 
  | 'LV_EVENT_CLICKED'
  | 'LV_EVENT_PRESSED'
  | 'LV_EVENT_RELEASED'
  | 'LV_EVENT_LONG_PRESSED'
  | 'LV_EVENT_VALUE_CHANGED'
  | 'LV_EVENT_FOCUSED'
  | 'LV_EVENT_DEFOCUSED'
  | 'LV_EVENT_READY'
  | 'LV_EVENT_CANCEL';

// Built-in Action Types
export type BuiltinActionType =
  | 'navigate'
  | 'setProperty'
  | 'show'
  | 'hide'
  | 'enable'
  | 'disable'
  | 'setText'
  | 'setValue'
  | 'setLanguage';

/**
 * `BuiltinAction.language` value meaning "advance to the next project language,
 * wrapping at the end" — the one-button toggle a demo or a settings screen wants
 * without naming every language.
 *
 * Deliberately not a valid language code: a real one reaches
 * `lv_translation_set_language()` verbatim.
 */
export const NEXT_LANGUAGE = '__next__';

// Built-in Action Configuration
export interface BuiltinAction {
  type: BuiltinActionType;
  targetScreen?: string;    // For navigate
  /** @deprecated Pre-rename spelling of `targetScreen`; still read from older projects. */
  targetPage?: string;
  targetComponent?: string; // For setProperty, show, hide, enable, disable, setText, setValue
  property?: string;        // For setProperty
  value?: string | number | boolean;  // For setProperty, setText, setValue
  /** For setLanguage: a ProjectLanguage code, or `NEXT_LANGUAGE` to cycle. */
  language?: string;
}

// Event Binding (Phase 3 - Enhanced)
export interface EventBinding {
  id: string;
  eventType: LvglEventType;
  handlerType: 'builtin' | 'custom' | 'logic';
  // For builtin actions
  action?: BuiltinAction;
  // For custom C code
  customCode?: string;
  // For 'logic': graphs whose event entry this event fires, in list order.
  // The component owns the wiring; the graph stays a reusable named action.
  logicGraphIds?: string[];
}

// Screen Definition (Phase 3 - Multi-screen support)
export interface Screen {
  id: string;
  name: string;
  components: LvglComponent[];
  backgroundColor?: string;
  /** Owning ScreenGroup, or null/undefined when the screen sits at the root. */
  groupId?: string | null;
  /**
   * Marks the project's entry screen — the one the generated firmware boots
   * into. At most one screen carries the flag; when none does (projects saved
   * before it existed), the first screen is the entry. Resolve through
   * getEntryScreen() rather than reading the flag directly.
   */
  isEntry?: boolean;
}

/**
 * Organisational folder in the screen manager. Purely a UI grouping — it has no
 * effect on generated code.
 *
 * Nesting is capped at two levels: a group with `parentId == null` is level 1,
 * a group pointing at one of those is level 2, and level 2 groups cannot take
 * children of their own.
 */
export interface ScreenGroup {
  id: string;
  name: string;
  parentId?: string | null;
}

/** Deepest group level the manager allows (1-based). */
export const MAX_SCREEN_GROUP_DEPTH = 2;

/**
 * A named bundle of text style, shared by every widget that uses it.
 *
 * LVGL has no such noun, but it has the mechanism: each of these becomes one
 * generated `static lv_style_t` applied with `lv_obj_add_style()`. Grouping the
 * settings also collapses the two paths a widget could previously set a font
 * through — see docs/text-typography-evaluation.md §5.
 */
export interface Typography {
  id: string;
  /**
   * The identifier, shown in the editor as "Typography Id" — e.g. "Size24".
   * It is what the generated C symbol is derived from (`ui_style_size24`), so
   * it names the style rather than merely describing it.
   */
  name: string;
  /** Owning TypographyGroup, or null/undefined at the root of the tree. */
  groupId?: string | null;

  // The Default settings. A language without its own entry in `languages`
  // renders with exactly these — that is the whole meaning of Default.

  /** `montserrat_N` for a built-in, or a FontResource's cFontName. */
  fontResource: string;
  /** Pixel size. Fixed by the name for built-in fonts. */
  fontSize: number;
  letterSpace?: number;
  lineSpace?: number;
  align?: TypographyAlign;
  decor?: 'none' | 'underline' | 'strikethrough';
  /**
   * Writing direction. Needs `LV_USE_BIDI` in lv_conf.h to have any effect —
   * see docs/text-typography-evaluation.md §6.
   */
  baseDir?: 'auto' | 'ltr' | 'rtl';

  /**
   * Per-language overrides, keyed by language code — TouchGFX's "Language
   * Settings". Each holds only what that language changes; everything else
   * comes from the Default above, which is why a project can set a CJK face
   * for 繁體 without restating spacing or alignment.
   */
  languages?: Record<string, TypographyLanguageStyle>;
  /**
   * @deprecated Pre-`languages` shape, which could only override the font.
   * Read on load and folded into `languages`; never written.
   */
  languageFonts?: Record<string, TypographyLanguageFont>;

  /**
   * Character drawn in place of one the font does not carry.
   *
   * LVGL has no such setting; what it has is the `lv_font_t.fallback` chain,
   * so generated code honours this by appending a substitute font whose
   * `get_glyph_dsc` answers every letter with this one. Only meaningful
   * because wildcards exist: text derived from the project is always covered
   * by the character set, so the only glyphs that can be missing are the ones
   * runtime values substitute in. See docs/text-typography-evaluation.md §7.1.
   */
  fallbackCharacter?: string;

  /**
   * Characters runtime-substituted values may need, beyond the project's own
   * text — TouchGFX's Wildcard Characters. Literal characters. These are the
   * Default's declaration: each language resolves its own through the same
   * inheritance as the style fields, so a language without a declaration of
   * its own carries this one into whatever font it resolves to.
   */
  wildcardCharacters?: string;
  /**
   * Ranges of such characters — TouchGFX's Wildcard Ranges. Comma-separated;
   * each side of a range is a single literal character or `0x` hex, so `0-9`
   * means the digits and `0x4E00-0x9FFF` means the block. Parsed by
   * `parseWildcardRanges`, which also documents why decimal is not accepted.
   */
  wildcardRanges?: string;
}

/**
 * What one language changes about a typography.
 *
 * Every field is optional and every omission means "as the Default". Storing
 * the difference rather than a complete copy is what makes editing the Default
 * reach the languages that did not override it.
 */
export interface TypographyLanguageStyle {
  /** `montserrat_N` for a built-in, or a FontResource's cFontName. */
  fontResource?: string;
  fontSize?: number;
  letterSpace?: number;
  lineSpace?: number;
  align?: TypographyAlign;
  decor?: 'none' | 'underline' | 'strikethrough';
  baseDir?: 'auto' | 'ltr' | 'rtl';
  /**
   * Wildcards and the fallback character override per language too —
   * TouchGFX's shape, where each language tab declares its own. A language
   * that declares nothing inherits the Default's declaration, applied to
   * whatever font that language resolves to.
   */
  fallbackCharacter?: string;
  wildcardCharacters?: string;
  wildcardRanges?: string;
}

/**
 * Organisational folder in the typography tree. Purely a UI grouping — it has
 * no effect on generated code, exactly as ScreenGroup does for screens.
 *
 * Nesting is capped at two levels for the same reason it is there: a tree deep
 * enough to hide things is worse than a list.
 */
export interface TypographyGroup {
  id: string;
  name: string;
  parentId?: string | null;
}

/** Deepest typography group level the manager allows (1-based). */
export const MAX_TYPOGRAPHY_GROUP_DEPTH = 2;

/** One language's font choice inside a typography. */
export interface TypographyLanguageFont {
  /** `montserrat_N` for a built-in, or a FontResource's cFontName. */
  fontResource: string;
  fontSize: number;
}

/** `auto` resolves against the base direction, which is what RTL text needs. */
export type TypographyAlign = 'auto' | 'left' | 'center' | 'right';

/**
 * One language a project's text is written in.
 *
 * `code` is what reaches `lv_translation_set_language()` at runtime, so it has
 * to be stable once anything ships; `name` is only ever shown in the editor.
 */
export interface ProjectLanguage {
  code: string;
  name: string;
}

/** Props whose words a text resource can stand in for. */
export type TranslatableProp = 'text' | 'placeholder' | 'title' | 'options';

/**
 * A piece of user-visible text, held once and referred to by widgets.
 *
 * This is the indirection that makes a language switch possible: a widget
 * stores the id, not the words. Generated code registers these with LVGL's
 * translation module and tags each label with its key.
 *
 * See docs/text-typography-evaluation.md §3.
 */
export interface TextResource {
  id: string;
  /**
   * The tag generated code uses, e.g. `boxEnglish`. Unique within a project
   * **case-insensitively** — `newText` and `newtext` are one key, not two —
   * and stable, since renaming it changes the generated C.
   */
  key: string;
  /** Translation per language code. A missing entry falls back to the first language. */
  values: Record<string, string>;
  /**
   * Typography every widget bound to this text renders with, TouchGFX's
   * TypedText → Typography pairing. Set here it wins over the widget's own,
   * so the words and the style that suits them travel together.
   */
  typographyId?: string;
  /** Tree folder in the Texts panel. Organisational only, like screens'. */
  groupId?: string | null;
}

/**
 * Organisational folder in the texts tree — TouchGFX's text groups. Purely a
 * UI grouping with no effect on generated code, the same shape and the same
 * two-level cap as screen and typography groups, for the same reason: a tree
 * deep enough to hide things is worse than a list.
 */
export interface TextGroup {
  id: string;
  name: string;
  parentId?: string | null;
}

/** Deepest text group level the manager allows (1-based). */
export const MAX_TEXT_GROUP_DEPTH = 2;

/**
 * Two text keys are the same key when they differ only in case.
 *
 * `lv_translation_get` matches with `lv_streq` and would treat them as
 * distinct, but nothing else would: the two are indistinguishable in the table,
 * and `keyFromText` lowercases, so linking a widget showing "newText" derives
 * `newtext` and quietly sits next to a hand-written `newText`.
 */
export function sameTextKey(a: string, b: string): boolean {
  return a.toLocaleUpperCase() === b.toLocaleUpperCase();
}

export type LvglAlign = 'default' | 'center' | 'top_left' | 'top_mid' | 'top_right' | 'bottom_left' | 'bottom_mid' | 'bottom_right' | 'left_mid' | 'right_mid';

export interface LvglFlags {
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
  disabled?: boolean;
}

/**
 * One ordered visual/value state of an image button.
 *
 * `imageId` references an ImageResource from the project's Resource Manager.
 * `value` is a uint16 exposed through the widget's `value` property and can
 * be mapped to a Modbus Holding Register.
 */
export interface ImageButtonState {
  id: string;
  name: string;
  imageId: string;
  value: number;
}

/**
 * Canonical props used by the editor, preview, and downstream code generation
 * for the `image-button` component.
 */
export interface ImageButtonProps {
  states: ImageButtonState[];
  /** Zero-based state selected when a preview/runtime session starts. */
  initialState: number;
  /** Zero-based state displayed on the design canvas. */
  currentState: number;
  /** Numeric value of the authoring `currentState`. */
  value: number;
  /** Advance to the next ordered state when clicked in the preview/runtime. */
  cycleOnClick: boolean;
}

export interface LvglComponent {
  id: string;
  type: string; // 'btn', 'label', etc.
  name: string; // User-editable name
  x: number;
  y: number;
  width: number;
  height: number;
  children: LvglComponent[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>; // Component-specific properties
  styles: {
    default: StyleProps;
    pressed?: StyleProps;
    focused?: StyleProps;
    disabled?: StyleProps;
  };
  events: EventBinding[];
  animations: Animation[];
  parentId: string | null;
  // Phase 2: Lock and visibility
  locked: boolean;
  visible: boolean;
  // Size mode
  widthMode?: 'px' | 'percent' | 'content';
  heightMode?: 'px' | 'percent' | 'content';
  // Alignment
  align?: LvglAlign;
  alignOffsetX?: number;
  alignOffsetY?: number;
  /**
   * The typography this widget's resting text style comes from.
   *
   * Absent means it inherits the screen's default font, which is what an
   * unstyled widget has always done. Populated for existing projects by
   * migration — see `deriveTypographies`.
   */
  typographyId?: string;
  /**
   * The text resource this widget displays, when its text is translatable.
   *
   * Absent means the literal in `props.text` is used directly, which is what
   * every widget did before text resources existed. Populated by migration.
   */
  textId?: string;
  /**
   * Which prop `textId` stands in for. Recorded rather than inferred: a
   * textarea whose placeholder is shared must not have the resource rebind to
   * its typed content the moment that content stops being empty. Absent on
   * data written before this existed — readers fall back to the first
   * non-empty translatable prop, which is what the derivation would have seen.
   *
   * `options` is the whole list as one newline-joined value — the exact shape
   * `lv_dropdown_set_options` takes — so the count and order of options are
   * shared across languages and only the words differ.
   */
  textProp?: TranslatableProp;
  // Flags
  flags?: LvglFlags;
  // Optional no-code Modbus data synchronization/write behavior
  modbusBinding?: ModbusBinding;
}

// Component Category Definition
export interface ComponentCategory {
  id: string;
  name: string;
  icon: string;
  collapsed: boolean;
}

// Component Definition (for palette)
export interface ComponentDefinition {
  type: string;
  name: string;
  icon: string;
  category: string;
  defaultWidth: number;
  defaultHeight: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultProps: Record<string, any>;
  defaultStyles: LvglComponent['styles'];
  isContainer: boolean;
}

// Canvas State
export interface CanvasState {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
}

// Selection State
export interface SelectionState {
  selectedIds: string[];
  hoveredId: string | null;
}

// History State for Undo/Redo
export interface HistoryEntry {
  components?: LvglComponent[]; // Legacy support
  screens?: Screen[]; // Multi-screen support
  screenGroups?: ScreenGroup[];
  /** Tab state is part of the snapshot so undoing an add/delete restores the tabs too. */
  openScreenIds?: string[];
  currentScreenId?: string;
  timestamp: number;
}

// Drag State
export interface DragState {
  isDragging: boolean;
  dragType: 'new' | 'move' | 'resize' | null;
  draggedComponentType: string | null;
  draggedComponentId: string | null;
  resizeHandle: ResizeHandle | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export type ResizeHandle = 
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

// Alignment Guide
export interface AlignmentGuide {
  type: 'vertical' | 'horizontal';
  position: number;
  start: number;
  end: number;
}

// Phase 2: Clipboard
export interface ClipboardData {
  components: LvglComponent[];
  type: 'copy' | 'cut';
}

// Phase 2: Style Clipboard
export interface StyleClipboard {
  styles: LvglComponent['styles'];
}

// Phase 2: Box Selection
export interface BoxSelection {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// Phase 2: Context Menu
export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetId: string | null; // null means canvas context menu
}
