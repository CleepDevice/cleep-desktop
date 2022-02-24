import { app, BrowserWindow, screen, ipcMain, shell } from 'electron';
import { appContext } from './app-context';
import { createAppMenu } from './app-menu';
import { appCore } from './app-core';
import { createAppWindow, createSplashscreenWindow } from './app-window';
import { getRpcPort, parseArgs } from './utils';
import { appLogger } from './app-logger';
import { appUpdater } from './app-updater';
import { appFileDownload } from './app-file-download';
import isDev from 'electron-is-dev';
require('@electron/remote/main').initialize();

let mainWindow: BrowserWindow;
let splashScreenWindow: BrowserWindow;

// application will quit, kill python process
app.on('will-quit', function () {
  if (appContext.coreProcess) {
    appLogger.debug('Kill core');
    appContext.coreProcess.kill('SIGTERM');
  }
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
  if (appContext.isDev) {
    appLogger.info('Version: ' + require('./package.json').version);
  } else {
    appLogger.info('Version: ' + app.getVersion());
  }

  // splashscreen asap
  splashScreenWindow = createSplashscreenWindow(mainWindow);

  // handle command line args
  const args = parseArgs(process.argv.slice(1));
  appLogger.setLogLevel(args);

  try {
    mainWindow = createAppWindow(splashScreenWindow);
    createAppMenu(mainWindow);

    appUpdater.configure(mainWindow);
    appFileDownload.configure(mainWindow);
    const rpcPort = await getRpcPort();
    if (isDev) {
      appCore.startDev(rpcPort);
    } else {
      appCore.startProduction(rpcPort);
    }
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
ipcMain.on('open-path', (_event, arg: string) => {
  shell.openPath(arg);
});
