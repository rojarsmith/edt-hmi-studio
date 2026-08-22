// What a component needs from the panel, in the words of the person placing it.
//
// The Information pane reads these. Everything here is phrased for someone
// designing a screen for a machine — what the panel will show, what it needs
// to be given, what it cannot do — and never for someone writing its firmware.
// A display controller's second layer is a fact about how a video is shown;
// "the video must have its space to itself" is the rule the designer has to
// follow because of it, and only the rule belongs here.
//
// Checks are derived from the project, so the pane can say "Button_2 overlaps
// this video" rather than leaving the designer to work it out from the rule.

import type { LvglComponent, Screen } from '../../types';
import { SUPPORTED_BOARDS } from '../../types/hmi';

/** One thing the pane says. `kind` decides how loudly. */
export interface ComponentNote {
  kind: 'rule' | 'warning';
  title: string;
  body: string;
}

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Where a component sits on the screen, in screen coordinates.
 *
 * A child's position is stated inside its parent, so the box is the sum of
 * the chain above it. Percent and content-sized widths are left at the stored
 * number: this is an advisory check, and a box that is roughly right finds an
 * overlap that is plainly there, which is what it is for.
 */
function absoluteBox(component: LvglComponent, parents: LvglComponent[]): Box {
  let x = component.x;
  let y = component.y;
  for (const parent of parents) {
    x += parent.x;
    y += parent.y;
  }
  return { x1: x, y1: y, x2: x + component.width - 1, y2: y + component.height - 1 };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2;
}

/** Every component on the screen with its box, the tree flattened. */
function placed(
  components: LvglComponent[],
  parents: LvglComponent[] = [],
): { component: LvglComponent; box: Box }[] {
  const out: { component: LvglComponent; box: Box }[] = [];
  for (const component of components) {
    out.push({ component, box: absoluteBox(component, parents) });
    out.push(...placed(component.children, [...parents, component]));
  }
  return out;
}

const VIDEO_BOARD = SUPPORTED_BOARDS.find((board) => board.video !== null);

/**
 * The rules a video lives by. Fixed: they are true of every video on every
 * screen, and the designer needs to read them once.
 */
export const VIDEO_RULES: ComponentNote[] = [
  {
    kind: 'rule',
    title: 'The video needs its space to itself',
    body:
      'Nothing may overlap a video — no button, label, logo or picture on top of it, and the video must not sit on top of anything else. Whatever overlaps is hidden behind the picture while it plays. Put captions and controls beside the video, not on it.',
  },
  {
    kind: 'rule',
    title: 'Make the component the size of the video',
    body:
      'The picture is shown at the size it was recorded, never stretched or shrunk. A component larger than the video shows black around the picture; a smaller one shows only its middle. For a full-screen clip, size the component to the whole screen.',
  },
  {
    kind: 'rule',
    title: 'One video per screen',
    body:
      'Each screen can play one video. A second one on the same screen stays dark and says “Another video is playing”. Different screens can each have their own.',
  },
  {
    kind: 'rule',
    title: 'The file lives in the top level of the SD card',
    body:
      'Copy the file straight onto the card — not inside a folder — and type its name here exactly as it appears there, ending in .avi. The file is not stored in the project: changing the video means changing the file on the card, with nothing to rebuild.',
  },
  {
    kind: 'rule',
    title: 'The file must be a Motion JPEG video in an AVI file',
    body:
      'That is the one format the panel plays, at the component’s size — 800 × 480 for full screen — and at up to 24 frames per second. A file in any other format shows “Video format not supported”. The documentation describes how to prepare one.',
  },
  {
    kind: 'rule',
    title: 'The picture plays without sound',
    body:
      'The panel has no audio output for video. A soundtrack in the file is ignored; leaving it out makes the file smaller.',
  },
  {
    kind: 'rule',
    title: 'What the panel says when it cannot play',
    body:
      '“Video not found” — no file of that name on the card. “No SD card” — the slot is empty. “SD card unreadable” — the card is in but cannot be read. “Video format not supported” — the file is not one the panel plays. Each appears in the video’s own space, in its text colour, with a line underneath saying what to check.',
  },
  {
    kind: 'rule',
    title: VIDEO_BOARD
      ? `Plays on the ${VIDEO_BOARD.model} only`
      : 'Needs a panel with video hardware',
    body:
      'Playing video takes dedicated video hardware, which the other panels do not have. A project with a Video component can be designed and previewed for any panel, but can only be built for one that plays it.',
  },
];

/**
 * What is wrong with *this* video, on *this* screen. Derived, so the designer
 * is told about the button they put over the video rather than left to find
 * it on the panel.
 */
export function videoWarnings(
  video: LvglComponent,
  screen: Screen,
  display: { width: number; height: number },
): ComponentNote[] {
  const notes: ComponentNote[] = [];
  const everything = placed(screen.components);
  const self = everything.find((entry) => entry.component.id === video.id);
  if (!self) return notes;

  const overlapping = everything.filter(
    (entry) =>
      entry.component.id !== video.id &&
      entry.component.visible !== false &&
      overlaps(entry.box, self.box),
  );
  // A container the video sits inside is not "over" it; its box contains the
  // video's by definition. Only things that are not its ancestors count.
  const ancestors = new Set<string>();
  let parentId = video.parentId;
  while (parentId) {
    ancestors.add(parentId);
    parentId = everything.find((entry) => entry.component.id === parentId)?.component.parentId ?? null;
  }
  const intruders = overlapping.filter((entry) => !ancestors.has(entry.component.id));

  const otherVideos = intruders.filter((entry) => entry.component.type === 'video');
  const others = intruders.filter((entry) => entry.component.type !== 'video');

  if (others.length > 0) {
    const names = others.map((entry) => entry.component.name);
    notes.push({
      kind: 'warning',
      title: others.length === 1
        ? `${names[0]} overlaps this video`
        : `${others.length} components overlap this video`,
      body:
        `${names.join(', ')} ${others.length === 1 ? 'shares' : 'share'} space with the video and will be hidden behind the picture while it plays. Move ${others.length === 1 ? 'it' : 'them'} beside the video.`,
    });
  }

  const secondVideo = screen.components.length > 0
    && everything.filter((entry) => entry.component.type === 'video').length > 1;
  if (secondVideo) {
    notes.push({
      kind: 'warning',
      title: 'More than one video on this screen',
      body:
        `Only the first one plays; the ${otherVideos.length > 0 ? 'overlapping one' : 'others'} will say “Another video is playing”. Put each video on its own screen.`,
    });
  }

  if (self.box.x1 < 0 || self.box.y1 < 0 || self.box.x2 > display.width - 1 || self.box.y2 > display.height - 1) {
    notes.push({
      kind: 'warning',
      title: 'The video runs off the screen',
      body:
        `The component extends past the ${display.width} × ${display.height} screen, so part of the picture will not be shown. Move it fully onto the screen.`,
    });
  }

  const fileName = typeof video.props.fileName === 'string' ? video.props.fileName.trim() : '';
  if (fileName === '') {
    notes.push({
      kind: 'warning',
      title: 'No file named yet',
      body: 'Until a file is named, the panel shows “Video not found” in this space.',
    });
  }

  return notes;
}
