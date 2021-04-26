import fs from 'fs'
import path from "path";
import logger from 'electron-log';
import { appContext } from './app-context';
import { app, dialog } from 'electron';
import { spawn } from 'child_process';
import os from 'os';
import { Readable } from 'node:stream';

export function launchCore(rpcPort: number): void {
    // save rpcport to config to be used in js app and python app
    appContext.rpcPort = rpcPort;
    appContext.settings.set('remote.rpcport', rpcPort);

    if( appContext.coreDisabled ) {
        logger.debug('Core disabled');
        return;
    }

    // get config file path
    const configFile = appContext.settings.filepath();
    const cachePath = path.join(app.getPath('userData'), 'cache_cleepdesktop');
    const configPath = path.dirname(configFile);
    const configFilename = path.basename(configFile);
    let startupError = '';
    let coreStartupTime: number;

    // check whether cache dir exists or not
    if( !fs.existsSync(cachePath) ) {
        logger.debug('Create cache dir' + cachePath);
        fs.mkdirSync(cachePath);
    }

    if( !appContext.isDev ) {
        // launch release mode
        logger.debug('Launch release mode');

        // prepare command line
        let commandline = path.join(__dirname + '.unpacked/', 'cleepdesktopcore/');
        logger.debug('cmdline with asar: ' + commandline);
        if( !fs.existsSync(commandline) ) {
            commandline = path.join(__dirname, 'cleepdesktopcore/');
            logger.info('cmdline without asar: ' + commandline);
        }

        // append bin name
        if( process.platform=='win32' ) {
            commandline = path.join(commandline, 'cleepdesktopcore.exe');
        } else {
            commandline = path.join(commandline, 'cleepdesktopcore');
        }
        // check binary exists (antiviral can delete pyinstaller generated binary)
        if( !fs.existsSync(commandline) ) {
            logger.error('Cleepdesktop core binary not found on path "' + commandline + '"');
            dialog.showErrorBox(
                'Fatal error',
                'Unable to properly start application.\n' +
                'cleepdesktopcore binary not found. Please check your antiviral.\n' +
                'CleepDesktop will stop now.'
            );
            app.exit(1);
        }

        // launch command line
        const debug = appContext.settings.has('cleep.debug') && appContext.settings.get('cleep.debug') ? 'debug' : 'release';
        logger.debug('Core commandline: '+commandline+' ' + appContext.rpcPort + ' ' + cachePath + ' ' + configPath + ' ' + configFilename + ' ' + debug);
        coreStartupTime = Math.round(Date.now()/1000);
        appContext.coreProcess = spawn(commandline, [
            String(appContext.rpcPort),
            cachePath,
            configPath,
            configFilename,
            'release',
            'false'
        ]);

    } else {
        // launch dev
        logger.debug('Launch development mode');
        logger.debug('Core commandline: python3 cleepdesktopcore.py ' + appContext.rpcPort + ' ' + cachePath + ' ' + configPath + ' ' + configFilename + ' debug');
		let python_bin = 'python3'
        const python_args = [
            'cleepdesktopcore.py',
            String(appContext.rpcPort),
            cachePath,
            configPath,
            configFilename,
            'debug',
            'true'
        ]
		if( process.platform === 'win32' )
		{
			python_bin = 'py';
			python_args.unshift('-3');
        }
        coreStartupTime = Math.round(Date.now()/1000);
        appContext.coreProcess = spawn(python_bin, python_args);
    }

    // handle core stdout
    appContext.coreProcess.stdout.on('data', (data: Readable) => {
        if( appContext.isDev ) {
            // only log message in developer mode
            const message = data.toString();
            logger.debug(message);
        }
    });

    // handle core stderr
    appContext.coreProcess.stderr.on('data', (data: Readable) => {
        //do not send user warnings
        const message = data.toString();
        if( message.search('UserWarning:')!=-1 ) {
            logger.debug('Drop UserWarning message');
            return;
        }

        // handle ASCII error
        if( message.search('hostname seems to have unsupported characters')!=-1 ) {
            startupError = 'Your computer hostname "'+os.hostname()+'" contains invalid characters. Please update it using only ASCII chars.'
        }

        // only handle startup crash (5 first seconds), after core will handle it
        const now = Math.round(Date.now()/1000);
        if( now <= coreStartupTime + 5 ) {
            logger.error(message);
            throw new Error(message);
        }
    });

    // handle end of process
    appContext.coreProcess.on('close', (code: number) => {
        if( !appContext.closingApplication ) {
            logger.error('Core process exited with code "' + code + '"');
            if(code !== 0) {
                // error occured, display error to user before terminates application
                dialog.showErrorBox('Fatal error', 'Unable to properly start application.\n' +startupError+'\nCleepDesktop will stop now.');

                // stop application
                app.quit();
            }
        }
    });
}
