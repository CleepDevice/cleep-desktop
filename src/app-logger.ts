import { app, shell } from 'electron';
import logger from 'electron-log/node';
import { CommandLineArgs } from './utils/app.helpers';
import { appSettings } from './app-settings';
import path from 'path';
import { handleInvoke, ipcOk, onRendererSend } from './ipc/ipc-main';

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
    const loggerByLevel: Record<LoggerLevel, typeof logger.info> = {
      no: logger.info,
      debug: logger.debug,
      info: logger.info,
      warn: logger.warn,
      error: logger.error,
    };
    const loggerCall = loggerByLevel[level];

    const messageStr = `[${from}] ${message}`;
    if (extra) {
      loggerCall(messageStr, extra);
    } else {
      loggerCall(messageStr);
    }
  }

  private addIpcs() {
    onRendererSend('logger-log', (_event, arg) => {
      this.log(arg.level, 'renderer', arg.message, arg.extra);
    });

    onRendererSend('open-electron-logs', async () => {
      const logPath = logger.transports.file.getFile();
      shell.openPath(logPath.path);
    });

    handleInvoke('get-electron-log-path', async () => {
      const logPath = logger.transports.file.getFile();
      return ipcOk(logPath.path);
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
