import { Octokit } from '@octokit/rest';
import axios from 'axios';
import { appSettings } from '../app-settings';
import { appLogger } from '../app-logger';
import { GithubRelease } from './balena.types';
import fs from 'fs';
import path from 'path';
import uuid4 from 'uuid4';
import { app } from 'electron';
import extract from 'extract-zip';
import { OnUpdateAvailableCallback, OnDownloadProgressCallback } from '../app-updater';
import { getError } from '../utils';

const FILENAME_DARWIN = '-darwin-';
const FILENAME_LINUX = '-linux-';
const FILENAME_WINDOWS = '-windows-';
const BALENA_DARWIN_BIN = 'balena';
const BALENA_LINUX_BIN = 'balena';
const BALENA_WINDOWS_BIN = 'balena.exe';

export class Balena {
  private BALENA_REPO = { owner: 'tangb', repo: 'cleep-desktop-flash-tool' };
  private github: Octokit;
  private updateAvailableCallback: OnUpdateAvailableCallback;
  private downloadProgressCallback: OnDownloadProgressCallback;

  constructor() {
    this.github = new Octokit();
  }

  public async checkForUpdates(force = false): Promise<boolean> {
    const latestBalenaRelease = await this.getLatestRelease();
    appLogger.debug('Release', { release: latestBalenaRelease });
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
      const archivePath = await this.downloadFile(downloadUrl);
      await this.unzipArchive(archivePath);

      appSettings.set('flashtool.version', release.version);
      this.downloadProgressCallback({ installed: true });
    } catch (error) {
      appLogger.error(`Error install flash-tool: ${error}`);
      this.downloadProgressCallback({ percent: 100, error: getError(error) });
    }
  }

  private async downloadFile(url: string): Promise<string> {
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
        this.downloadProgressCallback({
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
        this.downloadProgressCallback({
          percent: totalSize === 0 ? 0 : Math.round(downloadedSize / totalSize),
        });
      });
    });
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
}

export const balena = new Balena();
