import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasVideoContent } from '../CanvasComponent';
import { resolveFallbackBackground } from '../widgetBackground';

describe('a video on the design canvas', () => {
  it('names the file it is pointed at, rather than inventing a still', () => {
    const { container } = render(
      <CanvasVideoContent fileName="intro.avi" autoPlay loop />,
    );

    expect(container.querySelector('.lvgl-video-name')?.textContent)
      .toBe('intro.avi');
    expect(container.querySelector('.lvgl-video')?.getAttribute('title'))
      .toContain('intro.avi');
  });

  it('says so when nothing has been named yet', () => {
    const { container } = render(<CanvasVideoContent fileName="" />);

    expect(container.querySelector('.lvgl-video-name')?.textContent)
      .toBe('No file named');
    expect(container.querySelector('.lvgl-video')?.className)
      .toContain('unnamed');
  });

  it('treats whitespace as no name, the way the generator will', () => {
    const { container } = render(<CanvasVideoContent fileName="   " />);

    expect(container.querySelector('.lvgl-video-name')?.textContent)
      .toBe('No file named');
  });

  it('shows what the widget will do when the screen loads', () => {
    const { container } = render(
      <CanvasVideoContent fileName="intro.avi" autoPlay loop />,
    );

    expect(container.querySelector('.lvgl-video-badges')?.textContent)
      .toBe('AUTO · LOOP');
  });

  it('drops a badge for each behaviour switched off', () => {
    const { container } = render(
      <CanvasVideoContent fileName="intro.avi" autoPlay={false} loop />,
    );

    expect(container.querySelector('.lvgl-video-badges')?.textContent).toBe('LOOP');
  });

  it('shows no badges at all when both are off', () => {
    const { container } = render(
      <CanvasVideoContent fileName="intro.avi" autoPlay={false} loop={false} />,
    );

    expect(container.querySelector('.lvgl-video-badges')).toBeNull();
  });

  it('keeps the black the widget ships with, rather than filling it back in', () => {
    // A fallback here would paint over a fill the widget deliberately owns.
    expect(resolveFallbackBackground('video')).toBe('transparent');
  });
});
