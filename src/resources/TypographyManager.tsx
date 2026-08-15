// Typographies: named text styles shared across widgets.
//
// Each becomes one generated lv_style_t. Editing one changes every widget that
// references it, which is the point — see docs/text-typography-evaluation.md §5.
//
// The panel is two halves. On the left a tree, because a project with thirty
// sizes is a list nobody can scan; groups are organisational only and capped at
// two levels, the same cap and the same reason as the screen manager.
//
// On the right, Default plus a tab per language. The Default is the typography
// itself: a language without its own tab entry renders with exactly those
// settings, so editing the Default reaches every language that did not override
// it. A language tab stores only the difference — which is what makes "give 繁體
// a CJK face" one field rather than a restatement of the whole style.

import React, { useCallback, useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useResourceStore } from './resourceStore';
import type {
  LvglComponent,
  Typography,
  TypographyAlign,
  TypographyGroup,
  TypographyLanguageStyle,
} from '../types';
import { MAX_TYPOGRAPHY_GROUP_DEPTH } from '../types';
import {
  languageStylesOf,
  resolveTypographyStyle,
  overriddenLanguages,
} from '../utils/typographyStyle';
import { modal } from '../components/Modal';
import { BUNDLED_FONTS, type BundledFontSpec } from './bundledFonts';
import { parseWildcardRanges } from '../codegen/typographyWildcards';
import { BUILTIN_FONT_SIZES, builtinFontFor, isBuiltinFont, nearestBuiltinSize } from './builtinFonts';
import type { FontResource } from './types';
import './TypographyManager.css';

/**
 * The one built-in family, as a family rather than 21 font-and-size entries.
 *
 * Size is a separate field: pairing them made one dropdown carry both choices,
 * so picking 24px meant scrolling a list of fonts, and the same font at two
 * sizes looked like two fonts.
 */
const MONTSERRAT = 'montserrat';

/** Prefix marking a dropdown entry that has to be added to the project first. */
const BUNDLED_PREFIX = 'bundled:';

/** The Default tab, which is the typography's own settings. */
const DEFAULT_TAB = '';

