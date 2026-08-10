// Image resources as a folder tree plus a batch table, in the shape TouchGFX
// uses. Folders come from the relative paths of an uploaded directory; see
// imageTree.ts for why they are derived rather than stored.

import React, { useMemo, useRef, useState } from 'react';
import { useResourceStore } from './resourceStore';
import { useEditorStore } from '../store/editorStore';
import { countImageUsage, usageFor } from './imageUsage';
import {
  ROOT_NAME,
  ROOT_PATH,
  buildImageTree,
  folderFromRelativePath,
  normalizeFolderPath,
  selectImages,
  type ImageFolderNode,
} from './imageTree';
import { getBytesPerPixel } from './converters/imageConverter';
import type { ImageFormat } from './types';
import { toast } from '../components/Toast';
import './ImageResourceManager.css';

/**
 * Formats the editor offers. TouchGFX's Compression, Dither Algorithm, Alpha
 * Dither and Layout Rotation columns have no counterpart here: this project
 * emits uncompressed C arrays, LVGL's compressed images go through the binary
 * decoder rather than an array, and LVGL rotates at runtime instead of storing
 * a pre-rotated asset.
 */
const FORMATS: ImageFormat[] = ['RGB565', 'RGB888', 'ARGB8888'];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

interface TreeRowProps {
  node: ImageFolderNode;
  depth: number;
  selected: string;
  expanded: Set<string>;
  dropTarget: string | null;
  renaming: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onDropOn: (path: string) => void;
  onDragOverNode: (path: string | null) => void;
  onDragFolder: (path: string) => void;
  onRenameCommit: (path: string, name: string) => void;
  onRenameCancel: () => void;
}

