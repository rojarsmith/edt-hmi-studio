// The entry screen has to survive the whole way to the firmware: the editor
// writes the flag, export puts it in the project file, and the build server
// hands that file's screens straight to generateCode. A field-by-field copy
// anywhere along that chain silently boots the device on the first screen.

import { describe, it, expect } from 'vitest';
import { generateCode } from '../generator';
import { createProjectFile, parseProject, serializeProject } from '../../resources/projectManager';
import type { CanvasState, Screen } from '../../types';

const canvas: CanvasState = {
  width: 480,
  height: 272,
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: true,
  gridSize: 10,
  snapToGrid: true,
};

function screensOf(...names: [name: string, isEntry?: boolean][]): Screen[] {
  return names.map(([name, isEntry], i) => ({
    id: `screen-${i + 1}`,
    name,
    components: [],
    backgroundColor: '#ffffff',
    ...(isEntry ? { isEntry: true } : {}),
  }));
}

/** The screens a build sees: editor state → project file → server. */
function throughProjectFile(screens: Screen[]): Screen[] {
  const parsed = parseProject(
    serializeProject(createProjectFile('Boot Test', screens, canvas, [], [])),
  );
  return parsed.screens as Screen[];
}

describe('entry screen reaches the firmware', () => {
  it('boots the flagged screen after a project-file round trip', () => {
    const screens = throughProjectFile(screensOf(['home'], ['settings', true], ['about']));

    const ui = generateCode(screens)['ui.c'];

    expect(ui).toContain('ui_load_screen_settings();');
    expect(ui).not.toContain('ui_load_screen_home();');
    expect(ui).not.toContain('ui_load_screen_about();');
  });

  it('boots the first screen when the file carries no flag', () => {
    const screens = throughProjectFile(screensOf(['home'], ['settings']));

    const ui = generateCode(screens)['ui.c'];

    expect(ui).toContain('ui_load_screen_home();');
    expect(ui).not.toContain('ui_load_screen_settings();');
  });
});
