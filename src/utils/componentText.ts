// What text a widget shows on the canvas.
//
// A widget linked to a text resource displays that resource in the preview
// language; one without a link displays its own literal, as it always has.
// The fallback chain matches resolveText — and therefore what LVGL does at
// runtime — so the canvas is a truthful preview rather than a separate rule.

import type { LvglComponent, ProjectLanguage, TextResource } from '../types';
import { resolveText } from '../codegen/textResources';

/**
 * Which prop a widget's text resource stands in for.
 *
 * The recorded `textProp` wins. The inference below only serves data written
 * before it existed, and repeats what the derivation would have seen then —
 * it must not be used for new decisions, because it flips to `text` the moment
 * a shared-placeholder textarea gains typed content.
 */
export function standInProp(comp: LvglComponent): 'text' | 'placeholder' | 'title' {
  if (comp.textProp) return comp.textProp;
  return (
    (['text', 'placeholder', 'title'] as const).find(
      (candidate) =>
        typeof comp.props?.[candidate] === 'string' &&
        (comp.props[candidate] as string).trim().length > 0,
    ) ?? 'text'
  );
}

/**
 * The string to render for `prop` (`text`, `placeholder` or `title`).
 *
 * The resource only stands in for the prop the literal came from: a textarea
 * whose placeholder is shared must not have its typed content replaced too.
 */
export function displayTextFor(
  comp: LvglComponent,
  prop: 'text' | 'placeholder' | 'title',
  texts: TextResource[],
  languages: ProjectLanguage[],
  previewLanguage: string | null,
): string {
  const literal = typeof comp.props?.[prop] === 'string' ? (comp.props[prop] as string) : '';

  if (!comp.textId) return literal;

  if (standInProp(comp) !== prop) return literal;

  const resource = texts.find((text) => text.id === comp.textId);
  if (!resource) return literal;

  const codes = languages.map((language) => language.code);
  return resolveText(resource, previewLanguage ?? codes[0] ?? '', codes);
}
