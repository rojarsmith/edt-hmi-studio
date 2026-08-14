// Typographies: named text styles shared across widgets.
//
// Each becomes one generated lv_style_t. Editing one changes every widget that
// references it, which is the point — see docs/text-typography-evaluation.md §5.

import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useResourceStore } from './resourceStore';
import type { Typography, TypographyAlign, LvglComponent } from '../types';
import { modal } from '../components/Modal';
import './TypographyManager.css';

/** Sizes LVGL ships a built-in Montserrat for. */
const BUILTIN_SIZES = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48];
const CUSTOM_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72];

const ALIGNMENTS: { value: TypographyAlign; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

function isBuiltinFont(name: string): boolean {
  return /^montserrat_\d+$/.test(name);
}

const TypographyManager: React.FC = () => {
  const typographies = useEditorStore((s) => s.typographies);
  const languages = useEditorStore((s) => s.languages);
  const screens = useEditorStore((s) => s.screens);
  const addTypography = useEditorStore((s) => s.addTypography);
  const updateTypography = useEditorStore((s) => s.updateTypography);
  const deleteTypography = useEditorStore((s) => s.deleteTypography);
  const fonts = useResourceStore((s) => s.fonts);
  const searchQuery = useResourceStore((s) => s.searchQuery);

  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return typographies;
    return typographies.filter(
      (t) => t.name.toLowerCase().includes(query) || t.fontResource.toLowerCase().includes(query),
    );
  }, [typographies, searchQuery]);

  const selected = typographies.find((t) => t.id === selectedId) ?? null;

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

  const describe = (typography: Typography) =>
    `${typography.fontResource.replace(/^ui_font_/, '')} ${typography.fontSize}px`;

  const sizesFor = (fontResource: string) =>
    isBuiltinFont(fontResource) ? BUILTIN_SIZES : CUSTOM_SIZES;

  return (
    <div className="typography-manager">
      <div className="resource-toolbar">
        <button className="upload-btn" onClick={() => setSelectedId(addTypography())}>
          ＋ New Typography
        </button>
      </div>

      <div className="typography-list">
        {visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🅰️</span>
            <p>{typographies.length === 0 ? 'No typographies yet' : 'Nothing matches that search'}</p>
            {typographies.length === 0 && (
              <p className="empty-hint">
                A typography is a named text style — font, size, spacing, alignment — shared by
                every widget that uses it.
              </p>
            )}
          </div>
        ) : (
          visible.map((typography) => (
            <div
              key={typography.id}
              className={`typography-item ${selectedId === typography.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(typography.id)}
            >
              <div className="typography-info">
                <span className="typography-name">{typography.name}</span>
                <span className="typography-detail">{describe(typography)}</span>
              </div>
              <span className="typography-usage">
                {usageCounts.get(typography.id) ?? 0} used
              </span>
              <button
                className="delete-btn"
                onClick={(event) => handleDelete(typography, event)}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div className="typography-details">
          <h4>Typography</h4>

          <div className="detail-row">
            <label>Name:</label>
            <input
              type="text"
              value={selected.name}
              onChange={(event) => updateTypography(selected.id, { name: event.target.value })}
            />
          </div>

          <div className="detail-section">
            <label>Font:</label>
            <select
              value={selected.fontResource}
              onChange={(event) => {
                const fontResource = event.target.value;
                // A built-in font's size is fixed by its name
                const builtin = fontResource.match(/^montserrat_(\d+)$/);
                updateTypography(selected.id, {
                  fontResource,
                  ...(builtin ? { fontSize: Number(builtin[1]) } : {}),
                });
              }}
            >
              <optgroup label="Built-in">
                {BUILTIN_SIZES.map((size) => (
                  <option key={size} value={`montserrat_${size}`}>Montserrat {size}</option>
                ))}
              </optgroup>
              {fonts.length > 0 && (
                <optgroup label="Custom">
                  {fonts.map((font) => (
                    <option key={font.id} value={font.cFontName}>{font.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="detail-section">
            <label>Size:</label>
            {isBuiltinFont(selected.fontResource) ? (
              <span className="typography-hint">
                Fixed at {selected.fontSize}px — a built-in font carries its size in its name.
              </span>
            ) : (
              <div className="size-grid">
                {sizesFor(selected.fontResource).map((size) => (
                  <button
                    key={size}
                    className={`size-btn ${selected.fontSize === size ? 'active' : ''}`}
                    onClick={() => updateTypography(selected.id, { fontSize: size })}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="detail-section">
            <label>Alignment:</label>
            <div className="size-grid">
              {ALIGNMENTS.map((alignment) => (
                <button
                  key={alignment.value}
                  className={`size-btn ${(selected.align ?? 'auto') === alignment.value ? 'active' : ''}`}
                  onClick={() => updateTypography(selected.id, { align: alignment.value })}
                >
                  {alignment.label}
                </button>
              ))}
            </div>
            <span className="typography-hint">Auto follows the writing direction.</span>
          </div>

          <div className="detail-row">
            <label>Letter spacing:</label>
            <input
              type="number"
              value={selected.letterSpace ?? 0}
              onChange={(event) => updateTypography(selected.id, { letterSpace: Number(event.target.value) })}
            />
          </div>

          <div className="detail-row">
            <label>Line spacing:</label>
            <input
              type="number"
              value={selected.lineSpace ?? 0}
              onChange={(event) => updateTypography(selected.id, { lineSpace: Number(event.target.value) })}
            />
          </div>

          <div className="detail-section">
            <label>Decoration:</label>
            <div className="size-grid">
              {(['none', 'underline', 'strikethrough'] as const).map((decor) => (
                <button
                  key={decor}
                  className={`size-btn ${(selected.decor ?? 'none') === decor ? 'active' : ''}`}
                  onClick={() => updateTypography(selected.id, { decor })}
                >
                  {decor === 'none' ? 'None' : decor === 'underline' ? 'Underline' : 'Strike'}
                </button>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <label>Direction:</label>
            <div className="size-grid">
              {(['auto', 'ltr', 'rtl'] as const).map((dir) => (
                <button
                  key={dir}
                  className={`size-btn ${(selected.baseDir ?? 'auto') === dir ? 'active' : ''}`}
                  onClick={() => updateTypography(selected.id, { baseDir: dir })}
                >
                  {dir.toUpperCase()}
                </button>
              ))}
            </div>
            {(selected.baseDir ?? 'auto') !== 'auto' && (
              <span className="typography-warning">
                Right-to-left needs LV_USE_BIDI enabled in the firmware's lv_conf.h. It is off on
                every board today, so this has no effect yet.
              </span>
            )}
          </div>

          {languages.length > 0 && (
            <div className="detail-section">
              <label>Language fonts:</label>
              <span className="typography-hint">
                A language without an override uses the base font above. Overridden languages get
                their own font on the device the moment the language switches.
              </span>
              {languages.map((language) => {
                const override = selected.languageFonts?.[language.code];
                const setOverride = (value?: { fontResource: string; fontSize: number }) => {
                  const next = { ...(selected.languageFonts ?? {}) };
                  if (value) next[language.code] = value;
                  else delete next[language.code];
                  updateTypography(selected.id, {
                    languageFonts: Object.keys(next).length > 0 ? next : undefined,
                  });
                };
                return (
                  <div key={language.code} className="language-font-row">
                    <span className="language-font-name">{language.name}</span>
                    <select
                      value={override?.fontResource ?? ''}
                      onChange={(event) => {
                        const fontResource = event.target.value;
                        if (!fontResource) { setOverride(undefined); return; }
                        // A built-in font's size is fixed by its name; a custom
                        // one starts at the base size, the likeliest intent
                        const builtin = fontResource.match(/^montserrat_(\d+)$/);
                        setOverride({
                          fontResource,
                          fontSize: builtin ? Number(builtin[1]) : selected.fontSize,
                        });
                      }}
                    >
                      <option value="">Base font</option>
                      <optgroup label="Built-in">
                        {BUILTIN_SIZES.map((size) => (
                          <option key={size} value={`montserrat_${size}`}>Montserrat {size}</option>
                        ))}
                      </optgroup>
                      {fonts.length > 0 && (
                        <optgroup label="Custom">
                          {fonts.map((font) => (
                            <option key={font.id} value={font.cFontName}>{font.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {override && !isBuiltinFont(override.fontResource) && (
                      <select
                        className="language-font-size"
                        value={override.fontSize}
                        onChange={(event) =>
                          setOverride({ ...override, fontSize: Number(event.target.value) })}
                      >
                        {CUSTOM_SIZES.map((size) => (
                          <option key={size} value={size}>{size}px</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
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
