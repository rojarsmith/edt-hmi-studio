// Glyph usage collection for font subsetting.
//
// Walks a project and works out which code points each custom font actually has
// to render, so `lv_font_conv` can be given `--symbols` instead of a range
// covering a whole script. See docs/charset-trimming-design.md.
//
// Nothing here decides the final glyph set on its own: the conversion adds an
// unconditional ASCII baseline and the author's declared extras on top (§4).

import type { LvglComponent, Screen, TextResource, Typography } from '../types';
import type { FontResource } from '../resources/types';
import type { LogicGraph, LogicNode } from '../components/LogicEditor/types';
import { effectiveTypographyId } from '../utils/componentText';
import { hasLanguageOverride, resolveTypographyStyle } from '../utils/typographyStyle';

/** ASCII baseline, always included by the conversion regardless of usage. */
export const ASCII_BASELINE_START = 0x20;
export const ASCII_BASELINE_END = 0x7e;

/**
 * Unicode Private Use Area. LVGL's built-in symbols (a FontAwesome subset) live
 * here and are rendered by the symbol font, never by a text font, so they are
 * dropped rather than requested from a TTF that does not have them.
 */
const PUA_START = 0xe000;
const PUA_END = 0xf8ff;

/** Size assumed when a widget selects a font without stating a size. */
const IMPLIED_FONT_SIZE = 16;

/** Where a piece of text came from, so the editor can point at it. */
export interface GlyphSource {
  kind: 'widget' | 'event' | 'logic';
  /** Component or logic node name. */
  owner: string;
  /** Which field the text came from, e.g. `text`, `options[2]`. */
  field: string;
  text: string;
}

/** The code points one (font, size) pair has to be able to render. */
export interface FontGlyphSet {
  cFontName: string;
  size: number;
  codePoints: Set<number>;
  sources: GlyphSource[];
}

export interface CollectGlyphsInput {
  screens: Screen[];
  fontResources: FontResource[];
  logicGraphs?: LogicGraph[];
  /** Shared text. A linked widget must cover every language's words, since the
   * device can switch at any moment. */
  texts?: TextResource[];
  /** Widgets assigned a typography render with its font, not their own. */
  typographies?: Typography[];
  /** Project default font — `montserrat_N` for a built-in, or a cFontName. */
  defaultFont?: string;
  defaultFontSize?: number;
}

export interface GlyphCollection {
  /** Keyed by `glyphSetKey(cFontName, size)`. */
  byFontSize: Map<string, FontGlyphSet>;
  /** Text on widgets that resolve to a built-in font, which is not converted. */
  unattributed: GlyphSource[];
  /**
   * Places the walk cannot see through — custom C in an event or a logic node.
   * Any glyph these need must be declared as an extra by the author (§4).
   */
  opaque: GlyphSource[];
}

/** Stable key for a (font, size) pair. */
export function glyphSetKey(cFontName: string, size: number): string {
  return `${cFontName}@${size}`;
}

function isBuiltinFont(name: string): boolean {
  return /^montserrat_\d+$/.test(name);
}

/**
 * Render a code point set as the string handed to `lv_font_conv --symbols`.
 *
 * Sorted and deduplicated so the value is stable across runs — the conversion
 * cache keys on it (§6). ASCII is dropped by default because the conversion
 * always passes the baseline as a range, and repeating it here would only make
 * the command longer.
 */
export function toSymbolsString(
  codePoints: Iterable<number>,
  options: { includeAscii?: boolean } = {},
): string {
  const { includeAscii = false } = options;
  const sorted = [...new Set(codePoints)]
    .filter((cp) => includeAscii || cp < ASCII_BASELINE_START || cp > ASCII_BASELINE_END)
    .sort((a, b) => a - b);
  return String.fromCodePoint(...sorted);
}

/**
 * Code points of a string, minus the ones no text font should be asked for:
 * control characters, and the Private Use Area used by LVGL's symbols.
 */
function codePointsOf(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp < 0x20) continue; // newline, tab and friends are never drawn
    if (cp >= PUA_START && cp <= PUA_END) continue;
    out.push(cp);
  }
  return out;
}

