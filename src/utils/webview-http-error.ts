import type { BrowserWindow, Session, WebContents } from 'electron';
import { sendToRenderer } from '../ipc/ipc-main';

const hookedSessions = new WeakSet<Session>();

/**
 * Notify the renderer when a webview main-frame navigation returns HTTP >= 400.
 * Session-scoped once (shared partition); filters by webContentsId on the renderer side.
 */
export function installWebviewHttpErrorBridge(
  mainWindow: BrowserWindow,
  _webContents: WebContents,
): void {
  const session = _webContents.session;
  if (hookedSessions.has(session)) {
    return;
  }
  hookedSessions.add(session);

  session.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
    if (details.resourceType !== 'mainFrame' || details.statusCode < 400) {
      return;
    }
    const webContentsId = details.webContentsId;
    if (typeof webContentsId !== 'number') {
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed?.()) {
      return;
    }
    sendToRenderer(mainWindow, 'webview-http-error', webContentsId, {
      url: details.url,
      statusCode: details.statusCode,
    });
  });
}
