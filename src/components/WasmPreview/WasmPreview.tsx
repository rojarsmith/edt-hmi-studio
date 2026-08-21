import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { editorStateToJson } from './editorStateToJson';
import './WasmPreview.css';

type Status = 'loading' | 'ready' | 'error';

const WasmPreview: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const screens = useEditorStore((s) => s.screens);
  const currentScreenId = useEditorStore((s) => s.currentScreenId);
  const canvas = useEditorStore((s) => s.canvas);

  /*
   * Whether the runtime actually resized itself to the project's canvas.
   *
   * The `.wasm` is a checked-in binary, and the build that honours
   * `set-screen-size` is newer than some of the ones in circulation — an older
   * one accepts the call and ignores it, which used to be invisible because its
   * hard-coded size was landscape and close to the real panels. Rather than
   * trust the binary, this measures the canvas it produced. It clears itself
   * once a rebuilt runtime is dropped in. See docs/display-orientation.md §4.4.
   */
  const [sizeHonoured, setSizeHonoured] = useState(true);

  // Send the design resolution, then the UI JSON, to the iframe.
  const sendToWasm = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || status !== 'ready') return;
    iframe.contentWindow.postMessage(
      { type: 'set-screen-size', width: canvas.width, height: canvas.height },
      '*',
    );
    const json = editorStateToJson(screens, currentScreenId, canvas);
    iframe.contentWindow.postMessage({ type: 'load-ui', json }, '*');

    // Measured after the runtime has had the frame it needs to reallocate.
    // Same origin, so the canvas element is readable.
    requestAnimationFrame(() => {
      const el = iframe.contentDocument?.getElementById('canvas') as
        | HTMLCanvasElement
        | null
        | undefined;
      setSizeHonoured(
        !el || (el.width === canvas.width && el.height === canvas.height),
      );
    });
  }, [screens, currentScreenId, canvas, status]);

  // Listen for lvgl-ready from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'lvgl-ready') {
        setStatus('ready');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Debounced sync on state change
  useEffect(() => {
    if (status !== 'ready') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      sendToWasm();
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screens, currentScreenId, canvas, status, sendToWasm]);

  // Timeout for loading — mark error after 15s
  useEffect(() => {
    if (status !== 'loading') return;
    const t = setTimeout(() => {
      setStatus((prev) => (prev === 'loading' ? 'error' : prev));
    }, 15000);
    return () => clearTimeout(t);
  }, [status]);

  const handleRefresh = () => {
    setStatus('loading');
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = '/wasm/lvgl_wasm.html';
    }
  };

  const statusLabel =
    status === 'ready'
      ? '✅ Ready'
      : status === 'loading'
        ? '⏳ Loading LVGL runtime...'
        : '❌ Load failed';

  return (
    <div className="wasm-preview">
      <div className="wasm-preview-toolbar">
        <span className={`wasm-preview-status wasm-preview-status--${status}`}>
          {statusLabel}
        </span>
        <button className="wasm-preview-refresh" onClick={handleRefresh}>
          🔄 Refresh
        </button>
      </div>

      <div className="wasm-preview-body">
        <div
          className="wasm-preview-iframe-wrapper"
          style={{ width: canvas.width, height: canvas.height }}
        >
          {status === 'loading' && (
            <div className="wasm-preview-overlay">Loading LVGL runtime...</div>
          )}
          {status === 'error' && (
            <div className="wasm-preview-overlay wasm-preview-overlay--error">
              Failed to load WASM. Click Refresh to try again.
            </div>
          )}
          <iframe
            ref={iframeRef}
            className="wasm-preview-iframe"
            src="/wasm/lvgl_wasm.html"
            title="LVGL WASM Preview"
            width={canvas.width}
            height={canvas.height}
          />
        </div>
      </div>

      <div className="wasm-preview-footer">
        {sizeHonoured ? (
          <>
            Rendered with the LVGL WASM runtime at {canvas.width}×{canvas.height}
          </>
        ) : (
          <span className="wasm-preview-warning">
            ⚠️ This runtime does not honour the project&apos;s{' '}
            {canvas.width}×{canvas.height} canvas — positions near an edge will
            not match the panel. Rebuild <code>wasm/</code> to fix.
          </span>
        )}
      </div>
    </div>
  );
};

export default WasmPreview;
