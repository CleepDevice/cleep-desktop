import { ReleaseNoteInfo } from 'builder-util-runtime';
import { BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, ProgressInfo, UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { appLogger } from './app-logger';
import { appContext } from './app-context';
import { balena, Balena } from './flash-tool/balena';
import { getError, UpdateData } from './utils';
import { appSettings } from './app-settings';

export interface UpdateProgress {
  progress: ProgressInfo;
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}

export interface UpdateStatus {
  lastUpdateCheck: number;
  cleepDesktop: boolean;
  flashTool: boolean;
}

export type OnUpdateAvailableCallback = (updateData: UpdateData) => void;

export class AppUpdater {
  private window: BrowserWindow;
  private flashTool: Balena;

  constructor() {
    // enable this flag to test pre release
    // autoUpdater.allowPrerelease = true;
    autoUpdater.logger = appLogger;
    this.flashTool = balena;
    balena.setUpdateCallbacks(this.onFlashToolUpdateAvailable.bind(this), this.onFlashToolDownloadProgress.bind(this));
    this.addListeners();
    this.addIpcs();
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
  }

  public quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  public getLatestVersion(): string {
    const version = autoUpdater.currentVersion;
    return version.format();
  }

  public async checkForUpdates(): Promise<UpdateStatus> {
    const cleepDesktopUpdate = await this.checkForCleepDesktopUpdates();
    const flashToolUpdate = await this.flashTool.checkForUpdates();
    const lastUpdateCheck = Math.round(new Date().getTime() / 1000);
    appSettings.set('cleep.lastupdatecheck', lastUpdateCheck);

    const changelogSize = appContext.getChangelogFilesize();
    if (changelogSize === 0) {
      const changelog = this.getChangelog(cleepDesktopUpdate.updateInfo.releaseNotes);
      appLogger.info('changelog:', changelog);
      appContext.saveChangelog(changelog);
    }

    return {
      lastUpdateCheck,
      cleepDesktop: cleepDesktopUpdate.updateInfo.version !== appContext.version,
      flashTool: flashToolUpdate,
    };
  }

  private async checkForCleepDesktopUpdates(): Promise<UpdateCheckResult> {
    if (appSettings.get('cleep.autoupdate')) {
      return await autoUpdater.checkForUpdates();
    }

    // dummy content
    return {
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

    ipcMain.handle('updater-check-for-updates', async () => {
      const updates = await this.checkForUpdates();
      return updates;
    });

    ipcMain.handle('updater-get-software-versions', () => {
      const flashToolVersion = this.flashTool.getInstalledVersion();
      const lastUpdateCheck = appSettings.get('cleep.lastupdatecheck');

      return {
        lastUpdateCheck,
        cleepDesktop: appContext.version,
        flashTool: flashToolVersion,
      };
    });
  }

  private addListeners() {
    autoUpdater.addListener('error', (error: Error) => {
      const data: UpdateData = {
        percent: 100,
        error: getError(error),
      };
      this.window.webContents.send('updater-cleepdesktop-download-progress', data);
    });

    autoUpdater.addListener('update-available', (info: UpdateInfo) => {
      appLogger.info(`CleepDesktop update available (v${info.version})`);

      const changelog = this.getChangelog(info.releaseNotes);
      const data: UpdateData = {
        version: info.version,
        changelog: changelog,
        percent: 0,
      };
      this.window.webContents.send('updater-cleepdesktop-update-available', data);
    });

    autoUpdater.addListener('download-progress', (progress: UpdateProgress) => {
      const data: UpdateData = {
        percent: progress.percent,
      };
      this.window.webContents.send('updater-cleepdesktop-download-progress', data);
    });

    autoUpdater.addListener('update-downloaded', (info: UpdateInfo) => {
      const changelog = this.getChangelog(info.releaseNotes);
      appContext.saveChangelog(changelog);

      const data: UpdateData = {
        percent: 100,
        installed: true,
      };
      this.window.webContents.send('updater-cleepdesktop-download-progress', data);
    });
  }

  private onFlashToolUpdateAvailable(updateData: UpdateData): void {
    this.window.webContents.send('updater-flashtool-update-available', updateData);
  }

  private onFlashToolDownloadProgress(updateData: UpdateData): void {
    this.window.webContents.send('updater-flashtool-download-progress', updateData);
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
