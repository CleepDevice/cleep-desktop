import path from 'path';
import { app, BrowserWindow } from 'electron';
import chokidar from 'chokidar';
import { appLogger } from '../app-logger';

/**
 * Development auto-reload:
 * - changes under repo html/ reload BrowserWindows
 * - changes to build/preload.js reload BrowserWindows (preload re-runs on page load)
 * - changes under build/*.js (main process) relaunch Electron
 *
 * We avoid electron-reloader here because copyfiles puts a package.json in
 * build/, which makes that tool watch the wrong directory.
 *
 * Relaunch stays disarmed until both:
 * - a minimum grace period since process start (covers tsc -w + esbuild --watch startup waves)
 * - build main-process JS has been quiet for a short window
 *
 * preload.js is excluded from full relaunch: start:dev runs esbuild --watch which
 * rewrites it often; treating that as a main-process change caused relaunch loops
 * (app.relaunch + concurrently -k).
 */
export function setupDevReloader(): void {
  if (app.isPackaged) {
    return;
  }

  const projectRoot = path.join(__dirname, '..', '..');
  const buildDir = path.join(projectRoot, 'build');
  const htmlDir = path.join(projectRoot, 'html');
  let relaunchTimer: NodeJS.Timeout | undefined;
  let armTimer: NodeJS.Timeout | undefined;
  let isRelaunching = false;
  let relaunchArmed = false;
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
      if (relaunchArmed) {
        return;
      }
      if (Date.now() - startedAt < GRACE_MS) {
        scheduleArm();
        return;
      }
      relaunchArmed = true;
      appLogger.debug('Dev reloader armed for main-process relaunch');
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
    if (isRelaunching) {
      return;
    }
    // Hard grace: never relaunch during the startup compile storm.
    if (Date.now() - startedAt < GRACE_MS || !relaunchArmed) {
      scheduleArm();
      return;
    }
    appLogger.debug('Main process file changed, scheduling relaunch', { filePath });
    clearTimeout(relaunchTimer);
    relaunchTimer = setTimeout(() => {
      if (isRelaunching) {
        return;
      }
      isRelaunching = true;
      app.relaunch();
      app.exit(0);
    }, 500);
  });

  scheduleArm();

  app.on('will-quit', () => {
    clearTimeout(armTimer);
    clearTimeout(relaunchTimer);
    void htmlWatcher.close();
    void preloadWatcher.close();
    void mainWatcher.close();
  });

  appLogger.info('Dev reloader enabled', { htmlDir, buildDir, graceMs: GRACE_MS });
}
