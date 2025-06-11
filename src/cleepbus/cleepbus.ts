import { IToolUpdateStatus, OnUpdateAvailableCallback } from '../app-updater';
import { downloadFile, OnDownloadProgressCallback } from '../utils/download';
import { appLogger } from '../app-logger';
import path from 'path';
import { app } from 'electron';
import { ChildProcessByStdio, spawn, SpawnOptionsWithStdioTuple, StdioNull, StdioPipe } from 'child_process';
import { Readable } from 'stream';
import fs from 'fs';
import extract from 'extract-zip';
import { appSettings } from '../app-settings';
import { getError, getWsPort } from '../utils/app.helpers';
import { WebSocketServer, WebSocket } from 'ws';
import { appContext } from '../app-context';
import os from 'os';
import { CleebusMessageResponse, CleepbusMessage, CleepbusPeerInfos } from './cleepbus.types';
import {
  OnMessageBusConnectedCallback,
  OnMessageBusErrorCallback,
  OnMessageBusMessageResponseCallback,
  OnMessageBusPeerConnectedCallback,
  OnMessageBusPeerDisconnectedCallback,
  OnMessageBusUpdatingCallback,
} from './message-bus.types';
import find from 'find-process';
import terminate from 'terminate';
import { IGithubRepo, IRelease, getLatestGithubRelease } from '../utils/github';

export const CLEEPBUS_DIR = path.join(app.getPath('userData'), 'cleepbus');
const FILENAME_DARWIN = '-macos-';
const FILENAME_LINUX = '-linux-';
const FILENAME_WINDOWS = '-windows-';
const CLEEPBUS_DARWIN_BIN = 'cleepbus';
const CLEEPBUS_LINUX_BIN = 'cleepbus';
const CLEEPBUS_WINDOWS_BIN = 'cleepbus.exe';

export class Cleepbus {
  private readonly CLEEPBUS_REPO: IGithubRepo = { owner: 'CleepDevice', repo: 'cleep-desktop-cleepbus' };
  private updateAvailableCallback: OnUpdateAvailableCallback;
  private downloadProgressCallback: OnDownloadProgressCallback;
  private messageBusErrorCallback: OnMessageBusErrorCallback;
  private messageBusConnectedCallback: OnMessageBusConnectedCallback;
  private messageBusUpdatingCallback: OnMessageBusUpdatingCallback;
  private peerConnectedCallback: OnMessageBusPeerConnectedCallback;
  private peerDisconnectedCallback: OnMessageBusPeerDisconnectedCallback;
  private messageResponseCallback: OnMessageBusMessageResponseCallback;
  private wsServer: WebSocketServer;
  private cleepbusWs: WebSocket;
  private cleepbusProcess: ChildProcessByStdio<null, Readable, Readable>;
  private cleepbusStartupError: string;
  private wsPort: number;
  private forcedStop = false;

  public async start(): Promise<void> {
    this.wsPort = await getWsPort();

    this.launchWebsocketServer();
    this.launchCleepbus();
  }

  public stop(): void {
    // mark as forced stopped to avoid watchdog to relaunch cleepbus
    this.forcedStop = true;

    if (this.cleepbusProcess) {
      this.cleepbusProcess.kill('SIGTERM');
    }
    if (this.wsServer) {
      this.wsServer.close();
    }
  }

  public async checkForUpdates(force = false): Promise<IToolUpdateStatus> {
    const latestCleepbusRelease = await this.getLatestRelease();
    const currentCleepbusVersion = this.getInstalledVersion();
    const cleepbusBinPath = this.getCleepbusBinPath();

    if (latestCleepbusRelease.error) {
      this.updateAvailableCallback({
        version: latestCleepbusRelease.version,
        percent: 0,
        error: latestCleepbusRelease.error,
        terminated: true,
      });
      return { updateAvailable: false, error: latestCleepbusRelease.error };
    }

    if (latestCleepbusRelease.version !== currentCleepbusVersion || force || !fs.existsSync(cleepbusBinPath)) {
      appLogger.info('Cleepbus update available');
      this.install(latestCleepbusRelease);
      return { updateAvailable: true };
    } else {
      appLogger.info('No Cleepbus update available');
      return { updateAvailable: false };
    }
  }

