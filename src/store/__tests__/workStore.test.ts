import { beforeEach, describe, expect, it } from 'vitest';
import { parseProgress, useWorkStore } from '../workStore';

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

  it('reads a determinate count out of the build output', () => {
    const id = useWorkStore.getState().start('Build Firmware');

    useWorkStore.getState().note(id, '-- The ASM compiler identification is GNU');
    expect(useWorkStore.getState().items[0].progress).toBeUndefined();

    useWorkStore.getState().note(id, '[263/585] Building C object lvgl/...');
    expect(useWorkStore.getState().items[0].progress).toEqual({ done: 263, total: 585 });
    expect(useWorkStore.getState().items[0].detail).toContain('[263/585]');
  });

  it('keeps the last known count when later lines carry none', () => {
    const id = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().note(id, '[10/20] Building');
    useWorkStore.getState().note(id, 'Firmware artifacts:');

    expect(useWorkStore.getState().items[0].progress).toEqual({ done: 10, total: 20 });
  });

  it('fills the bar on success and leaves it where it stopped otherwise', () => {
    const ok = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().note(ok, '[300/585] Building');
    useWorkStore.getState().finish(ok, 'succeeded');
    expect(useWorkStore.getState().items[0].progress).toEqual({ done: 585, total: 585 });

    const stopped = useWorkStore.getState().start('Build Firmware');
    useWorkStore.getState().note(stopped, '[42/585] Building');
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

describe('parseProgress', () => {
  it('reads Ninja counters', () => {
    expect(parseProgress('[1/585] Building C object')).toEqual({ done: 1, total: 585 });
    expect(parseProgress('  [585/585] Linking')).toEqual({ done: 585, total: 585 });
  });

  it('ignores anything that is not one', () => {
    expect(parseProgress('Firmware build complete')).toBeNull();
    expect(parseProgress('[stderr]')).toBeNull();
    expect(parseProgress('[0/0] nothing to do')).toBeNull();
  });

  it('will not report more done than there is', () => {
    // A counter that overshoots would push the bar past its own end.
    expect(parseProgress('[600/585] Building')).toEqual({ done: 585, total: 585 });
  });
});
