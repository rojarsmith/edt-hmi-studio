// Card for a built-in demo or factory test project. Read-only: the single
// action imports a fresh copy into the user's project list.

import React from 'react';
import type { ProjectFile } from '../../resources/types';
import type { DemoEntry } from '../../demos';
import type { Screen } from '../../types';
import { getBoardDefinition, DEFAULT_BOARD_ID } from '../../types/hmi';
import { getEntryScreen } from '../../utils/entryScreen';
import { useAppStore } from '../../store/appStore';
import ScreenThumbnail from './ScreenThumbnail';
import './ProjectCard.css';

interface DemoCardProps {
  entry: DemoEntry;
  /** Loaded project file; null while the Demos tab is still loading it. */
  file: ProjectFile | null;
  onUse: (entry: DemoEntry) => void;
  /** Opens a same-named copy for maintaining the demo itself. */
  onEdit: (entry: DemoEntry) => void;
}

const DemoCard: React.FC<DemoCardProps> = ({ entry, file, onUse, onEdit }) => {
  // Demo maintenance is an internal task: the Edit action only exists while
  // factory engineer development mode is unlocked. See docs/factory-dev-mode.md.
  const factoryDevMode = useAppStore(s => s.factoryDevMode);
  const board = getBoardDefinition(file?.boardId ?? DEFAULT_BOARD_ID);
  const entryScreen: Screen | undefined =
    getEntryScreen(((file?.screens ?? file?.pages) ?? []) as Screen[]) ?? undefined;
  const width = file?.display?.width ?? file?.canvasSize.width ?? 480;
  const height = file?.display?.height ?? file?.canvasSize.height ?? 272;

  return (
    <div className="project-card" onClick={() => onUse(entry)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onUse(entry); }}>
      <div className="project-card-thumb">
        {file?.thumbnail ? (
          <img className="project-card-thumb-img" src={file.thumbnail} alt="" />
        ) : entryScreen ? (
          <ScreenThumbnail
            className="project-card-thumb-img"
            screen={entryScreen}
            width={width}
            height={height}
          />
        ) : (
          <div className="project-card-thumb-empty">⏳</div>
        )}
        {entry.factoryOnly && <div className="project-card-badge">Factory</div>}
      </div>

      <div className="project-card-info">
        <div className="project-card-name">{entry.name}</div>
        <div className="project-card-desc" title={entry.description}>{entry.description}</div>
        <div className="project-card-meta">{board.model}</div>
        <div className="project-card-meta">{width} × {height}</div>
      </div>

      <div className="project-card-actions">
        <button
          className="project-card-use"
          onClick={e => { e.stopPropagation(); onUse(entry); }}
        >
          Use Demo
        </button>
        {factoryDevMode && (
          <button
            className="project-card-use project-card-edit"
            title="Open a same-named copy; export it to update the shipped demo"
            onClick={e => { e.stopPropagation(); onEdit(entry); }}
          >
            Edit Demo
          </button>
        )}
      </div>
    </div>
  );
};

export default DemoCard;
