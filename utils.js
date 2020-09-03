/**
 * Utility functions
 */

var fs = require('fs');
var path = require('path');
var { logger } = require('./log');

// pause process during specified amount of seconds
function pause(seconds) {
    if (seconds<=0) {
        return;
    }
    var now = new Date();
    var exitTime = now.getTime() + seconds * 1000;
    while (true) {
        now = new Date();
        if (now.getTime() > exitTime) {
            return;
        }
    }
};

// return true if current cleepdesktop instance is running in development mode
function isDev() {
    var corePath = path.join(__dirname, 'cleepdesktopcore.py');
    return fs.existsSync(corePath);
}

// parse command line arguments
function parseArgs(argv) {
    var params = {
        coreDisabled: false,
        loggerTransportsFileLevel: null,
        loggerTransportsConsoleLevel: null,
    }

    for (let i = 0; i < argv.length; i++) {
        if( argv[i]==='--nocore' ) {
            //disable core. Useful to debug python aside
            params.coreDisabled = true;
        } else if( argv[i].match(/^--logfile=/) ) {
            // log to file
            params.loggerTransportsFileLevel = false;
            var level = argv[i].split('=')[1];
            console.log('LEVEL=', level);
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' ) {
                params.loggerTransportsFileLevel = level;
            } else if( level==='no' ) {
                // disable log
                params.loggerTransportsFileLevel = false;
            } else {
                // invalid log level, set to default 'info'
                params.loggerTransportsFileLevel = 'info';
            }
        } else if( argv[i].match(/^--logconsole=/) ) {
            // log to console
            var level = argv[i].split('=')[1];
            params.loggerTransportsConsoleLevel = false;
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' ) {
                params.loggerTransportsConsoleLevel = level;
            } else if( level==='no' ) {
                // disable log
                params.loggerTransportsConsoleLevel = false;
            } else {
                // invalid log level, set to default 'info'
                params.loggerTransportsConsoleLevel = 'info';
            }
        }
    }

    return params;
}

// get changelog
function getChangelog(userDataPath, ) {
    var changelogPath = path.join(userDataPath, 'changelog.txt');
    var changelogExists = fs.existsSync(changelogPath);
    logger.debug('changelog.txt file "' + changelogPath + '" exists:' + changelogExists);

    var changelog = '';
    if( changelogExists ) {
        changelog = fs.readFileSync(changelogPath, { encoding: 'utf8' });
        logger.debug('Changelog: ' + changelog);
    }
    
    return changelog;
};

function setChangelog(userDataPath, changelog) {
    var changelogPath = path.join(userDataPath, 'changelog.txt');
    logger.debug('Write to changelog.txt "' + changelogPath + '"');
    fs.writeFileSync(changelogPath, changelog);
}

module.exports = {
    pause,
    isDev,
    parseArgs,
    getChangelog,
    setChangelog,
}