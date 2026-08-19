// The preview and the firmware have to put the widget in the same place.
//
// They did not: the canvas drew an x animation as a shift from where the
// component sits, while the generator wrote the value straight into
// lv_obj_set_x. A slide-in on a widget placed anywhere but x: 0 therefore
// looked right in the preview and landed somewhere else on the board. Both now
// resolve through the same helper.

import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../../../codegen/templates/ui.c';
import type { Animation, LvglComponent, Screen } from '../../../types';
import { resolvedAnimationValues } from '../../../utils/animationValues';

const placed: Pick<LvglComponent, 'x' | 'y'> = { x: 40, y: 25 };

function slideIn(overrides: Partial<Animation> = {}): Animation {
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
    startValue: -110,
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

/** The x the firmware would set at the animation's first and last frame. */
function firmwareValues(animation: Animation): [number, number] {
  const screens: Screen[] = [{ id: 's1', name: 'main', components: [component()] }];
  const source = generateUiSource(
    screens, { lvglVersion: '9', generateComments: false } as never,
    undefined, [], undefined, undefined, [], undefined, undefined, undefined, [], [], [animation],
  );
  const match = source.match(/lv_anim_set_values\(&anim, (-?\d+), (-?\d+)\);/)!;
  return [Number(match[1]), Number(match[2])];
}

describe('preview and firmware agree on position', () => {
  it('both end the slide where the component was designed', () => {
    const animation = slideIn();

    const preview = resolvedAnimationValues(animation, placed);

    expect(firmwareValues(animation)).toEqual([preview.startValue, preview.endValue]);
    // And that place is where the designer put it.
    expect(preview.endValue).toBe(placed.x);
  });

  it('both take an absolute animation literally', () => {
    const animation = slideIn({ valueMode: 'absolute' });

    const preview = resolvedAnimationValues(animation, placed);

    expect(firmwareValues(animation)).toEqual([preview.startValue, preview.endValue]);
    expect(preview.endValue).toBe(0);
  });
});
