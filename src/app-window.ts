import { BrowserWindow, dialog, shell } from 'electron';
import url from 'url';
import { appContext } from './app-context';
import path from 'path';
import { appLogger } from './app-logger';
import isDev from 'electron-is-dev';

// create application main window
export function createAppWindow(splashScreenWindow: BrowserWindow): BrowserWindow {
  // create the browser window.
  const mainWindow = new BrowserWindow({
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false,
    },
    width: 1024,
    height: 600,
    minHeight: 640,
    minWidth: 375,
    show: false,
    icon: __dirname + '/resources/256x256.png',
    title: 'CleepDesktop',
  });

  mainWindow.webContents.on('did-attach-webview', (_event, _webContents) => {
    appLogger.debug('webview attached');
  });

  mainWindow.webContents.setWindowOpenHandler((details: Electron.HandlerDetails) => {
    appLogger.info('Open modal from application', { url: details.url });
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // close splashscreen when main window loaded
  mainWindow.once('ready-to-show', function () {
    if (splashScreenWindow) {
      setTimeout(function () {
        if (splashScreenWindow) {
          splashScreenWindow.close();
        }
      }, 1500);
    }

    setTimeout(function () {
      if (!mainWindow) {
        return;
      }
      mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
    }, 1250);
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/html/index.html`, {
    extraHeaders: 'pragma: no-cache\n',
  });

  // Open the DevTools in dev mode only
  if (isDev || process.env.CLEEPDESKTOP_DEBUG) {
    // open devtool in dev mode
    mainWindow.webContents.openDevTools();

    // log electron and chrome versions
    appLogger.info('Electron version: ' + process.versions.electron);
    appLogger.info('Chrome version: ' + process.versions.chrome);
  }

  // give a chance to user to not stop current running action
  mainWindow.on('close', function (e) {
    // set closing flag
    appContext.closingApplication = true;

    if (!appContext.allowAppClosing) {
      // something does not allow application to quit. Request user to quit or not
      const btnIndex = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Confirm quit', 'Cancel'],
        defaultId: 1,
        title: 'Quit application ?',
        message: 'A process is running. Quit application now can let inconsistent data. Quit anyway?',
      });

      if (btnIndex != 0) {
        // user do not quit
        appLogger.debug('User cancels application closing');
        e.preventDefault();
      }
    }
  });

  return mainWindow;
}

// create splash screen window
// code from https://github.com/buz-zard/random/blob/master/electron-compile-1/src/main.js
export function createSplashscreenWindow(mainWindow: BrowserWindow): BrowserWindow {
  // create splashscreen window
  const splashScreenWindow = new BrowserWindow({
    width: 250,
    height: 350,
    show: false,
    frame: false,
    parent: mainWindow,
    resizable: false,
    icon: __dirname + '/resources/256x256.png',
    webPreferences: {
      webSecurity: false,
    },
  });

  // load splashscreen content
  splashScreenWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, 'html/loading.html'),
      protocol: 'file:',
      slashes: true,
    }),
    { extraHeaders: 'pragma: no-cache\n' },
  );

  // handle splashscreen events
  splashScreenWindow.webContents.on('did-finish-load', () => {
    splashScreenWindow.show();
  });

  return splashScreenWindow;
}
