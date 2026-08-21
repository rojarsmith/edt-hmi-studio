import { describe, it, expect } from 'vitest';
import { componentsHaveVideo, screensHaveVideo } from '../videoWidgets';
import type { LvglComponent, Screen } from '../../types';

function component(
  type: string,
  children: LvglComponent[] = [],
): LvglComponent {
  return {
    id: `${type}-${children.length}-${Math.random()}`,
    type,
    name: type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    children,
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  };
}

function screen(components: LvglComponent[]): Screen {
  return { id: 'screen', name: 'main', components };
}

describe('finding the videos in a project', () => {
  it('says no for a project that has none', () => {
    expect(screensHaveVideo([screen([component('label'), component('btn')])]))
      .toBe(false);
  });

  it('says no for a project with no screens at all', () => {
    expect(screensHaveVideo([])).toBe(false);
  });

  it('finds one sitting on a screen', () => {
    expect(screensHaveVideo([screen([component('video')])])).toBe(true);
  });

  it('finds one nested inside a container', () => {
    const nested = component('obj', [component('obj', [component('video')])]);
    expect(componentsHaveVideo([nested])).toBe(true);
  });

  it('finds one on a screen that is not the first', () => {
    expect(
      screensHaveVideo([screen([component('label')]), screen([component('video')])]),
    ).toBe(true);
  });
});
