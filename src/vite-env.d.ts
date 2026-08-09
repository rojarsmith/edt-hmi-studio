/// <reference types="vite/client" />

/** Injected by Vite from package.json — see `define` in vite.config.ts. */
declare const __APP_VERSION__: string;

declare module 'virtual:compile-preview' {
  import type { FC } from 'react';

  const CompilePreview: FC;
  export default CompilePreview;
}

interface OmniHostWindowApi {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

interface OmniHostBridge {
  window: OmniHostWindowApi;
  invoke?: (handler: string, payload?: unknown) => Promise<unknown>;
  on?: (event: string, handler: (payload: unknown) => void) => void;
}

interface Window {
  omni?: OmniHostBridge;
}
