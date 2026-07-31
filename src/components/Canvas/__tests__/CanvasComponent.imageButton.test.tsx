import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useResourceStore } from '../../../resources/resourceStore';
import { CanvasImageContent } from '../CanvasComponent';

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
});
