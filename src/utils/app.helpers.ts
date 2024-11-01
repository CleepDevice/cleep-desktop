import { LoggerLevel, LoggerLevelEnum } from '../app-logger';
import detectPort from 'detect-port';
import { appSettings } from '../app-settings';
import isDev from 'electron-is-dev';

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

export async function getWsPort(): Promise<number> {
  if (isDev) {
    // use static port from config
    return appSettings.get<number>('remote.wsport');
  }

  // detect available port for production
  const wsPort = await detectPort(null);
  appSettings.set('remote.wsport', wsPort);
  return wsPort;
}

export function getError(error: Error): string {
  if (!error) {
    return 'Unknown error';
  }
  return `${error?.name || 'Error'}: ${error?.message || 'no message'}`;
}

export function findMatches(pattern: RegExp, search: string, matches: string[][]) {
  const res = pattern.exec(search);
  if (res) {
    matches.push(res);
    findMatches(pattern, search, matches);
  }
  return matches;
}
