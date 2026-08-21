// Creating a project: pick the hardware on the left, describe the project on
// the right.
//
// A full page rather than the modal it replaces, because the choice it is built
// around — which board — deserves a list you can search and read specifications
// off, and a modal that size is just a page with a shadow. Modelled on
// TouchGFX Designer's board setup screen, with two deliberate departures:
//
//  - The board list is rows, not a card grid. A grid puts the picture first and
//    makes you read a caption to tell two 480x272 boards apart; a row puts the
//    specifications beside the picture where they can be scanned down a column.
//  - The selected board's detail sits under the list, on the same side as the
//    thing it describes, so the right-hand column is only ever the project's own
//    settings. Hardware Name there is a read-back of the left-hand choice, not
//    a second place to make it.

import React, { useMemo, useRef, useState } from 'react';
import type { DisplayConfig, LvglConfig } from '../../store/projectStore';
import { DEFAULT_LVGL_CONFIG } from '../../store/projectStore';
import type { BoardId, DisplayOrientation, ProtocolId } from '../../types/hmi';
import {
  DEFAULT_BOARD_ID,
  ORIENTATION_LABELS,
  SUPPORTED_BOARDS,
  SUPPORTED_ORIENTATIONS,
  boardCanDriveOrientation,
  formatMemSize,
  getBoardDefinition,
  getBoardProtocols,
  getProtocolDefinition,
  logicalResolution,
} from '../../types/hmi';
import { useAppStore } from '../../store/appStore';
import {
  clearBoardImage,
  getBoardImage,
  getBoardSummary,
  hasBoardSummaryOverride,
  setBoardImage,
  setBoardSummary,
} from '../../resources/boardProfile';
import { toast } from '../Toast';
import BoardThumbnail from './BoardThumbnail';
import './NewProjectPage.css';

interface NewProjectPageProps {
  onCancel: () => void;
  onCreate: (
    name: string,
    boardId: BoardId,
    display: DisplayConfig,
    lvglConfig: LvglConfig,
    protocol: ProtocolId,
    description: string,
  ) => void;
}

