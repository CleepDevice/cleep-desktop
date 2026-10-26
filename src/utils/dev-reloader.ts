import path from 'path';
import { app, BrowserWindow } from 'electron';
import chokidar from 'chokidar';
import { appLogger } from '../app-logger';

/**
 * Exit code understood by scripts/electron-dev.js to restart Electron only,
 * without stopping concurrently watchers (tsc / esbuild).
 */
export const DEV_RESTART_EXIT_CODE = 75;

/**
 * Development auto-reload:
 * - changes under repo html/ reload BrowserWindows
 * - changes to build/preload.js reload BrowserWindows (preload re-runs on page load)
 * - changes under build/*.js (main process) restart Electron via exit code 75
 *
 * We avoid electron-reloader here because copyfiles puts a package.json in
 * build/, which makes that tool watch the wrong directory.
 *
 * Restart stays disarmed until both:
 * - a minimum grace period since process start (covers tsc -w + esbuild --watch startup waves)
 * - build main-process JS has been quiet for a short window
 *
 * preload.js is excluded from full restart: start:dev runs esbuild --watch which
 * rewrites it often; treating that as a main-process change caused restart loops.
 *
 * Normal app quit uses exit 0 so concurrently -k can stop the whole start:dev group.
 */
export function setupDevReloader(): void {
  if (app.isPackaged) {
    return;
  }

  const projectRoot = path.join(__dirname, '..', '..');
  const buildDir = path.join(projectRoot, 'build');
  const htmlDir = path.join(projectRoot, 'html');
  let restartTimer: NodeJS.Timeout | undefined;
  let armTimer: NodeJS.Timeout | undefined;
  let isRestarting = false;
  let restartArmed = false;
  const startedAt = Date.now();
  /** tsc -w + esbuild --watch rewrite many files right after start:dev */
  const GRACE_MS = 10000;
  const QUIET_BEFORE_ARM_MS = 2500;

  const reloadWindows = (reason: string, filePath: string): void => {
    appLogger.debug(reason, { filePath });
    for (const window_ of BrowserWindow.getAllWindows()) {
      window_.webContents.reloadIgnoringCache();
    }
  };

  const scheduleArm = (): void => {
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      if (restartArmed) {
        return;
      }
      if (Date.now() - startedAt < GRACE_MS) {
        scheduleArm();
        return;
      }
      restartArmed = true;
      appLogger.debug('Dev reloader armed for main-process restart');
    }, QUIET_BEFORE_ARM_MS);
  };

  const htmlWatcher = chokidar.watch(htmlDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });
  htmlWatcher.on('change', (filePath) => {
    reloadWindows('Renderer file changed, reloading windows', filePath);
  });

  const preloadPath = path.join(buildDir, 'preload.js');
  const preloadWatcher = chokidar.watch(preloadPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });
  preloadWatcher.on('change', (filePath) => {
    reloadWindows('Preload changed, reloading windows', filePath);
  });

  const mainWatcher = chokidar.watch(path.join(buildDir, '**/*.js'), {
    ignoreInitial: true,
    ignored: [
      /\.map$/,
      /node_modules/,
      /** Bundled separately; window reload is enough (see preloadWatcher). */
      /(^|[/\\])preload\.js$/,
    ],
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
  });
  mainWatcher.on('change', (filePath) => {
    if (isRestarting) {
      return;
    }
    // Hard grace: never restart during the startup compile storm.
    if (Date.now() - startedAt < GRACE_MS || !restartArmed) {
      scheduleArm();
      return;
    }
    appLogger.debug('Main process file changed, scheduling Electron restart', { filePath });
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (isRestarting) {
        return;
      }
      isRestarting = true;
      // Handled by scripts/electron-dev.js — keeps tsc/esbuild watchers alive.
      app.exit(DEV_RESTART_EXIT_CODE);
    }, 500);
  });

  scheduleArm();

  app.on('will-quit', () => {
    clearTimeout(armTimer);
    clearTimeout(restartTimer);
    void htmlWatcher.close();
    void preloadWatcher.close();
    void mainWatcher.close();
  });

  appLogger.info('Dev reloader enabled', { htmlDir, buildDir, graceMs: GRACE_MS });
}
