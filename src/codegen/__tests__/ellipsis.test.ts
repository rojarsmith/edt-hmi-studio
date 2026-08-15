import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { collectGlyphs } from '../collectGlyphs';
import type { ProjectLanguage, Screen, TextResource } from '../../types';
import { createComponent, createScreen, defaultOptions } from './helpers';

const LANGUAGES: ProjectLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
];
const TEXTS: TextResource[] = [
  { id: 't1', key: 'status', values: { en: 'Everything OK', 'zh-TW': '一切正常' } },
];

function screensWith(label: ReturnType<typeof createComponent>): Screen[] {
  return [createScreen({ name: 'main', components: [label] })];
}

const generate = (screens: Screen[], texts: TextResource[] = []) =>
  generateUiSource(
    screens, defaultOptions({ generateComments: false }),
    undefined, [], undefined, undefined, [], undefined, undefined,
    undefined, texts, texts.length > 0 ? LANGUAGES : [],
  );

describe('ellipsis long mode', () => {
  const tagged = () => createComponent('label', {
    name: 'status', props: { text: 'Everything OK', longMode: 'ellipsis' },
    textId: 't1', textProp: 'text',
  });
  const literal = () => createComponent('label', {
    name: 'status', props: { text: 'Everything OK', longMode: 'ellipsis' },
  });

  it('clips rather than using DOTS, whose three periods are hard-coded', () => {
    expect(generate(screensWith(literal()))).toContain(
      'lv_label_set_long_mode(ui_status, LV_LABEL_LONG_CLIP);',
    );
  });

  it('emits the truncation helper once, with the ellipsis as UTF-8 bytes', () => {
    const result = generate(screensWith(literal()));
    expect(result.match(/static void ui_ellipsis_apply/g)).toHaveLength(1);
    // Encoding-proof: the character never appears raw in the C
    expect(result).toContain('"\\xE2\\x80\\xA6"');
    expect(result).toContain('while(len > 0 && (((uint8_t)full[len]) & 0xC0) == 0x80) len--;');
  });

  it('applies at init and re-applies on resize, from the literal', () => {
    const result = generate(screensWith(literal()));
    expect(result).toContain('ui_ellipsis_apply(ui_status, "Everything OK");');
    expect(result).toContain(
      'lv_obj_add_event_cb(ui_status, ui_ellipsis_literal_cb, LV_EVENT_SIZE_CHANGED, (void *)"Everything OK");',
    );
  });

  it('owns the text of a linked label instead of tagging it', () => {
    // The label's own tag handling would restore the full text over the
    // truncation on every language switch
    const result = generate(screensWith(tagged()), TEXTS);
    expect(result).not.toContain('lv_label_set_translation_tag(ui_status');
    expect(result).toContain('ui_ellipsis_apply(ui_status, lv_tr("status"));');
    expect(result).toContain(
      'lv_obj_add_event_cb(ui_status, ui_ellipsis_tr_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, (void *)"status");',
    );
    expect(result).toContain(
      'lv_obj_add_event_cb(ui_status, ui_ellipsis_tr_cb, LV_EVENT_SIZE_CHANGED, (void *)"status");',
    );
  });

  it('keeps an ordinary label exactly as it was', () => {
    const plain = createComponent('label', { name: 'status', props: { text: 'Hi', longMode: 'dot' } });
    const result = generate(screensWith(plain));
    expect(result).toContain('lv_label_set_long_mode(ui_status, LV_LABEL_LONG_DOT);');
    expect(result).not.toContain('ui_ellipsis');
  });

  it('collects U+2026 into the label\'s font, or the truncation draws a box', () => {
    const comp = createComponent('label', {
      name: 'status',
      props: { text: 'Hi', longMode: 'ellipsis', fontResource: 'ui_font_latin', fontSize: 16 },
    });
    const sets = collectGlyphs({
      screens: screensWith(comp),
      fontResources: [{
        id: 'f1', name: 'Latin', family: 'L', style: 'R', sizes: [16], charsetMode: 'auto',
        charset: 'ascii', bpp: 4, data: '', cFontName: 'ui_font_latin', size: 1, createdAt: 1,
      }],
    });
    const set = [...sets.byFontSize.values()].find((entry) => entry.cFontName === 'ui_font_latin');
    expect(set?.codePoints.has(0x2026)).toBe(true);
  });
});
