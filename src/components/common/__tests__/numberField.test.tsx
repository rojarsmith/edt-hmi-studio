// A controlled number input cannot be typed into: half-typed text like "-"
// reads back as "", which parses to 0, which is written to the store, which
// re-renders the field as 0 — wiping the minus sign before the digits arrive.
// Typing -100 was impossible; only the spinner reached a negative number.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import NumberField from '../NumberField';

function setUp(value = 0) {
  const onChange = vi.fn();
  render(<NumberField value={value} onChange={onChange} aria-label="Distance" />);
  return { input: screen.getByLabelText('Distance') as HTMLInputElement, onChange };
}

describe('NumberField', () => {
  it('reports nothing while a minus sign stands alone', () => {
    const { input, onChange } = setUp();

    // The browser reports "" for a field holding only a minus sign.
    fireEvent.change(input, { target: { value: '' } });

    // Writing 0 here is what used to erase the sign on the next render.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports the number once it is one', () => {
    const { input, onChange } = setUp();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '-100' } });

    expect(onChange).toHaveBeenLastCalledWith(-100);
  });

  it('takes a negative typed straight in', () => {
    const { input, onChange } = setUp(50);

    fireEvent.change(input, { target: { value: '-40' } });

    expect(onChange).toHaveBeenLastCalledWith(-40);
  });

  it('holds what was typed rather than snapping back', () => {
    // The field keeps its own draft, so a value the parent has not applied yet
    // does not vanish from under the cursor.
    const { input } = setUp(0);

    fireEvent.change(input, { target: { value: '-100' } });

    expect(input.value).toBe('-100');
  });

  it('leaves the value alone when a half-entry is abandoned', () => {
    const { input, onChange } = setUp(25);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('25');
  });

  it('follows the value again after the draft is dropped', () => {
    const { input } = setUp(10);

    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);

    // Back under the parent's control, which still says 10 in this test.
    expect(input.value).toBe('10');
  });

  it('ignores text that is not a number at all', () => {
    const { input, onChange } = setUp();

    fireEvent.change(input, { target: { value: 'abc' } });

    expect(onChange).not.toHaveBeenCalled();
  });
});
