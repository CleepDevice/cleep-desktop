import { BrowserWindow } from 'electron';
import { appLogger } from './app-logger';
import { appVault } from './app-vault';
import { VaultError } from './app-vault.types';
import { handleInvoke, ipcOk, sendToRenderer } from './ipc/ipc-main';

export interface IAuth {
  deviceUuid: string;
  account: string;
  password: string;
  attempts: number;
  timestamp: number;
}

export interface IAuthEvent {
  url: string;
  deviceUuid: string;
  account: string;
  password: string;
  /** Persist credentials in the application vault (requires vault enabled). */
  saveToVault?: boolean;
}

type DeviceAuthSecret = {
  account: string;
  password: string;
  host: string;
  deviceUuid: string;
};

export const MAX_AUTH_ATTEMPTS = 5;
const TTL = 30 * 60 * 1000; // 30 mins in ms
const PURGE_DELAY = 5 * 60 * 1000; // 5 mins in ms

export function deviceAuthVaultKey(deviceUuid: string): string {
  return `device-auth:${deviceUuid}`;
}

class AppAuth {
  private auths: Record<string, IAuth> = {};
  private window: BrowserWindow;

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();

    setInterval(this.purgeObsoleteAuths.bind(this), PURGE_DELAY);
  }

  public getAuth(url: string): IAuth {
    const key = (url || '').trim().toLowerCase();
    if (this.auths[key]) {
      this.auths[key].attempts += 1;
    }
    return this.auths[key];
  }

  public resetAuthAttempts(url: string): void {
    const key = (url || '').trim().toLowerCase();
    if (this.auths[key]?.attempts) {
      this.auths[key].attempts = 0;
    }
  }

  /** True when credentials exist in session memory or (enabled) vault. */
  public hasStoredAuth(deviceUuid: string): boolean {
    if (Object.values(this.auths).some((auth) => auth.deviceUuid === deviceUuid)) {
      return true;
    }
    try {
      return appVault.hasSecret(deviceAuthVaultKey(deviceUuid));
    } catch {
      return false;
    }
  }

  /**
   * Rebind stored credentials when a device keeps its MACs but changes uuid
   * (e.g. core regenerated instance uuid).
   */
  public rebindDeviceUuid(previousUuid: string, nextUuid: string): void {
    if (!previousUuid || !nextUuid || previousUuid === nextUuid) {
      return;
    }

    for (const auth of Object.values(this.auths)) {
      if (auth.deviceUuid === previousUuid) {
        auth.deviceUuid = nextUuid;
      }
    }

    try {
      if (!appVault.isEnabled()) {
        return;
      }
      const previousKey = deviceAuthVaultKey(previousUuid);
      const nextKey = deviceAuthVaultKey(nextUuid);
      if (!appVault.hasSecret(previousKey) || appVault.hasSecret(nextKey)) {
        return;
      }
      const secret = appVault.getSecret(previousKey) as DeviceAuthSecret;
      appVault.putSecret(nextKey, { ...secret, deviceUuid: nextUuid });
      appVault.deleteSecret(previousKey);
      appLogger.info('Rebound device auth vault key after uuid change', {
        previousUuid,
        nextUuid,
      });
    } catch (error) {
      appLogger.warn('Unable to rebind device auth vault key', {
        previousUuid,
        nextUuid,
        error,
      });
    }
  }

  /**
   * Resolve credentials for an HTTP auth challenge.
   * Memory first, then vault (may prompt unlock).
   */
  public async resolveAuth(host: string, deviceUuid?: string): Promise<IAuth | undefined> {
    const normalizedHost = (host || '').trim().toLowerCase();
    const cached = this.auths[normalizedHost];
    if (cached) {
      cached.attempts += 1;
      cached.timestamp = Date.now();
      return cached;
    }

    if (!deviceUuid) {
      return undefined;
    }

    try {
      if (!appVault.isEnabled() || !appVault.hasSecret(deviceAuthVaultKey(deviceUuid))) {
        return undefined;
      }
      const secret = (await appVault.getSecretAsync(deviceAuthVaultKey(deviceUuid))) as DeviceAuthSecret;
      if (!secret?.account || typeof secret.password !== 'string') {
        return undefined;
      }

      this.storeInMemory(
        normalizedHost,
        {
          account: secret.account,
          password: secret.password,
          deviceUuid,
        },
        this.collectHostAliases(deviceUuid, normalizedHost),
      );
      const loaded = this.auths[normalizedHost];
      if (loaded) {
        loaded.attempts = 1;
      }
      appLogger.info('Loaded device auth from vault', { host: normalizedHost, deviceUuid });
      return loaded;
    } catch (error) {
      if (error instanceof VaultError && error.code === 'VAULT_UNLOCK_CANCELLED') {
        appLogger.info('Vault unlock cancelled while resolving device auth', { host: normalizedHost });
        return undefined;
      }
      appLogger.warn('Unable to load device auth from vault', { host: normalizedHost, error });
      return undefined;
    }
  }

  private storeInMemory(
    host: string,
    auth: Omit<IAuth, 'attempts' | 'timestamp'>,
    aliases: string[] = [],
  ): void {
    const entry: IAuth = {
      ...auth,
      attempts: 0,
      timestamp: Date.now(),
    };
    this.auths[host] = entry;
    // Same credentials must resolve for LAN IP, hostname and remote (ngrok) host
    for (const alias of aliases) {
      const key = (alias || '').trim().toLowerCase();
      if (key && key !== host) {
        this.auths[key] = entry;
      }
    }
  }

  private async persistAuthToVault(auth: IAuthEvent, host: string): Promise<void> {
    await appVault.putSecretAsync(deviceAuthVaultKey(auth.deviceUuid), {
      account: auth.account,
      password: auth.password,
      host,
      deviceUuid: auth.deviceUuid,
    } satisfies DeviceAuthSecret);
    appLogger.info('Device auth stored in vault', { deviceUuid: auth.deviceUuid });
  }

  private purgeObsoleteAuths(): void {
    const now = Date.now();
    const authUrlToDelete = Object.entries(this.auths).reduce<string[]>((acc, [url, auth]) => {
      if (now >= auth.timestamp + TTL) {
        acc.push(url);
      }
      return acc;
    }, []);

    for (const url of authUrlToDelete) {
      const deviceUuid = this.auths[url].deviceUuid;
      appLogger.debug('Purging auth for url', { url });

      sendToRenderer(this.window, 'device-auth-updated', {
        deviceUuid,
        hasAuthStored: this.hasStoredAuthAfterMemoryDelete(deviceUuid, url),
      });

      delete this.auths[url];
    }
  }

  private hasStoredAuthAfterMemoryDelete(deviceUuid: string, hostToIgnore: string): boolean {
    if (
      Object.entries(this.auths).some(
        ([host, auth]) => host !== hostToIgnore && auth.deviceUuid === deviceUuid,
      )
    ) {
      return true;
    }
    try {
      return appVault.hasSecret(deviceAuthVaultKey(deviceUuid));
    } catch {
      return false;
    }
  }

  private addIpcs(): void {
    handleInvoke('update-device-auth', async (_event, auth) => {
      appLogger.debug('Add new auth data', {
        deviceUuid: auth.deviceUuid,
        saveToVault: Boolean(auth.saveToVault),
      });

      const url = new URL(auth.url);
      const host = url.hostname.toLowerCase();
      // Do not block sign-in on vault unlock — persist in background.
      // Awaiting putSecretAsync here deadlocked when the unlock dialog failed to show.
      this.storeInMemory(
        host,
        {
          account: auth.account,
          password: auth.password,
          deviceUuid: auth.deviceUuid,
        },
        this.collectHostAliases(auth.deviceUuid, host),
      );

      if (auth.saveToVault) {
        void this.persistAuthToVault(auth, host).catch((error) => {
          if (error instanceof VaultError && error.code === 'VAULT_UNLOCK_CANCELLED') {
            appLogger.info('Vault unlock cancelled while saving device auth', {
              deviceUuid: auth.deviceUuid,
            });
            return;
          }
          appLogger.warn('Unable to persist device auth to vault', {
            deviceUuid: auth.deviceUuid,
            error,
          });
        });
      }

      sendToRenderer(this.window, 'device-auth-updated', {
        deviceUuid: auth.deviceUuid,
        hasAuthStored: true,
      });

      return ipcOk(true as const);
    });

    /** Warm session auth from vault before opening a device webview. */
    handleInvoke('devices-prepare-auth', async (_event, request) => {
      const host = new URL(request.url).hostname.toLowerCase();
      const auth = await this.resolveAuth(host, request.deviceUuid);
      if (auth) {
        // Mirror under LAN aliases so a later challenge on IP/hostname still matches
        this.storeInMemory(host, {
          account: auth.account,
          password: auth.password,
          deviceUuid: auth.deviceUuid,
        }, this.collectHostAliases(request.deviceUuid, host));
      }
      return ipcOk({ ready: Boolean(auth) });
    });
  }

  private collectHostAliases(deviceUuid: string, primaryHost: string): string[] {
    const aliases = new Set<string>();
    const device = this.findDeviceByUuid(deviceUuid);
    if (device?.ip) {
      aliases.add(device.ip.toLowerCase());
    }
    if (device?.hostname) {
      aliases.add(device.hostname.toLowerCase());
    }
    aliases.delete(primaryHost.toLowerCase());
    return [...aliases];
  }

  private findDeviceByUuid(deviceUuid: string): { ip?: string; hostname?: string } | undefined {
    // Lazy require avoids the app-devices ↔ app-auth circular import at module load
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { appDevices } = require('./app-devices') as {
        appDevices: { getDevice: (uuid: string) => { ip?: string; hostname?: string } | undefined };
      };
      return appDevices.getDevice(deviceUuid);
    } catch {
      return undefined;
    }
  }
}

export const appAuth = new AppAuth();
