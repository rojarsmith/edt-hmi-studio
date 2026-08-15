// Texts: the words a project displays, one row per string, one column per
// language.
//
// A widget stores the id of a row, not the words, which is what makes a runtime
// language switch possible. Rows are shared — two widgets showing "OK" point at
// the same row — so the usage count is part of the table rather than a detail.
//
// The panel is two halves, TouchGFX's shape. On the left a tree of groups and
// rows — organisational only, like the screen and typography trees, and synced
// with the table: picking a group scopes the table to it, picking a row selects
// it there. On the right the table itself, sortable by Id, with languages as
// columns and a ＋ that adds one.
//
// See docs/text-typography-evaluation.md §3.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useResourceStore } from './resourceStore';
import type { LvglComponent, TextGroup, TextResource } from '../types';
import { MAX_TEXT_GROUP_DEPTH, sameTextKey } from '../types';
import { modal } from '../components/Modal';
import './TypographyManager.css';
import './TextManager.css';

const TextManager: React.FC = () => {
  const languages = useEditorStore((s) => s.languages);
  const texts = useEditorStore((s) => s.texts);
  const textGroups = useEditorStore((s) => s.textGroups);
  const screens = useEditorStore((s) => s.screens);
  const typographies = useEditorStore((s) => s.typographies);
  const setTextTypography = useEditorStore((s) => s.setTextTypography);
  const addLanguage = useEditorStore((s) => s.addLanguage);
  const deleteLanguage = useEditorStore((s) => s.deleteLanguage);
  const updateText = useEditorStore((s) => s.updateText);
  const renameTextKey = useEditorStore((s) => s.renameTextKey);
  const addText = useEditorStore((s) => s.addText);
  const deleteText = useEditorStore((s) => s.deleteText);
  const addTextGroup = useEditorStore((s) => s.addTextGroup);
  const renameTextGroup = useEditorStore((s) => s.renameTextGroup);
  const deleteTextGroup = useEditorStore((s) => s.deleteTextGroup);
  const moveTextToGroup = useEditorStore((s) => s.moveTextToGroup);
  const canNestTextGroup = useEditorStore((s) => s.canNestTextGroup);
  const searchQuery = useResourceStore((s) => s.searchQuery);

  const [newLanguage, setNewLanguage] = useState({ code: '', name: '' });
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState<{ id: string; value: string } | null>(null);
  /** Table scope: a group's texts (subgroups included), or null for all. */
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  /** Id-column sort. 'none' is the stored order projects had before sorting. */
  const [sort, setSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [renamingGroupId, setRenamingGroupId] = useState<{ id: string; value: string } | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** How many widgets show each row. Editing a row edits all of them. */
  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const walk = (components: LvglComponent[]) => {
      for (const comp of components) {
        if (comp.textId) counts.set(comp.textId, (counts.get(comp.textId) ?? 0) + 1);
        walk(comp.children ?? []);
      }
    };
    for (const screen of screens) walk(screen.components);
    return counts;
  }, [screens]);

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const matches = useCallback(
    (text: TextResource) =>
      !isSearching
      || text.key.toLowerCase().includes(query)
      || Object.values(text.values).some((value) => value.toLowerCase().includes(query)),
    [isSearching, query],
  );

  const byGroup = useMemo(() => {
    const map = new Map<string | null, TextResource[]>();
    for (const text of texts) {
      if (!matches(text)) continue;
      const key = text.groupId ?? null;
      map.set(key, [...(map.get(key) ?? []), text]);
    }
    return map;
  }, [texts, matches]);

  const groupsByParent = useMemo(() => {
    const map = new Map<string | null, TextGroup[]>();
    for (const group of textGroups) {
      const key = group.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), group]);
    }
    return map;
  }, [textGroups]);

  /** The selected group plus its children — what the table is scoped to. */
  const scopeGroupIds = useMemo(() => {
    if (selectedGroupId === null) return null;
    const ids = new Set([selectedGroupId]);
    for (const group of textGroups) {
      if (group.parentId && ids.has(group.parentId)) ids.add(group.id);
    }
    return ids;
  }, [selectedGroupId, textGroups]);

  const scopeGroup = textGroups.find((group) => group.id === selectedGroupId) ?? null;

  const tableTexts = useMemo(() => {
    let list = texts.filter(matches);
    if (scopeGroupIds) {
      list = list.filter((text) => text.groupId != null && scopeGroupIds.has(text.groupId));
    }
    if (sort !== 'none') {
      list = [...list].sort((a, b) =>
        a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }));
      if (sort === 'desc') list.reverse();
    }
    return list;
  }, [texts, matches, scopeGroupIds, sort]);

  /** Tree → table: picking a row in the tree brings its table row into view. */
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  useEffect(() => {
    if (!selectedTextId) return;
    rowRefs.current.get(selectedTextId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedTextId, tableTexts]);

  // ---------------------------------------------------------------------
  // Languages
  // ---------------------------------------------------------------------

  const handleAddLanguage = () => {
    const code = newLanguage.code.trim();
    if (!code) return;
    if (languages.some((language) => language.code === code)) {
      modal.alert(`"${code}" is already a column.`);
      return;
    }
    addLanguage(code, newLanguage.name);
    setNewLanguage({ code: '', name: '' });
    setLangMenuOpen(false);
  };

  const handleDeleteLanguage = async (code: string, name: string) => {
    const translated = texts.filter((text) => text.values[code]?.trim()).length;
    const warning = translated > 0
      ? `${translated} text${translated === 1 ? '' : 's'} translated into it will lose those words.`
      : 'Nothing is translated into it yet.';
    if (await modal.confirm(`Remove the ${name} column?\n\n${warning}`)) {
      deleteLanguage(code);
    }
  };

  // ---------------------------------------------------------------------
  // Texts
  // ---------------------------------------------------------------------

  const handleAddText = () => {
    // A text created while a group is in view belongs to that group — the
    // TouchGFX gesture of adding into what you are looking at
    setSelectedTextId(addText(selectedGroupId));
  };

  const handleDeleteText = async (text: TextResource) => {
    const uses = usageCounts.get(text.id) ?? 0;
    const warning = uses > 0
      ? `${uses} widget${uses === 1 ? '' : 's'} use this. They will go back to showing their own text.`
      : 'No widget uses this.';
    if (await modal.confirm(`Delete "${text.key}"?\n\n${warning}`)) {
      deleteText(text.id);
      if (selectedTextId === text.id) setSelectedTextId(null);
    }
  };

  const commitKey = () => {
    if (!keyDraft) return;
    const trimmed = keyDraft.value.trim();
    const clash = texts.find((text) => text.id !== keyDraft.id && sameTextKey(text.key, trimmed));
    if (trimmed && clash) {
      // The id is the tag generated code matches on, so duplicates are not
      // merely untidy. Case is not enough to tell two apart either: `newText`
      // and `newtext` read as the same row and bind the wrong widget
      modal.alert(
        clash.key === trimmed
          ? `"${trimmed}" is already used by another text.`
          : `"${trimmed}" differs from "${clash.key}" only in case. Ids must differ by more than that.`,
      );
    } else {
      renameTextKey(keyDraft.id, trimmed);
    }
    setKeyDraft(null);
  };

  // ---------------------------------------------------------------------
  // Groups and the tree
  // ---------------------------------------------------------------------

  const handleAddGroup = useCallback((parentId: string | null) => {
    if (!canNestTextGroup(parentId)) {
      setNotice(
        `Text groups can only be nested ${MAX_TEXT_GROUP_DEPTH} levels deep. `
        + 'Add this group one level up instead.',
      );
      return;
    }
    const id = addTextGroup(parentId);
    if (id) setSelectedGroupId(id);
  }, [addTextGroup, canNestTextGroup]);

  const handleDeleteGroup = async (group: TextGroup, event: React.MouseEvent) => {
    event.stopPropagation();
    if (await modal.confirm(
      `Delete the group "${group.name}"?\n\nIts texts move up a level rather than being deleted.`,
    )) {
      deleteTextGroup(group.id);
      if (selectedGroupId === group.id) setSelectedGroupId(null);
    }
  };

  const handleDrop = (event: React.DragEvent, groupId: string | null) => {
    if (!draggedId) return;
    event.preventDefault();
    event.stopPropagation();
    const text = texts.find((candidate) => candidate.id === draggedId);
    // Skip no-op moves
    if (text && (text.groupId ?? null) !== groupId) {
      moveTextToGroup(draggedId, groupId);
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

  /** Texts inside a group, its subgroups included — the tree row's count. */
  const countWithin = (groupId: string): number => {
    const direct = (byGroup.get(groupId) ?? []).length;
    const children = groupsByParent.get(groupId) ?? [];
    return direct + children.reduce((sum, child) => sum + countWithin(child.id), 0);
  };

  const renderTextRow = (text: TextResource, depth: number) => (
    <div
      key={text.id}
      className={[
        'tm-row tm-text-row',
        selectedTextId === text.id ? 'selected' : '',
        draggedId === text.id ? 'dragging' : '',
      ].filter(Boolean).join(' ')}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable
      onDragStart={(event) => {
        setDraggedId(text.id);
        event.dataTransfer.effectAllowed = 'move';
        // Firefox ignores drags that carry no payload
        event.dataTransfer.setData('text/plain', text.id);
      }}
      onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }}
      onDragOver={(event) => handleDragOver(event, text.groupId ?? 'tm-root')}
      onDrop={(event) => handleDrop(event, text.groupId ?? null)}
      onClick={() => {
        // Scope the table to where the row lives, so the selection is visible
        setSelectedGroupId(text.groupId ?? null);
        setSelectedTextId(text.id);
      }}
    >
      <span className="tm-icon">🄰</span>
      <span className="tm-label">
        <span className="tm-name text-id">{text.key}</span>
      </span>
      <span className="tm-usage">{usageCounts.get(text.id) ?? 0}</span>
      <button
        type="button"
        className="tm-row-btn tm-delete"
        onClick={(event) => { event.stopPropagation(); handleDeleteText(text); }}
        title={`Delete ${text.key}`}
      >
        🗑
      </button>
    </div>
  );

  const renderGroup = (group: TextGroup, depth: number) => {
    const childGroups = groupsByParent.get(group.id) ?? [];
    const childTexts = byGroup.get(group.id) ?? [];
    const isCollapsed = collapsedGroupIds.has(group.id) && !isSearching;

    return (
      <div key={group.id}>
        <div
          className={[
            'tm-row tm-group-row',
            selectedGroupId === group.id ? 'selected' : '',
            dropTargetId === group.id ? 'drop-target' : '',
          ].filter(Boolean).join(' ')}
          style={{ paddingLeft: 8 + depth * 14 }}
          onDragOver={(event) => handleDragOver(event, group.id)}
          onDrop={(event) => handleDrop(event, group.id)}
          onClick={() => { setSelectedGroupId(group.id); setSelectedTextId(null); }}
          onDoubleClick={() => setRenamingGroupId({ id: group.id, value: group.name })}
        >
          <span
            className="tm-caret"
            onClick={(event) => {
              event.stopPropagation();
              setCollapsedGroupIds((prev) => {
                const next = new Set(prev);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              });
            }}
          >
            {isCollapsed ? '▸' : '▾'}
          </span>
          <span className="tm-icon">📁</span>
          {renamingGroupId?.id === group.id ? (
            <input
              type="text"
              className="tm-rename-input"
              value={renamingGroupId.value}
              onChange={(event) => setRenamingGroupId({ id: group.id, value: event.target.value })}
              onBlur={() => {
                renameTextGroup(group.id, renamingGroupId.value);
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
          <span className="tm-usage">{countWithin(group.id)}</span>
          <button
            type="button"
            className="tm-row-btn"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedGroupId(group.id);
              setSelectedTextId(addText(group.id));
            }}
            title={`New text in ${group.name}`}
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
            {childTexts.map((text) => renderTextRow(text, depth + 1))}
          </>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------

  if (languages.length === 0) {
    return (
      <div className="text-manager">
        <div className="empty-state">
          <span className="empty-icon">🌐</span>
          <p>No languages yet</p>
          <p className="empty-hint">
            Add one to start a text table. The first language is the default — the one whose words
            show when nothing else matches.
          </p>
          <div className="language-add">
            <input
              type="text"
              placeholder="Code, e.g. en"
              value={newLanguage.code}
              onChange={(e) => setNewLanguage({ ...newLanguage, code: e.target.value })}
            />
            <input
              type="text"
              placeholder="Name, e.g. English"
              value={newLanguage.name}
              onChange={(e) => setNewLanguage({ ...newLanguage, name: e.target.value })}
            />
            <button onClick={handleAddLanguage}>Add language</button>
          </div>
        </div>
      </div>
    );
  }

  const scopeTitle = scopeGroup ? scopeGroup.name : 'All texts';

  return (
    <div className="text-manager">
      <div className="tm-tree-pane">
        <div className="tm-tree-toolbar">
          <button type="button" className="tm-primary-btn" onClick={handleAddText}>
            <span className="tm-primary-btn-icon">＋</span>
            New Text
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
          <div
            className={`tm-row tm-all-row ${selectedGroupId === null ? 'selected' : ''}`}
            onClick={() => { setSelectedGroupId(null); setSelectedTextId(null); }}
          >
            <span className="tm-icon">🌐</span>
            <span className="tm-label"><span className="tm-name">All texts</span></span>
            <span className="tm-usage">{texts.length}</span>
          </div>

          {(groupsByParent.get(null) ?? []).map((group) => renderGroup(group, 0))}
          {(byGroup.get(null) ?? []).map((text) => renderTextRow(text, 0))}
          {isSearching
            && (byGroup.get(null) ?? []).length === 0
            && textGroups.length === 0 && (
            <div className="empty-state"><p>Nothing matches that search</p></div>
          )}
        </div>
      </div>

      <div className="text-table-pane">
        <div className="text-scope-head">
          <span className="text-scope-title">{scopeTitle}</span>
          <span className="text-scope-count">
            {tableTexts.length} text{tableTexts.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="text-table-scroll">
          <table className="text-table">
            <thead>
              <tr>
                <th
                  className="col-key sortable"
                  onClick={() => setSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
                  title="Sort by Id"
                >
                  Id
                  <span className={`sort-mark ${sort === 'none' ? 'idle' : ''}`}>
                    {sort === 'desc' ? '▼' : '▲'}
                  </span>
                </th>
                {languages.map((language, index) => (
                  <th key={language.code}>
                    <span className="lang-head">
                      {language.name}
                      <span className="lang-code">{language.code}</span>
                      {index === 0 && <span className="lang-default" title="Shown when a translation is missing">default</span>}
                    </span>
                    {languages.length > 1 && (
                      <button
                        className="lang-remove"
                        onClick={() => handleDeleteLanguage(language.code, language.name)}
                        title={`Remove ${language.name}`}
                      >
                        ×
                      </button>
                    )}
                  </th>
                ))}
                <th className="col-typography">Typography</th>
                <th className="col-used">Used</th>
                <th className="col-actions col-lang-add">
                  {/* TouchGFX's ＋ column: a language is added where the
                      columns are, not from a toolbar far from them */}
                  <button
                    type="button"
                    className="lang-add-btn"
                    onClick={() => setLangMenuOpen((open) => !open)}
                    title="Add a language column"
                  >
                    ＋
                  </button>
                  {langMenuOpen && (
                    <>
                      <span className="tm-lang-add-backdrop" onClick={() => setLangMenuOpen(false)} />
                      <div className="lang-add-menu" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="text"
                          placeholder="Code, e.g. ja"
                          value={newLanguage.code}
                          autoFocus
                          onChange={(e) => setNewLanguage({ ...newLanguage, code: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLanguage(); }}
                        />
                        <input
                          type="text"
                          placeholder="Name, e.g. 日本語"
                          value={newLanguage.name}
                          onChange={(e) => setNewLanguage({ ...newLanguage, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLanguage(); }}
                        />
                        <button type="button" onClick={handleAddLanguage}>Add language</button>
                      </div>
                    </>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {tableTexts.length === 0 ? (
                <tr>
                  <td colSpan={languages.length + 4} className="text-empty">
                    {texts.length === 0
                      ? 'No texts yet. Opening a project derives these from the words already in it.'
                      : scopeGroup
                        ? 'This group has no texts yet — drag rows onto it in the tree, or add one with ＋ New Text.'
                        : 'Nothing matches that search.'}
                  </td>
                </tr>
              ) : (
                tableTexts.map((text) => (
                  <tr
                    key={text.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(text.id, el);
                      else rowRefs.current.delete(text.id);
                    }}
                    className={selectedTextId === text.id ? 'selected' : ''}
                    onClick={() => setSelectedTextId(text.id)}
                  >
                    <td className="col-key">
                      <input
                        type="text"
                        className="key-input"
                        value={keyDraft?.id === text.id ? keyDraft.value : text.key}
                        onChange={(e) => setKeyDraft({ id: text.id, value: e.target.value })}
                        onBlur={commitKey}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setKeyDraft(null);
                        }}
                      />
                    </td>
                    {languages.map((language, index) => {
                      // An options resource holds one line per option; a plain
                      // input would silently flatten those newlines on edit
                      const multiline = Object.values(text.values).some((value) => value.includes('\n'));
                      const shared = {
                        className: `value-input ${!text.values[language.code] && index > 0 ? 'untranslated' : ''}`,
                        value: text.values[language.code] ?? '',
                        placeholder: index === 0 ? '' : text.values[languages[0].code] ?? '',
                      };
                      return (
                        <td key={language.code}>
                          {multiline ? (
                            <textarea
                              {...shared}
                              rows={Math.min(4, (shared.value || shared.placeholder).split('\n').length)}
                              onChange={(e) => updateText(text.id, language.code, e.target.value)}
                            />
                          ) : (
                            <input
                              type="text"
                              {...shared}
                              onChange={(e) => updateText(text.id, language.code, e.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="col-typography">
                      <select
                        className="typography-select"
                        value={text.typographyId ?? ''}
                        onChange={(e) => setTextTypography(text.id, e.target.value || undefined)}
                        title="Every widget bound to this text renders with it"
                      >
                        <option value="">Widget's own</option>
                        {typographies.map((typography) => (
                          <option key={typography.id} value={typography.id}>
                            {typography.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="col-used">{usageCounts.get(text.id) ?? 0}</td>
                    <td className="col-actions">
                      <button className="delete-btn" onClick={() => handleDeleteText(text)} title="Delete">
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-note">
          A row is shared by every widget that shows it, so editing one changes them all — the Used
          column says how many. Untranslated cells fall back to {languages[0].name}, which is what
          LVGL does at runtime too. A row that names a Typography imposes it on every widget bound to
          it, so words that need a particular face carry it with them.
        </p>
      </div>
    </div>
  );
};

export default TextManager;
