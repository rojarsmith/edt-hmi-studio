import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectGlyphs,
  glyphSetKey,
  toSymbolsString,
  ASCII_BASELINE_START,
  ASCII_BASELINE_END,
} from '../collectGlyphs';
import {
  createComponent,
  createScreen,
  createFontResource,
  createEvent,
  createBuiltinAction,
  createLogicGraph,
  createLogicNode,
  createLogicPort,
  resetIdCounter,
} from './helpers';

const FONT = 'font_roboto';

/** Collect with a single custom font that is also the project default. */
function collect(
  components: Parameters<typeof createScreen>[0] extends never ? never : ReturnType<typeof createComponent>[],
  extra: Partial<Parameters<typeof collectGlyphs>[0]> = {},
) {
  return collectGlyphs({
    screens: [createScreen({ components })],
    fontResources: [createFontResource({ cFontName: FONT })],
    defaultFont: FONT,
    defaultFontSize: 16,
    ...extra,
  });
}

/** The code points collected for one (font, size) pair. */
function pointsOf(result: ReturnType<typeof collectGlyphs>, size = 16): number[] {
  const set = result.byFontSize.get(glyphSetKey(FONT, size));
  return set ? [...set.codePoints].sort((a, b) => a - b) : [];
}

function charsOf(result: ReturnType<typeof collectGlyphs>, size = 16): string {
  return String.fromCodePoint(...pointsOf(result, size));
}

beforeEach(() => {
  resetIdCounter();
});

describe('collectGlyphs — widget text', () => {
  it('collects a label\'s text against the default font', () => {
    const result = collect([createComponent('label', { name: 'title', props: { text: 'Hi' } })]);
    expect(charsOf(result)).toBe('Hi');
  });

  it('collects CJK characters, ordered by code point', () => {
    const result = collect([createComponent('label', { name: 'l', props: { text: '溫度中文' } })]);
    // U+4E2D 中, U+5EA6 度, U+6587 文, U+6EAB 溫
    expect(charsOf(result)).toBe('中度文溫');
  });

  it('deduplicates repeated characters', () => {
    const result = collect([createComponent('label', { name: 'l', props: { text: 'aaabbb' } })]);
    expect(charsOf(result)).toBe('ab');
  });

  it('handles characters outside the BMP without splitting surrogates', () => {
    const result = collect([createComponent('label', { name: 'l', props: { text: '𠀋' } })]);
    expect(pointsOf(result)).toEqual([0x2000b]);
  });

  it('ignores empty and whitespace-only control characters', () => {
    const result = collect([createComponent('label', { name: 'l', props: { text: 'a\n\tb' } })]);
    expect(charsOf(result)).toBe('ab');
  });

  it('produces no entry at all for a project with no text', () => {
    const result = collect([createComponent('obj', { name: 'box' })]);
    expect(result.byFontSize.size).toBe(0);
  });
});

describe('collectGlyphs — every text-bearing prop', () => {
  it.each([
    ['label', { text: 'Lb' }],
    ['btn', { text: 'Bt' }],
    ['checkbox', { text: 'Cb' }],
    ['win', { title: 'Wn' }],
  ])('collects %s text', (type, props) => {
    const result = collect([createComponent(type, { name: `c_${type}`, props })]);
    expect(charsOf(result).length).toBeGreaterThan(0);
  });

  it('collects a textarea\'s text and placeholder', () => {
    const result = collect([
      createComponent('textarea', { name: 'ta', props: { text: 'AB', placeholder: 'CD' } }),
    ]);
    expect(charsOf(result)).toBe('ABCD');
  });

  it('collects dropdown options from an array', () => {
    const result = collect([
      createComponent('dropdown', { name: 'dd', props: { options: ['Ax', 'By'] } }),
    ]);
    expect(charsOf(result)).toBe('ABxy');
  });

  it('collects dropdown options from a newline-joined string', () => {
    const result = collect([
      createComponent('dropdown', { name: 'dd', props: { options: 'Ax\nBy' } }),
    ]);
    expect(charsOf(result)).toBe('ABxy');
  });

  it('collects table cell data', () => {
    const result = collect([
      createComponent('table', { name: 'tb', props: { cellData: [['Ab'], ['Cd']] } }),
    ]);
    expect(charsOf(result)).toBe('ACbd');
  });

  it('collects tabview tab names', () => {
    const result = collect([
      createComponent('tabview', { name: 'tv', props: { tabs: ['Ax', 'By'] } }),
    ]);
    expect(charsOf(result)).toBe('ABxy');
  });

  it('walks into nested children', () => {
    const child = createComponent('label', { name: 'inner', props: { text: 'Zz' } });
    const parent = createComponent('obj', { name: 'outer', children: [child] });
    expect(charsOf(collect([parent]))).toBe('Zz');
  });
});

