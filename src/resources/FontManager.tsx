// Font Manager Component

import React, { useRef, useState } from 'react';
import { useResourceStore } from './resourceStore';
import type { FontResource, CharsetType } from './types';
import { toast } from '../components/Toast';
import { modal } from '../components/Modal';
import { 
  COMMON_FONT_SIZES, 
  FONT_PREVIEW_TEXT,
  FONT_PREVIEW_TEXT_CJK,
  generateFontConvCommand,
  extractCharsFromText,
} from './converters/fontConverter';
import './FontManager.css';

interface FontManagerProps {
  viewMode: 'grid' | 'list';
}

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
  const [generatedCommand, setGeneratedCommand] = useState('');
  const [customCharsInput, setCustomCharsInput] = useState('');
  
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
  
  const handleSizeToggle = (font: FontResource, size: number) => {
    const newSizes = font.sizes.includes(size)
      ? font.sizes.filter(s => s !== size)
      : [...font.sizes, size].sort((a, b) => a - b);
    
    if (newSizes.length > 0) {
      updateFont(font.id, { sizes: newSizes });
    }
  };
  
  const handleGenerateCommand = (font: FontResource) => {
    const command = generateFontConvCommand(
      font.name + '.ttf',
      font.cFontName,
      {
        sizes: font.sizes,
        charset: font.charset,
        customChars: font.charset === 'custom' ? customCharsInput : undefined,
        bpp: 4,
        compress: false,
      }
    );
    setGeneratedCommand(command);
    setShowCommandModal(true);
  };
  
  const handleExtractChars = () => {
    const chars = extractCharsFromText(customCharsInput);
    setCustomCharsInput(chars);
  };
  
  const handleCopyCommand = () => {
    navigator.clipboard.writeText(generatedCommand);
    toast.success('Command copied to clipboard');
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          {isUploading ? 'Uploading...' : '📤 Upload font'}
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
                  style={{ fontFamily: font.family }}
                >
                  Aa
                </span>
              </div>
              <div className="font-info">
                <span className="font-name" title={font.name}>{font.name}</span>
                <span className="font-family">{font.family}</span>
                <span className="font-sizes">
                  {font.sizes.join(', ')}px
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
          
          <div className="detail-row">
            <label>Font Family:</label>
            <span>{selectedFont.family}</span>
          </div>
          
          <div className="detail-row">
            <label>File Size:</label>
            <span>{formatFileSize(selectedFont.size)}</span>
          </div>
          
          <div className="detail-section">
            <label>Size Selection:</label>
            <div className="size-grid">
              {COMMON_FONT_SIZES.map(size => (
                <button
                  key={size}
                  className={`size-btn ${selectedFont.sizes.includes(size) ? 'active' : ''}`}
                  onClick={() => handleSizeToggle(selectedFont, size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          
          <div className="detail-section">
            <label>Character Set:</label>
            <select
              value={selectedFont.charset}
              onChange={(e) => updateFont(selectedFont.id, { charset: e.target.value as CharsetType })}
            >
              <option value="ascii">ASCII (Basic)</option>
              <option value="latin">Latin Extended (Latin Extended)</option>
              <option value="cjk-basic">CJK Basic (CJK basic)</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          
          {selectedFont.charset === 'custom' && (
            <div className="detail-section">
              <label>Custom Characters:</label>
              <textarea
                value={customCharsInput}
                onChange={(e) => setCustomCharsInput(e.target.value)}
                placeholder="Enter the characters to include, or paste text and extract unique characters"
                rows={3}
              />
              <button className="extract-btn" onClick={handleExtractChars}>
                Extract Unique Characters
              </button>
            </div>
          )}
          
          <div className="font-preview-section">
            <label>Preview:</label>
            <div 
              className="preview-box"
              style={{ fontFamily: selectedFont.family }}
            >
              <p style={{ fontSize: Math.min(...selectedFont.sizes) || 16 }}>
                {FONT_PREVIEW_TEXT}
              </p>
              {selectedFont.charset === 'cjk-basic' && (
                <p style={{ fontSize: Math.min(...selectedFont.sizes) || 16 }}>
                  {FONT_PREVIEW_TEXT_CJK}
                </p>
              )}
            </div>
          </div>
          
          <div className="detail-actions">
            <button onClick={() => handleGenerateCommand(selectedFont)}>
              🔧 Generate Conversion Command
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
              <button onClick={handleCopyCommand}>📋 Copy Command</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FontManager;
