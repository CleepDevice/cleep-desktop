import {
  ChildProcessByStdio,
  spawn,
  SpawnOptionsWithStdioTuple,
  spawnSync,
  SpawnSyncOptionsWithStringEncoding,
  StdioNull,
  StdioPipe,
} from 'child_process';
import { app } from 'electron';
import fs, { createReadStream, unlinkSync, unwatchFile, watchFile } from 'fs';
import path from 'path';
import { appLogger } from '../app-logger';
import { Readable } from 'stream';

export interface SudoOptions {
  appName: string;
  terminatedCallback: (exitCode: number) => void;
  stdoutCallback: (stdout: string) => void;
  stderrCallback: (stderr: string) => void;
}

const BINARIES_LINUX = {
  gksudo: ['--preserve-env', '--sudo-mode', '--description="=APPNAME="'],
  pkexec: ['--disable-internal-agent'],
};
type BinaryLinux = keyof typeof BINARIES_LINUX;

const BINARIES_DARWIN = {
  osascript: ['-e', '"do shell script \\"=COMMAND=\\" with administrator privileges"'],
};
type BinaryDarwin = keyof typeof BINARIES_DARWIN;

const BINARIES_WIN32 = {
  'elevate.exe': ['-wait'],
};
type BinaryWin32 = keyof typeof BINARIES_WIN32;

class LogFileOutput {
  public readIndex: number;
  constructor(public script: string, public log: string) {
    this.readIndex = 0;
  }
}

interface SudoCommand {
  command: string;
  args: string[];
  logFileOutput?: LogFileOutput;
}

/**
 * Admin elevation.
 * Inspired from https://github.com/solarlabsteam/electron-sudo/blob/master/src/lib/sudoer.js
 */
export class Sudo {
  private process: ChildProcessByStdio<null, Readable, Readable>;

  constructor(private options: SudoOptions) {}

  public run(command: string, args?: readonly string[]): void {
    const sudoCommand = this.getSudoCommand(command, args);

    appLogger.debug('Sudo command to execute', sudoCommand);
    const options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe> = {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    };
    this.process = spawn(sudoCommand.command, sudoCommand.args, options);

    this.process.on('close', this.onProcessTerminated.bind(this, sudoCommand.logFileOutput));
    this.process.stdout.on('data', this.onProcessStdout.bind(this));
    this.process.stderr.on('data', this.onProcessStderr.bind(this));
  }

