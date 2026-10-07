import { describe, expect, it } from 'vitest';
import {
  assertInvokeChannel,
  assertReceiveChannel,
  assertSendChannel,
  INVOKE_CHANNELS,
  RECEIVE_CHANNELS,
  SEND_CHANNELS,
} from '../../src/ipc/ipc-channels';

describe('ipc-channels', () => {
  it('allows known invoke/send/receive channels', () => {
    expect(() => assertInvokeChannel('devices-get-ui-state')).not.toThrow();
    expect(() => assertSendChannel('logger-log')).not.toThrow();
    expect(() => assertReceiveChannel('devices-updated')).not.toThrow();
  });

  it('blocks unknown channels', () => {
    expect(() => assertInvokeChannel('rm-rf')).toThrow(/Blocked IPC invoke/);
    expect(() => assertSendChannel('evil-send')).toThrow(/Blocked IPC send/);
    expect(() => assertReceiveChannel('evil-on')).toThrow(/Blocked IPC receive/);
  });

  it('keeps allowlists non-empty and unique', () => {
    for (const list of [INVOKE_CHANNELS, SEND_CHANNELS, RECEIVE_CHANNELS]) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
