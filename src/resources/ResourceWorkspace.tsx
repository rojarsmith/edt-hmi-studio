// Full-page host for one resource kind. Image, Text and Icon are top-level
// tabs; this supplies the header, view toggle and search they share.

import React from 'react';
import { useResourceStore } from './resourceStore';
import ImageResourceManager from './ImageResourceManager';
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
  // The image manager is a two-pane layout that owns its own search and needs
  // the full height, so the shared search box and view toggle would only get in
  // its way.
  const ownsItsChrome = kind === 'image';

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
      </div>

      {!ownsItsChrome && (
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
      )}

      {kind === 'image' ? (
        <ImageResourceManager />
      ) : (
        <div className="resource-content">
          {kind === 'text' && <FontManager />}
          {kind === 'icon' && <IconLibrary />}
        </div>
      )}
    </div>
  );
};

export default ResourceWorkspace;
