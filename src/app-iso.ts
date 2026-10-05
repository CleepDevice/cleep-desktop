import { app, BrowserWindow, ipcMain } from 'electron';
import { appLogger } from './app-logger';
import { appSettings } from './app-settings';
import { CleepOs } from './iso/cleepos';
import { RaspiOs, RaspiosLatestRelease } from './iso/raspios';
import { Wifi, WifiNetwork } from './iso/wifi';
import { IIsoReleaseInfo } from './iso/utils';
import { getError } from './utils/app.helpers';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sudo, SudoOptions } from './sudo/sudo';
import { unlink, writeFile } from 'fs/promises';
import { cancelDownload, downloadFile, IDownloadProgress } from './utils/download';
import { appUpdater } from './app-updater';
import { NotInstalledException } from './exceptions/not-installed.exception';
import { appCache } from './app-cache';
import { appContext } from './app-context';
import { sendDataToAngularJs } from './utils/ui.helpers';
import * as drivelist from 'drivelist';
import { rpiImager } from './flash-tool/rpi-imager';
import { Drive } from './flash-tool/flashtool.interface';
import { FLASHTOOL_DIR } from './flash-tool/constants';

export interface WifiData {
  network: string;
  security: string;
  password: string;
  hidden: boolean;
}

export interface InstallData {
  isoUrl: string;
  isoSha256: string;
  isoFilename: string;
  isoPath?: string;
  drivePath: string;
  wifiData: WifiData;
  wifiFilePath?: string;
}

export type { FlashOutput } from './flash-tool/flashtool.interface';
export { FLASHTOOL_DIR } from './flash-tool/constants';

type InstallStep = 'idle' | 'downloading' | 'privileges' | 'flashing' | 'validating' | 'canceled';

interface InstallProgress {
  percent?: number;
  eta?: number;
  step?: InstallStep;
  error?: string;
  terminated?: boolean;
}

const FLASH_STDERR_ERROR_PATTERN = /\b(error|failed|fatal|exception)\b/i;

class AppIso {
  private wifiNetworks: WifiNetwork[] = [];
  private lastRaspiosUpdate = 0;
  private readonly RASPIOS_CACHE_DURATION_MS = 6 * 60 * 60 * 1000;
  private raspios: RaspiOs;
  private cleepos: CleepOs;
  private wifi: Wifi;
  private isosReleases: {
    cleepos: IIsoReleaseInfo;
    raspios: RaspiosLatestRelease;
  } = { cleepos: null, raspios: null };
  private window: BrowserWindow;
  private currentInstall: {
    isoUrl: string;
    sudo: Sudo;
    wifiFilePath: string;
    flashError: string;
    canceled: boolean;
  } = { isoUrl: '', sudo: null, wifiFilePath: '', flashError: '', canceled: false };
  private installRunning = false;

  constructor() {
    this.raspios = new RaspiOs();
    this.cleepos = new CleepOs();
    this.wifi = new Wifi();
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();
  }

  public async refreshWifiNetworks() {
    try {
      this.wifiNetworks = await this.wifi.refreshNetworks();
    } catch (error) {
      appLogger.error('Unable to get wifi networks', { error });
    }
  }

  public getWifiNetworks(): WifiNetwork[] {
    return this.wifiNetworks;
  }

  public async getLatestRaspios(force = false): Promise<RaspiosLatestRelease> {
    appLogger.info('Getting latest RaspiOs release');
    const isoRaspios = appSettings.get<boolean>('cleep.isoraspios');
    if (!isoRaspios) {
      appLogger.debug('RaspiOs release disabled from config');
      return;
    }

    const now = Date.now();
    if (
      !force &&
      this.isosReleases.raspios &&
      this.lastRaspiosUpdate + this.RASPIOS_CACHE_DURATION_MS > now
    ) {
      return this.isosReleases.raspios;
    }

    try {
      this.isosReleases.raspios = await this.raspios.getReleases();
      appLogger.info('Found raspios releases', this.isosReleases.raspios);
      this.lastRaspiosUpdate = now;
      return this.isosReleases.raspios;
    } catch (error) {
      appLogger.error('Unable to get raspios releases', { error });
    }
  }

