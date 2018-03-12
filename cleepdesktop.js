//default config
const DEFAULT_RPCPORT = 5610;
const DEFAULT_DEBUG = false;
const DEFAULT_ISORASPBIAN = false;
const DEFAULT_ISOLOCAL = false;
const DEFAULT_LOCALE = 'en';
const DEFAULT_PROXYMODE = 'noproxy';
const DEFAULT_PROXYHOST = 'localhost';
const DEFAULT_PROXYPORT = 8080;
const DEFAULT_CRASHREPORT = true;

//logger
const logger = require('electron-log')
global.logger = logger

//electron
const electron = require('electron')

//electron updater
const {autoUpdater} = require('electron-updater');
autoUpdater.logger = logger;
global.appUpdater = autoUpdater;

//create default variables
const app = electron.app
global.cleepdesktopVersion = app.getVersion();
app.setName('CleepDesktop')
const BrowserWindow = electron.BrowserWindow
const argv = process.argv.slice(1)

//imports
const Menu = require('electron').Menu
const shell = require('electron').shell
const settings = require('electron-settings')
const path = require('path')
const url = require('url')
const detectPort = require('detect-port')

//variables
var corePath = path.join(__dirname, 'cleepdesktopcore');
let isDev = !require('fs').existsSync(corePath);
let coreProcess = null;
let coreDisabled = false;

//logger configuration
logger.transports.file.level = 'info';
logger.transports.file.maxSize = 5 * 1024 * 1024;
logger.transports.console.level = 'info';
if( isDev )
{
    //enable console during development (can be overwritten by args)
    logger.transports.console.level = 'debug';
    logger.transports.file.level = 'debug';
    logger.info('Dev mode enabled');
}
else if( require('fs').existsSync(settings.file()) && settings.has('cleep.debug') && settings.get('cleep.debug') )
{
    //user enables debug mode
    logger.transports.console.level = 'debug';
    logger.transports.file.level = 'debug';
    logger.info('Debug mode enabled');
}
else
{
    //release mode, disable console log
    logger.transports.console.level = false;
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let splashScreen

// Parse command line arguments
function parseArgs()
{
    for (let i = 0; i < argv.length; i++)
    {
        if( argv[i]==='--nocore' )
        {
            //disable core. Useful to debug python aside
            coreDisabled = true;
        }
        else if( argv[i].match(/^--logfile=/) )
        {
            //log to file
            logger.transports.file.level = false;
            var level = argv[i].split('=')[1];
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' )
            {
                logger.transports.file.level = level;
            }
            else if( level==='no' )
            {
                //disable log
                logger.transports.file.level = false;
            }
            else
            {
                //invalid log level, set to default 'info'
                logger.transports.file.level = 'info';
            }
        }
        else if( argv[i].match(/^--logconsole=/) )
        {
            //log to console
            var level = argv[i].split('=')[1];
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' )
            {
                logger.transports.console.level = level;
            }
            else if( level==='no' )
            {
                //disable log
                logger.transports.console.level = false;
            }
            else
            {
                //invalid log level, set to default 'info'
                logger.transports.console.level = 'info';
            }
        }
    }
}

// Create application configuration file
function createConfig()
{
    //cleep
    settings.set('cleep.version', app.getVersion());
    if( !settings.has('cleep.isoraspbian') )
    {
        settings.set('cleep.isoraspbian', DEFAULT_ISORASPBIAN);
    }
    if( !settings.has('cleep.isolocal') )
    {
        settings.set('cleep.isolocal', DEFAULT_ISOLOCAL);
    }
    if( !settings.has('cleep.locale') )
    {
        settings.set('cleep.locale', DEFAULT_LOCALE);
    }
    if( !settings.has('cleep.debug') )
    {
        settings.set('cleep.debug', DEFAULT_DEBUG);
    }
    settings.set('cleep.isdev', isDev);
    if( !settings.has('cleep.crashreport') )
    {
        settings.set('cleep.crashreport', DEFAULT_CRASHREPORT);
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
                label: 'Updates',
                click: () => {
                    mainWindow.webContents.send('openPage', 'updates');
                }
            }, {
                label: 'Preferences',
                click: () => {
                    mainWindow.webContents.send('openModal', 'preferencesController', 'js/preferences/preferencesdialog.html');
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
                label: 'Automatic install',
                click: () => {
                    mainWindow.webContents.send('openPage', 'installAuto');
                }
            }, {
                label: 'Manual install',
                click: () => {
                    mainWindow.webContents.send('openPage', 'installManually');
                }
            }, {
                type: 'separator'
            }, {
                label: 'Monitoring',
                click: () => {
                    mainWindow.webContents.send('openPage', 'monitoring');
                }
            }
        ]
    },{
        label: 'Help',
        submenu: [
            {
                label: 'About CleepDesktop',
                click: () => {
                    mainWindow.webContents.send('openPage', 'about');
                }
            }, {
                type: 'separator'
            }, {
                label: 'Application help',
                click: () => {
                    mainWindow.webContents.send('openPage', 'help');
                }
            }
        ]
    }];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu)
};

