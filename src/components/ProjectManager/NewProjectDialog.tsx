import React, { useState } from 'react';
import type { DisplayConfig, LvglConfig } from '../../store/projectStore';
import { DEFAULT_DISPLAY, DEFAULT_LVGL_CONFIG } from '../../store/projectStore';
import type { BoardId } from '../../types/hmi';
import {
  DEFAULT_BOARD_ID,
  SUPPORTED_BOARDS,
  getBoardDefinition,
} from '../../types/hmi';
import './NewProjectDialog.css';

interface NewProjectDialogProps {
  onClose: () => void;
  onCreate: (name: string, boardId: BoardId, display: DisplayConfig, lvglConfig: LvglConfig) => void;
}

const RESOLUTION_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '240×320 (QVGA)', w: 240, h: 320 },
  { label: '320×480 (HVGA)', w: 320, h: 480 },
  { label: '480×320 (TFT)', w: 480, h: 320 },
  { label: '480×272', w: 480, h: 272 },
  { label: '800×480 (WVGA)', w: 800, h: 480 },
  { label: '1024×600', w: 1024, h: 600 },
];

const FONT_OPTIONS = [
  'montserrat_14',
  'montserrat_16',
  'montserrat_20',
  'montserrat_24',
  'montserrat_28',
  'montserrat_32',
];

const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ onClose, onCreate }) => {
  const defaultBoard = getBoardDefinition(DEFAULT_BOARD_ID);
  const defaultPreset = RESOLUTION_PRESETS.find(
    (item) => item.w === defaultBoard.display.width && item.h === defaultBoard.display.height,
  )?.label ?? 'custom';
  const [name, setName] = useState('');
  const [boardId, setBoardId] = useState<BoardId>(DEFAULT_BOARD_ID);
  const [preset, setPreset] = useState(defaultPreset);
  const [customW, setCustomW] = useState(DEFAULT_DISPLAY.width);
  const [customH, setCustomH] = useState(DEFAULT_DISPLAY.height);
  const [colorDepth, setColorDepth] = useState<16 | 24 | 32>(DEFAULT_DISPLAY.colorDepth);
  const [fontLarge, setFontLarge] = useState(DEFAULT_LVGL_CONFIG.fontLarge);
  const [defaultFont, setDefaultFont] = useState(DEFAULT_LVGL_CONFIG.defaultFont);
  const [memSize, setMemSize] = useState(DEFAULT_LVGL_CONFIG.memSize);

  const isCustom = preset === 'custom';

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value !== 'custom') {
      const found = RESOLUTION_PRESETS.find(p => p.label === value);
      if (found) {
        setCustomW(found.w);
        setCustomH(found.h);
      }
    }
  };

  const handleCreate = () => {
    const projectName = name.trim() || 'Untitled Project';
    const board = getBoardDefinition(boardId);
    const display: DisplayConfig = {
      width: board.display.width,
      height: board.display.height,
      colorDepth: board.display.colorDepth,
      rotation: 0,
    };
    const lvglConfig: LvglConfig = {
      version: '9',
      colorFormat: board.display.colorFormat,
      fontLarge,
      defaultFont,
      useBuiltinSymbols: DEFAULT_LVGL_CONFIG.useBuiltinSymbols,
      symbolFont: DEFAULT_LVGL_CONFIG.symbolFont,
      memSize,
    };
    onCreate(projectName, boardId, display, lvglConfig);
  };

  return (
    <div className="modal-global-overlay" onClick={onClose}>
      <div className="modal-dialog new-project-dialog" onClick={e => e.stopPropagation()}>
        <div className="new-project-title">New Project</div>
        <div className="new-project-body">
          {/* Name */}
          <label className="npd-label">
            Project Name
            <input
              className="npd-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Untitled Project"
              autoFocus
            />
          </label>

          {/* Target board */}
          <label className="npd-label">
            Development Board
            <select
              className="npd-select"
              value={boardId}
              onChange={(e) => {
                const nextBoardId = e.target.value as BoardId;
                const board = getBoardDefinition(nextBoardId);
                const nextPreset = RESOLUTION_PRESETS.find(
                  (item) => item.w === board.display.width && item.h === board.display.height,
                )?.label ?? 'custom';
                setBoardId(nextBoardId);
                setPreset(nextPreset);
                setCustomW(board.display.width);
                setCustomH(board.display.height);
                setColorDepth(board.display.colorDepth);
              }}
            >
              {SUPPORTED_BOARDS.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name} ({board.display.width}×{board.display.height}, {board.display.colorFormat})
                </option>
              ))}
            </select>
          </label>

          {/* Resolution */}
          <label className="npd-label">
            Canvas Size
            <select className="npd-select" value={preset} onChange={e => handlePresetChange(e.target.value)} disabled>
              {RESOLUTION_PRESETS.map(p => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>

          {isCustom && (
            <div className="npd-row">
              <label className="npd-label npd-half">
                Width
                <input className="npd-input" type="number" min={100} max={2048} value={customW} onChange={e => setCustomW(Number(e.target.value))} />
              </label>
              <label className="npd-label npd-half">
                Height
                <input className="npd-input" type="number" min={100} max={2048} value={customH} onChange={e => setCustomH(Number(e.target.value))} />
              </label>
            </div>
          )}

          {/* Color depth */}
          <label className="npd-label">
            Color Depth
            <select className="npd-select" value={colorDepth} onChange={e => setColorDepth(Number(e.target.value) as 16 | 24 | 32)} disabled>
              <option value={16}>16 bit (RGB565)</option>
              <option value={24}>24 bit (RGB888)</option>
              <option value={32}>32 bit (ARGB8888)</option>
            </select>
          </label>

          <div className="npd-section-title">LVGL Configuration</div>

          {/* Font large */}
          <label className="npd-label npd-checkbox-label">
            <input type="checkbox" checked={fontLarge} onChange={e => setFontLarge(e.target.checked)} />
            LV_FONT_FMT_TXT_LARGE (large font support)
          </label>

          {/* Default font */}
          <label className="npd-label">
            Default Font
            <select className="npd-select" value={defaultFont} onChange={e => setDefaultFont(e.target.value)}>
              {FONT_OPTIONS.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>

          {/* Memory size */}
          <label className="npd-label">
            Memory Size (KB)
            <input className="npd-input" type="number" min={16} max={1024} step={8} value={memSize} onChange={e => setMemSize(Number(e.target.value))} />
          </label>
        </div>

        <div className="modal-dialog-footer">
          <button className="modal-dialog-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-dialog-btn modal-btn-confirm" onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  );
};

export default NewProjectDialog;
