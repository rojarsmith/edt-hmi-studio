import { describe, it, expect } from 'vitest';
import {
  baseName,
  describeVideoPlaylist,
  normalizeCardPath,
  normalizeVideoProps,
  videoPlaylistIsEmpty,
} from '../videoPlaylist';

const BS = String.fromCharCode(92);

describe('a path as the card wants it', () => {
  it('turns backslashes into forward slashes', () => {
    expect(normalizeCardPath(`clips${BS}morning.avi`)).toBe('clips/morning.avi');
  });

  it('trims whitespace and drops a leading slash or ./', () => {
    expect(normalizeCardPath('  /intro.avi ')).toBe('intro.avi');
    expect(normalizeCardPath('./clips/x.avi')).toBe('clips/x.avi');
  });

  it('collapses doubled separators and a trailing slash', () => {
    expect(normalizeCardPath(`a${BS}${BS}b//c.avi/`)).toBe('a/b/c.avi');
  });

  it('takes the file name off a path', () => {
    expect(baseName('clips/morning.avi')).toBe('morning.avi');
    expect(baseName('intro.avi')).toBe('intro.avi');
  });
});

describe('reading a widget’s props into a playlist', () => {
  it('reads a list of files', () => {
    const playlist = normalizeVideoProps({
      source: 'list', files: ['a.avi', 'clips/b.avi'], shuffle: true,
    });
    expect(playlist.source).toBe('list');
    expect(playlist.files).toEqual(['a.avi', 'clips/b.avi']);
    expect(playlist.shuffle).toBe(true);
  });

  it('drops blank lines and normalises each path', () => {
    const playlist = normalizeVideoProps({
      source: 'list', files: ['a.avi', '', `  clips${BS}b.avi  `],
    });
    expect(playlist.files).toEqual(['a.avi', 'clips/b.avi']);
  });

  it('reads a folder scan', () => {
    const playlist = normalizeVideoProps({ source: 'folder', folder: 'clips' });
    expect(playlist.source).toBe('folder');
    expect(playlist.folder).toBe('clips');
  });

  it('reads a project written before playlists as a one-file list', () => {
    const playlist = normalizeVideoProps({ fileName: 'legacy.avi' });
    expect(playlist.source).toBe('list');
    expect(playlist.files).toEqual(['legacy.avi']);
    expect(playlist.autoPlay).toBe(true);
    expect(playlist.loop).toBe(true);
    expect(playlist.shuffle).toBe(false);
  });

  it('reads shuffle as off while a named list holds at most one file', () => {
    // One file has no order to shuffle; the folder's count only the panel knows.
    expect(normalizeVideoProps({ source: 'list', files: ['a.avi'], shuffle: true }).shuffle).toBe(false);
    expect(normalizeVideoProps({ source: 'list', files: [], shuffle: true }).shuffle).toBe(false);
    expect(normalizeVideoProps({ source: 'list', files: ['a.avi', 'b.avi'], shuffle: true }).shuffle).toBe(true);
    expect(normalizeVideoProps({ source: 'folder', folder: 'clips', shuffle: true }).shuffle).toBe(true);
    expect(normalizeVideoProps({ fileName: 'legacy.avi', shuffle: true }).shuffle).toBe(false);
  });

  it('defaults the flags on for auto play and loop, off for shuffle', () => {
    const playlist = normalizeVideoProps({ source: 'list', files: ['a.avi'] });
    expect(playlist.autoPlay).toBe(true);
    expect(playlist.loop).toBe(true);
    expect(playlist.shuffle).toBe(false);
  });
});

describe('summarising a playlist for the canvas', () => {
  it('names a single file', () => {
    expect(describeVideoPlaylist(normalizeVideoProps({ source: 'list', files: ['a.avi'] })))
      .toBe('a.avi');
  });

  it('names the first and counts the rest', () => {
    expect(describeVideoPlaylist(normalizeVideoProps({ source: 'list', files: ['a.avi', 'b.avi', 'c.avi'] })))
      .toBe('a.avi +2');
  });

  it('names a folder scan, root or not', () => {
    expect(describeVideoPlaylist(normalizeVideoProps({ source: 'folder', folder: 'clips' })))
      .toBe('clips/ (every .avi)');
    expect(describeVideoPlaylist(normalizeVideoProps({ source: 'folder', folder: '' })))
      .toBe('/ (every .avi)');
  });

  it('is empty for a list with no files', () => {
    expect(describeVideoPlaylist(normalizeVideoProps({ source: 'list', files: [] }))).toBe('');
  });
});

describe('whether the panel has anything to look for', () => {
  it('is empty only for an empty list', () => {
    expect(videoPlaylistIsEmpty(normalizeVideoProps({ source: 'list', files: [] }))).toBe(true);
    expect(videoPlaylistIsEmpty(normalizeVideoProps({ source: 'list', files: ['a.avi'] }))).toBe(false);
    // A folder scan is never "empty" to the editor: whether it holds an .avi
    // is the panel's to find out.
    expect(videoPlaylistIsEmpty(normalizeVideoProps({ source: 'folder', folder: '' }))).toBe(false);
  });
});