  public setUpdateCallbacks(
    updateAvailableCallback: OnUpdateAvailableCallback,
    downloadProgressCallback: OnDownloadProgressCallback,
  ): void {
    this.updateAvailableCallback = updateAvailableCallback;
    this.downloadProgressCallback = downloadProgressCallback;
  }

  public setCleepbusCallbacks(
    messageBusErrorCallback: OnMessageBusErrorCallback,
    messageBusConnectedCallback: OnMessageBusConnectedCallback,
    messageBusUpdatingCallback: OnMessageBusUpdatingCallback,
    messageResponseCallback: OnMessageBusMessageResponseCallback,
    peerConnectedCallback: OnMessageBusPeerConnectedCallback,
    peerDisconnectedCallback: OnMessageBusPeerDisconnectedCallback,
  ): void {
    this.messageBusErrorCallback = messageBusErrorCallback;
    this.messageBusConnectedCallback = messageBusConnectedCallback;
    this.messageBusUpdatingCallback = messageBusUpdatingCallback;
    this.peerConnectedCallback = peerConnectedCallback;
    this.peerDisconnectedCallback = peerDisconnectedCallback;
    this.messageResponseCallback = messageResponseCallback;
  }

  private async launchCleepbus(): Promise<void> {
    this.forcedStop = false;

    const cleepbusPath = this.getCleepbusPath();
    if (!this.checkCleepbusInstallation(cleepbusPath)) {
      return;
    }

    // make sure previous install does not running
    this.killCleepbusInstances();

    try {
      const debug = appSettings.get<boolean>('cleep.debug');
      const uuid = appSettings.get<string>('cleep.uuid');
      const cleepbusArgs = [`--ws-port=${this.wsPort}`, `--uuid=${uuid}`];
      if (debug) {
        cleepbusArgs.push('--debug');
      }
      appLogger.info(`Cleepbus commandline: ${cleepbusPath} ${cleepbusArgs.join(' ')}`);
      const options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe> = {
        stdio: ['ignore', 'pipe', 'pipe'],
      };
      this.cleepbusProcess = spawn(cleepbusPath, cleepbusArgs, options);

      // handle process events
      this.cleepbusProcess.on('close', this.handleCleepbusProcessClosed.bind(this));
      this.cleepbusProcess.stdout.on('data', this.handleCleepbusStdoutData.bind(this));
      this.cleepbusProcess.stderr.on('data', this.handleCleepbusStderrData.bind(this));
    } catch (error) {
      this.cleepbusStartupError = 'Startup error';
      appLogger.error('Fatal error launching cleepbus', { error });
    }
  }

  private async killCleepbusInstances(): Promise<void> {
    try {
      const processes = await find('name', 'cleepbus');
      for (const process of processes) {
        if (process.cmd.search('ws-port') < 0) {
          continue;
        }
        terminate(process.pid);
      }
    } catch (error) {
      appLogger.error('Unable to kill Cleepbus instance', { error: error.message });
    }
  }

  private checkCleepbusInstallation(cleepbusPath: string): boolean {
    if (!this.getInstalledVersion()) {
      appLogger.info("Can't launch Cleepbus because it is not installed");
      return false;
    }

    // check binary exists (antiviral can delete pyinstaller generated binary)
    if (!fs.existsSync(cleepbusPath)) {
      const error = `Cleepbus binary was not found on path "${cleepbusPath}"`;
      appLogger.error(error);
      this.messageBusErrorCallback(error);
      return false;
    }

    return true;
  }

  private getCleepbusPath(): string {
    if (process.platform === 'win32') {
      return path.join(CLEEPBUS_DIR, 'cleepbus.exe');
    }
    return path.join(CLEEPBUS_DIR, 'cleepbus');
  }

