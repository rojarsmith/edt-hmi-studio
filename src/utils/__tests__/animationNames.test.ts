// Animation names identify the generated C function, so they are unique across
// the project rather than within one component.

import { describe, it, expect } from 'vitest';
import type { Animation } from '../../types';
import {
  animationNameBase,
  isAnimationNameTaken,
  nextAnimationName,
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

describe('animation names', () => {
  it('derives a default base from the animation type', () => {
    expect(animationNameBase('fade_in')).toBe('Fade_In');
    expect(animationNameBase('slide_left')).toBe('Slide_Left');
    expect(animationNameBase('custom')).toBe('Custom');
  });

  it('numbers from 1 across the whole project', () => {
    const animations = [anim('Fade_In_1'), anim('Fade_In_2')];

    expect(nextAnimationName(animations, 'Fade_In')).toBe('Fade_In_3');
    expect(nextAnimationName(animations, 'Slide_Left')).toBe('Slide_Left_1');
  });

  it('reuses a freed number before growing the count', () => {
    expect(nextAnimationName([anim('Fade_In_1'), anim('Fade_In_3')], 'Fade_In')).toBe('Fade_In_2');
  });

  it('ignores a name that only looks numbered', () => {
    expect(nextAnimationName([anim('Fade_In_first')], 'Fade_In')).toBe('Fade_In_1');
  });

  it('reports a clash with another animation but not with itself', () => {
    const animations = [anim('Fade_In_1', 'id-1'), anim('Slide_Left_1', 'id-2')];

    expect(isAnimationNameTaken(animations, 'Fade_In_1')).toBe(true);
    expect(isAnimationNameTaken(animations, 'Fade_In_1', 'id-1')).toBe(false);
    expect(isAnimationNameTaken(animations, 'Fade_In_1', 'id-2')).toBe(true);
    expect(isAnimationNameTaken(animations, 'Nothing_1')).toBe(false);
  });
});
