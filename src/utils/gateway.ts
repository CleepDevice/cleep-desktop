import type { Session } from 'electron';
import {
  NGROK_HOST_URL_FILTERS,
  NGROK_SKIP_BROWSER_WARNING_HEADER,
} from './ngrok';

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

/**
 * Single onBeforeSendHeaders for ngrok hosts: always skip the free interstitial,
 * and when the webview is gateway-bound inject Auth + Target.
 *
 * Must be the only listener on these URL filters (Electron keeps one handler).
 */
export function installGatewayHeaders(session: Session): void {
  session.webRequest.onBeforeSendHeaders({ urls: NGROK_HOST_URL_FILTERS }, (details, callback) => {
    const requestHeaders: Record<string, string> = {
      ...details.requestHeaders,
      [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'CleepDesktop',
    };
    const binding =
      typeof details.webContentsId === 'number' ? bindings.get(details.webContentsId) : undefined;
    if (binding?.gatewayToken) {
      requestHeaders[GATEWAY_AUTH_HEADER] = binding.gatewayToken;
      requestHeaders[GATEWAY_TARGET_HEADER] = binding.deviceUuid;
    }
    callback({ requestHeaders });
  });
}
