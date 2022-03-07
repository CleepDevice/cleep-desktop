import { appLogger, LoggerLevel, LoggerLevelEnum } from './app-logger';
import detectPort from 'detect-port';
import { appSettings } from './app-settings';
import isDev from 'electron-is-dev';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import uuid4 from 'uuid4';
import { app } from 'electron';

export interface CommandLineArgs {
  coreDisabled: boolean;
  consoleLogLevel: LoggerLevel;
  fileLogLevel: LoggerLevel;
}

export type DriveUnit = 'bytes' | 'kB' | 'MB' | 'GB' | 'TB' | 'PB';

/**
 * Parse command line args
 * Usage:
 * cleep-desktop <--nocore> <--logfile=level> <--logconsole=level>
 *  - nocore: do not launch python core
 *  - logfile: specify log level for file logger (see app-logger)
 *  - logconsole: specify log level for console logger (see app-logger)
 */
export function parseArgs(argv: string[]): CommandLineArgs {
  const args: CommandLineArgs = {
    coreDisabled: false,
    consoleLogLevel: 'info',
    fileLogLevel: 'info',
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--nocore') {
      // disable core. Useful to debug python aside
      args.coreDisabled = true;
    } else if (argv[i].match(/^--logfile=/)) {
      let level = argv[i].split('=')[1];
      if (!(level in LoggerLevelEnum)) {
        level = 'info';
      }
      args.fileLogLevel = level as LoggerLevel;
    } else if (argv[i].match(/^--logconsole=/)) {
      // log to console
      let level = argv[i].split('=')[1];
      if (!(level in LoggerLevelEnum)) {
        level = 'info';
      }
      args.consoleLogLevel = level as LoggerLevel;
    }
  }

  return args;
}

export async function getRpcPort(): Promise<number> {
  if (isDev) {
    // use static port from config
    return Number(appSettings.get('remote.rpcport'));
  }

  // detect available port for production
  const rpcPort = await detectPort(null);
  appSettings.set('remote.rpcport', rpcPort);
  return rpcPort;
}

export function getError(error: Error): string {
  if (!error) {
    return 'Unknown error';
  }
  return `${error?.name || 'Error'}: ${error?.message || 'no message'}`;
}

export function findMatches(pattern: RegExp, search: string, matches: string[][]) {
  const res = pattern.exec(search);
  res && matches.push(res) && findMatches(pattern, search, matches);
  return matches;
}

export interface UpdateData {
  version?: string;
  changelog?: string;
  percent?: number;
  error?: string;
  installed?: boolean;
}

export type OnDownloadProgressCallback = (updateData: UpdateData) => void;

export async function downloadFile(url: string, downloadProgressCallback: OnDownloadProgressCallback): Promise<string> {
  const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0' };
  const tmpFilename = path.join(app.getPath('temp'), uuid4() + '.zip');
  appLogger.debug(`Download flash-tool to ${tmpFilename}`);
  const writer = fs.createWriteStream(tmpFilename);

  appLogger.debug(`Download flash-tool from ${url}`);
  const download = await axios({ url, method: 'GET', headers, responseType: 'stream' });
  download.data.pipe(writer);

  const totalSize = Number(download.headers['content-length']) || 0;
  let downloadedSize = 0;
  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      appLogger.info('Flash-tool download completed');
      downloadProgressCallback({
        percent: 100,
      });
      resolve(tmpFilename);
    });
    writer.on('error', (error) => {
      reject(error);
    });
    writer.on('data', (chunk) => {
      if (totalSize === 0) {
        return;
      }
      downloadedSize += chunk.length;
      downloadProgressCallback({
        percent: totalSize === 0 ? 0 : Math.round(downloadedSize / totalSize),
      });
    });
  });
}
