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
const DEFAULT_FIRSTRUN = true;
const DEFAULT_DEVICES = {};

//logger
const logger = require('electron-log')
global.logger = logger

//crash report
const { init } = require('@sentry/electron');
init({
    dsn: 'https://8e703f88899c42c18b8466c44b612472:3dfcd33abfda47c99768d43ce668d258@sentry.io/213385'
})

//electron
const electron = require('electron');
const {ipcMain} = electron;
const {dialog} = electron;

//electron updater
const {autoUpdater} = require('electron-updater');
autoUpdater.logger = logger;
//enable this flag to test pre release
//autoUpdater.allowPrerelease = true;
global.appUpdater = autoUpdater;

//create default variables
const app = electron.app;
global.cleepdesktopInfos = {
    version: app.getVersion(),
    changelog: null
};
app.setName('CleepDesktop');
const BrowserWindow = electron.BrowserWindow;
const argv = process.argv.slice(1);

//imports
const Menu = require('electron').Menu;
const shell = require('electron').shell;
const settings = require('electron-settings');
global.settings = settings;
const path = require('path');
const url = require('url');
const detectPort = require('detect-port');
const fs = require('fs');
const {download} = require('electron-dl');

//variables
var corePath = path.join(__dirname, 'cleepdesktopcore.py');
let isDev = fs.existsSync(corePath);
logger.info('Check if ' + corePath + ' exists: ' + isDev);
let coreProcess = null;
let coreDisabled = false;
let allowQuit = true;
let closingApplication = false;
let coreStartupTime = 0;
let downloadItem = null;
let downloadFilename = '';