/** Every user-visible string a component contributes, with its field name. */
function textsOfComponent(comp: LvglComponent): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  const props = comp.props ?? {};

  const push = (field: string, value: unknown) => {
    if (typeof value === 'string' && value.length > 0) out.push({ field, text: value });
  };

  // label, btn, checkbox, textarea, win
  push('text', props.text);
  push('placeholder', props.placeholder);
  push('title', props.title);

  // dropdown and roller: either an array or a newline-joined string
  if (Array.isArray(props.options)) {
    props.options.forEach((o: unknown, i: number) => push(`options[${i}]`, o));
  } else {
    push('options', props.options);
  }

  // tabview
  if (Array.isArray(props.tabs)) {
    props.tabs.forEach((t: unknown, i: number) => push(`tabs[${i}]`, t));
  }

  // An ellipsis label appends U+2026 at runtime; without this the truncation
  // renders a missing-glyph box at the exact spot meant to look tidy
  if (comp.type === 'label' && props.longMode === 'ellipsis') {
    out.push({ field: 'ellipsis', text: '…' });
  }

  // table
  if (Array.isArray(props.cellData)) {
    props.cellData.forEach((row: unknown, r: number) => {
      if (!Array.isArray(row)) return;
      row.forEach((cell: unknown, c: number) => {
        if (cell !== undefined && cell !== null && cell !== '') {
          push(`cellData[${r}][${c}]`, String(cell));
        }
      });
    });
  }

  return out;
}

/**
 * Every (font, size) pair a component might be rendered with.
 *
 * Deliberately over-inclusive. A component can pick a font through
 * `props.fontResource` and again through `styles.*.textFont`, and which one
 * wins depends on emission order in `ui.c`. Attributing the text to all of them
 * costs a few glyphs; guessing wrong costs a blank on the panel.
 */
function resolveFonts(
  comp: LvglComponent,
  customFontNames: Set<string>,
  defaultFont?: string,
  defaultFontSize?: number,
  typographyById?: Map<string, Typography>,
  texts: TextResource[] = [],
): { cFontName: string; size: number }[] {
  const out: { cFontName: string; size: number }[] = [];
  const add = (name: string | undefined, size: number | undefined) => {
    if (!name || isBuiltinFont(name) || !customFontNames.has(name)) return;
    out.push({ cFontName: name, size: size || IMPLIED_FONT_SIZE });
  };

  // The effective typography's shared style is what actually renders the text,
  // and it may name a font no widget prop mentions. Effective, not the widget's
  // own: a text resource naming a typography wins, and reading only the widget
  // would subset the wrong font. Over-inclusive as ever — the props paths stay
  // attributed too.
  const typographyId = effectiveTypographyId(comp, texts);
  const typography = typographyId ? typographyById?.get(typographyId) : undefined;
  if (typography) add(typography.fontResource, typography.fontSize);

  const props = comp.props ?? {};
  if (props.fontResource) {
    add(props.fontResource as string, props.fontSize as number | undefined);
  } else if (props.fontSize !== undefined) {
    // Inherits the default font, at its own size
    add(defaultFont, props.fontSize as number);
  }

  add(comp.styles?.default?.textFont, comp.styles?.default?.textFontSize);
  for (const state of ['pressed', 'focused', 'disabled'] as const) {
    add(comp.styles?.[state]?.textFont, comp.styles?.[state]?.textFontSize);
  }

  // Nothing chosen anywhere: the screen's default font renders it
  if (out.length === 0) add(defaultFont, defaultFontSize);

  return out;
}

/** The text of a `set_text` logic node, when it is a literal rather than a wire. */
function literalTextOf(node: LogicNode): string | undefined {
  const port = node.inputs?.find((i) => i.name === 'Text' || i.name === '文本');
  if (port && typeof port.defaultValue === 'string' && port.defaultValue.length > 0) {
    return port.defaultValue;
  }
  return undefined;
}

/**
 * Collect the glyphs every custom font in a project has to be able to draw.
 */
