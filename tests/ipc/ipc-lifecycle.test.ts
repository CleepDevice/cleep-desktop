import { describe, expect, it, vi } from 'vitest';

/**
 * Mirrors preload subscription lifecycle: on() must return a remover that
 * detaches only that listener (used by Angular electronService).
 */
describe('ipc subscription lifecycle', () => {
  it('unsubscribe removes only the registered listener', () => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    const on = (channel: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel)!.add(listener);
      return () => {
        listeners.get(channel)?.delete(listener);
      };
    };

    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = on('devices-updated', first);
    on('devices-updated', second);

    expect(listeners.get('devices-updated')?.size).toBe(2);
    unsubFirst();
    expect(listeners.get('devices-updated')?.size).toBe(1);
    expect(listeners.get('devices-updated')?.has(second)).toBe(true);
  });

  it('service-style init guard skips double registration', () => {
    let ipcReady = false;
    const unsubscribers: Array<() => void> = [];
    const on = vi.fn(() => {
      const unsub = vi.fn();
      unsubscribers.push(unsub);
      return unsub;
    });

    const init = () => {
      if (ipcReady) {
        return;
      }
      on('iso-install-progress', vi.fn());
      ipcReady = true;
    };

    const destroy = () => {
      unsubscribers.splice(0).forEach((unsub) => unsub());
      ipcReady = false;
    };

    init();
    init();
    expect(on).toHaveBeenCalledTimes(1);

    destroy();
    expect(unsubscribers).toHaveLength(0);
    expect(ipcReady).toBe(false);

    init();
    expect(on).toHaveBeenCalledTimes(2);
  });
});
