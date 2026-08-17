/**
 * Fades out and removes the inline splash screen from index.html once the
 * React tree has actually mounted into #root. Watching the root node (rather
 * than assuming render() is synchronous) keeps this correct under React's
 * concurrent rendering.
 *
 * `?splash-hold` keeps the splash on screen — useful when designing it.
 */
export function hideSplashWhenAppMounts(): void {
  const splash = document.getElementById('splash');
  if (!splash) {
    return;
  }
  if (new URLSearchParams(window.location.search).has('splash-hold')) {
    return;
  }

  const root = document.getElementById('root');
  if (!root) {
    splash.remove();
    return;
  }

  const hide = () => {
    // A hidden page never fires requestAnimationFrame, and nobody is
    // watching the fade anyway — drop the splash outright.
    if (document.hidden) {
      splash.remove();
      return;
    }
    requestAnimationFrame(() => {
      splash.classList.add('splash--hide');
      splash.addEventListener('transitionend', () => splash.remove(), { once: true });
      // Fallback: reduced-motion disables the transition, so transitionend
      // never fires there.
      window.setTimeout(() => splash.remove(), 700);
    });
  };

  if (root.childElementCount > 0) {
    hide();
    return;
  }

  const observer = new MutationObserver(() => {
    if (root.childElementCount > 0) {
      observer.disconnect();
      hide();
    }
  });
  observer.observe(root, { childList: true });
}
