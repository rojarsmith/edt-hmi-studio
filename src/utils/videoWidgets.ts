import type { LvglComponent, Screen } from '../types';

/**
 * Whether a project puts a video anywhere on any screen.
 *
 * Video is the one widget whose feasibility is a property of the board rather
 * than of the firmware — it needs a JPEG codec and an SD interface, and a board
 * without them has no slower path to fall back on. So two very different places
 * have to ask the same question: code generation, to decide whether to include
 * the runtime's header, and the Deploy tab, to stop a build that would fail in
 * the compiler with a message about a missing file. One answer, one place.
 *
 * Walks children, because a video inside a container is still a video.
 * See docs/video-playback.md §2.
 */
export function componentsHaveVideo(components: LvglComponent[]): boolean {
  return components.some(
    (component) =>
      component.type === 'video' || componentsHaveVideo(component.children),
  );
}

export function screensHaveVideo(screens: Screen[]): boolean {
  return screens.some((screen) => componentsHaveVideo(screen.components));
}
