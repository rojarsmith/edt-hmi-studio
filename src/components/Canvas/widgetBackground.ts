/**
 * Background a widget falls back to on the design canvas when it has no
 * explicit one, so components are never accidentally invisible while editing.
 *
 * Image widgets deliberately stay transparent: an opaque fallback would sit
 * behind the source's alpha channel and make a transparent PNG look opaque,
 * which is not what LVGL draws. They remain visible while no image resolves —
 * CanvasImageContent fills its placeholder instead.
 *
 * Returns undefined for types with no opinion, leaving the caller's own
 * fallback in charge.
 */
export function resolveFallbackBackground(type: string): string | undefined {
  switch (type) {
    case 'btn': return '#2196F3';
    case 'obj': return '#fafafa';
    case 'textarea': return '#ffffff';
    case 'dropdown': return '#ffffff';
    case 'table': return '#ffffff';
    case 'chart': return '#ffffff';
    case 'calendar': return '#ffffff';
    case 'tabview': return '#ffffff';
    case 'tileview': return '#ffffff';
    case 'win': return '#ffffff';
    case 'img': return 'transparent';
    case 'image-button': return 'transparent';
    case 'label': return 'transparent';
    // A rectangle ships with a fill; clearing it to transparent is how an
    // outline-only shape is drawn, so it must not be filled back in.
    case 'rectangle': return 'transparent';
    case 'arc': return 'transparent';
    case 'spinner': return 'transparent';
    case 'checkbox': return 'transparent';
    default: return undefined;
  }
}
