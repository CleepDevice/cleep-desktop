import { describe, expect, it, vi } from 'vitest';
import {
  installNgrokSkipBrowserWarning,
  NGROK_HOST_URL_FILTERS,
  NGROK_SKIP_BROWSER_WARNING_HEADER,
} from '../../src/utils/ngrok';

describe('ngrok utils', () => {
  it('registers onBeforeSendHeaders for ngrok host filters', () => {
    const onBeforeSendHeaders = vi.fn();
    const session = {
      webRequest: { onBeforeSendHeaders },
    } as unknown as Electron.Session;

    installNgrokSkipBrowserWarning(session);

    expect(onBeforeSendHeaders).toHaveBeenCalledWith(
      { urls: NGROK_HOST_URL_FILTERS },
      expect.any(Function),
    );
  });

  it('adds ngrok-skip-browser-warning to matching requests', () => {
    const onBeforeSendHeaders = vi.fn();
    const session = {
      webRequest: { onBeforeSendHeaders },
    } as unknown as Electron.Session;

    installNgrokSkipBrowserWarning(session);

    const handler = onBeforeSendHeaders.mock.calls[0][1] as (
      details: { requestHeaders: Record<string, string> },
      callback: (response: { requestHeaders: Record<string, string> }) => void,
    ) => void;
    const callback = vi.fn();
    handler({ requestHeaders: { 'User-Agent': 'Chrome' } }, callback);

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        'User-Agent': 'Chrome',
        [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'CleepDesktop',
      },
    });
  });
});
