//cleepdesktop version
const VERSION = '0.0.0';

//default config
const DEFAULT_RPCPORT = 5610;
const DEFAULT_DEBUG = false;
const DEFAULT_ISORASPBIAN = false;
const DEFAULT_LOCALE = 'en';
const DEFAULT_PROXYMODE = 'noproxy';
const DEFAULT_PROXYHOST = 'localhost';
const DEFAULT_PROXYPORT = 8080;

//electron
const electron = require('electron')

//create default variables
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const argv = process.argv.slice(1)

//imports
const Menu = require('electron').Menu
const shell = require('electron').shell;
const settings = require('electron-settings');
const path = require('path')
const url = require('url')
const log = require('electron-log')
const detectPort = require('detect-port');

//variables
var cleepremotePath = path.join(__dirname, 'cleepremote');
let isDev = !require('fs').existsSync(cleepremotePath);
let cleepremoteProcess = null;
let cleepremoteDisabled = false;

//log
log.transports.file.level = 'warn';
log.transports.console.level = false;
if( isDev )
{
    //enable console during development (can be overwritten by args)
    log.transports.console.level = 'debug';
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

// Parse command line arguments
function parseArgs()
{
    for (let i = 0; i < argv.length; i++)
    {
        if( argv[i]==='--norpc' )
        {
            //disable cleepremote. Useful to debug python aside
            cleepremoteDisabled = true;
        }
        else if( argv[i].match(/^--logfile=/) )
        {
            //log to file
            log.transports.file.level = false;
            var level = argv[i].split('=')[1];
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' )
            {
                log.transports.file.level = level;
            }
            else if( level==='no' )
            {
                //disable log
                log.transports.file.level = false;
            }
            else
            {
                //invalid log level, set to default 'info'
                log.transports.file.level = 'info';
            }
        }
        else if( argv[i].match(/^--logconsole=/) )
        {
            //log to console
            var level = argv[i].split('=')[1];
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' )
            {
                log.transports.console.level = level;
            }
            else if( level==='no' )
            {
                //disable log
                log.transports.console.level = false;
            }
            else
            {
                //invalid log level, set to default 'info'
                log.transports.console.level = 'info';
            }
        }
    }
}

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
        settings.set('cleep.locale', DEFAULT_LOCALE);
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
                label: 'Updates',
                click: () => {
                    mainWindow.webContents.send('openPage', 'updates');
                }
            }, {
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
                label: 'Automatic install',
                click: () => {
                    mainWindow.webContents.send('openPage', 'installAuto');
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
    mainWindow = new BrowserWindow({
        width:800,
        height:600,
        icon:__dirname+'/resources/256x256.png',
        title:'CleepDesktop'
    })
    mainWindow.maximize();

    // handle external url
    mainWindow.webContents.on('new-window', function(e, url) {
        e.preventDefault()
        shell.openExternal(url)
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
    }

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
    })

};

// Launch cleepremote python application
function launchCleepremote(rpcport)
{
    if( cleepremoteDisabled )
    {
        log.debug('Cleepremote disabled');
        return;
    }

    //get config file path
    var configFile = settings.file();
    log.debug('Config path: '+configFile);
    var configPath = path.dirname(configFile);
    var configFilename = path.basename(configFile);

    if( !isDev )
    {
        //launch release
        log.debug('Launch release mode');
        let commandline = path.join(__dirname, 'cleepremote/cleepremote');
        log.debug('Cleepremote commandline: '+commandline+' ' + rpcport + ' ' + configPath + ' ' + configFilename + ' release');
        cleepremoteProcess = require('child_process').spawn(commandline, [rpcport, configPath, configFilename, 'release']);
    }
    else
    {
        //launch dev
        log.debug('Launch development mode');
        log.debug('Cleepremote commandline: python3 cleepremote.py ' + rpcport + ' ' + configPath + ' ' + configFilename + ' debug');
        cleepremoteProcess = require('child_process').spawn('python3', ['cleepremote.py', rpcport, configPath, configFilename, 'debug']);
    }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
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
        createMenu();
        launchCleepremote(DEFAULT_RPCPORT);
    }
    else
    {
        //detect available port
        detectPort(null, (err, rpcport) => {
            if( err )
            {
                log.error('Error detecting available port:', err);
            }

            //save rpcport to config to be used in js app
            settings.set('remote.rpcport', rpcport);

            //launch application
            createWindow();
            createMenu();
            launchCleepremote(rpcport);
        });
    }
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        if( cleepremoteProcess )
        {
            log.debug('Kill cleepremote');
            cleepremoteProcess.kill('SIGTERM')
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

