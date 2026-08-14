// Font Manager Component

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useResourceStore } from './resourceStore';
import type { FontResource, CharsetType, CharsetMode } from './types';
import { toast } from '../components/Toast';
import { modal } from '../components/Modal';
import {
  FONT_PREVIEW_TEXT,
  FONT_PREVIEW_TEXT_CJK,
  generateFontConvCommand,
  generateFontSourceTemplate,
  generateFontCCodeHeader,
  extractCharsFromText,
  resolveFontCharset,
  charsetCodePoints,
  parseFontCoverage,
} from './converters/fontConverter';
import { collectGlyphs, glyphSetKey } from '../codegen/collectGlyphs';
import { useEditorStore } from '../store/editorStore';
import { useAppStore } from '../store/appStore';
import { useProjectStore } from '../store/projectStore';
import { useLogicEditorStore } from '../components/LogicEditor';
import './FontManager.css';

const CHARSET_MODES: { id: CharsetMode; label: string; hint: string }[] = [
  {
    id: 'auto',
    label: 'Auto',
    hint: 'Only the characters this project\'s text actually uses, plus the ASCII baseline.',
  },
  {
    id: 'preset',
    label: 'Preset',
    hint: 'A fixed Unicode block. Simple, but a CJK block is roughly 20,000 glyphs.',
  },
  {
    id: 'manual',
    label: 'Manual',
    hint: 'Exactly the characters and ranges listed below, and nothing else.',
  },
];

/** Track which @font-face rules we've already injected */
const loadedFontFaces = new Set<string>();

/**
 * Dynamically inject a @font-face rule so the browser can render the uploaded font.
 */
function ensureFontFaceLoaded(font: FontResource): string {
  const faceName = `ui-font-${font.id}`;
  if (loadedFontFaces.has(faceName)) return faceName;

  const format = font.data.startsWith('data:font/opentype') || font.name.toLowerCase().endsWith('.otf')
    ? 'opentype' : 'truetype';

  const rule = `@font-face { font-family: "${faceName}"; src: url("${font.data}") format("${format}"); font-display: swap; }`;
  const style = document.createElement('style');
  style.textContent = rule;
  document.head.appendChild(style);
  loadedFontFaces.add(faceName);
  return faceName;
}

const BPP_OPTIONS: (1 | 2 | 4 | 8)[] = [1, 2, 4, 8];

