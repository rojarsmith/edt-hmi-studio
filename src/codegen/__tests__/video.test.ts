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
  it('names the file rather than linking it, and says what to do with it', () => {
    const source = sourceFor({ fileName: 'intro.avi', autoPlay: true, loop: true });
    expect(source).toContain('hmi_video_attach(ui_clip, "intro.avi", true, true);');
  });

  it('carries auto play and loop through as they were switched off', () => {
    const source = sourceFor({ fileName: 'intro.avi', autoPlay: false, loop: false });
    expect(source).toContain('hmi_video_attach(ui_clip, "intro.avi", false, false);');
  });

  it('defaults both to on when the props predate them', () => {
    const source = sourceFor({ fileName: 'intro.avi' });
    expect(source).toContain('hmi_video_attach(ui_clip, "intro.avi", true, true);');
  });

  it('still attaches a widget pointed at nothing, so the panel reports it', () => {
    const source = sourceFor({ fileName: '', autoPlay: true, loop: true });
    expect(source).toContain('hmi_video_attach(ui_clip, "", true, true);');
  });

  it('creates the widget as the black frame the picture is drawn into', () => {
    const source = sourceFor({ fileName: 'intro.avi' });
    expect(source).toContain('ui_clip = lv_obj_create(');
    expect(source).toContain('lv_obj_remove_flag(ui_clip, LV_OBJ_FLAG_SCROLLABLE);');
  });

  it('includes the runtime header only for a project that has a video', () => {
    expect(sourceFor({ fileName: 'intro.avi' })).toContain('#include "hmi_video.h"');

    const withoutVideo = generateUiSource(
      [createScreen({ components: [createComponent('label', { name: 'title' })] })],
      defaultOptions({ lvglVersion: '9' }),
    );
    expect(withoutVideo).not.toContain('hmi_video.h');
  });

  it('finds a video nested inside a container', () => {
    const nested = createComponent('obj', {
      name: 'panel',
      children: [createComponent('video', { name: 'clip', props: { fileName: 'a.avi' } })],
    });
    const source = generateUiSource(
      [createScreen({ components: [nested] })],
      defaultOptions({ lvglVersion: '9' }),
    );
    expect(source).toContain('#include "hmi_video.h"');
  });

  it('escapes a file name that would otherwise break the string literal', () => {
    const source = sourceFor({ fileName: 'say "hi".avi' });
    expect(source).toContain('hmi_video_attach(ui_clip, "say \\"hi\\".avi", true, true);');
  });
});
