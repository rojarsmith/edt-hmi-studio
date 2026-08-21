import { describe, it, expect } from 'vitest';
import type { LvglComponent, Screen } from '../../types';
import { rotateBox, rotateScreens } from '../rotateLayout';

function component(
  id: string,
  box: { x: number; y: number; width: number; height: number },
  children: LvglComponent[] = [],
): LvglComponent {
  return {
    id,
    type: 'btn',
    name: id,
    ...box,
    children,
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  } as LvglComponent;
}

describe('rotateBox', () => {
  it('sends the top-left corner of a landscape canvas to the top-right of a portrait one', () => {
    // 480x272 -> 272x480. A 100x40 box in the corner lands against the right
    // edge: 272 - 0 - 40 = 232, and 232 + 40 is exactly the new width.
    expect(rotateBox({ x: 0, y: 0, width: 100, height: 40 }, 480, 272, 'cw'))
      .toEqual({ x: 232, y: 0, width: 40, height: 100 });
  });

  it('is the inverse of itself in the other direction', () => {
    const box = { x: 37, y: 91, width: 120, height: 44 };
    const there = rotateBox(box, 480, 272, 'cw');
    // The frame is transposed for the return trip, as the canvas itself is.
    expect(rotateBox(there, 272, 480, 'ccw')).toEqual(box);
  });

  it('keeps a box inside the frame it was inside', () => {
    // Flush against the bottom-right of 480x272.
    const turned = rotateBox({ x: 380, y: 232, width: 100, height: 40 }, 480, 272, 'cw');
    expect(turned.x).toBeGreaterThanOrEqual(0);
    expect(turned.y).toBeGreaterThanOrEqual(0);
    expect(turned.x + turned.width).toBeLessThanOrEqual(272);
    expect(turned.y + turned.height).toBeLessThanOrEqual(480);
  });

  it('swaps width and height whichever way it turns', () => {
    expect(rotateBox({ x: 10, y: 20, width: 80, height: 30 }, 480, 272, 'cw'))
      .toMatchObject({ width: 30, height: 80 });
    expect(rotateBox({ x: 10, y: 20, width: 80, height: 30 }, 480, 272, 'ccw'))
      .toMatchObject({ width: 30, height: 80 });
  });
});

describe('rotateScreens', () => {
  const screens: Screen[] = [{
    id: 's1',
    name: 'Screen 1',
    components: [
      component('parent', { x: 40, y: 20, width: 200, height: 100 }, [
        // Relative to the parent, and so turned inside the parent's 200x100.
        component('child', { x: 10, y: 10, width: 60, height: 20 }),
      ]),
    ],
  } as Screen];

  it('turns a child inside its parent, not inside the canvas', () => {
    const [screen] = rotateScreens(screens, 480, 272, 'cw');
    const parent = screen.components[0];
    const child = parent.children[0];

    // Parent: 272 - 20 - 100 = 152, and the box transposes.
    expect(parent).toMatchObject({ x: 152, y: 40, width: 100, height: 200 });
    // Child inside the parent's *old* 200x100: 100 - 10 - 20 = 70.
    expect(child).toMatchObject({ x: 70, y: 10, width: 20, height: 60 });
    // And it is still inside the parent it belongs to.
    expect(child.x + child.width).toBeLessThanOrEqual(parent.width);
    expect(child.y + child.height).toBeLessThanOrEqual(parent.height);
  });

  it('round-trips a whole tree', () => {
    const there = rotateScreens(screens, 480, 272, 'cw');
    const back = rotateScreens(there, 272, 480, 'ccw');

    expect(back[0].components[0]).toMatchObject({ x: 40, y: 20, width: 200, height: 100 });
    expect(back[0].components[0].children[0])
      .toMatchObject({ x: 10, y: 10, width: 60, height: 20 });
  });

  it('drops alignment, which would otherwise move the widget a second time', () => {
    const aligned: Screen[] = [{
      ...screens[0],
      components: [{
        ...component('a', { x: 10, y: 10, width: 50, height: 50 }),
        align: 'center',
        alignOffsetX: 5,
        alignOffsetY: 5,
      } as LvglComponent],
    } as Screen];

    const [screen] = rotateScreens(aligned, 480, 272, 'cw');
    expect(screen.components[0].align).toBeUndefined();
    expect(screen.components[0].alignOffsetX).toBeUndefined();
    expect(screen.components[0].alignOffsetY).toBeUndefined();
  });

  it('leaves everything that is not geometry alone', () => {
    const [screen] = rotateScreens(screens, 480, 272, 'cw');
    expect(screen.id).toBe('s1');
    expect(screen.name).toBe('Screen 1');
    expect(screen.components[0].id).toBe('parent');
    expect(screen.components[0].type).toBe('btn');
  });
});
