/**
 * Bundled into html/js/libs/sentry-renderer.js (IIFE) for the AngularJS UI.
 * Renderer events are forwarded to the Electron main Sentry SDK.
 */
import { captureException, init } from '@sentry/electron/renderer';

export function initSentry(): void {
  init();
}

export { captureException };
