import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    canvas: { ...useEditorStore.getState().canvas, clipContent: false },
  });
});

describe('clip content', () => {
  it('starts off', () => {
    // A component parked off-screen is the normal starting place of a
    // slide-in; hiding it by default would leave nothing to select or drag.
    expect(useEditorStore.getState().canvas.clipContent).toBe(false);
  });

  it('toggles both ways', () => {
    useEditorStore.getState().toggleClipContent();
    expect(useEditorStore.getState().canvas.clipContent).toBe(true);

    useEditorStore.getState().toggleClipContent();
    expect(useEditorStore.getState().canvas.clipContent).toBe(false);
  });

  it('leaves the rest of the view alone', () => {
    useEditorStore.setState({
      canvas: {
        ...useEditorStore.getState().canvas,
        zoom: 1.4,
        panX: -60,
        panY: 25,
        showGrid: false,
      },
    });

    useEditorStore.getState().toggleClipContent();

    const { canvas } = useEditorStore.getState();
    expect(canvas).toMatchObject({
      clipContent: true,
      zoom: 1.4,
      panX: -60,
      panY: 25,
      showGrid: false,
    });
  });
});
