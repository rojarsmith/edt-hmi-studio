import React, { useEffect, useRef, useState } from 'react';
import type { ProjectListItem } from '../../store/projectStore';
import { useProjectStore } from '../../store/projectStore';
import { formatFileSize } from '../../resources/projectManager';
import { getBoardDefinition } from '../../types/hmi';
import { modal } from '../Modal';
import { toast } from '../Toast';
import ScreenThumbnail from './ScreenThumbnail';
import './ProjectCard.css';

interface ProjectCardProps {
  item: ProjectListItem;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Downscale a user-picked image to card size and encode it as a data URI. */
async function fileToThumbnailDataUri(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the image'));
      el.src = url;
    });
    const MAX_WIDTH = 512;
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const ProjectCard: React.FC<ProjectCardProps> = ({ item, onOpen, onDelete }) => {
  const { config, size, entryScreen } = item;
  const updateProjectConfig = useProjectStore(s => s.updateProjectConfig);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const updatedStr = new Date(config.updatedAt).toLocaleString('zh-CN');
  const board = getBoardDefinition(config.boardId);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  const handleEditDescription = async () => {
    const next = await modal.prompt('Project description', config.description ?? '');
    if (next === null) return;
    await updateProjectConfig({ ...config, description: next.trim() || undefined });
  };

  const handleThumbnailFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const thumbnail = await fileToThumbnailDataUri(file);
      await updateProjectConfig({ ...config, thumbnail });
    } catch (err) {
      toast.error('Could not use that image: ' + String(err));
    }
  };

  const handleClearThumbnail = async () => {
    await updateProjectConfig({ ...config, thumbnail: undefined });
  };

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div
      className="project-card"
      onClick={() => onOpen(config.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(config.id); }}
    >
      <div className="project-card-thumb">
        {config.thumbnail ? (
          <img className="project-card-thumb-img" src={config.thumbnail} alt="" />
        ) : entryScreen ? (
          <ScreenThumbnail
            className="project-card-thumb-img"
            screen={entryScreen}
            width={config.display.width}
            height={config.display.height}
          />
        ) : (
          <div className="project-card-thumb-empty">📐</div>
        )}

        <div className="project-card-tools" onClick={e => e.stopPropagation()}>
          <div className="project-card-menu" ref={menuRef}>
            <button
              className="project-card-tool-btn"
              title="Card options"
              onClick={() => setMenuOpen(open => !open)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="project-card-menu-dropdown">
                <button
                  type="button"
                  className="project-card-menu-item"
                  onClick={() => runMenuAction(handleEditDescription)}
                >
                  Edit Description
                </button>
                <button
                  type="button"
                  className="project-card-menu-item"
                  onClick={() => runMenuAction(() => thumbInputRef.current?.click())}
                >
                  Set Custom Thumbnail
                </button>
                {config.thumbnail && (
                  <button
                    type="button"
                    className="project-card-menu-item"
                    onClick={() => runMenuAction(handleClearThumbnail)}
                  >
                    Remove Custom Thumbnail
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            className="project-card-tool-btn"
            title="Delete project"
            onClick={() => onDelete(config.id)}
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="project-card-info">
        <div className="project-card-name">{config.name}</div>
        {config.description && (
          <div className="project-card-desc" title={config.description}>{config.description}</div>
        )}
        <div className="project-card-meta">{board.name}</div>
        <div className="project-card-meta">
          {config.display.width} × {config.display.height} · {config.display.colorDepth}bit
        </div>
        <div className="project-card-meta">
          {updatedStr} · {formatFileSize(size)}
        </div>
      </div>

      <input
        ref={thumbInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onClick={e => e.stopPropagation()}
        onChange={handleThumbnailFile}
      />
    </div>
  );
};

export default ProjectCard;
