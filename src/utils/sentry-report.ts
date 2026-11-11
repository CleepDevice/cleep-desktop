import * as Sentry from '@sentry/electron/main';
import { appContext } from '../app-context';
import { appLogger } from '../app-logger';

export type PlatformIssueArea =
  | 'pico-flash'
  | 'pico-erase'
  | 'pico-automount'
  | 'sd-install'
  | 'developer-sync'
  | 'firmware-download';

/**
 * Report a non-fatal platform/ops issue to Sentry when crash reports are enabled.
 * Safe no-op in dev or when the user disabled crash reporting.
 */
export function reportPlatformIssue(
  area: PlatformIssueArea,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  const err = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
  appLogger.debug('Platform issue', { area, message: err.message, context });

  if (!appContext.crashReportEnabled) {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      scope.setTag('area', area);
      scope.setTag('platform', process.platform);
      scope.setTag('arch', process.arch);
      scope.setContext('platform_issue', {
        ...context,
        platform: process.platform,
        arch: process.arch,
      });
      Sentry.captureException(err);
    });
  } catch (reportError) {
    appLogger.debug('Unable to report platform issue to Sentry', { reportError });
  }
}

/**
 * Breadcrumb for multi-step flows (flash / install / sync) without creating an event.
 */
export function addPlatformBreadcrumb(
  area: PlatformIssueArea,
  message: string,
  data: Record<string, unknown> = {},
): void {
  if (!appContext.crashReportEnabled) {
    return;
  }
  try {
    Sentry.addBreadcrumb({
      category: area,
      message,
      level: 'info',
      data: {
        ...data,
        platform: process.platform,
      },
    });
  } catch {
    /* ignore */
  }
}
