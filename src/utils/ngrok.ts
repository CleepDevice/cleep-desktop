/** Free-tier interstitial bypass (any value is accepted by ngrok). */
export const NGROK_SKIP_BROWSER_WARNING_HEADER = 'ngrok-skip-browser-warning';

/** Host patterns used by current and legacy ngrok public URLs. */
export const NGROK_HOST_URL_FILTERS = [
  '*://*.ngrok-free.app/*',
  '*://*.ngrok-free.dev/*',
  '*://*.ngrok.app/*',
  '*://*.ngrok.io/*',
];
