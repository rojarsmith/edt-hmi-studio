import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useDebouncedPersistence } from '../useDebouncedPersistence';

function Harness({
  value,
  persist,
  delayMs = 100,
}: {
  value: string;
  persist: (value: string) => Promise<void>;
  delayMs?: number;
}) {
  const persistence = useDebouncedPersistence(persist, { delayMs });

  useEffect(() => {
    persistence.schedule(value);
  }, [persistence, value]);

  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedPersistence', () => {
  it('persists only the latest scheduled value after the debounce interval', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const view = render(<Harness value="COM1" persist={persist} />);

    view.rerender(<Harness value="COM5" persist={persist} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('COM5');
    view.unmount();
  });

  it('flushes the latest pending value when the panel unmounts', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const view = render(
      <Harness value="unit-1" persist={persist} delayMs={10_000} />,
    );

    view.rerender(
      <Harness value="unit-7" persist={persist} delayMs={10_000} />,
    );
    await act(async () => {
      view.unmount();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('unit-7');
  });
});
