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
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}

const TreeRow: React.FC<TreeRowProps> = ({
  node, depth, selected, expanded, onSelect, onToggle,
}) => {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.path);

  return (
    <>
      <button
        type="button"
        className={`imgres-node ${selected === node.path ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.path)}
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
          onSelect={onSelect}
          onToggle={onToggle}
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
  const screens = useEditorStore((state) => state.screens);

  const [selectedFolder, setSelectedFolder] = useState<string>(ROOT_PATH);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([ROOT_PATH]));
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildImageTree(images), [images]);
  const usage = useMemo(() => countImageUsage(screens), [screens]);
  const rows = useMemo(
    () => selectImages(images, selectedFolder, query),
    [images, selectedFolder, query],
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
        <div className="imgres-tree-header">Folders</div>
        <div className="imgres-tree-scroll">
          <TreeRow
            node={tree}
            depth={0}
            selected={selectedFolder}
            expanded={expanded}
            onSelect={selectFolder}
            onToggle={toggleExpanded}
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
              <button type="button" onClick={deleteChecked}>Delete</button>
            </>
          )}
          <button type="button" onClick={() => fileInput.current?.click()}>
            Add Images
          </button>
          <button type="button" onClick={() => folderInput.current?.click()}>
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
                  <tr key={image.id} className={checked.has(image.id) ? 'selected' : ''}>
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
