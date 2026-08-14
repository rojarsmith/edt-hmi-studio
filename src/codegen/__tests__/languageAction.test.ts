import { describe, it, expect } from 'vitest';
import { generateEventsSource } from '../templates/ui_events.c';
import { NEXT_LANGUAGE } from '../../types';
import type { ProjectLanguage, Screen } from '../../types';
import { createComponent, createEvent, createScreen, defaultOptions } from './helpers';

const LANGUAGES: ProjectLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
];

/** One button whose click switches the language. */
function screensWithSwitcher(language: string): Screen[] {
  return [
    createScreen({
      name: 'main',
      components: [
        createComponent('btn', {
          name: 'lang_btn',
          events: [
            createEvent({
              eventType: 'LV_EVENT_CLICKED',
              handlerType: 'builtin',
              action: { type: 'setLanguage', language },
            }),
          ],
        }),
      ],
    }),
  ];
}

describe('setLanguage action', () => {
  it('switches to the named language', () => {
    const result = generateEventsSource(screensWithSwitcher('zh-TW'), defaultOptions(), LANGUAGES);
    expect(result).toContain('lv_translation_set_language("zh-TW");');
  });

  it('names the language in the comment, not just the code', () => {
    const result = generateEventsSource(screensWithSwitcher('zh-TW'), defaultOptions(), LANGUAGES);
    expect(result).toContain('繁體中文');
  });

  it('emits nothing for a language the project no longer has', () => {
    // Binding survives deleting the language; generating the call would compile
    // and then resolve every tag to its fallback at runtime
    const result = generateEventsSource(screensWithSwitcher('ja'), defaultOptions(), LANGUAGES);
    expect(result).not.toContain('lv_translation_set_language');
  });

  it('emits nothing when the project has no languages at all', () => {
    const result = generateEventsSource(screensWithSwitcher('zh-TW'), defaultOptions(), []);
    expect(result).not.toContain('lv_translation_set_language');
  });

  it('leaves projects without the action untouched', () => {
    const screens = [
      createScreen({
        name: 'main',
        components: [
          createComponent('btn', {
            name: 'go_btn',
            events: [
              createEvent({
                handlerType: 'builtin',
                action: { type: 'navigate', targetScreen: 'main' },
              }),
            ],
          }),
        ],
      }),
    ];
    const result = generateEventsSource(screens, defaultOptions(), LANGUAGES);
    expect(result).not.toContain('lv_translation_set_language');
    expect(result).not.toContain('ui_events_next_language');
  });
});

describe('setLanguage cycling', () => {
  it('calls the helper rather than naming a language', () => {
    const result = generateEventsSource(screensWithSwitcher(NEXT_LANGUAGE), defaultOptions(), LANGUAGES);
    expect(result).toContain('ui_events_next_language();');
  });

  it('defines the helper once, above the handler that calls it', () => {
    const result = generateEventsSource(screensWithSwitcher(NEXT_LANGUAGE), defaultOptions(), LANGUAGES);
    const definition = result.indexOf('static void ui_events_next_language(void)');
    const call = result.indexOf('ui_events_next_language();');
    expect(definition).toBeGreaterThan(-1);
    expect(definition).toBeLessThan(call);
    expect(result.match(/static void ui_events_next_language\(void\)/g)).toHaveLength(1);
  });

  it('carries every language, in project order', () => {
    const result = generateEventsSource(screensWithSwitcher(NEXT_LANGUAGE), defaultOptions(), LANGUAGES);
    expect(result).toContain('static const char * const codes[] = {"en", "zh-TW"};');
  });

  it('wraps past the last language', () => {
    const result = generateEventsSource(screensWithSwitcher(NEXT_LANGUAGE), defaultOptions(), LANGUAGES);
    expect(result).toContain('lv_translation_set_language(codes[(index + 1U) % count]);');
  });

  it('starts from the first when nothing has selected a language yet', () => {
    const result = generateEventsSource(screensWithSwitcher(NEXT_LANGUAGE), defaultOptions(), LANGUAGES);
    expect(result).toContain('lv_translation_set_language(codes[0]);');
  });

  it('generates nothing to cycle through with one language', () => {
    // The button would compile and do nothing, which reads as a defect
    const result = generateEventsSource(
      screensWithSwitcher(NEXT_LANGUAGE),
      defaultOptions(),
      [{ code: 'en', name: 'English' }],
    );
    expect(result).not.toContain('ui_events_next_language');
  });

  it('defines the helper once for two buttons that both cycle', () => {
    const screens = [
      createScreen({
        name: 'main',
        components: [
          createComponent('btn', {
            name: 'lang_btn',
            events: [
              createEvent({ handlerType: 'builtin', action: { type: 'setLanguage', language: NEXT_LANGUAGE } }),
            ],
          }),
          createComponent('btn', {
            name: 'lang_btn2',
            events: [
              createEvent({ handlerType: 'builtin', action: { type: 'setLanguage', language: NEXT_LANGUAGE } }),
            ],
          }),
        ],
      }),
    ];
    const result = generateEventsSource(screens, defaultOptions(), LANGUAGES);
    expect(result.match(/static void ui_events_next_language\(void\)/g)).toHaveLength(1);
    expect(result.match(/ui_events_next_language\(\);/g)).toHaveLength(2);
  });
});
