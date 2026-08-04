import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useResourceStore } from '../../../resources/resourceStore';
import { CanvasImageContent } from '../CanvasComponent';
import { resolveFallbackBackground } from '../widgetBackground';

describe('Canvas image-button image rendering', () => {
  afterEach(() => {
    act(() => {
      useResourceStore.getState().clearAllResources();
    });
  });

  it('resolves the selected state image through the Resource Manager', () => {
    act(() => {
      useResourceStore.setState({
        images: [{
          id: 'state-image',
          name: 'State Image',
          originalName: 'state.png',
          width: 16,
          height: 16,
          format: 'ARGB8888',
          data: 'data:image/png;base64,AA==',
          cArrayName: 'ui_img_state',
          size: 1,
          createdAt: 1,
        }],
      });
    });

    const { container } = render(
      <CanvasImageContent src="state-image" title="Running (7)" />,
    );
    const image = container.querySelector('.lvgl-img') as HTMLDivElement;

    expect(image.title).toBe('Running (7)');
    expect(image.style.backgroundImage)
      .toContain('data:image/png;base64,AA==');
  });

  it('paints no background behind a resolved image, so its alpha shows through', () => {
    act(() => {
      useResourceStore.setState({
        images: [{
          id: 'state-image',
          name: 'State Image',
          originalName: 'state.png',
          width: 16,
          height: 16,
          format: 'ARGB8888',
          data: 'data:image/png;base64,AA==',
          cArrayName: 'ui_img_state',
          size: 1,
          createdAt: 1,
        }],
      });
    });

    const { container } = render(<CanvasImageContent src="state-image" />);
    const image = container.querySelector('.lvgl-img') as HTMLDivElement;

    expect(image.classList.contains('placeholder')).toBe(false);
    expect(image.style.backgroundColor).toBe('');
  });

  it('fills the widget only while no image resolves, to keep it selectable', () => {
    const { container } = render(<CanvasImageContent src="missing-image" />);
    const image = container.querySelector('.lvgl-img') as HTMLDivElement;

    expect(image.classList.contains('placeholder')).toBe(true);
    expect(image.style.backgroundColor).toBe('rgb(240, 240, 240)');
  });
});

describe('Canvas image widget background', () => {
  it('never falls back to an opaque colour for image widgets', () => {
    // The fallback exists so widgets without an explicit background stay
    // visible on the canvas; for image widgets an opaque colour would sit
    // behind the source's alpha and misrepresent what LVGL draws.
    const transparentTypes = ['img', 'image-button'];
    for (const type of transparentTypes) {
      expect(resolveFallbackBackground(type)).toBe('transparent');
    }
    expect(resolveFallbackBackground('btn')).toBe('#2196F3');
  });
});
