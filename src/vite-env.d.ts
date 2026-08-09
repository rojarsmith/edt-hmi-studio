/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected by Vite from package.json — see `define` in vite.config.ts. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
