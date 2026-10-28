import { net } from 'electron';
import { URL } from 'url';
import { appLogger } from './app-logger';
import { appVault } from './app-vault';
import { VaultError } from './app-vault.types';
import {
  RemoteUrlRefreshDescriptor,
  RemoteUrlRefreshEntry,
} from './cleepbus/cleepbus.types';

const SECRET_PLACEHOLDER = '{{secret}}';

export function vaultKeyForRemoteRefresh(deviceUuid: string, app: string): string {
  return `remote-refresh:${deviceUuid}:${app}`;
}

type ProviderPayload = {
  descriptor?: RemoteUrlRefreshDescriptor | null;
  secret?: string | null;
};

/**
 * Normalize peer ``get_remote_url_refresh`` response into a cache entry.
 * Returns null when the payload is malformed (caller should skip).
 */
export function parseRemoteUrlRefreshPayload(data: unknown): {
  entry: RemoteUrlRefreshEntry;
  secret: string | null;
} | null {
  if (data === null || data === undefined) {
    return { entry: { supported: false }, secret: null };
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const payload = data as ProviderPayload;
  if (!payload.descriptor || typeof payload.descriptor !== 'object') {
    return { entry: { supported: false }, secret: null };
  }
  const descriptor = payload.descriptor;
  if (typeof descriptor.url !== 'string' || typeof descriptor.method !== 'string') {
    return null;
  }
  const secret = typeof payload.secret === 'string' && payload.secret ? payload.secret : null;
  if (!secret) {
    return { entry: { supported: false }, secret: null };
  }
  return {
    entry: {
      supported: true,
      descriptor: {
        version: Number(descriptor.version) || 1,
        method: descriptor.method,
        url: descriptor.url,
        query: descriptor.query && typeof descriptor.query === 'object' ? descriptor.query : undefined,
        headers:
          descriptor.headers && typeof descriptor.headers === 'object' ? descriptor.headers : undefined,
        extract:
          descriptor.extract && typeof descriptor.extract === 'object' ? descriptor.extract : undefined,
      },
    },
    secret,
  };
}

export async function storeRemoteRefreshSecret(
  deviceUuid: string,
  app: string,
  secret: string,
): Promise<void> {
  await appVault.putSecretAsync(vaultKeyForRemoteRefresh(deviceUuid, app), secret);
}

export async function readRemoteRefreshSecret(
  deviceUuid: string,
  app: string,
): Promise<string | null> {
  try {
    const value = await appVault.getSecretAsync(vaultKeyForRemoteRefresh(deviceUuid, app));
    return typeof value === 'string' ? value : null;
  } catch (error) {
    if (error instanceof VaultError && error.code === 'VAULT_ENTRY_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

function substituteSecret(value: string, secret: string): string {
  return value.split(SECRET_PLACEHOLDER).join(secret);
}

function extractUrlFromJson(body: unknown, extract?: RemoteUrlRefreshDescriptor['extract']): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const listKey = extract?.list || 'endpoints';
  const urlKey = extract?.url || 'url';
  const list = (body as Record<string, unknown>)[listKey];
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const candidate = (item as Record<string, unknown>)[urlKey];
    if (typeof candidate === 'string' && candidate.startsWith('https://')) {
      return candidate;
    }
  }
  return null;
}

/**
 * Execute a refresh descriptor against the provider API.
 * HTTPS only; refuses redirects off the original host.
 */
export async function executeRemoteUrlRefresh(
  descriptor: RemoteUrlRefreshDescriptor,
  secret: string,
): Promise<string> {
  if ((descriptor.method || 'GET').toUpperCase() !== 'GET') {
    throw new Error('Only GET refresh descriptors are supported');
  }

  const url = new URL(descriptor.url);
  if (url.protocol !== 'https:') {
    throw new Error('Refresh descriptor URL must be HTTPS');
  }
  if (descriptor.query) {
    for (const [key, value] of Object.entries(descriptor.query)) {
      url.searchParams.set(key, substituteSecret(String(value), secret));
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (descriptor.headers) {
    for (const [key, value] of Object.entries(descriptor.headers)) {
      headers[key] = substituteSecret(String(value), secret);
    }
  }

  const allowedHost = url.host;
  const response = await net.fetch(url.toString(), {
    method: 'GET',
    headers,
    redirect: 'manual',
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') || '';
    try {
      const next = new URL(location, url);
      if (next.host !== allowedHost || next.protocol !== 'https:') {
        throw new Error('Refresh redirect left the descriptor host');
      }
    } catch {
      throw new Error('Refresh redirect rejected');
    }
    throw new Error('Refresh redirects are not followed');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = (await response.json()) as { msg?: string; message?: string; error_code?: string };
      detail = errBody.msg || errBody.message || errBody.error_code || '';
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(
      detail
        ? `Provider returned HTTP ${response.status}: ${detail}`
        : `Provider returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Provider returned invalid JSON');
  }

  const publicUrl = extractUrlFromJson(body, descriptor.extract);
  if (!publicUrl) {
    throw new Error('No active public URL in provider response (tunnel may be down)');
  }
  appLogger.info('Remote URL refreshed from provider', { host: allowedHost });
  return publicUrl;
}
