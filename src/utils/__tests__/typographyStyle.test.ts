import { describe, it, expect } from 'vitest';
import {
  hasLanguageOverride,
  languageDifferences,
  languageStylesOf,
  overriddenLanguages,
  resolveTypographyStyle,
  tabbedLanguages,
} from '../typographyStyle';
import type { Typography } from '../../types';

const base: Typography = {
  id: 'ty1',
  name: 'Size24',
  fontResource: 'ui_font_rajdhani',
  fontSize: 24,
  letterSpace: 2,
  align: 'left',
};

describe('the Default applies where a language does not override', () => {
  it('returns the Default itself when no language is asked for', () => {
    expect(resolveTypographyStyle(base)).toMatchObject({
      fontResource: 'ui_font_rajdhani', fontSize: 24, letterSpace: 2, align: 'left',
    });
  });

  it('returns the Default for a language that overrides nothing', () => {
    expect(resolveTypographyStyle(base, 'en').fontResource).toBe('ui_font_rajdhani');
  });

  it('takes only what the language names, keeping the rest of the Default', () => {
    // The point of storing a difference rather than a copy: a CJK face without
    // restating spacing or alignment
    const typography: Typography = {
      ...base,
      languages: { 'zh-TW': { fontResource: 'ui_font_noto_sans_tc' } },
    };
    const resolved = resolveTypographyStyle(typography, 'zh-TW');
    expect(resolved.fontResource).toBe('ui_font_noto_sans_tc');
    expect(resolved.fontSize).toBe(24);
    expect(resolved.letterSpace).toBe(2);
    expect(resolved.align).toBe('left');
  });

  it('lets a language change more than the font', () => {
    const typography: Typography = {
      ...base,
      languages: { ja: { fontSize: 20, letterSpace: 0, baseDir: 'ltr' } },
    };
    expect(resolveTypographyStyle(typography, 'ja')).toMatchObject({
      fontResource: 'ui_font_rajdhani', fontSize: 20, letterSpace: 0, baseDir: 'ltr',
    });
  });

  it('carries an edit to the Default into every language that did not override it', () => {
    const typography: Typography = {
      ...base,
      fontSize: 32,
      languages: { 'zh-TW': { fontResource: 'ui_font_noto_sans_tc' }, ja: { fontSize: 20 } },
    };
    expect(resolveTypographyStyle(typography, 'zh-TW').fontSize).toBe(32);
    expect(resolveTypographyStyle(typography, 'ja').fontSize).toBe(20);
  });
});

describe('the pre-languages shape still loads', () => {
  const legacy: Typography = {
    ...base,
    languageFonts: { 'zh-TW': { fontResource: 'ui_font_noto_sans_tc', fontSize: 24 } },
  };

  it('reads languageFonts as an override of the same meaning', () => {
    expect(resolveTypographyStyle(legacy, 'zh-TW').fontResource).toBe('ui_font_noto_sans_tc');
    expect(languageStylesOf(legacy)['zh-TW']).toEqual({
      fontResource: 'ui_font_noto_sans_tc', fontSize: 24,
    });
  });

  it('prefers the current shape when a project carries both', () => {
    const both: Typography = { ...legacy, languages: { 'zh-TW': { fontSize: 18 } } };
    expect(resolveTypographyStyle(both, 'zh-TW').fontSize).toBe(18);
    expect(resolveTypographyStyle(both, 'zh-TW').fontResource).toBe('ui_font_rajdhani');
  });
});

describe('reporting what a language changes', () => {
  const typography: Typography = {
    ...base,
    languages: {
      'zh-TW': { fontResource: 'ui_font_noto_sans_tc' },
      en: {},
    },
  };

  it('names only the properties that differ', () => {
    expect(languageDifferences(typography, 'zh-TW')).toEqual(['fontResource']);
  });

  it('names none for a language with an empty entry', () => {
    expect(languageDifferences(typography, 'en')).toEqual([]);
    expect(hasLanguageOverride(typography, 'en')).toBe(false);
  });

  it('lists the languages that actually override something', () => {
    expect(overriddenLanguages(typography)).toEqual(['zh-TW']);
  });

  // Existing and differing are two facts: en has a tab (a just-added one is
  // an empty entry), but only zh-TW reaches the generator
  it('counts an empty entry as a tab but not as an override', () => {
    expect(tabbedLanguages(typography)).toEqual(['zh-TW', 'en']);
    expect(overriddenLanguages(typography)).toEqual(['zh-TW']);
  });

  it('has no tabs when nothing was ever customised', () => {
    expect(tabbedLanguages(base)).toEqual([]);
  });
});
