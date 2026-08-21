/*
 * Which pieces of a widget can be styled separately, and what to call them.
 *
 * LVGL splits a widget into parts and a style reaches one of them through a
 * part selector: a slider's track is `LV_PART_MAIN`, its filled length is
 * `LV_PART_INDICATOR` and the thing you drag is `LV_PART_KNOB`. The editor
 * only ever wrote to the main part, so a project could paint the track and
 * never the fill — every slider, switch and progress bar kept the stock
 * theme's blue however warm the rest of the screen was.
 *
 * Two things live here. The first is the catalogue: which parts each widget
 * has, named in that widget's own words rather than in LVGL's, because
 * "Indicator" means the filled part of a slider and the On colour of a switch
 * and nobody should have to know that. The second is the reading of a part's
 * style: most parts are drawn as a box and take the style properties a box
 * takes, but an arc's parts are drawn as arcs and take `arc_*` instead — see
 * `isArcPart`.
 */

import type { LvglComponent, LvglPart, LvglStyleState, StyleProps } from '../types';

export interface WidgetPart {
  part: LvglPart;
  /** What this part is called on this widget, for the Style section's switcher. */
  label: string;
  /** One line on what it draws, for the switcher's tooltip. */
  hint: string;
  /**
   * The state this part is normally styled in, which the Style section jumps
   * to when the part is chosen. A switch's on colour and a checkbox's tick are
   * only ever drawn while checked, and LVGL's own theme claims that selector —
   * a style written without a state would lose to it and never show.
   */
  state?: LvglStyleState;
}

const MAIN_ONLY: WidgetPart[] = [
  { part: 'main', label: 'Main', hint: 'The whole widget' },
];

/**
 * The parts each widget offers, in the order the switcher shows them. A widget
 * absent from here has only its main part, which is most of them.
 *
 * Only parts the editor can both draw and generate are listed. LVGL exposes
 * more — a textarea's cursor, a table's cells — and they can be added here
 * once the canvas knows how to show them.
 */
const PARTS_BY_TYPE: Record<string, WidgetPart[]> = {
  slider: [
    { part: 'main', label: 'Track', hint: 'The groove the knob runs in' },
    { part: 'indicator', label: 'Fill', hint: 'The travelled part of the track' },
    { part: 'knob', label: 'Knob', hint: 'The handle that is dragged' },
  ],
  bar: [
    { part: 'main', label: 'Track', hint: 'The unfilled length' },
    { part: 'indicator', label: 'Fill', hint: 'The filled length' },
  ],
  switch: [
    { part: 'main', label: 'Off', hint: 'The track while the switch is off' },
    { part: 'indicator', label: 'On', hint: 'The track while the switch is on', state: 'checked' },
    { part: 'knob', label: 'Knob', hint: 'The circle that slides across' },
  ],
  checkbox: [
    { part: 'main', label: 'Label', hint: 'The widget and its text' },
    { part: 'indicator', label: 'Box', hint: 'The tick box, once ticked', state: 'checked' },
  ],
  dropdown: [
    { part: 'main', label: 'Box', hint: 'The closed dropdown' },
    { part: 'indicator', label: 'Arrow', hint: 'The chevron at its right' },
  ],
  arc: [
    { part: 'main', label: 'Track', hint: 'The arc behind the value' },
    { part: 'indicator', label: 'Value', hint: 'The arc drawn up to the value' },
    { part: 'knob', label: 'Knob', hint: 'The handle at the end of the value arc' },
  ],
  spinner: [
    { part: 'main', label: 'Track', hint: 'The full ring' },
    { part: 'indicator', label: 'Arc', hint: 'The length that spins' },
  ],
};

/** The parts this widget offers. Never empty: everything has a main part. */
export function widgetParts(type: string): WidgetPart[] {
  return PARTS_BY_TYPE[type] ?? MAIN_ONLY;
}

/** Whether the Style section should offer a part switcher at all. */
export function hasStyleParts(type: string): boolean {
  return widgetParts(type).length > 1;
}

/**
 * Whether this part of this widget is drawn as an arc rather than as a box.
 *
 * An arc has no fill, border or corner radius — it has a colour and a
 * thickness — so the same Background Color and Border Width rows are read as
 * `arc_color` and `arc_width` here. The knob is a real box and is not one of
 * these.
 */
export function isArcPart(type: string, part: LvglPart): boolean {
  return (type === 'arc' || type === 'spinner') && part !== 'knob';
}

