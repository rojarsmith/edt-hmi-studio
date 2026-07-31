import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResourceStore } from '../../../resources/resourceStore';
import { ImageButtonEditor } from '../PropertyEditor';

const states = [
  { id: 'idle', name: 'Idle', imageId: 'image-idle', value: 0 },
  { id: 'running', name: 'Running', imageId: '', value: 42 },
];

describe('ImageButtonEditor', () => {
  afterEach(() => {
    act(() => {
      useResourceStore.getState().clearAllResources();
    });
  });

  it('uses Resource Manager image IDs and keeps value synchronized with currentState', () => {
    act(() => {
      useResourceStore.setState({
        images: [{
          id: 'image-running',
          name: 'Running Image',
          originalName: 'running.png',
          width: 64,
          height: 32,
          format: 'ARGB8888',
          data: 'data:image/png;base64,AA==',
          cArrayName: 'ui_img_running',
          size: 1,
          createdAt: 1,
        }],
      });
    });
    const onBatchChange = vi.fn();
    const onChange = vi.fn();
    const view = render(
      <ImageButtonEditor
        props={{
          states,
          initialState: 0,
          currentState: 0,
          value: 0,
          cycleOnClick: true,
        }}
        onChange={onChange}
        onBatchChange={onBatchChange}
      />,
    );

    fireEvent.change(
      view.getByLabelText('Current image-button state'),
      { target: { value: '1' } },
    );
    expect(onBatchChange).toHaveBeenLastCalledWith({
      currentState: 1,
      value: 42,
    });

    fireEvent.change(
      view.getByLabelText('Image-button state 2 image'),
      { target: { value: 'image-running' } },
    );
    expect(onBatchChange).toHaveBeenLastCalledWith({
      states: [
        states[0],
        { ...states[1], imageId: 'image-running' },
      ],
      initialState: 0,
      currentState: 0,
      value: 0,
    });
  });

  it('reorders states while preserving initial and current state identity', () => {
    const onBatchChange = vi.fn();
    const view = render(
      <ImageButtonEditor
        props={{
          states,
          initialState: 0,
          currentState: 1,
          value: 42,
          cycleOnClick: true,
        }}
        onChange={vi.fn()}
        onBatchChange={onBatchChange}
      />,
    );

    fireEvent.click(view.getAllByTitle('Move State Up')[1]);

    expect(onBatchChange).toHaveBeenCalledWith({
      states: [states[1], states[0]],
      initialState: 1,
      currentState: 0,
      value: 42,
    });
  });

  it('constrains edited numeric values to uint16', () => {
    const onBatchChange = vi.fn();
    const view = render(
      <ImageButtonEditor
        props={{
          states,
          initialState: 0,
          currentState: 1,
          value: 42,
          cycleOnClick: true,
        }}
        onChange={vi.fn()}
        onBatchChange={onBatchChange}
      />,
    );
    const valueInput = view.getByLabelText(
      'Image-button state 2 value',
    ) as HTMLInputElement;

    expect(valueInput.min).toBe('0');
    expect(valueInput.max).toBe('65535');
    expect(valueInput.step).toBe('1');

    fireEvent.change(valueInput, { target: { value: '70000' } });

    expect(onBatchChange).toHaveBeenLastCalledWith({
      states: [
        states[0],
        { ...states[1], value: 65535 },
      ],
      initialState: 0,
      currentState: 1,
      value: 65535,
    });
  });
});
