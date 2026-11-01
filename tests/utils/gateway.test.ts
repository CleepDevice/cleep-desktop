import { describe, expect, it, vi } from 'vitest';
import { CLEEP_DESKTOP_EMBED_HEADER } from '../../src/utils/cleep-desktop-embed';
import {
  GATEWAY_AUTH_HEADER,
  GATEWAY_TARGET_HEADER,
  bindGatewayWebview,
  getGatewayWebviewBinding,
  installGatewayHeaders,
  unbindGatewayWebview,
} from '../../src/utils/gateway';
import { NGROK_SKIP_BROWSER_WARNING_HEADER } from '../../src/utils/ngrok';

describe('gateway utils', () => {
  it('binds and unbinds webview targets', () => {
    bindGatewayWebview(7, {
      deviceUuid: 'peer-1',
      gatewayDeviceUuid: 'gw-1',
      gatewayToken: 'tok',
    });
    expect(getGatewayWebviewBinding(7)?.deviceUuid).toBe('peer-1');
    unbindGatewayWebview(7);
    expect(getGatewayWebviewBinding(7)).toBeUndefined();
  });

  it('injects CleepDesktop embed header on LAN requests', () => {
    const onBeforeSendHeaders = vi.fn();
    const session = { webRequest: { onBeforeSendHeaders } } as unknown as Electron.Session;
    installGatewayHeaders(session);

    expect(onBeforeSendHeaders.mock.calls[0][0]).toEqual({ urls: ['*://*/*'] });

    const handler = onBeforeSendHeaders.mock.calls[0][1] as (
      details: { url?: string; webContentsId?: number; requestHeaders: Record<string, string> },
      callback: (response: { requestHeaders: Record<string, string> }) => void,
    ) => void;
    const callback = vi.fn();
    handler({ url: 'http://192.168.1.20/', requestHeaders: { Accept: 'text/html' } }, callback);
    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Accept: 'text/html',
        [CLEEP_DESKTOP_EMBED_HEADER]: '1',
      },
    });
  });

  it('injects embed + ngrok skip + Auth/Target for bound ngrok requests', () => {
    const onBeforeSendHeaders = vi.fn();
    const session = { webRequest: { onBeforeSendHeaders } } as unknown as Electron.Session;
    bindGatewayWebview(3, {
      deviceUuid: 'peer-1',
      gatewayDeviceUuid: 'gw-1',
      gatewayToken: 'secret-token',
    });
    installGatewayHeaders(session);

    const handler = onBeforeSendHeaders.mock.calls[0][1] as (
      details: { url?: string; webContentsId?: number; requestHeaders: Record<string, string> },
      callback: (response: { requestHeaders: Record<string, string> }) => void,
    ) => void;
    const callback = vi.fn();
    handler(
      {
        url: 'https://abc.ngrok-free.app/dashboard',
        webContentsId: 3,
        requestHeaders: { Accept: 'text/html' },
      },
      callback,
    );
    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Accept: 'text/html',
        [CLEEP_DESKTOP_EMBED_HEADER]: '1',
        [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'CleepDesktop',
        [GATEWAY_AUTH_HEADER]: 'secret-token',
        [GATEWAY_TARGET_HEADER]: 'peer-1',
      },
    });
  });
});
