const VERSION = '0.0.0';

const DEFAULT_RPCPORT = 5610;
const DEFAULT_DEBUG = false;
const DEFAULT_ISORASPBIAN = false;
const DEFAULT_LOCALE = 'en';
const DEFAULT_PROXYMODE = 'noproxy';
const DEFAULT_PROXYHOST = 'localhost';
const DEFAULT_PROXYPORT = 8080;

const electron = require('electron')
const Menu = require('electron').Menu

// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow
// external browser
const shell = require('electron').shell;
// config
const settings = require('electron-settings');

const path = require('path')
const url = require('url')

var log = require('electron-log');

var cleepremote = null;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

// Create application configuration file
function createConfig()
{
    //cleep
    if( !settings.has('cleep.version') )
    {
        settings.set('cleep.version', VERSION);
    }
    else if( settings.get('cleep.version')!=VERSION )
    {
        settings.set('cleep.version', VERSION);
    }
    if( !settings.has('cleep.isoraspbian') )
    {
        settings.set('cleep.isoraspbian', DEFAULT_ISORASPBIAN);
    }
    if( !settings.has('cleep.locale') )
    {
        settings.set('cleep.local', DEFAULT_LOCALE);
    }
    if( !settings.has('cleep.debug') )
    {
        settings.set('cleep.debug', DEFAULT_DEBUG);
    }

    //etcher
    if( !settings.has('etcher.version') )
    {
        settings.set('etcher.version', 'v0.0');
    }

    //remote
    if( !settings.has('remote.rpcport') )
    {
        settings.set('remote.rpcport', DEFAULT_RPCPORT);
    }

    //proxy
    if( !settings.has('proxy.mode') )
    {
        settings.set('proxy.mode', DEFAULT_PROXYMODE);
    }
    if( !settings.has('proxy.host') )
    {
        settings.set('proxy.host', DEFAULT_PROXYHOST);
    }
    if( !settings.has('proxy.port') )
    {
        settings.set('proxy.port', DEFAULT_PROXYPORT);
    }
};

// Create application menu
function createMenu()
{
    const menuTemplate = [{
        label: 'File',
        submenu: [
            {
                label: 'Preferences',
                click: () => {
                    mainWindow.webContents.send('openPage', 'preferences');
                }
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                click: () => {
                    app.quit();
                }
            }
        ]
    }, {
        label: 'Device',
        submenu: [
            {
                label: 'Easy install',
                click: () => {
                    mainWindow.webContents.send('openPage', 'installEasy');
                }
            }, {
                label: 'Manual install',
                click: () => {
                    mainWindow.webContents.send('openPage', 'installManual');
                }
            }
        ]
    },{
        label: 'Help',
        submenu: [
            {
                label: 'Updates',
                click: () => {
                    mainWindow.webContents.send('openPage', 'updates');
                }
            }, {
                label: 'About',
                click: () => {
                    mainWindow.webContents.send('openPage', 'about');
                }
            }
        ]
    }];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu)
};

// Create application main window
function createWindow ()
{
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 800, height: 600})
    mainWindow.maximize();

    // and load the index.html of the app.
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'html/index.html'),
        protocol: 'file:',
        slashes: true
    }), {"extraHeaders" : "pragma: no-cache\n"})

    // Open the DevTools.
    mainWindow.webContents.openDevTools()

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
    })

};

// Launch cleepremote python application
function launchCleepremote()
{
    let commandline = path.join(__dirname, 'cleepremote/cleepremote')
    let port = settings.get('remote.rpcport')
    console.log('commandline: '+commandline+' '+port)
    cleepremote = require('child_process').spawn(commandline, [port]);
    if( cleepremote!==null )
    {
        console.log('cleepremote launched successfully')
    }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
    createConfig();
    createWindow();
    createMenu();
    launchCleepremote();
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        if( cleepremote )
        {
            cleepremote.kill('SIGTERM')
        }
        app.quit()
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow()
    }
});

