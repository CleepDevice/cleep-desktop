import path from 'path';
import { app, BrowserWindow } from 'electron';
import chokidar from 'chokidar';
import { appLogger } from '../app-logger';

/**
 * Development auto-reload:
 * - changes under repo html/ reload BrowserWindows
 * - changes under build/*.js relaunch Electron
 *
 * We avoid electron-reloader here because copyfiles puts a package.json in
 * build/, which makes that tool watch the wrong directory.
 *
 * Relaunch stays disarmed until both:
 * - a minimum time since process start (covers slow tsc -w startup)
 * - build/*.js has been quiet for a short window (covers the initial compile wave)
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
  const minArmAt = Date.now() + 3000;

  const scheduleArm = (): void => {
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      if (relaunchArmed) {
        return;
      }
      if (Date.now() < minArmAt) {
        scheduleArm();
        return;
      }
      relaunchArmed = true;
      appLogger.debug('Dev reloader armed for main-process relaunch');
    }, 1500);
  };

  const htmlWatcher = chokidar.watch(htmlDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });
  htmlWatcher.on('change', (filePath) => {
    appLogger.debug('Renderer file changed, reloading windows', { filePath });
    for (const window_ of BrowserWindow.getAllWindows()) {
      window_.webContents.reloadIgnoringCache();
    }
  });

  const mainWatcher = chokidar.watch(path.join(buildDir, '**/*.js'), {
    ignoreInitial: true,
    ignored: [/\.map$/, /node_modules/],
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });
  mainWatcher.on('change', (filePath) => {
    if (isRelaunching) {
      return;
    }
    if (!relaunchArmed) {
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
    }, 300);
  });

  scheduleArm();

  app.on('will-quit', () => {
    clearTimeout(armTimer);
    clearTimeout(relaunchTimer);
    void htmlWatcher.close();
    void mainWatcher.close();
  });

  appLogger.info('Dev reloader enabled', { htmlDir, buildDir });
}
