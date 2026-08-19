import type { Animation, LvglComponent, Screen } from '../types';

/**
 * Every animation in the project, in screen → component → child order.
 *
 * Animations still live on the component they drive, but they are named as if
 * they were project-level assets: the generated C function is named after the
 * animation alone, so the name has to be unique across the whole project
 * rather than within one component.
 */
export function projectAnimations(screens: Screen[]): Animation[] {
  const found: Animation[] = [];
  const visit = (components: LvglComponent[]) => {
    for (const component of components) {
      found.push(...(component.animations || []));
      visit(component.children);
    }
  };
  for (const screen of screens) visit(screen.components);
  return found;
}

/** The `Fade_In` half of a default `Fade_In_1` name, derived from the type. */
export function animationNameBase(type: string): string {
  return type
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');
}

/**
 * First unused `${base}_${N}` animation name across the whole project. Same
 * rule as component ids: numbers freed by deletions are reused before the
 * count grows, and N starts at 1.
 */
export function nextAnimationName(screens: Screen[], base: string): string {
  const prefix = `${base}_`;
  const used = new Set<number>();
  for (const animation of projectAnimations(screens)) {
    if (!animation.name.startsWith(prefix)) continue;
    const suffix = animation.name.slice(prefix.length);
    if (/^\d+$/.test(suffix)) used.add(Number(suffix));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Whether some other animation already answers to `name`. `exceptId` is the
 * animation being edited, which is allowed to keep its own name.
 */
export function isAnimationNameTaken(
  screens: Screen[],
  name: string,
  exceptId?: string,
): boolean {
  return projectAnimations(screens).some(
    (animation) => animation.id !== exceptId && animation.name === name,
  );
}
