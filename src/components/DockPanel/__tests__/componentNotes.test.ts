// What the Information pane can check for a video on a screen: the rules are
// fixed, the warnings are derived from where things actually are.

import { describe, expect, it } from 'vitest';
import type { LvglComponent, Screen } from '../../../types';
import { VIDEO_RULES, videoWarnings } from '../componentNotes';

function widget(
  type: string,
  name: string,
  box: { x: number; y: number; width: number; height: number },
  extra: Partial<LvglComponent> = {},
): LvglComponent {
  return {
    id: name, type, name, ...box,
    children: [], props: {}, styles: { default: {} }, events: [], animations: [],
    parentId: null, locked: false, visible: true,
    ...extra,
  };
}

const screenOf = (components: LvglComponent[]): Screen =>
  ({ id: 'screen', name: 'Screen 1', components });

const display = { width: 800, height: 480 };
const fullScreen = { x: 0, y: 0, width: 800, height: 480 };

describe('the rules a video lives by', () => {
  it('say the things the canvas cannot show, in the designer’s words', () => {
    const titles = VIDEO_RULES.map((rule) => rule.title);
    expect(titles).toContain('The video needs its space to itself');
    expect(titles).toContain('The file lives in the top level of the SD card');
    expect(titles).toContain('The picture plays without sound');
  });

  it('never use the firmware’s words', () => {
    const text = VIDEO_RULES.map((rule) => `${rule.title} ${rule.body}`).join(' ');
    for (const jargon of ['LVGL', 'LTDC', 'layer', 'DMA2D', 'codec', 'FatFs', 'buffer', 'firmware']) {
      expect(text).not.toMatch(new RegExp(jargon, 'i'));
    }
  });
});

describe('what is wrong with this video, on this screen', () => {
  it('finds nothing wrong with a full-screen video on its own', () => {
    const video = widget('video', 'Video_1', fullScreen, { props: { fileName: 'intro.avi' } });
    expect(videoWarnings(video, screenOf([video]), display)).toEqual([]);
  });

  it('names the button sitting on top of it', () => {
    const video = widget('video', 'Video_1', fullScreen, { props: { fileName: 'intro.avi' } });
    const button = widget('btn', 'Button_2', { x: 300, y: 400, width: 100, height: 40 });

    const [warning] = videoWarnings(video, screenOf([video, button]), display);
    expect(warning.kind).toBe('warning');
    expect(warning.title).toBe('Button_2 overlaps this video');
    expect(warning.body).toContain('hidden behind the picture');
  });

  it('leaves a button beside it alone', () => {
    const video = widget('video', 'Video_1', { x: 160, y: 0, width: 640, height: 480 }, { props: { fileName: 'intro.avi' } });
    const button = widget('btn', 'Button_2', { x: 30, y: 400, width: 100, height: 40 });

    expect(videoWarnings(video, screenOf([video, button]), display)).toEqual([]);
  });

  it('counts several overlapping components together', () => {
    const video = widget('video', 'Video_1', fullScreen, { props: { fileName: 'intro.avi' } });
    const a = widget('label', 'Title', { x: 10, y: 10, width: 200, height: 30 });
    const b = widget('btn', 'Play', { x: 700, y: 420, width: 80, height: 40 });

    const [warning] = videoWarnings(video, screenOf([video, a, b]), display);
    expect(warning.title).toBe('2 components overlap this video');
    expect(warning.body).toContain('Title, Play');
  });

  it('does not count the container the video sits inside', () => {
    const video = widget('video', 'Video_1', { x: 0, y: 0, width: 400, height: 240 }, {
      parentId: 'Panel', props: { fileName: 'intro.avi' },
    });
    const panel = widget('obj', 'Panel', { x: 100, y: 100, width: 400, height: 240 }, { children: [video] });

    expect(videoWarnings(video, screenOf([panel]), display)).toEqual([]);
  });

  it('places a nested video where its parent puts it when checking overlap', () => {
    const video = widget('video', 'Video_1', { x: 0, y: 0, width: 400, height: 240 }, {
      parentId: 'Panel', props: { fileName: 'intro.avi' },
    });
    const panel = widget('obj', 'Panel', { x: 100, y: 100, width: 400, height: 240 }, { children: [video] });
    // At 450,300 on screen — inside the panel's box, so inside the video's.
    const badge = widget('label', 'Badge', { x: 450, y: 300, width: 40, height: 20 });

    const [warning] = videoWarnings(video, screenOf([panel, badge]), display);
    expect(warning.title).toBe('Badge overlaps this video');
  });

  it('ignores a hidden component', () => {
    const video = widget('video', 'Video_1', fullScreen, { props: { fileName: 'intro.avi' } });
    const ghost = widget('btn', 'Ghost', { x: 10, y: 10, width: 100, height: 40 }, { visible: false });

    expect(videoWarnings(video, screenOf([video, ghost]), display)).toEqual([]);
  });

  it('says when a second video shares the screen', () => {
    const first = widget('video', 'Video_1', { x: 0, y: 0, width: 400, height: 240 }, { props: { fileName: 'a.avi' } });
    const second = widget('video', 'Video_2', { x: 400, y: 240, width: 400, height: 240 }, { props: { fileName: 'b.avi' } });

    const titles = videoWarnings(first, screenOf([first, second]), display).map((n) => n.title);
    expect(titles).toContain('More than one video on this screen');
  });

  it('says when the video runs off the screen', () => {
    const video = widget('video', 'Video_1', { x: 160, y: 0, width: 800, height: 480 }, { props: { fileName: 'intro.avi' } });

    const [warning] = videoWarnings(video, screenOf([video]), display);
    expect(warning.title).toBe('The video runs off the screen');
    expect(warning.body).toContain('800 × 480');
  });

  it('asks for a file when none is named', () => {
    const video = widget('video', 'Video_1', fullScreen, { props: { fileName: '  ' } });

    const titles = videoWarnings(video, screenOf([video]), display).map((n) => n.title);
    expect(titles).toEqual(['No file named yet']);
  });
});