/** The LVGL selector for a part in a state, as generated code writes it. */
export function partSelector(part: LvglPart, state: LvglStyleState): string {
  const partSel = part === 'main' ? '' : `LV_PART_${part.toUpperCase()}`;
  const stateSel = state === 'default' ? '' : `LV_STATE_${state.toUpperCase()}`;
  if (partSel && stateSel) return `${partSel} | ${stateSel}`;
  // `0` is LV_PART_MAIN | LV_STATE_DEFAULT, which is what no selector means.
  return partSel || stateSel || '0';
}

/** The style a widget carries for one part in one state, if it carries one. */
export function partStyle(
  styles: LvglComponent['styles'] | undefined,
  part: LvglPart,
  state: LvglStyleState = 'default',
): StyleProps | undefined {
  if (!styles) return undefined;
  if (part === 'main') return styles[state];
  return styles.parts?.[part]?.[state];
}

/**
 * A part's resting colour, or the fallback the editor drew before parts
 * existed. Every renderer asks through here so the canvas, the 2D preview and
 * the firmware cannot drift apart on what a slider's fill is.
 */
export function partColor(
  component: Pick<LvglComponent, 'type' | 'styles'>,
  part: LvglPart,
  fallback: string,
  /**
   * The state being drawn. Falls back to the resting style, so a widget that
   * only styles one covers both — and a switch, whose on colour can only live
   * in `checked`, still shows that colour on the canvas.
   */
  state: LvglStyleState = 'default',
): string {
  const colour = partStyle(component.styles, part, state)?.bgColor
    ?? (state === 'default' ? undefined : partStyle(component.styles, part)?.bgColor);
  if (colour && colour !== 'transparent') return colour;
  // An arc's value colour lived in `borderColor` before it had a part of its
  // own — that is what the canvas has always drawn and what the arc and
  // spinner palette entries in componentDefinitions still mean.
  if (part === 'indicator' && isArcPart(component.type, part)) {
    return component.styles?.default?.borderColor || fallback;
  }
  return fallback;
}

/** Set one style property on one part/state, returning the new styles object. */
export function withPartStyle(
  styles: LvglComponent['styles'],
  part: LvglPart,
  state: LvglStyleState,
  updates: StyleProps,
): LvglComponent['styles'] {
  if (part === 'main') {
    return { ...styles, [state]: { ...(styles[state] ?? styles.default), ...updates } };
  }
  const existing = styles.parts?.[part];
  return {
    ...styles,
    parts: {
      ...styles.parts,
      [part]: { ...existing, [state]: { ...(existing?.[state] ?? {}), ...updates } },
    },
  };
}

/** Drop a part/state's own style, so it inherits again. */
export function withoutPartStyle(
  styles: LvglComponent['styles'],
  part: LvglPart,
  state: LvglStyleState,
): LvglComponent['styles'] {
  if (part === 'main') {
    if (state === 'default') return styles;
    const next = { ...styles };
    delete next[state];
    return next;
  }
  const existing = styles.parts?.[part];
  if (!existing) return styles;
  const nextPart = { ...existing };
  delete nextPart[state];
  const parts = { ...styles.parts };
  if (Object.keys(nextPart).length === 0) delete parts[part];
  else parts[part] = nextPart;
  if (Object.keys(parts).length === 0) {
    const next = { ...styles };
    delete next.parts;
    return next;
  }
  return { ...styles, parts };
}

/** Deep copy, for the clone paths that rebuild a component's styles by hand. */
export function cloneStyles(styles: LvglComponent['styles']): LvglComponent['styles'] {
  const next: LvglComponent['styles'] = {
    default: { ...styles.default },
    pressed: styles.pressed ? { ...styles.pressed } : undefined,
    focused: styles.focused ? { ...styles.focused } : undefined,
    disabled: styles.disabled ? { ...styles.disabled } : undefined,
    checked: styles.checked ? { ...styles.checked } : undefined,
  };
  if (styles.parts) {
    next.parts = {};
    for (const [part, perState] of Object.entries(styles.parts)) {
      if (!perState) continue;
      const copy: PartStatesCopy = {};
      for (const [state, style] of Object.entries(perState)) {
        if (style) copy[state as LvglStyleState] = { ...style };
      }
      next.parts[part as Exclude<LvglPart, 'main'>] = copy;
    }
  }
  return next;
}

type PartStatesCopy = Partial<Record<LvglStyleState, StyleProps>>;
