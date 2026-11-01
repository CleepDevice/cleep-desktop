import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { appLogger } from './app-logger';
import { appVault } from './app-vault';
import { VaultError } from './app-vault.types';

/** Vault fallback when OS safeStorage is unusable (e.g. basic_text). */
export const VAULT_SESSION_KEY = 'website-session';
const LEGACY_VAULT_SESSION_KEY = 'website-auth';

export type WebsiteSessionSecret = {
  accessToken: string;
  email: string;
  nickname: string;
  role: string;
  jti: string;
};

export type SessionStoreBackend = 'os' | 'vault' | 'none';

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'website-session.enc');
}

/** Linux backend name, or platform id on Win/mac. */
export function getSafeStorageBackendName(): string {
  if (!app.isReady()) {
    return 'unknown';
  }
  if (process.platform === 'linux') {
    return safeStorage.getSelectedStorageBackend();
  }
  return process.platform;
}

/**
 * True when Electron can protect data with a real OS secret store.
 * Rejects ``basic_text`` (hardcoded key) and pre-ready ``unknown``.
 */
export function isOsSafeStorageUsable(): boolean {
  if (!app.isReady()) {
    return false;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }
  const backend = getSafeStorageBackendName();
  if (backend === 'basic_text' || backend === 'unknown') {
    return false;
  }
  return true;
}

export function logSafeStorageStatus(): void {
  const backend = getSafeStorageBackendName();
  const available = app.isReady() ? safeStorage.isEncryptionAvailable() : false;
  const usable = isOsSafeStorageUsable();
  appLogger.info('safeStorage status', { backend, available, usable });
}

/** Persist Bearer session: OS safeStorage first, else Cleep vault. */
export async function saveWebsiteSession(secret: WebsiteSessionSecret): Promise<SessionStoreBackend> {
  if (saveWebsiteSessionToOs(secret)) {
    // Prefer a single store — drop vault copy if OS works.
    deleteWebsiteSessionFromVaultLazy();
    return 'os';
  }

  if (await saveWebsiteSessionToVault(secret)) {
    return 'vault';
  }

  return 'none';
}

export function loadWebsiteSession(): WebsiteSessionSecret | null {
  const fromOs = loadWebsiteSessionFromOs();
  if (fromOs) {
    return fromOs;
  }
  return loadWebsiteSessionFromVaultIfUnlocked();
}

export function clearWebsiteSessionStores(): void {
  clearWebsiteSessionFromOs();
  deleteWebsiteSessionFromVaultLazy();
  deleteLegacyVaultSessionLazy();
}

function saveWebsiteSessionToOs(secret: WebsiteSessionSecret): boolean {
  try {
    if (!isOsSafeStorageUsable()) {
      return false;
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(secret));
    fs.writeFileSync(sessionFilePath(), encrypted);
    appLogger.debug('Website session saved via OS safeStorage', {
      backend: getSafeStorageBackendName(),
    });
    return true;
  } catch (error) {
    appLogger.warn('OS safeStorage session save failed', { error });
    return false;
  }
}

function loadWebsiteSessionFromOs(): WebsiteSessionSecret | null {
  try {
    const filePath = sessionFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    if (!isOsSafeStorageUsable()) {
      return null;
    }
    const encrypted = fs.readFileSync(filePath);
    const json = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(json) as WebsiteSessionSecret;
    if (!parsed?.accessToken || !parsed.email || !parsed.jti) {
      return null;
    }
    appLogger.debug('Website session loaded via OS safeStorage', {
      backend: getSafeStorageBackendName(),
    });
    return parsed;
  } catch (error) {
    appLogger.warn('OS safeStorage session load failed', { error });
    return null;
  }
}

function clearWebsiteSessionFromOs(): void {
  try {
    const filePath = sessionFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    appLogger.warn('Unable to clear OS website session file', { error });
  }
}

async function saveWebsiteSessionToVault(secret: WebsiteSessionSecret): Promise<boolean> {
  if (!appVault.isEnabled()) {
    return false;
  }
  try {
    await appVault.putSecretAsync(VAULT_SESSION_KEY, { ...secret });
    deleteLegacyVaultSessionLazy();
    appLogger.info('Website session saved to Cleep vault (OS safeStorage unavailable)');
    return true;
  } catch (error) {
    if (error instanceof VaultError && error.code === 'VAULT_UNLOCK_CANCELLED') {
      appLogger.info('Website session not saved (vault unlock cancelled)');
      return false;
    }
    appLogger.warn('Unable to save website session to vault', { error });
    return false;
  }
}

function loadWebsiteSessionFromVaultIfUnlocked(): WebsiteSessionSecret | null {
  try {
    if (!appVault.isEnabled() || !appVault.isUnlocked()) {
      return null;
    }
    migrateLegacyVaultSessionIfNeeded();
    if (!appVault.hasSecret(VAULT_SESSION_KEY)) {
      return null;
    }
    const secret = appVault.getSecret(VAULT_SESSION_KEY) as WebsiteSessionSecret;
    if (!secret?.accessToken || !secret.email || !secret.jti) {
      return null;
    }
    appLogger.debug('Website session loaded from Cleep vault');
    return secret;
  } catch (error) {
    appLogger.debug('Vault website session load skipped', { error });
    return null;
  }
}

function migrateLegacyVaultSessionIfNeeded(): void {
  try {
    if (!appVault.hasSecret(LEGACY_VAULT_SESSION_KEY)) {
      return;
    }
    if (appVault.hasSecret(VAULT_SESSION_KEY)) {
      appVault.deleteSecret(LEGACY_VAULT_SESSION_KEY);
      return;
    }
    const secret = appVault.getSecret(LEGACY_VAULT_SESSION_KEY) as WebsiteSessionSecret;
    if (secret?.accessToken && secret.email && secret.jti) {
      appVault.putSecret(VAULT_SESSION_KEY, secret);
    }
    appVault.deleteSecret(LEGACY_VAULT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function deleteWebsiteSessionFromVaultLazy(): void {
  try {
    if (!appVault.isEnabled() || !appVault.hasSecret(VAULT_SESSION_KEY)) {
      return;
    }
    if (appVault.isUnlocked()) {
      appVault.deleteSecret(VAULT_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

function deleteLegacyVaultSessionLazy(): void {
  try {
    if (!appVault.isEnabled() || !appVault.hasSecret(LEGACY_VAULT_SESSION_KEY)) {
      return;
    }
    if (appVault.isUnlocked()) {
      appVault.deleteSecret(LEGACY_VAULT_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}