  public async getLatestCleepos(force = false): Promise<IIsoReleaseInfo> {
    appLogger.info('Getting latest CleepOs release');
    if (this.isosReleases.cleepos && !force) {
      appLogger.debug('CleepOs release already searched');
      return this.isosReleases.cleepos;
    }

    this.isosReleases.cleepos = await this.cleepos.getLatestRelease();
    appLogger.info('Found cleepos release', this.isosReleases.cleepos);
    return this.isosReleases.cleepos;
  }

  public async getDriveList(): Promise<Drive[]> {
    if (!appUpdater.isFlashToolInstalled()) {
      throw new NotInstalledException('flash-tool');
    }

    const rawDrives = await drivelist.list();
    appLogger.info('Found drives', rawDrives);

    const drives: Drive[] = [];
    for (const rawDrive of rawDrives) {
      if (rawDrive.error) {
        continue;
      } else if (!rawDrive.isUSB && !rawDrive.isCard) {
        // try to keep only volatile drive
        continue;
      } else if (!rawDrive.size) {
        // invalid size
        continue;
      }

      drives.push({
        device: rawDrive.device,
        description: rawDrive.description,
        size: rawDrive.size,
      });
    }

    return drives;
  }

  public async downloadIso(installData: InstallData): Promise<void> {
    try {
      this.currentInstall.isoUrl = installData.isoUrl;
      const isoPath = await downloadFile(
        installData.isoUrl,
        this.downloadProgressCallback.bind(this),
        installData.isoSha256,
      );
      this.downloadProgressCallback({ percent: 100, terminated: true, eta: 0 });

      installData.isoPath = appCache.cacheFile(isoPath, installData.isoSha256, installData.isoFilename);

      appLogger.info(`Iso downloaded to ${installData.isoPath}`);
    } catch (error) {
      appLogger.error(`Error downloading iso: ${error}`);
      this.downloadProgressCallback({ percent: 100, terminated: true, error: getError(error) });
      throw error;
    } finally {
      this.currentInstall.isoUrl = '';
    }
  }

  private getCachedFilepath(installData: InstallData): string {
    appLogger.debug('install data', installData);
    const cachedFileInfos = appCache.getCachedFileInfos(installData.isoFilename);
    if (!cachedFileInfos) {
      return;
    }

    return cachedFileInfos.checksum === installData.isoSha256 ? cachedFileInfos.filepath : null;
  }

  private downloadProgressCallback(downloadProgress: IDownloadProgress): void {
    const installProgress: InstallProgress = {
      percent: downloadProgress.percent,
      eta: downloadProgress.eta,
      step: 'downloading',
      error: downloadProgress?.error || '',
    };
    sendDataToAngularJs(this.window, 'iso-install-progress', installProgress);
  }

