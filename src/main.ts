import { app, BrowserWindow, screen, ipcMain, DownloadItem } from 'electron';
import path from 'path';
import logger from 'electron-log';
import { appContext } from './app-context';
import { createAppMenu } from './app-menu';
import detectPort from 'detect-port';
import { launchCore } from './app-core';
import { createAppWindow, createSplashscreenWindow } from './app-window';
import fs from 'fs'
import { fillChangelog, parseArgs } from './utils';
import { download } from 'electron-dl';
import { autoUpdater } from 'electron-updater';
require('@electron/remote/main').initialize()

let mainWindow: BrowserWindow;
let splashScreenWindow: BrowserWindow;

// logger configuration
logger.transports.file.level = 'info';
logger.transports.file.maxSize = 1 * 1024 * 1024;
logger.transports.console.level = 'info';
if( appContext.isDev ) {
    // during development always enable debug on both console and log file
    logger.transports.console.level = 'debug';
    logger.transports.file.level = 'debug';
    logger.info('Dev mode enabled');
} else if( fs.existsSync(appContext.settings.filepath()) && appContext.settings.has('cleep.debug') && appContext.settings.get('cleep.debug') ) {
    // release mode with debug enabled
    logger.transports.console.level = 'debug';
    logger.transports.file.level = 'debug';
    logger.info('Debug mode enabled according to user preferences');
} else {
    // release mode without debug, enable only info on console and do not touch log file config
    // logger.transports.console.level = 'info';
}
/* eslint-disable  @typescript-eslint/no-explicit-any */
(<any>global).logger = logger;

// crash report
if (!appContext.isDev) {
    logger.info('Enable crash report')
    const { init } = require('@sentry/electron');
    init({
        dsn: 'https://8e703f88899c42c18b8466c44b612472:3dfcd33abfda47c99768d43ce668d258@sentry.io/213385'
    });
}

// updater
autoUpdater.logger = logger;
// enable this flag to test pre release
// autoUpdater.allowPrerelease = true;
/* eslint-disable  @typescript-eslint/no-explicit-any */
(<any>global).appUpdater = autoUpdater;

// application will quit, kill python process
app.on('will-quit', function() {
    if( appContext.coreProcess ) {
        logger.debug('Kill core');
        appContext.coreProcess.kill('SIGTERM');
    }
});

// quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if( process.platform!=='darwin' ) {
        app.quit()
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        mainWindow = createAppWindow(splashScreenWindow);
    }
});

app.on('ready', function() {
    logger.info('===== cleep-desktop started =====');
    logger.info('Platform: ' + process.platform);
    const display = screen.getPrimaryDisplay();
    logger.info('Display: ' + display.size.width + 'x' + display.size.height);
    if(appContext.isDev) {
        logger.info('Version: ' + require('./package.json').version);
    } else {
        logger.info('Version: ' + app.getVersion());
    }

    // splashscreen asap
    splashScreenWindow = createSplashscreenWindow(mainWindow);

    // parse command line arguments
    const argv = process.argv.slice(1);
    parseArgs(argv);

    // fill changelog
    fillChangelog();

    // launch application
    if( appContext.isDev ) {
        mainWindow = createAppWindow(splashScreenWindow);
        createAppMenu(mainWindow);
        launchCore(appContext.settings.get('remote.rpcport') as number);
    } else {
        // choose available port
        detectPort(null, (err, rpcPort) => {
            if( err ) {
                logger.error('Error detecting available port:', err);
                // TODO open error popup
            }
            mainWindow = createAppWindow(splashScreenWindow);
            createAppMenu(mainWindow);
            launchCore(rpcPort);
        });
    }
});

// handle event to allow to quit application (or not)
ipcMain.on('allow-quit', (event, arg) => {
    logger.debug('allow-quit=' + arg);
    appContext.allowQuit = arg;
});

// handle event to save changelog
ipcMain.on('save-changelog', (event, arg) => {
    logger.debug('Saving changelog...');
    const changelogPath = path.join(app.getPath('userData'), 'changelog.txt');
    fs.writeFile(changelogPath, arg, (err) => {
        if( err ) {
            logger.error('Unable to save changelog: ' + err);
        }
    });
});

// handle file download
ipcMain.on('download-file-cancel', () => {
    if( appContext.download !== null ) {
        // cancel running download
        appContext.download.cancel();
    }
});
ipcMain.on('download-file', (_, args) => {
    if( appContext.download ) {
        // download already running, do not launch this one
        mainWindow.webContents.send('download-file-status', {
            status: 'alreadyrunning',
            percent: 0
        });
        return;
    }
    // reset download item
    appContext.download = null;

    // launch download
    download(BrowserWindow.getFocusedWindow(), args.url, {
        saveAs: true,
        onStarted: function(item: DownloadItem) {
            appContext.download = item;
        },
        onProgress: function(progress) {
            if (!progress) {
                return;
            }

            if( typeof progress.percent == 'number' ) {
                mainWindow.webContents.send('download-file-status', {
                    filename: appContext.download.getFilename(),
                    status: 'downloading',
                    percent: Math.round(progress.percent*100)
                });
            }
        },
        onCancel: function() {
            mainWindow.webContents.send('download-file-status', {
                filename: appContext.download.getFilename(),
                status: 'canceled',
                percent: 0
            });
            appContext.download = null;
        }
    })
    .then(function() {
        mainWindow.webContents.send('download-file-status', {
            filename: appContext.download.getFilename(),
            status: 'success',
            percent: 100
        });
        appContext.download = null;
    })
    .catch(function() {
        mainWindow.webContents.send('download-file-status', {
            filename: appContext.download.getFilename(),
            status: 'failed',
            percent: 100
        });
        appContext.download = null;
    });
});

