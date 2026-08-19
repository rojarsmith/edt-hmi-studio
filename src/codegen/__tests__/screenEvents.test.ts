// A screen reacts to its own lifecycle, which is how an entry animation is
// expressed without writing code: "when this screen has finished loading, play
// that animation".

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { generateEventsSource } from '../templates/ui_events.c';
import { generateEventsHeader } from '../templates/ui_events.h';
import { defaultOptions, createScreen, createComponent, animatedComponent, createEvent } from './helpers';
import type { Animation, EventBinding, Screen } from '../../types';

function playOnLoad(animationId: string, id = `play-${animationId}`): EventBinding {
  return {
    id,
    eventType: 'LV_EVENT_SCREEN_LOADED',
    handlerType: 'builtin',
    action: { type: 'playAnimation', animationId },
  };
}

const sourceFor = (screens: Screen[], animations: Animation[]) =>
  generateUiSource(
    screens, defaultOptions(), undefined, [], undefined, undefined, [],
    undefined, undefined, undefined, [], [], animations,
  );

/** A label with two animations aimed at it, neither bound yet. */
function build() {
  return animatedComponent(
    'label',
    { id: 'title', name: 'Title' },
    { id: 'a1', name: 'Slide_In_1', property: 'x', startValue: -110, endValue: 0 },
    { id: 'a2', name: 'Pulse_1', property: 'opa', startValue: 128, endValue: 255 },
  );
}

describe('screen events', () => {
  it('runs an entry animation from the screen\'s own handler', () => {
    const { component, animations } = build();
    const screens = [createScreen({
      name: 'main',
      components: [component],
      events: [playOnLoad('a1')],
    })];

    const events = generateEventsSource(screens, defaultOptions(), [], [], animations);
    const source = sourceFor(screens, animations);

    expect(events).toContain('void ui_event_screen_main_screen_loaded(lv_event_t *e) {');
    expect(events).toContain('ui_anim_slide_in_1_start();');
    expect(source).toContain(
      'lv_obj_add_event_cb(ui_screen_main, ui_event_screen_main_screen_loaded, LV_EVENT_SCREEN_LOADED, NULL);',
    );
  });

  it('leaves an unbound animation alone, so one can be kept for a button', () => {
    const { component, animations } = build();
    const screens = [createScreen({
      name: 'main',
      components: [component],
      events: [playOnLoad('a1')],
    })];

    const events = generateEventsSource(screens, defaultOptions(), [], [], animations);

    // Both functions exist; only the bound one is played on load.
    expect(sourceFor(screens, animations)).toContain('void ui_anim_pulse_1_start(void) {');
    expect(events).not.toContain('ui_anim_pulse_1_start();');
  });

  it('parks only the widgets its entry animations drive', () => {
    const { component, animations } = build();
    const screens = [createScreen({
      name: 'main',
      components: [component],
      events: [playOnLoad('a1')],
    })];

    const source = sourceFor(screens, animations);
    const reset = source.slice(source.indexOf('static void ui_screen_main_reset_anims'));

    // Slide_In_1 is parked at its start; Pulse_1 is not, because a button owns
    // it and the screen must not move it.
    expect(reset).toContain('lv_obj_set_x(ui_title, -110);');
    expect(reset.slice(0, reset.indexOf('}'))).not.toContain('ui_anim_set_opa');
    expect(source).toContain(
      'lv_obj_add_event_cb(ui_screen_main, ui_screen_main_reset_anims, LV_EVENT_SCREEN_LOAD_START, NULL);',
    );
  });

  it('parks nothing when the screen plays nothing on load', () => {
    const { component, animations } = build();
    const screens = [createScreen({ name: 'main', components: [component], events: [] })];

    expect(sourceFor(screens, animations)).not.toContain('reset_anims');
  });

  it('runs several bindings of one type from a single handler', () => {
    // Two functions of the same name would not compile, and a screen playing
    // three entry animations has exactly that shape.
    const { component, animations } = build();
    const screens = [createScreen({
      name: 'main',
      components: [component],
      events: [playOnLoad('a1'), playOnLoad('a2')],
    })];

    const events = generateEventsSource(screens, defaultOptions(), [], [], animations);

    expect(events.split('void ui_event_screen_main_screen_loaded')).toHaveLength(2);
    const handler = events.slice(events.indexOf('void ui_event_screen_main_screen_loaded'));
    expect(handler).toContain('ui_anim_slide_in_1_start();');
    expect(handler).toContain('ui_anim_pulse_1_start();');
  });

  it('declares the screen handler in the header', () => {
    const screens = [createScreen({ name: 'main', components: [], events: [playOnLoad('a1')] })];

    expect(generateEventsHeader(screens, defaultOptions()))
      .toContain('void ui_event_screen_main_screen_loaded(lv_event_t *e);');
  });

  it('groups a widget\'s repeated event type into one handler too', () => {
    const button = createComponent('btn', {
      name: 'Go',
      events: [
        createEvent({ id: 'e1', eventType: 'LV_EVENT_CLICKED', handlerType: 'builtin', action: { type: 'show', targetComponent: 'Title' } }),
        createEvent({ id: 'e2', eventType: 'LV_EVENT_CLICKED', handlerType: 'builtin', action: { type: 'hide', targetComponent: 'Other' } }),
      ],
    });
    const screens = [createScreen({ name: 'main', components: [button] })];

    const events = generateEventsSource(screens, defaultOptions());
    const source = generateUiSource(screens, defaultOptions());

    expect(events.split('void ui_event_go_clicked')).toHaveLength(2);
    // Registering once per binding would run the pair twice over.
    expect(source.split('lv_obj_add_event_cb(ui_go, ui_event_go_clicked')).toHaveLength(2);
  });

  it('reacts to the other screen lifecycle events too', () => {
    const screens = [createScreen({
      name: 'main',
      components: [],
      events: [{
        id: 'e1',
        eventType: 'LV_EVENT_SCREEN_UNLOAD_START',
        handlerType: 'builtin',
        action: { type: 'navigate', targetScreen: 'main' },
      }],
    })];

    const source = generateUiSource(screens, defaultOptions());

    expect(source).toContain(
      'lv_obj_add_event_cb(ui_screen_main, ui_event_screen_main_screen_unload_start, LV_EVENT_SCREEN_UNLOAD_START, NULL);',
    );
  });
});