export function collectGlyphs(input: CollectGlyphsInput): GlyphCollection {
  const { screens, fontResources, logicGraphs = [], texts = [], typographies = [], defaultFont, defaultFontSize } = input;
  const customFontNames = new Set(fontResources.map((f) => f.cFontName));

  const byFontSize = new Map<string, FontGlyphSet>();
  const unattributed: GlyphSource[] = [];
  const opaque: GlyphSource[] = [];

  // Name → component, so runtime setters can be attributed to their target's font
  const byName = new Map<string, LvglComponent>();
  const indexTree = (components: LvglComponent[]) => {
    for (const comp of components) {
      byName.set(comp.name, comp);
      indexTree(comp.children ?? []);
    }
  };
  for (const screen of screens) indexTree(screen.components);

  const record = (comp: LvglComponent | undefined, source: GlyphSource, targetsOverride?: { cFontName: string; size: number }[]) => {
    const points = codePointsOf(source.text);
    if (points.length === 0) return;

    const targets = targetsOverride
      ?? (comp
        ? resolveFonts(comp, customFontNames, defaultFont, defaultFontSize, typographyById, texts)
        : []);
    if (targets.length === 0) {
      unattributed.push(source);
      return;
    }

    for (const { cFontName, size } of targets) {
      const key = glyphSetKey(cFontName, size);
      let set = byFontSize.get(key);
      if (!set) {
        set = { cFontName, size, codePoints: new Set(), sources: [] };
        byFontSize.set(key, set);
      }
      for (const cp of points) set.codePoints.add(cp);
      set.sources.push(source);
    }
  };

  const typographyById = new Map(typographies.map((typography) => [typography.id, typography]));
  const textById = new Map(texts.map((text) => [text.id, text]));

  /**
   * The other faces this widget's own words can be drawn with.
   *
   * A literal does not change when the language does, but the face that draws
   * it does: a typography with a per-language font renders the same string
   * through it. Collecting only the Default's face leaves those fonts without
   * the characters — which is how a degree sign came out as a box the moment
   * a Chinese screen was shown.
   */
  const languageFonts = (comp: LvglComponent): { cFontName: string; size: number }[] => {
    const typographyId = effectiveTypographyId(comp, texts);
    const typography = typographyId ? typographyById.get(typographyId) : undefined;
    if (!typography?.languages) return [];

    const out: { cFontName: string; size: number }[] = [];
    for (const language of Object.keys(typography.languages)) {
      if (!hasLanguageOverride(typography, language)) continue;
      const resolved = resolveTypographyStyle(typography, language);
      if (isBuiltinFont(resolved.fontResource)) continue;
      if (!customFontNames.has(resolved.fontResource)) continue;
      out.push({ cFontName: resolved.fontResource, size: resolved.fontSize || IMPLIED_FONT_SIZE });
    }
    return out;
  };

  // 1. Static text on widgets
  const walk = (components: LvglComponent[]) => {
    for (const comp of components) {
      for (const { field, text } of textsOfComponent(comp)) {
        record(comp, { kind: 'widget', owner: comp.name, field, text });
        const others = languageFonts(comp);
        if (others.length > 0) {
          record(comp, { kind: 'widget', owner: comp.name, field, text }, others);
        }
      }

      // A linked widget renders its text resource, and the device can switch
      // language at any moment — so every language's words belong to this
      // widget's fonts, not only the literal it was drawn with. This is what
      // puts 你好 into the font when the label was authored as "Hello".
      if (comp.textId) {
        const resource = textById.get(comp.textId);
        if (resource) {
          // Effective, so a typography named by the resource brings its
          // per-language overrides with it — otherwise this language's
          // characters would be subset into the base Latin font instead
          const typographyId = effectiveTypographyId(comp, texts);
          const typography = typographyId ? typographyById.get(typographyId) : undefined;
          for (const [language, value] of Object.entries(resource.values)) {
            // A language with a font override renders through that font and
            // only that font — sending its characters to the base font too
            // would put the CJK back into the Latin face, which is exactly the
            // bloat per-language fonts exist to avoid. Resolved through the
            // shared rule so both override shapes, and overrides of only the
            // size, route the same way the generated style does.
            const resolved = typography && hasLanguageOverride(typography, language)
              ? resolveTypographyStyle(typography, language)
              : undefined;
            const targets = resolved && !isBuiltinFont(resolved.fontResource) && customFontNames.has(resolved.fontResource)
              ? [{ cFontName: resolved.fontResource, size: resolved.fontSize || 16 }]
              : undefined;
            record(comp, {
              kind: 'widget',
              owner: comp.name,
              field: `${resource.key} [${language}]`,
              text: value,
            }, targets);
          }
        }
      }

      // 2. Text set at runtime by a built-in event action
      for (const event of comp.events ?? []) {
        if (event.handlerType === 'custom') {
          if (event.customCode) {
            opaque.push({
              kind: 'event',
              owner: comp.name,
              field: `${event.eventType} custom code`,
              text: '',
            });
          }
          continue;
        }
        const action = event.action;
        if (action?.type === 'setText' && typeof action.value === 'string') {
          const target = action.targetComponent ? byName.get(action.targetComponent) : comp;
          record(target ?? comp, {
            kind: 'event',
            owner: action.targetComponent || comp.name,
            field: `${event.eventType} setText`,
            text: action.value,
          });
        }
      }

      walk(comp.children ?? []);
    }
  };
  for (const screen of screens) walk(screen.components);

  // 3. Text set from the logic graph
  for (const graph of logicGraphs) {
    for (const node of graph.nodes ?? []) {
      if (node.subType === 'c_code_block') {
        opaque.push({ kind: 'logic', owner: node.label || node.id, field: 'c_code_block', text: '' });
        continue;
      }
      if (node.subType !== 'set_text') continue;

      const text = literalTextOf(node);
      if (!text) continue;
      const target = node.params?.targetComponent
        ? byName.get(node.params.targetComponent as string)
        : undefined;
      record(target, {
        kind: 'logic',
        owner: (node.params?.targetComponent as string) || node.label || node.id,
        field: 'set_text',
        text,
      });
    }
  }

  return { byFontSize, unattributed, opaque };
}
