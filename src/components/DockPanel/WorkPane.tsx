// The Work pane: every operation this session has run, newest first.
//
// Eclipse's Progress view is the model, with one difference that is the whole
// point — a finished item stays. See docs/work-progress.md.

import React, { useEffect, useState } from 'react';
import { useWorkStore, type WorkItem, type WorkStatus } from '../../store/workStore';

const STATUS_GLYPH: Record<WorkStatus, string> = {
  running: '',
  succeeded: '✓',
  failed: '✕',
  cancelled: '⊘',
};

const STATUS_LABEL: Record<WorkStatus, string> = {
  running: 'Running',
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Stopped',
};

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour12: false });
}

/**
 * Elapsed rather than a second clock time: what a reader wants from a finished
 * build is how long it took, and from a running one how long they have waited.
 */
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

const WorkRow: React.FC<{ item: WorkItem; now: number }> = ({ item, now }) => {
  const elapsed = (item.endedAt ?? now) - item.startedAt;
  const percent = item.progress
    ? Math.round((item.progress.done / item.progress.total) * 100)
    : null;
  const running = item.status === 'running';

  return (
    <li className={`work-row ${item.status}`}>
      <span className="work-id">{item.id}</span>
      <span className="work-time" title={new Date(item.startedAt).toLocaleString()}>
        {formatTime(item.startedAt)}
      </span>

      <span className="work-name">{item.name}</span>

      <span className="work-progress">
        <span
          className={`work-bar ${running && percent === null ? 'indeterminate' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-label={`${item.name} progress`}
        >
          <span
            className="work-bar-fill"
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </span>
        <span className="work-count">
          {percent === null
            ? running ? formatElapsed(elapsed) : STATUS_LABEL[item.status]
            : `${item.progress?.done}/${item.progress?.total}`}
        </span>
      </span>

      <span className="work-action">
        {running && item.cancellable && item.cancel ? (
          <button
            type="button"
            className="work-stop"
            onClick={() => item.cancel?.()}
            title={`Stop ${item.name}`}
            aria-label={`Stop ${item.name}`}
          >
            <span className="work-stop-glyph" aria-hidden="true" />
          </button>
        ) : (
          <span
            className={`work-status ${item.status}`}
            title={`${STATUS_LABEL[item.status]}${item.endedAt ? ` in ${formatElapsed(elapsed)}` : ''}`}
          >
            {running ? <span className="work-spinner" aria-hidden="true" /> : STATUS_GLYPH[item.status]}
          </span>
        )}
      </span>

      {/* The most informative part of Eclipse's version: what it is doing now,
          or what it ended up saying. */}
      <span className="work-detail" title={item.detail}>{item.detail}</span>
    </li>
  );
};

const WorkPane: React.FC = () => {
  const items = useWorkStore((state) => state.items);
  const clearFinished = useWorkStore((state) => state.clearFinished);
  const hasRunning = items.some((item) => item.status === 'running');
  const [now, setNow] = useState(() => Date.now());

  // Only ticking while something runs: a history of finished work has nothing
  // that changes on its own.
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  return (
    <div className="dock-pane work-pane">
      <div className="dock-pane-toolbar">
        <span className="dock-pane-meta">
          {items.length === 0
            ? 'Nothing has run yet'
            : `${items.length} ${items.length === 1 ? 'item' : 'items'} this session`}
        </span>
        <div className="dock-pane-toolbar-end">
          <button
            type="button"
            onClick={clearFinished}
            disabled={items.every((item) => item.status === 'running')}
            title="Remove everything that has finished. Running work stays."
          >
            Clear finished
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="work-empty">
          Build or flash the firmware and it will be listed here, newest first.
          The list keeps every run until the app closes.
        </p>
      ) : (
        <ul className="work-list">
          {items.map((item) => (
            <WorkRow key={item.id} item={item} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default WorkPane;
