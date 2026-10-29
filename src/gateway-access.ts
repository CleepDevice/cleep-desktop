import { appVault } from './app-vault';
import { VaultError } from './app-vault.types';

export type GatewayAccessInfo = {
  token: string;
  headerAuth?: string;
  headerTarget?: string;
  peersPath?: string;
};

export function vaultKeyForGatewayAccess(deviceUuid: string, app: string): string {
  return `gateway-access:${deviceUuid}:${app}`;
}

export function parseGatewayAccess(data: unknown): GatewayAccessInfo | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const gateway = (data as { gateway?: unknown }).gateway;
  if (!gateway || typeof gateway !== 'object' || Array.isArray(gateway)) {
    return null;
  }
  const token = (gateway as { token?: unknown }).token;
  if (typeof token !== 'string' || !token) {
    return null;
  }
  const info = gateway as {
    token: string;
    header_auth?: string;
    header_target?: string;
    peers_path?: string;
  };
  return {
    token: info.token,
    headerAuth: typeof info.header_auth === 'string' ? info.header_auth : undefined,
    headerTarget: typeof info.header_target === 'string' ? info.header_target : undefined,
    peersPath: typeof info.peers_path === 'string' ? info.peers_path : undefined,
  };
}

/** Cache gateway token without prompting to unlock (queued if vault is locked). */
export async function storeGatewayAccess(
  deviceUuid: string,
  app: string,
  access: GatewayAccessInfo,
): Promise<void> {
  appVault.putSecretLazy(vaultKeyForGatewayAccess(deviceUuid, app), access);
}

export async function readGatewayAccess(
  deviceUuid: string,
  app?: string,
): Promise<GatewayAccessInfo | null> {
  const apps = app ? [app] : ['ngrok'];
  for (const appName of apps) {
    try {
      const value = await appVault.getSecretAsync(vaultKeyForGatewayAccess(deviceUuid, appName));
      if (value && typeof value === 'object' && typeof (value as GatewayAccessInfo).token === 'string') {
        return value as GatewayAccessInfo;
      }
    } catch (error) {
      if (error instanceof VaultError && error.code === 'VAULT_ENTRY_NOT_FOUND') {
        continue;
      }
      throw error;
    }
  }
  return null;
}