const TreeRow: React.FC<TreeRowProps> = ({
  node, depth, selected, expanded, dropTarget, renaming,
  onSelect, onToggle, onDropOn, onDragOverNode, onDragFolder,
  onRenameCommit, onRenameCancel,
}) => {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.path);
  const isRoot = node.path === ROOT_PATH;

  if (renaming === node.path) {
    return (
      <input
        className="imgres-rename"
        style={{ marginLeft: 8 + depth * 14 }}
        defaultValue={node.name}
        autoFocus
        onBlur={(event) => onRenameCommit(node.path, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onRenameCommit(node.path, event.currentTarget.value);
          if (event.key === 'Escape') onRenameCancel();
        }}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className={`imgres-node ${selected === node.path ? 'selected' : ''} ${dropTarget === node.path ? 'droptarget' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.path)}
        draggable={!isRoot}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-edt-folder', node.path);
          event.dataTransfer.effectAllowed = 'move';
          onDragFolder(node.path);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          onDragOverNode(node.path);
        }}
        onDragLeave={() => onDragOverNode(null)}
        onDrop={(event) => {
          event.preventDefault();
          // The scroll container treats a drop as "move to the root". Without
          // this the node's own drop bubbles into it and is overwritten.
          event.stopPropagation();
          onDropOn(node.path);
        }}
      >
        {hasChildren ? (
          <span
            className="imgres-twisty"
            role="presentation"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.path);
            }}
          >
            {isOpen ? '▼' : '▶'}
          </span>
        ) : (
          <span className="imgres-twisty-spacer" />
        )}
        <span className="imgres-node-name">{node.name}</span>
        <span className="imgres-node-count">{node.totalCount}</span>
      </button>
      {isOpen && node.children.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          expanded={expanded}
          dropTarget={dropTarget}
          renaming={renaming}
          onSelect={onSelect}
          onToggle={onToggle}
          onDropOn={onDropOn}
          onDragOverNode={onDragOverNode}
          onDragFolder={onDragFolder}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </>
  );
};

const ImageResourceManager: React.FC = () => {
  const images = useResourceStore((state) => state.images);
  const addImage = useResourceStore((state) => state.addImage);
  const updateImage = useResourceStore((state) => state.updateImage);
  const deleteImage = useResourceStore((state) => state.deleteImage);
  const imageFolders = useResourceStore((state) => state.imageFolders);
  const createFolder = useResourceStore((state) => state.createFolder);
  const renameFolder = useResourceStore((state) => state.renameFolder);
  const moveFolder = useResourceStore((state) => state.moveFolder);
  const deleteFolder = useResourceStore((state) => state.deleteFolder);
  const moveImages = useResourceStore((state) => state.moveImages);
  const screens = useEditorStore((state) => state.screens);

  const [selectedFolder, setSelectedFolder] = useState<string>(ROOT_PATH);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([ROOT_PATH]));
  const [query, setQuery] = useState('');
  const [showChildren, setShowChildren] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** Set while a folder is being dragged, so a drop knows what it carries. */
  const draggingFolder = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const tree = useMemo(
    () => buildImageTree(images, imageFolders),
    [images, imageFolders],
  );
  const usage = useMemo(() => countImageUsage(screens), [screens]);
  const rows = useMemo(
    () => selectImages(images, selectedFolder, query, showChildren),
    [images, selectedFolder, query, showChildren],
  );

  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const checkedVisible = useMemo(
    () => rows.filter((row) => checked.has(row.id)),
    [rows, checked],
  );
  const allChecked = rows.length > 0 && checkedVisible.length === rows.length;

  const toggleExpanded = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectFolder = (path: string) => {
    setSelectedFolder(path);
    // Dropping the selection avoids acting on rows that are no longer shown.
    setChecked(new Set());
    setExpanded((current) => new Set(current).add(path));
  };

  const toggleRow = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(visibleIds));
  };

  const handleFiles = async (files: FileList | null, fromFolder: boolean) => {
    if (!files || files.length === 0) return;
    let added = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      // webkitRelativePath is only populated by a directory upload.
      const relative = (file as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      const folder = fromFolder && relative
        ? folderFromRelativePath(relative)
        : selectedFolder;
      try {
        await addImage(file, folder);
        added += 1;
      } catch (error) {
        toast.error(`Could not add ${file.name}: ${String(error)}`);
      }
    }
    if (added > 0) toast.success(`Added ${added} image${added === 1 ? '' : 's'}`);
  };

  const handleNewFolder = () => {
    const base = selectedFolder === ROOT_PATH ? 'New Folder' : `${selectedFolder}/New Folder`;
    createFolder(base);
    setExpanded((current) => new Set(current).add(selectedFolder));
    setRenaming(base);
  };

  const handleRenameCommit = (path: string, name: string) => {
    setRenaming(null);
    const trimmed = name.trim();
    if (trimmed === '') return;
    renameFolder(path, trimmed);
    // The selection follows the folder rather than being left on a dead path.
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ROOT_PATH;
    const next = parent === ROOT_PATH ? trimmed : `${parent}/${trimmed}`;
    if (selectedFolder === path) setSelectedFolder(next);
  };

  const handleDeleteFolder = () => {
    if (selectedFolder === ROOT_PATH) return;
    const parent = selectedFolder.includes('/')
      ? selectedFolder.slice(0, selectedFolder.lastIndexOf('/'))
      : ROOT_PATH;
    deleteFolder(selectedFolder);
    setSelectedFolder(parent);
    toast.info('Folder removed. Any images it held moved to the parent.');
  };

  /** A tree node accepts either a dragged folder or the checked images. */
  const handleDropOn = (path: string) => {
    setDropTarget(null);
    const folder = draggingFolder.current;
    draggingFolder.current = null;
    if (folder !== null) {
      moveFolder(folder, path);
      setExpanded((current) => new Set(current).add(path));
      return;
    }
    const ids = checkedVisible.map((row) => row.id);
    if (ids.length === 0) return;
    moveImages(ids, path);
    setChecked(new Set());
    toast.success(`Moved ${ids.length} image${ids.length === 1 ? '' : 's'}`);
  };

  const applyFormatToChecked = (format: ImageFormat) => {
    for (const row of checkedVisible) updateImage(row.id, { format });
  };

  const deleteChecked = () => {
    for (const row of checkedVisible) deleteImage(row.id);
    setChecked(new Set());
  };

  const crumb = selectedFolder === ROOT_PATH ? ROOT_NAME : selectedFolder;

  return (
    <div className="imgres">
      <div className="imgres-tree">
        <div className="imgres-tree-header">
          <span>Folders</span>
          <span className="imgres-tree-actions">
            <button type="button" title="New folder" onClick={handleNewFolder}>+</button>
            <button
              type="button"
              title="Rename folder"
              disabled={selectedFolder === ROOT_PATH}
              onClick={() => setRenaming(selectedFolder)}
            >
              ✎
            </button>
            <button
              type="button"
              title="Delete folder"
              disabled={selectedFolder === ROOT_PATH}
              onClick={handleDeleteFolder}
            >
              ×
            </button>
          </span>
        </div>
        <div
          className="imgres-tree-scroll"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            // A drop on empty space below the tree means the root.
            event.preventDefault();
            handleDropOn(ROOT_PATH);
          }}
        >
          <TreeRow
            node={tree}
            depth={0}
            selected={selectedFolder}
            expanded={expanded}
            dropTarget={dropTarget}
            renaming={renaming}
            onSelect={selectFolder}
            onToggle={toggleExpanded}
            onDropOn={handleDropOn}
            onDragOverNode={setDropTarget}
            onDragFolder={(path) => { draggingFolder.current = path; }}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={() => setRenaming(null)}
          />
        </div>
      </div>

      <div className="imgres-main">
        <div className="imgres-toolbar">
          <input
            className="imgres-search"
            type="text"
            placeholder="Search images..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="imgres-crumb">
            {crumb} · {rows.length} shown
          </span>
          <label className="imgres-showchild">
            <input
              type="checkbox"
              checked={showChildren}
              onChange={(event) => setShowChildren(event.target.checked)}
            />
            Show child
          </label>
          <span className="imgres-spacer" />
          {checkedVisible.length > 0 && (
            <>
              <span className="imgres-selection">
                {checkedVisible.length} selected
              </span>
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    applyFormatToChecked(event.target.value as ImageFormat);
                    event.target.value = '';
                  }
                }}
              >
                <option value="">Set format...</option>
                {FORMATS.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
              <button
                type="button"
                className="imgres-btn imgres-btn-danger"
                onClick={deleteChecked}
              >
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            className="imgres-btn imgres-btn-primary"
            onClick={() => fileInput.current?.click()}
          >
            <span className="imgres-btn-icon" aria-hidden="true">＋</span>
            Add Images
          </button>
          <button
            type="button"
            className="imgres-btn"
            onClick={() => folderInput.current?.click()}
          >
            <span className="imgres-btn-icon" aria-hidden="true">🗀</span>
            Add Folder
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void handleFiles(event.target.files, false);
              event.target.value = '';
            }}
          />
          <input
            ref={folderInput}
            type="file"
            hidden
            multiple
            // Not in the React types; a directory picker needs the attribute.
            {...{ webkitdirectory: '', directory: '' }}
            onChange={(event) => {
              void handleFiles(event.target.files, true);
              event.target.value = '';
            }}
          />
        </div>

        <div className="imgres-table-wrap">
          <table className="imgres-table">
            <thead>
              <tr>
                <th className="imgres-col-check">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Select all shown images"
                  />
                </th>
                <th className="imgres-col-thumb">Image</th>
                <th>Name</th>
                <th>Folder</th>
                <th>Uses</th>
                <th>Size</th>
                <th>Image Format</th>
                <th title="Pixel data in the generated C array. A source with an alpha channel requested as RGB565 is emitted as RGB565A8, which is 3 bytes per pixel rather than 2, so those rows read low.">
                  Data ⓘ
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="imgres-empty">
                    {images.length === 0
                      ? 'No image resources yet. Use Add Images or Add Folder.'
                      : 'Nothing here matches.'}
                  </td>
                </tr>
              ) : rows.map((image) => {
                const bytes = image.width * image.height
                  * getBytesPerPixel(image.format);
                const uses = usageFor(usage, image);
                const folder = normalizeFolderPath(image.folder);
                return (
                  <tr
                    key={image.id}
                    className={checked.has(image.id) ? 'selected' : ''}
                    draggable={checked.has(image.id)}
                    onDragStart={(event) => {
                      draggingFolder.current = null;
                      event.dataTransfer.setData('application/x-edt-images', '1');
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={checked.has(image.id)}
                        onChange={() => toggleRow(image.id)}
                        aria-label={`Select ${image.name}`}
                      />
                    </td>
                    <td>
                      <img className="imgres-thumb" src={image.data} alt="" />
                    </td>
                    <td className="imgres-name">{image.name}</td>
                    <td className="imgres-folder">
                      {folder === ROOT_PATH ? '—' : folder}
                    </td>
                    <td className={uses === 0 ? 'imgres-muted' : ''}>{uses}</td>
                    <td>{image.width} × {image.height}</td>
                    <td>
                      <select
                        value={image.format}
                        onChange={(event) => updateImage(image.id, {
                          format: event.target.value as ImageFormat,
                        })}
                      >
                        {FORMATS.map((format) => (
                          <option key={format} value={format}>{format}</option>
                        ))}
                      </select>
                    </td>
                    <td>{formatBytes(bytes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ImageResourceManager;
