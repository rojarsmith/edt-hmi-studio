import { describe, expect, it } from 'vitest';
import { EXPORT_ROOT_DIR, dataUrlToBytes, planImageExport } from '../exportImages';
import type { ImageResource } from '../types';

function image(
  id: string,
  folder: string,
  originalName = `${id}.png`,
): ImageResource {
  return {
    id,
    name: id,
    folder,
    originalName,
    width: 2,
    height: 2,
    format: 'ARGB8888',
    data: 'data:image/png;base64,AAEC',
    cArrayName: `ui_img_${id}`,
    size: 3,
    createdAt: 0,
  };
}

const pathOf = (entry: { segments: string[]; fileName: string }) =>
  [...entry.segments, entry.fileName].join('/');

describe('planImageExport', () => {
  it('puts everything under a lowercase images directory', () => {
    const plan = planImageExport([image('logo', '')]);
    expect(EXPORT_ROOT_DIR).toBe('images');
    expect(pathOf(plan[0])).toBe('images/logo.png');
  });

  it('mirrors the folder tree', () => {
    const plan = planImageExport([
      image('logo', ''),
      image('full', 'ui/battery'),
      image('arrow', 'ui/icons'),
    ]);
    expect(plan.map(pathOf)).toEqual([
      'images/logo.png',
      'images/ui/battery/full.png',
      'images/ui/icons/arrow.png',
    ]);
  });

  it('keeps original file names so a re-import reproduces the tree', () => {
    const plan = planImageExport([image('a', 'ui', 'Battery Full.PNG')]);
    // Spaces are not portable across file systems, but the extension stays.
    expect(pathOf(plan[0])).toBe('images/ui/Battery_Full.PNG');
  });

  it('makes duplicate names unique within a directory', () => {
    const plan = planImageExport([
      image('a', 'ui', 'icon.png'),
      image('b', 'ui', 'icon.png'),
      image('c', 'ui', 'icon.png'),
    ]);
    expect(plan.map((e) => e.fileName))
      .toEqual(['icon.png', 'icon_2.png', 'icon_3.png']);
  });

  it('treats the same name in different directories as no clash', () => {
    const plan = planImageExport([
      image('a', 'one', 'icon.png'),
      image('b', 'two', 'icon.png'),
    ]);
    expect(plan.map(pathOf))
      .toEqual(['images/one/icon.png', 'images/two/icon.png']);
  });

  it('compares names case-insensitively, as Windows does', () => {
    const plan = planImageExport([
      image('a', '', 'Icon.png'),
      image('b', '', 'icon.png'),
    ]);
    expect(plan.map((e) => e.fileName)).toEqual(['Icon.png', 'icon_2.png']);
  });

  it('replaces characters a file system will not take', () => {
    const plan = planImageExport([image('a', 'a:b', 'we|rd?.png')]);
    expect(pathOf(plan[0])).toBe('images/a_b/we_rd_.png');
  });

  it('falls back to a name when the original is missing', () => {
    const plan = planImageExport([image('a', '', '')]);
    expect(plan[0].fileName).toBe('a.png');
  });
});

describe('dataUrlToBytes', () => {
  it('decodes the payload after the comma', () => {
    expect(Array.from(dataUrlToBytes('data:image/png;base64,AAEC')))
      .toEqual([0, 1, 2]);
  });

  it('accepts a bare base64 string', () => {
    expect(Array.from(dataUrlToBytes('AAEC'))).toEqual([0, 1, 2]);
  });
});
