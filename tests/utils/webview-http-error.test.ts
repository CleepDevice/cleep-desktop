import { describe, expect, it, vi } from 'vitest';
import { installWebviewHttpErrorBridge } from '../../src/utils/webview-http-error';

describe('webview-http-error', () => {
  it('registers onCompleted once per session and forwards HTTP >= 400', () => {
    const onCompleted = vi.fn();
    const session = {
      webRequest: { onCompleted },
    } as unknown as Electron.Session;
    const send = vi.fn();
    const mainWindow = {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as Electron.BrowserWindow;
    const webContents = {
      id: 7,
      session,
    } as unknown as Electron.WebContents;

    installWebviewHttpErrorBridge(mainWindow, webContents);
    installWebviewHttpErrorBridge(mainWindow, webContents);

    expect(onCompleted).toHaveBeenCalledTimes(1);

    const handler = onCompleted.mock.calls[0][1] as (details: {
      resourceType: string;
      statusCode: number;
      webContentsId?: number;
      url: string;
    }) => void;

    handler({
      resourceType: 'mainFrame',
      statusCode: 404,
      webContentsId: 7,
      url: 'https://dead.ngrok-free.app/',
    });

    expect(send).toHaveBeenCalledWith('webview-http-error', 7, {
      url: 'https://dead.ngrok-free.app/',
      statusCode: 404,
    });

    send.mockClear();
    handler({
      resourceType: 'image',
      statusCode: 404,
      webContentsId: 7,
      url: 'https://dead.ngrok-free.app/img.png',
    });
    expect(send).not.toHaveBeenCalled();
  });
});
