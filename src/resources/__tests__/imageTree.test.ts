import { describe, expect, it } from 'vitest';
import {
  buildImageTree,
  folderFromRelativePath,
  isWithinFolder,
  normalizeFolderPath,
  selectImages,
} from '../imageTree';
import type { ImageResource } from '../types';

function image(name: string, folder?: string): ImageResource {
  return {
    id: name,
    name,
    folder,
    originalName: `${name}.png`,
    width: 10,
    height: 10,
    format: 'ARGB8888',
    data: '',
    cArrayName: `ui_img_${name}`,
    size: 100,
    createdAt: 0,
  };
}

describe('normalizeFolderPath', () => {
  it('strips slashes, blanks and relative segments', () => {
    expect(normalizeFolderPath('/a//b/')).toBe('a/b');
    expect(normalizeFolderPath('./a/../b')).toBe('a/b');
    expect(normalizeFolderPath(undefined)).toBe('');
  });

  it('accepts the backslashes a Windows drop produces', () => {
    expect(normalizeFolderPath('a\\b\\c')).toBe('a/b/c');
  });
});

describe('folderFromRelativePath', () => {
  it('drops the file name and the chosen directory itself', () => {
    // Picking `images/` should not nest everything under an `images` node.
    expect(folderFromRelativePath('images/battery/x.png')).toBe('battery');
    expect(folderFromRelativePath('images/ui/icons/small/x.png'))
      .toBe('ui/icons/small');
  });

  it('puts a file sitting directly in the chosen directory at the root', () => {
    expect(folderFromRelativePath('images/logo.png')).toBe('');
  });

  it('returns the root when there is no directory at all', () => {
    expect(folderFromRelativePath('x.png')).toBe('');
  });
});

describe('buildImageTree', () => {
  it('does not name the root the same as a real folder called images', () => {
    // Uploading a directory named `images` puts a folder of that name directly
    // under the root; two nodes reading "images" in a row is unreadable.
    const root = buildImageTree([image('a', 'images')]);
    expect(root.name).not.toBe('images');
    expect(root.children[0]?.name).toBe('images');
  });

  it('materializes folders that only contain other folders', () => {
    const root = buildImageTree([image('a', 'x/y/z')]);
    // x holds no images of its own but must still appear.
    const x = root.children.find((c) => c.name === 'x');
    expect(x).toBeDefined();
    expect(x?.ownCount).toBe(0);
    expect(x?.totalCount).toBe(1);
    expect(x?.children[0]?.name).toBe('y');
  });

  it('rolls descendant counts up into totalCount', () => {
    const root = buildImageTree([
      image('a'),
      image('b', 'ui'),
      image('c', 'ui/icons'),
      image('d', 'ui/icons/small'),
    ]);
    expect(root.ownCount).toBe(1);
    expect(root.totalCount).toBe(4);
    const ui = root.children.find((c) => c.name === 'ui');
    expect(ui?.ownCount).toBe(1);
    expect(ui?.totalCount).toBe(3);
  });

  it('sorts siblings by name', () => {
    const root = buildImageTree([image('a', 'zeta'), image('b', 'alpha')]);
    expect(root.children.map((c) => c.name)).toEqual(['alpha', 'zeta']);
  });
});

describe('isWithinFolder', () => {
  it('does not treat a name prefix as a parent', () => {
    // 'ui_extra' starts with 'ui' but is not inside it.
    expect(isWithinFolder('ui_extra', 'ui')).toBe(false);
    expect(isWithinFolder('ui/icons', 'ui')).toBe(true);
  });

  it('puts everything under the root', () => {
    expect(isWithinFolder('anything/deep', '')).toBe(true);
  });
});

describe('selectImages', () => {
  const images = [
    image('logo'),
    image('battery_full', 'ui/battery'),
    image('battery_low', 'ui/battery'),
    image('arrow', 'ui/icons'),
  ];

  it('includes subfolders of the selected folder', () => {
    expect(selectImages(images, 'ui', '').map((i) => i.name))
      .toEqual(['battery_full', 'battery_low', 'arrow']);
  });

  it('excludes subfolders when Show child is off', () => {
    // Nothing sits directly in ui — everything is one level deeper.
    expect(selectImages(images, 'ui', '', false)).toEqual([]);
    expect(selectImages(images, 'ui/battery', '', false).map((i) => i.name))
      .toEqual(['battery_full', 'battery_low']);
  });

  it('shows only unfoldered images at the root with Show child off', () => {
    expect(selectImages(images, '', '', false).map((i) => i.name))
      .toEqual(['logo']);
  });

  it('narrows to one folder when that folder is selected', () => {
    expect(selectImages(images, 'ui/icons', '').map((i) => i.name))
      .toEqual(['arrow']);
  });

  it('searches within the selected folder only', () => {
    // 'logo' is the only match, and it sits outside ui.
    expect(selectImages(images, 'ui', 'log')).toEqual([]);
    expect(selectImages(images, '', 'log').map((i) => i.name)).toEqual(['logo']);
  });

  it('matches the folder path as well as the name', () => {
    expect(selectImages(images, '', 'battery').map((i) => i.name))
      .toEqual(['battery_full', 'battery_low']);
  });
});
