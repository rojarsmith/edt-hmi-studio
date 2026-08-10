// Full-page host for one resource kind. Image, Text and Icon are top-level
// tabs; this supplies the header, view toggle and search they share.

import React from 'react';
import { useResourceStore } from './resourceStore';
import ImageManager from './ImageManager';
import FontManager from './FontManager';
import IconLibrary from './IconLibrary';
import './ResourceWorkspace.css';

export type ResourceKind = 'image' | 'text' | 'icon';

interface ResourceWorkspaceProps {
  kind: ResourceKind;
}

const VIEWS: Record<ResourceKind, {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
}> = {
  image: {
    title: 'Image',
    subtitle: 'Upload images and convert them to LVGL C arrays.',
    searchPlaceholder: 'Search images...',
  },
  text: {
    title: 'Text',
    subtitle: 'Fonts available to labels and other text widgets.',
    searchPlaceholder: 'Search fonts...',
  },
  icon: {
    title: 'Icon',
    subtitle: 'Built-in icon library, searchable by name and category.',
    searchPlaceholder: 'Search icons...',
  },
};

const ResourceWorkspace: React.FC<ResourceWorkspaceProps> = ({ kind }) => {
  const viewMode = useResourceStore((state) => state.viewMode);
  const setViewMode = useResourceStore((state) => state.setViewMode);
  const searchQuery = useResourceStore((state) => state.searchQuery);
  const setSearchQuery = useResourceStore((state) => state.setSearchQuery);
  const images = useResourceStore((state) => state.images);
  const fonts = useResourceStore((state) => state.fonts);

  const view = VIEWS[kind];
  // Icons come from a fixed built-in library, so a count says nothing useful.
  const count = kind === 'image'
    ? images.length
    : kind === 'text'
      ? fonts.length
      : null;

  return (
    <div className="resource-workspace">
      <div className="resource-workspace-header">
        <div className="resource-workspace-title">
          <h2>
            {view.title}
            {count !== null && count > 0 && (
              <span className="resource-workspace-count">{count}</span>
            )}
          </h2>
          <p>{view.subtitle}</p>
        </div>
        <div className="view-toggle">
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title="Grid view"
            aria-label="Grid view"
          >
            ▦
          </button>
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            title="List view"
            aria-label="List view"
          >
            ☰
          </button>
        </div>
      </div>

      <div className="resource-search">
        <input
          type="text"
          placeholder={view.searchPlaceholder}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {searchQuery && (
          <button
            className="clear-search"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="resource-content">
        {kind === 'image' && <ImageManager viewMode={viewMode} />}
        {kind === 'text' && <FontManager viewMode={viewMode} />}
        {kind === 'icon' && <IconLibrary viewMode={viewMode} />}
      </div>
    </div>
  );
};

export default ResourceWorkspace;
