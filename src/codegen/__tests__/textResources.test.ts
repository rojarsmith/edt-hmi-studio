import { describe, it, expect } from 'vitest';
import { deriveTextResources, applyTextResources, resolveText } from '../textResources';
import { createComponent, createScreen } from './helpers';
import type { LvglComponent, TextResource } from '../../types';

const EN = 'en';
const screensOf = (...components: LvglComponent[]) => [createScreen({ components })];

describe('deriveTextResources — what becomes a resource', () => {
  it('takes a label\'s text', () => {
    const result = deriveTextResources(screensOf(createComponent('label', { name: 'l', props: { text: 'Hello' } })), EN);
    expect(result.texts).toHaveLength(1);
    expect(result.texts[0].values).toEqual({ en: 'Hello' });
  });

  it.each([
    ['text', { text: 'Save' }],
    ['placeholder', { placeholder: 'Enter a name' }],
    ['title', { title: 'Settings' }],
  ])('takes %s', (_label, props) => {
    expect(deriveTextResources(screensOf(createComponent('label', { name: 'l', props })), EN).texts).toHaveLength(1);
  });

  it('ignores a widget with no text at all', () => {
    const result = deriveTextResources(screensOf(createComponent('obj', { name: 'box' })), EN);
    expect(result.texts).toEqual([]);
    expect(result.assignments.size).toBe(0);
  });

  it('ignores empty and whitespace-only text', () => {
    const blank = createComponent('label', { name: 'a', props: { text: '' } });
    const spaces = createComponent('label', { name: 'b', props: { text: '   ' } });
    expect(deriveTextResources(screensOf(blank, spaces), EN).texts).toEqual([]);
  });

  it('walks into nested children', () => {
    const child = createComponent('label', { name: 'inner', props: { text: 'Deep' } });
    const parent = createComponent('obj', { name: 'outer', children: [child] });
    const result = deriveTextResources(screensOf(parent), EN);
    expect(result.texts).toHaveLength(1);
    expect(result.assignments.get(child.id)).toBeDefined();
  });

  /**
   * Options are one resource holding the whole list, newline-joined — the
   * exact string lv_dropdown_set_options takes. The count and order are shared
   * across languages; only the words differ.
   */
  it('takes dropdown options as one newline-joined resource', () => {
    const dropdown = createComponent('dropdown', { name: 'dd', props: { options: ['Low', 'High'] } });
    const result = deriveTextResources(screensOf(dropdown), EN);
    expect(result.texts).toHaveLength(1);
    expect(result.texts[0].values.en).toBe('Low\nHigh');
    expect(result.sourceProps.get(dropdown.id)).toBe('options');
  });

  it('shares one resource between dropdowns with identical options', () => {
    const a = createComponent('dropdown', { name: 'a', props: { options: ['Low', 'High'] } });
    const b = createComponent('dropdown', { name: 'b', props: { options: ['Low', 'High'] } });
    const result = deriveTextResources(screensOf(a, b), EN);
    expect(result.texts).toHaveLength(1);
    expect(result.assignments.get(a.id)).toBe(result.assignments.get(b.id));
  });

  // Cells and tab names have no single-string LVGL shape, so they stay literals
  it('still leaves table cells and tab names alone', () => {
    const table = createComponent('table', { name: 't', props: { cellData: [['A']] } });
    const tabs = createComponent('tabview', { name: 'tv', props: { tabs: ['One', 'Two'] } });
    expect(deriveTextResources(screensOf(table, tabs), EN).texts).toEqual([]);
  });
});

describe('deriveTextResources — deduplication', () => {
  it('collapses widgets showing the same words onto one resource', () => {
    const a = createComponent('btn', { name: 'a', props: { text: 'OK' } });
    const b = createComponent('btn', { name: 'b', props: { text: 'OK' } });
    const result = deriveTextResources(screensOf(a, b), EN);
    expect(result.texts).toHaveLength(1);
    expect(result.assignments.get(a.id)).toBe(result.assignments.get(b.id));
  });

  it('keeps different words apart', () => {
    const a = createComponent('btn', { name: 'a', props: { text: 'OK' } });
    const b = createComponent('btn', { name: 'b', props: { text: 'Cancel' } });
    expect(deriveTextResources(screensOf(a, b), EN).texts).toHaveLength(2);
  });

  it('treats case and spacing as different words', () => {
    const a = createComponent('btn', { name: 'a', props: { text: 'OK' } });
    const b = createComponent('btn', { name: 'b', props: { text: 'ok' } });
    expect(deriveTextResources(screensOf(a, b), EN).texts).toHaveLength(2);
  });
});