  private resolveLocalIsoPath(isoUrl: string): string {
    try {
      return fileURLToPath(isoUrl);
    } catch {
      // Fallback for malformed file URLs
      return decodeURIComponent(isoUrl.replace(/^file:\/\//i, ''));
    }
  }

  public async startInstall(installData: InstallData): Promise<void> {
    if (this.installRunning) {
      appLogger.warn('Install already running, ignoring new start request');
      return;
    }

    this.installRunning = true;
    this.currentInstall.canceled = false;
    this.currentInstall.flashError = '';
    this.currentInstall.wifiFilePath = '';

    try {
      appContext.allowAppClosing = false;

      const cachedFile = this.getCachedFilepath(installData);
      appLogger.debug('Cached file', cachedFile);
      if (installData.isoUrl.startsWith('file://')) {
        installData.isoPath = this.resolveLocalIsoPath(installData.isoUrl);
      } else if (cachedFile) {
        installData.isoPath = cachedFile;
      } else {
        await this.downloadIso(installData);
      }

      if (this.currentInstall.canceled) {
        return;
      }

      await this.writeWifiFile(installData);
      this.flashDrive(installData);
    } catch (error) {
      appContext.allowAppClosing = true;
      this.installRunning = false;
      const message = getError(error as Error);
      appLogger.error(`Iso install failed ${message}`);
      sendDataToAngularJs(this.window, 'iso-install-progress', {
        percent: 100,
        eta: 0,
        step: 'idle',
        terminated: true,
        error: message,
      });
      await this.cleanupWifiFile();
    }
  }

  public cancelInstall(): void {
    appLogger.debug('cancel request', this.currentInstall);
    this.currentInstall.canceled = true;

    if (this.currentInstall.isoUrl) {
      appLogger.info('Download canceled by user');
      cancelDownload(this.currentInstall.isoUrl);
      this.currentInstall.isoUrl = '';
    }

    if (this.currentInstall.sudo) {
      appLogger.info('SDCard flash canceled by user');
      this.currentInstall.sudo.kill();
      this.currentInstall.sudo = null;
    }

    void this.cleanupWifiFile();
    this.installRunning = false;
    appContext.allowAppClosing = true;
    sendDataToAngularJs(this.window, 'iso-install-progress', {
      percent: 0,
      eta: 0,
      step: 'canceled',
      terminated: true,
      error: '',
    });
  }

  private async cleanupWifiFile(wifiFilePath?: string): Promise<void> {
    const filePath = wifiFilePath || this.currentInstall.wifiFilePath;
    if (!filePath) {
      return;
    }
    try {
      await unlink(filePath);
      appLogger.debug(`Wifi config file removed ${filePath}`);
    } catch {
      // ignore missing file
    }
    if (this.currentInstall.wifiFilePath === filePath) {
      this.currentInstall.wifiFilePath = '';
    }
  }

  private async writeWifiFile(installData: InstallData): Promise<void> {
    if (!installData.wifiData) {
      return;
    }

    installData.wifiFilePath = path.join(app.getPath('temp'), 'cleep-network.conf');
    this.currentInstall.wifiFilePath = installData.wifiFilePath;

    const config = {
      network: installData.wifiData.network,
      password: installData.wifiData.password,
      encryption: String(installData.wifiData.security || '').toLowerCase(),
      hidden: installData.wifiData.hidden,
    };
    try {
      await writeFile(installData.wifiFilePath, JSON.stringify(config));
      appLogger.debug(`Wifi config written to ${installData.wifiFilePath}`);
    } catch (error) {
      throw new Error(`Error writing wifi file ${(error as Error)?.message || 'unknown error'}`);
    }
  }

  private flashDrive(installData: InstallData): void {
    const extension = process.platform === 'win32' ? '.bat' : '.sh';
    const command = path.join(FLASHTOOL_DIR, 'flash' + extension);
    const args = [FLASHTOOL_DIR, installData.drivePath, installData.isoPath];
    if (installData.wifiFilePath) {
      args.push(installData.wifiFilePath);
    }

    const installProgress: InstallProgress = {
      percent: 0,
      eta: 0,
      step: 'privileges',
    };
    sendDataToAngularJs(this.window, 'iso-install-progress', installProgress);

    const options: SudoOptions = {
      appName: app.name,
      terminatedCallback: this.flashTerminatedCallback.bind(this),
      stdoutCallback: this.flashStdoutCallback.bind(this),
      stderrCallback: this.flashStderrCallback.bind(this),
    };
    const sudo = new Sudo(options);
    this.currentInstall.sudo = sudo;
    sudo.run(command, args);
  }

  private flashTerminatedCallback(exitCode: number): void {
    appLogger.info(`Flash drive terminated (exit code: ${exitCode})`);
    const wifiFilePath = this.currentInstall.wifiFilePath;
    this.currentInstall.sudo = null;
    this.installRunning = false;

    if (this.currentInstall.canceled) {
      void this.cleanupWifiFile(wifiFilePath);
      appContext.allowAppClosing = true;
      return;
    }

    const failed = exitCode !== 0 || Boolean(this.currentInstall.flashError);
    const error =
      this.currentInstall.flashError ||
      (exitCode !== 0 ? `Flash failed with exit code ${exitCode}` : '');

    const installProgress: InstallProgress = {
      percent: 100,
      eta: 0,
      step: 'idle',
      terminated: true,
      error,
    };
    sendDataToAngularJs(this.window, 'iso-install-progress', installProgress);

    if (failed) {
      appLogger.error('Flash drive failed', { exitCode, error });
    }

    void this.cleanupWifiFile(wifiFilePath);
    appContext.allowAppClosing = true;
  }

  private flashStdoutCallback(stdout: string) {
    appLogger.debug('Drive flash stdout', stdout);
  }

  private flashStderrCallback(stderr: string) {
    // rpi-imager stdout is displayed on stderr on linux (maybe other platforms)
    const flashOutput = rpiImager.parseFlashOutput(stderr);
    appLogger.debug('Flash output parse result', flashOutput);
    if (flashOutput) {
      const installProgress: InstallProgress = {
        percent: flashOutput.percent,
        eta: flashOutput.eta,
        step: flashOutput.mode,
        error: '',
      };
      sendDataToAngularJs(this.window, 'iso-install-progress', installProgress);
      return;
    }

    const trimmed = stderr.trim();
    if (!trimmed) {
      return;
    }

    if (FLASH_STDERR_ERROR_PATTERN.test(trimmed)) {
      appLogger.error('Drive flash failed', { error: trimmed });
      this.currentInstall.flashError = trimmed;
      sendDataToAngularJs(this.window, 'iso-install-progress', {
        error: trimmed,
      });
      return;
    }

    appLogger.debug('Ignoring unparsed flash stderr', { stderr: trimmed });
  }

  private addIpcs(): void {
    ipcMain.handle('iso-get-isos', async (_event, force = false) => {
      try {
        const releases = await Promise.all([this.getLatestRaspios(Boolean(force)), this.getLatestCleepos(Boolean(force))]);
        const [raspios, cleepos] = releases;
        const error = raspios?.error || cleepos?.error;
        return { data: { raspios, cleepos }, error };
      } catch (error) {
        appLogger.error('Unable to get isos', { error });
        return { data: {}, error: true };
      }
    });

    ipcMain.handle('iso-refresh-wifi-networks', async () => {
      try {
        await this.refreshWifiNetworks();
        const networks = this.getWifiNetworks();
        return { data: networks, error: false };
      } catch (error) {
        appLogger.error('Unable to refresh wifi networks', { error });
        return { data: [], error: true };
      }
    });

    ipcMain.handle('iso-get-wifi-networks', () => {
      try {
        const networks = this.getWifiNetworks();
        return { data: networks, error: false };
      } catch (error) {
        appLogger.error('Unable to get wifi networks', { error });
        return { data: [], error: true };
      }
    });

    ipcMain.handle('iso-get-drives', async () => {
      try {
        const drives = await this.getDriveList();
        return { data: drives, error: false, flashToolInstalled: true };
      } catch (error) {
        if (error instanceof NotInstalledException) {
          return { data: [], error: true, flashToolInstalled: false };
        }
        appLogger.error('Unable to get drives', { error });
        return { data: [], error: true, flashToolInstalled: true };
      }
    });

    ipcMain.handle('iso-has-wifi', async () => {
      try {
        const hasWifi = await this.wifi.hasWifi();
        return { data: hasWifi, error: false };
      } catch {
        appLogger.error('Unable to know if wifi adapter exists');
        return { data: false, error: true };
      }
    });

    ipcMain.on('iso-start-install', (_event, installData: InstallData) => {
      appLogger.debug('Start iso install', installData);
      void this.startInstall(installData);
    });

    ipcMain.on('iso-cancel-install', () => {
      appLogger.debug('Cancel iso install');
      this.cancelInstall();
    });
  }
}

export const appIso = new AppIso();
