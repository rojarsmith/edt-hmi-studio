import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources/resourceStore';
import { BUILTIN_FONTS } from '../../resources/builtinFonts';
import { useAppStore } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import type {
  ImageButtonState,
  LvglComponent,
  StyleProps,
  LvglAlign,
  LvglFlags,
  LvglPart,
  LvglStyleState,
} from '../../types';
import {
  hasStyleParts,
  isArcPart,
  partStyle,
  widgetParts,
  withPartStyle,
  withoutPartStyle,
} from '../../utils/widgetParts';
import type { ModbusRegisterTag } from '../../types/hmi';
import { DEFAULT_BOARD_ID, SUPPORTED_BOARDS, getBoardVideo } from '../../types/hmi';
import { getComponentDefinition } from '../../utils/componentDefinitions';
import { resolveText } from '../../codegen/textResources';
import { effectiveTypographyId, standInProp } from '../../utils/componentText';
import { getEntryScreen } from '../../utils/entryScreen';
import { commitComponentId, sanitizeComponentId } from '../../utils/componentId';
import { glyphCoverageGaps } from '../../utils/glyphCoverage';
import {
  DEFAULT_LINE_WIDTH,
  MIN_LINE_LENGTH,
  lineLength,
  lineOrientation,
  normalizeLinePoints,
  orientedLinePoints,
} from '../../utils/lineGeometry';
import {
  MIN_POLYGON_POINTS,
  isConvexPolygon,
  normalizePolygonPoints,
} from '../../utils/polygonGeometry';
import type { CircleShape } from '../../utils/circleGeometry';
import {
  DEFAULT_END_ANGLE,
  DEFAULT_START_ANGLE,
} from '../../utils/circleGeometry';
import ModbusBindingEditor from './ModbusBindingEditor';
import { videoPlaylistWarnings } from './videoModel';
import { normalizeCardPath, normalizeVideoProps } from '../../utils/videoPlaylist';
import {
  QRCODE_ECC_LEVELS,
  QRCODE_VERSION_AUTO,
  QRCODE_VERSION_MAX,
  QRCODE_SCALE_MIN,
  QRCODE_SCALE_MAX,
  encodeQrcode,
  normalizeQrcodeProps,
  planQrcode,
  qrcodePixelSize,
  resolveQrcodeContent,
} from '../../utils/qrcodeModel';
import {
  clampImageButtonStateIndex,
  createImageButtonState,
  normalizeImageButtonProps,
  normalizeImageButtonStateValue,
} from './imageButtonModel';
import PanelChevron from '../LogicEditor/PanelChevron';
import EventPanel from '../EventPanel';
import AnimationProperties from './AnimationProperties';
import NumberField from '../common/NumberField';
import './PropertyEditor.css';

// Inline CollapsibleSection component
const CollapsibleSection: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible-section">
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <PanelChevron open={open} className="collapsible-chevron" />
        <span>{title}</span>
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
};

// Align grid constants
const ALIGN_OPTIONS: { value: LvglAlign; label: string; row: number; col: number }[] = [
  { value: 'top_left', label: '↖', row: 0, col: 0 },
  { value: 'top_mid', label: '↑', row: 0, col: 1 },
  { value: 'top_right', label: '↗', row: 0, col: 2 },
  { value: 'left_mid', label: '←', row: 1, col: 0 },
  { value: 'center', label: '·', row: 1, col: 1 },
  { value: 'right_mid', label: '→', row: 1, col: 2 },
  { value: 'bottom_left', label: '↙', row: 2, col: 0 },
  { value: 'bottom_mid', label: '↓', row: 2, col: 1 },
  { value: 'bottom_right', label: '↘', row: 2, col: 2 },
];


// Grid template visualization: parse "1fr 2fr 1fr" into proportional bars
function GridTemplatePreview({ value }: { value: string }) {
  const parts = (value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const nums = parts.map(p => {
    const n = parseFloat(p);
    return isNaN(n) || n <= 0 ? 1 : n;
  });
  return (
    <div className="grid-template-preview">
      {nums.map((n, i) => (
        <div
          key={i}
          className="grid-template-bar"
          style={{ flex: n }}
          title={parts[i]}
        >
          <span className="grid-template-bar-label">{parts[i]}</span>
        </div>
      ))}
    </div>
  );
}

// Style section visibility per component type (Task 2)
const STYLE_SECTION_VISIBILITY: Record<string, Set<string>> = {
  shadow: new Set(['btn', 'image-button', 'rectangle', 'obj', 'tabview', 'tileview', 'win', 'textarea', 'dropdown', 'table', 'chart', 'calendar', 'bar', 'arc']),
  transform: new Set(['btn', 'label', 'img', 'image-button', 'rectangle', 'obj', 'tabview', 'tileview', 'win', 'textarea', 'dropdown', 'checkbox', 'switch', 'slider', 'bar', 'arc', 'spinner', 'chart', 'table', 'calendar']),
  gradient: new Set(['btn', 'rectangle', 'obj', 'tabview', 'tileview', 'win', 'textarea', 'dropdown', 'bar', 'slider']),
  outline: new Set(['btn', 'image-button', 'rectangle', 'obj', 'tabview', 'tileview', 'win', 'textarea', 'dropdown', 'checkbox', 'switch', 'slider', 'bar', 'arc', 'table', 'chart', 'calendar']),
  scrollbar: new Set(['obj', 'tabview', 'tileview', 'win', 'textarea']),
  textStyle: new Set(['btn', 'label', 'textarea', 'dropdown', 'checkbox', 'table', 'calendar']),
  blendMode: new Set(['btn', 'label', 'img', 'image-button', 'rectangle', 'obj', 'chart']),
};

// Flags that only apply to container-like components
const SCROLL_FLAGS = new Set(['scrollable', 'scrollElastic', 'scrollMomentum', 'scrollOnFocus']);
const CONTAINER_TYPES = new Set(['obj', 'tabview', 'tileview', 'win']);

// Helper to check if a style section should be visible for a component type
function isSectionVisible(section: string, componentType: string): boolean {
  const allowed = STYLE_SECTION_VISIBILITY[section];
  return !allowed || allowed.has(componentType);
}

/** One edit to an options list, named rather than diffed out of the result. */
type OptionsOperation =
  | { kind: 'edit'; index: number; value: string }
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'delete'; index: number }
  | { kind: 'add' };

/** Apply an operation to one language's lines. */
function applyOptionsOperation(lines: string[], op: OptionsOperation): string[] {
  switch (op.kind) {
    case 'edit': {
      const next = [...lines];
      next[op.index] = op.value;
      return next;
    }
    case 'swap': {
      const next = [...lines];
      [next[op.a], next[op.b]] = [next[op.b], next[op.a]];
      return next;
    }
    case 'delete':
      return lines.filter((_, i) => i !== op.index);
    case 'add':
      return [...lines, `Option ${lines.length + 1}`];
  }
}

// Dropdown options list editor (Task 3)
const DropdownOptionsEditor: React.FC<{
  options: string[];
  onChange: (options: string[]) => void;
  /**
   * When set, edits are reported as named operations instead of result lists.
   * A shared options resource needs the operation: replaying it per language
   * is exact, where diffing the result list misidentifies a reorder as soon as
   * two options hold the same words.
   */
  onOperation?: (op: OptionsOperation) => void;
}> = ({ options, onChange, onOperation }) => {
  const apply = (op: OptionsOperation) => {
    if (onOperation) onOperation(op);
    else onChange(applyOptionsOperation(options, op));
  };

  const handleTextChange = (index: number, value: string) => apply({ kind: 'edit', index, value });

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    apply({ kind: 'swap', a: index - 1, b: index });
  };

  const handleMoveDown = (index: number) => {
    if (index >= options.length - 1) return;
    apply({ kind: 'swap', a: index, b: index + 1 });
  };

  const handleDelete = (index: number) => {
    if (options.length <= 1) return;
    apply({ kind: 'delete', index });
  };

  const handleAdd = () => apply({ kind: 'add' });

  return (
    <div className="dropdown-options-editor">
      {options.map((opt, i) => (
        <div key={i} className="dropdown-option-row">
          <span className="dropdown-option-index">{i + 1}</span>
          <input
            type="text"
            className="dropdown-option-input"
            value={opt}
            onChange={(e) => handleTextChange(i, e.target.value)}
          />
          <button
            className="dropdown-option-btn"
            onClick={() => handleMoveUp(i)}
            disabled={i === 0}
            title="Move Up"
          >↑</button>
          <button
            className="dropdown-option-btn"
            onClick={() => handleMoveDown(i)}
            disabled={i === options.length - 1}
            title="Move Down"
          >↓</button>
          <button
            className="dropdown-option-btn delete"
            onClick={() => handleDelete(i)}
            disabled={options.length <= 1}
            title="Delete"
          >✕</button>
        </div>
      ))}
      <button className="dropdown-option-add" onClick={handleAdd}>+ Add Option</button>
    </div>
  );
};

// Toggle switch UI component (Task 4.3)
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  /** Shown but inert, with the reason in the tooltip. */
  disabled?: boolean;
  disabledReason?: string;
}> = ({ checked, onChange, label, disabled = false, disabledReason }) => (
  <div
    className={`toggle-switch-wrapper ${disabled ? 'disabled' : ''}`}
    title={disabled ? disabledReason : undefined}
    onClick={disabled ? undefined : () => onChange(!checked)}
  >
    {label && <span className="toggle-switch-label">{label}</span>}
    <div className={`toggle-switch ${checked ? 'on' : ''}`}>
      <div className="toggle-switch-knob" />
    </div>
  </div>
);

type StyleState = LvglStyleState;

const STYLE_STATES: { key: StyleState; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'pressed', label: 'Pressed' },
  { key: 'focused', label: 'Focused' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'checked', label: 'Checked' },
];

