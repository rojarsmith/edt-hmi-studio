import type { Animation } from '../types';

/** The `Fade_In` half of a default `Fade_In_1` name, derived from the type. */
export function animationNameBase(type: string): string {
  return type
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');
}

/**
 * First unused `${base}_${N}` animation name in the project. Same rule as
 * component ids: numbers freed by deletions are reused before the count grows,
 * and N starts at 1.
 *
 * The name is unique project-wide because it names the generated C function,
 * which names the animation alone rather than its target — see
 * src/codegen/animationSymbols.ts.
 */
export function nextAnimationName(animations: Animation[], base: string): string {
  const prefix = `${base}_`;
  const used = new Set<number>();
  for (const animation of animations) {
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
  animations: Animation[],
  name: string,
  exceptId?: string,
): boolean {
  return animations.some(
    (animation) => animation.id !== exceptId && animation.name === name,
  );
}