const FontManager: React.FC = () => {
  const {
    getFilteredFonts,
    addFont,
    deleteFont,
    updateFont,
    selectedResourceId,
    setSelectedResource,
  } = useResourceStore();
  
  const fonts = getFilteredFonts();

  // The project's text, so `auto` coverage can be shown as it is edited
  const screens = useEditorStore((s) => s.screens);
  const projectTexts = useEditorStore((s) => s.texts);
  const projectTypographies = useEditorStore((s) => s.typographies);
  const logicGraphs = useLogicEditorStore((s) => s.graphs);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const getProjectConfig = useProjectStore((s) => s.getProjectConfig);
  const [defaultFont, setDefaultFont] = useState<string | undefined>();
  const [defaultFontSize, setDefaultFontSize] = useState<number | undefined>();

  useEffect(() => {
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then((cfg) => {
      if (!cfg) return;
      setDefaultFont(cfg.lvglConfig.defaultFont);
      setDefaultFontSize(cfg.lvglConfig.defaultFontSize);
    });
  }, [currentProjectId, getProjectConfig]);

  // Widgets that set no font of their own are drawn with the project default,
  // so without it most of a project's text would look unattributed
  const glyphs = useMemo(
    () => collectGlyphs({ screens, fontResources: fonts, logicGraphs, texts: projectTexts, typographies: projectTypographies, defaultFont, defaultFontSize }),
    [screens, fonts, logicGraphs, projectTexts, projectTypographies, defaultFont, defaultFontSize],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showHeaderModal, setShowHeaderModal] = useState(false);
  const [generatedCommand, setGeneratedCommand] = useState('');
  const [generatedHeader, setGeneratedHeader] = useState('');
  const [generatedSource, setGeneratedSource] = useState('');
  const [customCharsInput, setCustomCharsInput] = useState('');
  const [showCollected, setShowCollected] = useState(false);
  // Map font id → CSS font-family name
  const [fontFaceMap, setFontFaceMap] = useState<Record<string, string>>({});
  
  // Load @font-face for all fonts
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const font of fonts) {
      map[font.id] = ensureFontFaceLoaded(font);
    }
    setFontFaceMap(prev => {
      // Only update if changed
      const changed = fonts.some(f => prev[f.id] !== map[f.id]);
      return changed ? { ...prev, ...map } : prev;
    });
  }, [fonts]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext !== 'ttf' && ext !== 'otf') {
          console.warn(`Skipping non-font file: ${file.name}`);
          continue;
        }
        await addFont(file);
      }
    } catch (error) {
      console.error('Failed to upload font:', error);
      toast.error('Failed to upload font');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await modal.confirm('Are you sure you want to delete this font?')) {
      deleteFont(id);
    }
  };
  
  /**
   * Code points collected for one font, unioned across every size it is used
   * at — the panel is per font, while the conversion is per font and size.
   */
  const collectedFor = useCallback((font: FontResource) => {
    const points = new Set<number>();
    const sources = new Set<string>();
    for (const size of font.sizes.length > 0 ? font.sizes : [16]) {
      const entry = glyphs.byFontSize.get(glyphSetKey(font.cFontName, size));
      if (!entry) continue;
      for (const cp of entry.codePoints) points.add(cp);
      for (const source of entry.sources) sources.add(`${source.owner}:${source.field}`);
    }
    // Sizes the widgets actually use may differ from font.sizes; sweep the rest
    for (const [, entry] of glyphs.byFontSize) {
      if (entry.cFontName !== font.cFontName) continue;
      for (const cp of entry.codePoints) points.add(cp);
      for (const source of entry.sources) sources.add(`${source.owner}:${source.field}`);
    }
    return { points, textCount: sources.size };
  }, [glyphs]);

  const selectionFor = useCallback(
    (font: FontResource) => resolveFontCharset(font, collectedFor(font).points),
    [collectedFor],
  );

  const handleGenerateCommand = (font: FontResource) => {
    const ext = font.data.startsWith('data:font/opentype') ? '.otf' : '.ttf';
    const command = generateFontConvCommand(
      font.name + ext,
      font.cFontName,
      font.sizes,
      font.bpp,
      selectionFor(font),
    );
    setGeneratedCommand(command);
    setShowCommandModal(true);
  };

  const handleGenerateHeader = (font: FontResource) => {
    const selection = selectionFor(font);
    // Generate header for the first selected size
    const primarySize = font.sizes[0] || 16;
    const header = generateFontCCodeHeader(font.cFontName, font.family, primarySize, font.bpp, selection);
    const source = generateFontSourceTemplate(font.cFontName, font.family, font.style, primarySize, font.bpp, selection);
    setGeneratedHeader(header);
    setGeneratedSource(source);
    setShowHeaderModal(true);
  };

  const handleExtractChars = () => {
    const input = selectedFont?.extraChars ?? customCharsInput;
    const chars = extractCharsFromText(input);
    setCustomCharsInput(chars);
    if (selectedFont) {
      updateFont(selectedFont.id, { extraChars: chars });
    }
  };
  
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getFormatLabel = (font: FontResource): string => {
    if (font.data.startsWith('data:font/opentype') || font.name.toLowerCase().endsWith('.otf')) return 'OTF';
    return 'TTF';
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getGlyphCount = (font: FontResource): number =>
    charsetCodePoints(selectionFor(font)).size;
  
  const selectedFont = fonts.find(f => f.id === selectedResourceId);

  /**
   * Which code points each font file can actually draw, parsed on demand.
   *
   * Kept in a ref because a CJK cmap is ~45,000 entries and parsing costs
   * around 100ms — worth doing once per font, not once per render.
   * `null` means the font carries no cmap we understand, which is different
   * from "covers nothing" and must not produce warnings.
   */
  const coverageCache = useRef(new Map<string, Set<number> | null>());
  const [coverageVersion, setCoverageVersion] = useState(0);

  useEffect(() => {
    const font = selectedFont;
    if (!font || coverageCache.current.has(font.id)) return;
    let cancelled = false;
    parseFontCoverage(font.data).then((covered) => {
      if (cancelled) return;
      coverageCache.current.set(font.id, covered);
      setCoverageVersion((v) => v + 1);
    });
    return () => { cancelled = true; };
  }, [selectedFont]);

  /** Characters the project uses that this font file does not contain. */
  const missingGlyphs = useMemo(() => {
    if (!selectedFont) return [];
    const covered = coverageCache.current.get(selectedFont.id);
    if (!covered) return []; // still parsing, or no readable cmap
    return [...collectedFor(selectedFont).points]
      .filter((cp) => !covered.has(cp))
      .sort((a, b) => a - b);
    // coverageVersion re-runs this once the parse lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFont, collectedFor, coverageVersion]);
  
  return (
    <div className="font-manager">
      {/* Toolbar */}
      <div className="resource-toolbar">
        <button 
          className="upload-btn"
          onClick={handleUploadClick}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : '📤 Upload Font'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttf,.otf"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
      
      {/* Font List */}
      <div className="font-list">
        {fonts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🔤</span>
            <p>No font resources yet</p>
            <p className="empty-hint">Use the button above to upload a TTF or OTF font</p>
          </div>
        ) : (
          fonts.map(font => (
            <div
              key={font.id}
              className={`font-item ${selectedResourceId === font.id ? 'selected' : ''}`}
              onClick={() => setSelectedResource(font.id)}
            >
              <div className="font-preview">
                <span 
                  className="preview-text"
                  style={{ fontFamily: fontFaceMap[font.id] || font.family }}
                >
                  Aa
                </span>
              </div>
              <div className="font-info">
                <span className="font-name" title={font.name}>{font.name}</span>
                <span className="font-family">{font.family} {font.style}</span>
                <span className="font-sizes">
                  {getFormatLabel(font)} · {formatFileSize(font.size)}
                </span>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => handleDelete(font.id, e)}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>
      
      {/* Selected Font Details */}
      {selectedFont && (
        <div className="font-details">
          <h4>Font Properties</h4>

          {/* Metadata */}
          <div className="font-meta-grid">
            <div className="meta-item">
              <span className="meta-label">File Name</span>
              <span className="meta-value">{selectedFont.name}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Format</span>
              <span className="meta-value">{getFormatLabel(selectedFont)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Size</span>
              <span className="meta-value">{formatFileSize(selectedFont.size)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Font Family</span>
              <span className="meta-value">{selectedFont.family}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Style</span>
              <span className="meta-value">{selectedFont.style}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Glyph Count</span>
              <span className="meta-value">{getGlyphCount(selectedFont).toLocaleString()}</span>
            </div>
          </div>
          
          <div className="detail-row">
            <label>Name:</label>
            <input
              type="text"
              value={selectedFont.name}
              onChange={(e) => updateFont(selectedFont.id, { name: e.target.value })}
            />
          </div>
          
          <div className="detail-row">
            <label>C Variable Name:</label>
            <input
              type="text"
              value={selectedFont.cFontName}
              onChange={(e) => updateFont(selectedFont.id, { cFontName: e.target.value })}
            />
          </div>
          
          <div className="detail-section">
            <label>Character Set:</label>
            <div className="charset-mode-row">
              {CHARSET_MODES.map((mode) => (
                <button
                  key={mode.id}
                  className={`charset-mode-btn ${selectedFont.charsetMode === mode.id ? 'active' : ''}`}
                  onClick={() => updateFont(selectedFont.id, { charsetMode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <span className="charset-hint">
              {CHARSET_MODES.find((m) => m.id === selectedFont.charsetMode)?.hint}
            </span>
          </div>

          {selectedFont.charsetMode === 'auto' && (
            <div className="detail-section">
              <div className="charset-summary">
                <strong>{collectedFor(selectedFont).points.size.toLocaleString()}</strong> characters
                {' '}from {collectedFor(selectedFont).textCount} text
                {collectedFor(selectedFont).textCount === 1 ? '' : 's'}
                {' · '}95 ASCII baseline
                {selectedFont.extraChars ? ` · ${[...selectedFont.extraChars].length} extra` : ''}
              </div>
              <button className="extract-btn" onClick={() => setShowCollected((v) => !v)}>
                {showCollected ? 'Hide collected characters' : 'Preview collected characters'}
              </button>
              {showCollected && (
                <div className="charset-preview-box">
                  {String.fromCodePoint(...[...collectedFor(selectedFont).points].sort((a, b) => a - b))
                    || '(nothing collected yet)'}
                </div>
              )}
              {missingGlyphs.length > 0 && (
                <p className="charset-error">
                  This font file has no glyph for {missingGlyphs.length} character
                  {missingGlyphs.length === 1 ? '' : 's'} the project uses:
                  {' '}<span className="charset-missing-list">
                    {String.fromCodePoint(...missingGlyphs.slice(0, 40))}
                  </span>
                  {missingGlyphs.length > 40 ? ' …' : ''}
                  . They will be dropped silently during conversion and show as
                  {' '}blanks on the panel — use a font that covers them, or a fallback font.
                </p>
              )}
              {glyphs.opaque.length > 0 && (
                <p className="charset-warning">
                  {glyphs.opaque.length} place{glyphs.opaque.length === 1 ? '' : 's'} in this project
                  {' '}use custom C, which cannot be scanned for characters. Anything they display
                  {' '}has to be listed under Extra characters below.
                </p>
              )}
            </div>
          )}

          {selectedFont.charsetMode === 'preset' && (
            <div className="detail-section">
              <label>Preset:</label>
              <select
                value={selectedFont.charset}
                onChange={(e) => updateFont(selectedFont.id, { charset: e.target.value as CharsetType })}
              >
                <option value="ascii">ASCII (Basic)</option>
                <option value="latin">Latin Extended</option>
                <option value="cjk-basic">CJK Basic</option>
              </select>
            </div>
          )}

          <div className="detail-section">
            <label>{selectedFont.charsetMode === 'manual' ? 'Characters:' : 'Extra Characters:'}</label>
            <textarea
              value={selectedFont.extraChars ?? customCharsInput}
              onChange={(e) => {
                setCustomCharsInput(e.target.value);
                updateFont(selectedFont.id, { extraChars: e.target.value });
              }}
              placeholder={
                selectedFont.charsetMode === 'manual'
                  ? 'Every character this font should contain'
                  : 'Characters no scan can see — values shown from custom C, for example'
              }
              rows={3}
            />
            <button className="extract-btn" onClick={handleExtractChars}>
              Extract Unique Characters
            </button>
          </div>

          <div className="detail-section">
            <label>{selectedFont.charsetMode === 'manual' ? 'Ranges:' : 'Extra Ranges:'}</label>
            <input
              type="text"
              value={selectedFont.extraRanges ?? ''}
              onChange={(e) => updateFont(selectedFont.id, { extraRanges: e.target.value })}
              placeholder="0x4E00-0x4EFF,0xFF00-0xFFEF"
            />
          </div>

          <div className="detail-section">
            <span className="charset-total">
              Total coverage: <strong>{charsetCodePoints(selectionFor(selectedFont)).size.toLocaleString()}</strong> glyphs
            </span>
          </div>

          <div className="detail-section">
            <label>BPP (Antialiasing):</label>
            <div className="bpp-grid">
              {BPP_OPTIONS.map(bpp => (
                <button
                  key={bpp}
                  className={`size-btn ${selectedFont.bpp === bpp ? 'active' : ''}`}
                  onClick={() => updateFont(selectedFont.id, { bpp })}
                >
                  {bpp}
                </button>
              ))}
            </div>
            <span className="bpp-hint">
              {selectedFont.bpp === 1 && '1-bit — No antialiasing, smallest size'}
              {selectedFont.bpp === 2 && '2-bit — 4 grayscale levels'}
              {selectedFont.bpp === 4 && '4-bit — 16 grayscale levels (recommended)'}
              {selectedFont.bpp === 8 && '8-bit — 256 grayscale levels, highest quality'}
            </span>
          </div>
          
          <div className="font-preview-section">
            <label>Preview:</label>
            <div 
              className="preview-box"
              style={{ fontFamily: fontFaceMap[selectedFont.id] || selectedFont.family }}
            >
              {[16, 24].map(sz => (
                <p key={sz} style={{ fontSize: sz }}>
                  <span className="preview-size-tag">{sz}px</span> {FONT_PREVIEW_TEXT}
                </p>
              ))}
              {(selectedFont.charset === 'cjk-basic' || selectedFont.charset === 'custom') && (
                <p style={{ fontSize: 16 }}>
                  {FONT_PREVIEW_TEXT_CJK}
                </p>
              )}
            </div>
          </div>
          
          <div className="detail-actions">
            <button onClick={() => handleGenerateCommand(selectedFont)}>
              🔧 Generate Conversion Command
            </button>
            <button onClick={() => handleGenerateHeader(selectedFont)}>
              📄 Generate Header Template
            </button>
          </div>
        </div>
      )}
      
      {/* Command Modal */}
      {showCommandModal && (
        <div className="modal-overlay" onClick={() => setShowCommandModal(false)}>
          <div className="modal-content command-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>lv_font_conv Conversion Command</h3>
              <button className="close-btn" onClick={() => setShowCommandModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="command-hint">
                Use the following command to convert the font to LVGL format. Install lv_font_conv first:
                <code>npm install -g lv_font_conv</code>
              </p>
              <pre className="command-preview">{generatedCommand}</pre>
            </div>
            <div className="modal-footer">
              <button onClick={() => handleCopyText(generatedCommand)}>📋 Copy Command</button>
            </div>
          </div>
        </div>
      )}

      {/* Header Template Modal */}
      {showHeaderModal && (
        <div className="modal-overlay" onClick={() => setShowHeaderModal(false)}>
          <div className="modal-content command-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Font File Template</h3>
              <button className="close-btn" onClick={() => setShowHeaderModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="command-hint">Header file (.h):</p>
              <pre className="command-preview">{generatedHeader}</pre>
              <div className="template-copy-row">
                <button onClick={() => handleCopyText(generatedHeader)}>📋 Copy Header</button>
              </div>

              <p className="command-hint" style={{ marginTop: 16 }}>Source file template (.c):</p>
              <pre className="command-preview">{generatedSource}</pre>
              <div className="template-copy-row">
                <button onClick={() => handleCopyText(generatedSource)}>📋 Copy Source</button>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowHeaderModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FontManager;
