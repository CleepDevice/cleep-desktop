import { describe, expect, it, vi } from 'vitest';
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

  it('always injects ngrok skip-browser-warning', () => {
    const onBeforeSendHeaders = vi.fn();
    const session = { webRequest: { onBeforeSendHeaders } } as unknown as Electron.Session;
    installGatewayHeaders(session);

    const handler = onBeforeSendHeaders.mock.calls[0][1] as (
      details: { webContentsId?: number; requestHeaders: Record<string, string> },
      callback: (response: { requestHeaders: Record<string, string> }) => void,
    ) => void;
    const callback = vi.fn();
    handler({ requestHeaders: { Accept: 'text/html' } }, callback);
    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Accept: 'text/html',
        [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'CleepDesktop',
      },
    });
  });

  it('injects Auth and Target headers for bound ngrok requests', () => {
    const onBeforeSendHeaders = vi.fn();
    const session = { webRequest: { onBeforeSendHeaders } } as unknown as Electron.Session;
    bindGatewayWebview(3, {
      deviceUuid: 'peer-1',
      gatewayDeviceUuid: 'gw-1',
      gatewayToken: 'secret-token',
    });
    installGatewayHeaders(session);

    const handler = onBeforeSendHeaders.mock.calls[0][1] as (
      details: { webContentsId?: number; requestHeaders: Record<string, string> },
      callback: (response: { requestHeaders: Record<string, string> }) => void,
    ) => void;
    const callback = vi.fn();
    handler({ webContentsId: 3, requestHeaders: { Accept: 'text/html' } }, callback);
    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Accept: 'text/html',
        [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'CleepDesktop',
        [GATEWAY_AUTH_HEADER]: 'secret-token',
        [GATEWAY_TARGET_HEADER]: 'peer-1',
      },
    });
  });
});
