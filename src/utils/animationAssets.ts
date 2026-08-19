import type { Animation, LvglComponent, Screen } from '../types';

/**
 * Animations are project-level assets: they name a target rather than being
 * owned by one. Projects written before that carried them inside the component
 * they drove, so opening one hoists them out — the same shape of migration
 * typographies and text resources already run on load.
 *
 * Returns the screens with the nested lists emptied, so nothing reads them by
 * accident afterwards.
 */
export function hoistComponentAnimations(
  screens: Screen[],
): { screens: Screen[]; animations: Animation[] } {
  const animations: Animation[] = [];

  const strip = (components: LvglComponent[]): LvglComponent[] =>
    components.map((component) => {
      for (const animation of component.animations || []) {
        // The nested position was the only record of the target, so a hoisted
        // animation takes it from where it was found.
        animations.push({ ...animation, targetComponentId: component.id });
      }
      return { ...component, animations: [], children: strip(component.children) };
    });

  return {
    screens: screens.map((screen) => ({ ...screen, components: strip(screen.components) })),
    animations,
  };
}

/** Whether any screen still carries animations inside its components. */
export function hasNestedAnimations(screens: Screen[]): boolean {
  const visit = (components: LvglComponent[]): boolean =>
    components.some(
      (component) => (component.animations || []).length > 0 || visit(component.children),
    );
  return screens.some((screen) => visit(screen.components));
}

/** Every component in the project, indexed by id. */
export function componentsById(screens: Screen[]): Map<string, LvglComponent> {
  const index = new Map<string, LvglComponent>();
  const visit = (components: LvglComponent[]) => {
    for (const component of components) {
      index.set(component.id, component);
      visit(component.children);
    }
  };
  for (const screen of screens) visit(screen.components);
  return index;
}

/** The screen a component sits on, indexed by component id. */
export function screenByComponentId(screens: Screen[]): Map<string, Screen> {
  const index = new Map<string, Screen>();
  const visit = (components: LvglComponent[], screen: Screen) => {
    for (const component of components) {
      index.set(component.id, screen);
      visit(component.children, screen);
    }
  };
  for (const screen of screens) visit(screen.components, screen);
  return index;
}

/**
 * Why an animation cannot run, or null when it can.
 *
 * A missing dependency is reported rather than repaired: deleting the widget an
 * animation drives should not silently delete the animation, and a target that
 * has to be re-picked is better shown than guessed at.
 */
export function animationLack(
  animation: Animation,
  components: Map<string, LvglComponent>,
): string | null {
  if (!animation.targetComponentId) return 'No target component';
  if (!components.has(animation.targetComponentId)) return 'Target component no longer exists';
  return null;
}
