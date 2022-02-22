import { ReleaseNoteInfo } from 'builder-util-runtime';
import { BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, ProgressInfo, UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { appLogger } from './app-logger';
import { appContext } from './app-context';

export interface UpdateProgress {
  progress: ProgressInfo;
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}

export interface UpdateInfoJson {
  version: string;
  releaseDate?: string;
  releaseName?: string;
  releaseNotes?: string;
}

export interface ErrorJson {
  name?: string;
  message?: string;
}

export class AppUpdater {
  public window: BrowserWindow;
  public changelog: string;

  constructor() {
    // enable this flag to test pre release
    // autoUpdater.allowPrerelease = true;
    autoUpdater.logger = appLogger;
    this.addListeners();
    this.addIpcs();
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
  }

  public quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  public getCurrentVersion(): string {
    const version = autoUpdater.currentVersion;
    return version.format();
  }

  public checkForUpdates(): Promise<UpdateCheckResult> {
    return autoUpdater.checkForUpdates();
  }

  private addIpcs(): void {
    ipcMain.on('updater-quit-and-install', () => {
      this.quitAndInstall();
    });

    ipcMain.on('updater-check-for-updates', async (event) => {
      event.returnValue = await this.checkForUpdates();
    });

    ipcMain.on('updater-get-current-version', (event) => {
      event.returnValue = this.getCurrentVersion();
    });
  }

  private addListeners() {
    autoUpdater.addListener('error', (error: Error) => {
      this.window.webContents.send('updater-error', this.convertErrorToJson(error));
    });

    autoUpdater.addListener('checking-for-update', () => {
      this.window.webContents.send('updater-checking-for-update');
    });

    autoUpdater.addListener('update-available', (info: UpdateInfo) => {
      appLogger.info(`Update available (v${info.version})`);
      this.window.webContents.send('updater-update-available', this.convertUpdateInfoToJson(info));
    });

    autoUpdater.addListener('update-not-available', (info: UpdateInfo) => {
      this.window.webContents.send('updater-update-not-available', this.convertUpdateInfoToJson(info));
    });

    autoUpdater.addListener('download-progress', (progress: UpdateProgress) => {
      appLogger.debug(`Downloading ${progress.percent}`);
      this.window.webContents.send('updater-download-progress', progress);
    });

    autoUpdater.addListener('update-downloaded', (info: UpdateInfo) => {
      appLogger.info('Update downloaded');
      if (this.changelog) {
        appContext.saveChangelog(this.changelog);
      }
      this.window.webContents.send('updater-update-downloaded', this.convertUpdateInfoToJson(info));
    });
  }

  private convertErrorToJson(error: Error): ErrorJson {
    if (!error) {
      return;
    }
    return {
      name: error?.name,
      message: error?.message,
    };
  }

  private convertUpdateInfoToJson(info: UpdateInfo): UpdateInfoJson {
    this.setChangelog(info.releaseNotes);
    return {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
      releaseNotes: this.changelog,
    };
  }

  private setChangelog(changelog?: string | ReleaseNoteInfo[]): void {
    if (!changelog) {
      return;
    }
    if (typeof changelog !== 'string') {
      changelog.forEach((note) => (this.changelog += `${note.version}: ${note.note}`));
    } else {
      this.changelog = changelog;
    }
  }
}

export const appUpdater = new AppUpdater();
