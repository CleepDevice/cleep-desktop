import { app, ipcMain, shell } from 'electron';
import logger from 'electron-log';
import { CommandLineArgs } from './utils/app.helpers';
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

export type LoggerFrom = 'main' | 'renderer' | 'core' | 'cleepbus';

export class AppLogger {
  constructor() {
    this.addIpcs();
    const debugEnabled = appSettings.get<boolean>('cleep.debug');
    this.initConsoleLogging(debugEnabled);
    this.initFileLogging(debugEnabled);
  }

  public setLogLevel(args: CommandLineArgs): void {
    if (!app.isPackaged) {
      // force debug during developments
      logger.transports.console.level = 'debug';
      logger.transports.file.level = 'debug';
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

  public debug(message: string, extra?: unknown, from?: LoggerFrom): void {
    this.log('debug', from || 'main', message, extra);
  }

  public info(message: string, extra?: unknown, from?: LoggerFrom): void {
    this.log('info', from || 'main', message, extra);
  }

  public warn(message: string, extra?: unknown, from?: LoggerFrom): void {
    this.log('warn', from || 'main', message, extra);
  }

  public error(message: string, extra?: unknown, from?: LoggerFrom): void {
    this.log('error', from || 'main', message, extra);
  }

  public log(level: LoggerLevel, from: LoggerFrom, message: string, extra?: unknown): void {
    let loggerCall = null;
    switch (level) {
      case 'debug':
        loggerCall = logger.debug;
        break;
      case 'info':
        loggerCall = logger.info;
        break;
      case 'warn':
        loggerCall = logger.warn;
        break;
      case 'error':
        loggerCall = logger.error;
        break;
      default:
        loggerCall = logger.info;
    }

    const messageStr = `[${from}] ${message}`;
    if (extra) {
      loggerCall(messageStr, extra);
    } else {
      loggerCall(messageStr);
    }
  }

  private addIpcs() {
    ipcMain.on('logger-log', (_event, arg: LoggerMessage) => {
      this.log(arg.level, 'renderer', arg.message, arg.extra);
    });

    ipcMain.on('open-electron-logs', async () => {
      const logPath = logger.transports.file.getFile();
      shell.openPath(logPath.path);
    });

    ipcMain.handle('get-electron-log-path', async () => {
      const logPath = logger.transports.file.getFile();
      return logPath.path;
    });
  }

  private initConsoleLogging(debugEnabled: boolean): void {
    logger.transports.console.level = !app.isPackaged || debugEnabled ? 'debug' : 'info';
    logger.transports.console.format = '%c[{h}:{i}:{s}.{ms} - {level}]%c {text}';
  }

  private initFileLogging(debugEnabled: boolean): void {
    logger.transports.file.level = !app.isPackaged || debugEnabled ? 'debug' : 'info';
    logger.transports.file.maxSize = 1 * 1024 * 1024;
    const logFilepath = path.join(app.getPath('userData'), 'cleepdesktop.log');
    logger.transports.file.resolvePathFn = () => logFilepath;
  }
}

export const appLogger = new AppLogger();
