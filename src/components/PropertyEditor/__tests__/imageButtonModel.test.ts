import { describe, expect, it } from 'vitest';
import {
  clampImageButtonStateIndex,
  getImageButtonState,
  getNextImageButtonStateIndex,
  normalizeImageButtonProps,
  normalizeImageButtonStateValue,
  normalizeImageButtonStates,
} from '../imageButtonModel';

describe('imageButtonModel', () => {
  it('normalizes legacy or incomplete state data without discarding extra fields', () => {
    const states = normalizeImageButtonStates([
      {
        id: '',
        name: '',
        imageId: 123,
        value: Number.NaN,
        futureField: 'preserved',
      },
      null,
      { id: 'running', name: 'Running', imageId: 'green', value: 42 },
      { id: 'fraction', name: 'Fraction', imageId: '', value: 4.9 },
      { id: 'overflow', name: 'Overflow', imageId: '', value: 70000 },
    ]);

    expect(states).toEqual([
      {
        id: 'state-1',
        name: 'State 1',
        imageId: '',
        value: 0,
        futureField: 'preserved',
      },
      {
        id: 'running',
        name: 'Running',
        imageId: 'green',
        value: 42,
      },
      {
        id: 'fraction',
        name: 'Fraction',
        imageId: '',
        value: 4,
      },
      {
        id: 'overflow',
        name: 'Overflow',
        imageId: '',
        value: 65535,
      },
    ]);
  });

  it('clamps every state value to a Holding Register-compatible uint16', () => {
    expect(normalizeImageButtonStateValue(-1)).toBe(0);
    expect(normalizeImageButtonStateValue(12.9)).toBe(12);
    expect(normalizeImageButtonStateValue(65536)).toBe(65535);
    expect(normalizeImageButtonStateValue(Number.NaN, 7)).toBe(7);
  });

  it('clamps state indices and derives the authoring value from currentState', () => {
    const normalized = normalizeImageButtonProps({
      states: [
        { id: 'off', name: 'Off', imageId: 'off-image', value: 10 },
        { id: 'on', name: 'On', imageId: 'on-image', value: 99 },
      ],
      initialState: 20,
      currentState: 1,
      value: -1,
      cycleOnClick: false,
    });

    expect(normalized.initialState).toBe(1);
    expect(normalized.currentState).toBe(1);
    expect(normalized.value).toBe(99);
    expect(normalized.cycleOnClick).toBe(false);
    expect(getImageButtonState(normalized.states, normalized.currentState)?.id)
      .toBe('on');
    expect(clampImageButtonStateIndex(-4, normalized.states.length)).toBe(0);
  });

  it('advances through ordered states and wraps to the beginning', () => {
    const states = normalizeImageButtonStates([
      { id: 'a', name: 'A', imageId: 'a', value: 1 },
      { id: 'b', name: 'B', imageId: 'b', value: 2 },
      { id: 'c', name: 'C', imageId: 'c', value: 3 },
    ]);

    expect(getNextImageButtonStateIndex(states, 0)).toBe(1);
    expect(getNextImageButtonStateIndex(states, 1)).toBe(2);
    expect(getNextImageButtonStateIndex(states, 2)).toBe(0);
  });
});
