// Typographies: named text styles shared across widgets.
//
// Each becomes one generated lv_style_t. Editing one changes every widget that
// references it, which is the point — see docs/text-typography-evaluation.md §5.

import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useResourceStore } from './resourceStore';
import type { Typography, TypographyAlign, LvglComponent } from '../types';
import { modal } from '../components/Modal';
import { BUNDLED_FONTS, type BundledFontSpec } from './bundledFonts';
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
 * Everything that ships with the studio sits under one heading whether or not
 * the project has added it, and choosing an unadded one adds it. The earlier
 * split — a "bundled" group that emptied into a "project fonts" group as fonts
 * were used — showed the same font under two headings depending on internal
 * state, which is the editor's bookkeeping rather than anything the author
 * chose. *Project fonts* now means only what the author uploaded.
 *
 * Montserrat is grouped with them but is not the same kind of thing: it is
 * compiled into LVGL, so it needs no conversion and exists only at the sizes
 * lv_conf.h switches on. The others are converted per size, charset-trimmed.
 */
function FontFamilySelect({
  value,
  onChange,
  fonts,
  addBundledFont,
  baseLabel,
}: {
  /** Family, `''` for "inherit the base", or undefined when nothing is set. */
  value: string;
  onChange: (family: string) => void;
  fonts: FontResource[];
  addBundledFont: (spec: BundledFontSpec) => Promise<FontResource>;
  /** Label for the empty option. Omitted when the field cannot be empty. */
  baseLabel?: string;
}): React.ReactNode {
  const [adding, setAdding] = useState(false);

  // Only what the author uploaded. A bundled font already has its entry above,
  // in the same place whether or not it has been added yet
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
    <select value={value} disabled={adding} onChange={(event) => handleChange(event.target.value)}>
      {baseLabel !== undefined && <option value="">{baseLabel}</option>}
      <optgroup label="Built-in">
        <option value={MONTSERRAT}>Montserrat</option>
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
  const languages = useEditorStore((s) => s.languages);
  const screens = useEditorStore((s) => s.screens);
  const addTypography = useEditorStore((s) => s.addTypography);
  const updateTypography = useEditorStore((s) => s.updateTypography);
  const deleteTypography = useEditorStore((s) => s.deleteTypography);
  const fonts = useResourceStore((s) => s.fonts);
  const addBundledFont = useResourceStore((s) => s.addBundledFont);
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

          <div className="detail-row">
            <label>Font:</label>
            <FontFamilySelect
              value={familyOf(selected.fontResource)}
              fonts={fonts}
              addBundledFont={addBundledFont}
              onChange={(family) => {
                // Keeping the size across a font change is the likelier intent;
                // the built-in only ships certain sizes, so it snaps
                const fontSize = family === MONTSERRAT
                  ? nearestBuiltinSize(selected.fontSize)
                  : selected.fontSize;
                updateTypography(selected.id, {
                  fontResource: fontResourceFor(family, fontSize),
                  fontSize,
                });
              }}
            />
          </div>

          <div className="detail-row">
            <label>Size:</label>
            <SizeInput
              value={selected.fontSize}
              onCommit={(size) => {
                const family = familyOf(selected.fontResource);
                const fontSize = family === MONTSERRAT ? nearestBuiltinSize(size) : size;
                updateTypography(selected.id, {
                  fontResource: fontResourceFor(family, fontSize),
                  fontSize,
                });
              }}
            />
            {isBuiltinFont(selected.fontResource) && (
              <span className="typography-hint">
                Montserrat is compiled in at {BUILTIN_FONT_SIZES.join(', ')}px only; any other size
                snaps to the nearest. A size that is not compiled in has no symbol to link against.
              </span>
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
                    <FontFamilySelect
                      value={override ? familyOf(override.fontResource) : ''}
                      baseLabel="Base font"
                      fonts={fonts}
                      addBundledFont={addBundledFont}
                      onChange={(family) => {
                        if (!family) { setOverride(undefined); return; }
                        // Starts at the base size, the likeliest intent
                        const fontSize = family === MONTSERRAT
                          ? nearestBuiltinSize(override?.fontSize ?? selected.fontSize)
                          : override?.fontSize ?? selected.fontSize;
                        setOverride({ fontResource: fontResourceFor(family, fontSize), fontSize });
                      }}
                    />
                    {override && (
                      <SizeInput
                        value={override.fontSize}
                        onCommit={(size) => {
                          const family = familyOf(override.fontResource);
                          const fontSize = family === MONTSERRAT ? nearestBuiltinSize(size) : size;
                          setOverride({ fontResource: fontResourceFor(family, fontSize), fontSize });
                        }}
                      />
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
