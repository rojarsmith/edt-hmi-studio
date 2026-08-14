import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { defaultOptions, createComponent, createScreen } from './helpers';
import type { LvglComponent, TextResource, ProjectLanguage } from '../../types';

const LANGUAGES: ProjectLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
];

const TEXTS: TextResource[] = [
  { id: 't1', key: 'greeting', values: { en: 'Hello', 'zh-TW': '你好' } },
  { id: 't2', key: 'ok', values: { en: 'OK', 'zh-TW': '確定' } },
];

function generate(
  components: LvglComponent[],
  texts: TextResource[] = TEXTS,
  languages: ProjectLanguage[] = LANGUAGES,
) {
  return generateUiSource(
    [createScreen({ name: 'main', components })],
    defaultOptions({ generateComments: false }),
    undefined, [], undefined, undefined, [], undefined, undefined, undefined,
    texts, languages,
  );
}

describe('translation table', () => {
  it('emits the language and tag arrays, NULL-terminated as LVGL scans for', () => {
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' }, textId: 't1' })]);
    expect(result).toContain('static const char * const ui_languages[] = {"en", "zh-TW", NULL};');
    expect(result).toContain('static const char * const ui_text_tags[] = {"greeting", "ok", NULL};');
  });

  /**
   * The layout LVGL actually indexes is translation_p[language_cnt * tag + lang]
   * — one row per tag. lv_translation.h documents the opposite, and following
   * its example would mistranslate everything past the first language while
   * still producing strings that look plausible.
   */
  it('lays translations out one row per tag, not one row per language', () => {
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' }, textId: 't1' })]);
    const body = result.slice(result.indexOf('ui_translations[] = {'));
    const rows = body.slice(0, body.indexOf('};')).split('\n').slice(1).map((l) => l.trim()).filter(Boolean);

    expect(rows[0]).toBe('"Hello", "你好",');
    expect(rows[1]).toBe('"OK", "確定",');
  });

  it('registers the pack and picks the first language', () => {
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' }, textId: 't1' })]);
    expect(result).toContain('lv_translation_add_static(ui_languages, ui_text_tags, ui_translations);');
    expect(result).toContain('lv_translation_set_language("en");');
  });

  /**
   * lv_label_set_translation_tag resolves the tag immediately, so a label
   * created before the pack is registered would display its tag as its text.
   */
  it('registers translations before any screen is initialised', () => {
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' }, textId: 't1' })]);
    const initCall = result.indexOf('ui_translation_init();');
    const screenInit = result.indexOf('ui_screen_main_init();');
    expect(initCall).toBeGreaterThan(-1);
    expect(screenInit).toBeGreaterThan(-1);
    expect(initCall).toBeLessThan(screenInit);
  });

  it('fills a missing translation from the first language that has one', () => {
    const partial: TextResource[] = [{ id: 't1', key: 'greeting', values: { en: 'Hello' } }];
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' }, textId: 't1' })], partial);
    // Rather than a hole in the array, which would be a null deref at runtime
    expect(result).toContain('"Hello", "Hello",');
  });

  it('emits nothing at all when the project has no text resources', () => {
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' } })], [], []);
    expect(result).not.toContain('ui_translations');
    expect(result).not.toContain('ui_translation_init');
    // and the literal path is untouched
    expect(result).toContain('lv_label_set_text(ui_l, "Hello");');
  });
});

