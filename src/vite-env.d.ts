/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected by Vite from package.json — see `define` in vite.config.ts. */
  readonly VITE_APP_VERSION?: string;
  /** `false` removes the Emulator sub-tab and its dev-server endpoints. */
  readonly VITE_ENABLE_EMULATOR?: string;
  /** The name the switch above shipped under; still honoured. */
  readonly VITE_ENABLE_COMPILE_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:emulator' {
  import type { FC } from 'react';

  const Emulator: FC;
  export default Emulator;
}

interface NativeWebHostWindowApi {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

interface NativeWebHostBridge {
  window: NativeWebHostWindowApi;
  invoke?: (handler: string, payload?: unknown) => Promise<unknown>;
  on?: (event: string, handler: (payload: unknown) => void) => void;
}

interface Window {
  /** Injected by the NativeWebHost v2 desktop shell. */
  nativeWeb?: NativeWebHostBridge;
  /** Legacy alias kept by the shell for OmniHost-era callers. */
  omni?: NativeWebHostBridge;
}
