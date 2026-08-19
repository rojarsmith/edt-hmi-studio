// Animation names identify the generated C function, so they are unique across
// the project rather than within one component.

import { describe, it, expect } from 'vitest';
import type { Animation, LvglComponent, Screen } from '../../types';
import {
  animationNameBase,
  isAnimationNameTaken,
  nextAnimationName,
  projectAnimations,
} from '../animationNames';

function anim(name: string, id = name): Animation {
  return {
    id,
    name,
    targetComponentId: 'c1',
    type: 'fade_in',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    property: 'opa',
    startValue: 0,
    endValue: 255,
  };
}

function component(name: string, animations: Animation[], children: LvglComponent[] = []): LvglComponent {
  return {
    id: name,
    type: 'btn',
    name,
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

describe('animation names', () => {
  it('derives a default base from the animation type', () => {
    expect(animationNameBase('fade_in')).toBe('Fade_In');
    expect(animationNameBase('slide_left')).toBe('Slide_Left');
    expect(animationNameBase('custom')).toBe('Custom');
  });

  it('collects animations from children and every screen', () => {
    const screens = [
      screen('s1', [component('a', [anim('Fade_In_1')], [component('a-child', [anim('Fade_In_2')])])]),
      screen('s2', [component('b', [anim('Slide_Left_1')])]),
    ];

    expect(projectAnimations(screens).map(a => a.name)).toEqual([
      'Fade_In_1',
      'Fade_In_2',
      'Slide_Left_1',
    ]);
  });

  it('numbers from 1 and counts other screens, not just this component', () => {
    const screens = [
      screen('s1', [component('a', [anim('Fade_In_1')])]),
      screen('s2', [component('b', [anim('Fade_In_2')])]),
    ];

    expect(nextAnimationName(screens, 'Fade_In')).toBe('Fade_In_3');
    expect(nextAnimationName(screens, 'Slide_Left')).toBe('Slide_Left_1');
  });

  it('reuses a freed number before growing the count', () => {
    const screens = [
      screen('s1', [component('a', [anim('Fade_In_1'), anim('Fade_In_3')])]),
    ];

    expect(nextAnimationName(screens, 'Fade_In')).toBe('Fade_In_2');
  });

  it('ignores a name that only looks numbered', () => {
    const screens = [screen('s1', [component('a', [anim('Fade_In_first')])])];

    expect(nextAnimationName(screens, 'Fade_In')).toBe('Fade_In_1');
  });

  it('reports a clash with another animation but not with itself', () => {
    const screens = [
      screen('s1', [component('a', [anim('Fade_In_1', 'id-1')])]),
      screen('s2', [component('b', [anim('Slide_Left_1', 'id-2')])]),
    ];

    expect(isAnimationNameTaken(screens, 'Fade_In_1')).toBe(true);
    expect(isAnimationNameTaken(screens, 'Fade_In_1', 'id-1')).toBe(false);
    expect(isAnimationNameTaken(screens, 'Fade_In_1', 'id-2')).toBe(true);
    expect(isAnimationNameTaken(screens, 'Nothing_1')).toBe(false);
  });
});
