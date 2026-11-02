import { appVault } from './app-vault';
import { VaultError } from './app-vault.types';

export type DeveloperSshSecret = {
  username: string;
  password: string;
};

export function developerSshVaultKey(deviceUuid: string): string {
  return `dev-ssh:${deviceUuid}`;
}

export function hasDeveloperSshSecret(deviceUuid: string): boolean {
  const uuid = String(deviceUuid || '').trim();
  if (!uuid) {
    return false;
  }
  try {
    return appVault.hasSecret(developerSshVaultKey(uuid));
  } catch {
    return false;
  }
}

export async function getDeveloperSshSecret(deviceUuid: string): Promise<DeveloperSshSecret | null> {
  const uuid = String(deviceUuid || '').trim();
  if (!uuid) {
    return null;
  }
  try {
    if (!appVault.hasSecret(developerSshVaultKey(uuid))) {
      return null;
    }
    const secret = (await appVault.getSecretAsync(developerSshVaultKey(uuid))) as DeveloperSshSecret;
    const username = String(secret?.username || 'root').trim() || 'root';
    const password = String(secret?.password || '');
    if (!password) {
      return null;
    }
    return { username, password };
  } catch (error) {
    if (error instanceof VaultError && error.code === 'VAULT_ENTRY_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

export async function saveDeveloperSshSecret(
  deviceUuid: string,
  password: string,
  username = 'root',
): Promise<void> {
  const uuid = String(deviceUuid || '').trim();
  if (!uuid) {
    throw new Error('Development device is required to save SSH credentials');
  }
  const pass = String(password || '');
  if (!pass) {
    throw new Error('SSH password is required');
  }
  await appVault.putSecretAsync(developerSshVaultKey(uuid), {
    username: String(username || 'root').trim() || 'root',
    password: pass,
  } satisfies DeveloperSshSecret);
}

export async function deleteDeveloperSshSecret(deviceUuid: string): Promise<boolean> {
  const uuid = String(deviceUuid || '').trim();
  if (!uuid) {
    return false;
  }
  await appVault.ensureUnlocked();
  return appVault.deleteSecret(developerSshVaultKey(uuid));
}
