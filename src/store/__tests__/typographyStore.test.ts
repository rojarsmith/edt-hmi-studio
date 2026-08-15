import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';
import type { LvglComponent } from '../../types';

function component(id: string, overrides: Partial<LvglComponent> = {}): LvglComponent {
  return {
    id,
    type: 'label',
    name: id,
    x: 0, y: 0, width: 100, height: 30,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
    ...overrides,
  };
}

function reset(components: LvglComponent[] = []) {
  useEditorStore.setState({
    screens: [{ id: 's1', name: 'Screen 1', components, backgroundColor: '#ffffff' }],
    currentScreenId: 's1',
    screenGroups: [],
    typographies: [],
    openScreenIds: ['s1'],
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

beforeEach(() => reset());

describe('addTypography', () => {
  it('returns the new id and stores it', () => {
    const id = useEditorStore.getState().addTypography();
    const { typographies } = useEditorStore.getState();
    expect(typographies).toHaveLength(1);
    expect(typographies[0].id).toBe(id);
  });

  it('defaults to a built-in font at its own size', () => {
    useEditorStore.getState().addTypography();
    const [typography] = useEditorStore.getState().typographies;
    expect(typography.fontResource).toBe('montserrat_14');
    expect(typography.fontSize).toBe(14);
  });

  it('takes the seed it is given', () => {
    useEditorStore.getState().addTypography({ name: 'Heading', fontResource: 'ui_font_noto', fontSize: 24 });
    const [typography] = useEditorStore.getState().typographies;
    expect(typography.name).toBe('Heading');
    expect(typography.fontResource).toBe('ui_font_noto');
    expect(typography.fontSize).toBe(24);
  });

  it('keeps names unique, since a name is how one is picked', () => {
    const store = useEditorStore.getState();
    store.addTypography({ name: 'Heading' });
    store.addTypography({ name: 'Heading' });
    store.addTypography({ name: 'Heading' });
    const names = useEditorStore.getState().typographies.map((t) => t.name);
    expect(new Set(names).size).toBe(3);
    expect(names).toEqual(['Heading', 'Heading (2)', 'Heading (3)']);
  });

  it('gives every typography a distinct id', () => {
    const store = useEditorStore.getState();
    const a = store.addTypography();
    const b = useEditorStore.getState().addTypography();
    expect(a).not.toBe(b);
  });
});

describe('updateTypography', () => {
  it('changes only the named fields', () => {
    const id = useEditorStore.getState().addTypography({ name: 'Body', fontSize: 16 });
    useEditorStore.getState().updateTypography(id, { fontSize: 24 });
    const [typography] = useEditorStore.getState().typographies;
    expect(typography.fontSize).toBe(24);
    expect(typography.name).toBe('Body');
  });

  it('leaves other typographies alone', () => {
    const store = useEditorStore.getState();
    const first = store.addTypography({ name: 'A' });
    useEditorStore.getState().addTypography({ name: 'B' });
    useEditorStore.getState().updateTypography(first, { fontSize: 48 });
    const sizes = useEditorStore.getState().typographies.map((t) => t.fontSize);
    expect(sizes).toEqual([48, 14]);
  });

  it('ignores an unknown id rather than inventing one', () => {
    useEditorStore.getState().addTypography({ name: 'A' });
    useEditorStore.getState().updateTypography('does-not-exist', { fontSize: 99 });
    expect(useEditorStore.getState().typographies).toHaveLength(1);
    expect(useEditorStore.getState().typographies[0].fontSize).toBe(14);
  });
});

describe('deleteTypography', () => {
  it('removes it from the list', () => {
    const id = useEditorStore.getState().addTypography();
    useEditorStore.getState().deleteTypography(id);
    expect(useEditorStore.getState().typographies).toEqual([]);
  });

  /**
   * The part worth pinning: a widget left pointing at a deleted typography
   * would resolve to nothing, and codegen would emit an lv_obj_add_style for a
   * style that was never declared.
   */
  it('clears the reference from widgets that used it', () => {
    const id = 'typo-x';
    reset([
      component('a', { typographyId: id }),
      component('b', { typographyId: 'other' }),
    ]);
    useEditorStore.setState({ typographies: [{ id, name: 'X', fontResource: 'montserrat_14', fontSize: 14 }] });

    useEditorStore.getState().deleteTypography(id);

    const [first, second] = useEditorStore.getState().screens[0].components;
    expect(first.typographyId).toBeUndefined();
    expect(second.typographyId).toBe('other');
  });

  it('clears the reference from nested children too', () => {
    const id = 'typo-x';
    reset([component('parent', { children: [component('child', { typographyId: id })] })]);
    useEditorStore.setState({ typographies: [{ id, name: 'X', fontResource: 'montserrat_14', fontSize: 14 }] });

    useEditorStore.getState().deleteTypography(id);

    expect(useEditorStore.getState().screens[0].components[0].children[0].typographyId).toBeUndefined();
  });

  it('is undoable, since it edits widgets as well as the list', () => {
    const id = 'typo-x';
    reset([component('a', { typographyId: id })]);
    useEditorStore.setState({ typographies: [{ id, name: 'X', fontResource: 'montserrat_14', fontSize: 14 }] });

    useEditorStore.getState().deleteTypography(id);
    expect(useEditorStore.getState().screens[0].components[0].typographyId).toBeUndefined();

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().screens[0].components[0].typographyId).toBe(id);
  });
});

describe('setTypographyLanguageStyle', () => {
  // A language entry is that language's tab: added on purpose, kept while
  // empty, and gone only when the tab is closed. TouchGFX's shape — tabs do
  // not track the project's language list.
  it('creates the language tab when written to, even with nothing set', () => {
    const id = useEditorStore.getState().addTypography();
    useEditorStore.getState().setTypographyLanguageStyle(id, 'ja', {});
    expect(useEditorStore.getState().typographies[0].languages).toEqual({ ja: {} });
  });

  it('stores only defined fields but keeps the entry when they all revert', () => {
    const id = useEditorStore.getState().addTypography();
    useEditorStore.getState().setTypographyLanguageStyle(id, 'ja', { fontSize: 20 });
    useEditorStore.getState().setTypographyLanguageStyle(id, 'ja', { fontSize: undefined });
    // The tab survives; the language just has no differences from Default
    expect(useEditorStore.getState().typographies[0].languages).toEqual({ ja: {} });
  });

  it('leaves other language tabs alone', () => {
    const id = useEditorStore.getState().addTypography();
    useEditorStore.getState().setTypographyLanguageStyle(id, 'ja', { fontSize: 20 });
    useEditorStore.getState().setTypographyLanguageStyle(id, 'ko', { fontSize: 22 });
    expect(useEditorStore.getState().typographies[0].languages).toEqual({
      ja: { fontSize: 20 },
      ko: { fontSize: 22 },
    });
  });
});

describe('clearTypographyLanguage', () => {
  it('closes the tab, overrides and all', () => {
    const id = useEditorStore.getState().addTypography();
    useEditorStore.getState().setTypographyLanguageStyle(id, 'ja', { fontSize: 20 });
    useEditorStore.getState().clearTypographyLanguage(id, 'ja');
    expect(useEditorStore.getState().typographies[0].languages).toEqual({});
  });
});

describe('setScreens', () => {
  it('loads typographies alongside the screens', () => {
    useEditorStore.getState().setScreens(
      [{ id: 's9', name: 'Loaded', components: [], backgroundColor: '#fff' }],
      [],
      [{ id: 't1', name: 'Loaded style', fontResource: 'montserrat_16', fontSize: 16 }],
    );
    expect(useEditorStore.getState().typographies).toEqual([
      { id: 't1', name: 'Loaded style', fontResource: 'montserrat_16', fontSize: 16 },
    ]);
  });

  it('clears them when a project without any is loaded', () => {
    useEditorStore.getState().addTypography();
    useEditorStore.getState().setScreens([{ id: 's9', name: 'Loaded', components: [], backgroundColor: '#fff' }]);
    expect(useEditorStore.getState().typographies).toEqual([]);
  });
});
