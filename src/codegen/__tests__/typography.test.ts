import { describe, it, expect } from 'vitest';
import { deriveTypographies } from '../typography';
import { createComponent, createScreen } from './helpers';
import type { LvglComponent } from '../../types';

const screensOf = (...components: LvglComponent[]) => [createScreen({ components })];

describe('deriveTypographies — what gets one', () => {
  it('ignores components that set no text style', () => {
    const result = deriveTypographies(screensOf(createComponent('obj', { name: 'box' })));
    expect(result.typographies).toEqual([]);
    expect(result.assignments.size).toBe(0);
  });

  it('ignores a label that only has text, with no styling of its own', () => {
    // It inherits the screen default today; giving it a typography would change
    // what ui.c emits for it
    const label = createComponent('label', { name: 'l', props: { text: 'Hello' } });
    expect(deriveTypographies(screensOf(label)).typographies).toEqual([]);
  });

  it.each([
    ['a font on props', { props: { fontResource: 'ui_font_noto', fontSize: 24 } }],
    ['a size alone on props', { props: { fontSize: 24 } }],
    ['an alignment', { props: { textAlign: 'center' } }],
    ['a font on styles', { styles: { default: { textFont: 'ui_font_noto', textFontSize: 24 } } }],
    ['letter spacing', { styles: { default: { textLetterSpace: 2 } } }],
    ['a decoration', { styles: { default: { textDecor: 'underline' as const } } }],
  ])('creates one for %s', (_label, overrides) => {
    const comp = createComponent('label', { name: 'l', ...overrides });
    expect(deriveTypographies(screensOf(comp)).typographies).toHaveLength(1);
  });

  it('ignores styling that only exists in a non-default state', () => {
    // A typography describes the resting appearance. Pressed/focused/disabled
    // text styling keeps emitting per-state, so deriving one here would invent
    // a typography from styling the widget never set.
    const comp = createComponent('label', {
      name: 'l',
      styles: { default: {}, pressed: { textFont: 'ui_font_noto', textFontSize: 24 } },
    });
    expect(deriveTypographies(screensOf(comp)).typographies).toEqual([]);
  });

  it('still derives from the default state when other states also style text', () => {
    const comp = createComponent('label', {
      name: 'l',
      styles: {
        default: { textFont: 'ui_font_noto', textFontSize: 24 },
        pressed: { textFont: 'ui_font_other', textFontSize: 30 },
      },
    });
    const [typo] = deriveTypographies(screensOf(comp)).typographies;
    expect(typo.fontResource).toBe('ui_font_noto');
    expect(typo.fontSize).toBe(24);
  });

  it('walks into nested children', () => {
    const child = createComponent('label', { name: 'inner', props: { fontResource: 'ui_font_noto', fontSize: 16 } });
    const parent = createComponent('obj', { name: 'outer', children: [child] });
    const result = deriveTypographies(screensOf(parent));
    expect(result.typographies).toHaveLength(1);
    expect(result.assignments.get(child.id)).toBeDefined();
    expect(result.assignments.has(parent.id)).toBe(false);
  });
});

