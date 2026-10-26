import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appVault } from '../../src/app-vault';
import { VaultError } from '../../src/app-vault.types';
import { ipcHandleHandlers, USER_DATA_DIR } from '../setup';

const vaultDir = path.join(USER_DATA_DIR, 'vault');
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
  fs.rmSync(vaultDir, { recursive: true, force: true });
  appVault.configure({ getPath: () => USER_DATA_DIR } as unknown as Electron.App);
}

describe('AppVault', () => {
  beforeEach(() => {
    configureVault();
  });

  afterEach(() => {
    resetVaultSingleton();
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it('is disabled by default', () => {
    expect(appVault.getStatus()).toEqual({
      enabled: false,
      unlocked: false,
      recoveryCodesRemaining: 0,
    });
  });

  it('enable unlocks the vault and returns recovery codes once', () => {
    const result = appVault.enable(PASSPHRASE);
    expect(result.recoveryCodes).toHaveLength(8);
    expect(result.status).toEqual({
      enabled: true,
      unlocked: true,
      recoveryCodesRemaining: 8,
    });
    expect(fs.existsSync(path.join(vaultDir, 'meta.json'))).toBe(true);
  });

  it('stores and reads secrets only when unlocked', () => {
    appVault.enable(PASSPHRASE);
    appVault.putSecret('demo.token', { token: 'super-secret' });
    expect(appVault.getSecret('demo.token')).toEqual({ token: 'super-secret' });
    expect(appVault.listSecretKeys()).toEqual(['demo.token']);

    appVault.lock();
    expect(() => appVault.getSecret('demo.token')).toThrowError(VaultError);

    appVault.unlock(PASSPHRASE);
    expect(appVault.getSecret('demo.token')).toEqual({ token: 'super-secret' });

    const blobFiles = fs.readdirSync(path.join(vaultDir, 'blobs'));
    expect(blobFiles.length).toBe(1);
    expect(fs.readFileSync(path.join(vaultDir, 'blobs', blobFiles[0])).toString('utf8')).not.toContain('super-secret');
  });

  it('rejects weak passphrases and wrong unlock', () => {
    expect(() => appVault.enable('short')).toThrowError(VaultError);
    appVault.enable(PASSPHRASE);
    appVault.lock();
    expect(() => appVault.unlock('wrong-passphrase')).toThrowError(VaultError);
  });

  it('recovers with a recovery code and rotates codes', () => {
    const enabled = appVault.enable(PASSPHRASE);
    const code = enabled.recoveryCodes[0];
    appVault.lock();

    const recovered = appVault.recover(code, 'new-passphrase-99');
    expect(recovered.status.enabled).toBe(true);
    expect(recovered.status.unlocked).toBe(true);
    expect(recovered.recoveryCodes).toHaveLength(8);
    expect(recovered.recoveryCodes).not.toContain(code);

    appVault.lock();
    expect(() => appVault.unlock(PASSPHRASE)).toThrowError(VaultError);
    appVault.unlock('new-passphrase-99');
  });

  it('disable wipes secrets', () => {
    appVault.enable(PASSPHRASE);
    appVault.putSecret('x', 1);
    appVault.disable(PASSPHRASE);
    expect(appVault.getStatus().enabled).toBe(false);
    expect(appVault.listSecretKeys()).toEqual([]);
    expect(fs.existsSync(path.join(vaultDir, 'meta.json'))).toBe(false);
  });

  it('ensureUnlocked resolves immediately when already unlocked', async () => {
    appVault.enable(PASSPHRASE);
    await expect(appVault.ensureUnlocked()).resolves.toBeUndefined();
  });

  it('ensureUnlocked waits until unlock and getSecretAsync works', async () => {
    appVault.enable(PASSPHRASE);
    appVault.putSecret('remote.url', 'https://example.ngrok.app');
    appVault.lock();

    const pending = appVault.getSecretAsync('remote.url');
    // Without a BrowserWindow, the unlock prompt rejects immediately.
    await expect(pending).rejects.toMatchObject({ code: 'VAULT_LOCKED' });

    appVault.unlock(PASSPHRASE);
    await expect(appVault.getSecretAsync('remote.url')).resolves.toBe('https://example.ngrok.app');
  });

  it('ensureUnlocked can be satisfied by a concurrent unlock', async () => {
    appVault.enable(PASSPHRASE);
    appVault.lock();

    // Fake a window so promptUnlock does not reject immediately.
    appVault.setWindow({ isDestroyed: () => false } as Electron.BrowserWindow);
    const pending = appVault.ensureUnlocked();
    appVault.unlock(PASSPHRASE);
    await expect(pending).resolves.toBeUndefined();
  });

  it('dismissUnlockRequest cancels pending ensureUnlocked', async () => {
    appVault.enable(PASSPHRASE);
    appVault.lock();
    appVault.setWindow({ isDestroyed: () => false } as Electron.BrowserWindow);

    const pending = appVault.ensureUnlocked();
    appVault.dismissUnlockRequest();
    await expect(pending).rejects.toMatchObject({ code: 'VAULT_UNLOCK_CANCELLED' });
  });

  it('registers configuration ipc handlers', async () => {
    expect(ipcHandleHandlers.has('vault-get-status')).toBe(true);
    expect(ipcHandleHandlers.has('vault-enable')).toBe(true);
    expect(ipcHandleHandlers.has('vault-unlock')).toBe(true);
    expect(ipcHandleHandlers.has('vault-lock')).toBe(true);
    expect(ipcHandleHandlers.has('vault-disable')).toBe(true);
    expect(ipcHandleHandlers.has('vault-change-passphrase')).toBe(true);
    expect(ipcHandleHandlers.has('vault-recover')).toBe(true);
    expect(ipcHandleHandlers.has('vault-regenerate-recovery-codes')).toBe(true);
    expect(ipcHandleHandlers.has('vault-dismiss-unlock')).toBe(true);

    await expect(ipcHandleHandlers.get('vault-get-status')?.()).resolves.toEqual({
      ok: true,
      data: { enabled: false, unlocked: false, recoveryCodesRemaining: 0 },
    });

    const enabled = await ipcHandleHandlers.get('vault-enable')?.({}, { passphrase: PASSPHRASE });
    expect(enabled).toMatchObject({
      ok: true,
      data: {
        status: { enabled: true, unlocked: true, recoveryCodesRemaining: 8 },
        recoveryCodes: expect.any(Array),
      },
    });
    expect((enabled as { ok: true; data: { recoveryCodes: string[] } }).data.recoveryCodes).toHaveLength(8);
  });
});
