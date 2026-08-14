// What text a widget shows on the canvas.
//
// A widget linked to a text resource displays that resource in the preview
// language; one without a link displays its own literal, as it always has.
// The fallback chain matches resolveText — and therefore what LVGL does at
// runtime — so the canvas is a truthful preview rather than a separate rule.

import type { LvglComponent, ProjectLanguage, TextResource, TranslatableProp } from '../types';
import { resolveText } from '../codegen/textResources';

/**
 * The typography a widget actually renders with.
 *
 * A text resource may name one, and when it does it wins: the words and the
 * style that suits them are chosen together, which is what makes a language
 * whose script needs its own face render correctly everywhere it appears
 * rather than everywhere someone remembered. The widget's own assignment is
 * what applies when the resource names none, or the widget carries a literal.
 *
 * The canvas, the property editor and `ui.c` all resolve through here, so what
 * is previewed is what is generated.
 */
export function effectiveTypographyId(
  comp: LvglComponent,
  texts: TextResource[],
): string | undefined {
  const resource = comp.textId ? texts.find((text) => text.id === comp.textId) : undefined;
  return resource?.typographyId ?? comp.typographyId;
}

/**
 * Which prop a widget's text resource stands in for.
 *
 * The recorded `textProp` wins. The inference below only serves data written
 * before it existed, and repeats what the derivation would have seen then —
 * it must not be used for new decisions, because it flips to `text` the moment
 * a shared-placeholder textarea gains typed content.
 */
export function standInProp(comp: LvglComponent): TranslatableProp {
  if (comp.textProp) return comp.textProp;
  return (
    (['text', 'placeholder', 'title', 'options'] as const).find(
      (candidate) =>
        (typeof comp.props?.[candidate] === 'string' &&
          (comp.props[candidate] as string).trim().length > 0) ||
        (candidate === 'options' && Array.isArray(comp.props?.options) && comp.props.options.length > 0),
    ) ?? 'text'
  );
}

/** A prop's literal as one string — options join the way LVGL takes them. */
export function literalStringOf(comp: LvglComponent, prop: TranslatableProp): string {
  const value = comp.props?.[prop];
  if (typeof value === 'string') return value;
  if (prop === 'options' && Array.isArray(value)) return value.join('\n');
  return '';
}

/**
 * The string to render for `prop` (`text`, `placeholder` or `title`).
 *
 * The resource only stands in for the prop the literal came from: a textarea
 * whose placeholder is shared must not have its typed content replaced too.
 */
export function displayTextFor(
  comp: LvglComponent,
  prop: TranslatableProp,
  texts: TextResource[],
  languages: ProjectLanguage[],
  previewLanguage: string | null,
): string {
  const literal = literalStringOf(comp, prop);

  if (!comp.textId) return literal;

  if (standInProp(comp) !== prop) return literal;

  const resource = texts.find((text) => text.id === comp.textId);
  if (!resource) return literal;

  const codes = languages.map((language) => language.code);
  return resolveText(resource, previewLanguage ?? codes[0] ?? '', codes);
}
