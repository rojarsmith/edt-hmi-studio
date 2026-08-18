import { describe, it, expect } from 'vitest';
import { MIN_FLEXIBLE_HEIGHT, registerDockedPanel, startDockedPanelDrag } from '../panelResize';

interface Section {
  /** 0 for a docked panel, 1 for the column's flexible section. */
  flexGrow: number;
  height: number;
  minHeight?: number;
  /** Collapsed panels hold no height of their own, so nothing moves them. */
  collapsed?: boolean;
}

/**
 * jsdom lays nothing out, so the column is built by hand: sections of a stated
 * height, each docked one registered the way the panels register themselves.
 */
function buildColumn(sections: Section[]) {
  const column = document.createElement('div');
  column.className = 'left-panel';
  const heights = sections.map(section => section.height);

  sections.forEach((section, index) => {
    const panel = document.createElement('div');
    panel.style.flexGrow = String(section.flexGrow);
    panel.getBoundingClientRect = () => ({ height: heights[index] }) as DOMRect;
    column.appendChild(panel);

    if (section.flexGrow === 0) {
      registerDockedPanel(panel, {
        canDonate: () => !section.collapsed,
        height: () => heights[index],
        minHeight: () => section.minHeight ?? 120,
        resize: height => {
          heights[index] = height;
        },
      });
    }
  });

  document.body.appendChild(column);
  return { column, heights };
}

/** Palette, hierarchy, screens, animations - the design tab's left column. */
function leftColumn() {
  return buildColumn([
    { flexGrow: 1, height: 200 },
    { flexGrow: 0, height: 180 },
    { flexGrow: 0, height: 180 },
    { flexGrow: 0, height: 140 },
  ]);
}

describe('dragging a panel edge up', () => {
  it('takes the height off the section directly above first', () => {
    const { column, heights } = leftColumn();
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    expect(drag.moveEdge(40)).toBe(220);
    expect(heights[1]).toBe(140); // hierarchy gave the 40
    expect(heights[0]).toBe(200); // palette untouched
  });

  it('carries on into the section above that one', () => {
    const { column, heights } = leftColumn();
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    // The hierarchy has 60 to give, so the palette covers the remaining 30.
    expect(drag.moveEdge(90)).toBe(270);
    expect(heights[1]).toBe(120);
  });

  it('stops with the flexible section down to its own minimum', () => {
    const { column, heights } = leftColumn();
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    expect(drag.roomAbove).toBe(200 - MIN_FLEXIBLE_HEIGHT + (180 - 120));
    expect(drag.moveEdge(5000)).toBe(180 + drag.roomAbove);
    expect(heights[1]).toBe(120);
  });

  it('leaves collapsed sections above alone', () => {
    const { column, heights } = buildColumn([
      { flexGrow: 1, height: 200 },
      { flexGrow: 0, height: 40, collapsed: true },
      { flexGrow: 0, height: 180 },
    ]);
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    expect(drag.roomAbove).toBe(200 - MIN_FLEXIBLE_HEIGHT);
    drag.moveEdge(5000);
    expect(heights[1]).toBe(40);
  });
});

describe('dragging a panel edge down', () => {
  it('hands the height to the section directly above', () => {
    const { column, heights } = leftColumn();
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    expect(drag.moveEdge(-40)).toBe(140);
    expect(heights[1]).toBe(220); // hierarchy grew by the same 40
    expect(heights[3]).toBe(140); // nothing below moved
  });

  it('keeps travelling past its own minimum by pushing the sections below', () => {
    const { column, heights } = leftColumn();
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    // 60 of its own, then the animations panel's 20 on top.
    expect(drag.moveEdge(-80)).toBe(120);
    expect(heights[3]).toBe(120);
    expect(heights[1]).toBe(260); // the whole 80 landed above
  });

  it('stops once this panel and everything below is at its minimum', () => {
    const { column } = leftColumn();
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    expect(drag.roomBelow).toBe(180 - 120 + (140 - 120));
    expect(drag.moveEdge(-5000)).toBe(120);
  });
});

describe('a drag that backtracks', () => {
  it('puts every section it moved back where it started', () => {
    const { column, heights } = leftColumn();
    const drag = startDockedPanelDrag(column.children[2], 120, 180);

    drag.moveEdge(5000);
    drag.moveEdge(-5000);
    expect(drag.moveEdge(0)).toBe(180);
    expect(heights).toEqual([200, 180, 180, 140]);
  });
});

describe('a drag outside a rendered column', () => {
  it('is bounded by the panel minimum alone', () => {
    const stray = document.createElement('div');
    const drag = startDockedPanelDrag(stray, 120, 180);

    expect(drag.moveEdge(4000)).toBe(4180);
    expect(drag.moveEdge(-4000)).toBe(120);
  });
});