const PropertyEditor: React.FC = () => {
  const {
    selection,
    getComponentById,
    updateComponent,
    screens,
    currentScreenId,
    renameScreen,
    setEntryScreen,
    animations,
    selectedAnimationId,
  } = useEditorStore();
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const projectList = useProjectStore((state) => state.projects);
  const getProjectConfig = useProjectStore((state) => state.getProjectConfig);
  const [activeStyleState, setActiveStyleState] = useState<StyleState>('default');
  /** Which piece of the widget the Style rows are editing. See widgetParts. */
  const [activeStylePart, setActiveStylePart] = useState<LvglPart>('main');
  const [paddingLinked, setPaddingLinked] = useState(true);
  const [loadedCommunication, setLoadedCommunication] = useState<{
    projectId: string;
    enabled: boolean;
    tags: ModbusRegisterTag[];
  } | null>(null);
  const [radiusLinked, setRadiusLinked] = useState(true);
  const [panelExpanded, setPanelExpanded] = useState(true);
  // Collapsing the whole panel away is a factory-engineer affordance: the
  // properties of the selected component are the point of this column for
  // everyone else. Deriving the flag rather than storing it means a panel
  // collapsed in factory mode cannot stay stuck when the mode is left.
  const factoryDevMode = useAppStore((state) => state.factoryDevMode);
  const expanded = panelExpanded || !factoryDevMode;
  const [query, setQuery] = useState('');
  // Collapsed categories, keyed by header title so the state carries across
  // selection changes and re-renders of the hand-written sections.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const sectionsRef = useRef<HTMLDivElement>(null);

  // One delegated handler folds any plain category from its header — the
  // same gesture as the hierarchy tree's members. Sections with their own
  // header behaviour (Events, Modbus) manage themselves, and the pinned
  // Id/Type block has nothing worth hiding.
  const handleSectionsClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const header = target.closest('.section-header');
    if (!header || !sectionsRef.current?.contains(header)) return;
    if (header.closest('.pe-events-section') || header.closest('.modbus-binding-section')) return;
    if (header.closest('[data-pe-pinned]')) return;
    if (target.closest('button, input, select, label')) return;
    const title = header.textContent?.trim();
    if (!title) return;
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  // Text-driven property search. A section after the pinned Component block
  // stays visible when its title, one of its collapsible subsections'
  // titles, or any field label matches. Filtering walks the rendered DOM on
  // every render — deliberately without a dependency list, so sections that
  // come and go with the selection are re-filtered too; the walk is tiny.
  useEffect(() => {
    const root = sectionsRef.current;
    if (!root) return;

    // Fold collapsed categories: everything but the header hides. Applied on
    // every render for the same reason as the search filter below.
    root.querySelectorAll<HTMLElement>('.property-section').forEach(section => {
      if (section.classList.contains('pe-events-section') || section.classList.contains('modbus-binding-section')) return;
      if (section.hasAttribute('data-pe-pinned')) return;
      const title = section.querySelector('.section-header')?.textContent?.trim();
      section.classList.toggle('pe-collapsed', !!title && collapsedSections.has(title));
    });

    const q = query.trim().toLowerCase();
    const matches = (text: string | null | undefined) =>
      !!text && text.toLowerCase().includes(q);
    root
      .querySelectorAll<HTMLElement>('.property-section:not([data-pe-pinned])')
      .forEach(section => {
        const titleMatch = !q || matches(section.querySelector('.section-header')?.textContent);
        let anyChildVisible = false;
        section.querySelectorAll<HTMLElement>('.collapsible-section').forEach(sub => {
          const subMatch =
            !q ||
            titleMatch ||
            matches(sub.querySelector('.collapsible-header')?.textContent) ||
            [...sub.querySelectorAll('label')].some(l => matches(l.textContent));
          sub.classList.toggle('pe-filtered-out', !subMatch);
          if (subMatch) anyChildVisible = true;
        });
        const directLabelMatch = [...section.querySelectorAll('label')]
          .filter(l => !l.closest('.collapsible-section'))
          .some(l => matches(l.textContent));
        section.classList.toggle(
          'pe-filtered-out',
          !(titleMatch || directLabelMatch || anyChildVisible),
        );
      });
  });

  const selectedId = selection.selectedIds[0];
  const component = selectedId ? getComponentById(selectedId) : undefined;
  const definition = component ? getComponentDefinition(component.type) : undefined;
  const listedProjectConfig = useMemo(
    () => projectList.find((item) => item.config.id === currentProjectId)?.config,
    [currentProjectId, projectList],
  );
  const modbusTags = listedProjectConfig?.communication.tags
    ?? (
      loadedCommunication?.projectId === currentProjectId
        ? loadedCommunication.tags
        : []
    );
  const communicationEnabled = listedProjectConfig?.communication.enabled
    ?? (
      loadedCommunication?.projectId === currentProjectId
        ? loadedCommunication.enabled
        : false
    );

  useEffect(() => {
    let cancelled = false;
    if (!currentProjectId || listedProjectConfig) return;
    getProjectConfig(currentProjectId).then((config) => {
      if (!cancelled && config) {
        setLoadedCommunication({
          projectId: currentProjectId,
          enabled: config.communication.enabled,
          tags: config.communication.tags.map((tag) => ({ ...tag })),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, getProjectConfig, listedProjectConfig]);

  // Look up parent component for flex/grid child properties
  const parentComponent = useMemo(() => {
    if (!component || !component.parentId) return undefined;
    return getComponentById(component.parentId);
  }, [component, getComponentById]);

  const parentLayout = parentComponent?.props?.layout as string | undefined;

  // The parts this widget can be styled in, and the one being edited. A widget
  // with a single part is always on it, even if a previous selection left the
  // switcher pointing somewhere else.
  const styleParts = useMemo(
    () => (component ? widgetParts(component.type) : []),
    [component],
  );
  const stylePart: LvglPart =
    styleParts.some(entry => entry.part === activeStylePart) ? activeStylePart : 'main';

  // Get the current style object for the active part and state. Only the main
  // part falls back to its default: a part that says nothing is inheriting
  // from the theme, and showing the widget's own colours in its rows would
  // claim otherwise.
  const currentStyles: StyleProps = component
    ? (stylePart === 'main'
        ? (component.styles[activeStyleState] || component.styles.default)
        : (partStyle(component.styles, stylePart, activeStyleState) ?? {}))
    : {};

  // Whether the active part and state has its own overrides
  const hasStateOverride = component
    ? !!partStyle(component.styles, stylePart, activeStyleState)
    : false;
  // Which shared Style rows the widget can actually act on. A line draws no box
  // at all; an circle's disc has a fill and a border but its radius is the
  // shape itself, and its sector is an arc, which has only a colour. An arc's
  // own parts are arcs too, and take a colour and a thickness — Background
  // Color and Border Width, read as `arc_color` and `arc_width`. Offering a
  // control that changes nothing on the panel is the thing to avoid.
  const styleRow = (row: 'fill' | 'border' | 'radius' | 'borderSide' | 'text' | 'padding') => {
    if (!component) return true;
    if (component.type === 'line') return false;
    if (component.type === 'circle') {
      if (component.props?.shape === 'sector') return row === 'fill';
      return row === 'fill' || row === 'border';
    }
    if (isArcPart(component.type, stylePart)) {
      return row === 'fill' || row === 'border';
    }
    return true;
  };

  const handlePropertyChange = useCallback(
    (property: keyof LvglComponent, value: LvglComponent[keyof LvglComponent]) => {
      if (!selectedId) return;
      updateComponent(selectedId, { [property]: value });
    },
    [selectedId, updateComponent]
  );

  const handleStyleChange = useCallback(
    (styleKey: keyof StyleProps, value: StyleProps[keyof StyleProps]) => {
      if (!selectedId || !component) return;
      updateComponent(selectedId, {
        styles: withPartStyle(component.styles, stylePart, activeStyleState, {
          [styleKey]: value,
        }),
      });
    },
    [selectedId, component, updateComponent, stylePart, activeStyleState]
  );

  const handleClearStateOverride = useCallback(() => {
    if (!selectedId || !component) return;
    if (stylePart === 'main' && activeStyleState === 'default') return;
    updateComponent(selectedId, {
      styles: withoutPartStyle(component.styles, stylePart, activeStyleState),
    });
  }, [selectedId, component, updateComponent, stylePart, activeStyleState]);

  const handlePropsChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (propKey: string, value: any) => {
      if (!selectedId || !component) return;
      updateComponent(selectedId, {
        props: {
          ...component.props,
          [propKey]: value,
        },
      });
    },
    [selectedId, component, updateComponent]
  );

  const handleBatchPropsChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updates: Record<string, any>) => {
      if (!selectedId || !component) return;
      updateComponent(selectedId, {
        props: {
          ...component.props,
          ...updates,
        },
      });
    },
    [selectedId, component, updateComponent]
  );

  // The hierarchy panel's member controls, applied to categories: fold or
  // open every plain section at once. Titles are read off the DOM at click
  // time so the buttons stay correct for whatever sections the current
  // component renders.
  const collapseAllSections = () => {
    const root = sectionsRef.current;
    if (!root) return;
    const titles = [...root.querySelectorAll('.property-section')]
      .filter(
        s =>
          !s.classList.contains('pe-events-section') &&
          !s.classList.contains('modbus-binding-section') &&
          !s.hasAttribute('data-pe-pinned'),
      )
      .map(s => s.querySelector('.section-header')?.textContent?.trim())
      .filter((t): t is string => !!t);
    setCollapsedSections(new Set(titles));
  };

  const expandAllSections = () => setCollapsedSections(new Set());

  const searchBox = (
    <div className="pe-search">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search properties..."
        aria-label="Search properties"
      />
    </div>
  );

  const panelHeader = (
    <div
      className={`pe-header ${factoryDevMode ? 'pe-header-collapsible' : ''}`}
      onClick={factoryDevMode ? () => setPanelExpanded(prev => !prev) : undefined}
      title={factoryDevMode ? (expanded ? 'Collapse' : 'Expand') : undefined}
    >
      {factoryDevMode && <PanelChevron open={expanded} className="pe-toggle" />}
      <span className="pe-title">Properties</span>
      <div className="pe-header-actions" onClick={e => e.stopPropagation()}>
        <button className="pe-header-btn" onClick={expandAllSections} title="Expand all">
          ⊞
        </button>
        <button className="pe-header-btn" onClick={collapseAllSections} title="Collapse all">
          ⊟
        </button>
      </div>
    </div>
  );

  // The panel shows one thing at a time, and the animation manager points it
  // here rather than opening a dialog of its own.
  const selectedAnimation = selectedAnimationId
    ? animations.find(a => a.id === selectedAnimationId)
    : undefined;

  if (selectedAnimation) {
    return (
      <div className={`property-editor ${expanded ? '' : 'collapsed'}`}>
        {panelHeader}
        {expanded && (
          <div className="property-sections" ref={sectionsRef} onClick={handleSectionsClick}>
            <AnimationProperties animation={selectedAnimation} searchBox={searchBox} />
          </div>
        )}
      </div>
    );
  }

  if (!component) {
    const currentScreen = screens.find(s => s.id === currentScreenId);
    if (!currentScreen) {
      return (
        <div className={`property-editor ${expanded ? '' : 'collapsed'}`}>
          {panelHeader}
          {expanded && (
            <div className="no-selection">
              <p>No component selected</p>
              <p className="hint">Select a component on the canvas to edit it</p>
            </div>
          )}
        </div>
      );
    }

    // With nothing selected the panel edits the current screen itself.
    const isEntry = getEntryScreen(screens)?.id === currentScreen.id;
    // Commits on blur/Enter so a rename lands on the undo stack once, not per
    // keystroke; anything blank rolls back to the current name.
    const commitScreenName = (input: HTMLInputElement) => {
      // A screen's id becomes a C variable too, so it follows the same
      // no-whitespace rule a component's does.
      const name = sanitizeComponentId(input.value);
      if (name && name !== currentScreen.name) renameScreen(currentScreen.id, name);
      else input.value = currentScreen.name;
    };

    return (
      <div className={`property-editor ${expanded ? '' : 'collapsed'}`}>
        {panelHeader}

        {expanded && (
        <div className="property-sections" ref={sectionsRef} onClick={handleSectionsClick}>
          {/* Screen Info — pinned above the search box, never filtered or folded */}
          <div className="property-section" data-pe-pinned="true">
            <div className="section-header">Screen</div>
            <div className="property-row">
              <label>Id</label>
              {/* Uncontrolled while editing; the key remounts it when the
                  name changes elsewhere (e.g. a manager rename). */}
              <input
                key={`${currentScreen.id}:${currentScreen.name}`}
                type="text"
                defaultValue={currentScreen.name}
                onBlur={(e) => commitScreenName(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitScreenName(e.currentTarget);
                  else if (e.key === 'Escape') e.currentTarget.value = currentScreen.name;
                }}
              />
            </div>
            <div className="property-row">
              <label>Type</label>
              <div className="property-value readonly">
                <span className="component-type-icon">📄</span>
                Screen
              </div>
            </div>
          </div>

          {searchBox}

          <EventPanel screenId={currentScreen.id} />

          {/* General */}
          <div className="property-section">
            <div className="section-header">General</div>
            <div className="property-row">
              <label>Entry Screen</label>
              <input
                type="checkbox"
                checked={isEntry}
                disabled={isEntry}
                onChange={() => setEntryScreen(currentScreen.id)}
                title={
                  isEntry
                    ? 'This screen is shown first at startup. Mark another screen as entry to move it.'
                    : 'Show this screen first at startup'
                }
                aria-label="Entry Screen"
              />
            </div>
          </div>
        </div>
        )}
      </div>
    );
  }

  return (
    <div className={`property-editor ${expanded ? '' : 'collapsed'}`}>
      {panelHeader}

      {expanded && (
      <div className="property-sections" ref={sectionsRef} onClick={handleSectionsClick}>
        {/* Component Info — pinned above the search box, never filtered or folded */}
        <div className="property-section" data-pe-pinned="true">
          <div className="section-header">Component</div>
          <div className="property-row">
            <label>Id</label>
            <input
              type="text"
              value={component.name}
              // An id is an identifier, not a label: whitespace is taken out
              // as it is typed rather than left to surprise the C generator.
              // See utils/componentId.ts.
              onChange={(e) =>
                handlePropertyChange('name', commitComponentId(e.target.value, component.name))
              }
            />
          </div>
          <div className="property-row">
            <label>Type</label>
            <div className="property-value readonly">
              <span className="component-type-icon">{definition?.icon}</span>
              {definition?.typeName || definition?.name || component.type}
            </div>
          </div>
        </div>

        {searchBox}

        {/* Position */}
        <div className="property-section">
          <div className="section-header">Position</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>X</label>
              <NumberField
                value={component.x}
                aria-label="X"
                onChange={(x) => handlePropertyChange('x', x)}
              />
            </div>
            <div className="property-field">
              <label>Y</label>
              <NumberField
                value={component.y}
                aria-label="Y"
                onChange={(y) => handlePropertyChange('y', y)}
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div className="property-section">
          <div className="section-header">Size</div>
          {/* Width */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <label style={{ fontSize: 12, color: '#666', width: 32, flexShrink: 0 }}>Width</label>
              <div className="size-mode-switcher">
                {(['px', 'percent', 'content'] as const).map((m) => (
                  <button
                    key={m}
                    className={`size-mode-btn ${(component.widthMode || 'px') === m ? 'active' : ''}`}
                    onClick={() => handlePropertyChange('widthMode', m)}
                  >
                    {m === 'px' ? 'px' : m === 'percent' ? '%' : 'auto'}
                  </button>
                ))}
              </div>
            </div>
            {(component.widthMode || 'px') === 'content' ? (
              <div style={{ fontSize: 12, color: '#999', padding: '6px 8px', background: '#f5f5f5', borderRadius: 4 }}>Fit Content</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={component.width}
                  min={(component.widthMode || 'px') === 'percent' ? 1 : 10}
                  max={(component.widthMode || 'px') === 'percent' ? 100 : undefined}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || ((component.widthMode || 'px') === 'percent' ? 1 : 10);
                    const min = (component.widthMode || 'px') === 'percent' ? 1 : 10;
                    const max = (component.widthMode || 'px') === 'percent' ? 100 : Infinity;
                    handlePropertyChange('width', Math.min(max, Math.max(min, v)));
                  }}
                  style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
                />
                {(component.widthMode || 'px') === 'percent' && (
                  <span style={{ fontSize: 12, color: '#888' }}>%</span>
                )}
              </div>
            )}
          </div>
          {/* Height */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <label style={{ fontSize: 12, color: '#666', width: 32, flexShrink: 0 }}>Height</label>
              <div className="size-mode-switcher">
                {(['px', 'percent', 'content'] as const).map((m) => (
                  <button
                    key={m}
                    className={`size-mode-btn ${(component.heightMode || 'px') === m ? 'active' : ''}`}
                    onClick={() => handlePropertyChange('heightMode', m)}
                  >
                    {m === 'px' ? 'px' : m === 'percent' ? '%' : 'auto'}
                  </button>
                ))}
              </div>
            </div>
            {(component.heightMode || 'px') === 'content' ? (
              <div style={{ fontSize: 12, color: '#999', padding: '6px 8px', background: '#f5f5f5', borderRadius: 4 }}>Fit Content</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={component.height}
                  min={(component.heightMode || 'px') === 'percent' ? 1 : 10}
                  max={(component.heightMode || 'px') === 'percent' ? 100 : undefined}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || ((component.heightMode || 'px') === 'percent' ? 1 : 10);
                    const min = (component.heightMode || 'px') === 'percent' ? 1 : 10;
                    const max = (component.heightMode || 'px') === 'percent' ? 100 : Infinity;
                    handlePropertyChange('height', Math.min(max, Math.max(min, v)));
                  }}
                  style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
                />
                {(component.heightMode || 'px') === 'percent' && (
                  <span style={{ fontSize: 12, color: '#888' }}>%</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Alignment */}
        <div className="property-section">
          <div className="section-header">Alignment</div>
          <div className="align-grid">
            {ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`align-grid-btn ${(component.align || 'default') === opt.value ? 'active' : ''}`}
                style={{ gridRow: opt.row + 1, gridColumn: opt.col + 1 }}
                onClick={() => handlePropertyChange('align', opt.value)}
                title={opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="property-row" style={{ marginTop: 8 }}>
            <label>Alignment</label>
            <select
              value={component.align || 'default'}
              onChange={(e) => handlePropertyChange('align', e.target.value)}
              style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
            >
              <option value="default">Default</option>
              <option value="center">Center</option>
              <option value="top_left">Top Left</option>
              <option value="top_mid">Top Center</option>
              <option value="top_right">Top Right</option>
              <option value="left_mid">Center Left</option>
              <option value="right_mid">Center Right</option>
              <option value="bottom_left">Bottom Left</option>
              <option value="bottom_mid">Bottom Center</option>
              <option value="bottom_right">Bottom Right</option>
            </select>
          </div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>X Offset</label>
              <input
                type="number"
                value={component.alignOffsetX || 0}
                onChange={(e) => handlePropertyChange('alignOffsetX', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Y Offset</label>
              <input
                type="number"
                value={component.alignOffsetY || 0}
                onChange={(e) => handlePropertyChange('alignOffsetY', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        {/* Flags */}
        <div className="property-section">
          <div className="section-header">Flags</div>
          {renderFlagsSection(component, handlePropertyChange)}
        </div>

        {/* Styles */}
        <div className="property-section">
          <div className="section-header">Style</div>
          
          {/* Style state switcher */}
          {/* Part switcher, for the widgets LVGL draws in more than one piece */}
          {hasStyleParts(component.type) && (
            <div className="style-state-switcher style-part-switcher">
              {styleParts.map(({ part, label, hint, state }) => (
                <button
                  key={part}
                  className={`style-state-btn ${stylePart === part ? 'active' : ''} ${part !== 'main' && component.styles.parts?.[part] ? 'has-override' : ''}`}
                  title={hint}
                  onClick={() => {
                    setActiveStylePart(part);
                    // Straight to the state this part is actually drawn in, so
                    // colouring a switch's On lands where LVGL will read it.
                    setActiveStyleState(state ?? 'default');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="style-state-switcher">
            {STYLE_STATES.map(({ key, label }) => (
              <button
                key={key}
                className={`style-state-btn ${activeStyleState === key ? 'active' : ''} ${partStyle(component.styles, stylePart, key) && !(stylePart === 'main' && key === 'default') ? 'has-override' : ''}`}
                onClick={() => setActiveStyleState(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {!(stylePart === 'main' && activeStyleState === 'default') && (
            <div className="style-state-info">
              {hasStateOverride ? (
                <button className="clear-override-btn" onClick={handleClearStateOverride}>
                  Clear this {stylePart === 'main' ? 'state' : 'part'} style
                </button>
              ) : (
                <span className="inherit-hint">
                  {stylePart === 'main'
                    ? 'Inherits the default style. Editing creates an independent state style.'
                    : 'Left to the theme. Editing gives this part a style of its own.'}
                </span>
              )}
            </div>
          )}
          
          {styleRow('fill') && (
          <div className="property-row">
            <label>Background Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={currentStyles.bgColor || '#ffffff'}
                onChange={(e) => handleStyleChange('bgColor', e.target.value)}
              />
              <input
                type="text"
                value={currentStyles.bgColor || '#ffffff'}
                onChange={(e) => handleStyleChange('bgColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>
          )}

          {styleRow('border') && (
          <div className="property-row">
            <label>Border Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={currentStyles.borderColor || '#cccccc'}
                onChange={(e) => handleStyleChange('borderColor', e.target.value)}
              />
              <input
                type="text"
                value={currentStyles.borderColor || '#cccccc'}
                onChange={(e) => handleStyleChange('borderColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>
          )}

          {(styleRow('border') || styleRow('radius')) && (
          <div className="property-row two-col">
            {styleRow('border') && (
            <div className="property-field">
              <label>Border Width</label>
              <input
                type="number"
                value={currentStyles.borderWidth || 0}
                min={0}
                onChange={(e) => handleStyleChange('borderWidth', parseInt(e.target.value) || 0)}
              />
            </div>
            )}
            {styleRow('radius') && (
            <div className="property-field">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <label>Corner Radius</label>
                <button
                  className={`link-toggle-btn small ${radiusLinked ? 'linked' : ''}`}
                  onClick={() => {
                    if (radiusLinked) {
                      const v = currentStyles.borderRadius || 0;
                      handleStyleChange('borderRadiusTopLeft', v);
                      handleStyleChange('borderRadiusTopRight', v);
                      handleStyleChange('borderRadiusBottomLeft', v);
                      handleStyleChange('borderRadiusBottomRight', v);
                    } else {
                      handleStyleChange('borderRadius', currentStyles.borderRadiusTopLeft || 0);
                    }
                    setRadiusLinked(!radiusLinked);
                  }}
                  title={radiusLinked ? 'Set corners separately' : 'Set all corners together'}
                >{radiusLinked ? '🔗' : '🔓'}</button>
              </div>
              {radiusLinked && (
                <input
                  type="number"
                  value={currentStyles.borderRadius || 0}
                  min={0}
                  onChange={(e) => handleStyleChange('borderRadius', parseInt(e.target.value) || 0)}
                />
              )}
            </div>
            )}
          </div>
          )}
          {styleRow('radius') && !radiusLinked && (
            <div className="four-dir-grid">
              <div className="property-field">
                <label>Top Left</label>
                <input type="number" value={currentStyles.borderRadiusTopLeft || 0} min={0}
                  onChange={(e) => handleStyleChange('borderRadiusTopLeft', parseInt(e.target.value) || 0)} />
              </div>
              <div className="property-field">
                <label>Top Right</label>
                <input type="number" value={currentStyles.borderRadiusTopRight || 0} min={0}
                  onChange={(e) => handleStyleChange('borderRadiusTopRight', parseInt(e.target.value) || 0)} />
              </div>
              <div className="property-field">
                <label>Bottom Left</label>
                <input type="number" value={currentStyles.borderRadiusBottomLeft || 0} min={0}
                  onChange={(e) => handleStyleChange('borderRadiusBottomLeft', parseInt(e.target.value) || 0)} />
              </div>
              <div className="property-field">
                <label>Bottom Right</label>
                <input type="number" value={currentStyles.borderRadiusBottomRight || 0} min={0}
                  onChange={(e) => handleStyleChange('borderRadiusBottomRight', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          )}

          {/* Border side selector */}
          {styleRow('borderSide') && (
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <label style={{ width: 'auto' }}>Border Sides</label>
            <div className="border-side-group">
              {([
                ['full', 'All'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'],
                ['right', 'Right'], ['top_bottom', 'Top & Bottom'], ['left_right', 'Left & Right'], ['none', 'None'],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  className={`border-side-btn ${(currentStyles.borderSide || 'full') === val ? 'active' : ''}`}
                  onClick={() => handleStyleChange('borderSide', val)}
                >{lbl}</button>
              ))}
            </div>
          </div>
          )}

          <div className="property-row">
            <label>Opacity</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={currentStyles.opacity ?? 1}
              onChange={(e) => handleStyleChange('opacity', parseFloat(e.target.value))}
            />
            <span className="range-value">{((currentStyles.opacity ?? 1) * 100).toFixed(0)}%</span>
          </div>

          {styleRow('text') && (
          <div className="property-row">
            <label>Text Color</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={currentStyles.textColor || '#333333'}
                onChange={(e) => handleStyleChange('textColor', e.target.value)}
              />
              <input
                type="text"
                value={currentStyles.textColor || '#333333'}
                onChange={(e) => handleStyleChange('textColor', e.target.value)}
                className="color-text"
              />
            </div>
          </div>
          )}

          {styleRow('padding') && (<>
          <div className="property-row">
            <label>Padding</label>
            {paddingLinked ? (
              <input
                type="number"
                value={currentStyles.padding || 0}
                min={0}
                onChange={(e) => handleStyleChange('padding', parseInt(e.target.value) || 0)}
                style={{ flex: 1 }}
              />
            ) : <span style={{ flex: 1 }} />}
            <button
              className={`link-toggle-btn ${paddingLinked ? 'linked' : ''}`}
              onClick={() => {
                if (paddingLinked) {
                  const v = currentStyles.padding || 0;
                  handleStyleChange('paddingTop', v);
                  handleStyleChange('paddingBottom', v);
                  handleStyleChange('paddingLeft', v);
                  handleStyleChange('paddingRight', v);
                } else {
                  handleStyleChange('padding', currentStyles.paddingTop || 0);
                }
                setPaddingLinked(!paddingLinked);
              }}
              title={paddingLinked ? 'Set sides separately' : 'Set all sides together'}
            >{paddingLinked ? '🔗' : '🔓'}</button>
          </div>
          {!paddingLinked && (
            <div className="four-dir-grid">
              <div className="property-field">
                <label>Top</label>
                <input type="number" value={currentStyles.paddingTop || 0} min={0}
                  onChange={(e) => handleStyleChange('paddingTop', parseInt(e.target.value) || 0)} />
              </div>
              <div className="property-field">
                <label>Bottom</label>
                <input type="number" value={currentStyles.paddingBottom || 0} min={0}
                  onChange={(e) => handleStyleChange('paddingBottom', parseInt(e.target.value) || 0)} />
              </div>
              <div className="property-field">
                <label>Left</label>
                <input type="number" value={currentStyles.paddingLeft || 0} min={0}
                  onChange={(e) => handleStyleChange('paddingLeft', parseInt(e.target.value) || 0)} />
              </div>
              <div className="property-field">
                <label>Right</label>
                <input type="number" value={currentStyles.paddingRight || 0} min={0}
                  onChange={(e) => handleStyleChange('paddingRight', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          )}
          </>)}

          {/* Shadow */}
          {isSectionVisible('shadow', component.type) && <CollapsibleSection title="Shadow">
            <div className="property-row">
              <label>Color</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={currentStyles.shadowColor || '#000000'}
                  onChange={(e) => handleStyleChange('shadowColor', e.target.value)}
                />
                <input
                  type="text"
                  value={currentStyles.shadowColor || '#000000'}
                  onChange={(e) => handleStyleChange('shadowColor', e.target.value)}
                  className="color-text"
                />
              </div>
            </div>
            <div className="property-row">
              <label>Width</label>
              <input
                type="number"
                value={currentStyles.shadowWidth || 0}
                min={0}
                onChange={(e) => handleStyleChange('shadowWidth', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-row two-col">
              <div className="property-field">
                <label>X Offset</label>
                <input
                  type="number"
                  value={currentStyles.shadowOffsetX || 0}
                  onChange={(e) => handleStyleChange('shadowOffsetX', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="property-field">
                <label>Y Offset</label>
                <input
                  type="number"
                  value={currentStyles.shadowOffsetY || 0}
                  onChange={(e) => handleStyleChange('shadowOffsetY', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="property-row">
              <label>Spread</label>
              <input
                type="number"
                value={currentStyles.shadowSpread || 0}
                min={0}
                onChange={(e) => handleStyleChange('shadowSpread', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-row">
              <label>Opacity</label>
              <input
                type="range"
                min={0}
                max={255}
                step={1}
                value={currentStyles.shadowOpacity ?? 255}
                onChange={(e) => handleStyleChange('shadowOpacity', parseInt(e.target.value))}
              />
              <span className="range-value">{currentStyles.shadowOpacity ?? 255}</span>
            </div>
          </CollapsibleSection>}

          {/* Transform */}
          {isSectionVisible('transform', component.type) && <CollapsibleSection title="Transform">
            <div className="property-row">
              <label>Rotation</label>
              <input
                type="range"
                min={0}
                max={3600}
                step={1}
                value={currentStyles.transformAngle || 0}
                onChange={(e) => handleStyleChange('transformAngle', parseInt(e.target.value))}
              />
              <span className="range-value">{((currentStyles.transformAngle || 0) / 10).toFixed(1)}°</span>
            </div>
            <div className="property-row two-col">
              <div className="property-field">
                <label>Scale X (%)</label>
                <input
                  type="range"
                  min={0}
                  max={1024}
                  step={1}
                  value={currentStyles.transformZoomX ?? 256}
                  onChange={(e) => handleStyleChange('transformZoomX', parseInt(e.target.value))}
                />
                <span className="range-value" style={{ textAlign: 'center' }}>{((currentStyles.transformZoomX ?? 256) / 256 * 100).toFixed(0)}%</span>
              </div>
              <div className="property-field">
                <label>Scale Y (%)</label>
                <input
                  type="range"
                  min={0}
                  max={1024}
                  step={1}
                  value={currentStyles.transformZoomY ?? 256}
                  onChange={(e) => handleStyleChange('transformZoomY', parseInt(e.target.value))}
                />
                <span className="range-value" style={{ textAlign: 'center' }}>{((currentStyles.transformZoomY ?? 256) / 256 * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="property-row two-col">
              <div className="property-field">
                <label>Pivot X</label>
                <input
                  type="number"
                  value={currentStyles.transformPivotX || 0}
                  onChange={(e) => handleStyleChange('transformPivotX', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="property-field">
                <label>Pivot Y</label>
                <input
                  type="number"
                  value={currentStyles.transformPivotY || 0}
                  onChange={(e) => handleStyleChange('transformPivotY', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </CollapsibleSection>}

          {/* Scrollbar */}
          {isSectionVisible('scrollbar', component.type) && <CollapsibleSection title="Scrollbar">
            <div className="property-row">
              <label>Mode</label>
              <select
                value={currentStyles.scrollbarMode || 'auto'}
                onChange={(e) => handleStyleChange('scrollbarMode', e.target.value)}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
              >
                <option value="off">Off</option>
                <option value="on">Always Visible</option>
                <option value="active">Visible While Active</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div className="property-row">
              <label>Width</label>
              <input
                type="number"
                value={currentStyles.scrollbarWidth || 0}
                min={0}
                onChange={(e) => handleStyleChange('scrollbarWidth', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-row">
              <label>Color</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={currentStyles.scrollbarColor || '#cccccc'}
                  onChange={(e) => handleStyleChange('scrollbarColor', e.target.value)}
                />
                <input
                  type="text"
                  value={currentStyles.scrollbarColor || '#cccccc'}
                  onChange={(e) => handleStyleChange('scrollbarColor', e.target.value)}
                  className="color-text"
                />
              </div>
            </div>
          </CollapsibleSection>}

          {/* Text / Font */}
          {isSectionVisible('textStyle', component.type) && <CollapsibleSection title="Text">
            <FontSelector currentStyles={currentStyles} handleStyleChange={handleStyleChange} />
            <div className="property-row">
              <label>Font Size</label>
              <input
                type="number"
                value={currentStyles.textFontSize || 14}
                min={8}
                max={128}
                onChange={(e) => handleStyleChange('textFontSize', parseInt(e.target.value) || 14)}
              />
            </div>
            <div className="property-row two-col">
              <div className="property-field">
                <label>Letter Spacing</label>
                <input
                  type="number"
                  value={currentStyles.textLetterSpace || 0}
                  onChange={(e) => handleStyleChange('textLetterSpace', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="property-field">
                <label>Line Spacing</label>
                <input
                  type="number"
                  value={currentStyles.textLineSpace || 0}
                  onChange={(e) => handleStyleChange('textLineSpace', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="property-row">
              <label>Text Decoration</label>
              <select
                value={currentStyles.textDecor || 'none'}
                onChange={(e) => handleStyleChange('textDecor', e.target.value as StyleProps['textDecor'])}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
              >
                <option value="none">None</option>
                <option value="underline">Underline</option>
                <option value="strikethrough">Strikethrough</option>
              </select>
            </div>
          </CollapsibleSection>}

          {/* Gradient */}
          {isSectionVisible('gradient', component.type) && <CollapsibleSection title="Gradient">
            <div className="property-row">
              <label>Direction</label>
              <select
                value={currentStyles.bgGradDir || 'none'}
                onChange={(e) => handleStyleChange('bgGradDir', e.target.value as StyleProps['bgGradDir'])}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
              >
                <option value="none">None</option>
                <option value="hor">Horizontal</option>
                <option value="ver">Vertical</option>
              </select>
            </div>
            <div className="property-row">
              <label>Gradient Color</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={currentStyles.bgGradColor || '#000000'}
                  onChange={(e) => handleStyleChange('bgGradColor', e.target.value)}
                />
                <input
                  type="text"
                  value={currentStyles.bgGradColor || '#000000'}
                  onChange={(e) => handleStyleChange('bgGradColor', e.target.value)}
                  className="color-text"
                />
              </div>
            </div>
            <div className="property-row">
              <label>Stop Position</label>
              <input
                type="range"
                min={0}
                max={255}
                step={1}
                value={currentStyles.bgGradStop ?? 128}
                onChange={(e) => handleStyleChange('bgGradStop', parseInt(e.target.value))}
              />
              <span className="range-value">{currentStyles.bgGradStop ?? 128}</span>
            </div>
          </CollapsibleSection>}

          {/* Outline */}
          {isSectionVisible('outline', component.type) && <CollapsibleSection title="Outline">
            <div className="property-row">
              <label>Color</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={currentStyles.outlineColor || '#000000'}
                  onChange={(e) => handleStyleChange('outlineColor', e.target.value)}
                />
                <input
                  type="text"
                  value={currentStyles.outlineColor || '#000000'}
                  onChange={(e) => handleStyleChange('outlineColor', e.target.value)}
                  className="color-text"
                />
              </div>
            </div>
            <div className="property-row">
              <label>Width</label>
              <input
                type="number"
                value={currentStyles.outlineWidth || 0}
                min={0}
                onChange={(e) => handleStyleChange('outlineWidth', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-row">
              <label>Spacing</label>
              <input
                type="number"
                value={currentStyles.outlinePad || 0}
                min={0}
                onChange={(e) => handleStyleChange('outlinePad', parseInt(e.target.value) || 0)}
              />
            </div>
          </CollapsibleSection>}

          {/* Blend mode */}
          {isSectionVisible('blendMode', component.type) && (
          <div className="property-row" style={{ marginTop: 10 }}>
            <label>Blend Mode</label>
            <select
              value={currentStyles.blendMode || 'normal'}
              onChange={(e) => handleStyleChange('blendMode', e.target.value as StyleProps['blendMode'])}
              style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
            >
              <option value="normal">Normal</option>
              <option value="additive">Additive</option>
              <option value="subtractive">Subtractive</option>
              <option value="multiply">Multiply</option>
            </select>
          </div>
          )}
        </div>

        {/* Component-specific props */}
        {renderComponentProps(component, handlePropsChange, handleBatchPropsChange)}

        {/* Events — a category here rather than its own panel; component
            properties only for now. Sits between the layout sections above
            and the communication binding below. */}
        <EventPanel />

        <ModbusBindingEditor
          componentType={component.type}
          binding={component.modbusBinding}
          tags={modbusTags}
          communicationEnabled={communicationEnabled}
          onChange={(modbusBinding) => handlePropertyChange('modbusBinding', modbusBinding)}
        />

        {/* Flex/Grid child properties */}
        {parentLayout === 'flex' && (
          <div className="property-section">
            <div className="section-header">Flex Item</div>
            <div className="property-row">
              <label>flexGrow</label>
              <input
                type="number"
                value={component.props.flexGrow ?? 0}
                min={0}
                max={10}
                onChange={(e) => handlePropsChange('flexGrow', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-row">
              <label>flexShrink</label>
              <input
                type="number"
                value={component.props.flexShrink ?? 1}
                min={0}
                max={10}
                onChange={(e) => handlePropsChange('flexShrink', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-row">
              <label>alignSelf</label>
              <select
                value={component.props.alignSelf || 'auto'}
                onChange={(e) => handlePropsChange('alignSelf', e.target.value)}
              >
                <option value="auto">Auto</option>
                <option value="flex-start">Start</option>
                <option value="flex-end">End</option>
                <option value="center">Center</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
          </div>
        )}

        {parentLayout === 'grid' && (
          <div className="property-section">
            <div className="section-header">Grid Item</div>
            <div className="property-row two-col">
              <div className="property-field">
                <label>Start Column</label>
                <input
                  type="number"
                  value={component.props.gridColumn ?? 0}
                  min={0}
                  onChange={(e) => handlePropsChange('gridColumn', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="property-field">
                <label>Column Span</label>
                <input
                  type="number"
                  value={component.props.gridColumnSpan ?? 1}
                  min={1}
                  onChange={(e) => handlePropsChange('gridColumnSpan', Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>
            <div className="property-row two-col">
              <div className="property-field">
                <label>Start Row</label>
                <input
                  type="number"
                  value={component.props.gridRow ?? 0}
                  min={0}
                  onChange={(e) => handlePropsChange('gridRow', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="property-field">
                <label>Row Span</label>
                <input
                  type="number"
                  value={component.props.gridRowSpan ?? 1}
                  min={1}
                  onChange={(e) => handlePropsChange('gridRowSpan', Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>
            <div className="property-row">
              <label>Horizontal Alignment</label>
              <select
                value={component.props.gridCellAlignX || 'stretch'}
                onChange={(e) => handlePropsChange('gridCellAlignX', e.target.value)}
              >
                <option value="start">Start</option>
                <option value="center">Center</option>
                <option value="end">End</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
            <div className="property-row">
              <label>Vertical Alignment</label>
              <select
                value={component.props.gridCellAlignY || 'stretch'}
                onChange={(e) => handlePropsChange('gridCellAlignY', e.target.value)}
              >
                <option value="start">Start</option>
                <option value="center">Center</option>
                <option value="end">End</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

// Render flags section with grouped checkboxes
function renderFlagsSection(
  component: LvglComponent,
  handlePropertyChange: (property: keyof LvglComponent, value: LvglComponent[keyof LvglComponent]) => void
): React.ReactNode {
  const flags = component.flags || {};
  const isContainer = CONTAINER_TYPES.has(component.type);

  const handleFlagChange = (flagKey: keyof LvglFlags, checked: boolean) => {
    handlePropertyChange('flags', { ...flags, [flagKey]: checked });
  };

  const FLAG_GROUPS: { label: string; items: { key: keyof LvglFlags; label: string }[] }[] = [
    {
      label: 'Interaction',
      items: [
        { key: 'clickable', label: 'Clickable' },
        { key: 'checkable', label: 'Checkable' },
        { key: 'disabled', label: 'Disabled' },
      ],
    },
    {
      label: 'Scrolling',
      items: [
        { key: 'scrollable', label: 'Scrollable' },
        { key: 'scrollElastic', label: 'Elastic Scrolling' },
        { key: 'scrollMomentum', label: 'Momentum Scrolling' },
        { key: 'scrollOnFocus', label: 'Scroll on Focus' },
      ],
    },
    {
      label: 'Behavior',
      items: [
        { key: 'hidden', label: 'Hidden' },
        { key: 'snappable', label: 'Snappable' },
        { key: 'pressLock', label: 'Press Lock' },
        { key: 'eventBubble', label: 'Bubble Events' },
        { key: 'gesturesBubble', label: 'Bubble Gestures' },
      ],
    },
  ];

  return (
    <>
      {FLAG_GROUPS.map((group) => {
        // Filter scroll flags for non-container types
        const items = isContainer ? group.items : group.items.filter(item => !SCROLL_FLAGS.has(item.key));
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="flags-group">
            <div className="flags-group-label">{group.label}</div>
            {items.map((item) => (
              <div key={item.key} className="flag-row">
                <input
                  type="checkbox"
                  id={`flag-${item.key}`}
                  checked={!!flags[item.key]}
                  onChange={(e) => handleFlagChange(item.key, e.target.checked)}
                />
                <label htmlFor={`flag-${item.key}`}>{item.label}</label>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// Font selector with resource store integration
function FontSelector({
  currentStyles,
  handleStyleChange,
}: {
  currentStyles: StyleProps;
  handleStyleChange: (key: keyof StyleProps, value: StyleProps[keyof StyleProps]) => void;
}): React.ReactNode {
  const fonts = useResourceStore((s) => s.fonts);

  return (
    <div className="property-row">
      <label>Font</label>
      <select
        value={currentStyles.textFont || ''}
        onChange={(e) => handleStyleChange('textFont', e.target.value || undefined)}
        style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
      >
        <option value="">Default</option>
        <optgroup label="Built-in Fonts">
          {BUILTIN_FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </optgroup>
        {fonts.length > 0 && (
          <optgroup label="Uploaded Fonts">
            {fonts.map((f) => (
              <option key={f.id} value={f.cFontName}>{f.name} ({f.family})</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

/**
 * The dropdown options editor, aware of shared text.
 *
 * Linked, the rows show the previewed language, and the two kinds of edit
 * diverge on purpose: typing rewrites one line of one language, while add,
 * delete and reorder are structural and apply to every language in lockstep —
 * the option count and order are shared, only the words differ. That lockstep
 * is also what keeps the generated callback's save-and-restore of the
 * selection index meaningful across a language switch.
 */
function TranslatableOptionsEditor({
  component,
  onChange,
}: {
  component: LvglComponent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const texts = useEditorStore((s) => s.texts);
  const languages = useEditorStore((s) => s.languages);
  const previewLanguage = useEditorStore((s) => s.previewLanguage);
  const updateText = useEditorStore((s) => s.updateText);
  const linkComponentToText = useEditorStore((s) => s.linkComponentToText);
  const unlinkComponentText = useEditorStore((s) => s.unlinkComponentText);

  const literalOptions: string[] = Array.isArray(component.props.options)
    ? component.props.options
    : ['Option 1', 'Option 2', 'Option 3'];

  const resource = component.textId && standInProp(component) === 'options'
    ? texts.find((text) => text.id === component.textId)
    : undefined;

  if (!resource) {
    return (
      <>
        <DropdownOptionsEditor
          options={literalOptions}
          onChange={(newOptions) => onChange('options', newOptions)}
        />
        <div className="property-row">
          <label />
          <button
            className="text-link-btn"
            title="Share the options as a translatable text resource"
            onClick={() => linkComponentToText(component.id)}
          >
            🌐 Share options
          </button>
        </div>
      </>
    );
  }

  const codes = languages.map((language) => language.code);
  const activeCode = previewLanguage ?? codes[0] ?? 'en';
  const activeName = languages.find((language) => language.code === activeCode)?.name ?? activeCode;
  const shownOptions = resolveText(resource, activeCode, codes).split('\n');

  const writeLines = (code: string, lines: string[]) => {
    updateText(resource.id, code, lines.join('\n'));
    if (code === codes[0]) onChange('options', lines);
  };

  const handleOperation = (op: OptionsOperation) => {
    if (op.kind === 'edit') {
      // Words are per-language: rewrite one line of the previewed language.
      // Editing an untranslated language starts from the fallback words.
      writeLines(activeCode, applyOptionsOperation(shownOptions, op));
      return;
    }
    // Structure is shared: replay the operation on every language in lockstep
    for (const code of Object.keys(resource.values)) {
      writeLines(code, applyOptionsOperation(resource.values[code].split('\n'), op));
    }
    if (!(codes[0] in resource.values)) {
      onChange('options', applyOptionsOperation(literalOptions, op));
    }
  };

  return (
    <>
      <DropdownOptionsEditor options={shownOptions} onChange={() => {}} onOperation={handleOperation} />
      <div className="property-row text-resource-note">
        <label />
        <span>
          🌐 <code>{resource.key}</code> · {activeName}
          <button
            className="text-unlink-btn"
            title="Stop sharing; keep the options currently shown"
            onClick={() => unlinkComponentText(component.id)}
          >
            unlink
          </button>
        </span>
      </div>
    </>
  );
}

/**
 * A text input that knows whether the words belong to the widget or to a
 * shared text resource.
 *
 * Linked: editing writes the resource's value for the language the canvas is
 * previewing — you edit what you see — and every widget showing that resource
 * follows. Editing the default language also refreshes the widget's own
 * literal, so the fallback used by unlink and delete never goes stale.
 *
 * Unlinked: a plain literal, with a one-click way to share it. Reuse-or-create
 * is the store's rule, the same one migration applies.
 */
function TranslatableTextRow({
  component,
  prop,
  label,
  multiline,
  onChange,
}: {
  component: LvglComponent;
  prop: 'text' | 'placeholder' | 'title';
  label: string;
  multiline?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const texts = useEditorStore((s) => s.texts);
  const languages = useEditorStore((s) => s.languages);
  const previewLanguage = useEditorStore((s) => s.previewLanguage);
  const screens = useEditorStore((s) => s.screens);
  const updateText = useEditorStore((s) => s.updateText);
  const linkComponentToText = useEditorStore((s) => s.linkComponentToText);
  const bindComponentToText = useEditorStore((s) => s.bindComponentToText);

  const literal = typeof component.props?.[prop] === 'string' ? (component.props[prop] as string) : '';

  // The recorded prop, with the legacy inference as fallback — one rule,
  // shared with the canvas
  const standIn = standInProp(component);
  const resource = component.textId && prop === standIn
    ? texts.find((text) => text.id === component.textId)
    : undefined;

  /**
   * Which row of the text table the widget shows, chosen by its Id — the
   * label the Texts panel now uses for the same field.
   *
   * The alternative — retyping the literal until it happens to match an
   * existing row — is how a widget ends up on a near-identical duplicate.
   * Only rendered for the prop a resource can stand in for.
   */
  const keyRow = prop !== standIn ? null : (
    <div className="property-row">
      <label>Id</label>
      <select
        value={resource?.id ?? ''}
        onChange={(e) => bindComponentToText(component.id, e.target.value || undefined)}
        title="The text resource this component shows"
      >
        <option value="">(none — the component's own text)</option>
        {texts.map((text) => (
          <option key={text.id} value={text.id}>
            {text.key}
          </option>
        ))}
      </select>
      {!resource && literal.trim().length > 0 && (
        <button
          className="text-link-btn"
          title="Create a new text resource from these words"
          onClick={() => linkComponentToText(component.id)}
        >
          🌐
        </button>
      )}
    </div>
  );

  if (!resource) {
    return (
      <>
        <div className="property-row">
          <label>{label}</label>
          {multiline ? (
            <textarea
              value={literal}
              onChange={(e) => onChange(prop, e.target.value)}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          ) : (
            <input type="text" value={literal} onChange={(e) => onChange(prop, e.target.value)} />
          )}
        </div>
        {keyRow}
      </>
    );
  }

  const codes = languages.map((language) => language.code);
  const activeCode = previewLanguage ?? codes[0] ?? 'en';
  const shown = resolveText(resource, activeCode, codes);
  const activeName = languages.find((language) => language.code === activeCode)?.name ?? activeCode;

  let usedBy = 0;
  const count = (components: LvglComponent[]) => {
    for (const comp of components) {
      if (comp.textId === resource.id) usedBy++;
      count(comp.children ?? []);
    }
  };
  for (const screen of screens) count(screen.components);

  const handleEdit = (value: string) => {
    updateText(resource.id, activeCode, value);
    // Keep the widget's own literal current while the default language is the
    // one being edited, so falling back to it later shows today's words
    if (activeCode === codes[0]) onChange(prop, value);
  };

  return (
    <>
      <div className="property-row">
        <label>{label}</label>
        {multiline ? (
          <textarea
            value={shown}
            onChange={(e) => handleEdit(e.target.value)}
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        ) : (
          <input type="text" value={shown} onChange={(e) => handleEdit(e.target.value)} />
        )}
      </div>
      {keyRow}
      <div className="property-row text-resource-note">
        <label />
        <span>
          🌐 {activeName} · used by {usedBy}
          {resource.typographyId && ' · typography from this text'}
        </span>
      </div>
    </>
  );
}


/**
 * The widget-level Text Alignment row, shown only while no typography governs
 * the widget.
 *
 * Hidden rather than shown dead: LVGL resolves an object-local style above an
 * added style, so a value set here would silently beat the typography's
 * alignment — the exact drift a shared style exists to prevent, and invisible
 * until the device renders it. Alignment for a governed widget lives on the
 * typography, per language included.
 */
function WidgetAlignmentRow({
  component,
  fallbackValue,
  onChange,
}: {
  component: LvglComponent;
  fallbackValue: 'left' | 'center';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const texts = useEditorStore((s) => s.texts);
  if (effectiveTypographyId(component, texts) !== undefined) return null;

  return (
    <div className="property-row">
      <label>Text Alignment</label>
      <select
        value={(component.props.textAlign as string) || fallbackValue}
        onChange={(e) => onChange('textAlign', e.target.value)}
      >
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </div>
  );
}

/**
 * Warns when the device will draw boxes where the canvas draws words.
 *
 * The canvas uses the browser's fonts and shows 中文 in any widget perfectly;
 * the flashed panel only has the fonts the project converts, and the one font
 * never converted — the built-in Montserrat — cannot grow glyphs to match the
 * text. Without this row the first sight of the problem is the device itself,
 * which for a no-code tool is one flash too late.
 */
function GlyphCoverageWarning({ component }: { component: LvglComponent }): React.ReactNode {
  const texts = useEditorStore((s) => s.texts);
  const typographies = useEditorStore((s) => s.typographies);
  const languages = useEditorStore((s) => s.languages);

  const gaps = glyphCoverageGaps(component, texts, typographies, languages);
  if (gaps.length === 0) return null;

  const nameOf = (code: string | null) =>
    code === null ? 'its text' : (languages.find((l) => l.code === code)?.name ?? code);
  const listed = gaps
    .map((gap) => {
      const shown = gap.characters.slice(0, 12).join('');
      return `${nameOf(gap.language)}: ${shown}${gap.characters.length > 12 ? '…' : ''}`;
    })
    .join(' · ');
  const governed = gaps[0].typography;
  const fixLanguages = [...new Set(
    gaps.map((gap) => gap.language).filter((code): code is string => code !== null),
  )];

  return (
    <div className="property-row">
      <label />
      <span className="glyph-coverage-warning">
        Will show □ on the device — the built-in Montserrat has no glyphs for {listed}. The
        canvas looks right only because it draws with the browser&apos;s fonts.{' '}
        {governed
          ? (fixLanguages.length > 0
            ? `In the Typographies panel, give “${governed.name}” a ${fixLanguages.join(', ')} tab (the ＋ next to Default) with a font that covers them, such as Noto Sans TC.`
            : `In the Typographies panel, pick a covering font for “${governed.name}” — its Default is the built-in Montserrat.`)
          : 'Bind a Typography and set a covering font there — only a typography can give a language its own font.'}
      </span>
    </div>
  );
}

/**
 * How a widget's text is styled: a named typography, and nothing else.
 *
 * There is deliberately no font control here. A face and a size set on one
 * widget are invisible to every other widget that ought to match it, and they
 * are the settings most likely to need changing across a whole screen at once
 * — which is what a typography is. It is also the only path that can carry a
 * per-language font, so a project that switches to 中文 changes face with it.
 *
 * A bound text resource may name the typography itself, in which case it wins
 * and the control shows what it imposed rather than pretending to be free.
 */
function TextStyleSelector({
  component,
}: {
  component: LvglComponent;
}): React.ReactNode {
  const typographies = useEditorStore((s) => s.typographies);
  const texts = useEditorStore((s) => s.texts);
  const addTypography = useEditorStore((s) => s.addTypography);
  const updateComponent = useEditorStore((s) => s.updateComponent);

  const resource = component.textId ? texts.find((text) => text.id === component.textId) : undefined;
  const fromText = resource?.typographyId
    ? typographies.find((typography) => typography.id === resource.typographyId)
    : undefined;
  const assigned = component.typographyId;

  const select = (typographyId: string | undefined) => {
    // The widget's own font props are left alone rather than cleared: choosing
    // "None" again should give back what it looked like before, not nothing.
    updateComponent(component.id, { typographyId });
  };

  const createFromWidget = () => {
    const id = addTypography({
      name: `${component.name} text`,
      // Seeded from whatever the widget carries today, which is how a project
      // written before typographies existed moves onto one
      fontResource: (component.props.fontResource as string) ?? 'montserrat_14',
      fontSize: (component.props.fontSize as number) ?? 14,
      align: (component.props.textAlign as 'auto' | 'left' | 'center' | 'right') ?? 'auto',
    });
    select(id);
  };

  if (fromText) {
    return (
      <>
        <div className="property-row">
          <label>Typography</label>
          <select value={fromText.id} disabled title="Set on the text resource, in the Texts panel">
            <option value={fromText.id}>{fromText.name}</option>
          </select>
          <span className="property-hint">from “{resource?.key}”</span>
        </div>
        <GlyphCoverageWarning component={component} />
      </>
    );
  }

  return (
    <>
      <div className="property-row">
        <label>Typography</label>
        <select
          value={assigned ?? ''}
          onChange={(e) => select(e.target.value || undefined)}
        >
          <option value="">None (inherit)</option>
          {typographies.map((typography) => (
            <option key={typography.id} value={typography.id}>
              {typography.name}
            </option>
          ))}
        </select>
      </div>
      {!assigned && (
        <div className="property-row">
          <label />
          <button className="typography-create-btn" onClick={createFromWidget}>
            ＋ New typography from this widget
          </button>
        </div>
      )}
      <GlyphCoverageWarning component={component} />
    </>
  );
}

// Container layout properties editor
function ContainerLayoutEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  return (
    <div className="property-section">
      <div className="section-header">Container Layout</div>
      <div className="property-row">
        <label>Scroll Direction</label>
        <select
          value={props.scrollDir || 'none'}
          onChange={(e) => onChange('scrollDir', e.target.value)}
        >
          <option value="none">No Scrolling</option>
          <option value="hor">Horizontal</option>
          <option value="ver">Vertical</option>
          <option value="all">Both Directions</option>
        </select>
      </div>
      <div className="property-row">
        <label>Layout Mode</label>
        <select
          value={props.layout || 'none'}
          onChange={(e) => onChange('layout', e.target.value)}
        >
          <option value="none">None</option>
          <option value="flex">Flex</option>
          <option value="grid">Grid</option>
        </select>
      </div>
      {props.layout === 'flex' && (
        <>
          <div className="property-row">
            <label>Direction</label>
            <select
              value={props.flexDirection || 'row'}
              onChange={(e) => onChange('flexDirection', e.target.value)}
            >
              <option value="row">Horizontal</option>
              <option value="column">Vertical</option>
            </select>
          </div>
          <div className="property-row">
            <label>Gap</label>
            <input
              type="number"
              value={props.gap || 0}
              min={0}
              onChange={(e) => onChange('gap', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row">
            <label>Wrap</label>
            <select
              value={props.flexWrap || 'nowrap'}
              onChange={(e) => onChange('flexWrap', e.target.value)}
            >
              <option value="nowrap">No Wrap</option>
              <option value="wrap">Wrap</option>
              <option value="wrap-reverse">Reverse Wrap</option>
            </select>
          </div>
          <div className="property-row">
            <label>Main-Axis Alignment</label>
            <select
              value={props.justifyContent || 'flex-start'}
              onChange={(e) => onChange('justifyContent', e.target.value)}
            >
              <option value="flex-start">Start</option>
              <option value="flex-end">End</option>
              <option value="center">Center</option>
              <option value="space-between">Space Between</option>
              <option value="space-around">Space Around</option>
              <option value="space-evenly">Space Evenly</option>
            </select>
          </div>
          <div className="property-row">
            <label>Cross-Axis Alignment</label>
            <select
              value={props.alignItems || 'flex-start'}
              onChange={(e) => onChange('alignItems', e.target.value)}
            >
              <option value="flex-start">Start</option>
              <option value="flex-end">End</option>
              <option value="center">Center</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
          <div className="property-row">
            <label>Multi-Line Alignment</label>
            <select
              value={props.alignContent || 'flex-start'}
              onChange={(e) => onChange('alignContent', e.target.value)}
            >
              <option value="flex-start">Start</option>
              <option value="flex-end">End</option>
              <option value="center">Center</option>
              <option value="stretch">Stretch</option>
              <option value="space-between">Space Between</option>
              <option value="space-around">Space Around</option>
            </select>
          </div>
        </>
      )}
      {props.layout === 'grid' && (
        <>
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <label>Column Definitions</label>
            <input
              type="text"
              value={props.gridColumns || '1fr 1fr 1fr'}
              onChange={(e) => onChange('gridColumns', e.target.value)}
              placeholder="Example: 1fr 2fr 1fr"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <GridTemplatePreview value={props.gridColumns || '1fr 1fr 1fr'} />
          </div>
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <label>Row Definitions</label>
            <input
              type="text"
              value={props.gridRows || '1fr 1fr'}
              onChange={(e) => onChange('gridRows', e.target.value)}
              placeholder="Example: 1fr 2fr"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <GridTemplatePreview value={props.gridRows || '1fr 1fr'} />
          </div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Column Gap</label>
              <input
                type="number"
                value={props.gridColumnGap || 0}
                min={0}
                onChange={(e) => onChange('gridColumnGap', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Row Gap</label>
              <input
                type="number"
                value={props.gridRowGap || 0}
                min={0}
                onChange={(e) => onChange('gridRowGap', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Render component-specific properties
function renderComponentProps(
  component: LvglComponent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBatchChange?: (updates: Record<string, any>) => void
): React.ReactNode {
  const { type, props } = component;

  switch (type) {
    case 'btn':
      return (
        <>
          <div className="property-section">
            <div className="section-header">Button</div>
            <TranslatableTextRow component={component} prop="text" label="Text" onChange={onChange} />
            <TextStyleSelector component={component} />
            <WidgetAlignmentRow component={component} fallbackValue="center" onChange={onChange} />
          </div>
          <ContainerLayoutEditor props={props} onChange={onChange} />
        </>
      );

    case 'label':
      return (
        <div className="property-section">
          <div className="section-header">Label</div>
          <TranslatableTextRow component={component} prop="text" label="Text" onChange={onChange} />
          <TextStyleSelector component={component} />
          <WidgetAlignmentRow component={component} fallbackValue="left" onChange={onChange} />
          <div className="property-row">
            <label>Long Text Mode</label>
            <select
              value={props.longMode || 'wrap'}
              onChange={(e) => onChange('longMode', e.target.value)}
            >
              <option value="wrap">Wrap</option>
              <option value="scroll">Scroll</option>
              {/* DOTS is LVGL's own mode and writes three ASCII periods;
                  Ellipsis generates a truncation handler for the real … */}
              <option value="dot">Dots (...)</option>
              <option value="ellipsis">Ellipsis (…)</option>
              <option value="clip">Clip</option>
            </select>
          </div>
        </div>
      );

    case 'textarea':
      return (
        <div className="property-section">
          <div className="section-header">Text Area</div>
          <TranslatableTextRow component={component} prop="text" label="Content" multiline onChange={onChange} />
          <TranslatableTextRow component={component} prop="placeholder" label="Placeholder" onChange={onChange} />
          <TextStyleSelector component={component} />
          <div className="property-row">
            <label>Maximum Length</label>
            <input
              type="number"
              value={props.maxLength || 0}
              min={0}
              onChange={(e) => onChange('maxLength', parseInt(e.target.value) || 0)}
              style={{ flex: 1 }}
            />
            {(props.maxLength || 0) === 0 && <span style={{ fontSize: 11, color: '#999', marginLeft: 6, whiteSpace: 'nowrap' }}>(Unlimited)</span>}
          </div>
          <div className="property-row">
            <label>Password Mode</label>
            <input
              type="checkbox"
              checked={props.password || false}
              onChange={(e) => onChange('password', e.target.checked)}
            />
          </div>
          <div className="property-row">
            <label>Single-Line Mode</label>
            <input
              type="checkbox"
              checked={props.oneLine || false}
              onChange={(e) => onChange('oneLine', e.target.checked)}
            />
          </div>
        </div>
      );

    case 'checkbox':
      return (
        <div className="property-section">
          <div className="section-header">Checkbox</div>
          <TranslatableTextRow component={component} prop="text" label="Text" onChange={onChange} />
          <TextStyleSelector component={component} />
          <div className="property-row">
            <label>Checked</label>
            <input
              type="checkbox"
              checked={props.checked || false}
              onChange={(e) => onChange('checked', e.target.checked)}
            />
          </div>
        </div>
      );

    case 'switch':
      return (
        <div className="property-section">
          <div className="section-header">Switch</div>
          <div className="property-row">
            <label>On</label>
            <ToggleSwitch
              checked={props.checked || false}
              onChange={(checked) => onChange('checked', checked)}
            />
          </div>
        </div>
      );

    case 'slider':
      return (
        <div className="property-section">
          <div className="section-header">Slider</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Minimum</label>
              <input
                type="number"
                value={props.min ?? 0}
                onChange={(e) => {
                  const newMin = parseInt(e.target.value) || 0;
                  onChange('min', newMin);
                  const curVal = props.value ?? 50;
                  const curMax = props.max ?? 100;
                  if (curVal < newMin) onChange('value', newMin);
                  if (curMax < newMin) onChange('max', newMin);
                }}
              />
            </div>
            <div className="property-field">
              <label>Maximum</label>
              <input
                type="number"
                value={props.max ?? 100}
                onChange={(e) => {
                  const newMax = parseInt(e.target.value) || 100;
                  onChange('max', newMax);
                  const curVal = props.value ?? 50;
                  const curMin = props.min ?? 0;
                  if (curVal > newMax) onChange('value', newMax);
                  if (curMin > newMax) onChange('min', newMax);
                }}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Current Value</label>
            <div className="range-with-value">
              <input
                type="range"
                min={props.min ?? 0}
                max={props.max ?? 100}
                step={props.step || 1}
                value={props.value ?? 50}
                onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
              />
              <input
                type="number"
                className="range-number-input"
                value={props.value ?? 50}
                min={props.min ?? 0}
                max={props.max ?? 100}
                onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Step</label>
            <input
              type="number"
              value={props.step || 1}
              min={1}
              onChange={(e) => onChange('step', parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="property-row">
            <label>Direction</label>
            <select
              value={props.orientation || 'horizontal'}
              onChange={(e) => onChange('orientation', e.target.value)}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
        </div>
      );

    case 'bar':
      return (
        <div className="property-section">
          <div className="section-header">Progress Bar</div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Minimum</label>
              <input
                type="number"
                value={props.min ?? 0}
                onChange={(e) => {
                  const newMin = parseInt(e.target.value) || 0;
                  onChange('min', newMin);
                  const curVal = props.value ?? 50;
                  const curMax = props.max ?? 100;
                  if (curVal < newMin) onChange('value', newMin);
                  if (curMax < newMin) onChange('max', newMin);
                }}
              />
            </div>
            <div className="property-field">
              <label>Maximum</label>
              <input
                type="number"
                value={props.max ?? 100}
                onChange={(e) => {
                  const newMax = parseInt(e.target.value) || 100;
                  onChange('max', newMax);
                  const curVal = props.value ?? 50;
                  const curMin = props.min ?? 0;
                  if (curVal > newMax) onChange('value', newMax);
                  if (curMin > newMax) onChange('min', newMax);
                }}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Current Value</label>
            <div className="range-with-value">
              <input
                type="range"
                min={props.min ?? 0}
                max={props.max ?? 100}
                value={props.value ?? 50}
                onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
              />
              <input
                type="number"
                className="range-number-input"
                value={props.value ?? 50}
                min={props.min ?? 0}
                max={props.max ?? 100}
                onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Direction</label>
            <select
              value={props.orientation || 'horizontal'}
              onChange={(e) => onChange('orientation', e.target.value)}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
        </div>
      );

    case 'qrcode':
      return <QrcodeEditor component={component} props={props} onChange={onChange} />;

    case 'video':
      return <VideoEditor props={props} onChange={onChange} />;

    case 'win':
      return <WindowEditor component={component} props={props} onChange={onChange} />;

    case 'table':
      return <TableEditor props={props} onChange={onChange} />;

    case 'img':
      return <ImagePropsEditor props={props} onChange={onChange} />;

    case 'image-button':
      return (
        <ImageButtonEditor
          props={props}
          onChange={onChange}
          onBatchChange={onBatchChange}
        />
      );

    case 'line':
      return <LineEditor props={props} onChange={onChange} />;

    case 'circle':
      return <CircleEditor props={props} onChange={onChange} />;

    case 'polygon':
      return <PolygonEditor props={props} onChange={onChange} />;

    case 'dropdown':
      return (
        <div className="property-section">
          <div className="section-header">Dropdown</div>
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <label>Options</label>
            <TranslatableOptionsEditor component={component} onChange={onChange} />
          </div>
          <div className="property-row">
            <label>Default Selection</label>
            <select
              value={props.selected || 0}
              onChange={(e) => onChange('selected', parseInt(e.target.value) || 0)}
            >
              {(props.options || ['Option 1', 'Option 2', 'Option 3']).map((opt: string, i: number) => (
                <option key={i} value={i}>{i}: {opt}</option>
              ))}
            </select>
          </div>
          <TextStyleSelector component={component} />
          <div className="property-row">
            <label>Opening Direction</label>
            <select
              value={props.direction || 'down'}
              onChange={(e) => onChange('direction', e.target.value)}
            >
              <option value="down">Down</option>
              <option value="up">Up</option>
            </select>
          </div>
        </div>
      );

    case 'arc':
      return (
        <div className="property-section">
          <div className="section-header">Arc</div>
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <label>Start Angle: {props.startAngle || 135}°</label>
            <input
              type="range"
              min={0}
              max={360}
              value={props.startAngle || 135}
              onChange={(e) => onChange('startAngle', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <label>End Angle: {props.endAngle || 45}°</label>
            <input
              type="range"
              min={0}
              max={360}
              value={props.endAngle || 45}
              onChange={(e) => onChange('endAngle', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="property-row two-col">
            <div className="property-field">
              <label>Minimum</label>
              <input
                type="number"
                value={props.min || 0}
                onChange={(e) => onChange('min', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="property-field">
              <label>Maximum</label>
              <input
                type="number"
                value={props.max || 100}
                onChange={(e) => onChange('max', parseInt(e.target.value) || 100)}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Current Value</label>
            <div className="range-with-value">
              <input
                type="range"
                min={props.min || 0}
                max={props.max || 100}
                value={props.value || 0}
                onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
              />
              <input
                type="number"
                className="range-number-input"
                value={props.value || 0}
                min={props.min || 0}
                max={props.max || 100}
                onChange={(e) => onChange('value', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="property-row">
            <label>Mode</label>
            <select
              value={props.mode || 'normal'}
              onChange={(e) => onChange('mode', e.target.value)}
            >
              <option value="normal">Normal</option>
              <option value="symmetrical">Symmetrical</option>
              <option value="reverse">Reverse</option>
            </select>
          </div>
        </div>
      );

    case 'spinner':
      return (
        <div className="property-section">
          <div className="section-header">Spinner</div>
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <label>Rotation Speed: {props.speed || 1000} ms</label>
            <input
              type="range"
              min={100}
              max={5000}
              step={100}
              value={props.speed || 1000}
              onChange={(e) => onChange('speed', parseInt(e.target.value) || 1000)}
            />
          </div>
          <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <label>Arc Length: {props.arcLength || 60}°</label>
            <input
              type="range"
              min={10}
              max={360}
              value={props.arcLength || 60}
              onChange={(e) => onChange('arcLength', parseInt(e.target.value) || 60)}
            />
          </div>
        </div>
      );

    case 'chart':
      return <ChartSeriesEditor props={props} onChange={onChange} />;

    case 'calendar':
      return <CalendarEditor props={props} onChange={onChange} />;

    case 'tabview':
      return <TabManager props={props} onChange={onChange} />;

    case 'tileview':
      return <TileGridEditor props={props} onChange={onChange} />;

    case 'obj':
      return <ContainerLayoutEditor props={props} onChange={onChange} />;

    default:
      return null;
  }
}

// Image props editor with resource picker
/**
 * Everything a QrCode widget is: what it encodes, and how the code is built.
 *
 * The content comes from the Texts library — read in English whatever the
 * panel speaks, because the code is for the phone pointed at it — or from a
 * literal typed here. A string tag bound over communication replaces either
 * at run time; that binding lives in the Communication section below, like
 * every other widget's.
 *
 * Version, scale and error correction are the QR standard's own knobs, under
 * the standard's own names. The line at the foot does the arithmetic the
 * designer would otherwise do on paper: which version the content actually
 * needs, how many pixels that is at this scale, and whether it fits the box.
 */
function QrcodeEditor({
  component,
  props,
  onChange,
}: {
  component: LvglComponent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const texts = useEditorStore((state) => state.texts);
  const languages = useEditorStore((state) => state.languages);
  const updateComponent = useEditorStore((state) => state.updateComponent);

  const settings = normalizeQrcodeProps(props);
  const content = resolveQrcodeContent(
    settings,
    texts,
    languages.map((language) => language.code),
  );
  const encoded = encodeQrcode(content, settings);

  const fit = encoded.render
    ? qrcodePixelSize(encoded.render.moduleCount, settings.scale, settings.quietZone)
    : null;
  const clipped = fit !== null && (fit > component.width || fit > component.height);
  const boxLargerThanCode = fit !== null && (component.width > fit || component.height > fit);

  // The planning string is sized against the widget's own settings and box,
  // and against its string binding when it has one — so the advice names the
  // Length field's actual value rather than a default.
  const stringBinding = component.modbusBinding?.enabled
    && component.modbusBinding.dataType === 'string'
    ? { stringRegisters: component.modbusBinding.stringRegisters ?? 16 }
    : null;
  const plan = planQrcode(
    settings.sampleText,
    settings,
    { width: component.width, height: component.height },
    stringBinding,
  );

  return (
    <div className="property-section">
      <div className="section-header">QR Code</div>
      <div className="property-row">
        <label>Content</label>
        <select
          value={settings.source}
          aria-label="QR content source"
          onChange={(e) => onChange('source', e.target.value)}
        >
          <option value="literal">Text I type here</option>
          <option value="text">A Texts-library resource</option>
        </select>
      </div>

      {settings.source === 'literal' ? (
        <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <label>Encoded text</label>
          <input
            type="text"
            value={settings.literal}
            placeholder="Text or URL to encode"
            spellCheck={false}
            aria-label="QR literal content"
            onChange={(e) => onChange('literal', e.target.value)}
          />
        </div>
      ) : (
        <div className="property-row">
          <label>Text resource</label>
          <select
            value={settings.textId}
            aria-label="QR text resource"
            onChange={(e) => onChange('textId', e.target.value)}
          >
            <option value="">(none chosen)</option>
            {texts.map((text) => (
              <option key={text.id} value={text.id}>{text.key}</option>
            ))}
          </select>
        </div>
      )}
      {settings.source === 'text' && (
        <span className="property-hint">
          Encoded in English whichever language the panel is showing — the
          code is for the phone pointed at it, and its address does not
          translate.
        </span>
      )}

      <div className="property-row">
        <label>Version</label>
        <select
          value={settings.version}
          aria-label="QR version"
          onChange={(e) => onChange('version', parseInt(e.target.value, 10) || QRCODE_VERSION_AUTO)}
        >
          <option value={QRCODE_VERSION_AUTO}>Auto — smallest that fits</option>
          {Array.from({ length: QRCODE_VERSION_MAX }, (_, i) => i + 1).map((v) => (
            <option key={v} value={v}>Version {v} · {17 + 4 * v}×{17 + 4 * v} modules</option>
          ))}
        </select>
      </div>

      <div className="property-row">
        <label>Scale</label>
        <div className="range-with-value">
          <input
            type="range"
            min={QRCODE_SCALE_MIN}
            max={QRCODE_SCALE_MAX}
            value={settings.scale}
            aria-label="QR scale"
            onChange={(e) => onChange('scale', parseInt(e.target.value, 10) || 2)}
          />
          <span className="property-hint">{settings.scale} px / module</span>
        </div>
      </div>

      <div className="property-row">
        <label>Error correction</label>
        <select
          value={settings.ecc}
          aria-label="QR error correction"
          onChange={(e) => onChange('ecc', e.target.value)}
        >
          {QRCODE_ECC_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>{level.label}</option>
          ))}
        </select>
      </div>

      <div className="property-row">
        <label>Quiet zone</label>
        <ToggleSwitch
          checked={settings.quietZone}
          onChange={(checked) => onChange('quietZone', checked)}
        />
      </div>
      {!settings.quietZone && (
        <p className="shape-warning" role="status">
          Scanners rely on clear space around a code. With the quiet zone off,
          keep the area around this widget plain and light — on a dark or busy
          background the code may stop scanning.
        </p>
      )}

      {encoded.empty && (
        <p className="video-board-note" role="status">
          Nothing to encode yet — the widget stays blank, showing only its
          background colour, until content is set here or a string arrives
          over communication.
        </p>
      )}
      {encoded.error && (
        <p className="shape-warning" role="status">{encoded.error}</p>
      )}
      {encoded.render && (
        <p className={clipped ? 'shape-warning' : 'video-board-note'} role="status">
          {`Version ${encoded.render.version}, ${encoded.render.moduleCount}×${encoded.render.moduleCount} modules — ${fit}×${fit} px${settings.quietZone ? ' with its quiet zone' : ''}.`}
          {clipped
            ? ` The widget is ${component.width}×${component.height}, so the code will be clipped: enlarge the widget or lower the scale.`
            : boxLargerThanCode
              ? ` The widget is ${component.width}×${component.height}; the margin around the code is the widget's own background.`
              : ''}
        </p>
      )}
      {fit !== null && (component.width !== fit || component.height !== fit) && !clipped && (
        <div className="property-row">
          <label />
          <button
            type="button"
            className="qrcode-fit-button"
            onClick={() => updateComponent(component.id, { width: fit, height: fit })}
          >
            Shrink the widget to the code — {fit} × {fit}
          </button>
        </div>
      )}
      <span className="property-hint">
        A string sent over communication replaces this content while the panel
        runs — bind one in the Communication section below.
      </span>

      <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <label>Plan for a string</label>
        <textarea
          value={settings.sampleText}
          rows={2}
          placeholder="The longest string communication will ever send"
          spellCheck={false}
          aria-label="QR planning string"
          style={{ width: '100%', resize: 'vertical' }}
          onChange={(e) => onChange('sampleText', e.target.value)}
        />
      </div>
      <span className="property-hint">
        Planning only — never encoded, never built into the firmware. Saved with
        the project, so the next person sees what this code was sized for.
      </span>
      {plan && (
        <div className="qrcode-plan" role="status" aria-label="QR planning result">
          <p>
            {`${plan.characters} character${plan.characters === 1 ? '' : 's'}, ${plan.bytes} byte${plan.bytes === 1 ? '' : 's'} of UTF-8`}
            {plan.multibyte ? ' — some characters cost more than one byte, and bytes are what the code counts.' : '.'}
          </p>
          {plan.minVersion !== null && plan.moduleCount !== null && (
            <p>
              {`At level ${settings.ecc} it needs version ${plan.minVersion} (${plan.moduleCount}×${plan.moduleCount} modules) — ${plan.pixelSize}×${plan.pixelSize} px at scale ${settings.scale}${settings.quietZone ? ' with the quiet zone' : ''}.`}
            </p>
          )}
          <table className="qrcode-plan-table">
            <thead>
              <tr><th>Level</th><th>Smallest version</th></tr>
            </thead>
            <tbody>
              {QRCODE_ECC_LEVELS.map((level) => {
                const version = plan.minVersionByLevel[level.value];
                return (
                  <tr key={level.value} className={level.value === settings.ecc ? 'current' : undefined}>
                    <td>{level.value}</td>
                    <td>{version === null ? 'does not fit' : `${version} · ${17 + 4 * version}×${17 + 4 * version}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p>
            {`Over communication: ${plan.registers} register${plan.registers === 1 ? '' : 's'} (two bytes each).`}
          </p>
          {plan.advice.map((line) => (
            <p key={line} className="shape-warning">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Everything a Video widget is: what it plays, and what to do with it.
 *
 * Nothing is imported. The files are named, because they live on the SD card
 * the panel reads at run time and the editor has no way to see the card — so
 * these fields are a promise about what will be there, and the panel checks
 * it. A name that matches nothing on the card is drawn as "Video not found" on
 * the panel rather than failing the build, which is the only honest place to
 * find out.
 *
 * The list is a textarea, one file per line, rather than a row-per-file
 * editor: a playlist is typed from a folder listing, and a box that takes a
 * paste of one is worth more than one with an add button. Lines are kept
 * exactly as typed while the field has focus — normalising on every
 * keystroke would fight the cursor — and committed when it is left.
 *
 * The board line at the foot is not decoration. Playing video needs a JPEG
 * codec and an SD interface, and a board without them has no slower path to
 * fall back to — so a project that puts this widget on such a board is told
 * here, at the moment it is configured, and again by the Deploy tab.
 * See docs/video-playback.md.
 */
function VideoEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const projectList = useProjectStore((state) => state.projects);
  const boardId = projectList.find((item) => item.config.id === currentProjectId)?.config.boardId
    ?? DEFAULT_BOARD_ID;
  const boardName = SUPPORTED_BOARDS.find((board) => board.id === boardId)?.model ?? boardId;
  const video = getBoardVideo(boardId);

  const playlist = normalizeVideoProps(props);
  const warnings = videoPlaylistWarnings(playlist);

  // The list as the user is typing it. Seeded from the stored files,
  // re-seeded whenever the stored list changes while the field is not being
  // typed in — a different widget selected, an undo — and committed on blur.
  // Adjusted during render rather than in an effect, which is React's own
  // pattern for state that follows a prop.
  const storedText = playlist.files.join('\n');
  const [draft, setDraft] = useState(storedText);
  const [editing, setEditing] = useState(false);
  const [seededFrom, setSeededFrom] = useState(storedText);
  if (!editing && storedText !== seededFrom) {
    setSeededFrom(storedText);
    setDraft(storedText);
  }

  const commitFiles = (text: string) => {
    const files = text
      .split(/\r?\n/)
      .map(normalizeCardPath)
      .filter((line) => line !== '');
    onChange('files', files);
  };

  return (
    <div className="property-section">
      <div className="section-header">Video</div>
      <div className="property-row">
        <label>Source</label>
        <select
          value={playlist.source}
          aria-label="Video source"
          onChange={(e) => onChange('source', e.target.value)}
        >
          <option value="list">Files I name</option>
          <option value="folder">Every .avi in a folder</option>
        </select>
      </div>

      {playlist.source === 'list' ? (
        <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <label>Files on the SD card, one per line, in play order</label>
          <textarea
            className="video-file-list"
            value={draft}
            rows={Math.min(8, Math.max(3, draft.split('\n').length + 1))}
            placeholder={'intro.avi\nclips/morning.avi'}
            spellCheck={false}
            aria-label="Video files"
            onFocus={() => setEditing(true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => {
              setEditing(false);
              commitFiles(e.target.value);
            }}
          />
          <span className="property-hint">
            A folder in front of the name is fine — either slash. The list plays
            top to bottom unless Random order is on.
          </span>
        </div>
      ) : (
        <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <label>Folder on the SD card</label>
          <input
            type="text"
            value={typeof props.folder === 'string' ? props.folder : ''}
            placeholder="(the card's top level)"
            spellCheck={false}
            aria-label="Video folder"
            onChange={(e) => onChange('folder', e.target.value)}
            onBlur={(e) => onChange('folder', normalizeCardPath(e.target.value))}
          />
          <span className="property-hint">
            Every .avi file in the folder is played, in name order. Leave it
            empty for the card's top level.
          </span>
        </div>
      )}
      {warnings.map((warning) => (
        <p key={warning} className="shape-warning" role="status">{warning}</p>
      ))}

      <div className="property-row">
        <label>Auto Play</label>
        <ToggleSwitch
          checked={playlist.autoPlay}
          onChange={(checked) => onChange('autoPlay', checked)}
        />
      </div>
      <div className="property-row">
        <label>Loop</label>
        <ToggleSwitch
          checked={playlist.loop}
          onChange={(checked) => onChange('loop', checked)}
        />
      </div>
      <div className="property-row">
        <label>Random order</label>
        <ToggleSwitch
          checked={playlist.shuffle}
          onChange={(checked) => onChange('shuffle', checked)}
          /* One named file has no order to shuffle. A folder scan keeps the
             switch: how many files the folder holds is the panel's to find
             out. The normaliser reads the switch as off in the same case, so
             the stored value cannot show through anywhere else either. */
          disabled={playlist.source === 'list' && playlist.files.length <= 1}
          disabledReason="One file has no order to shuffle — name a second file to enable this."
        />
      </div>
      {playlist.shuffle && (
        <span className="property-hint">
          The next file is picked at random and is never the one that just
          played.
        </span>
      )}
      <p className={video ? 'video-board-note' : 'shape-warning'}>
        {video
          ? `${boardName} plays ${video.format} from the SD card, decoded by the JPEG codec. A name that matches no file on the card is drawn as “Video not found”.`
          : `${boardName} cannot play video — it has no JPEG codec to decode the frames with. A project using this widget cannot be built for this board; the Deploy tab says so too.`}
      </p>
    </div>
  );
}

function ImagePropsEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const images = useResourceStore((s) => s.images);
  const [showDropdown, setShowDropdown] = useState(false);

  // Find the currently selected resource image (match by id or name)
  const selectedImage = images.find(
    (img) => img.id === props.src || img.name === props.src
  );

  const handleSelectImage = (imageId: string) => {
    setShowDropdown(false);
    onChange('src', imageId);
  };

  const handleClear = () => {
    onChange('src', '');
    setShowDropdown(false);
  };

  return (
    <div className="property-section">
      <div className="section-header">Image</div>
      <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <label>Image Source</label>
        <div className="image-src-picker">
          <div
            className="image-src-display"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            {selectedImage ? (
              <>
                <img
                  src={selectedImage.data}
                  alt={selectedImage.name}
                  className="image-src-thumb"
                />
                <span className="image-src-name">{selectedImage.name}</span>
              </>
            ) : props.src ? (
              <span className="image-src-name" style={{ color: '#999' }}>{props.src}</span>
            ) : (
              <span className="image-src-placeholder">Select an image resource...</span>
            )}
            <span className="image-src-arrow">▼</span>
          </div>
          {showDropdown && (
            <div className="image-src-dropdown">
              {images.length === 0 ? (
                <div className="image-src-empty">No image resources are available. Upload one in the Resource Manager first.</div>
              ) : (
                <>
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className={`image-src-option ${img.id === props.src ? 'selected' : ''}`}
                      onClick={() => handleSelectImage(img.id)}
                    >
                      <img src={img.data} alt={img.name} className="image-src-option-thumb" />
                      <div className="image-src-option-info">
                        <span className="image-src-option-name">{img.name}</span>
                        <span className="image-src-option-size">{img.width}×{img.height}</span>
                      </div>
                    </div>
                  ))}
                  {props.src && (
                    <div className="image-src-option clear-option" onClick={handleClear}>
                      Clear Selection
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <input
          type="text"
          value={props.src || ''}
          onChange={(e) => onChange('src', e.target.value)}
          placeholder="Or enter an image ID or URL manually"
          style={{ fontSize: 11, color: '#888' }}
        />
      </div>
      <div className="property-row">
        <label>Scale Mode</label>
        <select
          value={props.scaleMode || 'none'}
          onChange={(e) => onChange('scaleMode', e.target.value)}
        >
          <option value="none">Original Size</option>
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
        </select>
      </div>
      <div className="property-row">
        <label>Rotation</label>
        <input
          type="number"
          value={props.rotation || 0}
          min={0}
          max={360}
          onChange={(e) => onChange('rotation', parseInt(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}

export function ImageButtonEditor({
  props,
  onChange,
  onBatchChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBatchChange?: (updates: Record<string, any>) => void;
}): React.ReactNode {
  const images = useResourceStore((state) => state.images);
  const imageButton = normalizeImageButtonProps(props);
  const { states, initialState, currentState } = imageButton;

  const applyUpdates = (updates: Record<string, unknown>) => {
    if (onBatchChange) {
      onBatchChange(updates);
      return;
    }
    Object.entries(updates).forEach(([key, value]) => onChange(key, value));
  };

  const commitStates = (
    nextStates: ImageButtonState[],
    preferredInitialId = states[initialState]?.id,
    preferredCurrentId = states[currentState]?.id,
  ) => {
    const matchedInitial = preferredInitialId
      ? nextStates.findIndex((state) => state.id === preferredInitialId)
      : -1;
    const matchedCurrent = preferredCurrentId
      ? nextStates.findIndex((state) => state.id === preferredCurrentId)
      : -1;
    const nextInitial = matchedInitial >= 0
      ? matchedInitial
      : clampImageButtonStateIndex(initialState, nextStates.length);
    const nextCurrent = matchedCurrent >= 0
      ? matchedCurrent
      : clampImageButtonStateIndex(currentState, nextStates.length);

    applyUpdates({
      states: nextStates,
      initialState: nextInitial,
      currentState: nextCurrent,
      value: nextStates[nextCurrent]?.value ?? 0,
    });
  };

  const updateState = (
    index: number,
    updates: Partial<ImageButtonState>,
  ) => {
    const nextStates = states.map((state, stateIndex) => (
      stateIndex === index ? { ...state, ...updates } : state
    ));
    commitStates(nextStates);
  };

  const moveState = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= states.length) return;
    const nextStates = [...states];
    [nextStates[index], nextStates[target]] = [
      nextStates[target],
      nextStates[index],
    ];
    commitStates(nextStates);
  };

  const removeState = (index: number) => {
    if (states.length <= 1) return;
    commitStates(states.filter((_, stateIndex) => stateIndex !== index));
  };

  const addState = () => {
    commitStates([...states, createImageButtonState(states)]);
  };

  return (
    <div className="property-section">
      <div className="section-header">Image Button</div>

      <div className="property-row">
        <label>Initial State</label>
        <select
          aria-label="Initial image-button state"
          value={initialState}
          disabled={states.length === 0}
          onChange={(event) => {
            applyUpdates({
              initialState: clampImageButtonStateIndex(
                Number(event.target.value),
                states.length,
              ),
            });
          }}
        >
          {states.map((state, index) => (
            <option key={state.id} value={index}>
              {index + 1}: {state.name} ({state.value})
            </option>
          ))}
        </select>
      </div>

      <div className="property-row">
        <label>Current State</label>
        <select
          aria-label="Current image-button state"
          value={currentState}
          disabled={states.length === 0}
          onChange={(event) => {
            const nextCurrent = clampImageButtonStateIndex(
              Number(event.target.value),
              states.length,
            );
            applyUpdates({
              currentState: nextCurrent,
              value: states[nextCurrent]?.value ?? 0,
            });
          }}
        >
          {states.map((state, index) => (
            <option key={state.id} value={index}>
              {index + 1}: {state.name} ({state.value})
            </option>
          ))}
        </select>
      </div>

      <div className="property-row">
        <label>Cycle on Click</label>
        <input
          aria-label="Cycle image-button states on click"
          type="checkbox"
          checked={imageButton.cycleOnClick}
          onChange={(event) => onChange('cycleOnClick', event.target.checked)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {states.map((state, index) => {
          const selectedImage = images.find((image) => image.id === state.imageId);
          return (
            <div
              key={state.id}
              data-testid={`image-button-state-${index}`}
              style={{
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <strong style={{ flex: 1 }}>State {index + 1}</strong>
                <button
                  type="button"
                  title="Move State Up"
                  disabled={index === 0}
                  onClick={() => moveState(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Move State Down"
                  disabled={index === states.length - 1}
                  onClick={() => moveState(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  title="Delete State"
                  disabled={states.length <= 1}
                  onClick={() => removeState(index)}
                >
                  ✕
                </button>
              </div>

              <div className="property-row">
                <label>Name</label>
                <input
                  aria-label={`Image-button state ${index + 1} name`}
                  type="text"
                  value={state.name}
                  onChange={(event) => updateState(index, {
                    name: event.target.value,
                  })}
                />
              </div>

              <div className="property-row">
                <label>Image</label>
                <select
                  aria-label={`Image-button state ${index + 1} image`}
                  value={state.imageId}
                  onChange={(event) => updateState(index, {
                    imageId: event.target.value,
                  })}
                >
                  <option value="">Select a Resource Manager image...</option>
                  {images.map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.name} ({image.width}×{image.height})
                    </option>
                  ))}
                </select>
              </div>

              {selectedImage && (
                <img
                  src={selectedImage.data}
                  alt={`${state.name} preview`}
                  style={{
                    maxWidth: '100%',
                    height: 54,
                    objectFit: 'contain',
                    background: '#f3f3f3',
                    borderRadius: 4,
                  }}
                />
              )}

              <div className="property-row">
                <label>Numeric Value</label>
                <input
                  aria-label={`Image-button state ${index + 1} value`}
                  type="number"
                  min={0}
                  max={65535}
                  step={1}
                  value={state.value}
                  onChange={(event) => updateState(index, {
                    value: normalizeImageButtonStateValue(
                      event.target.valueAsNumber,
                    ),
                  })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addState}
        style={{ marginTop: 8, width: '100%' }}
      >
        + Add State
      </button>

      <p className="modbus-binding-hint">
        States are ordered. The design canvas shows the current state; the
        preview starts at the initial state and advances on each click.
      </p>
    </div>
  );
}

// Table editor component
function TableEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const rows: number = props.rows ?? 3;
  const cols: number = props.cols ?? 3;
  const cellData: string[][] = props.cellData || Array.from({ length: rows }, () => Array(cols).fill(''));
  const cellAligns: string[][] = props.cellAligns || Array.from({ length: rows }, () => Array(cols).fill('left'));
  const columnWidths: number[] = props.columnWidths || Array(cols).fill(60);
  const headerRow: boolean = props.headerRow ?? true;

  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);

  // Ensure arrays match current rows/cols dimensions
  const ensureSize = (data: string[][], r: number, c: number, fill: string): string[][] => {
    const result: string[][] = [];
    for (let i = 0; i < r; i++) {
      const row: string[] = [];
      for (let j = 0; j < c; j++) {
        row.push(data[i]?.[j] ?? fill);
      }
      result.push(row);
    }
    return result;
  };

  const handleCellChange = (r: number, c: number, value: string) => {
    const newData = cellData.map(row => [...row]);
    if (!newData[r]) newData[r] = Array(cols).fill('');
    newData[r][c] = value;
    onChange('cellData', newData);
  };

  const handleCellAlignChange = (align: string) => {
    if (!selectedCell) return;
    const [r, c] = selectedCell;
    const newAligns = cellAligns.map(row => [...row]);
    if (!newAligns[r]) newAligns[r] = Array(cols).fill('left');
    newAligns[r][c] = align;
    onChange('cellAligns', newAligns);
  };

  const handleColWidthChange = (c: number, value: number) => {
    const newWidths = [...columnWidths];
    newWidths[c] = Math.max(20, value);
    onChange('columnWidths', newWidths);
  };

  const handleRowsChange = (newRows: number) => {
    if (newRows < 1) return;
    const newData = ensureSize(cellData, newRows, cols, '');
    const newAligns = ensureSize(cellAligns, newRows, cols, 'left');
    onChange('rows', newRows);
    onChange('cellData', newData);
    onChange('cellAligns', newAligns);
  };

  const handleColsChange = (newCols: number) => {
    if (newCols < 1) return;
    const newData = ensureSize(cellData, rows, newCols, '');
    const newAligns = ensureSize(cellAligns, rows, newCols, 'left');
    const newWidths: number[] = [];
    for (let j = 0; j < newCols; j++) {
      newWidths.push(columnWidths[j] ?? 60);
    }
    onChange('cols', newCols);
    onChange('cellData', newData);
    onChange('cellAligns', newAligns);
    onChange('columnWidths', newWidths);
  };

  const addRow = () => handleRowsChange(rows + 1);
  const addCol = () => handleColsChange(cols + 1);
  const deleteRow = () => { if (rows > 1) handleRowsChange(rows - 1); };
  const deleteCol = () => { if (cols > 1) handleColsChange(cols - 1); };

  return (
    <div className="property-section">
      <div className="section-header">Table</div>
      <div className="property-row">
        <label>Header Row</label>
        <input
          type="checkbox"
          checked={headerRow}
          onChange={(e) => onChange('headerRow', e.target.checked)}
        />
      </div>
      <div className="table-editor-actions">
        <button onClick={addRow} title="Add Row">+ Row</button>
        <button onClick={addCol} title="Add Column">+ Column</button>
        <button onClick={deleteRow} title="Delete Last Row" disabled={rows <= 1}>- Row</button>
        <button onClick={deleteCol} title="Delete Last Column" disabled={cols <= 1}>- Column</button>
      </div>
      {selectedCell && (
        <div className="table-cell-align-bar">
          <span className="table-cell-align-label">Cell Alignment:</span>
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              className={`table-align-btn ${cellAligns[selectedCell[0]]?.[selectedCell[1]] === a ? 'active' : ''}`}
              onClick={() => handleCellAlignChange(a)}
              title={a === 'left' ? 'Align Left' : a === 'center' ? 'Center' : 'Align Right'}
            >
              {a === 'left' ? '⫷' : a === 'center' ? '⫿' : '⫸'}
            </button>
          ))}
        </div>
      )}
      <div className="table-editor-wrapper">
        <table className="table-editor-table">
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r} className={r === 0 && headerRow ? 'table-header-row' : ''}>
                {Array.from({ length: cols }, (_, c) => (
                  <td
                    key={c}
                    className={`table-editor-cell ${selectedCell?.[0] === r && selectedCell?.[1] === c ? 'selected' : ''}`}
                    style={{ textAlign: (cellAligns[r]?.[c] || 'left') as React.CSSProperties['textAlign'] }}
                    onClick={() => setSelectedCell([r, c])}
                  >
                    <input
                      type="text"
                      className="table-cell-input"
                      value={cellData[r]?.[c] ?? ''}
                      onChange={(e) => handleCellChange(r, c, e.target.value)}
                      onFocus={() => setSelectedCell([r, c])}
                      style={{ textAlign: (cellAligns[r]?.[c] || 'left') as React.CSSProperties['textAlign'] }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CollapsibleSection title="Column Widths">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="property-row">
            <label>Column {c + 1}</label>
            <input
              type="number"
              value={columnWidths[c] ?? 60}
              min={20}
              onChange={(e) => handleColWidthChange(c, parseInt(e.target.value) || 60)}
            />
          </div>
        ))}
      </CollapsibleSection>
    </div>
  );
}

// Window editor component
function WindowEditor({
  component,
  props,
  onChange,
}: {
  component: LvglComponent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const headerButtons: Array<{ icon: string; id: string }> = props.headerButtons || [];

  const ICON_OPTIONS = ['✕', '☰', '⚙', '←', '→', '↑', '↓', '⟳', '⊕', '⊖'];

  const addHeaderButton = () => {
    const newBtn = { icon: '✕', id: `btn_${Date.now()}` };
    onChange('headerButtons', [...headerButtons, newBtn]);
  };

  const removeHeaderButton = (index: number) => {
    const newBtns = headerButtons.filter((_, i) => i !== index);
    onChange('headerButtons', newBtns);
  };

  const updateHeaderButton = (index: number, field: 'icon' | 'id', value: string) => {
    const newBtns = headerButtons.map((btn, i) =>
      i === index ? { ...btn, [field]: value } : btn
    );
    onChange('headerButtons', newBtns);
  };

  return (
    <div className="property-section">
      <div className="section-header">Window</div>
      <TranslatableTextRow component={component} prop="title" label="Title" onChange={onChange} />
      <div className="property-row">
        <label>Title Bar Height</label>
        <input
          type="number"
          value={props.headerHeight ?? 40}
          min={20}
          max={80}
          onChange={(e) => onChange('headerHeight', parseInt(e.target.value) || 40)}
        />
      </div>
      <div className="property-row">
        <label>Close Button</label>
        <input
          type="checkbox"
          checked={props.showCloseBtn !== false}
          onChange={(e) => onChange('showCloseBtn', e.target.checked)}
        />
      </div>
      <CollapsibleSection title="Title Bar Buttons">
        <div className="win-btn-list">
          {headerButtons.map((btn, i) => (
            <div key={i} className="win-btn-item">
              <select
                value={btn.icon}
                onChange={(e) => updateHeaderButton(i, 'icon', e.target.value)}
                className="win-btn-icon-select"
              >
                {ICON_OPTIONS.map(icon => (
                  <option key={icon} value={icon}>{icon}</option>
                ))}
              </select>
              <input
                type="text"
                value={btn.id}
                onChange={(e) => updateHeaderButton(i, 'id', e.target.value)}
                placeholder="Button ID"
                className="win-btn-id-input"
              />
              <button className="win-btn-delete" onClick={() => removeHeaderButton(i)} title="Delete">✕</button>
            </div>
          ))}
          <button className="win-btn-add" onClick={addHeaderButton}>+ Add Button</button>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// Chart series editor component
function ChartSeriesEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  // Backward compat: migrate old data field to series
  const series: Array<{ name: string; data: number[]; color: string; lineWidth?: number; pointSize?: number }> =
    props.series || (props.data ? [{ name: 'Series 1', data: props.data, color: props.lineColor || '#2196F3', lineWidth: 2, pointSize: 4 }] : [{ name: 'Series 1', data: [10, 20, 30, 25, 40], color: '#2196F3', lineWidth: 2, pointSize: 4 }]);

  const [expandedSeries, setExpandedSeries] = useState<number | null>(0);

  const updateSeries = (index: number, field: string, value: unknown) => {
    const newSeries = series.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    onChange('series', newSeries);
  };

  const addSeries = () => {
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4'];
    const color = colors[series.length % colors.length];
    onChange('series', [...series, { name: `Series ${series.length + 1}`, data: [0, 0, 0], color, lineWidth: 2, pointSize: 4 }]);
    setExpandedSeries(series.length);
  };

  const removeSeries = (index: number) => {
    if (series.length <= 1) return;
    const newSeries = series.filter((_, i) => i !== index);
    onChange('series', newSeries);
    if (expandedSeries === index) setExpandedSeries(null);
    else if (expandedSeries !== null && expandedSeries > index) setExpandedSeries(expandedSeries - 1);
  };

  return (
    <div className="property-section">
      <div className="section-header">Chart</div>
      <div className="property-row">
        <label>Type</label>
        <select
          value={props.type || 'line'}
          onChange={(e) => onChange('type', e.target.value)}
        >
          <option value="line">Line Chart</option>
          <option value="bar">Bar Chart</option>
          <option value="scatter">Scatter Plot</option>
        </select>
      </div>

      <div className="chart-series-list">
        <div className="chart-series-header">
          <span>Data Series ({series.length})</span>
          <button className="chart-series-add-btn" onClick={addSeries}>+ Add</button>
        </div>
        {series.map((s, i) => (
          <div key={i} className="chart-series-item">
            <div
              className={`chart-series-row ${expandedSeries === i ? 'expanded' : ''}`}
              onClick={() => setExpandedSeries(expandedSeries === i ? null : i)}
            >
              <span className="chart-series-color-dot" style={{ backgroundColor: s.color }} />
              <span className="chart-series-name">{s.name}</span>
              <span className="chart-series-count">{s.data.length} points</span>
              {series.length > 1 && (
                <button
                  className="chart-series-delete"
                  onClick={(e) => { e.stopPropagation(); removeSeries(i); }}
                  title="Delete Series"
                >✕</button>
              )}
            </div>
            {expandedSeries === i && (
              <div className="chart-series-detail">
                <div className="property-row">
                  <label>Name</label>
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => updateSeries(i, 'name', e.target.value)}
                  />
                </div>
                <div className="property-row">
                  <label>Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={s.color}
                      onChange={(e) => updateSeries(i, 'color', e.target.value)}
                    />
                    <input
                      type="text"
                      value={s.color}
                      onChange={(e) => updateSeries(i, 'color', e.target.value)}
                      className="color-text"
                    />
                  </div>
                </div>
                <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <label>Data Points</label>
                  <input
                    type="text"
                    value={s.data.join(', ')}
                    onChange={(e) => updateSeries(i, 'data', e.target.value.split(',').map((v: string) => parseInt(v.trim()) || 0))}
                    placeholder="10, 20, 30, 40"
                  />
                </div>
                <div className="property-row two-col">
                  <div className="property-field">
                    <label>Line Width</label>
                    <input
                      type="number"
                      value={s.lineWidth ?? 2}
                      min={1}
                      max={10}
                      onChange={(e) => updateSeries(i, 'lineWidth', parseInt(e.target.value) || 2)}
                    />
                  </div>
                  <div className="property-field">
                    <label>Point Size</label>
                    <input
                      type="number"
                      value={s.pointSize ?? 4}
                      min={0}
                      max={20}
                      onChange={(e) => updateSeries(i, 'pointSize', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="property-row two-col">
        <div className="property-field">
          <label>Y-Axis Minimum</label>
          <input
            type="number"
            value={props.yAxisMin ?? 0}
            onChange={(e) => onChange('yAxisMin', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="property-field">
          <label>Y-Axis Maximum</label>
          <input
            type="number"
            value={props.yAxisMax ?? 100}
            onChange={(e) => onChange('yAxisMax', parseInt(e.target.value) || 100)}
          />
        </div>
      </div>
      <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <label>X-Axis Labels</label>
        <input
          type="text"
          value={(props.xLabels || []).join(', ')}
          onChange={(e) => onChange('xLabels', e.target.value.split(',').map((v: string) => v.trim()).filter(Boolean))}
          placeholder="Label 1, Label 2, ..."
        />
      </div>
      <div className="property-row">
        <label>Show Legend</label>
        <input
          type="checkbox"
          checked={props.showLegend || false}
          onChange={(e) => onChange('showLegend', e.target.checked)}
        />
      </div>
      <div className="property-row">
        <label>Show Grid</label>
        <input
          type="checkbox"
          checked={props.showGrid !== false}
          onChange={(e) => onChange('showGrid', e.target.checked)}
        />
      </div>
    </div>
  );
}

// Calendar editor component
function CalendarEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const highlightedDates: string[] = props.highlightedDates || [];
  const [dateInput, setDateInput] = useState('');
  const [dateError, setDateError] = useState('');

  const isValidDate = (str: string): boolean => {
    const match = str.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!match) return false;
    const d = new Date(str);
    return !isNaN(d.getTime());
  };

  const addDate = () => {
    const trimmed = dateInput.trim();
    if (!trimmed) return;
    if (!isValidDate(trimmed)) {
      setDateError('Invalid format. Use YYYY-MM-DD.');
      return;
    }
    if (highlightedDates.includes(trimmed)) {
      setDateError('This date already exists.');
      return;
    }
    onChange('highlightedDates', [...highlightedDates, trimmed]);
    setDateInput('');
    setDateError('');
  };

  const removeDate = (date: string) => {
    onChange('highlightedDates', highlightedDates.filter(d => d !== date));
  };

  const handleDateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDate();
    }
  };

  return (
    <div className="property-section">
      <div className="section-header">Calendar</div>
      <div className="property-row two-col">
        <div className="property-field">
          <label>Year</label>
          <input
            type="number"
            value={props.year || new Date().getFullYear()}
            min={1970}
            max={2100}
            onChange={(e) => onChange('year', parseInt(e.target.value) || 2024)}
          />
        </div>
        <div className="property-field">
          <label>Month</label>
          <input
            type="number"
            value={props.month || 1}
            min={1}
            max={12}
            onChange={(e) => onChange('month', Math.min(12, Math.max(1, parseInt(e.target.value) || 1)))}
          />
        </div>
      </div>
      <div className="property-row">
        <label>Show Weekday Header</label>
        <input
          type="checkbox"
          checked={props.showDayNames !== false}
          onChange={(e) => onChange('showDayNames', e.target.checked)}
        />
      </div>
      <div className="property-row">
        <label>Highlight Today</label>
        <input
          type="checkbox"
          checked={props.showToday !== false}
          onChange={(e) => onChange('showToday', e.target.checked)}
        />
      </div>

      <CollapsibleSection title="Highlighted Dates" defaultOpen={highlightedDates.length > 0}>
        <div className="calendar-date-tags">
          {highlightedDates.map(date => (
            <span key={date} className="calendar-date-tag">
              {date}
              <button className="calendar-date-tag-remove" onClick={() => removeDate(date)}>✕</button>
            </span>
          ))}
        </div>
        <div className="calendar-date-input-row">
          <input
            type="text"
            value={dateInput}
            onChange={(e) => { setDateInput(e.target.value); setDateError(''); }}
            onKeyDown={handleDateKeyDown}
            placeholder="YYYY-MM-DD"
            className="calendar-date-input"
          />
          <button className="calendar-date-add-btn" onClick={addDate}>Add</button>
        </div>
        {dateError && <span className="calendar-date-error">{dateError}</span>}
      </CollapsibleSection>

      <CollapsibleSection title="Date Range">
        <div className="property-row">
          <label>Range Selection Mode</label>
          <input
            type="checkbox"
            checked={props.dateRangeMode || false}
            onChange={(e) => onChange('dateRangeMode', e.target.checked)}
          />
        </div>
        {props.dateRangeMode && (
          <>
            <div className="property-row">
              <label>Start Date</label>
              <input
                type="date"
                value={props.rangeStart || ''}
                onChange={(e) => onChange('rangeStart', e.target.value)}
              />
            </div>
            <div className="property-row">
              <label>End Date</label>
              <input
                type="date"
                value={props.rangeEnd || ''}
                onChange={(e) => onChange('rangeEnd', e.target.value)}
              />
            </div>
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}

// TabView tab manager component
function TabManager({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const tabs: string[] = props.tabs || ['Tab 1', 'Tab 2'];
  const activeTab: number = props.activeTab || 0;
  const tabChildMap: Record<string, string[]> = props.tabChildMap || {};

  const setActiveTab = (index: number) => {
    onChange('activeTab', index);
  };

  const renameTab = (index: number, name: string) => {
    const newTabs = tabs.map((t, i) => i === index ? name : t);
    onChange('tabs', newTabs);
  };

  const addTab = () => {
    onChange('tabs', [...tabs, `Tab ${tabs.length + 1}`]);
  };

  const removeTab = (index: number) => {
    if (tabs.length <= 1) return;
    const newTabs = tabs.filter((_, i) => i !== index);
    // Update tabChildMap keys
    const newMap: Record<string, string[]> = {};
    for (let i = 0; i < newTabs.length; i++) {
      const oldIndex = i >= index ? i + 1 : i;
      if (tabChildMap[String(oldIndex)]) {
        newMap[String(i)] = tabChildMap[String(oldIndex)];
      }
    }
    onChange('tabs', newTabs);
    onChange('tabChildMap', newMap);
    if (activeTab >= newTabs.length) {
      onChange('activeTab', newTabs.length - 1);
    }
  };

  const moveTab = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tabs.length) return;
    const newTabs = [...tabs];
    [newTabs[index], newTabs[targetIndex]] = [newTabs[targetIndex], newTabs[index]];
    // Swap child map entries
    const newMap = { ...tabChildMap };
    const a = newMap[String(index)];
    const b = newMap[String(targetIndex)];
    if (a || b) {
      newMap[String(index)] = b || [];
      newMap[String(targetIndex)] = a || [];
    }
    onChange('tabs', newTabs);
    onChange('tabChildMap', newMap);
    if (activeTab === index) onChange('activeTab', targetIndex);
    else if (activeTab === targetIndex) onChange('activeTab', index);
  };

  return (
    <div className="property-section">
      <div className="section-header">Tab View</div>
      <div className="tab-manager-list">
        {tabs.map((tab, i) => (
          <div
            key={i}
            className={`tab-manager-item ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            <input
              type="text"
              value={tab}
              onChange={(e) => renameTab(i, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="tab-manager-name-input"
            />
            <span className="tab-manager-child-count">
              {(tabChildMap[String(i)] || []).length} widgets
            </span>
            <div className="tab-manager-actions">
              <button
                className="tab-manager-move-btn"
                onClick={(e) => { e.stopPropagation(); moveTab(i, 'up'); }}
                disabled={i === 0}
                title="Move Up"
              >↑</button>
              <button
                className="tab-manager-move-btn"
                onClick={(e) => { e.stopPropagation(); moveTab(i, 'down'); }}
                disabled={i === tabs.length - 1}
                title="Move Down"
              >↓</button>
              {tabs.length > 1 && (
                <button
                  className="tab-manager-delete-btn"
                  onClick={(e) => { e.stopPropagation(); removeTab(i); }}
                  title="Delete"
                >✕</button>
              )}
            </div>
          </div>
        ))}
        <button className="tab-manager-add-btn" onClick={addTab}>+ Add Tab</button>
      </div>
      <div className="property-row">
        <label>Tab Position</label>
        <select
          value={props.tabPosition || 'top'}
          onChange={(e) => onChange('tabPosition', e.target.value)}
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="tab-manager-hint">Dropped widgets are automatically assigned to the active tab.</div>
    </div>
  );
}

// TileView grid editor component
function TileGridEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const rows: number = props.rows || 2;
  const cols: number = props.cols || 2;
  const currentRow: number = props.currentRow || 0;
  const currentCol: number = props.currentCol || 0;
  const tileChildMap: Record<string, string[]> = props.tileChildMap || {};

  const selectTile = (r: number, c: number) => {
    onChange('currentRow', r);
    onChange('currentCol', c);
  };

  return (
    <div className="property-section">
      <div className="section-header">Tile View</div>
      <div className="property-row two-col">
        <div className="property-field">
          <label>Rows</label>
          <input
            type="number"
            value={rows}
            min={1}
            max={10}
            onChange={(e) => onChange('rows', Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
        <div className="property-field">
          <label>Columns</label>
          <input
            type="number"
            value={cols}
            min={1}
            max={10}
            onChange={(e) => onChange('cols', Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
      </div>

      <div className="tile-grid-visual">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="tile-grid-row">
            {Array.from({ length: cols }, (_, c) => {
              const key = `${r}-${c}`;
              const childCount = (tileChildMap[key] || []).length;
              const isActive = r === currentRow && c === currentCol;
              return (
                <div
                  key={c}
                  className={`tile-grid-cell ${isActive ? 'active' : ''}`}
                  onClick={() => selectTile(r, c)}
                  title={`Tile [${r}, ${c}] - ${childCount} widgets`}
                >
                  <span className="tile-grid-cell-label">{childCount}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="property-row two-col">
        <div className="property-field">
          <label>Current Row</label>
          <input
            type="number"
            value={currentRow}
            min={0}
            max={rows - 1}
            onChange={(e) => onChange('currentRow', Math.min(rows - 1, Math.max(0, parseInt(e.target.value) || 0)))}
          />
        </div>
        <div className="property-field">
          <label>Current Column</label>
          <input
            type="number"
            value={currentCol}
            min={0}
            max={cols - 1}
            onChange={(e) => onChange('currentCol', Math.min(cols - 1, Math.max(0, parseInt(e.target.value) || 0)))}
          />
        </div>
      </div>
      <div className="tile-grid-hint">Dropped widgets are automatically assigned to the selected tile.</div>
    </div>
  );
}

// Font size input with preset dropdown + custom number
const FONT_SIZE_PRESETS = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

export function FontSizeInput({ value, onChange }: { value: number; onChange: (v: number) => void }): React.ReactNode {
  const isPreset = FONT_SIZE_PRESETS.includes(value);
  return (
    <div className="font-size-input">
      <select
        value={isPreset ? value : 'custom'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'custom') return;
          onChange(parseInt(v));
        }}
        className="font-size-select"
      >
        {FONT_SIZE_PRESETS.map(s => (
          <option key={s} value={s}>{s}px</option>
        ))}
        {!isPreset && <option value="custom">{value}px (Custom)</option>}
      </select>
      <input
        type="number"
        className="font-size-number"
        value={value}
        min={6}
        max={128}
        onChange={(e) => onChange(Math.max(6, parseInt(e.target.value) || 14))}
      />
    </div>
  );
}

// Line editor with points list
/**
 * Everything the Circle can be. A disc is a plain object with a circular
 * radius, so it keeps its fill and border; a sector is an arc, which has
 * angles, a thickness and nothing else. Both are circular, because the
 * software renderer has no elliptical primitive — see utils/circleGeometry.ts.
 */
function CircleEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const shape: CircleShape = props.shape === 'sector' ? 'sector' : 'circle';
  const startAngle = props.startAngle ?? DEFAULT_START_ANGLE;
  const endAngle = props.endAngle ?? DEFAULT_END_ANGLE;
  const thickness = props.thickness ?? 0;

  return (
    <div className="property-section">
      <div className="section-header">Circle</div>
      <div className="property-row">
        <label>Shape</label>
        <select value={shape} onChange={(e) => onChange('shape', e.target.value)}>
          <option value="circle">Circle</option>
          <option value="sector">Sector</option>
        </select>
      </div>
      {shape === 'sector' && (
        <>
          <div className="property-row two-col">
            <div className="property-field">
              <label title="0° is 3 o'clock, growing clockwise — LVGL's own convention">
                Start Angle
              </label>
              <NumberField
                value={startAngle}
                aria-label="Start Angle"
                onChange={(value) => onChange('startAngle', value)}
              />
            </div>
            <div className="property-field">
              <label>End Angle</label>
              <NumberField
                value={endAngle}
                aria-label="End Angle"
                onChange={(value) => onChange('endAngle', value)}
              />
            </div>
          </div>
          <div className="property-row">
            <label title="0 fills the wedge to the centre; a smaller value leaves a ring">
              Thickness
            </label>
            <NumberField
              value={thickness}
              min={0}
              aria-label="Thickness"
              onChange={(value) => onChange('thickness', value)}
            />
          </div>
          {/* A sector is an arc, and LVGL's arc has no outline. Saying where
              the border went is more use than a control that does nothing. */}
          <div className="property-row">
            <span className="inherit-hint">
              A sector has no border — an arc draws none. For a ring with an
              outline, use Circle with no fill and a thick border.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A polygon's own settings: the outline, and the points it is drawn from.
 *
 * The fill is not here. It is the Style section's background, the same one a
 * rectangle fills with, because that is what the generated code reads — a
 * second colour field would be a second answer to one question.
 */
function PolygonEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const points = normalizePolygonPoints(props.points);
  const lineWidth = props.lineWidth ?? DEFAULT_LINE_WIDTH;
  const convex = isConvexPolygon(points);

  const updatePoint = (index: number, axis: 0 | 1, value: number) => {
    onChange(
      'points',
      points.map((p, i) => (i === index ? (axis === 0 ? [value, p[1]] : [p[0], value]) : [...p])),
    );
  };

  // A new corner goes on the closing edge — between the last point and the
  // first — which is the edge the list does not show.
  const addPoint = () => {
    const last = points[points.length - 1];
    const first = points[0];
    onChange('points', [...points, [(last[0] + first[0]) / 2, (last[1] + first[1]) / 2]]);
  };

  const removePoint = (index: number) => {
    if (points.length <= MIN_POLYGON_POINTS) return;
    onChange('points', points.filter((_, i) => i !== index));
  };

  return (
    <div className="property-section">
      <div className="section-header">Polygon</div>
      <p className="field-hint">
        The points close into a shape: the last one joins the first. The fill is
        the Style section's background.
      </p>
      {!convex && (
        <p className="shape-warning">
          This outline turns back on itself, so it is drawn unfilled — here, in
          the preview and on the panel alike. LVGL fills a shape with triangles,
          which cover a convex outline only.
        </p>
      )}
      <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <label>Outline Width: {lineWidth}px</label>
        <input
          type="range"
          min={0}
          max={20}
          value={lineWidth}
          onChange={(e) => onChange('lineWidth', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="property-row">
        <label>Outline Color</label>
        <div className="color-input-wrapper">
          <input
            type="color"
            value={props.lineColor || '#333333'}
            onChange={(e) => onChange('lineColor', e.target.value)}
          />
          <input
            type="text"
            value={props.lineColor || '#333333'}
            onChange={(e) => onChange('lineColor', e.target.value)}
            className="color-text"
          />
        </div>
      </div>
      <div className="property-row">
        <label title="Rounds the corners of the outline by half its width, as lv_obj_set_style_line_rounded does">
          Rounded Corners
        </label>
        <input
          type="checkbox"
          checked={!!props.lineRounded}
          onChange={(e) => onChange('lineRounded', e.target.checked)}
          aria-label="Rounded Corners"
        />
      </div>
      <CollapsibleSection title={`Points (${points.length})`} defaultOpen>
        <div className="shape-points-list">
          {points.map((pt, i) => (
            <div key={i} className="shape-point-row">
              <span className="shape-point-index">{i + 1}</span>
              <div className="shape-point-fields">
                <label htmlFor={`polygon-point-${i}-x`}>X</label>
                <NumberField
                  id={`polygon-point-${i}-x`}
                  value={pt[0]}
                  className="shape-point-input"
                  onChange={(value) => updatePoint(i, 0, value)}
                />
                <label htmlFor={`polygon-point-${i}-y`}>Y</label>
                <NumberField
                  id={`polygon-point-${i}-y`}
                  value={pt[1]}
                  className="shape-point-input"
                  onChange={(value) => updatePoint(i, 1, value)}
                />
              </div>
              {points.length > MIN_POLYGON_POINTS && (
                <button
                  className="shape-point-delete"
                  onClick={() => removePoint(i)}
                  title="Delete"
                  aria-label={`Delete point ${i + 1}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button className="shape-point-add" onClick={addPoint}>+ Add Point</button>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function LineEditor({
  props,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}): React.ReactNode {
  const points = normalizeLinePoints(props.points);
  const orientation = lineOrientation(points);
  const length = lineLength(points);
  const lineWidth = props.lineWidth ?? DEFAULT_LINE_WIDTH;
  const dashWidth = props.lineDashWidth ?? 0;
  const dashGap = props.lineDashGap ?? 0;

  const updatePoint = (index: number, axis: 0 | 1, value: number) => {
    const newPoints = points.map((p, i) =>
      i === index ? (axis === 0 ? [value, p[1]] : [p[0], value]) : [...p]
    );
    onChange('points', newPoints);
  };

  const addPoint = () => {
    const last = points[points.length - 1] || [0, 0];
    onChange('points', [...points, [last[0] + 20, last[1]]]);
  };

  const removePoint = (index: number) => {
    if (points.length <= 2) return;
    onChange('points', points.filter((_, i) => i !== index));
  };

  return (
    <div className="property-section">
      <div className="section-header">Line</div>
      <div className="property-row">
        <label>Direction</label>
        <select
          value={orientation}
          onChange={(e) =>
            onChange(
              'points',
              orientedLinePoints(e.target.value as 'horizontal' | 'vertical', length),
            )
          }
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
          {/* Reachable by editing the points, not by picking it */}
          {orientation === 'custom' && <option value="custom">Custom</option>}
        </select>
      </div>
      {orientation !== 'custom' && (
        <div className="property-row">
          <label>Length</label>
          <NumberField
            value={length}
            min={MIN_LINE_LENGTH}
            aria-label="Length"
            onChange={(value) => onChange('points', orientedLinePoints(orientation, value))}
          />
        </div>
      )}
      <div className="property-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <label>Line Width: {lineWidth}px</label>
        <input
          type="range"
          min={1}
          max={20}
          value={lineWidth}
          onChange={(e) => onChange('lineWidth', parseInt(e.target.value) || 1)}
        />
      </div>
      <div className="property-row">
        <label>Line Color</label>
        <div className="color-input-wrapper">
          <input
            type="color"
            value={props.lineColor || '#333333'}
            onChange={(e) => onChange('lineColor', e.target.value)}
          />
          <input
            type="text"
            value={props.lineColor || '#333333'}
            onChange={(e) => onChange('lineColor', e.target.value)}
            className="color-text"
          />
        </div>
      </div>
      <div className="property-row">
        <label title="Rounds both ends by half the line width, as lv_obj_set_style_line_rounded does">
          Rounded Ends
        </label>
        <input
          type="checkbox"
          checked={!!props.lineRounded}
          onChange={(e) => onChange('lineRounded', e.target.checked)}
          aria-label="Rounded Ends"
        />
      </div>
      <div className="property-row two-col">
        <div className="property-field">
          <label title="0 draws a solid line">Dash Length</label>
          <NumberField
            value={dashWidth}
            min={0}
            aria-label="Dash Length"
            onChange={(value) => onChange('lineDashWidth', value)}
          />
        </div>
        <div className="property-field">
          <label>Dash Gap</label>
          <NumberField
            value={dashGap}
            min={0}
            aria-label="Dash Gap"
            onChange={(value) => onChange('lineDashGap', value)}
          />
        </div>
      </div>
      <CollapsibleSection title={`Points (${points.length})`} defaultOpen>
        <div className="shape-points-list">
          {points.map((pt, i) => (
            <div key={i} className="shape-point-row">
              <span className="shape-point-index">{i + 1}</span>
              <div className="shape-point-fields">
                <label>X</label>
                <input
                  type="number"
                  value={pt[0]}
                  onChange={(e) => updatePoint(i, 0, parseInt(e.target.value) || 0)}
                  className="shape-point-input"
                />
                <label>Y</label>
                <input
                  type="number"
                  value={pt[1]}
                  onChange={(e) => updatePoint(i, 1, parseInt(e.target.value) || 0)}
                  className="shape-point-input"
                />
              </div>
              {points.length > 2 && (
                <button className="shape-point-delete" onClick={() => removePoint(i)} title="Delete">✕</button>
              )}
            </div>
          ))}
          <button className="shape-point-add" onClick={addPoint}>+ Add Point</button>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export default PropertyEditor;
