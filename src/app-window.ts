import { BrowserWindow, dialog, shell } from "electron";
import logger from 'electron-log';
import url from 'url';
import { appContext } from "./app-context";
import path from "path";

// create application main window
export function createAppWindow(splashScreenWindow: BrowserWindow): BrowserWindow {
    // create the browser window.
    const mainWindow = new BrowserWindow({
        webPreferences: {
            webviewTag: true,
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
        width: 1024,
        height: 600,
        minHeight: 640,
        minWidth: 375,
        show: false,
        icon: __dirname+'/resources/256x256.png',
        title: 'CleepDesktop'
    });

    // handle external url
    mainWindow.webContents.on('new-window', function(e, url) {
        e.preventDefault()
        shell.openExternal(url)
    });

    // close splashscreen when main window loaded
    mainWindow.once('ready-to-show', function() {
        if( splashScreenWindow ) {
            setTimeout( function() {
                if (splashScreenWindow) {
                    splashScreenWindow.close();
                }
            }, 1500 );
        }

        setTimeout( function() {
            if(!mainWindow) {
                return;
            }
            mainWindow.maximize();
            mainWindow.show();
            mainWindow.focus();
        }, 1250 );
    });

    // and load the index.html of the app.
    mainWindow.loadURL(`file://${__dirname}/html/index.html`, {
        'extraHeaders': 'pragma: no-cache\n'
    });

    // Open the DevTools in dev mode only
    console.log('=====>', appContext);
    if( appContext.isDev || process.env.CLEEPDESKTOP_DEBUG ) {
        // open devtool in dev mode
        mainWindow.webContents.openDevTools();

        // log electron and chrome versions
        logger.debug('Electron version: ' + process.versions.electron);
        logger.debug('Chrome version: ' + process.versions.chrome);
    }

    // give a chance to user to not stop current running action
    mainWindow.on('close', function(e) {
        // set closing flag (to avoid catching core process error)
        appContext.closingApplication = true;

        if( !appContext.allowQuit ) {
            // something does not allow application to quit. Request user to quit or not
            const btnIndex = dialog.showMessageBoxSync(mainWindow, {
                type: 'question',
                buttons: ['Confirm quit', 'Cancel'],
                defaultId: 1,
                title: 'Quit application ?',
                message: 'A process is running. Quit application now can let inconsistent data. Quit anyway?'
            });

            if( btnIndex!=0 ) {
                // user do not quit
                logger.debug('User cancels application closing');
                e.preventDefault();
            }
        }
    });

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        // TODO useful ? mainWindow = null
    })

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
        icon:__dirname+'/resources/256x256.png',
        webPreferences: {
            webSecurity: false
        }
    });

    // load splashscreen content
    splashScreenWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'html/loading.html'),
        protocol: 'file:',
        slashes: true
    }), {"extraHeaders" : "pragma: no-cache\n"})

    // handle splashscreen events
    splashScreenWindow.on('closed', () => {
        // TODO useful ? splashScreenWindow = null
    });
    splashScreenWindow.webContents.on('did-finish-load', () => {
        splashScreenWindow.show();
    });

    return splashScreenWindow;
}
