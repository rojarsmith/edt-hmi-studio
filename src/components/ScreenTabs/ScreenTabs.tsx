// Screen tab strip along the bottom of the canvas.
// Shows only the screens that are currently open; the full list lives in the
// screen manager. There is deliberately no "new screen" button here — screens
// are created from the manager.

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';
import './ScreenTabs.css';

/** How far one press of a scroll arrow moves the strip. */
const SCROLL_STEP = 160;

const ScreenTabs: React.FC = () => {
  const screens = useEditorStore(s => s.screens);
  const openScreenIds = useEditorStore(s => s.openScreenIds);
  const currentScreenId = useEditorStore(s => s.currentScreenId);
  const setCurrentScreen = useEditorStore(s => s.setCurrentScreen);
  const closeScreen = useEditorStore(s => s.closeScreen);
  const renameScreen = useEditorStore(s => s.renameScreen);
  const updateScreenBackground = useEditorStore(s => s.updateScreenBackground);

  const [editingScreenId, setEditingScreenId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const handleDoubleClick = useCallback((screenId: string, currentName: string) => {
    setEditingScreenId(screenId);
    setEditingName(currentName);
  }, []);

  const handleRenameSubmit = useCallback(() => {
    if (editingScreenId && editingName.trim()) {
      renameScreen(editingScreenId, editingName.trim());
    }
    setEditingScreenId(null);
    setEditingName('');
  }, [editingScreenId, editingName, renameScreen]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditingScreenId(null);
      setEditingName('');
    }
  }, [handleRenameSubmit]);

  const handleClose = useCallback((e: React.MouseEvent, screenId: string) => {
    // Without this the tab underneath would activate on its way out.
    e.stopPropagation();
    closeScreen(screenId);
  }, [closeScreen]);

  /** Recompute which scroll arrows apply. */
  const syncOverflow = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    setOverflow({
      // 1px of slack: fractional layout widths otherwise leave an arrow
      // permanently enabled at the end of the strip.
      left: strip.scrollLeft > 1,
      right: strip.scrollLeft < maxScroll - 1,
    });
  }, []);

  const scrollBy = useCallback((delta: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    // Assigned directly rather than via scrollBy({behavior:'smooth'}): smooth
    // scrolling is driven by the compositor and silently does nothing when the
    // page is not painting, which would leave these arrows dead.
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    strip.scrollLeft = Math.max(0, Math.min(maxScroll, strip.scrollLeft + delta));
    syncOverflow();
  }, [syncOverflow]);

  // Tabs follow open order, and a stale id (screen deleted elsewhere) drops out.
  const openScreens = openScreenIds
    .map(id => screens.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  // Adding or closing a tab changes the scrollable width.
  useLayoutEffect(syncOverflow, [syncOverflow, openScreens.length]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [syncOverflow]);

  // Keep the active tab reachable when it is selected from the manager.
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('.screen-tab.active');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentScreenId]);

  const currentScreen = screens.find(s => s.id === currentScreenId);
  const canClose = openScreens.length > 1;
  const scrollable = overflow.left || overflow.right;

  return (
    <div className="screen-tabs">
      {scrollable && (
        <button
          type="button"
          className="screen-tab-scroll"
          onClick={() => scrollBy(-SCROLL_STEP)}
          disabled={!overflow.left}
          title="Scroll tabs left"
          aria-label="Scroll tabs left"
        >
          ‹
        </button>
      )}

      <div className="screen-tab-strip" ref={stripRef} onScroll={syncOverflow}>
        {openScreens.map(screen => (
          <div
            key={screen.id}
            className={`screen-tab ${screen.id === currentScreenId ? 'active' : ''}`}
            onClick={() => setCurrentScreen(screen.id)}
            onDoubleClick={() => handleDoubleClick(screen.id, screen.name)}
          >
            {editingScreenId === screen.id ? (
              <input
                type="text"
                className="screen-name-input"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="screen-icon">📄</span>
                <span className="screen-name">{screen.name}</span>
                <button
                  type="button"
                  className="screen-tab-close"
                  onClick={(e) => handleClose(e, screen.id)}
                  disabled={!canClose}
                  title={canClose ? `Close ${screen.name}` : 'The last open screen cannot be closed'}
                  aria-label={`Close ${screen.name}`}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {scrollable && (
        <button
          type="button"
          className="screen-tab-scroll"
          onClick={() => scrollBy(SCROLL_STEP)}
          disabled={!overflow.right}
          title="Scroll tabs right"
          aria-label="Scroll tabs right"
        >
          ›
        </button>
      )}

      {/* Current screen properties */}
      {currentScreen && (
        <div className="screen-properties">
          <div className="screen-prop-row">
            <label>Background Color</label>
            <input
              type="color"
              value={currentScreen.backgroundColor || '#ffffff'}
              onChange={(e) => updateScreenBackground(currentScreen.id, e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenTabs;
