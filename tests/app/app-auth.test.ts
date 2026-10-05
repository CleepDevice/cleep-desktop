import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appAuth } from '../../src/app-auth';
import { ipcHandleHandlers } from '../setup';

describe('AppAuth', () => {
  const send = vi.fn();
  const window = { webContents: { send } } as unknown as Electron.BrowserWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    send.mockClear();
    appAuth.configure(window);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores auth via ipc and increments attempts on getAuth', async () => {
    const handler = ipcHandleHandlers.get('update-device-auth');
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, {
      url: 'https://device.local:8080/page',
      deviceUuid: 'uuid-1',
      account: 'admin',
      password: 'secret',
    });

    expect(result).toBe(true);
    expect(send).toHaveBeenCalledWith('device-auth-updated', {
      deviceUuid: 'uuid-1',
      hasAuthStored: true,
    });

    const auth = appAuth.getAuth('device.local');
    expect(auth).toMatchObject({
      account: 'admin',
      password: 'secret',
      deviceUuid: 'uuid-1',
      attempts: 1,
    });

    appAuth.getAuth('device.local');
    expect(appAuth.getAuth('device.local').attempts).toBe(3);
  });

  it('resets auth attempts', async () => {
    const handler = ipcHandleHandlers.get('update-device-auth');
    await handler({}, {
      url: 'http://10.0.0.5/',
      deviceUuid: 'uuid-2',
      account: 'user',
      password: 'pwd',
    });

    appAuth.getAuth('10.0.0.5');
    appAuth.getAuth('10.0.0.5');
    expect(appAuth.getAuth('10.0.0.5').attempts).toBe(3);

    appAuth.resetAuthAttempts('10.0.0.5');
    expect(appAuth.getAuth('10.0.0.5').attempts).toBe(1);
  });

  it('returns undefined for unknown auth url', () => {
    expect(appAuth.getAuth('unknown.host')).toBeUndefined();
  });

  it('purges obsolete auths after ttl', async () => {
    const handler = ipcHandleHandlers.get('update-device-auth');
    await handler({}, {
      url: 'https://old.device/',
      deviceUuid: 'uuid-old',
      account: 'a',
      password: 'b',
    });

    expect(appAuth.getAuth('old.device')).toBeTruthy();
    send.mockClear();

    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(appAuth.getAuth('old.device')).toBeUndefined();
    expect(send).toHaveBeenCalledWith('device-auth-updated', {
      deviceUuid: 'uuid-old',
      hasAuthStored: false,
    });
  });
});
