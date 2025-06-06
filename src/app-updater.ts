import { ReleaseNoteInfo } from 'builder-util-runtime';
import { BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, ProgressInfo, UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { appLogger } from './app-logger';
import { appContext } from './app-context';
import { getError } from './utils/app.helpers';
import { appSettings } from './app-settings';
import { cleepbus, Cleepbus } from './cleepbus/cleepbus';
import { sendDataToAngularJs } from './utils/ui.helpers';
import { RpiImager, rpiImager } from './flash-tool/rpi-imager';

export interface IToolUpdateStatus {
  updated: boolean;
  error?: string;
}

export interface UpdateStatus {
  lastUpdateCheck: number;
  cleepDesktop: boolean;
  flashTool: IToolUpdateStatus;
  cleepbus: IToolUpdateStatus;
}

export type OnUpdateAvailableCallback = (updateData: UpdateData) => void;

export interface UpdateData {
  version?: string;
  changelog?: string;
  percent?: number;
  error?: string;
  installed?: boolean;
}

type CheckForUpdateMode = 'auto' | 'manual';

export class AppUpdater {
  private window: BrowserWindow;
  private flashTool: RpiImager;
  private messageBus: Cleepbus;

  constructor() {
    // enable this flag to test pre release
    // autoUpdater.allowPrerelease = true;
    autoUpdater.logger = appLogger;

    this.flashTool = rpiImager;
    this.flashTool.setUpdateCallbacks(
      this.onFlashToolUpdateAvailable.bind(this),
      this.onFlashToolDownloadProgress.bind(this),
    );

    this.messageBus = cleepbus;
    this.messageBus.setUpdateCallbacks(
      this.onCleepbusUpdateAvailable.bind(this),
      this.onCleepbusDownloadProgress.bind(this),
    );

    this.addListeners();
    this.addIpcs();
  }

  public configure(window: BrowserWindow): void {
    this.window = window;

    setTimeout(() => {
      this.checkForUpdates('auto');
    }, 2000);
  }

  public quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  public getLatestVersion(): string {
    const version = autoUpdater.currentVersion;
    return version.format();
  }

  public isFlashToolInstalled(): boolean {
    return this.flashTool.getInstalledVersion() !== null;
  }

  public isCleepbusInstalled(): boolean {
    return this.messageBus.getInstalledVersion() !== null;
  }

  public async checkForUpdates(updateMode: CheckForUpdateMode): Promise<UpdateStatus> {
    const lastUpdateCheck = Math.round(new Date().getTime() / 1000);
    if (appContext.isDev && updateMode === 'auto') {
      appLogger.debug('Auto update is disabled during dev');
      return {
        lastUpdateCheck,
        cleepDesktop: false,
        flashTool: { updated: false },
        cleepbus: { updated: false },
      };
    }

    const cleepDesktopUpdateCheckResult = await this.checkForCleepDesktopUpdates();
    const cleepDesktopUpdate = cleepDesktopUpdateCheckResult?.updateInfo?.version
      ? cleepDesktopUpdateCheckResult?.updateInfo?.version !== appContext.version
      : false;
    const flashToolUpdate = await this.flashTool.checkForUpdates();
    if (flashToolUpdate.error) {
      sendDataToAngularJs(this.window, 'updater-cleepdesktop-download-progress', {
        percent: 100,
        error: flashToolUpdate.error,
      });
    }
    const cleepbusUpdate = await this.messageBus.checkForUpdates();
    if (cleepbusUpdate.error) {
      sendDataToAngularJs(this.window, 'updater-cleepdesktop-download-progress', {
        percent: 100,
        error: cleepbusUpdate.error,
      });
    }
    appLogger.debug('Update results', { cleepDesktopUpdate, flashToolUpdate, cleepbusUpdate });

    appSettings.set('cleep.lastupdatecheck', lastUpdateCheck);

    const changelogSize = appContext.getChangelogFilesize();
    if (changelogSize === 0 && cleepDesktopUpdateCheckResult?.updateInfo?.releaseNotes) {
      const changelog = this.getChangelog(cleepDesktopUpdateCheckResult.updateInfo.releaseNotes);
      appLogger.info('changelog:', changelog);
      appContext.saveChangelog(changelog);
    }

    return {
      lastUpdateCheck,
      cleepDesktop: cleepDesktopUpdate,
      flashTool: flashToolUpdate,
      cleepbus: cleepbusUpdate,
    };
  }

  private async checkForCleepDesktopUpdates(): Promise<UpdateCheckResult> {
    const autoUpdate = appSettings.get<boolean>('cleep.autoupdate');
    if (autoUpdate) {
      return autoUpdater.checkForUpdates();
    }

    // dummy content when autoupdate disabled
    return {
      isUpdateAvailable: false,
      updateInfo: {
        version: appContext.version,
        releaseNotes: '',
        files: [],
        path: '',
        releaseDate: null,
        sha512: '',
      },
      versionInfo: null,
    };
  }

  private addIpcs(): void {
    ipcMain.on('updater-quit-and-install', () => {
      this.quitAndInstall();
    });

    ipcMain.handle('updater-check-for-updates', async (_event) => {
      const updates = await this.checkForUpdates('manual');
      return updates;
    });

    ipcMain.handle('updater-get-software-versions', () => {
      const flashToolVersion = this.flashTool.getInstalledVersion();
      const cleepbusVersion = this.messageBus.getInstalledVersion();
      const lastUpdateCheck = appSettings.get<number>('cleep.lastupdatecheck');

      return {
        lastUpdateCheck,
        cleepDesktop: appContext.version,
        flashTool: flashToolVersion,
        cleepbus: cleepbusVersion,
      };
    });
  }

  private addListeners() {
    autoUpdater.addListener('error', (error: Error) => {
      const data: UpdateData = {
        percent: 100,
        error: getError(error),
      };
      sendDataToAngularJs(this.window, 'updater-cleepdesktop-download-progress', data);
    });

    autoUpdater.addListener('update-available', (info: UpdateInfo) => {
      appLogger.info(`CleepDesktop update available (v${info.version})`);

      const changelog = this.getChangelog(info.releaseNotes);
      const data: UpdateData = {
        version: info.version,
        changelog: changelog,
        percent: 0,
      };
      sendDataToAngularJs(this.window, 'updater-cleepdesktop-update-available', data);
    });

    autoUpdater.addListener('download-progress', (progress: ProgressInfo) => {
      const data: UpdateData = {
        percent: progress.percent,
      };
      sendDataToAngularJs(this.window, 'updater-cleepdesktop-download-progress', data);
    });

    autoUpdater.addListener('update-downloaded', (info: UpdateInfo) => {
      const changelog = this.getChangelog(info.releaseNotes);
      appContext.saveChangelog(changelog);

      const data: UpdateData = {
        percent: 100,
        installed: true,
      };
      sendDataToAngularJs(this.window, 'updater-cleepdesktop-download-progress', data);
    });
  }

  private onFlashToolUpdateAvailable(updateData: UpdateData): void {
    sendDataToAngularJs(this.window, 'updater-flashtool-update-available', updateData);
  }

  private onFlashToolDownloadProgress(updateData: UpdateData): void {
    sendDataToAngularJs(this.window, 'updater-flashtool-download-progress', updateData);
  }

  private onCleepbusUpdateAvailable(updateData: UpdateData): void {
    sendDataToAngularJs(this.window, 'updater-cleepbus-update-available', updateData);
  }

  private onCleepbusDownloadProgress(updateData: UpdateData): void {
    sendDataToAngularJs(this.window, 'updater-cleepbus-download-progress', updateData);
  }

  private getChangelog(changelog?: string | ReleaseNoteInfo[]): string {
    if (!changelog) {
      return '';
    }
    if (typeof changelog !== 'string') {
      let releaseNote = '';
      changelog.forEach((note) => (releaseNote += `${note.version}: ${note.note}\n`));
      return releaseNote;
    } else {
      return changelog;
    }
  }
}

export const appUpdater = new AppUpdater();
