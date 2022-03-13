import { Octokit } from '@octokit/rest';
import { appSettings } from '../app-settings';
import { appLogger } from '../app-logger';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import extract from 'extract-zip';
import { downloadFile, DriveUnit, findMatches, getError, OnDownloadProgressCallback } from '../utils';
import { exec } from 'child_process';
import { OnUpdateAvailableCallback } from '../app-updater';

const FILENAME_DARWIN = '-darwin-';
const FILENAME_LINUX = '-linux-';
const FILENAME_WINDOWS = '-windows-';
const BALENA_DARWIN_BIN = 'balena';
const BALENA_LINUX_BIN = 'balena';
const BALENA_WINDOWS_BIN = 'balena.exe';
// eslint-disable-next-line no-useless-escape
const DRIVELIST_WINDOWS = /^(\\.*?)\s+([\d\.]+)\s+(.*?)\s+(.*?)$/gmu;
// eslint-disable-next-line no-useless-escape
const DRIVELIST_LINUX = /^(\/.*?)\s+([\d\.]+)\s+(.*?)\s+(.*?)$/gmu;
const UNITS: DriveUnit[] = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'];

export interface ReleaseInfos {
  downloadUrl: string;
  size: number;
  filename: string;
}

export interface GithubRelease {
  version: string;
  darwin: ReleaseInfos;
  linux: ReleaseInfos;
  win32: ReleaseInfos;
}

export interface Drive {
  size: number;
  description: string;
  device: string;
}

export class Balena {
  private readonly BALENA_REPO = { owner: 'tangb', repo: 'cleep-desktop-flash-tool' };
  private github: Octokit;
  private updateAvailableCallback: OnUpdateAvailableCallback;
  private downloadProgressCallback: OnDownloadProgressCallback;

  constructor() {
    this.github = new Octokit();
  }

  public async checkForUpdates(force = false): Promise<boolean> {
    const latestBalenaRelease = await this.getLatestRelease();
    appLogger.debug('Latest flash tool release', { release: latestBalenaRelease });
    const currentBalenaVersion = this.getInstalledVersion();
    const balenaBinPath = this.getBalenaBinPath();

    if (latestBalenaRelease.version !== currentBalenaVersion || force || !fs.existsSync(balenaBinPath)) {
      appLogger.info('Flash tool update available');
      this.updateAvailableCallback({
        version: latestBalenaRelease.version,
        percent: 0,
      });
      this.install(latestBalenaRelease);
      return true;
    } else {
      appLogger.info('No flash tool update available');
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
      appLogger.error(`No flash tool for platform ${platform}`);
      return false;
    }

    try {
      const downloadUrl = release[platform as keyof typeof release as 'darwin' | 'linux' | 'win32'].downloadUrl;
      const archivePath = await downloadFile(downloadUrl, this.downloadProgressCallback);
      await this.unzipArchive(archivePath);

      appSettings.set('flashtool.version', release.version);
      this.downloadProgressCallback({ installed: true });
    } catch (error) {
      appLogger.error(`Error installing flash-tool: ${error}`);
      this.downloadProgressCallback({ percent: 100, error: getError(error) });
    }
  }

  private async unzipArchive(sourcePath: string) {
    const destinationPath = this.getBalenaInstallDir();
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.mkdirSync(destinationPath, { recursive: true });
    appLogger.debug(`Unzipping flash-tool archive "${sourcePath}" to "${destinationPath}"`);
    await extract(sourcePath, { dir: destinationPath });
    appLogger.info('Flash-tool extracted successfully');
  }

  public async getLatestRelease(): Promise<GithubRelease> {
    const latestRelease = await this.github.rest.repos.getLatestRelease(this.BALENA_REPO);
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

  public getInstalledVersion(): string {
    return (fs.existsSync(this.getBalenaBinPath()) && (appSettings.get('flashtool.version') as string)) || null;
  }

  private getBalenaBinPath(): string {
    const platform = String(process.platform);
    switch (platform) {
      case 'darwin':
        return path.join(this.getBalenaInstallDir(), BALENA_DARWIN_BIN);
      case 'linux':
        return path.join(this.getBalenaInstallDir(), BALENA_LINUX_BIN);
      case 'win32':
        return path.join(this.getBalenaInstallDir(), BALENA_WINDOWS_BIN);
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  private getBalenaInstallDir(): string {
    return path.join(app.getPath('userData'), 'flash-tool');
  }

  public async getDriveList(): Promise<Drive[]> {
    return new Promise((resolve, reject) => {
      const drives: Drive[] = [];

      const path = this.getBalenaBinPath();
      exec(`"${path}" util available-drives`, (error, stdout, stderr) => {
        if (error) {
          appLogger.error('Unable to get drives', { error });
          reject(error);
          return;
        }
        appLogger.debug('List drive command output', { stdout, stderr });

        const matches: string[][] = [];
        findMatches(this.getDrivePattern(), stdout, matches);
        // appLogger.debug('matches:', matches);
        for (const match of matches) {
          drives.push({
            size: this.computeSizeInBytes(match[2], match[3]),
            description: match[4],
            device: match[1],
          });
        }
        resolve(drives);
      });
    });
  }

  private computeSizeInBytes(sizeStr: string, unit: string): number {
    if (!this.isDriveUnit(unit)) {
      throw new Error(`Unit ${unit} is not supported`);
    }
    const size = parseFloat(sizeStr);
    const unitIndex = UNITS.findIndex((item) => unit === item);

    return size * Math.pow(1000, unitIndex);
  }

  private isDriveUnit(unit: string): unit is DriveUnit {
    return !!UNITS.find((item) => unit === item);
  }

  private getDrivePattern(): RegExp {
    const platform = String(process.platform);
    switch (platform) {
      case 'darwin':
        return DRIVELIST_LINUX;
      case 'linux':
        return DRIVELIST_LINUX;
      case 'win32':
        return DRIVELIST_WINDOWS;
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  public async flashDrive(device: string, isoPath: string) {
    // TODO
  }
}

export const balena = new Balena();
