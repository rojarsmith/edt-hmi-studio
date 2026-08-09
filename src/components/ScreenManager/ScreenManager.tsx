// Screen Manager - collapsible tree of screens and screen groups.
//
// Groups are organisational only and nest at most two levels deep; attempting
// to go deeper surfaces a notice rather than silently doing nothing. Clicking a
// screen opens it (or jumps to its existing tab).

import React, { useCallback, useMemo, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { MAX_SCREEN_GROUP_DEPTH } from '../../types';
import type { Screen, ScreenGroup } from '../../types';
import './ScreenManager.css';

interface PendingDelete {
  kind: 'screen' | 'group';
  id: string;
  name: string;
}

interface RenameState {
  id: string;
  value: string;
}

/** Stand-in group id for "no group", so the root area can be a drop target. */
const ROOT_DROP = '__root__';

const ScreenManager: React.FC = () => {
  const screens = useEditorStore(s => s.screens);
  const screenGroups = useEditorStore(s => s.screenGroups);
  const currentScreenId = useEditorStore(s => s.currentScreenId);
  const openScreenIds = useEditorStore(s => s.openScreenIds);
  const openScreen = useEditorStore(s => s.openScreen);
  const addScreen = useEditorStore(s => s.addScreen);
  const deleteScreen = useEditorStore(s => s.deleteScreen);
  const renameScreen = useEditorStore(s => s.renameScreen);
  const addScreenGroup = useEditorStore(s => s.addScreenGroup);
  const deleteScreenGroup = useEditorStore(s => s.deleteScreenGroup);
  const renameScreenGroup = useEditorStore(s => s.renameScreenGroup);
  const canNestScreenGroup = useEditorStore(s => s.canNestScreenGroup);

  const moveScreenToGroup = useEditorStore(s => s.moveScreenToGroup);

  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draggedScreenId, setDraggedScreenId] = useState<string | null>(null);
  /** Group id currently under the pointer, or ROOT_DROP for the tree background. */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const matchesQuery = useCallback(
    (name: string) => !isSearching || name.toLowerCase().includes(normalizedQuery),
    [isSearching, normalizedQuery],
  );

  const screensByGroup = useMemo(() => {
    const map = new Map<string | null, Screen[]>();
    for (const screen of screens) {
      if (!matchesQuery(screen.name)) continue;
      const key = screen.groupId ?? null;
      const bucket = map.get(key);
      if (bucket) bucket.push(screen);
      else map.set(key, [screen]);
    }
    return map;
  }, [screens, matchesQuery]);

  const groupsByParent = useMemo(() => {
    const map = new Map<string | null, ScreenGroup[]>();
    for (const group of screenGroups) {
      const key = group.parentId ?? null;
      const bucket = map.get(key);
      if (bucket) bucket.push(group);
      else map.set(key, [group]);
    }
    return map;
  }, [screenGroups]);

  /** A group survives a search when it or anything under it matches. */
  const groupMatches = useCallback(
    (group: ScreenGroup): boolean => {
      if (!isSearching) return true;
      const visit = (candidate: ScreenGroup): boolean => {
        if (matchesQuery(candidate.name)) return true;
        if ((screensByGroup.get(candidate.id) ?? []).length > 0) return true;
        return (groupsByParent.get(candidate.id) ?? []).some(visit);
      };
      return visit(group);
    },
    [isSearching, matchesQuery, screensByGroup, groupsByParent],
  );

  const handleToggleGroup = useCallback((groupId: string) => {
    setCollapsedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleAddGroup = useCallback((parentId: string | null) => {
    if (!canNestScreenGroup(parentId)) {
      setNotice(
        `Screen groups can only be nested ${MAX_SCREEN_GROUP_DEPTH} levels deep. ` +
        'Add this group one level up instead.',
      );
      return;
    }
    addScreenGroup(parentId);
  }, [addScreenGroup, canNestScreenGroup]);

  const handleRenameSubmit = useCallback(() => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (name) {
      if (screens.some(s => s.id === renaming.id)) renameScreen(renaming.id, name);
      else renameScreenGroup(renaming.id, name);
    }
    setRenaming(null);
  }, [renaming, screens, renameScreen, renameScreenGroup]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit();
    else if (e.key === 'Escape') setRenaming(null);
  }, [handleRenameSubmit]);

  const handleDragStart = useCallback((e: React.DragEvent, screenId: string) => {
    setDraggedScreenId(screenId);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox ignores drags that carry no payload.
    e.dataTransfer.setData('text/plain', screenId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedScreenId(null);
    setDropTargetId(null);
  }, []);

  /** Mark `targetId` as the pending drop destination. */
  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    if (!draggedScreenId) return;
    e.preventDefault();
    // Rows sit inside the tree, which is itself the root target.
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(targetId);
  }, [draggedScreenId]);

  const handleDrop = useCallback((e: React.DragEvent, groupId: string | null) => {
    if (!draggedScreenId) return;
    e.preventDefault();
    e.stopPropagation();

    const screen = screens.find(s => s.id === draggedScreenId);
    // Skip no-op moves so they don't land on the undo stack.
    if (screen && (screen.groupId ?? null) !== groupId) {
      moveScreenToGroup(draggedScreenId, groupId);
    }
    handleDragEnd();
  }, [draggedScreenId, screens, moveScreenToGroup, handleDragEnd]);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'screen') deleteScreen(pendingDelete.id);
    else deleteScreenGroup(pendingDelete.id);
    setPendingDelete(null);
  }, [pendingDelete, deleteScreen, deleteScreenGroup]);

  const renderRenameInput = (id: string) => (
    <input
      type="text"
      className="sm-rename-input"
      value={renaming?.value ?? ''}
      onChange={e => setRenaming({ id, value: e.target.value })}
      onBlur={handleRenameSubmit}
      onKeyDown={handleRenameKeyDown}
      onClick={e => e.stopPropagation()}
      autoFocus
    />
  );

  const renderScreenRow = (screen: Screen, depth: number) => {
    const isOpen = openScreenIds.includes(screen.id);
    const isCurrent = screen.id === currentScreenId;

    return (
      <div
        key={screen.id}
        className={[
          'sm-row sm-screen',
          isCurrent ? 'current' : '',
          isOpen ? 'open' : '',
          draggedScreenId === screen.id ? 'dragging' : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={renaming?.id !== screen.id}
        onDragStart={e => handleDragStart(e, screen.id)}
        onDragEnd={handleDragEnd}
        // Dropping onto a screen files the dragged screen beside it.
        onDragOver={e => handleDragOver(e, screen.groupId ?? ROOT_DROP)}
        onDrop={e => handleDrop(e, screen.groupId ?? null)}
        onClick={() => openScreen(screen.id)}
        onDoubleClick={() => setRenaming({ id: screen.id, value: screen.name })}
        title={isOpen ? `${screen.name} (open)` : screen.name}
      >
        <span className="sm-icon">📄</span>
        {renaming?.id === screen.id ? (
          renderRenameInput(screen.id)
        ) : (
          <span className="sm-label">{screen.name}</span>
        )}
        <button
          type="button"
          className="sm-row-btn sm-delete"
          onClick={e => {
            e.stopPropagation();
            setPendingDelete({ kind: 'screen', id: screen.id, name: screen.name });
          }}
          disabled={screens.length <= 1}
          title={screens.length <= 1 ? 'A project needs at least one screen' : `Delete ${screen.name}`}
          aria-label={`Delete ${screen.name}`}
        >
          🗑
        </button>
      </div>
    );
  };

  const renderGroup = (group: ScreenGroup, depth: number): React.ReactNode => {
    if (!groupMatches(group)) return null;

    // A search result is always shown expanded, otherwise nothing would match.
    const isCollapsed = !isSearching && collapsedGroupIds.has(group.id);
    const childGroups = groupsByParent.get(group.id) ?? [];
    const childScreens = screensByGroup.get(group.id) ?? [];

    return (
      <div key={group.id} className="sm-group">
        <div
          className={`sm-row sm-group-row ${dropTargetId === group.id ? 'drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onDragOver={e => handleDragOver(e, group.id)}
          onDrop={e => handleDrop(e, group.id)}
          onClick={() => handleToggleGroup(group.id)}
          onDoubleClick={() => setRenaming({ id: group.id, value: group.name })}
        >
          <span className="sm-caret">{isCollapsed ? '▸' : '▾'}</span>
          <span className="sm-icon">📁</span>
          {renaming?.id === group.id ? (
            renderRenameInput(group.id)
          ) : (
            <span className="sm-label">{group.name}</span>
          )}
          <button
            type="button"
            className="sm-row-btn"
            onClick={e => {
              e.stopPropagation();
              addScreen(group.id);
            }}
            title={`New screen in ${group.name}`}
            aria-label={`New screen in ${group.name}`}
          >
            ＋
          </button>
          <button
            type="button"
            className="sm-row-btn"
            onClick={e => {
              e.stopPropagation();
              handleAddGroup(group.id);
            }}
            title={`New group in ${group.name}`}
            aria-label={`New group in ${group.name}`}
          >
            📁
          </button>
          <button
            type="button"
            className="sm-row-btn sm-delete"
            onClick={e => {
              e.stopPropagation();
              setPendingDelete({ kind: 'group', id: group.id, name: group.name });
            }}
            title={`Delete ${group.name}`}
            aria-label={`Delete ${group.name}`}
          >
            🗑
          </button>
        </div>

        {!isCollapsed && (
          <>
            {childGroups.map(child => renderGroup(child, depth + 1))}
            {childScreens.map(screen => renderScreenRow(screen, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const rootGroups = groupsByParent.get(null) ?? [];
  const rootScreens = screensByGroup.get(null) ?? [];
  const hasVisibleRows =
    rootScreens.length > 0 || rootGroups.some(groupMatches);

  return (
    <div className={`screen-manager ${collapsed ? 'collapsed' : ''}`}>
      <div className="sm-header">
        <button
          type="button"
          className="sm-collapse-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand screen manager' : 'Collapse screen manager'}
          aria-expanded={!collapsed}
        >
          <span className="sm-caret">{collapsed ? '▸' : '▾'}</span>
          <h3>🖥️ Screens</h3>
        </button>
        <div className="sm-header-actions">
          <button
            type="button"
            className="sm-header-btn"
            onClick={() => addScreen(null)}
            title="New screen"
            aria-label="New screen"
          >
            ＋
          </button>
          <button
            type="button"
            className="sm-header-btn"
            onClick={() => handleAddGroup(null)}
            title="New screen group"
            aria-label="New screen group"
          >
            📁
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="sm-search">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search screens..."
              aria-label="Search screens"
            />
          </div>

          <div
            className={`sm-tree ${dropTargetId === ROOT_DROP ? 'drop-target' : ''}`}
            onDragOver={e => handleDragOver(e, ROOT_DROP)}
            onDrop={e => handleDrop(e, null)}
          >
            {hasVisibleRows ? (
              <>
                {rootGroups.map(group => renderGroup(group, 0))}
                {rootScreens.map(screen => renderScreenRow(screen, 0))}
              </>
            ) : (
              <div className="sm-empty">
                {isSearching ? 'No matching screens' : 'No screens'}
              </div>
            )}
          </div>
        </>
      )}

      {notice && (
        <div className="sm-modal-backdrop" onClick={() => setNotice(null)}>
          <div className="sm-modal" onClick={e => e.stopPropagation()}>
            <h4>Nesting limit reached</h4>
            <p>{notice}</p>
            <div className="sm-modal-actions">
              <button type="button" className="sm-btn-primary" onClick={() => setNotice(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="sm-modal-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="sm-modal" onClick={e => e.stopPropagation()}>
            <h4>Delete {pendingDelete.kind === 'screen' ? 'screen' : 'group'}</h4>
            <p>
              {pendingDelete.kind === 'screen' ? (
                <>Delete <strong>{pendingDelete.name}</strong> and everything on it?</>
              ) : (
                <>
                  Delete the group <strong>{pendingDelete.name}</strong>? Screens and
                  subgroups inside it move up a level — nothing else is removed.
                </>
              )}
            </p>
            <p className="sm-modal-hint">This can be undone with Ctrl+Z.</p>
            <div className="sm-modal-actions">
              <button type="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="sm-btn-danger" onClick={handleConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenManager;