describe('deriveTypographies — deduplication', () => {
  it('shares one typography between identically styled components', () => {
    const a = createComponent('label', { name: 'a', props: { fontResource: 'ui_font_noto', fontSize: 24 } });
    const b = createComponent('label', { name: 'b', props: { fontResource: 'ui_font_noto', fontSize: 24 } });
    const result = deriveTypographies(screensOf(a, b));
    expect(result.typographies).toHaveLength(1);
    expect(result.assignments.get(a.id)).toBe(result.assignments.get(b.id));
  });

  it('separates components differing only in size', () => {
    const a = createComponent('label', { name: 'a', props: { fontResource: 'ui_font_noto', fontSize: 24 } });
    const b = createComponent('label', { name: 'b', props: { fontResource: 'ui_font_noto', fontSize: 16 } });
    expect(deriveTypographies(screensOf(a, b)).typographies).toHaveLength(2);
  });

  it.each([
    ['letter spacing', { textLetterSpace: 3 }],
    ['line spacing', { textLineSpace: 4 }],
    ['decoration', { textDecor: 'underline' as const }],
  ])('separates components differing only in %s', (_label, styleOverride) => {
    const a = createComponent('label', {
      name: 'a',
      styles: { default: { textFont: 'ui_font_noto', textFontSize: 24 } },
    });
    const b = createComponent('label', {
      name: 'b',
      styles: { default: { textFont: 'ui_font_noto', textFontSize: 24, ...styleOverride } },
    });
    expect(deriveTypographies(screensOf(a, b)).typographies).toHaveLength(2);
  });

  it('separates components differing only in alignment', () => {
    const a = createComponent('label', { name: 'a', props: { fontResource: 'ui_font_noto', fontSize: 24, textAlign: 'left' } });
    const b = createComponent('label', { name: 'b', props: { fontResource: 'ui_font_noto', fontSize: 24, textAlign: 'right' } });
    expect(deriveTypographies(screensOf(a, b)).typographies).toHaveLength(2);
  });

  it('collapses styles that only differ in how they were written', () => {
    // One sets the font through props, the other through styles — same result
    const viaProps = createComponent('label', { name: 'a', props: { fontResource: 'ui_font_noto', fontSize: 24 } });
    const viaStyles = createComponent('label', {
      name: 'b',
      styles: { default: { textFont: 'ui_font_noto', textFontSize: 24 } },
    });
    const result = deriveTypographies(screensOf(viaProps, viaStyles));
    expect(result.typographies).toHaveLength(1);
    expect(result.assignments.get(viaProps.id)).toBe(result.assignments.get(viaStyles.id));
  });
});

describe('deriveTypographies — resolution', () => {
  it('fills the font from the project default when only a size is set', () => {
    const comp = createComponent('label', { name: 'l', props: { fontSize: 32 } });
    const [typo] = deriveTypographies(screensOf(comp), 'ui_font_noto', 16).typographies;
    expect(typo.fontResource).toBe('ui_font_noto');
    expect(typo.fontSize).toBe(32);
  });

  it('lets the style path win over props, matching ui.c emission order', () => {
    const comp = createComponent('label', {
      name: 'l',
      props: { fontResource: 'ui_font_a', fontSize: 16 },
      styles: { default: { textFont: 'ui_font_b', textFontSize: 20 } },
    });
    const [typo] = deriveTypographies(screensOf(comp)).typographies;
    expect(typo.fontResource).toBe('ui_font_b');
    expect(typo.fontSize).toBe(20);
  });

  it('takes a built-in font\'s size from its name rather than a stated size', () => {
    const comp = createComponent('label', { name: 'l', props: { fontResource: 'montserrat_28', fontSize: 99 } });
    const [typo] = deriveTypographies(screensOf(comp)).typographies;
    expect(typo.fontSize).toBe(28);
  });

  it('defaults a widget with no stated size to 16', () => {
    const comp = createComponent('label', { name: 'l', props: { fontResource: 'ui_font_noto' } });
    expect(deriveTypographies(screensOf(comp)).typographies[0].fontSize).toBe(16);
  });
});

describe('deriveTypographies — naming and stability', () => {
  it('names by font and size', () => {
    const comp = createComponent('label', { name: 'l', props: { fontResource: 'ui_font_noto', fontSize: 24 } });
    expect(deriveTypographies(screensOf(comp)).typographies[0].name).toBe('Noto 24');
  });

  it('disambiguates a name reused by a different style', () => {
    const a = createComponent('label', { name: 'a', props: { fontResource: 'ui_font_noto', fontSize: 24 } });
    const b = createComponent('label', {
      name: 'b',
      styles: { default: { textFont: 'ui_font_noto', textFontSize: 24, textLetterSpace: 5 } },
    });
    const names = deriveTypographies(screensOf(a, b)).typographies.map((t) => t.name);
    expect(names).toEqual(['Noto 24', 'Noto 24 (2)']);
    expect(new Set(names).size).toBe(2);
  });

  it('produces identical output for identical input', () => {
    const build = () =>
      deriveTypographies(
        screensOf(
          createComponent('label', { id: 'x', name: 'a', props: { fontResource: 'ui_font_noto', fontSize: 24 } }),
          createComponent('label', { id: 'y', name: 'b', props: { fontResource: 'ui_font_noto', fontSize: 16 } }),
        ),
      );
    expect(build().typographies).toEqual(build().typographies);
  });
});
