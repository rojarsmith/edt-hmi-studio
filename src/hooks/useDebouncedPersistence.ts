import { useCallback, useEffect, useRef } from 'react';

interface DebouncedPersistenceOptions<T> {
  delayMs?: number;
  onPersisted?: (value: T) => void;
  onError?: (error: unknown) => void;
}

export interface DebouncedPersistence<T> {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

/**
 * Serializes persistence calls, keeps only the latest pending value, and
 * flushes that value when the owning component unmounts.
 */
export function useDebouncedPersistence<T>(
  persist: (value: T) => Promise<void>,
  options: DebouncedPersistenceOptions<T> = {},
): DebouncedPersistence<T> {
  const delayMs = options.delayMs ?? 600;
  const persistRef = useRef(persist);
  const onPersistedRef = useRef(options.onPersisted);
  const onErrorRef = useRef(options.onError);
  const pendingRef = useRef<T | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    persistRef.current = persist;
    onPersistedRef.current = options.onPersisted;
    onErrorRef.current = options.onError;
  }, [options.onError, options.onPersisted, persist]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const enqueue = useCallback((value: T): Promise<void> => {
    const task = queueRef.current.then(async () => {
      await persistRef.current(value);
      onPersistedRef.current?.(value);
    });
    queueRef.current = task.catch((error: unknown) => {
      onErrorRef.current?.(error);
    });
    return task;
  }, []);

  const flush = useCallback(async () => {
    clearTimer();
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (pending === undefined) {
      await queueRef.current;
      return;
    }
    await enqueue(pending);
  }, [clearTimer, enqueue]);

  const schedule = useCallback((value: T) => {
    pendingRef.current = value;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      void flush().catch(() => {
        // The configured onError callback reports background save failures.
      });
    }, delayMs);
  }, [clearTimer, delayMs, flush]);

  const cancel = useCallback(() => {
    clearTimer();
    pendingRef.current = undefined;
  }, [clearTimer]);

  useEffect(() => () => {
    clearTimer();
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (pending !== undefined) {
      void enqueue(pending).catch(() => {
        // Unmount cleanup cannot await; onError still receives the failure.
      });
    }
  }, [clearTimer, enqueue]);

  return { schedule, flush, cancel };
}