  private handleCleepbusProcessClosed(code: number) {
    if (appContext.closingApplication || this.forcedStop) {
      appLogger.debug('Cleepbus voluntary stopped. Do not relaunch it');
      return;
    }

    appLogger.debug('Cleepbus stopped');
    if (code !== 0) {
      appLogger.error(`Cleepbus exited with code "${code}"`);
      // error occured, display error to user before terminates application
      const error = this.cleepbusStartupError || 'Cleepbus stopped';
      this.messageBusErrorCallback(error);
    }

    // relaunch cleepbus after 1 second to avoid useless log flood
    setTimeout(() => {
      appLogger.info('Relaunching cleepbus');
      this.launchCleepbus();
    }, 1000);
  }

  private handleCleepbusStdoutData(data: Readable): void {
    const stdout = data.toString().trim();
    for (const log of stdout.split('\n')) {
      if (log.startsWith('DEBUG:')) {
        appLogger.debug(log.substring(6), null, 'cleepbus');
      } else if (log.startsWith('INFO:')) {
        appLogger.info(log.substring(5), null, 'cleepbus');
      } else if (log.startsWith('WARN:')) {
        appLogger.warn(log.substring(5), null, 'cleepbus');
      } else if (log.startsWith('ERROR:')) {
        appLogger.error(log.substring(6), null, 'cleepbus');
      }
    }
  }

  private handleCleepbusStderrData(data: Readable): void {
    // do not process user warning messages
    const message = data.toString().trim();
    if (message.search('UserWarning:') != -1) {
      appLogger.debug('Drop UserWarning message', { message }, 'cleepbus');
      return;
    }

    // handle ASCII error
    if (message.search('hostname seems to have unsupported characters') != -1) {
      this.cleepbusStartupError = `Your computer hostname "${os.hostname()}" contains invalid characters. Please update it using only ASCII chars.`;
    }

    // handle python debug messages
    if (message.startsWith('DEBUG:')) {
      return;
    }

    appLogger.error(message, null, 'cleepbus');
  }

  private launchWebsocketServer(): void {
    appLogger.info(`Launching websocket server on port ${this.wsPort}`);
    this.wsServer = new WebSocketServer({ host: '127.0.0.1', port: this.wsPort });
    this.wsServer.on('connection', (ws: WebSocket) => {
      appLogger.debug('WebsocketServer received new connection');
      this.initCleepbusWebsocket(ws);
      this.messageBusConnectedCallback(true);
    });

    this.wsServer.on('headers', (headers: string[]) => {
      appLogger.debug('WebSocketServer received headers', { headers });
    });

    this.wsServer.on('close', () => {
      appLogger.info('WebSocketServer disconnected');
    });

    this.wsServer.on('error', (error: Error) => {
      appLogger.error('WebSocketServer error', { error });
    });
  }

  private initCleepbusWebsocket(ws: WebSocket): void {
    this.cleepbusWs = ws;

    this.cleepbusWs.on('close', () => {
      appLogger.info('Cleepbus websocket disconnected');
      this.messageBusConnectedCallback(false);
    });

    this.cleepbusWs.on('error', (error: Error) => {
      appLogger.error('Cleepbus websocket error', { error });
    });

    this.cleepbusWs.on('message', (message: Buffer) => {
      const parsedMessage = JSON.parse(message.toString('utf8')) as CleepbusMessage;
      appLogger.debug('Message received from Cleepbus', { parsedMessage });

      if (parsedMessage.content_type === 'PEER_CONNECTED' && this.peerConnectedCallback) {
        const connectedPeer = parsedMessage.peer_infos as CleepbusPeerInfos;
        this.peerConnectedCallback(connectedPeer);
        return;
      }
      if (parsedMessage.content_type === 'PEER_DISCONNECTED' && this.peerDisconnectedCallback) {
        const disconnectedPeer = parsedMessage.peer_infos as CleepbusPeerInfos;
        this.peerDisconnectedCallback(disconnectedPeer);
        return;
      }
      if (parsedMessage.content_type === 'MESSAGE_RESPONSE' && this.messageResponseCallback) {
        const peerInfos = parsedMessage.peer_infos as CleepbusPeerInfos;
        const messageResponse = parsedMessage.data as CleebusMessageResponse;
        this.messageResponseCallback(peerInfos, messageResponse);
        return;
      }

      appLogger.warn('Unhandled message received from Cleepbus', { message: parsedMessage });
    });
  }

