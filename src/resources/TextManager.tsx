// Texts: the words a project displays, one row per string, one column per
// language.
//
// A widget stores the id of a row, not the words, which is what makes a runtime
// language switch possible. Rows are shared — two widgets showing "OK" point at
// the same row — so the usage count is part of the table rather than a detail.
//
// See docs/text-typography-evaluation.md §3.

import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useResourceStore } from './resourceStore';
import type { LvglComponent, TextResource } from '../types';
import { sameTextKey } from '../types';
import { modal } from '../components/Modal';
import './TextManager.css';

const TextManager: React.FC = () => {
  const languages = useEditorStore((s) => s.languages);
  const texts = useEditorStore((s) => s.texts);
  const screens = useEditorStore((s) => s.screens);
  const typographies = useEditorStore((s) => s.typographies);
  const setTextTypography = useEditorStore((s) => s.setTextTypography);
  const addLanguage = useEditorStore((s) => s.addLanguage);
  const deleteLanguage = useEditorStore((s) => s.deleteLanguage);
  const updateText = useEditorStore((s) => s.updateText);
  const renameTextKey = useEditorStore((s) => s.renameTextKey);
  const addText = useEditorStore((s) => s.addText);
  const deleteText = useEditorStore((s) => s.deleteText);
  const searchQuery = useResourceStore((s) => s.searchQuery);

  const [newLanguage, setNewLanguage] = useState({ code: '', name: '' });
  const [keyDraft, setKeyDraft] = useState<{ id: string; value: string } | null>(null);

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

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return texts;
    return texts.filter(
      (text) =>
        text.key.toLowerCase().includes(query) ||
        Object.values(text.values).some((v) => v.toLowerCase().includes(query)),
    );
  }, [texts, searchQuery]);

  const handleAddLanguage = () => {
    const code = newLanguage.code.trim();
    if (!code) return;
    if (languages.some((language) => language.code === code)) {
      modal.alert(`"${code}" is already a column.`);
      return;
    }
    addLanguage(code, newLanguage.name);
    setNewLanguage({ code: '', name: '' });
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

  const handleDeleteText = async (text: TextResource) => {
    const uses = usageCounts.get(text.id) ?? 0;
    const warning = uses > 0
      ? `${uses} widget${uses === 1 ? '' : 's'} use this. They will go back to showing their own text.`
      : 'No widget uses this.';
    if (await modal.confirm(`Delete "${text.key}"?\n\n${warning}`)) {
      deleteText(text.id);
    }
  };

  const commitKey = () => {
    if (!keyDraft) return;
    const trimmed = keyDraft.value.trim();
    const clash = texts.find((text) => text.id !== keyDraft.id && sameTextKey(text.key, trimmed));
    if (trimmed && clash) {
      // The key is the tag generated code matches on, so duplicates are not
      // merely untidy. Case is not enough to tell two apart either: `newText`
      // and `newtext` read as the same row and bind the wrong widget
      modal.alert(
        clash.key === trimmed
          ? `"${trimmed}" is already used by another text.`
          : `"${trimmed}" differs from "${clash.key}" only in case. Keys must differ by more than that.`,
      );
    } else {
      renameTextKey(keyDraft.id, trimmed);
    }
    setKeyDraft(null);
  };

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

  return (
    <div className="text-manager">
      <div className="resource-toolbar">
        <button className="upload-btn" onClick={addText}>＋ New Text</button>
        <div className="language-add inline">
          <input
            type="text"
            placeholder="Code"
            value={newLanguage.code}
            onChange={(e) => setNewLanguage({ ...newLanguage, code: e.target.value })}
          />
          <input
            type="text"
            placeholder="Name"
            value={newLanguage.name}
            onChange={(e) => setNewLanguage({ ...newLanguage, name: e.target.value })}
          />
          <button onClick={handleAddLanguage}>＋ Language</button>
        </div>
      </div>

      <div className="text-table-scroll">
        <table className="text-table">
          <thead>
            <tr>
              <th className="col-key">Key</th>
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
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={languages.length + 4} className="text-empty">
                  {texts.length === 0
                    ? 'No texts yet. Opening a project derives these from the words already in it.'
                    : 'Nothing matches that search.'}
                </td>
              </tr>
            ) : (
              visible.map((text) => (
                <tr key={text.id}>
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
  );
};

export default TextManager;
