// Animations moved out of the component they drove and became project-level
// assets. Opening an older project has to lift them out, and an animation whose
// target is gone has to be reported rather than repaired.

import { describe, it, expect } from 'vitest';
import type { Animation, LvglComponent, Screen } from '../../types';
import {
  animationLack,
  componentsById,
  hasNestedAnimations,
  hoistComponentAnimations,
  migrateScreenLoadAnimations,
  screenByComponentId,
} from '../animationAssets';

function anim(name: string, overrides: Partial<Animation> = {}): Animation {
  return {
    id: name,
    name,
    targetComponentId: '',
    type: 'fade_in',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    property: 'opa',
    startValue: 0,
    endValue: 255,
    ...overrides,
  };
}

function component(
  id: string,
  animations: Animation[] = [],
  children: LvglComponent[] = [],
): LvglComponent {
  return {
    id,
    type: 'btn',
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    children,
    props: {},
    styles: { default: {} },
    events: [],
    animations,
    parentId: null,
    locked: false,
    visible: true,
  };
}

function screen(name: string, components: LvglComponent[]): Screen {
  return { id: name, name, components };
}

describe('hoisting animations out of components', () => {
  it('lifts them from every depth and records where each was found', () => {
    const screens = [
      screen('s1', [component('a', [anim('Fade_In_1')], [component('a-child', [anim('Fade_In_2')])])]),
      screen('s2', [component('b', [anim('Slide_Left_1')])]),
    ];

    const { animations } = hoistComponentAnimations(screens);

    expect(animations.map(a => [a.name, a.targetComponentId])).toEqual([
      ['Fade_In_1', 'a'],
      ['Fade_In_2', 'a-child'],
      ['Slide_Left_1', 'b'],
    ]);
  });

  it('empties the nested lists so nothing reads them afterwards', () => {
    const screens = [screen('s1', [component('a', [anim('Fade_In_1')])])];

    const hoisted = hoistComponentAnimations(screens);

    expect(hasNestedAnimations(screens)).toBe(true);
    expect(hasNestedAnimations(hoisted.screens)).toBe(false);
  });

  it('overwrites a stale targetComponentId with where the animation actually sat', () => {
    // The nested position was the real record; the field was decorative.
    const screens = [screen('s1', [component('a', [anim('Fade_In_1', { targetComponentId: 'wrong' })])])];

    const { animations } = hoistComponentAnimations(screens);

    expect(animations[0].targetComponentId).toBe('a');
  });

  it('leaves a project with no animations alone', () => {
    const screens = [screen('s1', [component('a')])];

    expect(hoistComponentAnimations(screens).animations).toEqual([]);
  });
});

describe('migrating to screen-load bindings', () => {
  // Entry animations used to be implied: everything on a screen started once
  // that screen appeared. They are bindings now, so an older project has to be
  // handed the ones that reproduce exactly what it used to do.
  const withAnimations = () => [
    screen('s1', [component('a'), component('b')]),
    screen('s2', [component('c')]),
  ];
  const animations = [
    anim('Fade_In_1', { targetComponentId: 'a' }),
    anim('Slide_Left_1', { targetComponentId: 'b' }),
    anim('Zoom_In_1', { targetComponentId: 'c' }),
  ];
  let counter = 0;
  const newId = () => `e${(counter += 1)}`;

  it('gives each screen a load binding per animation aimed at it', () => {
    counter = 0;
    const migrated = migrateScreenLoadAnimations(withAnimations(), animations, newId);

    expect(migrated[0].events?.map(e => e.action?.animationId)).toEqual(['Fade_In_1', 'Slide_Left_1']);
    expect(migrated[1].events?.map(e => e.action?.animationId)).toEqual(['Zoom_In_1']);
    expect(migrated[0].events?.every(e => e.eventType === 'LV_EVENT_SCREEN_LOADED')).toBe(true);
  });

  it('gives a screen with no animations an empty list, not nothing', () => {
    counter = 0;
    // An empty array is what marks the project as migrated; leaving it
    // undefined would migrate it again on the next open.
    const migrated = migrateScreenLoadAnimations([screen('s1', [component('a')])], [], newId);

    expect(migrated[0].events).toEqual([]);
  });

  it('leaves a project that already carries screen events alone', () => {
    counter = 0;
    const screens = withAnimations();
    screens[0] = { ...screens[0], events: [] };

    const migrated = migrateScreenLoadAnimations(screens, animations, newId);

    // The user removing every binding must not have them handed back.
    expect(migrated[0].events).toEqual([]);
    expect(migrated[1].events).toBeUndefined();
  });

  it('ignores an animation whose target is on no screen', () => {
    counter = 0;
    const orphan = [anim('Orphan_1', { targetComponentId: 'deleted' })];

    const migrated = migrateScreenLoadAnimations(withAnimations(), orphan, newId);

    expect(migrated.every(s => s.events?.length === 0)).toBe(true);
  });
});

describe('resolving an animation target', () => {
  const screens = [screen('s1', [component('a', [], [component('a-child')])])];

  it('indexes components and their screens at every depth', () => {
    expect([...componentsById(screens).keys()]).toEqual(['a', 'a-child']);
    expect(screenByComponentId(screens).get('a-child')?.name).toBe('s1');
  });

  it('reports a target that was never picked', () => {
    expect(animationLack(anim('Fade_In_1'), componentsById(screens)))
      .toBe('No target component');
  });

  it('reports a target that has since been deleted', () => {
    const orphan = anim('Fade_In_1', { targetComponentId: 'deleted' });

    expect(animationLack(orphan, componentsById(screens)))
      .toBe('Target component no longer exists');
  });

  it('reports nothing when the target is there', () => {
    const bound = anim('Fade_In_1', { targetComponentId: 'a-child' });

    expect(animationLack(bound, componentsById(screens))).toBeNull();
  });
});