  public sendMessage(message: string): void {
    if (this.cleepbusWs) {
      this.cleepbusWs.send(message);
    }
  }

  public async install(release: IRelease): Promise<boolean> {
    const platform = String(process.platform);
    if (Object.keys(release).findIndex((key) => key === platform) === -1) {
      appLogger.error(`No Cleepbus version for platform ${platform}`);
      return false;
    }

    try {
      this.updateAvailableCallback({
        version: release.version,
        percent: 0,
        terminated: false,
      });

      const downloadUrl = release[platform as keyof typeof release as 'darwin' | 'linux' | 'win32'].downloadUrl;
      const archivePath = await downloadFile(downloadUrl, this.downloadProgressCallback);

      // stop before unzipping to avoid error with running process
      this.messageBusUpdatingCallback(true);
      this.stop();
      await this.unzipArchive(archivePath);

      appSettings.set('cleepbus.version', release.version);
      this.downloadProgressCallback({ terminated: true, percent: 100 });

      appLogger.info(`Cleepbus v${release.version}updated successfully`);
      this.start();
    } catch (error) {
      appLogger.error(`Error installing Cleepbus: ${error}`);
      this.downloadProgressCallback({ percent: 100, terminated: true, error: getError(error) });
    } finally {
      this.messageBusUpdatingCallback(false);
    }
  }

  public getInstalledVersion(): string {
    return (fs.existsSync(this.getCleepbusBinPath()) && (appSettings.get('cleepbus.version') as string)) || null;
  }

  private getCleepbusBinPath(): string {
    const platform = String(process.platform);
    switch (platform) {
      case 'darwin':
        return path.join(CLEEPBUS_DIR, CLEEPBUS_DARWIN_BIN);
      case 'linux':
        return path.join(CLEEPBUS_DIR, CLEEPBUS_LINUX_BIN);
      case 'win32':
        return path.join(CLEEPBUS_DIR, CLEEPBUS_WINDOWS_BIN);
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  private async unzipArchive(sourcePath: string) {
    const destinationPath = CLEEPBUS_DIR;
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.mkdirSync(destinationPath, { recursive: true });
    appLogger.debug(`Unzipping Cleepbus archive "${sourcePath}" to "${destinationPath}"`);
    await extract(sourcePath, { dir: destinationPath });
    appLogger.info('Cleepbus extracted successfully');
  }

  public async getLatestRelease(): Promise<IRelease> {
    const latestRelease = await getLatestGithubRelease(this.CLEEPBUS_REPO);

    const darwinAsset = latestRelease?.assets?.find((asset) => asset.name.indexOf(FILENAME_DARWIN) >= 0);
    const linuxAsset = latestRelease?.assets?.find((asset) => asset.name.indexOf(FILENAME_LINUX) >= 0);
    const windowsAsset = latestRelease?.assets?.find((asset) => asset.name.indexOf(FILENAME_WINDOWS) >= 0);

    const release: IRelease = {
      version: latestRelease?.tag?.replace('v', ''),
      darwin: {
        downloadUrl: darwinAsset?.browser_download_url,
        filename: darwinAsset?.name,
        size: darwinAsset?.size,
      },
      linux: {
        downloadUrl: linuxAsset?.browser_download_url,
        filename: linuxAsset?.name,
        size: linuxAsset?.size,
      },
      win32: {
        downloadUrl: windowsAsset?.browser_download_url,
        filename: windowsAsset?.name,
        size: windowsAsset?.size,
      },
      error: latestRelease.error,
    };
    return release;
  }
}

export const cleepbus = new Cleepbus();
