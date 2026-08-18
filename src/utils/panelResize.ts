// Top-edge drags for the stacked panels down the editor's side columns.
//
// A grip trades height between the two sides of the edge it sits on, the way a
// VS Code sidebar sash does. Dragging up grows the panel and takes the height
// off the sections above, nearest first; dragging down hands height back to the
// section directly above, and once the panel is at its own minimum it keeps
// travelling by pushing the sections below it smaller in turn. Either way the
// grip only stops when everything on that side is at its minimum, so it never
// sticks halfway with room still left in the column.
//
// The panels do not know about each other, so each one registers what a drag
// elsewhere in the column needs in order to move it.

/**
 * Room the column's flexible section keeps however far a panel is dragged: its
 * own bar plus one bar's worth of content, so it never shrinks to a bare title.
 * Kept in step with the `min-height` on `.left-panel > *:first-child`.
 */
export const MIN_FLEXIBLE_HEIGHT = 76;

/** What a drag elsewhere in the column needs to know to move a panel. */
export interface DockedPanelHandle {
  /** Whether the panel is holding a height right now - collapsed ones are not. */
  canDonate: () => boolean;
  /** The height it is set to. */
  height: () => number;
  /** The smallest height it may be squeezed to. */
  minHeight: () => number;
  /** Applies a height. */
  resize: (height: number) => void;
}

const handles = new WeakMap<Element, DockedPanelHandle>();

/** Registers a panel as movable; call the returned function to unregister. */
export function registerDockedPanel(panel: Element, handle: DockedPanelHandle): () => void {
  handles.set(panel, handle);
  return () => {
    handles.delete(panel);
  };
}

/** A drag in progress, from the pointer going down to it coming back up. */
export interface DockedPanelDrag {
  /** How far up the edge can travel before the sections above are spent. */
  roomAbove: number;
  /** How far down it can travel before this panel and those below are spent. */
  roomBelow: number;
  /**
   * Takes how far the edge has been dragged - positive is upwards - and returns
   * the height the panel should take, having moved its neighbours to match.
   * Every call re-derives them from where they were when the drag started, so
   * backtracking inside one drag puts them all back.
   */
  moveEdge: (offset: number) => number;
}

/** A section that grows into leftover space rather than holding a height. */
function isFlexible(el: Element): boolean {
  return parseFloat(getComputedStyle(el).flexGrow) > 0;
}

/** A neighbour a drag can move, and how much height it has to spare. */
interface Neighbour {
  from: number;
  spare: number;
  resize: (height: number) => void;
}

/** The movable neighbours among `sections`, which are already nearest-first. */
function neighbours(sections: Element[]): Neighbour[] {
  const found: Neighbour[] = [];
  for (const section of sections) {
    if (isFlexible(section)) {
      // The flexible section takes up whatever the others leave, so it needs no
      // resizing of its own - only its spare room counts towards the travel.
      const height = section.getBoundingClientRect().height;
      found.push({ from: height, spare: Math.max(0, height - MIN_FLEXIBLE_HEIGHT), resize: () => {} });
      continue;
    }
    const handle = handles.get(section);
    if (!handle?.canDonate()) continue;
    const from = handle.height();
    found.push({ from, spare: Math.max(0, from - handle.minHeight()), resize: handle.resize });
  }
  return found;
}

function totalSpare(found: Neighbour[]): number {
  return found.reduce((total, one) => total + one.spare, 0);
}

/**
 * Sets up a drag of the top edge of `panel`, which holds `startHeight` and may
 * not go below `minHeight`.
 */
export function startDockedPanelDrag(
  panel: Element,
  minHeight: number,
  startHeight: number,
): DockedPanelDrag {
  const column = panel.closest('.left-panel, .right-panel');
  if (!column) {
    return {
      roomAbove: Number.POSITIVE_INFINITY,
      roomBelow: Math.max(0, startHeight - minHeight),
      moveEdge: offset => Math.max(minHeight, startHeight + offset),
    };
  }

  const sections = Array.from(column.children);
  const index = sections.indexOf(panel);
  const above = neighbours(sections.slice(0, index).reverse());
  const below = neighbours(sections.slice(index + 1));

  const roomAbove = totalSpare(above);
  const roomBelow = Math.max(0, startHeight - minHeight) + totalSpare(below);

  return {
    roomAbove,
    roomBelow,
    moveEdge(offset: number): number {
      const moved = Math.min(roomAbove, Math.max(-roomBelow, offset));
      const height = Math.max(minHeight, startHeight + moved);

      // Dragging up: the sections above give ground, nearest first. Dragging
      // down: the nearest one takes back everything the panel and the sections
      // below let go of.
      let taken = Math.max(0, moved);
      const handedBack = Math.max(0, -moved);
      above.forEach((neighbour, position) => {
        const gives = Math.min(taken, neighbour.spare);
        taken -= gives;
        neighbour.resize(neighbour.from - gives + (position === 0 ? handedBack : 0));
      });

      // Past its own minimum the panel stops shrinking and starts pushing the
      // sections below down instead, which is what keeps the edge moving.
      let pushed = Math.max(0, handedBack - Math.max(0, startHeight - minHeight));
      for (const neighbour of below) {
        const gives = Math.min(pushed, neighbour.spare);
        pushed -= gives;
        neighbour.resize(neighbour.from - gives);
      }

      return height;
    },
  };
}
