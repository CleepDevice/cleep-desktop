import type { Session } from 'electron';

/** Free-tier interstitial bypass (any value is accepted by ngrok). */
export const NGROK_SKIP_BROWSER_WARNING_HEADER = 'ngrok-skip-browser-warning';

/** Host patterns used by current and legacy ngrok public URLs. */
export const NGROK_HOST_URL_FILTERS = [
  '*://*.ngrok-free.app/*',
  '*://*.ngrok-free.dev/*',
  '*://*.ngrok.app/*',
  '*://*.ngrok.io/*',
];

/**
 * Inject ``ngrok-skip-browser-warning`` on requests to ngrok hosts so the
 * free-plan HTML interstitial is not shown inside device webviews.
 */
export function installNgrokSkipBrowserWarning(session: Session): void {
  session.webRequest.onBeforeSendHeaders({ urls: NGROK_HOST_URL_FILTERS }, (details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'CleepDesktop',
      },
    });
  });
}