describe('collectGlyphs — runtime-set text', () => {
  it('collects text from a setText event action', () => {
    const label = createComponent('label', { name: 'status', props: { text: 'A' } });
    const btn = createComponent('btn', {
      name: 'go',
      props: { text: 'B' },
      events: [
        createEvent({
          action: createBuiltinAction({ type: 'setText', targetComponent: 'status', value: '完成' }),
        }),
      ],
    });
    expect(charsOf(collect([label, btn]))).toContain('完');
  });

  it('collects a literal from a set_text logic node', () => {
    const label = createComponent('label', { name: 'status', props: { text: 'A' } });
    const graph = createLogicGraph({
      nodes: [
        createLogicNode('set_text', {
          params: { targetComponent: 'status' },
          inputs: [createLogicPort({ name: 'Text', type: 'string', defaultValue: '就緒' })],
        }),
      ],
    });
    const result = collect([label], { logicGraphs: [graph] });
    expect(charsOf(result)).toContain('就');
  });

  it('records custom event code as opaque rather than silently ignoring it', () => {
    const btn = createComponent('btn', {
      name: 'go',
      props: { text: 'B' },
      events: [createEvent({ handlerType: 'custom', customCode: 'lv_label_set_text(x, "?");' })],
    });
    const result = collect([btn]);
    expect(result.opaque).toHaveLength(1);
    expect(result.opaque[0].kind).toBe('event');
  });

  it('records a c_code_block logic node as opaque', () => {
    const graph = createLogicGraph({ nodes: [createLogicNode('c_code_block')] });
    const result = collect([createComponent('label', { name: 'l', props: { text: 'A' } })], {
      logicGraphs: [graph],
    });
    expect(result.opaque.some((s) => s.field === 'c_code_block')).toBe(true);
  });
});

describe('collectGlyphs — font attribution', () => {
  it('splits glyphs between fonts, not pooling them', () => {
    const result = collectGlyphs({
      screens: [
        createScreen({
          components: [
            createComponent('label', { name: 'a', props: { text: 'AA', fontResource: 'font_a' } }),
            createComponent('label', { name: 'b', props: { text: 'BB', fontResource: 'font_b' } }),
          ],
        }),
      ],
      fontResources: [
        createFontResource({ cFontName: 'font_a' }),
        createFontResource({ cFontName: 'font_b' }),
      ],
    });
    expect(String.fromCodePoint(...result.byFontSize.get(glyphSetKey('font_a', 16))!.codePoints)).toBe('A');
    expect(String.fromCodePoint(...result.byFontSize.get(glyphSetKey('font_b', 16))!.codePoints)).toBe('B');
  });

  it('separates the same font at different sizes', () => {
    const result = collect([
      createComponent('label', { name: 'big', props: { text: 'A', fontResource: FONT, fontSize: 48 } }),
      createComponent('label', { name: 'small', props: { text: 'B', fontResource: FONT, fontSize: 14 } }),
    ]);
    expect(charsOf(result, 48)).toBe('A');
    expect(charsOf(result, 14)).toBe('B');
  });

  it('attributes text to the style path as well as the props path', () => {
    const comp = createComponent('label', {
      name: 'l',
      props: { text: 'A', fontResource: FONT, fontSize: 16 },
      styles: { default: { textFont: 'font_other', textFontSize: 20 } },
    });
    const result = collectGlyphs({
      screens: [createScreen({ components: [comp] })],
      fontResources: [
        createFontResource({ cFontName: FONT }),
        createFontResource({ cFontName: 'font_other' }),
      ],
    });
    // Over-inclusive on purpose: a missing glyph is worse than a spare one
    expect(result.byFontSize.has(glyphSetKey(FONT, 16))).toBe(true);
    expect(result.byFontSize.has(glyphSetKey('font_other', 20))).toBe(true);
  });

  it('reports text as unattributed when the default font is built-in', () => {
    const result = collectGlyphs({
      screens: [createScreen({ components: [createComponent('label', { name: 'l', props: { text: 'A' } })] })],
      fontResources: [],
      defaultFont: 'montserrat_14',
    });
    expect(result.byFontSize.size).toBe(0);
    expect(result.unattributed).toHaveLength(1);
  });
});

