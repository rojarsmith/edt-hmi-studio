import { describe, it, expect } from 'vitest';
import { videoFileNameWarning, videoPlaylistWarnings } from '../videoModel';
import { normalizeVideoProps } from '../../../utils/videoPlaylist';

const BS = String.fromCharCode(92);

describe('what the editor can honestly say about one file entry', () => {
  it('says nothing about an ordinary name', () => {
    expect(videoFileNameWarning('intro.avi')).toBeNull();
  });

  it('accepts a folder in front of the name, either slash', () => {
    expect(videoFileNameWarning('clips/intro.avi')).toBeNull();
    expect(videoFileNameWarning(`clips${BS}intro.avi`)).toBeNull();
  });

  it('accepts the extension in any case, because a card does', () => {
    expect(videoFileNameWarning('INTRO.AVI')).toBeNull();
    expect(videoFileNameWarning('Intro.Avi')).toBeNull();
  });

  it('accepts a long name, which is what long file names are on for', () => {
    expect(videoFileNameWarning('product-demo-loop-2026.avi')).toBeNull();
  });

  it('asks for a name when there is none', () => {
    expect(videoFileNameWarning('')).toMatch(/No file named yet/);
  });

  it('says which container is read when the extension is something else', () => {
    expect(videoFileNameWarning('intro.mp4')).toMatch(/Only an AVI container/);
    expect(videoFileNameWarning('intro')).toMatch(/Only an AVI container/);
  });

  it('does not mistake a name that merely contains avi for one that ends in it', () => {
    expect(videoFileNameWarning('aviation.mov')).toMatch(/Only an AVI container/);
  });
});

describe('what the editor can say about a whole playlist', () => {
  it('is happy with a list of good files', () => {
    const playlist = normalizeVideoProps({ source: 'list', files: ['a.avi', 'clips/b.avi'] });
    expect(videoPlaylistWarnings(playlist)).toEqual([]);
  });

  it('asks for a file when the list is empty', () => {
    const playlist = normalizeVideoProps({ source: 'list', files: [] });
    expect(videoPlaylistWarnings(playlist)[0]).toMatch(/No file named yet/);
  });

  it('flags a bad member of an otherwise good list', () => {
    const playlist = normalizeVideoProps({ source: 'list', files: ['a.avi', 'b.mp4'] });
    const warnings = videoPlaylistWarnings(playlist);
    expect(warnings.some((w) => /Only an AVI container/.test(w))).toBe(true);
  });

  it('notices a file listed twice', () => {
    const playlist = normalizeVideoProps({ source: 'list', files: ['a.avi', 'a.avi'] });
    expect(videoPlaylistWarnings(playlist).some((w) => /listed more than once/.test(w))).toBe(true);
  });

  it('says nothing about a folder scan, whose contents are the panel’s to find', () => {
    const playlist = normalizeVideoProps({ source: 'folder', folder: 'clips' });
    expect(videoPlaylistWarnings(playlist)).toEqual([]);
  });
});
