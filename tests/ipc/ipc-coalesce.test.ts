import { describe, expect, it, vi } from 'vitest';

/**
 * Mirrors electronService.onCoalesced scheduling logic for unit coverage.
 */
function createCoalescedSubscription(
  on: (channel: string, listener: (...args: unknown[]) => void) => () => void,
  channel: string,
  callback: (...args: unknown[]) => void,
  options: {
    mode?: 'latest' | 'batch';
    keyFromArgs?: (args: unknown[]) => string;
    schedule: (fn: () => void) => void;
  },
) {
  const mode = options.mode === 'batch' ? 'batch' : 'latest';
  const keyFromArgs = options.keyFromArgs;
  let pendingLatest: unknown[] | null = null;
  let pendingByKey: Record<string, unknown[]> = Object.create(null);
  let pendingBatch: unknown[][] = [];
  let scheduled = false;
  let cancelled = false;

  const flush = () => {
    scheduled = false;
    if (cancelled) {
      return;
    }
    if (mode === 'batch') {
      const batch = pendingBatch;
      pendingBatch = [];
      for (const args of batch) {
        callback(...args);
      }
    } else if (keyFromArgs) {
      for (const key of Object.keys(pendingByKey)) {
        callback(...pendingByKey[key]);
      }
      pendingByKey = Object.create(null);
    } else if (pendingLatest) {
      const args = pendingLatest;
      pendingLatest = null;
      callback(...args);
    }
  };

  const schedule = () => {
    if (scheduled || cancelled) {
      return;
    }
    scheduled = true;
    options.schedule(flush);
  };

  const unsubscribeIpc = on(channel, (...args: unknown[]) => {
    if (mode === 'batch') {
      pendingBatch.push(args);
    } else if (keyFromArgs) {
      pendingByKey[String(keyFromArgs(args))] = args;
    } else {
      pendingLatest = args;
    }
    schedule();
  });

  return () => {
    cancelled = true;
    pendingLatest = null;
    pendingByKey = Object.create(null);
    pendingBatch = [];
    unsubscribeIpc();
  };
}

describe('ipc coalesced subscriptions', () => {
  it('latest mode keeps only the newest payload before flush', () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const on = (channel: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(channel) || [];
      list.push(listener);
      listeners.set(channel, list);
      return () => {
        listeners.set(
          channel,
          (listeners.get(channel) || []).filter((item) => item !== listener),
        );
      };
    };

    const callback = vi.fn();
    let flushQueued: (() => void) | null = null;
    createCoalescedSubscription(on, 'iso-install-progress', callback, {
      mode: 'latest',
      schedule: (fn) => {
        flushQueued = fn;
      },
    });

    const emit = (...args: unknown[]) => {
      for (const listener of listeners.get('iso-install-progress') || []) {
        listener(...args);
      }
    };

    emit(null, { percent: 10 });
    emit(null, { percent: 40 });
    emit(null, { percent: 90 });
    expect(callback).not.toHaveBeenCalled();

    flushQueued?.();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, { percent: 90 });
  });

  it('batch mode delivers every event in order on flush', () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const on = (channel: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(channel) || [];
      list.push(listener);
      listeners.set(channel, list);
      return () => undefined;
    };

    const callback = vi.fn();
    let flushQueued: (() => void) | null = null;
    createCoalescedSubscription(on, 'devices-message', callback, {
      mode: 'batch',
      schedule: (fn) => {
        flushQueued = fn;
      },
    });

    const emit = (...args: unknown[]) => {
      for (const listener of listeners.get('devices-message') || []) {
        listener(...args);
      }
    };

    emit(null, { id: 1 });
    emit(null, { id: 2 });
    flushQueued?.();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0][1]).toEqual({ id: 1 });
    expect(callback.mock.calls[1][1]).toEqual({ id: 2 });
  });

  it('latest mode with keyFromArgs keeps newest payload per key', () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const on = (channel: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(channel) || [];
      list.push(listener);
      listeners.set(channel, list);
      return () => undefined;
    };

    const callback = vi.fn();
    let flushQueued: (() => void) | null = null;
    createCoalescedSubscription(on, 'download-file-status', callback, {
      mode: 'latest',
      keyFromArgs: (args) => String((args[1] as { downloadId?: string })?.downloadId || 'unknown'),
      schedule: (fn) => {
        flushQueued = fn;
      },
    });

    const emit = (...args: unknown[]) => {
      for (const listener of listeners.get('download-file-status') || []) {
        listener(...args);
      }
    };

    emit(null, { downloadId: 'a', percent: 10 });
    emit(null, { downloadId: 'b', percent: 20 });
    emit(null, { downloadId: 'a', percent: 55 });
    flushQueued?.();

    expect(callback).toHaveBeenCalledTimes(2);
    const payloads = callback.mock.calls.map((call) => call[1]);
    expect(payloads).toEqual(
      expect.arrayContaining([
        { downloadId: 'a', percent: 55 },
        { downloadId: 'b', percent: 20 },
      ]),
    );
  });
});
