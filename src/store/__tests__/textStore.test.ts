import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';
import type { TextResource } from '../../types';

function reset(texts: TextResource[] = [], languages = [{ code: 'en', name: 'English' }]) {
  useEditorStore.setState({
    screens: [{ id: 's1', name: 'Screen 1', components: [], backgroundColor: '#ffffff' }],
    currentScreenId: 's1',
    screenGroups: [],
    typographies: [],
    languages,
    texts,
    openScreenIds: ['s1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

const sample = (): TextResource[] => [
  { id: 't1', key: 'greeting', values: { en: 'Hello' } },
  { id: 't2', key: 'ok', values: { en: 'OK' } },
];

beforeEach(() => reset());

describe('addLanguage', () => {
  it('appends a language', () => {
    useEditorStore.getState().addLanguage('zh-TW', '繁體中文');
    expect(useEditorStore.getState().languages).toEqual([
      { code: 'en', name: 'English' },
      { code: 'zh-TW', name: '繁體中文' },
    ]);
  });

  it('refuses a duplicate code, which would make two columns indistinguishable', () => {
    useEditorStore.getState().addLanguage('en', 'English again');
    expect(useEditorStore.getState().languages).toHaveLength(1);
  });

  it('ignores an empty code', () => {
    useEditorStore.getState().addLanguage('   ', 'Nameless');
    expect(useEditorStore.getState().languages).toHaveLength(1);
  });

  it('falls back to the code when no name is given', () => {
    useEditorStore.getState().addLanguage('ja', '  ');
    expect(useEditorStore.getState().languages[1]).toEqual({ code: 'ja', name: 'ja' });
  });

  it('keeps the first language first, since it is the default', () => {
    const store = useEditorStore.getState();
    store.addLanguage('zh-TW', '繁體中文');
    useEditorStore.getState().addLanguage('ja', '日本語');
    expect(useEditorStore.getState().languages[0].code).toBe('en');
  });
});

describe('deleteLanguage', () => {
  it('removes the language', () => {
    reset(sample(), [{ code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }]);
    useEditorStore.getState().deleteLanguage('ja');
    expect(useEditorStore.getState().languages.map((l) => l.code)).toEqual(['en']);
  });

  /**
   * Leaving the words behind would keep translations for a language the project
   * no longer has, and the next export would disagree with the table.
   */
  it('drops that language\'s words from every text', () => {
    reset(
      [{ id: 't1', key: 'greeting', values: { en: 'Hello', ja: 'こんにちは' } }],
      [{ code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }],
    );
    useEditorStore.getState().deleteLanguage('ja');
    expect(useEditorStore.getState().texts[0].values).toEqual({ en: 'Hello' });
  });

  it('leaves texts that never had that language alone', () => {
    reset(sample(), [{ code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }]);
    const before = useEditorStore.getState().texts;
    useEditorStore.getState().deleteLanguage('ja');
    expect(useEditorStore.getState().texts).toEqual(before);
  });
});

describe('updateText', () => {
  it('sets a translation for one language', () => {
    reset(sample(), [{ code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }]);
    useEditorStore.getState().updateText('t1', 'ja', 'こんにちは');
    expect(useEditorStore.getState().texts[0].values).toEqual({ en: 'Hello', ja: 'こんにちは' });
  });

  it('leaves other texts alone', () => {
    reset(sample());
    useEditorStore.getState().updateText('t1', 'en', 'Hi');
    expect(useEditorStore.getState().texts[1].values.en).toBe('OK');
  });

  it('ignores an unknown id', () => {
    reset(sample());
    useEditorStore.getState().updateText('nope', 'en', 'x');
    expect(useEditorStore.getState().texts.map((t) => t.values.en)).toEqual(['Hello', 'OK']);
  });
});

describe('renameTextKey', () => {
  it('renames the key', () => {
    reset(sample());
    useEditorStore.getState().renameTextKey('t1', 'welcome');
    expect(useEditorStore.getState().texts[0].key).toBe('welcome');
  });

  /** The key is the generated tag, so two the same are indistinguishable to lv_translation_get. */
  it('refuses a key another text already uses', () => {
    reset(sample());
    useEditorStore.getState().renameTextKey('t1', 'ok');
    expect(useEditorStore.getState().texts[0].key).toBe('greeting');
  });

  it('allows renaming a text to the key it already has', () => {
    reset(sample());
    useEditorStore.getState().renameTextKey('t1', 'greeting');
    expect(useEditorStore.getState().texts[0].key).toBe('greeting');
  });

  it('ignores an empty key, which would generate an unusable tag', () => {
    reset(sample());
    useEditorStore.getState().renameTextKey('t1', '  ');
    expect(useEditorStore.getState().texts[0].key).toBe('greeting');
  });
});

describe('setScreens', () => {
  it('loads languages and texts alongside the screens', () => {
    useEditorStore.getState().setScreens(
      [{ id: 's9', name: 'Loaded', components: [], backgroundColor: '#fff' }],
      [], [],
      [{ code: 'de', name: 'Deutsch' }],
      [{ id: 'tx', key: 'hi', values: { de: 'Hallo' } }],
    );
    const state = useEditorStore.getState();
    expect(state.languages).toEqual([{ code: 'de', name: 'Deutsch' }]);
    expect(state.texts).toEqual([{ id: 'tx', key: 'hi', values: { de: 'Hallo' } }]);
  });

  it('clears them when a project without any is loaded', () => {
    reset(sample());
    useEditorStore.getState().setScreens([{ id: 's9', name: 'Loaded', components: [], backgroundColor: '#fff' }]);
    expect(useEditorStore.getState().texts).toEqual([]);
    expect(useEditorStore.getState().languages).toEqual([]);
  });
});
