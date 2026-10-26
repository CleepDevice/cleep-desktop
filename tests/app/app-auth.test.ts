import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appAuth, deviceAuthVaultKey } from '../../src/app-auth';
import { appVault } from '../../src/app-vault';
import { ipcHandleHandlers, USER_DATA_DIR } from '../setup';

// Isolate from app-vault.test.ts which also uses the vault singleton + USER_DATA_DIR.
const AUTH_USER_DATA_DIR = path.join(USER_DATA_DIR, 'app-auth-tests');
const vaultDir = path.join(AUTH_USER_DATA_DIR, 'vault');
const PASSPHRASE = 'test-pass-123';

function resetVaultSingleton(): void {
  const vault = appVault as unknown as {
    vaultRoot: string | null;
    blobsDir: string | null;
    metaPath: string | null;
    indexPath: string | null;
    meta: unknown;
    entries: Map<string, unknown>;
    dek: Buffer | null;
    configured: boolean;
    window: unknown;
    unlockWaiters: unknown[];
    unlockPromptOpen: boolean;
  };
  vault.vaultRoot = null;
  vault.blobsDir = null;
  vault.metaPath = null;
  vault.indexPath = null;
  vault.meta = null;
  vault.entries = new Map();
  vault.dek = null;
  vault.configured = false;
  vault.window = null;
  vault.unlockWaiters = [];
  vault.unlockPromptOpen = false;
}

function configureVault(): void {
  resetVaultSingleton();
  fs.mkdirSync(AUTH_USER_DATA_DIR, { recursive: true });
  fs.rmSync(vaultDir, { recursive: true, force: true });
  appVault.configure({ getPath: () => AUTH_USER_DATA_DIR } as unknown as Electron.App);
}

describe('AppAuth', () => {
  const send = vi.fn();
  const window = { webContents: { send } } as unknown as Electron.BrowserWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    send.mockClear();
    configureVault();
    appAuth.configure(window);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetVaultSingleton();
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

    expect(result).toEqual({ ok: true, data: true });
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

  it('persists auth in the vault when saveToVault is set', async () => {
    appVault.enable(PASSPHRASE);
    const handler = ipcHandleHandlers.get('update-device-auth');

    await handler({}, {
      url: 'https://10.0.0.8/',
      deviceUuid: 'uuid-vault',
      account: 'pi',
      password: 'cleep',
      saveToVault: true,
    });

    expect(appVault.hasSecret(deviceAuthVaultKey('uuid-vault'))).toBe(true);
    expect(appVault.getSecret(deviceAuthVaultKey('uuid-vault'))).toEqual({
      account: 'pi',
      password: 'cleep',
      host: '10.0.0.8',
      deviceUuid: 'uuid-vault',
    });
    expect(appAuth.hasStoredAuth('uuid-vault')).toBe(true);
  });

  it('resolveAuth reloads credentials from the vault after memory purge', async () => {
    appVault.enable(PASSPHRASE);
    const handler = ipcHandleHandlers.get('update-device-auth');
    await handler({}, {
      url: 'http://192.168.1.50/',
      deviceUuid: 'uuid-reload',
      account: 'admin',
      password: 's3cret',
      saveToVault: true,
    });

    // Drop session memory while keeping vault entry.
    delete (appAuth as unknown as { auths: Record<string, unknown> }).auths['192.168.1.50'];
    expect(appAuth.getAuth('192.168.1.50')).toBeUndefined();

    const resolved = await appAuth.resolveAuth('192.168.1.50', 'uuid-reload');
    expect(resolved).toMatchObject({
      account: 'admin',
      password: 's3cret',
      deviceUuid: 'uuid-reload',
      attempts: 1,
    });
  });

  it('devices-prepare-auth warms session auth from the vault', async () => {
    appVault.enable(PASSPHRASE);
    await ipcHandleHandlers.get('update-device-auth')?.({}, {
      url: 'http://10.1.2.3/',
      deviceUuid: 'uuid-prep',
      account: 'root',
      password: 'vaulted',
      saveToVault: true,
    });
    delete (appAuth as unknown as { auths: Record<string, unknown> }).auths['10.1.2.3'];

    const prepared = await ipcHandleHandlers.get('devices-prepare-auth')?.({}, {
      url: 'http://10.1.2.3/',
      deviceUuid: 'uuid-prep',
    });
    expect(prepared).toEqual({ ok: true, data: { ready: true } });
    expect(appAuth.getAuth('10.1.2.3')).toMatchObject({ account: 'root', password: 'vaulted' });
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

  it('purges obsolete auths after ttl but keeps hasAuthStored when vault has them', async () => {
    appVault.enable(PASSPHRASE);
    const handler = ipcHandleHandlers.get('update-device-auth');
    await handler({}, {
      url: 'https://old.device/',
      deviceUuid: 'uuid-old',
      account: 'a',
      password: 'b',
      saveToVault: true,
    });

    expect(appAuth.getAuth('old.device')).toBeTruthy();
    send.mockClear();

    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(appAuth.getAuth('old.device')).toBeUndefined();
    expect(send).toHaveBeenCalledWith('device-auth-updated', {
      deviceUuid: 'uuid-old',
      hasAuthStored: true,
    });
  });

  it('purges obsolete auths after ttl when not in vault', async () => {
    const handler = ipcHandleHandlers.get('update-device-auth');
    await handler({}, {
      url: 'https://temp.device/',
      deviceUuid: 'uuid-temp',
      account: 'a',
      password: 'b',
    });

    send.mockClear();
    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(appAuth.getAuth('temp.device')).toBeUndefined();
    expect(send).toHaveBeenCalledWith('device-auth-updated', {
      deviceUuid: 'uuid-temp',
      hasAuthStored: false,
    });
  });
});
