import axios from 'axios';
import { app, BrowserWindow, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { appLogger } from './app-logger';
import { appSettings } from './app-settings';
import { appVault } from './app-vault';
import { VaultError } from './app-vault.types';
import { handleInvoke, ipcErr, ipcOk, sendToRenderer } from './ipc/ipc-main';

/**
 * Legacy vault key (pre safeStorage). Migrated once when vault unlocks, then deleted.
 * Website session Bearer lives outside the vault so startup restore needs no unseal.
 */
const LEGACY_VAULT_KEY = 'website-auth';

/** Email/password for website login — vault only (unseal on Sign in). */
const VAULT_CREDS_KEY = 'website-credentials';

export type WebsiteAuthSession = {
  email: string;
  nickname: string;
  role: string;
  jti: string;
  /** True when the Bearer token is loaded in memory. */
  authenticated: boolean;
  /**
   * True when the session was persisted with OS safeStorage (outside the vault).
   * Credentials (email/password) live in the vault separately.
   */
  persisted: boolean;
  /** @deprecated use persisted */
  storedInVault?: boolean;
};

/** Prefill payload for the Sign in dialog (from vault after unseal). */
export type WebsiteLoginCredentials = {
  email: string;
  password: string;
  /** True when email/password came from the vault. */
  fromVault: boolean;
};

type WebsiteCredentialsSecret = {
  email: string;
  password: string;
};

type WebsiteAuthSecret = {
  accessToken: string;
  email: string;
  nickname: string;
  role: string;
  jti: string;
};

type DesktopLoginResponse = {
  accessToken: string;
  expiresIn: number;
  email: string;
  nickname?: string;
  role: string;
  jti: string;
};

class AppWebsiteAuth {
  private session: WebsiteAuthSecret | null = null;
  private window: BrowserWindow | null = null;
  private sessionPersisted = false;

  private sessionFilePath(): string {
    return path.join(app.getPath('userData'), 'website-session.enc');
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();
    this.hydrateFromDisk();
  }

  /** Absolute API base from Preferences → Network (empty if not configured). */
  public getApiBaseUrl(): string {
    return (appSettings.get<string>('cleep.apiurl') || '').trim().replace(/\/+$/, '');
  }

  public hasConfiguredApiUrl(): boolean {
    return this.getApiBaseUrl().length > 0;
  }

  public getSession(): WebsiteAuthSession {
    if (this.session) {
      return {
        email: this.session.email,
        nickname: this.session.nickname || this.session.email,
        role: this.session.role,
        jti: this.session.jti,
        authenticated: true,
        persisted: this.sessionPersisted,
        storedInVault: this.sessionPersisted,
      };
    }
    const email = (appSettings.get<string>('cleep.websiteemail') || '').trim();
    const nickname = (appSettings.get<string>('cleep.websitenickname') || '').trim();
    return {
      email,
      nickname,
      role: '',
      jti: '',
      authenticated: false,
      persisted: false,
      storedInVault: false,
    };
  }

  /** Bearer token for Nest API calls, or null if not signed in. */
  public getAccessToken(): string | null {
    return this.session?.accessToken || null;
  }

  public async login(email: string, password: string): Promise<WebsiteAuthSession> {
    const apiBase = this.getApiBaseUrl();
    if (!apiBase) {
      throw {
        code: 'WEBSITE_API_URL_MISSING',
        message: 'Set the Cleep API URL in Preferences → Network first.',
      };
    }
    let data: DesktopLoginResponse;
    try {
      const response = await axios.post<DesktopLoginResponse>(
        `${apiBase}/desktop/login`,
        { email: email.trim(), password },
        {
          timeout: 20_000,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          validateStatus: () => true,
        },
      );
      if (response.status < 200 || response.status >= 300) {
        throw this.mapLoginError(response.status, response.data);
      }
      data = response.data;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }
      appLogger.warn('Desktop website login failed', { error });
      throw {
        code: 'WEBSITE_LOGIN_NETWORK',
        message: 'Unable to reach Cleep website. Check your network or API URL.',
      };
    }

    if (!data?.accessToken || !data.email || !data.jti) {
      throw {
        code: 'WEBSITE_LOGIN_INVALID_RESPONSE',
        message: 'Unexpected response from Cleep website.',
      };
    }

    const nickname = (data.nickname || '').trim() || data.email;
    this.session = {
      accessToken: data.accessToken,
      email: data.email,
      nickname,
      role: data.role || 'user',
      jti: data.jti,
    };
    appSettings.set('cleep.websiteemail', data.email);
    appSettings.set('cleep.websitenickname', nickname);

    this.sessionPersisted = this.persistToDisk(this.session);
    if (!this.sessionPersisted) {
      appLogger.warn('Website session kept in memory only (OS encryption unavailable)');
    }

    // Drop any legacy vault copy so vault is no longer required for website session.
    this.clearLegacyVaultEntryLazy();

    // Store email/password in vault for next Sign in (prompts unseal if needed).
    await this.saveCredentialsToVault(email.trim(), password);

    const session = this.getSession();
    this.emitChanged(session);
    return session;
  }

  /**
   * Unseal vault if enabled and return stored website credentials for the login dialog.
   * Does not prompt when vault is disabled. Cancelled unlock → empty password + settings email.
   */
  public async loadCredentialsForLogin(): Promise<WebsiteLoginCredentials> {
    const fallbackEmail = (appSettings.get<string>('cleep.websiteemail') || '').trim();
    const empty: WebsiteLoginCredentials = {
      email: fallbackEmail,
      password: '',
      fromVault: false,
    };

    if (!appVault.isEnabled()) {
      return empty;
    }

    try {
      await appVault.ensureUnlocked();
    } catch (error) {
      if (error instanceof VaultError && error.code === 'VAULT_UNLOCK_CANCELLED') {
        appLogger.info('Vault unlock cancelled while loading website credentials');
        return empty;
      }
      appLogger.warn('Unable to unlock vault for website credentials', { error });
      return empty;
    }

    try {
      if (!appVault.hasSecret(VAULT_CREDS_KEY)) {
        return empty;
      }
      const secret = appVault.getSecret(VAULT_CREDS_KEY) as WebsiteCredentialsSecret;
      const email = (secret?.email || '').trim();
      const password = typeof secret?.password === 'string' ? secret.password : '';
      if (!email || !password) {
        return empty;
      }
      return { email, password, fromVault: true };
    } catch (error) {
      if (error instanceof VaultError && error.code === 'VAULT_ENTRY_NOT_FOUND') {
        return empty;
      }
      appLogger.warn('Unable to read website credentials from vault', { error });
      return empty;
    }
  }

  private async saveCredentialsToVault(email: string, password: string): Promise<void> {
    if (!appVault.isEnabled() || !email || !password) {
      return;
    }
    try {
      await appVault.putSecretAsync(VAULT_CREDS_KEY, { email, password } satisfies WebsiteCredentialsSecret);
      appLogger.debug('Website credentials saved to vault');
    } catch (error) {
      if (error instanceof VaultError && error.code === 'VAULT_UNLOCK_CANCELLED') {
        appLogger.info('Website credentials not saved (vault unlock cancelled)');
        return;
      }
      appLogger.warn('Unable to save website credentials to vault', { error });
    }
  }

  public async logout(): Promise<WebsiteAuthSession> {
    const token = this.session?.accessToken;
    const apiBase = this.getApiBaseUrl();

    if (token && apiBase) {
      try {
        await axios.post(
          `${apiBase}/desktop/logout`,
          {},
          {
            timeout: 15_000,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            validateStatus: () => true,
          },
        );
      } catch (error) {
        appLogger.warn('Desktop website logout request failed (continuing local clear)', { error });
      }
    }

    this.clearLocal();
    const session = this.getSession();
    this.emitChanged(session);
    return session;
  }

  private clearLocal(): void {
    // Clear session only — vault credentials stay for the next Sign in autofill.
    this.session = null;
    this.sessionPersisted = false;
    appSettings.set('cleep.websitenickname', '');
    this.clearDisk();
    this.clearLegacyVaultEntryLazy();
  }

  /** Restore Bearer session from OS-encrypted file (no vault unseal). */
  private hydrateFromDisk(): void {
    try {
      const secret = this.loadFromDisk();
      if (!secret?.accessToken || !secret.email || !secret.jti) {
        return;
      }
      const nickname = (secret.nickname || '').trim() || secret.email;
      this.session = {
        accessToken: secret.accessToken,
        email: secret.email,
        nickname,
        role: secret.role || 'user',
        jti: secret.jti,
      };
      this.sessionPersisted = true;
      appSettings.set('cleep.websiteemail', secret.email);
      appSettings.set('cleep.websitenickname', nickname);
      this.emitChanged(this.getSession());
      appLogger.debug('Website session restored from safeStorage');
    } catch (error) {
      appLogger.warn('Unable to restore website session from disk', { error });
      this.clearDisk();
    }
  }

  /**
   * After vault unlock: migrate legacy vault-stored website token to safeStorage once.
   */
  public onVaultUnlocked(): void {
    if (this.session) {
      return;
    }
    try {
      if (!appVault.isEnabled() || !appVault.isUnlocked() || !appVault.hasSecret(LEGACY_VAULT_KEY)) {
        return;
      }
      const secret = appVault.getSecret(LEGACY_VAULT_KEY) as WebsiteAuthSecret;
      if (!secret?.accessToken || !secret.email || !secret.jti) {
        return;
      }
      const nickname = (secret.nickname || '').trim() || secret.email;
      this.session = {
        accessToken: secret.accessToken,
        email: secret.email,
        nickname,
        role: secret.role || 'user',
        jti: secret.jti,
      };
      appSettings.set('cleep.websiteemail', secret.email);
      appSettings.set('cleep.websitenickname', nickname);
      this.sessionPersisted = this.persistToDisk(this.session);
      try {
        appVault.deleteSecret(LEGACY_VAULT_KEY);
      } catch {
        /* ignore */
      }
      this.emitChanged(this.getSession());
      appLogger.info('Migrated legacy website session from vault to safeStorage');
    } catch (error) {
      appLogger.debug('Legacy website vault migrate skipped', { error });
    }
  }

  private persistToDisk(secret: WebsiteAuthSecret): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return false;
      }
      const payload = Buffer.from(JSON.stringify(secret), 'utf8');
      const encrypted = safeStorage.encryptString(payload.toString('utf8'));
      fs.writeFileSync(this.sessionFilePath(), encrypted);
      return true;
    } catch (error) {
      appLogger.warn('Unable to persist website session', { error });
      return false;
    }
  }

  private loadFromDisk(): WebsiteAuthSecret | null {
    const filePath = this.sessionFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }
    const encrypted = fs.readFileSync(filePath);
    const json = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(json) as WebsiteAuthSecret;
    return parsed;
  }

  private clearDisk(): void {
    try {
      const filePath = this.sessionFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      appLogger.warn('Unable to clear website session file', { error });
    }
  }

  private clearLegacyVaultEntryLazy(): void {
    try {
      if (!appVault.isEnabled() || !appVault.hasSecret(LEGACY_VAULT_KEY)) {
        return;
      }
      if (appVault.isUnlocked()) {
        appVault.deleteSecret(LEGACY_VAULT_KEY);
        return;
      }
      // Do not prompt unlock just to delete legacy key.
    } catch {
      /* ignore */
    }
  }

  private emitChanged(session: WebsiteAuthSession): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    sendToRenderer(this.window, 'website-auth-changed', session);
  }

  private mapLoginError(status: number, body: unknown): { code: string; message: string } {
    const name =
      body && typeof body === 'object' && body !== null && 'name' in body
        ? String((body as { name?: string }).name || '')
        : '';
    if (name === 'ERROR_INVALID_CREDENTIALS' || status === 401 || status === 404) {
      return {
        code: 'WEBSITE_LOGIN_INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      };
    }
    if (status === 429) {
      return {
        code: 'WEBSITE_LOGIN_RATE_LIMIT',
        message: 'Too many login attempts. Please try again later.',
      };
    }
    return {
      code: 'WEBSITE_LOGIN_FAILED',
      message: 'Sign-in failed. Please try again.',
    };
  }

  private addIpcs(): void {
    handleInvoke('website-auth-get-session', () => {
      if (!this.session) {
        this.hydrateFromDisk();
      }
      return ipcOk(this.getSession());
    });

    handleInvoke('website-auth-load-credentials', async () => {
      try {
        return ipcOk(await this.loadCredentialsForLogin());
      } catch (error) {
        appLogger.warn('website-auth-load-credentials failed', { error });
        return ipcOk({
          email: (appSettings.get<string>('cleep.websiteemail') || '').trim(),
          password: '',
          fromVault: false,
        } satisfies WebsiteLoginCredentials);
      }
    });

    handleInvoke('website-auth-login', async (_event, request) => {
      try {
        const session = await this.login(request.email, request.password);
        return ipcOk(session);
      } catch (error) {
        const err = error as { code?: string; message?: string };
        appLogger.warn('website-auth-login failed', { code: err?.code, message: err?.message });
        return ipcErr(err?.code || 'WEBSITE_LOGIN_FAILED', err?.message || 'Sign-in failed');
      }
    });

    handleInvoke('website-auth-logout', async () => {
      try {
        const session = await this.logout();
        return ipcOk(session);
      } catch (error) {
        appLogger.error('website-auth-logout failed', { error });
        this.clearLocal();
        return ipcOk(this.getSession());
      }
    });

    handleInvoke('website-auth-get-api-url', () => ipcOk(this.getApiBaseUrl()));
  }
}

export const appWebsiteAuth = new AppWebsiteAuth();
