import React, { useState } from 'react';
import type { DisplayConfig, LvglConfig } from '../../store/projectStore';
import { DEFAULT_DISPLAY, DEFAULT_LVGL_CONFIG } from '../../store/projectStore';
import type { BoardId, ProtocolId } from '../../types/hmi';
import {
  DEFAULT_BOARD_ID,
  SUPPORTED_BOARDS,
  getBoardDefinition,
  getBoardProtocols,
  getProtocolDefinition,
} from '../../types/hmi';
import './NewProjectDialog.css';

interface NewProjectDialogProps {
  onClose: () => void;
  onCreate: (
    name: string,
    boardId: BoardId,
    display: DisplayConfig,
    lvglConfig: LvglConfig,
    protocol: ProtocolId,
  ) => void;
}

const RESOLUTION_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '240×320 (QVGA)', w: 240, h: 320 },
  { label: '320×480 (HVGA)', w: 320, h: 480 },
  { label: '480×320 (TFT)', w: 480, h: 320 },
  { label: '480×272', w: 480, h: 272 },
  { label: '800×480 (WVGA)', w: 800, h: 480 },
  { label: '1024×600', w: 1024, h: 600 },
];

const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ onClose, onCreate }) => {
  const defaultBoard = getBoardDefinition(DEFAULT_BOARD_ID);
  const defaultPreset = RESOLUTION_PRESETS.find(
    (item) => item.w === defaultBoard.display.width && item.h === defaultBoard.display.height,
  )?.label ?? 'custom';
  const [name, setName] = useState('');
  const [boardId, setBoardId] = useState<BoardId>(DEFAULT_BOARD_ID);
  const [protocol, setProtocol] = useState<ProtocolId>(
    () => getBoardProtocols(DEFAULT_BOARD_ID)[0],
  );
  const [preset, setPreset] = useState(defaultPreset);
  const [customW, setCustomW] = useState(DEFAULT_DISPLAY.width);
  const [customH, setCustomH] = useState(DEFAULT_DISPLAY.height);
  const [colorDepth, setColorDepth] = useState<16 | 24 | 32>(DEFAULT_DISPLAY.colorDepth);

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
    // The LVGL build settings are a property of the board, not a user choice —
    // they mirror firmware/<board>/include/lv_conf.h.
    const lvglConfig: LvglConfig = {
      version: '9',
      colorFormat: board.display.colorFormat,
      fontLarge: board.lvgl.fontLarge,
      defaultFont: board.lvgl.defaultFont,
      useBuiltinSymbols: DEFAULT_LVGL_CONFIG.useBuiltinSymbols,
      symbolFont: DEFAULT_LVGL_CONFIG.symbolFont,
      memSize: board.lvgl.memSizeKb,
    };
    onCreate(projectName, boardId, display, lvglConfig, protocol);
  };

  const boardProtocols = getBoardProtocols(boardId);

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

          {/* Target board. Also fixes the colour depth and the LVGL build
              settings, so none of those are asked for separately. */}
          <label className="npd-label">
            Hardware Model Number
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
                // A board only offers the buses it is wired for, so a protocol
                // the previous board supported may not exist on this one.
                const nextProtocols = getBoardProtocols(nextBoardId);
                setProtocol((current) => (
                  nextProtocols.includes(current) ? current : nextProtocols[0]
                ));
              }}
            >
              {SUPPORTED_BOARDS.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name} ({board.display.width}×{board.display.height}, {board.display.colorFormat})
                </option>
              ))}
            </select>
          </label>

          {/* Fixed for the life of the project: the generated bindings and the
              firmware runtime are built around one bus. */}
          <label className="npd-label">
            Field Bus Protocol
            <select
              className="npd-select"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as ProtocolId)}
              disabled={boardProtocols.length < 2}
            >
              {boardProtocols.map((id) => (
                <option key={id} value={id}>
                  {getProtocolDefinition(id).name}
                </option>
              ))}
            </select>
            <span className="npd-hint">
              {getProtocolDefinition(protocol).summary}
              {boardProtocols.length < 2
                ? ` ${getBoardDefinition(boardId).name} supports this bus only.`
                : ''}
            </span>
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
