import { appContext } from './app-context';
import logger from 'electron-log';
import path from "path";
import fs from 'fs'
import { app } from 'electron';

export function parseArgs(argv: string[]): void {
    for (let i = 0; i < argv.length; i++) {
        if( argv[i]==='--nocore' ) {
            // disable core. Useful to debug python aside
            appContext.coreDisabled = true;
        } else if( argv[i].match(/^--logfile=/) ) {
            // log to file
            logger.transports.file.level = false;
            const level = argv[i].split('=')[1];
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' ) {
                logger.transports.file.level = level;
            } else if( level==='no' ) {
                // disable log
                logger.transports.file.level = false;
            } else {
                // invalid log level, set to default 'info'
                logger.transports.file.level = 'info';
            }
        } else if( argv[i].match(/^--logconsole=/) ) {
            // log to console
            const level = argv[i].split('=')[1];
            if( level==='error' || level==='warn' || level==='info' || level==='verbose' || level==='debug' || level==='silly' ) {
                logger.transports.console.level = level;
            } else if( level==='no' ) {
                // disable log
                logger.transports.console.level = false;
            } else {
                // invalid log level, set to default 'info'
                logger.transports.console.level = 'info';
            }
        }
    }
}

export function fillChangelog(): void {
    const changelogPath = path.join(app.getPath('userData'), 'changelog.txt');
    logger.debug('changelog.txt file path: ' + changelogPath);
    const changelogExists = fs.existsSync(changelogPath);
    if( !changelogExists ) {
        // changelog file doesn't exist, create empty one for later use
        logger.debug('Create changelog.txt file');
        fs.writeFileSync(changelogPath, '');
    }

    // load changelog
    appContext.changelog = fs.readFileSync(changelogPath, {encoding:'utf8'});
    logger.debug('changelog: ' + appContext.changelog);
}
