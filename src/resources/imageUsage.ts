// Counts how many widgets reference each image.
//
// resourceStore.getResourceUsage() has always returned an empty array with a
// note that it would be connected later; the image table needs a real answer,
// and the editor store is where the screens live.

import type { Screen, LvglComponent } from '../types';

/** Every image id a single component references. */
function imageIdsOf(component: LvglComponent): string[] {
  const props = component.props as Record<string, unknown> | undefined;
  if (!props) return [];

  const ids: string[] = [];
  if (typeof props.imageId === 'string' && props.imageId !== '') {
    ids.push(props.imageId);
  }
  // An image button carries one image per state.
  if (Array.isArray(props.states)) {
    for (const state of props.states) {
      const imageId = (state as { imageId?: unknown } | null)?.imageId;
      if (typeof imageId === 'string' && imageId !== '') ids.push(imageId);
    }
  }
  return ids;
}

/**
 * Map of image id to the number of references across every screen. A widget
 * that names the same image twice — both states of an image button, say —
 * counts twice, because the question the column answers is "how many places
 * would break if I deleted this".
 */
export function countImageUsage(
  screens: readonly Screen[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (components: readonly LvglComponent[] | undefined) => {
    if (!components) return;
    for (const component of components) {
      for (const id of imageIdsOf(component)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      visit(component.children);
    }
  };
  for (const screen of screens) visit(screen.components);
  return counts;
}

/**
 * Widgets reference images by id, but generated code also accepts a name or a
 * C array name (see resolveImageReference in ui.c.ts), so a lookup has to try
 * all three.
 */
export function usageFor(
  counts: Map<string, number>,
  image: { id: string; name: string; cArrayName: string },
): number {
  return (counts.get(image.id) ?? 0)
    + (counts.get(image.name) ?? 0)
    + (counts.get(image.cArrayName) ?? 0);
}
