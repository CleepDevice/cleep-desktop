import type { Session } from 'electron';
import {
  CLEEP_DESKTOP_EMBED_HEADER,
  CLEEP_DESKTOP_EMBED_VALUE,
} from './cleep-desktop-embed';
import { NGROK_SKIP_BROWSER_WARNING_HEADER } from './ngrok';

export const GATEWAY_AUTH_HEADER = 'X-Cleep-Gateway-Auth';
export const GATEWAY_TARGET_HEADER = 'X-Cleep-Gateway-Target';

export type GatewayWebviewBinding = {
  deviceUuid: string;
  /** Device that owns the public tunnel (token source). */
  gatewayDeviceUuid: string;
  gatewayToken: string;
};

const bindings = new Map<number, GatewayWebviewBinding>();

/** Remember which device a webview is browsing (for auth + gateway Target). */
export function bindGatewayWebview(webContentsId: number, binding: GatewayWebviewBinding): void {
  bindings.set(webContentsId, binding);
}

export function unbindGatewayWebview(webContentsId: number): void {
  bindings.delete(webContentsId);
}

export function getGatewayWebviewBinding(webContentsId: number): GatewayWebviewBinding | undefined {
  return bindings.get(webContentsId);
}

function isNgrokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'ngrok-free.app' ||
      host.endsWith('.ngrok-free.app') ||
      host === 'ngrok-free.dev' ||
      host.endsWith('.ngrok-free.dev') ||
      host === 'ngrok.app' ||
      host.endsWith('.ngrok.app') ||
      host === 'ngrok.io' ||
      host.endsWith('.ngrok.io')
    );
  } catch {
    return false;
  }
}

/**
 * Single onBeforeSendHeaders for device webviews:
 * - always mark the request as CleepDesktop-embedded
 * - on ngrok hosts: skip free interstitial + optional gateway Auth/Target
 *
 * Must be the only listener (Electron keeps one handler per session filter set).
 */
export function installGatewayHeaders(session: Session): void {
  session.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
    const requestHeaders: Record<string, string> = {
      ...details.requestHeaders,
      [CLEEP_DESKTOP_EMBED_HEADER]: CLEEP_DESKTOP_EMBED_VALUE,
    };

    if (isNgrokUrl(details.url)) {
      requestHeaders[NGROK_SKIP_BROWSER_WARNING_HEADER] = 'CleepDesktop';
      const binding =
        typeof details.webContentsId === 'number' ? bindings.get(details.webContentsId) : undefined;
      if (binding?.gatewayToken) {
        requestHeaders[GATEWAY_AUTH_HEADER] = binding.gatewayToken;
        requestHeaders[GATEWAY_TARGET_HEADER] = binding.deviceUuid;
      }
    }

    callback({ requestHeaders });
  });
}
