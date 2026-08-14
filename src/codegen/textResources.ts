// Deriving text resources from the literals a project already contains.
//
// A widget currently stores the words it shows. Translation needs the opposite:
// the widget stores an id, and the words live in one table with a column per
// language. This turns the former into the latter without changing what any
// widget displays.
//
// See docs/text-typography-evaluation.md §3.

import type { LvglComponent, Screen, TextResource, TranslatableProp } from '../types';

/**
 * Props a resource can stand in for, in the order the derivation checks them.
 *
 * `options` holds the whole list as one newline-joined value — exactly the
 * string `lv_dropdown_set_options` takes — so a dropdown's option count and
 * order are shared across languages and only the words differ. Table cells and
 * tab names remain out: they have no single-string shape on the LVGL side, so
 * each would need per-item resources rather than this model.
 */
const TRANSLATABLE_PROPS = ['text', 'placeholder', 'title', 'options'] as const;

export interface TextDerivation {
  /** Deduplicated, in the order first encountered so keys stay stable. */
  texts: TextResource[];
  /** Component id → text resource id. Only components with a literal appear. */
  assignments: Map<string, string>;
  /** Component id → the prop the resource stands in for. */
  sourceProps: Map<string, TranslatableProp>;
}

/** `Save changes` → `saveChanges`, so generated tags read like identifiers. */
export function keyFromText(text: string): string {
  const words = text
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  if (words.length === 0) return 'text';

  const [first, ...rest] = words;
  const camel = first.toLowerCase() + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');

  // Keys become string literals in the generated tag table, not identifiers, so
  // any script is valid and 溫度設定 is a better key than text溫度設定. A leading
  // digit is the one awkward case: it reads as a number rather than a name.
  return /^\p{N}/u.test(camel) ? `text${camel}` : camel;
}

/** The translatable string a component shows, and which prop holds it. */
export function literalOf(
  comp: LvglComponent,
): { prop: (typeof TRANSLATABLE_PROPS)[number]; value: string } | undefined {
  const props = comp.props ?? {};
  for (const prop of TRANSLATABLE_PROPS) {
    const value = props[prop];
    if (typeof value === 'string' && value.trim().length > 0) return { prop, value };
    // Options arrive as an array from the editor; the resource holds them the
    // way LVGL takes them — one newline-joined string
    if (prop === 'options' && Array.isArray(value) && value.length > 0) {
      return { prop, value: value.join('\n') };
    }
  }
  return undefined;
}

/**
 * Collect the distinct strings a project displays, keyed and deduplicated.
 *
 * `defaultLanguage` is the code the existing literals are recorded under —
 * they were written in some language, and this says which.
 *
 * Identical strings collapse onto one resource, which is the point: translating
 * "OK" once should translate every OK. It also means editing one afterwards
 * edits them all, so the deduplication is visible in the editor rather than
 * silent.
 */
export function deriveTextResources(
  screens: Screen[],
  defaultLanguage: string,
): TextDerivation {
  const texts: TextResource[] = [];
  const assignments = new Map<string, string>();
  const sourceProps = new Map<string, TranslatableProp>();
  const byLiteral = new Map<string, TextResource>();
  const usedKeys = new Set<string>();

  const walk = (components: LvglComponent[]) => {
    for (const comp of components) {
      const found = literalOf(comp);
      if (found !== undefined) {
        const literal = found.value;
        let resource = byLiteral.get(literal);
        if (!resource) {
          let key = keyFromText(literal);
          for (let suffix = 2; usedKeys.has(key); suffix++) {
            key = `${keyFromText(literal)}${suffix}`;
          }
          usedKeys.add(key);

          resource = {
            id: `text_${texts.length + 1}`,
            key,
            values: { [defaultLanguage]: literal },
          };
          byLiteral.set(literal, resource);
          texts.push(resource);
        }
        assignments.set(comp.id, resource.id);
        sourceProps.set(comp.id, found.prop);
      }

      walk(comp.children ?? []);
    }
  };

  for (const screen of screens) walk(screen.components);

  return { texts, assignments, sourceProps };
}

/**
 * Give a project's screens their text ids, in place of deriving them again.
 *
 * Returns new screens rather than mutating, since this runs inside the load
 * path while the caller still holds the parsed data.
 */
export function applyTextResources(
  screens: Screen[],
  defaultLanguage: string,
): { screens: Screen[]; texts: TextResource[] } {
  const { texts, assignments, sourceProps } = deriveTextResources(screens, defaultLanguage);

  const assign = (components: LvglComponent[]): LvglComponent[] =>
    components.map((comp) => {
      const textId = assignments.get(comp.id);
      const textProp = sourceProps.get(comp.id);
      return {
        ...comp,
        ...(textId ? { textId, textProp } : {}),
        children: assign(comp.children ?? []),
      };
    });

  return {
    screens: screens.map((screen) => ({ ...screen, components: assign(screen.components) })),
    texts,
  };
}

/**
 * The string a text resource shows in a given language.
 *
 * Falls back to the first language that has one, matching what
 * `lv_translation_get` does at runtime: an untranslated tag shows the language
 * it was written in rather than disappearing.
 */
export function resolveText(
  resource: TextResource,
  language: string,
  languages: string[],
): string {
  const direct = resource.values[language];
  if (direct !== undefined) return direct;
  for (const code of languages) {
    const value = resource.values[code];
    if (value !== undefined) return value;
  }
  return resource.key;
}
