import { app, BrowserWindow, screen, ipcMain, shell, dialog, OpenDialogSyncOptions } from 'electron';
import { appContext } from './app-context';
import { createAppMenu } from './app-menu';
import { createAppWindow, createSplashscreenWindow } from './app-window';
import { parseArgs } from './utils/app.helpers';
import { appLogger } from './app-logger';
import { appUpdater } from './app-updater';
import { appFileDownload } from './app-file-download';
import { appIso } from './app-iso';
import { appDevices } from './app-devices';
import { appSettings } from './app-settings';
import { appAuth, MAX_AUTH_ATTEMPTS } from './app-auth';
import electronReload from 'electron-reload';

electronReload(__dirname, {});

let mainWindow: BrowserWindow;
let splashScreenWindow: BrowserWindow;

if (!appContext.isDev) {
  app.commandLine.appendSwitch('no-sandbox');
}

appSettings.configure(app);
appContext.configure();

app.on('will-quit', function () {
  appLogger.debug('Kill core');
  appDevices.stop();
});

// quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// allow self signed certificate
app.on('certificate-error', (event, _webContents, _url, _error, certificate, callback) => {
  // appLogger.debug('Certificate error, always allow', { certificate });
  event.preventDefault();

  callback(certificate?.subjectName === 'Cleep' && certificate?.issuerName === 'Cleep');
});

app.on('login', (event, _webContents, _request, authInfo, callback) => {
  appLogger.debug('Auth requested', { authInfo });
  const url = authInfo.host;
  const auth = appAuth.getAuth(authInfo.host);

  if (!auth) {
    appLogger.warn('No auth found for the device');
    appAuth.resetAuthAttempts(url);
  } else if (auth?.attempts >= MAX_AUTH_ATTEMPTS) {
    appLogger.debug('Max auth attempts reached');
    appAuth.resetAuthAttempts(url);
    mainWindow.webContents.send('auth-error', { ip: authInfo.host, errorCode: 'INVALID_AUTH' });
  } else {
    appLogger.debug('Found auth', { url: authInfo.host, account: auth.account });
    event.preventDefault();
    callback(auth.account, auth.password);
  }
});

app.on('web-contents-created', (_event: Electron.Event, webContents: Electron.WebContents) => {
  appLogger.debug('New Cleep device webview created');
  webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => {
    appLogger.info('Open modal from webview', { url: details.url });
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        show: false,
        focusable: true,
        alwaysOnTop: false,
        title: 'Cleep device popup',
      },
    };
  });
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    mainWindow = createAppWindow(splashScreenWindow);
  }
});

app.on('ready', async function () {
  appLogger.info(`========== cleep-desktop started ${appContext.isDev ? '[DEV MODE]' : ''}==========`);
  appLogger.info('Platform: ' + process.platform);
  const display = screen.getPrimaryDisplay();
  appLogger.info('Display: ' + display.size.width + 'x' + display.size.height);
  appLogger.info('Version: ' + appContext.version);
  if (appContext.isDev) {
    appLogger.info('App dir: ' + app.getPath('userData'));
    appLogger.info('Logs dir: ' + app.getPath('logs'));
    appLogger.info('Temp dir: ' + app.getPath('temp'));
  }
  appLogger.info(`Crash report ${appContext.crashReportEnabled ? 'enabled' : 'disabled'}`);

  // splashscreen asap
  splashScreenWindow = createSplashscreenWindow(mainWindow);

  // handle command line args
  const args = parseArgs(process.argv.slice(1));
  appLogger.setLogLevel(args);

  try {
    mainWindow = createAppWindow(splashScreenWindow);
    createAppMenu(mainWindow);

    // configure modules
    appAuth.configure(mainWindow);
    appUpdater.configure(mainWindow);
    appFileDownload.configure(mainWindow);
    appIso.configure(mainWindow);
    appDevices.configure(mainWindow);
  } catch (error) {
    appLogger.error(`Unable to launch application: ${error?.message || 'unknown error'}`);
  }
});

ipcMain.on('open-url-in-browser', (_event, url: string) => {
  appLogger.info('Opening external url', { url });
  shell.openExternal(url);
});

ipcMain.handle('open-dialog', (_event, dialogOptions: OpenDialogSyncOptions) => {
  const result = dialog.showOpenDialogSync(dialogOptions);
  return result || [];
});