//logger configuration
logger.transports.file.level = 'info';
logger.transports.file.maxSize = 1 * 1024 * 1024;
logger.transports.console.level = 'info';
if( isDev )
{
    //during development always enable debug on both console and log file
    logger.transports.console.level = 'debug';
    logger.transports.file.level = 'debug';
    logger.info('Dev mode enabled');
}
else if( fs.existsSync(settings.file()) && settings.has('cleep.debug') && settings.get('cleep.debug') )
{
    //release mode with debug enabled
    logger.transports.console.level = 'debug';
    logger.transports.file.level = 'debug';
    logger.info('Debug mode enabled according to user preferences');
}
else
{
    //release mode without debug, enable only info on console and do not touch log file config
    //logger.transports.console.level = 'info';
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let splashScreen

// Pause process during specified amount of seconds
function pause(seconds)
{
    if (seconds<=0)
        return;
    var now = new Date();
    var exitTime = now.getTime() + seconds * 1000;
    while (true) {
        now = new Date();
        if (now.getTime() > exitTime)
            return;
    }
}

// Fill changelog content in cleepdesktopInfos global variable
function fillChangelog()
{
    var changelogPath = path.join(app.getPath('userData'), 'changelog.txt');
    logger.debug('changelog.txt file path: ' + changelogPath);
    var changelogExists = fs.existsSync(changelogPath);
    if( !changelogExists )
    {
        //changelog file doesn't exist, create empty one for later use
        logger.debug('Create changelog.txt file');
        fs.writeFileSync(changelogPath, '');
    }

    //load changelog
    cleepdesktopInfos.changelog = fs.readFileSync(changelogPath, {encoding:'utf8'});
    logger.debug('changelog: ' + cleepdesktopInfos.changelog);
};

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

// Check application configuration file
// Create missing entries if necessary
function checkConfig() {
    let delay = 0;

    //cleep
    settings.set('cleep.version', app.getVersion());
    if( !settings.has('cleep.isoraspbian') ) {
        settings.set('cleep.isoraspbian', DEFAULT_ISORASPBIAN);
        delay = 2;
    }
    if( !settings.has('cleep.isolocal') ) {
        settings.set('cleep.isolocal', DEFAULT_ISOLOCAL);
        delay = 2;
    }
    if( !settings.has('cleep.locale') ) {
        settings.set('cleep.locale', DEFAULT_LOCALE);
        delay = 2;
    }
    if( !settings.has('cleep.debug') ) {
        settings.set('cleep.debug', DEFAULT_DEBUG);
        delay = 2;
    }
    settings.set('cleep.isdev', isDev);
    if( !settings.has('cleep.crashreport') ) {
        settings.set('cleep.crashreport', DEFAULT_CRASHREPORT);
        delay = 2;
    }

    //etcher
    if( !settings.has('etcher.version') ) {
        settings.set('etcher.version', 'v0.0.0');
        delay = 2;
    }

    //remote
    if( !settings.has('remote.rpcport') ) {
        settings.set('remote.rpcport', DEFAULT_RPCPORT);
        delay = 2;
    }

    //proxy
    if( !settings.has('proxy.mode') ) {
        settings.set('proxy.mode', DEFAULT_PROXYMODE);
        delay = 2;
    }
    if( !settings.has('proxy.host') ) {
        settings.set('proxy.host', DEFAULT_PROXYHOST);
        delay = 2;
    }
    if( !settings.has('proxy.port') ) {
        settings.set('proxy.port', DEFAULT_PROXYPORT);
        delay = 2;
    }

    //firstrun
    if( !settings.has('cleep.firstrun') ) {
        settings.set('cleep.firstrun', DEFAULT_FIRSTRUN);
        delay = 2;
    }

    //devices
    if( !settings.has('devices') ) {
        settings.set('devices', DEFAULT_DEVICES);
        delay = 2;
    }

    //in case of config file modification, make sure everything is written to disk
    pause(delay);
};

// Create application menu
function createMenu() {
    const subMenuFile = {
        label: 'File',
        submenu: [
            {
                label: 'Updates',
                click: () => {
                    mainWindow.webContents.send('openpage', 'updates');
                }
            }, {
                label: 'Preferences',
                click: () => {
                    mainWindow.webContents.send('openmodal', 'preferencesController', 'js/preferences/preferences-dialog.html');
                }
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'CmdOrCtrl+Q',
                click: () => {
                    app.quit();
                }
            }
        ]
    };
    const subMenuEdit = {
        label: 'Edit',
        submenu: [
            {
                label: "Cut",
                accelerator: "CmdOrCtrl+X",
                selector: "cut:"
            },
            {
                label: "Copy",
                accelerator: "CmdOrCtrl+C",
                selector: "copy:"
            },
            {
                label: "Paste",
                accelerator: "CmdOrCtrl+V",
                selector: "paste:"
            },
            {
                label: "Select All",
                accelerator: "CmdOrCtrl+A",
                selector: "selectAll:"
            }
        ]
    };
    const subMenuDevice = {
        label: 'Device',
        submenu: [
            {
                label: 'Install',
                click: () => {
                    mainWindow.webContents.send('openpage', 'installAuto');
                }
            }, {
                type: 'separator'
            }, {
                label: 'Monitoring',
                click: () => {
                    mainWindow.webContents.send('openpage', 'monitoring');
                }
            }
        ]
    };
    const subMenuHelp = {
        label: 'Help',
        submenu: [
            {
                label: 'Application help',
                click: () => {
                    mainWindow.webContents.send('openpage', 'help');
                }
            }, {
                type: 'separator'
            }, {
                label: 'Get support',
                click: () => {
                    mainWindow.webContents.send('openpage', 'support');
                }
            }, {
                type: 'separator'
            }, {
                label: 'About',
                click: () => {
                    mainWindow.webContents.send('openpage', 'about');
                }
            }
        ]
    };
    if( process.platform==='darwin' )
    {
        const menuTemplate = [subMenuFile, subMenuEdit, subMenuHelp];
        const menu = Menu.buildFromTemplate(menuTemplate);
        Menu.setApplicationMenu(menu);
    }
    else
    {
        const menuTemplate = [subMenuFile, subMenuHelp];
        const menu = Menu.buildFromTemplate(menuTemplate);
        Menu.setApplicationMenu(menu);
    }
};

// Create splash screen
// Code from https://github.com/buz-zard/random/blob/master/electron-compile-1/src/main.js
function createSplashScreen()
{
    //create splashscreen window
    splashScreen = new BrowserWindow({
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
        webPreferences: {
            nodeIntegration: true,
            webviewTag: true
        },
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
    }), {
        'extraHeaders': 'pragma: no-cache\n'
    });

    // Open the DevTools in dev mode only
    if( isDev || process.env.CLEEPDESKTOP_DEBUG )
    {
        //open devtool in dev mode
        mainWindow.webContents.openDevTools();

        //log electron and chrome versions
        logger.debug('Electron version: ' + process.versions.electron);
        logger.debug('Chrome version: ' + process.versions.chrome);
    }

    //give a chance to user to not stop current running action
    mainWindow.on('close', function(e) {
        //set closing flag (to avoid catching core process error)
        closingApplication = true;

        if( !allowQuit )
        {
            //something does not allow application to quit. Request user to quit or not
            var btnIndex = dialog.showMessageBoxSync(mainWindow, {
                type: 'question',
                buttons: ['Confirm quit', 'Cancel'],
                defaultId: 1,
                title: 'Quit application ?',
                message: 'A process is running. Quit application now can let inconsistent data. Quit anyway?'
            });

            if( btnIndex!=0 )
            {
                //user do not quit
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
    var cachePath = path.join(app.getPath('userData'), 'cache_cleepdesktop');
    var configPath = path.dirname(configFile);
    var configFilename = path.basename(configFile);

    //check whether cache dir exists or not
    if( !fs.existsSync(cachePath) )
    {
        logger.debug('Create cache dir' + cachePath);
        fs.mkdirSync(cachePath);
    }

    if( !isDev )
    {
        //launch release mode
        logger.debug('Launch release mode');

        //prepare command line
        let commandline = path.join(__dirname + '.unpacked/', 'cleepdesktopcore/');
        logger.debug('cmdline with asar: ' + commandline);
        if( !fs.existsSync(commandline) )
        {
            commandline = path.join(__dirname, 'cleepdesktopcore/');
            logger.info('cmdline without asar: ' + commandline);
        }

        //append bin name
        if( process.platform=='win32' )
        {
            commandline = path.join(commandline, 'cleepdesktopcore.exe');
        }
        else
        {
            commandline = path.join(commandline, 'cleepdesktopcore');
        }

        //launch command line
        let debug = settings.has('cleep.debug') && settings.get('cleep.debug') ? 'debug' : 'release';
        logger.debug('Core commandline: '+commandline+' ' + rpcport + ' ' + cachePath + ' ' + configPath + ' ' + configFilename + ' ' + debug);
        coreStartupTime = Math.round(Date.now()/1000);
        coreProcess = require('child_process').spawn(commandline, [rpcport, cachePath, configPath, configFilename, 'release', 'false']);
    }
    else
    {
        //launch dev
        logger.debug('Launch development mode');
        logger.debug('Core commandline: python3 cleepdesktopcore.py ' + rpcport + ' ' + cachePath + ' ' + configPath + ' ' + configFilename + ' debug');
		var python_bin = 'python3'
        var python_args = ['cleepdesktopcore.py', rpcport, cachePath, configPath, configFilename, 'debug', 'true']
		if( process.platform=='win32' )
		{
			python_bin = 'py';
			python_args.unshift('-3');
        }
        coreStartupTime = Math.round(Date.now()/1000);
        coreProcess = require('child_process').spawn(python_bin, python_args);
    }

    //handle core stdout
    coreProcess.stdout.on('data', (data) => {
        if( isDev ) {
            //only log message in developer mode
            var message = data.toString('utf8');
            logger.debug(message);
        }
    });

    //handle core stderr
    coreProcess.stderr.on('data', (data) => {
        //do not send user warnings
        var message = data.toString('utf8');
        if( message.search('UserWarning:')!=-1 )
        {
            logger.debug('Drop UserWarning message');
            return;
        }

        //only handle startup crash (5 first seconds), after core will handle it
        var now = Math.round(Date.now()/1000);
        if( now<=coreStartupTime+5 )
        {
            logger.error(message);
            throw new Error(message);
        }
    });

    //handle end of process
    coreProcess.on('close', (code) => {
        if( !closingApplication )
        {
            logger.error('Core process exited with code "' + code + '"');
            if( code!==0 )
            {
                //error occured, display error to user before terminates application
                dialog.showErrorBox("Fatal error", "Unable to start properly application.\nCleepDesktop will stop now.");

                //stop application
                app.quit();
            }
        }
    });
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

    //spashscreen asap
    createSplashScreen();

    //parse command line arguments
    parseArgs();

    //fill configuration file
    checkConfig();

    //fill changelog
    fillChangelog();

    if( isDev )
    {
        //use static rpc port in development mode
        
        //save rpcport to config to be used in js app
        settings.set('remote.rpcport', DEFAULT_RPCPORT);

        //launch application
        createWindow();
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
            createWindow();
            createMenu();
            launchCore(rpcport);
        });
    }
});

// Handle event to allow to quit application (or not)
ipcMain.on('allow-quit', (event, arg) => {
    logger.debug('allow-quit=' + arg);
    allowQuit = arg;
});

// Handle event to save changelog
ipcMain.on('save-changelog', (event, arg) => {
    logger.debug('Saving changelog...');
    var changelogPath = path.join(app.getPath('userData'), 'changelog.txt');
    fs.writeFile(changelogPath, arg, (err) => {
        if( err )
        {
            //error occured during changelog saving
            logger.error('Unable to save changelog: ' + err);
        }
    });
});

// Handle file download
ipcMain.on('download-file-cancel', (event, args) => {
    if( downloadItem!==null ) {
        //cancel running download
        downloadItem.cancel();
    }
});
ipcMain.on('download-file', (event, args) => {
    if( downloadItem!==null ) {
        //download already running, do not launch this one
        mainWindow.webContents.send('download-file-status', {
            status: 'alreadyrunning',
            percent: 0
        });
        return;
    }
    //make sure downloadItem is different from null asap
    downloadItem = undefined;

    //launch download
    download(BrowserWindow.getFocusedWindow(), args.url, {
        saveAs: true,
        onStarted: function(item) {
            downloadItem = item;
            downloadFilename = item.getFilename();
        },
        onProgress: function(percent) {
            if( typeof percent == 'number' ) {
                mainWindow.webContents.send('download-file-status', {
                    filename: downloadFilename,
                    status: 'downloading',
                    percent: Math.round(percent*100)
                });
            }
        },
        onCancel: function(item) {
            mainWindow.webContents.send('download-file-status', {
                filename: downloadFilename,
                status: 'canceled',
                percent: 0
            });
            downloadItem = null;
            downloadFilename = '';
        }
    })
        .then(function() {
            mainWindow.webContents.send('download-file-status', {
                filename: downloadFilename,
                status: 'success',
                percent: 100
            });
            downloadItem = null;
            downloadFilename = '';
        })
        .catch(function() {
            mainWindow.webContents.send('download-file-status', {
                filename: downloadFilename,
                status: 'failed',
                percent: 100
            });
            downloadItem = null;
            downloadFilename = '';
        });
});

// Application will quit, kill python process
app.on('will-quit', function(e) {
    if( coreProcess )
    {
        logger.debug('Kill core');
        coreProcess.kill('SIGTERM');
    }
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if( process.platform!=='darwin' )
    {
        app.quit()
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null)
    {
        createWindow()
    }
});