const ALIGNMENTS: { value: TypographyAlign; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

/** `montserrat_24` → `montserrat`; a custom font's C name is its own family. */
function familyOf(fontResource: string): string {
  return isBuiltinFont(fontResource) ? MONTSERRAT : fontResource;
}

/**
 * Turn a family and a size into the stored `fontResource`.
 *
 * Only the built-in carries its size in its name, which is why the two fields
 * cannot be stored as typed for it — and why the size snaps to one the build
 * actually has.
 */
function fontResourceFor(family: string, size: number): string {
  return family === MONTSERRAT ? builtinFontFor(size) : family;
}

/**
 * Font family picker.
 *
 * Mirrors the Fonts tab's tree: Built-in / Bundled / Project fonts, every
 * entry in the same place whether or not the project has added it. Choosing
 * an unadded bundled font adds it.
 */
function FontFamilySelect({
  value,
  onChange,
  fonts,
  addBundledFont,
  baseLabel,
}: {
  value: string;
  onChange: (family: string) => void;
  fonts: FontResource[];
  addBundledFont: (spec: BundledFontSpec) => Promise<FontResource>;
  /** Label for the empty option. Omitted when the field cannot be empty. */
  baseLabel?: string;
}): React.ReactNode {
  const [adding, setAdding] = useState(false);
  const uploaded = fonts.filter((font) => !font.bundled);

  /**
   * A bundled font's entry carries its catalogue id until it exists as a
   * resource, and its C name afterwards — so the option keeps its place in the
   * list while what selecting it has to do changes.
   */
  const bundledValue = (spec: BundledFontSpec): string => {
    const added = fonts.find((font) => font.bundled === spec.id);
    return added ? added.cFontName : `${BUNDLED_PREFIX}${spec.id}`;
  };

  const handleChange = async (raw: string) => {
    // A select whose value names no option reports '', and storing that as a
    // font resource leaves a typography pointing at nothing. Reachable only
    // when the list changes under a pending selection, but the cost of not
    // guarding it is a style that silently renders as the default.
    if (raw === '' && baseLabel === undefined) return;
    if (!raw.startsWith(BUNDLED_PREFIX)) {
      onChange(raw);
      return;
    }
    const spec = BUNDLED_FONTS.find((candidate) => candidate.id === raw.slice(BUNDLED_PREFIX.length));
    if (!spec) return;
    setAdding(true);
    try {
      const font = await addBundledFont(spec);
      onChange(font.cFontName);
    } catch (error) {
      modal.alert(`Could not add ${spec.label}: ${String(error)}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    // The same three groups, in the same order, as the Fonts tab's tree — one
    // mental model, not one per surface. "Built-in" means compiled into LVGL;
    // "Bundled" ships with the studio and is added by selecting it; "Project
    // fonts" is what the author uploaded. Every entry keeps its place whether
    // or not it has been added.
    <select value={value} disabled={adding} onChange={(event) => handleChange(event.target.value)}>
      {baseLabel !== undefined && <option value="">{baseLabel}</option>}
      <optgroup label="Built-in">
        <option value={MONTSERRAT}>Montserrat</option>
      </optgroup>
      <optgroup label="Bundled">
        {BUNDLED_FONTS.map((spec) => (
          <option key={spec.id} value={bundledValue(spec)}>{spec.label}</option>
        ))}
      </optgroup>
      {uploaded.length > 0 && (
        <optgroup label="Project fonts">
          {uploaded.map((font) => (
            <option key={font.id} value={font.cFontName}>{font.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/**
 * Pixel size, typed rather than chosen from a list.
 *
 * The draft is local so a half-typed "2" on its way to "24" is not committed
 * as 2 — and, for the built-in font, not snapped to 8 mid-keystroke.
 */
function SizeInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (size: number) => void;
}): React.ReactNode {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed > 0) onCommit(Math.round(parsed));
    setDraft(null);
  };

  return (
    <input
      type="number"
      min={1}
      className="size-input"
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setDraft(null);
      }}
    />
  );
}

const TypographyManager: React.FC = () => {
  const typographies = useEditorStore((s) => s.typographies);
  const typographyGroups = useEditorStore((s) => s.typographyGroups);
  const languages = useEditorStore((s) => s.languages);
  const screens = useEditorStore((s) => s.screens);
  const addTypography = useEditorStore((s) => s.addTypography);
  const updateTypography = useEditorStore((s) => s.updateTypography);
  const deleteTypography = useEditorStore((s) => s.deleteTypography);
  const setTypographyLanguageStyle = useEditorStore((s) => s.setTypographyLanguageStyle);
  const clearTypographyLanguage = useEditorStore((s) => s.clearTypographyLanguage);
  const addTypographyGroup = useEditorStore((s) => s.addTypographyGroup);
  const renameTypographyGroup = useEditorStore((s) => s.renameTypographyGroup);
  const deleteTypographyGroup = useEditorStore((s) => s.deleteTypographyGroup);
  const moveTypographyToGroup = useEditorStore((s) => s.moveTypographyToGroup);
  const canNestTypographyGroup = useEditorStore((s) => s.canNestTypographyGroup);
  const fonts = useResourceStore((s) => s.fonts);
  const addBundledFont = useResourceStore((s) => s.addBundledFont);
  const searchQuery = useResourceStore((s) => s.searchQuery);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<string>(DEFAULT_TAB);
  const [renamingGroupId, setRenamingGroupId] = useState<{ id: string; value: string } | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** How many widgets reference each typography, so deleting one is informed. */
  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const walk = (components: LvglComponent[]) => {
      for (const comp of components) {
        if (comp.typographyId) {
          counts.set(comp.typographyId, (counts.get(comp.typographyId) ?? 0) + 1);
        }
        walk(comp.children ?? []);
      }
    };
    for (const screen of screens) walk(screen.components);
    return counts;
  }, [screens]);

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const matches = useCallback(
    (typography: Typography) =>
      !isSearching
      || typography.name.toLowerCase().includes(query)
      || typography.fontResource.toLowerCase().includes(query),
    [isSearching, query],
  );

  const byGroup = useMemo(() => {
    const map = new Map<string | null, Typography[]>();
    for (const typography of typographies) {
      if (!matches(typography)) continue;
      const key = typography.groupId ?? null;
      map.set(key, [...(map.get(key) ?? []), typography]);
    }
    return map;
  }, [typographies, matches]);

  const groupsByParent = useMemo(() => {
    const map = new Map<string | null, TypographyGroup[]>();
    for (const group of typographyGroups) {
      const key = group.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), group]);
    }
    return map;
  }, [typographyGroups]);

  const selected = typographies.find((t) => t.id === selectedId) ?? null;

  // A tab for a language deleted from the project would edit nothing
  const activeTab = activeLanguage !== DEFAULT_TAB
    && !languages.some((language) => language.code === activeLanguage)
    ? DEFAULT_TAB
    : activeLanguage;
  const isDefaultTab = activeTab === DEFAULT_TAB;

  const handleAddGroup = useCallback((parentId: string | null) => {
    if (!canNestTypographyGroup(parentId)) {
      setNotice(
        `Typography groups can only be nested ${MAX_TYPOGRAPHY_GROUP_DEPTH} levels deep. `
        + 'Add this group one level up instead.',
      );
      return;
    }
    addTypographyGroup(parentId);
  }, [addTypographyGroup, canNestTypographyGroup]);

  const handleDelete = async (typography: Typography, event: React.MouseEvent) => {
    event.stopPropagation();
    const uses = usageCounts.get(typography.id) ?? 0;
    const warning = uses > 0
      ? `${uses} widget${uses === 1 ? '' : 's'} use this. They will go back to the screen's default font.`
      : 'Nothing uses this typography.';
    if (await modal.confirm(`Delete "${typography.name}"?\n\n${warning}`)) {
      deleteTypography(typography.id);
      if (selectedId === typography.id) setSelectedId(null);
    }
  };

  const handleDeleteGroup = async (group: TypographyGroup, event: React.MouseEvent) => {
    event.stopPropagation();
    if (await modal.confirm(
      `Delete the group "${group.name}"?\n\nIts typographies move up a level rather than being deleted.`,
    )) {
      deleteTypographyGroup(group.id);
    }
  };

  const handleDrop = (event: React.DragEvent, groupId: string | null) => {
    if (!draggedId) return;
    event.preventDefault();
    event.stopPropagation();
    const typography = typographies.find((t) => t.id === draggedId);
    // Skip no-op moves
    if (typography && (typography.groupId ?? null) !== groupId) {
      moveTypographyToGroup(draggedId, groupId);
    }
    setDraggedId(null);
    setDropTargetId(null);
  };

  const handleDragOver = (event: React.DragEvent, targetId: string) => {
    if (!draggedId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetId(targetId);
  };

  const describe = (typography: Typography) =>
    `${typography.fontResource.replace(/^ui_font_/, '')} ${typography.fontSize}px`;

  const renderTypographyRow = (typography: Typography, depth: number) => (
    <div
      key={typography.id}
      className={[
        'tm-row tm-typography',
        selectedId === typography.id ? 'selected' : '',
        draggedId === typography.id ? 'dragging' : '',
      ].filter(Boolean).join(' ')}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable
      onDragStart={(event) => {
        setDraggedId(typography.id);
        event.dataTransfer.effectAllowed = 'move';
        // Firefox ignores drags that carry no payload
        event.dataTransfer.setData('text/plain', typography.id);
      }}
      onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }}
      onDragOver={(event) => handleDragOver(event, typography.groupId ?? 'tm-root')}
      onDrop={(event) => handleDrop(event, typography.groupId ?? null)}
      onClick={() => { setSelectedId(typography.id); setActiveLanguage(DEFAULT_TAB); }}
    >
      <span className="tm-icon">🅰</span>
      <span className="tm-label">
        <span className="tm-name">{typography.name}</span>
        <span className="tm-detail">{describe(typography)}</span>
      </span>
      {overriddenLanguages(typography).length > 0 && (
        <span
          className="tm-badge"
          title={`Customised for ${overriddenLanguages(typography).join(', ')}`}
        >
          {overriddenLanguages(typography).length}🌐
        </span>
      )}
      <span className="tm-usage">{usageCounts.get(typography.id) ?? 0}</span>
      <button
        type="button"
        className="tm-row-btn tm-delete"
        onClick={(event) => handleDelete(typography, event)}
        title={`Delete ${typography.name}`}
      >
        🗑
      </button>
    </div>
  );

  const renderGroup = (group: TypographyGroup, depth: number): React.ReactNode => {
    const isCollapsed = !isSearching && collapsedGroupIds.has(group.id);
    const childGroups = groupsByParent.get(group.id) ?? [];
    const childTypographies = byGroup.get(group.id) ?? [];

    return (
      <div key={group.id} className="tm-group">
        <div
          className={`tm-row tm-group-row ${dropTargetId === group.id ? 'drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onDragOver={(event) => handleDragOver(event, group.id)}
          onDrop={(event) => handleDrop(event, group.id)}
          onClick={() => setCollapsedGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(group.id)) next.delete(group.id);
            else next.add(group.id);
            return next;
          })}
          onDoubleClick={() => setRenamingGroupId({ id: group.id, value: group.name })}
        >
          <span className="tm-caret">{isCollapsed ? '▸' : '▾'}</span>
          <span className="tm-icon">📁</span>
          {renamingGroupId?.id === group.id ? (
            <input
              type="text"
              className="tm-rename-input"
              value={renamingGroupId.value}
              onChange={(event) => setRenamingGroupId({ id: group.id, value: event.target.value })}
              onBlur={() => {
                renameTypographyGroup(group.id, renamingGroupId.value);
                setRenamingGroupId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setRenamingGroupId(null);
              }}
              onClick={(event) => event.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="tm-label"><span className="tm-name">{group.name}</span></span>
          )}
          <button
            type="button"
            className="tm-row-btn"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(addTypography({ groupId: group.id }));
              setActiveLanguage(DEFAULT_TAB);
            }}
            title={`New typography in ${group.name}`}
          >
            ＋
          </button>
          <button
            type="button"
            className="tm-row-btn"
            onClick={(event) => { event.stopPropagation(); handleAddGroup(group.id); }}
            title={`New group in ${group.name}`}
          >
            📁
          </button>
          <button
            type="button"
            className="tm-row-btn tm-delete"
            onClick={(event) => handleDeleteGroup(group, event)}
            title={`Delete ${group.name}`}
          >
            🗑
          </button>
        </div>

        {!isCollapsed && (
          <>
            {childGroups.map((child) => renderGroup(child, depth + 1))}
            {childTypographies.map((typography) => renderTypographyRow(typography, depth + 1))}
          </>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------
  // Detail panel
  // ---------------------------------------------------------------------

  /**
   * The settings the active tab shows: the Default itself, or the Default with
   * that language's overrides folded on top.
   */
  const activeStyle = selected ? resolveTypographyStyle(selected, isDefaultTab ? undefined : activeTab) : null;

  /** Does the active language state this property itself, or inherit it? */
  const isOverridden = (field: keyof TypographyLanguageStyle): boolean => {
    if (!selected || isDefaultTab) return false;
    return languageStylesOf(selected)[activeTab]?.[field] !== undefined;
  };

  /**
   * Write to whichever the active tab edits. The Default writes the
   * typography's own fields; a language writes only its difference, which is
   * what keeps it following the Default for everything it does not name.
   */
  const setField = (updates: Partial<TypographyLanguageStyle>) => {
    if (!selected) return;
    if (isDefaultTab) updateTypography(selected.id, updates);
    else setTypographyLanguageStyle(selected.id, activeTab, updates);
  };

  const fieldLabel = (label: string, field: keyof TypographyLanguageStyle) => (
    <label className={isOverridden(field) ? 'tm-field-label overridden' : 'tm-field-label'}>
      {label}
      {isOverridden(field) && <span className="tm-override-dot" title="Set for this language" />}
    </label>
  );

  return (
    <div className="typography-manager">
      <div className="tm-tree-pane">
        <div className="tm-tree-toolbar">
          <button
            type="button"
            className="tm-primary-btn"
            onClick={() => { setSelectedId(addTypography()); setActiveLanguage(DEFAULT_TAB); }}
          >
            <span className="tm-primary-btn-icon">＋</span>
            New Typography
          </button>
          <button
            type="button"
            className="tm-secondary-btn"
            onClick={() => handleAddGroup(null)}
            title="New group"
          >
            📁
          </button>
        </div>

        {notice && (
          <div className="tm-notice" onClick={() => setNotice(null)}>{notice}</div>
        )}

        <div
          className={`tm-tree ${dropTargetId === 'tm-root' ? 'drop-target' : ''}`}
          onDragOver={(event) => handleDragOver(event, 'tm-root')}
          onDrop={(event) => handleDrop(event, null)}
        >
          {typographies.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🅰️</span>
              <p>No typographies yet</p>
              <p className="empty-hint">
                A typography is a named text style — font, size, spacing, alignment — shared by
                every widget that uses it, and the only thing that can carry a per-language font.
              </p>
            </div>
          ) : (
            <>
              {(groupsByParent.get(null) ?? []).map((group) => renderGroup(group, 0))}
              {(byGroup.get(null) ?? []).map((typography) => renderTypographyRow(typography, 0))}
              {isSearching
                && (byGroup.get(null) ?? []).length === 0
                && typographyGroups.length === 0 && (
                <div className="empty-state"><p>Nothing matches that search</p></div>
              )}
            </>
          )}
        </div>
      </div>

      {selected && activeStyle && (
        <div className="tm-detail-pane">
          <div className="detail-row">
            <label>Typography Id:</label>
            <input
              type="text"
              value={selected.name}
              onChange={(event) => updateTypography(selected.id, { name: event.target.value })}
            />
          </div>
          <p className="typography-hint">
            The identifier the generated style is named after, not a description.
          </p>

          <div className="tm-lang-tabs">
            <button
              type="button"
              className={`tm-lang-tab ${isDefaultTab ? 'active' : ''}`}
              onClick={() => setActiveLanguage(DEFAULT_TAB)}
            >
              Default
            </button>
            {languages.map((language) => (
              <button
                key={language.code}
                type="button"
                className={[
                  'tm-lang-tab',
                  activeTab === language.code ? 'active' : '',
                  overriddenLanguages(selected).includes(language.code) ? 'customised' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setActiveLanguage(language.code)}
                title={language.name}
              >
                {language.code}
              </button>
            ))}
          </div>

          <div className="tm-lang-body">
            <p className="typography-hint">
              {isDefaultTab
                ? 'These settings apply to every language that has no tab of its own.'
                : `Only what this tab changes is stored. Everything else follows Default, so editing Default reaches ${languages.find((l) => l.code === activeTab)?.name ?? activeTab} too.`}
            </p>

            <div className="detail-row">
              {fieldLabel('Font:', 'fontResource')}
              <FontFamilySelect
                value={familyOf(activeStyle.fontResource)}
                fonts={fonts}
                addBundledFont={addBundledFont}
                onChange={(family) => {
                  const fontSize = family === MONTSERRAT
                    ? nearestBuiltinSize(activeStyle.fontSize)
                    : activeStyle.fontSize;
                  setField({ fontResource: fontResourceFor(family, fontSize), fontSize });
                }}
              />
            </div>

            <div className="detail-row">
              {fieldLabel('Size:', 'fontSize')}
              <SizeInput
                value={activeStyle.fontSize}
                onCommit={(size) => {
                  const family = familyOf(activeStyle.fontResource);
                  const fontSize = family === MONTSERRAT ? nearestBuiltinSize(size) : size;
                  setField({ fontResource: fontResourceFor(family, fontSize), fontSize });
                }}
              />
              {isBuiltinFont(activeStyle.fontResource) && (
                <span className="typography-hint">
                  Montserrat is compiled in at {BUILTIN_FONT_SIZES.join(', ')}px only; any other
                  size snaps to the nearest.
                </span>
              )}
            </div>

            <div className="detail-section">
              {fieldLabel('Alignment:', 'align')}
              <div className="size-grid">
                {ALIGNMENTS.map((alignment) => (
                  <button
                    key={alignment.value}
                    className={`size-btn ${(activeStyle.align ?? 'auto') === alignment.value ? 'active' : ''}`}
                    onClick={() => setField({ align: alignment.value })}
                  >
                    {alignment.label}
                  </button>
                ))}
              </div>
              <span className="typography-hint">Auto follows the writing direction.</span>
            </div>

            <div className="detail-row">
              {fieldLabel('Letter spacing:', 'letterSpace')}
              <input
                type="number"
                value={activeStyle.letterSpace ?? 0}
                onChange={(event) => setField({ letterSpace: Number(event.target.value) })}
              />
            </div>

            <div className="detail-row">
              {fieldLabel('Line spacing:', 'lineSpace')}
              <input
                type="number"
                value={activeStyle.lineSpace ?? 0}
                onChange={(event) => setField({ lineSpace: Number(event.target.value) })}
              />
            </div>

            <div className="detail-section">
              {fieldLabel('Decoration:', 'decor')}
              <div className="size-grid">
                {(['none', 'underline', 'strikethrough'] as const).map((decor) => (
                  <button
                    key={decor}
                    className={`size-btn ${(activeStyle.decor ?? 'none') === decor ? 'active' : ''}`}
                    onClick={() => setField({ decor })}
                  >
                    {decor === 'none' ? 'None' : decor === 'underline' ? 'Underline' : 'Strike'}
                  </button>
                ))}
              </div>
            </div>

            <div className="detail-section">
              {fieldLabel('Direction:', 'baseDir')}
              <div className="size-grid">
                {(['auto', 'ltr', 'rtl'] as const).map((dir) => (
                  <button
                    key={dir}
                    className={`size-btn ${(activeStyle.baseDir ?? 'auto') === dir ? 'active' : ''}`}
                    onClick={() => setField({ baseDir: dir })}
                  >
                    {dir.toUpperCase()}
                  </button>
                ))}
              </div>
              {(activeStyle.baseDir ?? 'auto') !== 'auto' && (
                <span className="typography-warning">
                  Right-to-left needs LV_USE_BIDI enabled in the firmware's lv_conf.h. It is off on
                  every board today, so this has no effect yet.
                </span>
              )}
            </div>

            {!isDefaultTab && (
              <div className="detail-row">
                <label />
                <button
                  type="button"
                  className="tm-secondary-btn"
                  disabled={!overriddenLanguages(selected).includes(activeTab)}
                  onClick={() => clearTypographyLanguage(selected.id, activeTab)}
                >
                  Follow Default again
                </button>
              </div>
            )}
          </div>

          {isDefaultTab && (
            <div className="tm-wildcards">
              <div className="detail-row">
                <label>Wildcard characters:</label>
                <input
                  type="text"
                  value={selected.wildcardCharacters ?? ''}
                  placeholder="e.g. °℃%"
                  onChange={(event) =>
                    updateTypography(selected.id, { wildcardCharacters: event.target.value || undefined })}
                />
              </div>
              <div className="detail-row">
                <label>Wildcard ranges:</label>
                <input
                  type="text"
                  value={selected.wildcardRanges ?? ''}
                  placeholder="e.g. 0-9, 0x4E00-0x9FFF"
                  onChange={(event) =>
                    updateTypography(selected.id, { wildcardRanges: event.target.value || undefined })}
                />
              </div>
              {(() => {
                const { invalid } = parseWildcardRanges(selected.wildcardRanges ?? '');
                return invalid.length > 0 ? (
                  <span className="typography-warning">
                    Ignored: {invalid.join(', ')} — each side of a range is a single character or
                    0x hex, so digits are 0-9 and a block is 0x4E00-0x9FFF.
                  </span>
                ) : null;
              })()}
              <span className="typography-hint">
                Characters runtime values may substitute in — a Modbus string, a formatted number —
                which no walk of the project can see. Converted into every font this typography
                resolves to, in every language.
              </span>
              <div className="detail-row">
                <label>Fallback character:</label>
                <input
                  type="text"
                  maxLength={2}
                  value={selected.fallbackCharacter ?? ''}
                  placeholder="none"
                  onChange={(event) =>
                    updateTypography(selected.id, { fallbackCharacter: event.target.value || undefined })}
                />
              </div>
              <span className="typography-hint">
                Drawn in place of a glyph the font lacks — which, with the character set covering
                the project's own text, can only be one a runtime value brought in. Generated as a
                substitute font on LVGL's fallback chain, rendered in this typography's face.
              </span>
            </div>
          )}

          <div className="typography-usage-note">
            Used by {usageCounts.get(selected.id) ?? 0} widget
            {(usageCounts.get(selected.id) ?? 0) === 1 ? '' : 's'}.
          </div>
        </div>
      )}
    </div>
  );
};

export default TypographyManager;
