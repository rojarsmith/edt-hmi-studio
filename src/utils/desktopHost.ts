export function isDesktopHostAvailable() {
  // NativeWebHost v2 injects `nativeWeb`; `omni` remains as the legacy alias
  // from the OmniHost era and is kept as a fallback for older shells.
  return (
    typeof window !== 'undefined' &&
    (typeof window.nativeWeb !== 'undefined' || typeof window.omni !== 'undefined')
  );
}