function formatFlash(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb} MB` : `${Math.round(bytes / 1024)} KB`;
}

const NewProjectPage: React.FC<NewProjectPageProps> = ({ onCancel, onCreate }) => {
  const factoryDevMode = useAppStore(s => s.factoryDevMode);

  const [boardId, setBoardId] = useState<BoardId>(DEFAULT_BOARD_ID);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [orientation, setOrientation] = useState<DisplayOrientation>(
    () => SUPPORTED_ORIENTATIONS[0],
  );
  const [protocol, setProtocol] = useState<ProtocolId>(
    () => getBoardProtocols(DEFAULT_BOARD_ID)[0],
  );
  // Board pictures live outside React state (localStorage), so a change has to
  // be announced rather than observed.
  const [imageRevision, setImageRevision] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Held separately from storage so typing stays responsive; written through on
  // every keystroke, which is cheap for one short string.
  const [summaryDraft, setSummaryDraft] = useState('');

  const board = getBoardDefinition(boardId);
  const boardProtocols = getBoardProtocols(boardId);
  const design = logicalResolution(boardId, orientation);
  const orientationBuildable = boardCanDriveOrientation(boardId, orientation);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return SUPPORTED_BOARDS;
    return SUPPORTED_BOARDS.filter(item =>
      item.model.toLowerCase().includes(needle)
      || item.name.toLowerCase().includes(needle)
      || item.vendor.toLowerCase().includes(needle)
      || `${item.display.width}x${item.display.height}`.includes(needle.replace('×', 'x')),
    );
  }, [search]);

  const selectBoard = (nextBoardId: BoardId) => {
    setBoardId(nextBoardId);
    setSummaryDraft(
      hasBoardSummaryOverride(nextBoardId)
        ? getBoardSummary(getBoardDefinition(nextBoardId))
        : '',
    );
    // A board only offers the buses it is wired for, so a protocol the previous
    // board supported may not exist on this one.
    const nextProtocols = getBoardProtocols(nextBoardId);
    setProtocol(current => (nextProtocols.includes(current) ? current : nextProtocols[0]));
  };

  const handleImagePicked = async (file: File | undefined) => {
    if (!file) return;
    try {
      await setBoardImage(boardId, file);
      setImageRevision(revision => revision + 1);
      toast.success(`Picture updated for ${board.model}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not store the image.');
    }
  };

  const handleClearImage = () => {
    clearBoardImage(boardId);
    setImageRevision(revision => revision + 1);
    toast.info(`${board.model} is back to its schematic.`);
  };

  const handleCreate = () => {
    const projectName = name.trim() || 'Untitled Project';
    const display: DisplayConfig = {
      ...design,
      colorDepth: board.display.colorDepth,
      orientation,
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
    <div className="npp">
      <div className="npp-title-row">
        <h1 className="npp-title">New Project</h1>
        <button type="button" className="npp-close" onClick={onCancel} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="npp-body">
        {/* ---- left: choose the hardware ---- */}
        <section className="npp-hardware">
          <input
            className="npp-search"
            type="search"
            placeholder="Search hardware — model, name or resolution"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />

          {/* Labels the two halves of a row's first line, in the same order. */}
          <div className="npp-list-head">
            <span>Hardware Name</span>
            <span className="npp-list-head-right">
              <span>Hardware Model</span>
              <span className="npp-list-count">
                {matches.length} of {SUPPORTED_BOARDS.length}
              </span>
            </span>
          </div>

          <div className="npp-list">
            {matches.length === 0 ? (
              <div className="npp-list-empty">No hardware matches “{search.trim()}”.</div>
            ) : (
              matches.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`npp-row ${item.id === boardId ? 'selected' : ''}`}
                  onClick={() => selectBoard(item.id)}
                >
                  <BoardThumbnail
                    board={item}
                    className="npp-row-image"
                    imageRevision={imageRevision}
                  />
                  {/* The specifications sit beside the picture, not under it, so
                      a column of boards can be compared by reading downwards. */}
                  <span className="npp-row-text">
                    <span className="npp-row-line">
                      <span className="npp-row-name">{item.name}</span>
                      <span className="npp-row-model">{item.model}</span>
                    </span>
                    <span className="npp-row-spec">
                      {item.display.width}×{item.display.height} · {item.display.colorFormat}
                    </span>
                    {factoryDevMode && (
                      <span className="npp-row-vendor">{item.vendor}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* ---- lower left: what was selected ---- */}
          <div className="npp-detail">
            <div className="npp-detail-head">
              <span className="npp-detail-name">{board.name}</span>
              {factoryDevMode && <span className="npp-detail-vendor">{board.vendor}</span>}
            </div>
            <dl className="npp-detail-grid">
              <dt>Model</dt>
              <dd>{board.model}</dd>
              <dt>Panel</dt>
              <dd>
                {board.display.width} × {board.display.height} ·{' '}
                {board.display.colorFormat} ({board.display.colorDepth}-bit)
              </dd>
              <dt>Flash</dt>
              <dd>
                {formatFlash(board.flashBytes)}
                {board.externalFlash ? ' + external NOR' : ''}
              </dd>
              {/* The LVGL build settings are an implementation detail of the
                  firmware rather than a property of the board — the same
                  reasoning that hides them in the Hardware Information dialog. */}
              {factoryDevMode && (
                <>
                  <dt>LVGL heap</dt>
                  <dd>
                    {formatMemSize(board.lvgl.memSizeKb)} · default font{' '}
                    {board.lvgl.defaultFont}
                  </dd>
                </>
              )}
              <dt>Field bus</dt>
              <dd>{boardProtocols.map(id => getProtocolDefinition(id).name).join(', ')}</dd>
            </dl>

            {/* Read-only for the author, editable by the factory. The text is
                about the hardware, so it belongs beside it rather than in the
                project's own settings. */}
            <div className="npp-detail-summary">
              {factoryDevMode ? (
                <label className="npp-field">
                  Description{hasBoardSummaryOverride(boardId) ? ' (customised)' : ''}
                  <textarea
                    className="npp-textarea"
                    rows={2}
                    value={summaryDraft}
                    placeholder={board.summary}
                    onChange={e => {
                      setSummaryDraft(e.target.value);
                      setBoardSummary(boardId, e.target.value);
                    }}
                  />
                  <span className="npp-hint">
                    Stored on this machine for every project that targets{' '}
                    {board.model}. Clear the box to go back to the built-in text.
                  </span>
                </label>
              ) : (
                <p className="npp-detail-summary-text">{getBoardSummary(board)}</p>
              )}
            </div>

            {/* Supplying the picture is a factory job: it is per installation,
                not per project, and a wrong photo is worse than none. */}
            {factoryDevMode && (
              <div className="npp-detail-image-tools">
                <span className="npp-detail-image-label">
                  Picture {getBoardImage(boardId) ? '(custom)' : '(schematic)'}
                </span>
                <button
                  type="button"
                  className="npp-mini-btn"
                  onClick={() => imageInputRef.current?.click()}
                >
                  Update…
                </button>
                {getBoardImage(boardId) && (
                  <button type="button" className="npp-mini-btn" onClick={handleClearImage}>
                    Reset
                  </button>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    void handleImagePicked(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {/* ---- right: describe the project ---- */}
        <section className="npp-settings">
          {/* First, and read-only: it confirms the left-hand choice rather than
              offering a second way to make it. */}
          <label className="npp-field">
            Hardware Name
            <input className="npp-input readonly" type="text" value={board.name} readOnly tabIndex={-1} />
          </label>

          <label className="npp-field">
            Project Name
            <input
              className="npp-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Untitled Project"
            />
          </label>

          <label className="npp-field">
            Description
            <input
              className="npp-input"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional one-line summary"
            />
          </label>

          <label className="npp-field">
            Display Orientation
            <select
              className="npp-select"
              value={orientation}
              onChange={e => setOrientation(e.target.value as DisplayOrientation)}
            >
              {SUPPORTED_ORIENTATIONS.map(id => (
                <option key={id} value={id}>
                  {ORIENTATION_LABELS[id]}
                  {boardCanDriveOrientation(boardId, id) ? '' : ' — no firmware support yet'}
                </option>
              ))}
            </select>
            <span className="npp-hint">
              Design canvas {design.width}×{design.height}.
              {orientationBuildable
                ? ''
                : ` ${board.model} cannot be built this way up yet — the project can`
                  + ' still be designed and previewed.'}
            </span>
          </label>

          <label className="npp-field">
            Field Bus Protocol
            <select
              className="npp-select"
              value={protocol}
              onChange={e => setProtocol(e.target.value as ProtocolId)}
              disabled={boardProtocols.length < 2}
            >
              {boardProtocols.map(id => (
                <option key={id} value={id}>{getProtocolDefinition(id).name}</option>
              ))}
            </select>
            <span className="npp-hint">
              {getProtocolDefinition(protocol).summary}
              {boardProtocols.length < 2 ? ` ${board.model} supports this bus only.` : ''}
            </span>
          </label>

          <div className="npp-actions">
            <button type="button" className="npp-btn" onClick={onCancel}>Cancel</button>
            <button type="button" className="npp-btn primary" onClick={handleCreate}>Create</button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default NewProjectPage;