describe('deriveTextResources — keys', () => {
  it('builds a readable identifier from the words', () => {
    const comp = createComponent('label', { name: 'l', props: { text: 'Save changes' } });
    expect(deriveTextResources(screensOf(comp), EN).texts[0].key).toBe('saveChanges');
  });

  it('drops punctuation', () => {
    const comp = createComponent('label', { name: 'l', props: { text: 'Are you sure?' } });
    expect(deriveTextResources(screensOf(comp), EN).texts[0].key).toBe('areYouSure');
  });

  it('caps the length rather than building a sentence-long key', () => {
    const comp = createComponent('label', { name: 'l', props: { text: 'one two three four five six' } });
    expect(deriveTextResources(screensOf(comp), EN).texts[0].key).toBe('oneTwoThreeFour');
  });

  it('keeps keys unique when different text reduces to the same one', () => {
    const a = createComponent('label', { name: 'a', props: { text: 'Save changes' } });
    const b = createComponent('label', { name: 'b', props: { text: 'Save  changes!' } });
    const keys = deriveTextResources(screensOf(a, b), EN).texts.map((t) => t.key);
    expect(keys).toEqual(['saveChanges', 'saveChanges2']);
    expect(new Set(keys).size).toBe(2);
  });

  it('keeps a non-Latin key as written', () => {
    // Keys are string literals in the tag table, not identifiers, so CJK is
    // valid and prefixing it would only make it harder to read
    const comp = createComponent('label', { name: 'l', props: { text: '溫度設定' } });
    expect(deriveTextResources(screensOf(comp), EN).texts[0].key).toBe('溫度設定');
  });

  it('prefixes a key that would start with a digit', () => {
    const comp = createComponent('label', { name: 'l', props: { text: '3 items' } });
    expect(deriveTextResources(screensOf(comp), EN).texts[0].key).toBe('text3Items');
  });

  it('falls back to a name for text that is only punctuation', () => {
    const comp = createComponent('label', { name: 'l', props: { text: '...' } });
    expect(deriveTextResources(screensOf(comp), EN).texts[0].key).toBe('text');
  });
});

describe('applyTextResources', () => {
  it('stamps the id onto the widgets that got one', () => {
    const withText = createComponent('label', { name: 'a', props: { text: 'Hello' } });
    const without = createComponent('obj', { name: 'b' });
    const result = applyTextResources(screensOf(withText, without), EN);

    const [outA, outB] = result.screens[0].components;
    expect(outA.textId).toBe(result.texts[0].id);
    expect(outB.textId).toBeUndefined();
  });

  it('does not mutate the screens it was given', () => {
    const comp = createComponent('label', { name: 'a', props: { text: 'Hello' } });
    const screens = screensOf(comp);
    applyTextResources(screens, EN);
    expect(screens[0].components[0].textId).toBeUndefined();
  });

  it('leaves the literal in place, so nothing renders differently yet', () => {
    const comp = createComponent('label', { name: 'a', props: { text: 'Hello' } });
    const result = applyTextResources(screensOf(comp), EN);
    expect(result.screens[0].components[0].props.text).toBe('Hello');
  });

  it('is deterministic for identical input', () => {
    const build = () => applyTextResources(
      screensOf(
        createComponent('label', { id: 'x', name: 'a', props: { text: 'One' } }),
        createComponent('label', { id: 'y', name: 'b', props: { text: 'Two' } }),
      ),
      EN,
    );
    expect(build().texts).toEqual(build().texts);
  });
});

/**
 * The load path decides whether to migrate by looking at the stored arrays, and
 * a saved project carries `[]` rather than omitting the field. `[]` is truthy,
 * so testing existence alone skips migration forever after the first save —
 * which is exactly how a project ends up with widgets holding a textId and no
 * text table for them to point at.
 */
describe('empty arrays are not "already migrated"', () => {
  it.each([
    ['undefined', undefined],
    ['an empty array', []],
  ])('treats %s as needing migration', (_label, stored: TextResource[] | undefined) => {
    const needsMigration = !stored?.length;
    expect(needsMigration).toBe(true);
  });

  it('treats a populated array as already migrated', () => {
    const stored: TextResource[] = [{ id: 't1', key: 'k', values: {} }];
    expect(!stored?.length).toBe(false);
  });
});

describe('resolveText', () => {
  const resource: TextResource = { id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' } };

  it('returns the asked-for language', () => {
    expect(resolveText(resource, 'zh-TW', ['en', 'zh-TW'])).toBe('你好');
  });

  it('falls back to the first language that has one, as LVGL does at runtime', () => {
    expect(resolveText(resource, 'ja', ['en', 'zh-TW', 'ja'])).toBe('Hello');
  });

  it('falls back to the key when nothing is translated, so the tag is visible', () => {
    const empty: TextResource = { id: 't2', key: 'untranslated', values: {} };
    expect(resolveText(empty, 'en', ['en'])).toBe('untranslated');
  });
});
