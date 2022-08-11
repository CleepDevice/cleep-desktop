import { app, BrowserWindow, screen, ipcMain, shell } from 'electron';
import { appContext } from './app-context';
import { createAppMenu } from './app-menu';
import { createAppWindow, createSplashscreenWindow } from './app-window';
import { parseArgs } from './utils/helpers';
import { appLogger } from './app-logger';
import { appUpdater } from './app-updater';
import { appFileDownload } from './app-file-download';
import isDev from 'electron-is-dev';
import { appIso } from './app-iso';
import { Sudo } from './sudo/sudo';
import { cleepbus } from './cleepbus/cleepbus';

let mainWindow: BrowserWindow;
let splashScreenWindow: BrowserWindow;

app.on('will-quit', function () {
  appLogger.debug('Kill core');
  cleepbus.kill();
});

// quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    mainWindow = createAppWindow(splashScreenWindow);
  }
});

app.on('ready', async function () {
  appLogger.info('========== cleep-desktop started ==========');
  appLogger.info('Platform: ' + process.platform);
  const display = screen.getPrimaryDisplay();
  appLogger.info('Display: ' + display.size.width + 'x' + display.size.height);
  if (isDev) {
    appLogger.info('Version: ' + require('./package.json').version);
  } else {
    appLogger.info('Version: ' + appContext.version);
  }
  if (isDev) {
    appLogger.info('App dir: ' + app.getPath('userData'));
    appLogger.info('Logs dir: ' + app.getPath('logs'));
    appLogger.info('Temp dir: ' + app.getPath('temp'));
  }

  // splashscreen asap
  splashScreenWindow = createSplashscreenWindow(mainWindow);

  // handle command line args
  const args = parseArgs(process.argv.slice(1));
  appLogger.setLogLevel(args);

  try {
    mainWindow = createAppWindow(splashScreenWindow);
    createAppMenu(mainWindow);

    // configure modules
    appUpdater.configure(mainWindow);
    appFileDownload.configure(mainWindow);
    appIso.configure(mainWindow);
    cleepbus.configure();
  } catch (error) {
    appLogger.error(`Unable to launch application: ${error?.message || 'unknown error'}`);
  }
});

// handle event to allow to quit application (or not)
ipcMain.on('allow-quit', (_event, arg) => {
  appLogger.debug('allow-quit=' + arg);
  appContext.allowQuit = arg;
});

// open external path
ipcMain.on('open-path', (_event, path: string) => {
  shell.openPath(path);
});

ipcMain.on('open-url-in-browser', (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.on('test', () => {
  try {
    const sudo = new Sudo({
      appName: app.name,
      stdoutCallback: stdoutCb,
      stderrCallback: stderrCb,
      terminatedCallback: terminatedCb,
    });
    sudo.run('/home/tang/testpkexec.sh');
  } catch (error) {
    appLogger.error('Error occured', error);
  }
});

function stderrCb(str: string): void {
  appLogger.error('----------', str);
}

function stdoutCb(str: string): void {
  appLogger.info('++++++++++', str);
}

function terminatedCb(exitCode: number): void {
  appLogger.info('==========', { exitCode });
}
