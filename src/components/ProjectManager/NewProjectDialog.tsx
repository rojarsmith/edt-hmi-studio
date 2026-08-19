import React, { useState } from 'react';
import type { DisplayConfig, LvglConfig } from '../../store/projectStore';
import { DEFAULT_LVGL_CONFIG } from '../../store/projectStore';
import type { BoardId, ProtocolId } from '../../types/hmi';
import {
  DEFAULT_BOARD_ID,
  SUPPORTED_BOARDS,
  formatMemSize,
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
    description: string,
  ) => void;
}

const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [boardId, setBoardId] = useState<BoardId>(DEFAULT_BOARD_ID);
  const [protocol, setProtocol] = useState<ProtocolId>(
    () => getBoardProtocols(DEFAULT_BOARD_ID)[0],
  );

  // Everything the dialog does not ask for is derived from here.
  const board = getBoardDefinition(boardId);
  const boardProtocols = getBoardProtocols(boardId);

  const handleCreate = () => {
    const projectName = name.trim() || 'Untitled Project';
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
    onCreate(projectName, boardId, display, lvglConfig, protocol, description);
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

          {/* Optional; shown on the project card. */}
          <label className="npd-label">
            Description
            <input
              className="npd-input"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional one-line summary"
            />
          </label>

          {/* The board is the only display-related question. Canvas size, color
              depth and the LVGL build settings all follow from it, and asking
              for them separately only creates ways to disagree with the
              firmware — see docs/color-depth.md. */}
          <label className="npd-label">
            Hardware Model Number
            <select
              className="npd-select"
              value={boardId}
              onChange={(e) => {
                const nextBoardId = e.target.value as BoardId;
                setBoardId(nextBoardId);
                // A board only offers the buses it is wired for, so a protocol
                // the previous board supported may not exist on this one.
                const nextProtocols = getBoardProtocols(nextBoardId);
                setProtocol((current) => (
                  nextProtocols.includes(current) ? current : nextProtocols[0]
                ));
              }}
            >
              {SUPPORTED_BOARDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <span className="npd-hint">
              {board.display.width}×{board.display.height} ·{' '}
              {board.display.colorFormat} ({board.display.colorDepth}-bit) ·{' '}
              LVGL heap {formatMemSize(board.lvgl.memSizeKb)} · default font{' '}
              {board.lvgl.defaultFont}
            </span>
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
                ? ` ${board.name} supports this bus only.`
                : ''}
            </span>
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