describe('collectGlyphs — translations and typographies', () => {
  /**
   * The device can switch language at any moment, so a linked widget's fonts
   * must cover every language's words — not only the literal it was drawn
   * with. This is what puts 你好 into the font when the label says "Hello".
   */
  it('collects every language of a linked widget\'s text resource', () => {
    const label = createComponent('label', {
      name: 'greet',
      props: { text: 'Hello', fontResource: FONT, fontSize: 16 },
      textId: 't1',
    });
    const result = collectGlyphs({
      screens: [createScreen({ components: [label] })],
      fontResources: [createFontResource({ cFontName: FONT })],
      texts: [{ id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' } }],
    });
    const chars = charsOf(result);
    expect(chars).toContain('你');
    expect(chars).toContain('好');
    expect(chars).toContain('H');
  });

  it('ignores a textId whose resource no longer exists', () => {
    const label = createComponent('label', {
      name: 'greet',
      props: { text: 'Hello', fontResource: FONT, fontSize: 16 },
      textId: 'gone',
    });
    const result = collectGlyphs({
      screens: [createScreen({ components: [label] })],
      fontResources: [createFontResource({ cFontName: FONT })],
      texts: [],
    });
    expect(charsOf(result)).toBe('Helo');
  });

  /**
   * An assigned typography's shared style is what actually renders the text,
   * and it may name a font no widget prop mentions — the words must follow it.
   */
  it('attributes a widget\'s text to its assigned typography\'s font', () => {
    const label = createComponent('label', {
      name: 'title',
      props: { text: '溫度' },
      typographyId: 'typo1',
    });
    const result = collectGlyphs({
      screens: [createScreen({ components: [label] })],
      fontResources: [createFontResource({ cFontName: 'font_noto' })],
      typographies: [{ id: 'typo1', name: 'Heading', fontResource: 'font_noto', fontSize: 32 }],
    });
    const set = result.byFontSize.get(glyphSetKey('font_noto', 32));
    expect(set).toBeDefined();
    expect(String.fromCodePoint(...[...set!.codePoints].sort((a, b) => a - b))).toBe('度溫');
  });
});

describe('collectGlyphs — symbol exclusion', () => {
  // U+F00C is LV_SYMBOL_OK: drawn by the symbol font, absent from any real TTF
  const SYMBOL_OK = '';

  it('drops Private Use Area code points, where LVGL symbols live', () => {
    const result = collect([
      createComponent('label', { name: 'l', props: { text: SYMBOL_OK + ' Accept' } }),
    ]);
    expect(charsOf(result)).not.toContain(SYMBOL_OK);
    expect(charsOf(result)).toBe(' Acept');
  });

  it('keeps ordinary text alongside a stripped symbol', () => {
    const result = collect([
      createComponent('label', { name: 'l', props: { text: SYMBOL_OK + '確認' } }),
    ]);
    expect(charsOf(result)).toBe('確認');
  });
});

describe('toSymbolsString', () => {
  it('sorts and deduplicates so the value is stable for the cache key', () => {
    const a = toSymbolsString([0x4e2d, 0x6587, 0x4e2d]);
    const b = toSymbolsString([0x6587, 0x4e2d]);
    expect(a).toBe(b);
    expect(a).toBe('中文');
  });

  it('drops ASCII by default, since the baseline is passed as a range', () => {
    expect(toSymbolsString([0x41, 0x4e2d])).toBe('中');
  });

  it('keeps ASCII when asked', () => {
    expect(toSymbolsString([0x41, 0x4e2d], { includeAscii: true })).toBe('A中');
  });

  it('treats the baseline bounds as inclusive', () => {
    expect(toSymbolsString([ASCII_BASELINE_START, ASCII_BASELINE_END])).toBe('');
  });
});
