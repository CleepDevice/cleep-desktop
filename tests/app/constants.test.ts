import { describe, expect, it } from 'vitest';
import { MAX_AUTH_ATTEMPTS } from '../../src/app-auth';
import { TEST_DEVICE } from '../../src/cleepbus/cleepbus.types';

describe('MAX_AUTH_ATTEMPTS', () => {
  it('is set to 5', () => {
    expect(MAX_AUTH_ATTEMPTS).toBe(5);
  });
});

describe('TEST_DEVICE', () => {
  it('exposes a valid local test peer shape', () => {
    expect(TEST_DEVICE.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(TEST_DEVICE.hostname).toBe('TESTDEVICE');
    expect(TEST_DEVICE.ip).toBe('127.0.0.1');
    expect(TEST_DEVICE.port).toBe(9000);
    expect(TEST_DEVICE.online).toBe(true);
    expect(TEST_DEVICE.macs).toHaveLength(1);
    expect(TEST_DEVICE.extra?.apps).toContain('system');
  });
});
