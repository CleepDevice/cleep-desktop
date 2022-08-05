import { Octokit } from '@octokit/rest';
import { OnUpdateAvailableCallback } from '../app-updater';
import { downloadFile, OnDownloadProgressCallback } from '../utils/download';
import { appLogger } from '../app-logger';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import extract from 'extract-zip';
import { GithubRelease } from '../utils/github.types';
import { appSettings } from '../app-settings';
import { getError } from '../utils/helpers';

export const CLEEPBUS_DIR = path.join(app.getPath('userData'), 'cleepbus');
const FILENAME_DARWIN = '-macos-';
const FILENAME_LINUX = '-linux-';
const FILENAME_WINDOWS = '-windows-';
const CLEEPBUS_DARWIN_BIN = 'cleepbus';
const CLEEPBUS_LINUX_BIN = 'cleepbus';
const CLEEPBUS_WINDOWS_BIN = 'cleepbus.exe';

export class Cleepbus {
  private readonly CLEEPBUS_REPO = { owner: 'tangb', repo: 'cleep-desktop-cleepbus' };
  private github: Octokit;
  private updateAvailableCallback: OnUpdateAvailableCallback;
  private downloadProgressCallback: OnDownloadProgressCallback;

  constructor() {
    this.github = new Octokit();
  }

  public async checkForUpdates(force = false): Promise<boolean> {
    const latestBalenaRelease = await this.getLatestRelease();
    appLogger.debug('Latest Cleepbus release', { release: latestBalenaRelease });
    const currentBalenaVersion = this.getInstalledVersion();
    const balenaBinPath = this.getCleepbusBinPath();

    if (latestBalenaRelease.version !== currentBalenaVersion || force || !fs.existsSync(balenaBinPath)) {
      appLogger.info('Cleepbus update available');
      this.updateAvailableCallback({
        version: latestBalenaRelease.version,
        percent: 0,
      });
      this.install(latestBalenaRelease);
      return true;
    } else {
      appLogger.info('No Cleepbus update available');
      return false;
    }
  }

  public setUpdateCallbacks(
    updateAvailableCallback: OnUpdateAvailableCallback,
    downloadProgressCallback: OnDownloadProgressCallback,
  ): void {
    this.updateAvailableCallback = updateAvailableCallback;
    this.downloadProgressCallback = downloadProgressCallback;
  }

  public async install(release: GithubRelease): Promise<boolean> {
    const platform = String(process.platform);
    if (Object.keys(release).findIndex((key) => key === platform) === -1) {
      appLogger.error(`No Cleepbus version for platform ${platform}`);
      return false;
    }

    try {
      const downloadUrl = release[platform as keyof typeof release as 'darwin' | 'linux' | 'win32'].downloadUrl;
      const archivePath = await downloadFile(downloadUrl, this.downloadProgressCallback);
      await this.unzipArchive(archivePath);

      appSettings.set('cleepbus.version', release.version);
      this.downloadProgressCallback({ terminated: true });
    } catch (error) {
      appLogger.error(`Error installing Cleepbus: ${error}`);
      this.downloadProgressCallback({ percent: 100, error: getError(error) });
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

  public async getLatestRelease(): Promise<GithubRelease> {
    const latestRelease = await this.github.rest.repos.getLatestRelease(this.CLEEPBUS_REPO);
    appLogger.debug(JSON.stringify(latestRelease.data));

    const darwinAsset = latestRelease.data.assets.find((asset) => asset.name.indexOf(FILENAME_DARWIN) >= 0);
    const linuxAsset = latestRelease.data.assets.find((asset) => asset.name.indexOf(FILENAME_LINUX) >= 0);
    const windowsAsset = latestRelease.data.assets.find((asset) => asset.name.indexOf(FILENAME_WINDOWS) >= 0);

    const release: GithubRelease = {
      version: latestRelease.data.tag_name.replace('v', ''),
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
    };
    return release;
  }
}

export const cleepbus = new Cleepbus();
