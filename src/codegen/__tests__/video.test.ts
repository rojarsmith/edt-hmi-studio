import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { createComponent, createScreen, defaultOptions } from './helpers';

function sourceFor(props: Record<string, unknown>, name = 'clip'): string {
  return generateUiSource(
    [createScreen({ components: [createComponent('video', { name, props })] })],
    defaultOptions({ lvglVersion: '9' }),
  );
}

describe('video code generation', () => {
  it('attaches the widget to its own playlist table', () => {
    const source = sourceFor({ source: 'list', files: ['intro.avi'] });
    expect(source).toContain('hmi_video_attach(ui_clip, &ui_clip_playlist);');
  });

  it('lists the files, with the count and the flags', () => {
    const source = sourceFor({
      source: 'list',
      files: ['intro.avi', 'clips/next.avi'],
      autoPlay: true, loop: true, shuffle: false,
    });
    expect(source).toContain('static const char *const ui_clip_files[] = {');
    expect(source).toContain('"intro.avi",');
    expect(source).toContain('"clips/next.avi",');
    expect(source).toContain('.files = ui_clip_files,');
    expect(source).toContain('.count = 2U,');
    expect(source).toContain('.folder = NULL,');
    expect(source).toContain('.auto_play = true,');
    expect(source).toContain('.loop = true,');
    expect(source).toContain('.shuffle = false,');
  });

  it('carries the flags through as they were switched', () => {
    const source = sourceFor({
      source: 'list', files: ['intro.avi'],
      autoPlay: false, loop: false, shuffle: true,
    });
    expect(source).toContain('.auto_play = false,');
    expect(source).toContain('.loop = false,');
    expect(source).toContain('.shuffle = true,');
  });

  it('emits a folder scan as a folder and no file array', () => {
    const source = sourceFor({ source: 'folder', folder: 'clips' });
    expect(source).toContain('.files = NULL,');
    expect(source).toContain('.count = 0U,');
    expect(source).toContain('.folder = "clips",');
    expect(source).not.toContain('ui_clip_files[]');
  });

  it('scans the card root as an empty folder string', () => {
    const source = sourceFor({ source: 'folder', folder: '' });
    expect(source).toContain('.folder = "",');
  });

  it('reads a project written before playlists, one file becoming a one-entry list', () => {
    const source = sourceFor({ fileName: 'legacy.avi' });
    expect(source).toContain('"legacy.avi",');
    expect(source).toContain('.count = 1U,');
    // Migrated shape defaults both switches on.
    expect(source).toContain('.auto_play = true,');
    expect(source).toContain('.loop = true,');
  });

  it('normalises a typed path to forward slashes', () => {
    const source = sourceFor({ source: 'list', files: [`clips${String.fromCharCode(92)}next.avi`] });
    expect(source).toContain('"clips/next.avi",');
  });

  it('still attaches a widget pointed at nothing, so the panel reports it', () => {
    const source = sourceFor({ source: 'list', files: [] });
    expect(source).toContain('hmi_video_attach(ui_clip, &ui_clip_playlist);');
    expect(source).toContain('.files = NULL,');
    expect(source).toContain('.count = 0U,');
  });

  it('creates the widget as the black frame the picture is drawn into', () => {
    const source = sourceFor({ source: 'list', files: ['intro.avi'] });
    expect(source).toContain('ui_clip = lv_obj_create(');
    expect(source).toContain('lv_obj_remove_flag(ui_clip, LV_OBJ_FLAG_SCROLLABLE);');
  });

  it('includes the runtime header only for a project that has a video', () => {
    expect(sourceFor({ source: 'list', files: ['intro.avi'] })).toContain('#include "hmi_video.h"');

    const withoutVideo = generateUiSource(
      [createScreen({ components: [createComponent('label', { name: 'title' })] })],
      defaultOptions({ lvglVersion: '9' }),
    );
    expect(withoutVideo).not.toContain('hmi_video.h');
  });

  it('finds a video nested inside a container', () => {
    const nested = createComponent('obj', {
      name: 'panel',
      children: [createComponent('video', { name: 'clip', props: { source: 'list', files: ['a.avi'] } })],
    });
    const source = generateUiSource(
      [createScreen({ components: [nested] })],
      defaultOptions({ lvglVersion: '9' }),
    );
    expect(source).toContain('#include "hmi_video.h"');
  });

  it('escapes a file name that would otherwise break the string literal', () => {
    const source = sourceFor({ source: 'list', files: ['say "hi".avi'] });
    expect(source).toContain('"say \\"hi\\".avi",');
  });
});
