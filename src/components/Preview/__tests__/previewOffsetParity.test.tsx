// The preview and the firmware have to put the widget in the same place.
//
// They did not: the canvas drew an x animation as a shift from where the
// component sits, while the generator wrote the value straight into
// lv_obj_set_x. A slide-in on a widget placed anywhere but x: 0 therefore
// looked right in the preview and landed somewhere else on the board.

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../../../codegen/templates/ui.c';
import type { Animation, EventBinding, LvglComponent, Screen } from '../../../types';
import { animationTracks } from '../../../utils/animationTracks';
import { trackPreviewValues } from '../../../utils/animationValues';

/** Parked off the left edge — where a slide-in sets off. */
const placed: Pick<LvglComponent, 'x' | 'y'> = { x: -100, y: 25 };

function animation(overrides: Partial<Animation> = {}): Animation {
  return {
    id: 'a1',
    name: 'Slide_In_1',
    targetComponentId: 'title',
    type: 'slide_left',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    property: 'x',
    startValue: 0,
    endValue: 0,
    ...overrides,
  };
}

function component(): LvglComponent {
  return {
    id: 'title',
    type: 'label',
    name: 'Title',
    x: placed.x,
    y: placed.y,
    width: 80,
    height: 20,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  };
}

const playOnLoad: EventBinding = {
  id: 'e1',
  eventType: 'LV_EVENT_SCREEN_LOADED',
  handlerType: 'builtin',
  action: { type: 'playAnimation', animationId: 'a1' },
};

function generate(anim: Animation): string {
  const screens: Screen[] = [{
    id: 's1', name: 'main', components: [component()], events: [playOnLoad],
  }];
  return generateUiSource(
    screens, { lvglVersion: '9', generateComments: false } as never,
    undefined, [], undefined, undefined, [], undefined, undefined, undefined, [], [], [anim],
  );
}

describe('preview and firmware agree on position', () => {
  it('both set off from where the component was parked', () => {
    const travelling = animation({ valueMode: 'offset', distance: 100 });

    const preview = trackPreviewValues(animationTracks(travelling)[0], placed);
    const source = generate(travelling);

    // The firmware restores that same place before replaying the entry, then
    // travels the distance from it — which is the journey the canvas draws.
    expect(source).toContain(`lv_obj_set_x(ui_title, ${preview.startValue});`);
    expect(source).toContain('lv_anim_set_values(&anim, from_x, from_x + (100));');
    expect(preview).toEqual({ startValue: -100, endValue: 0 });
  });

  it('both take an absolute animation literally', () => {
    const fixed = animation({ valueMode: 'absolute', startValue: -110, endValue: 0 });

    const preview = trackPreviewValues(animationTracks(fixed)[0], placed);
    const source = generate(fixed);

    expect(source).toContain('lv_anim_set_values(&anim, -110, 0);');
    expect(source).toContain(`lv_obj_set_x(ui_title, ${preview.startValue});`);
    expect(preview).toEqual({ startValue: -110, endValue: 0 });
  });
});
