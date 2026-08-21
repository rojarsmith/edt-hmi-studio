// Factory-mode-only test project, built programmatically so it always matches
// the current data shapes. It exercises one of every basic widget on a single
// screen; factory engineers flash it to sanity-check a board's display and
// touch without composing a project by hand. See docs/factory-dev-mode.md.

import { v4 as uuidv4 } from 'uuid';
import type { ProjectFile } from '../resources/types';
import type { LvglComponent, Screen } from '../types';
import { DEFAULT_BOARD_ID, getBoardDefinition } from '../types/hmi';
import { DEFAULT_CODEGEN_OPTIONS } from '../store/projectStore';

function widget(
  type: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  props: Record<string, unknown> = {},
  bgColor?: string,
): LvglComponent {
  return {
    id: uuidv4(),
    type,
    name,
    x,
    y,
    width,
    height,
    children: [],
    props,
    styles: { default: bgColor ? { bgColor } : {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  };
}

export function buildFactoryWidgetTest(): ProjectFile {
  const board = getBoardDefinition(DEFAULT_BOARD_ID);
  const now = Date.now();

  const screen: Screen = {
    id: 'factory-widget-exerciser',
    name: 'Widgets',
    backgroundColor: '#16181d',
    components: [
      widget('label', 'title', 16, 10, 240, 24, { text: 'Factory widget exerciser' }),
      widget('btn', 'btn_ok', 16, 48, 96, 36, { text: 'OK' }),
      widget('slider', 'slider_a', 132, 58, 180, 12, { min: 0, max: 100, value: 40 }),
      widget('switch', 'switch_a', 336, 48, 56, 28, {}),
      widget('checkbox', 'check_a', 16, 104, 140, 28, { text: 'Check' }),
      widget('bar', 'bar_a', 132, 110, 180, 12, { min: 0, max: 100, value: 70 }),
      widget('arc', 'arc_a', 336, 96, 72, 72, { min: 0, max: 100, value: 55 }),
      widget('dropdown', 'dropdown_a', 16, 152, 140, 32, { options: 'One\nTwo\nThree' }),
      widget('textarea', 'text_in', 172, 152, 140, 48, { placeholder: 'Input' }),
    ],
  };

  return {
    version: '1.0.0',
    name: 'Factory Widget Exerciser',
    description:
      'Internal test project: one of every basic widget on a single screen, for display and touch bring-up.',
    createdAt: now,
    updatedAt: now,
    canvasSize: { width: board.display.width, height: board.display.height },
    screens: [screen],
    resources: { images: [], fonts: [] },
    variables: [],
    logicGraphs: [],
    codeGenOptions: { ...DEFAULT_CODEGEN_OPTIONS },
    boardId: DEFAULT_BOARD_ID,
    display: {
      // The board's own orientation, so these are its numbers unturned. Left
      // absent rather than stated, which is what "landscape" means in a file.
      width: board.display.width,
      height: board.display.height,
      colorDepth: board.display.colorDepth,
    },
  };
}
