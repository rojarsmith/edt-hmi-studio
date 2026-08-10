import { beforeEach, describe, expect, it } from 'vitest';
import { useResourceStore } from '../resourceStore';
import type { ImageResource } from '../types';

function image(id: string, folder: string): ImageResource {
  return {
    id,
    name: id,
    folder,
    originalName: `${id}.png`,
    width: 4,
    height: 4,
    format: 'ARGB8888',
    data: '',
    cArrayName: `ui_img_${id}`,
    size: 1,
    createdAt: 0,
  };
}

const foldersOf = () => useResourceStore.getState().imageFolders;
const folderOf = (id: string) =>
  useResourceStore.getState().images.find((i) => i.id === id)?.folder;

beforeEach(() => {
  useResourceStore.setState({ images: [], imageFolders: [] });
});

describe('createFolder', () => {
  it('materializes every ancestor', () => {
    useResourceStore.getState().createFolder('a/b/c');
    expect(foldersOf()).toEqual(['a', 'a/b', 'a/b/c']);
  });

  it('ignores the root', () => {
    useResourceStore.getState().createFolder('');
    expect(foldersOf()).toEqual([]);
  });
});

describe('renameFolder', () => {
  beforeEach(() => {
    useResourceStore.setState({
      images: [image('x', 'ui/icons'), image('y', 'ui')],
      imageFolders: ['ui', 'ui/icons'],
    });
  });

  it('renames descendants and the images inside them', () => {
    useResourceStore.getState().renameFolder('ui', 'shell');
    expect(foldersOf()).toEqual(['shell', 'shell/icons']);
    expect(folderOf('x')).toBe('shell/icons');
    expect(folderOf('y')).toBe('shell');
  });

  it('refuses a name containing a slash, which would reparent silently', () => {
    useResourceStore.getState().renameFolder('ui', 'a/b');
    expect(foldersOf()).toEqual(['ui', 'ui/icons']);
  });
});

describe('moveFolder', () => {
  beforeEach(() => {
    useResourceStore.setState({
      images: [image('x', 'a/b')],
      imageFolders: ['a', 'a/b', 'target'],
    });
  });

  it('reparents the folder and its images', () => {
    useResourceStore.getState().moveFolder('a/b', 'target');
    expect(foldersOf()).toContain('target/b');
    expect(folderOf('x')).toBe('target/b');
  });

  it('moves a folder to the root', () => {
    useResourceStore.getState().moveFolder('a/b', '');
    expect(folderOf('x')).toBe('b');
  });

  it('refuses to move a folder inside itself', () => {
    // This would detach the whole subtree from the tree.
    useResourceStore.getState().moveFolder('a', 'a/b');
    expect(folderOf('x')).toBe('a/b');
    expect(foldersOf()).toContain('a/b');
  });
});

describe('deleteFolder', () => {
  it('removes the subtree and lifts its images to the parent', () => {
    useResourceStore.setState({
      images: [image('x', 'ui/icons'), image('keep', 'other')],
      imageFolders: ['ui', 'ui/icons', 'other'],
    });
    useResourceStore.getState().deleteFolder('ui');
    expect(foldersOf()).toEqual(['other']);
    // Images are never destroyed by a folder operation.
    expect(folderOf('x')).toBe('');
    expect(folderOf('keep')).toBe('other');
  });
});

describe('moveImages', () => {
  it('moves only the named images', () => {
    useResourceStore.setState({
      images: [image('a', ''), image('b', '')],
      imageFolders: ['dest'],
    });
    useResourceStore.getState().moveImages(['a'], 'dest');
    expect(folderOf('a')).toBe('dest');
    expect(folderOf('b')).toBe('');
  });
});
