// One dock pane: what the Emulator's compiler said.
//
// Sibling of DeployLogPane and deliberately built the same way — same toolbar,
// same Copy and Clear, same monospace log — because the two are the same kind
// of thing seen from two rungs of the ladder: one compiles for the browser, the
// other for the board. See docs/bottom-dock-panel.md §10.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEmulatorStore } from '../../store/emulatorStore';

type CopyFeedback = { kind: 'success' | 'error'; message: string } | null;

const EmulatorOutputPane: React.FC = () => {
  const output = useEmulatorStore((state) => state.output);
  const clearOutput = useEmulatorStore((state) => state.clearOutput);

  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // A compiler error is at the end of the output, so land there.
  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [output]);

  useEffect(() => {
    setCopyFeedback(null);
  }, [output]);

  const handleCopy = useCallback(async () => {
    if (!output) {
      setCopyFeedback({ kind: 'error', message: 'No output to copy.' });
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(output);
      setCopyFeedback({ kind: 'success', message: 'Copied the build output.' });
    } catch {
      setCopyFeedback({
        kind: 'error',
        message: 'Could not copy the output. Check clipboard permissions and try again.',
      });
    }
  }, [output]);

  return (
    <div className="dock-pane">
      <div className="dock-pane-toolbar">
        <span className="dock-pane-meta">
          Emscripten output from the Emulator&apos;s last build
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
            disabled={!output}
            aria-label="Copy the build output"
            title={output ? 'Copy the build output' : 'No output to copy'}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={clearOutput}
            disabled={!output}
            aria-label="Clear the build output"
            title={output ? 'Clear the build output' : 'No output to clear'}
          >
            Clear
          </button>
        </div>
      </div>

      <pre className="dock-pane-log" ref={logRef}>
        {output || 'Press Start on the Emulator and the compiler’s output appears here.'}
      </pre>
    </div>
  );
};

export default EmulatorOutputPane;
