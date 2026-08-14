import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';
import { effectiveTypographyId } from '../../utils/componentText';
import type { LvglComponent, TextResource, Typography } from '../../types';

function component(id: string, overrides: Partial<LvglComponent> = {}): LvglComponent {
  return {
    id, type: 'label', name: id, x: 0, y: 0, width: 100, height: 30,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
    ...overrides,
  };
}

function reset(
  components: LvglComponent[] = [],
  texts: TextResource[] = [],
  typographies: Typography[] = [],
) {
  useEditorStore.setState({
    screens: [{ id: 's1', name: 'Screen 1', components, backgroundColor: '#ffffff' }],
    currentScreenId: 's1',
    screenGroups: [],
    typographies,
    languages: [{ code: 'en', name: 'English' }, { code: 'zh-TW', name: '繁體中文' }],
    texts,
    previewLanguage: 'en',
    openScreenIds: ['s1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

const typography = (id: string, name: string): Typography => ({
  id, name, fontResource: 'montserrat_14', fontSize: 14,
});

beforeEach(() => reset());

describe('keys are unique case-insensitively', () => {
  it('refuses a rename that differs only in case', () => {
    // `newText` and `newtext` read as one row; binding the wrong one is silent
    reset([], [{ id: 't1', key: 'newText', values: {} }, { id: 't2', key: 'other', values: {} }]);
    useEditorStore.getState().renameTextKey('t2', 'newtext');
    expect(useEditorStore.getState().texts.find((t) => t.id === 't2')!.key).toBe('other');
  });

  it('still allows renaming a row to a different case of its own key', () => {
    reset([], [{ id: 't1', key: 'newText', values: {} }]);
    useEditorStore.getState().renameTextKey('t1', 'NEWTEXT');
    expect(useEditorStore.getState().texts[0].key).toBe('NEWTEXT');
  });

  it('skips past a case-different key when naming a new row', () => {
    reset([], [{ id: 't1', key: 'NEWTEXT', values: {} }]);
    const id = useEditorStore.getState().addText();
    expect(useEditorStore.getState().texts.find((t) => t.id === id)!.key).toBe('newText2');
  });

  it('skips past one when deriving a key from a widget literal', () => {
    // The trap this closes: keyFromText lowercases, so linking "newText"
    // derived `newtext` and sat next to a hand-written `newText`
    reset([component('a', { props: { text: 'newText' } })], [{ id: 't1', key: 'newText', values: { en: 'hello' } }]);
    const id = useEditorStore.getState().linkComponentToText('a');
    const created = useEditorStore.getState().texts.find((t) => t.id === id)!;
    expect(created.key).toBe('newtext2');
  });
});

describe('bindComponentToText', () => {
  const texts = (): TextResource[] => [
    { id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' } },
  ];

  it('points the widget at the chosen row', () => {
    reset([component('a', { props: { text: 'Plain' } })], texts());
    useEditorStore.getState().bindComponentToText('a', 't1');
    const comp = useEditorStore.getState().screens[0].components[0];
    expect(comp.textId).toBe('t1');
    expect(comp.textProp).toBe('text');
  });

  it('refreshes the literal to the words it now shows', () => {
    // The literal is the fallback after unlinking or deleting the row, so a
    // stale one would resurface words the widget has not shown for a while
    reset([component('a', { props: { text: 'Plain' } })], texts());
    useEditorStore.getState().bindComponentToText('a', 't1');
    expect(useEditorStore.getState().screens[0].components[0].props.text).toBe('Hello');
  });

  it('joins nothing for options — it stores them as the array the canvas indexes', () => {
    reset(
      [component('dd', { type: 'dropdown', props: { options: ['A', 'B'] }, textProp: 'options' })],
      [{ id: 't2', key: 'levels', values: { en: 'Low\nHigh' } }],
    );
    useEditorStore.getState().bindComponentToText('dd', 't2');
    expect(useEditorStore.getState().screens[0].components[0].props.options).toEqual(['Low', 'High']);
  });

  it('unlinks when given no row', () => {
    reset([component('a', { props: { text: 'Hello' }, textId: 't1', textProp: 'text' })], texts());
    useEditorStore.getState().bindComponentToText('a', undefined);
    expect(useEditorStore.getState().screens[0].components[0].textId).toBeUndefined();
  });

  it('ignores a row the project does not have', () => {
    reset([component('a', { props: { text: 'Plain' } })], texts());
    useEditorStore.getState().bindComponentToText('a', 'missing');
    expect(useEditorStore.getState().screens[0].components[0].textId).toBeUndefined();
  });
});

describe('a text resource can carry a typography', () => {
  it('imposes it on a widget that has none', () => {
    const texts: TextResource[] = [{ id: 't1', key: 'greeting', values: {}, typographyId: 'ty1' }];
    const comp = component('a', { textId: 't1' });
    expect(effectiveTypographyId(comp, texts)).toBe('ty1');
  });

  it("wins over the widget's own, so the words carry their face", () => {
    const texts: TextResource[] = [{ id: 't1', key: 'greeting', values: {}, typographyId: 'ty1' }];
    const comp = component('a', { textId: 't1', typographyId: 'ty2' });
    expect(effectiveTypographyId(comp, texts)).toBe('ty1');
  });

  it("leaves the widget's own in place when the row names none", () => {
    const texts: TextResource[] = [{ id: 't1', key: 'greeting', values: {} }];
    const comp = component('a', { textId: 't1', typographyId: 'ty2' });
    expect(effectiveTypographyId(comp, texts)).toBe('ty2');
  });

  it('applies to an unlinked widget not at all', () => {
    const texts: TextResource[] = [{ id: 't1', key: 'greeting', values: {}, typographyId: 'ty1' }];
    expect(effectiveTypographyId(component('a', { typographyId: 'ty2' }), texts)).toBe('ty2');
    expect(effectiveTypographyId(component('b'), texts)).toBeUndefined();
  });

  it('is set and cleared through the store', () => {
    reset([], [{ id: 't1', key: 'greeting', values: {} }], [typography('ty1', 'Heading')]);
    useEditorStore.getState().setTextTypography('t1', 'ty1');
    expect(useEditorStore.getState().texts[0].typographyId).toBe('ty1');
    useEditorStore.getState().setTextTypography('t1', undefined);
    expect(useEditorStore.getState().texts[0].typographyId).toBeUndefined();
  });

  it('is released when the typography is deleted', () => {
    // Otherwise the row points at nothing and its widgets resolve to no
    // typography at all, silently losing the style
    reset(
      [component('a', { textId: 't1' })],
      [{ id: 't1', key: 'greeting', values: {}, typographyId: 'ty1' }],
      [typography('ty1', 'Heading')],
    );
    useEditorStore.getState().deleteTypography('ty1');
    expect(useEditorStore.getState().texts[0].typographyId).toBeUndefined();
  });
});