describe('widgets carrying a tag', () => {
  it('gives a label its tag instead of a literal', () => {
    const result = generate([createComponent('label', { name: 'title', props: { text: 'Hello' }, textId: 't1' })]);
    expect(result).toContain('lv_label_set_translation_tag(ui_title, "greeting");');
    expect(result).not.toContain('lv_label_set_text(ui_title,');
  });

  it('gives a button\'s caption a tag, since that caption is a real label', () => {
    const result = generate([createComponent('btn', { name: 'go', props: { text: 'OK' }, textId: 't2' })]);
    expect(result).toContain('lv_label_set_translation_tag(ui_go_label, "ok");');
    expect(result).not.toContain('lv_label_set_text(ui_go_label,');
  });

  it('still creates the caption label for a button whose text is only a tag', () => {
    const button = createComponent('btn', { name: 'go', props: {}, textId: 't2' });
    const result = generate([button]);
    expect(result).toContain('lv_obj_t *ui_go_label = lv_label_create(ui_go);');
    expect(result).toContain('lv_label_set_translation_tag(ui_go_label, "ok");');
  });

  it('leaves a widget with no textId on its literal', () => {
    const result = generate([createComponent('label', { name: 'plain', props: { text: 'Untranslated' } })]);
    expect(result).toContain('lv_label_set_text(ui_plain, "Untranslated");');
  });

  /**
   * lv_label is the only widget LVGL re-applies a tag for. Anything whose text
   * is not a label needs a callback, or it stays frozen in the language it was
   * built with — visibly wrong only after a switch, which is easy to miss.
   */
  it('gives a checkbox a callback, since its caption is not a label', () => {
    const result = generate([createComponent('checkbox', { name: 'agree', props: { text: 'I agree' }, textId: 't1' })]);
    expect(result).toContain('lv_checkbox_set_text(ui_agree, lv_tr("greeting"));');
    expect(result).toContain('lv_obj_add_event_cb(ui_agree, ui_tr_checkbox_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, (void *)"greeting");');
    expect(result).toContain('static void ui_tr_checkbox_cb(lv_event_t * e) {');
  });

  it('gives a textarea placeholder a callback', () => {
    const result = generate([createComponent('textarea', { name: 'notes', props: { placeholder: 'Notes' }, textId: 't1' })]);
    expect(result).toContain('lv_textarea_set_placeholder_text(ui_notes, lv_tr("greeting"));');
    expect(result).toContain('ui_tr_textarea_placeholder_cb');
  });

  it('emits only the callbacks something actually uses', () => {
    const result = generate([createComponent('checkbox', { name: 'agree', props: { text: 'I agree' }, textId: 't1' })]);
    expect(result).toContain('ui_tr_checkbox_cb');
    expect(result).not.toContain('ui_tr_textarea_cb');
    expect(result).not.toContain('ui_tr_textarea_placeholder_cb');
  });

  it('emits no callbacks at all when only labels carry tags', () => {
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' }, textId: 't1' })]);
    expect(result).not.toContain('ui_tr_');
  });

  /** lv_win_add_title returns a real label, so the native path works. */
  it('keeps a window title\'s label and tags it rather than adding a callback', () => {
    const result = generate([createComponent('win', { name: 'dlg', props: { title: 'Settings' }, textId: 't1' })]);
    expect(result).toContain('lv_obj_t *ui_dlg_title = lv_win_add_title(ui_dlg, "");');
    expect(result).toContain('lv_label_set_translation_tag(ui_dlg_title, "greeting");');
    expect(result).not.toContain('ui_tr_');
  });

  /**
   * The recorded prop, not the current props, decides which setter the tag
   * drives. Without it, a shared-placeholder textarea that gains typed content
   * would silently rebind its translation onto the content.
   */
  it('keeps a shared placeholder on the placeholder even when content exists', () => {
    const textarea = createComponent('textarea', {
      name: 'notes',
      props: { text: 'typed by the user', placeholder: 'Notes' },
      textId: 't1',
      textProp: 'placeholder',
    });
    const result = generate([textarea]);
    expect(result).toContain('lv_textarea_set_placeholder_text(ui_notes, lv_tr("greeting"));');
    // The typed content stays a literal
    expect(result).toContain('lv_textarea_set_text(ui_notes, "typed by the user");');
    expect(result).not.toContain('lv_textarea_set_text(ui_notes, lv_tr');
  });

  it('infers the prop for data written before textProp existed', () => {
    // No textProp on the widget — the legacy inference must still tag the
    // placeholder, matching what the derivation saw when it linked it
    const textarea = createComponent('textarea', { name: 'notes', props: { placeholder: 'Notes' }, textId: 't1' });
    const result = generate([textarea]);
    expect(result).toContain('lv_textarea_set_placeholder_text(ui_notes, lv_tr("greeting"));');
  });

  it('drives dropdown options from the tag, and restores the selection', () => {
    const dropdown = createComponent('dropdown', {
      name: 'mode',
      props: { options: ['Low', 'High'], selected: 1 },
      textId: 't1',
      textProp: 'options',
    });
    const result = generate([dropdown]);
    expect(result).toContain('lv_dropdown_set_options(ui_mode, lv_tr("greeting"));');
    expect(result).toContain('lv_obj_add_event_cb(ui_mode, ui_tr_dropdown_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, (void *)"greeting");');
    // lv_dropdown_set_options resets the selection to 0, so the callback must
    // save and restore it or a language switch yanks the user's choice
    expect(result).toContain('uint32_t selected = lv_dropdown_get_selected(obj);');
    expect(result).toContain('lv_dropdown_set_selected(obj, selected);');
  });

  it('keeps a dropdown without a tag on its literal options', () => {
    const dropdown = createComponent('dropdown', { name: 'mode', props: { options: ['Low', 'High'] } });
    const result = generate([dropdown]);
    expect(result).toContain('lv_dropdown_set_options(ui_mode, "Low\\nHigh");');
    expect(result).not.toContain('ui_tr_dropdown_cb');
  });

  describe('per-language typography fonts', () => {
    const typography = {
      id: 'typo1', name: 'Heading', fontResource: 'ui_font_rajdhani', fontSize: 32,
      languageFonts: { 'zh-TW': { fontResource: 'ui_font_noto', fontSize: 32 } },
    };

    const generateWithTypography = () =>
      generateUiSource(
        [createScreen({ name: 'main', components: [
          createComponent('label', { name: 'title', props: { text: 'Hello' }, textId: 't1', typographyId: 'typo1' }),
        ] })],
        defaultOptions({ generateComments: false }),
        undefined, [], undefined, undefined, [], undefined, undefined,
        [typography], TEXTS, LANGUAGES,
      );

    it('swaps the style font by language and reports the change', () => {
      const result = generateWithTypography();
      expect(result).toContain('if(lv_streq(lang, "zh-TW")) lv_style_set_text_font(&ui_style_heading, &ui_font_noto_32);');
      expect(result).toContain('else lv_style_set_text_font(&ui_style_heading, &ui_font_rajdhani_32);');
      // Without the report, objects using the style keep drawing the old font
      expect(result).toContain('lv_obj_report_style_change(&ui_style_heading);');
    });

    it('applies the boot language\'s override from init, not from the first switch', () => {
      const result = generateWithTypography();
      const initBody = result.slice(result.indexOf('static void ui_typography_init'));
      expect(initBody.slice(0, initBody.indexOf('}'))).toContain('ui_typography_apply_language_fonts();');
    });

    it('listens on one screen, which the full-tree walk guarantees is enough', () => {
      const result = generateWithTypography();
      expect(result).toContain('lv_obj_add_event_cb(ui_screen_main, ui_typography_language_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, NULL);');
    });

    it('emits none of it for typographies without overrides', () => {
      const result = generate([
        createComponent('label', { name: 'title', props: { text: 'Hello' }, textId: 't1' }),
      ]);
      expect(result).not.toContain('apply_language_fonts');
      expect(result).not.toContain('ui_typography_language_cb');
    });
  });

  /** void* converts implicitly in C but not in C++, and generated UI is sometimes built as C++. */
  it('casts the tag out of user data explicitly', () => {
    const result = generate([createComponent('checkbox', { name: 'agree', props: { text: 'x' }, textId: 't1' })]);
    expect(result).toContain('lv_tr((const char *)lv_event_get_user_data(e))');
  });

  it('ignores a textId pointing at a resource that no longer exists', () => {
    const result = generate([createComponent('label', { name: 'l', props: { text: 'Hello' }, textId: 'gone' })]);
    expect(result).not.toContain('lv_label_set_translation_tag(ui_l');
    expect(result).toContain('lv_label_set_text(ui_l, "Hello");');
  });
});
