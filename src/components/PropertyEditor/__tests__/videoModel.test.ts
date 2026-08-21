import { describe, it, expect } from 'vitest';
import { videoFileNameWarning } from '../videoModel';

describe('what the editor can honestly say about a video file name', () => {
  it('says nothing about an ordinary name', () => {
    expect(videoFileNameWarning('intro.avi')).toBeNull();
  });

  it('accepts the extension in any case, because a card does', () => {
    expect(videoFileNameWarning('INTRO.AVI')).toBeNull();
    expect(videoFileNameWarning('Intro.Avi')).toBeNull();
  });

  it('accepts a long name, which is what FF_USE_LFN is on for', () => {
    expect(videoFileNameWarning('product-demo-loop-2026.avi')).toBeNull();
  });

  it('asks for a name when there is none', () => {
    expect(videoFileNameWarning('')).toMatch(/No file named yet/);
  });

  it('rejects a path, either way round, because the runtime opens the root', () => {
    expect(videoFileNameWarning('clips/intro.avi')).toMatch(/rather than a path/);
    expect(videoFileNameWarning(`clips${String.fromCharCode(92)}intro.avi`))
      .toMatch(/rather than a path/);
  });

  it('says which container is read when the extension is something else', () => {
    expect(videoFileNameWarning('intro.mp4')).toMatch(/Only an AVI container/);
    expect(videoFileNameWarning('intro')).toMatch(/Only an AVI container/);
  });

  it('does not mistake a name that merely contains avi for one that ends in it', () => {
    expect(videoFileNameWarning('aviation.mov')).toMatch(/Only an AVI container/);
  });
});
