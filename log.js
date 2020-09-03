/**
 * CleepDesktop logger
 */
var electronLog = require('electron-log')
var settings = require('electron-settings');
var { isDev } = require('./utils');

class CleepDesktopLogger {
    constructor() {
        electronLog.transports.file.level = 'info';
        electronLog.transports.file.maxSize = 1 * 1024 * 1024;
        electronLog.transports.console.level = 'info';
        if( isDev() ) {
            // during development always enable debug on both console and log file
            electronLog.transports.console.level = 'debug';
            electronLog.transports.file.level = 'debug';
            electronLog.info('Development mode enabled');
        } else if( fs.existsSync(settings.file()) && settings.hasSync('cleep.debug') && settings.getSync('cleep.debug') ) {
            // release mode with debug enabled
            electronLog.transports.console.level = 'debug';
            electronLog.transports.file.level = 'debug';
            electronLog.info('Debug mode enabled according to user preferences');
        } else {
            // release mode without debug, enable only info on console and do not touch log file config
            // electronLog.transports.console.level = 'info';
        }
    }

    setTransportsLevel(fileLevel, consoleLevel) {
        if (fileLevel) {
            electronLog.transports.file.level = fileLevel;
        }
        if (consoleLevel) {
            electronLog.transports.console.level = consoleLevel;
        }
    }

    raw() {
        return electronLog;
    }

    info(message, extra) {
        extra =  extra ? ' ' + JSON.stringify(extra): '';
        electronLog.info(message + extra);
    }

    warn(message, extra) {
        extra =  extra ? ' ' + JSON.stringify(extra): '';
        electronLog.warn(message + extra);
    }

    error(message, extra) {
        extra =  extra ? ' ' + JSON.stringify(extra): '';
        electronLog.error(message + extra);
    }

    debug(message, extra) {
        extra =  extra ? ' ' + JSON.stringify(extra): '';
        electronLog.debug(message + extra);
    }

    log(level, message, extra) {
        extra =  extra ? ' ' + JSON.stringify(extra): '';
        switch(level) {
            case 'info':
                electronLog.info(message + extra);
                break;
            case 'warn':
                electronLog.warn(message + extra);
                break;
            case 'error':
                electronLog.error(message + extra);
                break;
            case 'debug':
                electronLog.debug(message + extra);
                break;
            default:
                electronLog.debug(message + extra);
        }
    }
}

const logger = new CleepDesktopLogger();
module.exports = {
    logger
}
