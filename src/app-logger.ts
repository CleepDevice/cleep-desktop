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
    if (extra) {
      logger.debug(message, extra);
    } else {
      logger.debug(message);
    }
  }

  public info(message: string, extra?: unknown): void {
    if (extra) {
      logger.info(message, extra);
    } else {
      logger.info(message);
    }
  }

  public warn(message: string, extra?: unknown): void {
    if (extra) {
      logger.warn(message, extra);
    } else {
      logger.warn(message);
    }
  }

  public error(message: string, extra?: unknown): void {
    if (extra) {
      logger.error(message, extra);
    } else {
      logger.error(message);
    }
  }

  private addIpcs() {
    ipcMain.on('logger-log', (_event, arg: LoggerMessage) => {
      switch (arg.level) {
        case 'debug':
          this.debug(arg.message, arg.extra);
          break;
        case 'info':
          this.info(arg.message, arg.extra);
          break;
        case 'warn':
          this.warn(arg.message, arg.extra);
          break;
        case 'error':
          this.error(arg.message, arg.extra);
          break;
        default:
          this.info(arg.message, arg.extra);
      }
    });

    ipcMain.on('open-electron-logs', async () => {
      const logPath = await logger.transports.file.getFile();
      shell.openPath(logPath.path);
    });

    ipcMain.on('get-electron-log-path', async (event) => {
      const logPath = await logger.transports.file.getFile();
      event.returnValue = logPath.path;
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
