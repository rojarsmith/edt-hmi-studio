// Font Manager Component

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useResourceStore } from './resourceStore';
import type { FontResource, CharsetType } from './types';
import { toast } from '../components/Toast';
import { modal } from '../components/Modal';
import { 
  FONT_PREVIEW_TEXT,
  FONT_PREVIEW_TEXT_CJK,
  generateFontConvCommand,
  generateFontSourceTemplate,
  generateFontCCodeHeader,
  extractCharsFromText,
  getCharsetRanges,
  countGlyphs,
} from './converters/fontConverter';
import './FontManager.css';

interface FontManagerProps {
  viewMode: 'grid' | 'list';
}

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

const FontManager: React.FC<FontManagerProps> = ({ viewMode }) => {
  const {
    getFilteredFonts,
    addFont,
    deleteFont,
    updateFont,
    selectedResourceId,
    setSelectedResource,
  } = useResourceStore();
  
  const fonts = getFilteredFonts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showHeaderModal, setShowHeaderModal] = useState(false);
  const [generatedCommand, setGeneratedCommand] = useState('');
  const [generatedHeader, setGeneratedHeader] = useState('');
  const [generatedSource, setGeneratedSource] = useState('');
  const [customCharsInput, setCustomCharsInput] = useState('');
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
  
  const buildConvOptions = useCallback((font: FontResource) => ({
    sizes: font.sizes,
    charset: font.charset,
    customChars: font.charset === 'custom' ? (font.customChars || customCharsInput) : undefined,
    bpp: font.bpp,
    compress: false,
  }), [customCharsInput]);
  
  const handleGenerateCommand = (font: FontResource) => {
    const ext = font.data.startsWith('data:font/opentype') ? '.otf' : '.ttf';
    const command = generateFontConvCommand(
      font.name + ext,
      font.cFontName,
      buildConvOptions(font),
    );
    setGeneratedCommand(command);
    setShowCommandModal(true);
  };

  const handleGenerateHeader = (font: FontResource) => {
    const opts = buildConvOptions(font);
    // Generate header for the first selected size
    const primarySize = font.sizes[0] || 16;
    const header = generateFontCCodeHeader(font.cFontName, font.family, primarySize, opts);
    const source = generateFontSourceTemplate(font.cFontName, font.family, font.style, primarySize, opts);
    setGeneratedHeader(header);
    setGeneratedSource(source);
    setShowHeaderModal(true);
  };
  
  const handleExtractChars = () => {
    const input = selectedFont?.customChars ?? customCharsInput;
    const chars = extractCharsFromText(input);
    setCustomCharsInput(chars);
    if (selectedFont) {
      updateFont(selectedFont.id, { customChars: chars });
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

  const getGlyphCount = (font: FontResource): number => {
    const ranges = getCharsetRanges(font.charset, font.charset === 'custom' ? (font.customChars || customCharsInput) : undefined);
    return countGlyphs(ranges);
  };
  
  const selectedFont = fonts.find(f => f.id === selectedResourceId);
  
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
      <div className={`font-list ${viewMode}`}>
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
            <select
              value={selectedFont.charset}
              onChange={(e) => updateFont(selectedFont.id, { charset: e.target.value as CharsetType })}
            >
              <option value="ascii">ASCII (Basic)</option>
              <option value="latin">Latin Extended</option>
              <option value="cjk-basic">CJK Basic</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          
          {selectedFont.charset === 'custom' && (
            <div className="detail-section">
              <label>Custom Characters:</label>
              <textarea
                value={selectedFont.customChars ?? customCharsInput}
                onChange={(e) => {
                  setCustomCharsInput(e.target.value);
                  updateFont(selectedFont.id, { customChars: e.target.value });
                }}
                placeholder="Enter the characters to include, or paste text and extract unique characters"
                rows={3}
              />
              <button className="extract-btn" onClick={handleExtractChars}>
                Extract Unique Characters
              </button>
            </div>
          )}

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
