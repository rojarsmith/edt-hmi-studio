import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkStore } from '../workStore';

beforeEach(() => {
  useWorkStore.setState({ items: [], nextId: 1 });
});

describe('work history', () => {
  it('numbers items from one and puts the newest on top', () => {
    const first = useWorkStore.getState().start('Build Firmware');
    const second = useWorkStore.getState().start('Flash & Reset');

    expect([first, second]).toEqual([1, 2]);
    expect(useWorkStore.getState().items.map((item) => item.id)).toEqual([2, 1]);
  });

  it('keeps finished items rather than sweeping them away', () => {
    const id = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().finish(id, 'succeeded', 'Firmware build complete.');

    // The whole difference from Eclipse's version: history survives the run.
    const [item] = useWorkStore.getState().items;
    expect(item.status).toBe('succeeded');
    expect(item.detail).toBe('Firmware build complete.');
    expect(item.endedAt).toBeGreaterThanOrEqual(item.startedAt);
  });

  it('takes the phase and count its caller worked out', () => {
    const id = useWorkStore.getState().start('Build Firmware');

    useWorkStore.getState().note(id, { label: 'Setting up the build' });
    expect(useWorkStore.getState().items[0].detail).toBe('Setting up the build');
    expect(useWorkStore.getState().items[0].progress).toBeUndefined();

    useWorkStore.getState().note(id, {
      label: 'Compiling your screens',
      progress: { done: 263, total: 585 },
    });
    expect(useWorkStore.getState().items[0].progress).toEqual({ done: 263, total: 585 });
  });

  it('holds the phase and the count when an update carries neither', () => {
    // Which is what stops an unrecognised line from surfacing: the caller
    // reports nothing and the row simply does not change.
    const id = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().note(id, { label: 'Compiling images', progress: { done: 10, total: 20 } });
    useWorkStore.getState().note(id, {});

    expect(useWorkStore.getState().items[0].detail).toBe('Compiling images');
    expect(useWorkStore.getState().items[0].progress).toEqual({ done: 10, total: 20 });
  });

  it('fills the bar on success and leaves it where it stopped otherwise', () => {
    const ok = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().note(ok, { progress: { done: 300, total: 585 } });
    useWorkStore.getState().finish(ok, 'succeeded');
    expect(useWorkStore.getState().items[0].progress).toEqual({ done: 585, total: 585 });

    const stopped = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().note(stopped, { progress: { done: 42, total: 585 } });
    useWorkStore.getState().finish(stopped, 'cancelled');
    // A build stopped at 42 should still say 42.
    expect(useWorkStore.getState().items[0].progress).toEqual({ done: 42, total: 585 });
  });

  it('drops the cancel handle once an item settles', () => {
    const id = useWorkStore.getState().start('Build Firmware', {
      cancellable: true,
      cancel: () => {},
    });
    expect(useWorkStore.getState().items[0].cancel).toBeTypeOf('function');

    useWorkStore.getState().finish(id, 'succeeded');

    expect(useWorkStore.getState().items[0].cancel).toBeUndefined();
  });

  it('clears finished work and leaves running work alone', () => {
    const done = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().start('Flash & Reset');
    useWorkStore.getState().finish(done, 'failed');

    useWorkStore.getState().clearFinished();

    const items = useWorkStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Flash & Reset');
  });
});