  public kill(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
    }
  }

  private getSudoCommand(command: string, args?: readonly string[]): SudoCommand {
    if (process.platform === 'win32') return this.getSudoCommandForWindows(command, args);
    if (process.platform === 'darwin') return this.getSudoCommandForDarwin(command, args);
    if (process.platform === 'linux') return this.getSudoCommandForLinux(command, args);
  }

  private getSudoCommandForLinux(command: string, args?: readonly string[]): SudoCommand {
    appLogger.debug('getSudoCommandForLinux');
    const { binary: binaryCommand, path: binaryPath } = this.getLinuxBinaryPath();
    if (!binaryCommand) {
      throw new Error('No sudo binary found');
    }

    const escapedAppName = this.escapeDoubleQuotes(this.options.appName);
    const binaryArgs = BINARIES_LINUX[binaryCommand].map((arg) => arg.replace('=APPNAME=', escapedAppName));
    binaryArgs.push(command);
    binaryArgs.push(...args);

    return { command: binaryPath, args: binaryArgs };
  }

  private getSudoCommandForWindows(command: string, args?: readonly string[]): SudoCommand {
    appLogger.debug('getSudoCommandForWindows');
    const { binary: binaryCommand, path: binaryPath } = this.getWin32BinaryPath();
    if (!binaryCommand) {
      throw new Error('No sudo binary found');
    }

    // create batch to execute user command
    const batchId = Math.random();
    const batchPath = path.join(app.getPath('temp'), `sudo-command-${batchId}.bat`);
    const batchOutputPath = path.join(app.getPath('temp'), `sudo-output-${batchId}.log`);
    appLogger.debug('Windows batch paths', { batchPath, batchOutputPath });
    const batchContent = `${command} ${(args || []).join(' ')} > ${batchOutputPath} 2>&1 `;
    appLogger.debug('Windows batch content', {batchContent});
    fs.writeFileSync(batchPath, batchContent);
    fs.writeFileSync(batchOutputPath, '');

    // add watcher to detect file changes
    const logFileOutput = new LogFileOutput(batchPath, batchOutputPath);
    watchFile(batchOutputPath, { persistent: true, interval: 250 }, this.onWatcherChanged.bind(this, logFileOutput));

    const binaryArgs = BINARIES_WIN32[binaryCommand];
    binaryArgs.push(batchPath);

    return { command: binaryPath, args: binaryArgs, logFileOutput };
  }

  private getSudoCommandForDarwin(command: string, args?: readonly string[]): SudoCommand {
    appLogger.debug('getSudoCommandForDarwin');
    const { binary: binaryCommand, path: binaryPath } = this.getDarwinBinaryPath();
    if (!binaryCommand) {
      throw new Error('No sudo binary found');
    }

    const userCommand = [command, ...args].join(' ');
    const binaryArgs = BINARIES_DARWIN[binaryCommand].map((arg) => arg.replace('=COMMAND=', userCommand));

    return { command: binaryPath, args: binaryArgs };
  }

  private getLinuxBinaryPath(): { binary: BinaryLinux; path: string } {
    const spawnSyncOptions: SpawnSyncOptionsWithStringEncoding = { encoding: 'utf8' };
    const linuxKeys = Object.keys(BINARIES_LINUX) as BinaryLinux[];
    for (const binary of linuxKeys) {
      const { status, stdout } = spawnSync('which', [binary], spawnSyncOptions);
      appLogger.debug(`Linux: which result for ${binary}`, { status, stdout });
      if (status === 0) {
        return { binary, path: stdout.trim() };
      }
    }

    return { binary: null, path: null };
  }

  private getDarwinBinaryPath(): { binary: BinaryDarwin; path: string } {
    const spawnSyncOptions: SpawnSyncOptionsWithStringEncoding = { encoding: 'utf8' };
    const darwinKeys = Object.keys(BINARIES_DARWIN) as BinaryDarwin[];
    for (const binary of darwinKeys) {
      const { status, stdout } = spawnSync('which', [binary], spawnSyncOptions);
      appLogger.debug(`Darwin: which result for ${binary}`, { status, stdout });
      if (status === 0) {
        return { binary, path: stdout.trim() };
      }
    }

    return { binary: null, path: null };
  }

  private getWin32BinaryPath(): { binary: BinaryWin32; path: string } {
    // copy binary to temp path
    const win32Keys = Object.keys(BINARIES_WIN32) as BinaryWin32[];
    const binary = win32Keys[0];
    const elevateSrc = path.join(__dirname, binary);
    const elevateDst = path.join(app.getPath('temp'), binary);
    fs.copyFileSync(elevateSrc, elevateDst);

    return { binary, path: elevateDst };
  }

  private onProcessTerminated(logFileOutput: LogFileOutput, exitCode: number): void {
    if (this.options.terminatedCallback) {
      this.options.terminatedCallback(exitCode);
    }

    if (logFileOutput) {
      // delay cleanup to let watcher reads everything
      setTimeout(() => {
        appLogger.debug('Clean log file output');
        unwatchFile(logFileOutput.log);
        unlinkSync(logFileOutput.script);
        unlinkSync(logFileOutput.log);
      }, 500);     
    }
  }

  private onProcessStdout(data: Buffer): void {
    if (this.options.stdoutCallback) {
      this.options.stdoutCallback(data.toString('utf8'));
    }
  }

  private onProcessStderr(data: Buffer): void {
    if (this.options.stderrCallback) {
      this.options.stderrCallback(data.toString('utf8'));
    }
  }

  private onWatcherChanged(logFileOutput: LogFileOutput): void {
    const stream = createReadStream(logFileOutput.log, {encoding: 'utf8', start: logFileOutput.readIndex});
    stream.on('data', (chunk: Buffer) => {
      logFileOutput.readIndex += chunk.length;
      if (this.process) {
        this.process.stdout.emit('data', chunk);
      }
    });
    stream.on('error', (error) => {
      appLogger.error('Error occured during file reading', {error});
      if (this.process) {
        this.process.stderr.emit('data', error);
      }
    });
  }

  private escapeDoubleQuotes(str: string): string {
    return str.replace(/"/g, '\\"');
  }
}
