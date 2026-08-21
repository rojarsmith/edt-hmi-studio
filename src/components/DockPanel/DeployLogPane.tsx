// One dock pane: an operation's output, with that operation's own toolbar.
//
// The pane carries the trigger rather than only the log -- the way Visual
// Studio's Package Manager Console has its own controls -- so the operation can
// be started and watched without going back to the Deploy tab.
// See docs/bottom-dock-panel.md §5.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDeployStore, type DeployLogPane as PaneId } from '../../store/deployStore';
import { getBoardDefinition, getProtocolDefinition } from '../../types/hmi';

type CopyFeedback = { kind: 'success' | 'error'; message: string } | null;

interface DeployLogPaneProps {
  pane: PaneId;
}

const DeployLogPane: React.FC<DeployLogPaneProps> = ({ pane }) => {
  const busy = useDeployStore((state) => state.busy);
  const buildId = useDeployStore((state) => state.buildId);
  const boardId = useDeployStore((state) => state.boardId);
  const protocol = useDeployStore((state) => state.protocol);
  const capabilities = useDeployStore((state) => state.capabilities);
  const ports = useDeployStore((state) => state.ports);
  const runtimePort = useDeployStore((state) => state.runtimePort);
  const log = useDeployStore((state) => (pane === 'build' ? state.buildLog : state.flashLog));
  const clearLog = useDeployStore((state) => state.clearLog);
  const runBuild = useDeployStore((state) => state.runBuild);
  const runFlash = useDeployStore((state) => state.runFlash);

  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // A log you have to scroll by hand while a build runs is a log nobody reads.
  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [log]);

  useEffect(() => {
    setCopyFeedback(null);
  }, [log.length]);

  const handleCopy = useCallback(async () => {
    if (log.length === 0) {
      setCopyFeedback({ kind: 'error', message: 'No log entries to copy.' });
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(log.join('\n'));
      setCopyFeedback({
        kind: 'success',
        message: `Copied ${log.length} log ${log.length === 1 ? 'entry' : 'entries'}.`,
      });
    } catch {
      setCopyFeedback({
        kind: 'error',
        message: 'Could not copy the log. Check clipboard permissions and try again.',
      });
    }
  }, [log]);

  const serviceAvailable = capabilities
    ? capabilities.available !== false
      && capabilities.programmerAvailable !== false
      && capabilities.success
    : null;

  const isBuild = pane === 'build';
  const protocolDefinition = getProtocolDefinition(protocol);
  const canRun = isBuild
    ? protocolDefinition.implemented
      && serviceAvailable !== false
      && capabilities?.canBuild !== false
    : Boolean(buildId) && serviceAvailable !== false && capabilities?.canFlash !== false;

  const runLabel = isBuild
    ? busy === 'building' ? 'Building...' : 'Build Firmware'
    : busy === 'flashing' ? 'Flashing...' : 'Flash & Reset';

  const probeSerial = ports.find((port) => port.path === runtimePort)?.probeSerial;

  return (
    <div className="dock-pane">
      <div className="dock-pane-toolbar">
        <button
          type="button"
          className={isBuild ? 'dock-pane-run' : 'dock-pane-run danger'}
          onClick={isBuild ? runBuild : runFlash}
          disabled={busy !== null || !canRun}
          title={
            !isBuild && !buildId
              ? 'Build the firmware first'
              : undefined
          }
        >
          {runLabel}
        </button>

        <span className="dock-pane-meta">
          {isBuild
            ? `${getBoardDefinition(boardId).model} · ${protocolDefinition.name}`
            : `ST-LINK: ${probeSerial || 'selected automatically'}`}
        </span>
        <span className="dock-pane-meta">
          {isBuild
            ? `Build ID: ${buildId || 'not built yet'}`
            : buildId
              ? `Image: ${buildId}`
              : 'No image built yet'}
        </span>

        <div className="dock-pane-toolbar-end">
          {copyFeedback && (
            <span className={`dock-pane-feedback ${copyFeedback.kind}`} role="status" aria-live="polite">
              {copyFeedback.message}
            </span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            disabled={log.length === 0}
            aria-label={`Copy ${pane} log`}
            title={log.length === 0 ? 'No log entries to copy' : 'Copy all log entries'}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => clearLog(pane)}
            disabled={log.length === 0}
            aria-label={`Clear ${pane} log`}
            title={log.length === 0 ? 'No log entries to clear' : 'Clear all log entries'}
          >
            Clear
          </button>
        </div>
      </div>

      <pre className="dock-pane-log" ref={logRef}>
        {log.length > 0
          ? log.join('\n')
          : isBuild
            ? 'Waiting for a build...'
            : 'Waiting for a flash...'}
      </pre>
    </div>
  );
};

export default DeployLogPane;