// Create splash screen
// Code from https://github.com/buz-zard/random/blob/master/electron-compile-1/src/main.js
function createSplashScreen()
{
    //create splashscreen window
    splashScreen = new BrowserWindow({
        width: 250,
        height: 300,
        show: false,
        frame: false,
        parent: mainWindow
    });

    //load splashscreen content
    splashScreen.loadURL(url.format({
        pathname: path.join(__dirname, 'html/loading.html'),
        protocol: 'file:',
        slashes: true
    }), {"extraHeaders" : "pragma: no-cache\n"})

    //handle splashscreen events
    splashScreen.on('closed', () => splashScreen = null);
    splashScreen.webContents.on('did-finish-load', () => {
        splashScreen.show();
    });
};

// Create application main window
function createWindow ()
{
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width:1024,
        height:600,
        minHeight: 640,
        minWidth: 375,
        show: false,
        icon:__dirname+'/resources/256x256.png',
        title:'CleepDesktop'
    });

    // handle external url
    mainWindow.webContents.on('new-window', function(e, url) {
        e.preventDefault()
        shell.openExternal(url)
    });

    // close splashscreen when loaded
     mainWindow.once('ready-to-show', function(e) {
        if( splashScreen )
        {
            let splashScreenBounds = splashScreen.getBounds();
            setTimeout( function() {
                splashScreen.close();
            }, 1500 );
        }

        setTimeout( function() {
            mainWindow.maximize();
            mainWindow.show();
            mainWindow.focus();
        }, 1250 );
        
    });

    // and load the index.html of the app.
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'html/index.html'),
        protocol: 'file:',
        slashes: true
    }), {"extraHeaders" : "pragma: no-cache\n"})

    // Open the DevTools in dev mode only
    if( isDev )
    {
        //require('devtron').install();
        mainWindow.webContents.openDevTools();

        //log electron and chrome versions
        logger.debug('Electron version: ' + process.versions.electron);
        logger.debug('Chrome version: ' + process.versions.chrome);
    }

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
    })

};

// Launch core python application
function launchCore(rpcport)
{
    if( coreDisabled )
    {
        logger.debug('Core disabled');
        return;
    }

    //get config file path
    var configFile = settings.file();
    logger.debug('Config path: '+configFile);
    var configPath = path.dirname(configFile);
    var configFilename = path.basename(configFile);

    if( !isDev )
    {
        //launch release
        logger.debug('Launch release mode');
        let commandline = path.join(__dirname, 'cleepdesktopcore/cleepdesktopcore');
        let debug = settings.has('cleep.debug') && settings.get('cleep.debug') ? 'debug' : 'release';
        logger.debug('Core commandline: '+commandline+' ' + rpcport + ' ' + configPath + ' ' + configFilename + ' ' + debug);
        coreProcess = require('child_process').spawn(commandline, [rpcport, configPath, configFilename, 'release', 'false']);
    }
    else
    {
        //launch dev
        logger.debug('Launch development mode');
        logger.debug('Core commandline: python3 cleepdesktopcore.py ' + rpcport + ' ' + configPath + ' ' + configFilename + ' debug');
		var python_bin = 'python3'
		var python_args = ['cleepdesktopcore.py', rpcport, configPath, configFilename, 'debug', 'true']
		if( process.platform=='win32' )
		{
			python_bin = 'py';
			python_args.unshift('-3');
		}
        coreProcess = require('child_process').spawn(python_bin, python_args);
    }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
    logger.info('===== CleepDesktop started =====');
    logger.info('Platform: ' + process.platform);
    var display = electron.screen.getPrimaryDisplay();
    logger.info('Display: ' + display.size.width + 'x' + display.size.height);
    logger.info('Version: ' + app.getVersion());

    //parse command line arguments
    parseArgs();

    //fill configuration file
    createConfig();
    
    if( isDev )
    {
        //use static rpc port in development mode
        
        //save rpcport to config to be used in js app
        settings.set('remote.rpcport', DEFAULT_RPCPORT);

        //launch application
        createWindow();
        createSplashScreen();
        createMenu();
        launchCore(DEFAULT_RPCPORT);
    }
    else
    {
        //detect available port
        detectPort(null, (err, rpcport) => {
            if( err )
            {
                logger.error('Error detecting available port:', err);
            }

            //save rpcport to config to be used in js app
            settings.set('remote.rpcport', rpcport);

            //launch application
            createSplashScreen();
            createWindow();
            createMenu();
            launchCore(rpcport);
        });
    }
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        if( coreProcess )
        {
            logger.debug('Kill core');
            coreProcess.kill('SIGTERM')
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

