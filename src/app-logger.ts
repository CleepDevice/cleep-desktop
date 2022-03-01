import { app, ipcMain, shell } from 'electron';
import logger from 'electron-log';
import isDev from 'electron-is-dev';
import { CommandLineArgs } from './utils';
import { appSettings } from './app-settings';
import path from 'path';

export enum LoggerLevelEnum {
  'no' = 'no',
  'debug' = 'debug',
  'info' = 'info',
  'warn' = 'warn',
  'error' = 'error',
}
export type LoggerLevel = keyof typeof LoggerLevelEnum;

export interface LoggerMessage {
  level: LoggerLevel;
  message: string;
  extra?: unknown;
}

export class AppLogger {
  constructor() {
    this.addIpcs();
    const debugEnabled = appSettings.get('cleep.debug') as boolean;
    this.initConsoleLogging(debugEnabled);
    this.initFileLogging(debugEnabled);
  }

  public setLogLevel(args: CommandLineArgs): void {
    if (isDev) {
      // config already set during init, do not overwrite
      return;
    }
    if (args.consoleLogLevel === 'no') {
      logger.transports.console.level = false;
    } else {
      logger.transports.console.level = args.consoleLogLevel;
    }

    if (args.consoleLogLevel === 'no') {
      logger.transports.file.level = false;
    } else {
      logger.transports.file.level = args.consoleLogLevel;
    }
  }

  public debug(message: string, extra?: unknown): void {
    this.log('debug', 'main', message, extra);
  }

  public info(message: string, extra?: unknown): void {
    this.log('info', 'main', message, extra);
  }

  public warn(message: string, extra?: unknown): void {
    this.log('warn', 'main', message, extra);
  }

  public error(message: string, extra?: unknown): void {
    this.log('error', 'main', message, extra);
  }

  private log(level: LoggerLevel, from: 'main' | 'renderer', message: string, extra?: unknown): void {
    let loggerCall = null;
    switch (level) {
      case 'debug':
        loggerCall = logger.debug;
        break;
      case 'info':
        loggerCall = logger.debug;
        break;
      case 'warn':
        loggerCall = logger.debug;
        break;
      case 'error':
        loggerCall = logger.debug;
        break;
      default:
        loggerCall = logger.info;
    }

    const messageStr = `[${from}] ${message}`;
    extra ? loggerCall(messageStr, extra) : loggerCall(messageStr);
  }

  private addIpcs() {
    ipcMain.on('logger-log', (_event, arg: LoggerMessage) => {
      this.log(arg.level, 'renderer', arg.message, arg.extra);
    });

    ipcMain.on('open-electron-logs', async () => {
      const logPath = await logger.transports.file.getFile();
      shell.openPath(logPath.path);
    });

    ipcMain.handle('get-electron-log-path', async () => {
      const logPath = await logger.transports.file.getFile();
      return logPath.path;
    });
  }

  private initConsoleLogging(debugEnabled: boolean): void {
    logger.transports.console.level = isDev || debugEnabled ? 'debug' : 'info';
  }

  private initFileLogging(debugEnabled: boolean): void {
    logger.transports.file.level = isDev || debugEnabled ? 'debug' : 'info';
    logger.transports.file.maxSize = 1 * 1024 * 1024;
    logger.transports.file.resolvePath = () => path.join(app.getPath('appData'), app.getName(), 'electron.log');
  }
}

export const appLogger = new AppLogger();
