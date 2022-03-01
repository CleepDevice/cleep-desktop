import fs from 'fs';
import path from 'path';
import { appContext } from './app-context';
import { app, dialog } from 'electron';
import { ChildProcessByStdio, spawn, SpawnOptionsWithStdioTuple, StdioNull, StdioPipe } from 'child_process';
import os from 'os';
import { Readable } from 'stream';
import { appLogger } from './app-logger';
import { appSettings } from './app-settings';
import isDev from 'electron-is-dev';

export class AppCore {
  private cacheDir: string;
  private configFilePath: string;
  private configFileDir: string;
  private configFilename: string;
  private startupTimestamp: number;
  private coreProcess: ChildProcessByStdio<null, Readable, Readable>;
  private coreStartupError: string;

  constructor() {
    this.configFilePath = appSettings.filepath();
    this.configFilename = path.basename(this.configFilePath);
    this.configFileDir = path.dirname(this.configFilePath);
    this.initCacheDir();
  }

  private initCacheDir() {
    this.cacheDir = path.join(app.getPath('userData'), 'cache_cleepdesktop');

    if (!fs.existsSync(this.cacheDir)) {
      appLogger.info('Create cache directory' + this.cacheDir);
      fs.mkdirSync(this.cacheDir);
    }
  }

  public startProduction(rpcPort: number): void {
    appLogger.debug('Start core in production mode');

    let coreBin = path.join(__dirname + '.unpacked/', 'cleepdesktopcore/');
    if (!fs.existsSync(coreBin)) {
      coreBin = path.join(__dirname, 'cleepdesktopcore/');
    }
    if (process.platform == 'win32') {
      coreBin = path.join(coreBin, 'cleepdesktopcore.exe');
    } else {
      coreBin = path.join(coreBin, 'cleepdesktopcore');
    }

    // check binary exists (antiviral can delete pyinstaller generated binary)
    if (!fs.existsSync(coreBin)) {
      appLogger.error('Cleepdesktop core binary not found on path "' + coreBin + '"');
      dialog.showErrorBox(
        'Fatal error',
        'Unable to properly start application.\n' +
          'cleepdesktopcore binary not found. Please check your antiviral.\n' +
          'CleepDesktop will stop now.',
      );
      app.exit(1);
    }

    const debug = appSettings.get('cleep.debug') ? 'debug' : 'release';
    const coreArgs = [String(rpcPort), this.cacheDir, this.configFileDir, this.configFilename, debug, 'true'];

    this.startCore(coreBin, coreArgs);
  }

  public startDev(rpcPort: number): void {
    appLogger.debug('Start core in development mode');

    const coreBin = process.platform === 'win32' ? 'py -3' : 'python3';
    const coreArgs: string[] = [
      'cleepdesktopcore.py',
      String(rpcPort),
      this.cacheDir,
      this.configFileDir,
      this.configFilename,
      'debug',
      'true',
    ];
    if (process.platform === 'win32') {
      coreArgs.unshift('-3');
    }

    this.startCore(coreBin, coreArgs);
  }

  private startCore(binary: string, args: string[]): void {
    appLogger.debug(`Core commandline: ${binary} ${args.join(' ')}`);
    this.startupTimestamp = Math.round(Date.now() / 1000);
    const options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe> = { stdio: ['ignore', 'pipe', 'pipe'] };
    this.coreProcess = spawn(binary, args, options);

    // handle process events
    this.coreProcess.on('close', this.handleCoreProcessClosed);
    this.coreProcess.stdout.on('data', this.handleCoreStdoutData);
    this.coreProcess.stderr.on('data', this.handleCoreStderrData);
  }

  private handleCoreProcessClosed(code: number) {
    if (!appContext.closingApplication) {
      appLogger.debug(`Cleepdesktopcore exited with code "${code}"`);
      if (code !== 0) {
        // error occured, display error to user before terminates application
        const error = this.coreStartupError || 'unknown error';
        dialog.showErrorBox(
          'Fatal error',
          `Unable to properly start application.\n${error}\nCleepDesktop will stop now.`,
        );
        app.quit();
      }
    }
  }

  private handleCoreStdoutData(data: Readable): void {
    if (isDev) {
      return;
    }

    appLogger.debug(data.toString());
  }

  private handleCoreStderrData(data: Readable): void {
    // do not process user warning messages
    const message = data.toString();
    if (message.search('UserWarning:') != -1) {
      appLogger.debug('Drop UserWarning message');
      return;
    }

    // handle ASCII error
    if (message.search('hostname seems to have unsupported characters') != -1) {
      this.coreStartupError =
        'Your computer hostname "' +
        os.hostname() +
        '" contains invalid characters. Please update it using only ASCII chars.';
    }

    // only handle startup crash (5 first seconds), after core will handle it
    const now = Math.round(Date.now() / 1000);
    if (now <= this.startupTimestamp + 5) {
      appLogger.error(message);
      // TODO useful ?? throw new Error(message);
    }
  }

  public kill(): void {
    if (this.coreProcess) {
      this.coreProcess.kill('SIGTERM');
    }
  }
}

export const appCore = new AppCore();
