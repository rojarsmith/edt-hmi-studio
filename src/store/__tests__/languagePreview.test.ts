import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';
import { displayTextFor } from '../../utils/componentText';
import type { LvglComponent } from '../../types';

function component(id: string, overrides: Partial<LvglComponent> = {}): LvglComponent {
  return {
    id, type: 'label', name: id, x: 0, y: 0, width: 100, height: 30,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
    ...overrides,
  };
}

function reset(components: LvglComponent[] = []) {
  useEditorStore.setState({
    screens: [{ id: 's1', name: 'Screen 1', components, backgroundColor: '#fff' }],
    currentScreenId: 's1',
    screenGroups: [],
    typographies: [],
    languages: [],
    texts: [],
    previewLanguage: null,
    openScreenIds: ['s1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

beforeEach(() => reset());

describe('previewLanguage', () => {
  it('is set by the first language added', () => {
    useEditorStore.getState().addLanguage('en', 'English');
    expect(useEditorStore.getState().previewLanguage).toBe('en');
  });

  it('does not jump when further languages arrive', () => {
    useEditorStore.getState().addLanguage('en', 'English');
    useEditorStore.getState().addLanguage('zh-TW', '繁體中文');
    expect(useEditorStore.getState().previewLanguage).toBe('en');
  });

  it('falls back when the previewed language is deleted', () => {
    useEditorStore.getState().addLanguage('en', 'English');
    useEditorStore.getState().addLanguage('zh-TW', '繁體中文');
    useEditorStore.getState().setPreviewLanguage('zh-TW');
    useEditorStore.getState().deleteLanguage('zh-TW');
    expect(useEditorStore.getState().previewLanguage).toBe('en');
  });

  it('survives deleting a language it was not previewing', () => {
    useEditorStore.getState().addLanguage('en', 'English');
    useEditorStore.getState().addLanguage('zh-TW', '繁體中文');
    useEditorStore.getState().deleteLanguage('zh-TW');
    expect(useEditorStore.getState().previewLanguage).toBe('en');
  });

  it('resets to the loaded default on setScreens', () => {
    useEditorStore.getState().addLanguage('en', 'English');
    useEditorStore.getState().setPreviewLanguage('en');
    useEditorStore.getState().setScreens(
      [{ id: 's9', name: 'Loaded', components: [], backgroundColor: '#fff' }],
      [], [], [{ code: 'ja', name: '日本語' }], [],
    );
    expect(useEditorStore.getState().previewLanguage).toBe('ja');
  });
});

describe('linkComponentToText', () => {
  it('creates a resource from the literal and stamps the widget', () => {
    reset([component('a', { props: { text: 'Save changes' } })]);
    useEditorStore.setState({ languages: [{ code: 'en', name: 'English' }] });

    const id = useEditorStore.getState().linkComponentToText('a');
    const state = useEditorStore.getState();
    expect(id).not.toBeNull();
    expect(state.texts).toHaveLength(1);
    expect(state.texts[0].key).toBe('saveChanges');
    expect(state.texts[0].values.en).toBe('Save changes');
    expect(state.screens[0].components[0].textId).toBe(id);
  });

  it('reuses a resource that already holds the same words', () => {
    reset([component('a', { props: { text: 'OK' } }), component('b', { props: { text: 'OK' } })]);
    useEditorStore.setState({ languages: [{ code: 'en', name: 'English' }] });

    const first = useEditorStore.getState().linkComponentToText('a');
    const second = useEditorStore.getState().linkComponentToText('b');
    expect(second).toBe(first);
    expect(useEditorStore.getState().texts).toHaveLength(1);
  });

  it('creates a default language when the project has none yet', () => {
    reset([component('a', { props: { text: 'Hello' } })]);
    useEditorStore.getState().linkComponentToText('a');
    expect(useEditorStore.getState().languages).toHaveLength(1);
  });

  it('returns null for a widget with nothing to share', () => {
    reset([component('a')]);
    expect(useEditorStore.getState().linkComponentToText('a')).toBeNull();
    expect(useEditorStore.getState().texts).toEqual([]);
  });
});

describe('unlinkComponentText', () => {
  it('freezes the currently displayed words into the literal', () => {
    reset([component('a', { props: { text: 'Old words' }, textId: 't1' })]);
    useEditorStore.setState({
      languages: [{ code: 'en', name: 'English' }, { code: 'zh-TW', name: '繁體中文' }],
      texts: [{ id: 't1', key: 'k', values: { en: 'Hello', 'zh-TW': '你好' } }],
      previewLanguage: 'zh-TW',
    });

    useEditorStore.getState().unlinkComponentText('a');
    const comp = useEditorStore.getState().screens[0].components[0];
    expect(comp.textId).toBeUndefined();
    // What was on screen — the preview language — not the stale literal
    expect(comp.props.text).toBe('你好');
  });
});

describe('displayTextFor', () => {
  const languages = [{ code: 'en', name: 'English' }, { code: 'zh-TW', name: '繁體中文' }];
  const texts = [{ id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' } }];

  it('shows the literal for an unlinked widget', () => {
    const comp = component('a', { props: { text: 'Plain' } });
    expect(displayTextFor(comp, 'text', texts, languages, 'zh-TW')).toBe('Plain');
  });

  it('shows the previewed language for a linked widget', () => {
    const comp = component('a', { props: { text: 'Hello' }, textId: 't1' });
    expect(displayTextFor(comp, 'text', texts, languages, 'zh-TW')).toBe('你好');
  });

  it('falls back to the default language when untranslated', () => {
    const partial = [{ id: 't1', key: 'greeting', values: { en: 'Hello' } }];
    const comp = component('a', { props: { text: 'Hello' }, textId: 't1' });
    expect(displayTextFor(comp, 'text', partial, languages, 'zh-TW')).toBe('Hello');
  });

  it('only substitutes the prop the resource stands in for', () => {
    // The placeholder is the shared one; typed content must stay itself. The
    // recorded textProp is what makes this unambiguous — inferring from
    // current props would flip to `text` the moment content was typed.
    const comp = component('a', {
      type: 'textarea',
      props: { text: 'typed by user', placeholder: 'Hello' },
      textId: 't1',
      textProp: 'placeholder',
    });
    expect(displayTextFor(comp, 'text', texts, languages, 'zh-TW')).toBe('typed by user');
    expect(displayTextFor(comp, 'placeholder', texts, languages, 'zh-TW')).toBe('你好');
  });

  it('keeps the literal when the resource is gone', () => {
    const comp = component('a', { props: { text: 'Hello' }, textId: 'missing' });
    expect(displayTextFor(comp, 'text', texts, languages, 'zh-TW')).toBe('Hello');
  });
});
