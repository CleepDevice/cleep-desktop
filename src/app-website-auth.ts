import axios from 'axios';
import { BrowserWindow } from 'electron';
import { appLogger } from './app-logger';
import { appSettings } from './app-settings';
import { appVault } from './app-vault';
import { VaultError } from './app-vault.types';
import { handleInvoke, ipcErr, ipcOk, sendToRenderer } from './ipc/ipc-main';
import {
  clearWebsiteSessionStores,
  loadWebsiteSession,
  logSafeStorageStatus,
  saveWebsiteSession,
  type WebsiteSessionSecret,
} from './website-session-store';

/** Email/password for website login autofill — Cleep vault only. */
const VAULT_CREDS_KEY = 'website-credentials';

export type WebsiteAuthSession = {
  email: string;
  nickname: string;
  role: string;
  jti: string;
  /** True when the Bearer token is loaded in memory. */
  authenticated: boolean;
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

type DesktopLoginResponse = {
  accessToken: string;
  expiresIn: number;
  email: string;
  nickname?: string;
  role: string;
  jti: string;
};

class AppWebsiteAuth {
  private session: WebsiteSessionSecret | null = null;
  private window: BrowserWindow | null = null;

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();
    logSafeStorageStatus();
    this.hydrateSession();
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

    // Bearer: OS safeStorage first, Cleep vault fallback. Creds: vault only.
    const backend = await saveWebsiteSession(this.session);
    appLogger.info('Website session persisted', { backend });
    await this.saveCredentialsToVault(email.trim(), password);

    const session = this.getSession();
    this.emitChanged(session);
    return session;
  }

  /**
   * Unseal vault if enabled (creds autofill). Also restores Bearer from vault when
   * OS safeStorage did not hold a session (fallback path).
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

    // Vault unlock may expose a fallback-stored Bearer.
    this.hydrateSession();

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

  /** Called when vault becomes unlocked — restore Bearer if stored as vault fallback. */
  public onVaultUnlocked(): void {
    this.hydrateSession();
  }

  private clearLocal(): void {
    // Clear Bearer stores; vault login credentials stay for autofill.
    this.session = null;
    appSettings.set('cleep.websitenickname', '');
    clearWebsiteSessionStores();
  }

  private hydrateSession(): void {
    if (this.session) {
      return;
    }
    const secret = loadWebsiteSession();
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
    this.emitChanged(this.getSession());
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
      this.hydrateSession();
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
