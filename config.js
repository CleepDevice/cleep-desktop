/**
 * Handle CleepDesktop configuration
 */
var electronSettings = require('electron-settings');
var { pause, isDev } = require('./utils');

class CleepDesktopConfig {
    // default config
    DEFAULT_RPCPORT = 5610;
    DEFAULT_DEBUG = false;
    DEFAULT_ISORASPBIAN = false;
    DEFAULT_ISOLOCAL = false;
    DEFAULT_LOCALE = 'en';
    DEFAULT_PROXYMODE = 'noproxy';
    DEFAULT_PROXYHOST = 'localhost';
    DEFAULT_PROXYPORT = 8080;
    DEFAULT_CRASHREPORT = true;
    DEFAULT_FIRSTRUN = true;
    DEFAULT_DEVICES = {};

    // Check application configuration file (create missing entries)
    checkConfig(appVersion) {
        let delay = 0;

        // cleep
        electronSettings.setSync('cleep.version', appVersion);
        if( !electronSettings.hasSync('cleep.isoraspbian') ) {
            electronSettings.setSync('cleep.isoraspbian', this.DEFAULT_ISORASPBIAN);
            delay = 2;
        }
        if( !electronSettings.hasSync('cleep.isolocal') ) {
            electronSettings.setSync('cleep.isolocal', this.DEFAULT_ISOLOCAL);
            delay = 2;
        }
        if( !electronSettings.hasSync('cleep.locale') ) {
            electronSettings.setSync('cleep.locale', this.DEFAULT_LOCALE);
            delay = 2;
        }
        if( !electronSettings.hasSync('cleep.debug') ) {
            electronSettings.setSync('cleep.debug', this.DEFAULT_DEBUG);
            delay = 2;
        }
        electronSettings.setSync('cleep.isdev', isDev());
        if( !electronSettings.hasSync('cleep.crashreport') ) {
            electronSettings.setSync('cleep.crashreport', this.DEFAULT_CRASHREPORT);
            delay = 2;
        }

        // balena-etcher
        if( !electronSettings.hasSync('etcher.version') ) {
            electronSettings.setSync('etcher.version', 'v0.0.0');
            delay = 2;
        }

        // remote
        if( !electronSettings.hasSync('remote.rpcport') ) {
            electronSettings.setSync('remote.rpcport', this.DEFAULT_RPCPORT);
            delay = 2;
        }

        // proxy
        if( !electronSettings.hasSync('proxy.mode') ) {
            electronSettings.setSync('proxy.mode', this.DEFAULT_PROXYMODE);
            delay = 2;
        }
        if( !electronSettings.hasSync('proxy.host') ) {
            electronSettings.setSync('proxy.host', this.DEFAULT_PROXYHOST);
            delay = 2;
        }
        if( !electronSettings.hasSync('proxy.port') ) {
            electronSettings.setSync('proxy.port', this.DEFAULT_PROXYPORT);
            delay = 2;
        }

        // firstrun
        if( !electronSettings.hasSync('cleep.firstrun') ) {
            electronSettings.setSync('cleep.firstrun', this.DEFAULT_FIRSTRUN);
            delay = 2;
        }

        //devices
        if( !electronSettings.hasSync('devices') ) {
            electronSettings.setSync('devices', this.DEFAULT_DEVICES);
            delay = 2;
        }

        //in case of config file modification, make sure everything is written to disk
        pause(delay);
    };

    set(key, value) {
        electronSettings.setSync(key, value);
    }

    get(key) {
        return electronSettings.getSync(key);
    }

    has(key) {
        return electronSettings.hasSync(key);
    }

    getFilePath() {
        return electronSettings.file();
    }
}

const settings = new CleepDesktopConfig();
module.exports = {
    settings
}
