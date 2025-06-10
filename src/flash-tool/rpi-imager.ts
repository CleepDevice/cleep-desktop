import { appSettings } from '../app-settings';
import { appLogger } from '../app-logger';
import fs from 'fs';
import path from 'path';
import extract from 'extract-zip';
import { getError } from '../utils/app.helpers';
import { IToolUpdateStatus, OnUpdateAvailableCallback } from '../app-updater';
import { FlashOutput, FLASHTOOL_DIR } from '../app-iso';
import { downloadFile, OnDownloadProgressCallback } from '../utils/download';
import { getLatestGithubRelease, IGithubRepo, IRelease } from '../utils/github';

const FILENAME_DARWIN = '-macos-';
const FILENAME_LINUX = '-linux-';
const FILENAME_WINDOWS = '-windows-';
const RPIIMAGER_MACOS_BIN = 'rpi-imager';
const RPIIMAGER_LINUX_BIN = 'rpi-imager';
const RPIIMAGER_WINDOWS_BIN = 'rpi-imager.exe';
const RPIIMAGER_FLASH_PATTERN = /\s*(Writing|Verifying):\s*\[.*\]\s*(\d+)\s*/imu;

export class RpiImager {
  private readonly FLASHTOOL_REPO: IGithubRepo = { owner: 'CleepDevice', repo: 'cleep-desktop-flashtool' };
  private updateAvailableCallback: OnUpdateAvailableCallback;
  private downloadProgressCallback: OnDownloadProgressCallback;

  public async checkForUpdates(force = false): Promise<IToolUpdateStatus> {
    const latestFlashtoolRelease = await this.getLatestRelease();
    appLogger.debug('Latest flashtool release', { release: latestFlashtoolRelease });
    const currentFlashtoolVersion = this.getInstalledVersion();
    const rpiImagerBinPath = this.getRpiImagerBinPath();

    if (latestFlashtoolRelease.error) {
      return { updated: false, error: latestFlashtoolRelease.error };
    }

    if (latestFlashtoolRelease.version !== currentFlashtoolVersion || force || !fs.existsSync(rpiImagerBinPath)) {
      appLogger.info('Flashtool update available');
      this.install(latestFlashtoolRelease);
      return { updated: true };
    } else {
      appLogger.info('No flashtool update available');
      return { updated: false };
    }
  }

  public setUpdateCallbacks(
    updateAvailableCallback: OnUpdateAvailableCallback,
    downloadProgressCallback: OnDownloadProgressCallback,
  ): void {
    this.updateAvailableCallback = updateAvailableCallback;
    this.downloadProgressCallback = downloadProgressCallback;
  }

  public async install(release: IRelease): Promise<boolean> {
    const platform = String(process.platform);
    if (Object.keys(release).findIndex((key) => key === platform) === -1) {
      appLogger.error(`No flashtool version for platform ${platform}`);
      return false;
    }

    try {
      this.updateAvailableCallback({
        version: release.version,
        percent: 0,
      });

      const downloadUrl = release[platform as keyof typeof release as 'darwin' | 'linux' | 'win32'].downloadUrl;
      const archivePath = await downloadFile(downloadUrl, this.downloadProgressCallback);
      await this.unzipArchive(archivePath);

      appSettings.set('flashtool.version', release.version);
      this.downloadProgressCallback({ terminated: true });
    } catch (error) {
      appLogger.error(`Error installing flashtool: ${error}`);
      this.downloadProgressCallback({ percent: 100, error: getError(error) });
    }
  }

  private async unzipArchive(sourcePath: string) {
    const destinationPath = FLASHTOOL_DIR;
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.mkdirSync(destinationPath, { recursive: true });
    appLogger.debug(`Unzipping flashtool archive "${sourcePath}" to "${destinationPath}"`);
    await extract(sourcePath, { dir: destinationPath });
    appLogger.info('Flashtool extracted successfully');
  }

  public async getLatestRelease(): Promise<IRelease> {
    const latestRelease = await getLatestGithubRelease(this.FLASHTOOL_REPO);

    const darwinAsset = latestRelease.assets.find((asset) => asset.name.indexOf(FILENAME_DARWIN) >= 0);
    const linuxAsset = latestRelease.assets.find((asset) => asset.name.indexOf(FILENAME_LINUX) >= 0);
    const windowsAsset = latestRelease.assets.find((asset) => asset.name.indexOf(FILENAME_WINDOWS) >= 0);

    const release: IRelease = {
      version: latestRelease.tag.replace('v', ''),
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

  public getInstalledVersion(): string {
    const flashtoolVersion = appSettings.get<string>('flashtool.version');
    return (fs.existsSync(this.getRpiImagerBinPath()) && flashtoolVersion) || null;
  }

  private getRpiImagerBinPath(): string {
    const platform = String(process.platform);
    switch (platform) {
      case 'darwin':
        return path.join(FLASHTOOL_DIR, RPIIMAGER_MACOS_BIN);
      case 'linux':
        return path.join(FLASHTOOL_DIR, RPIIMAGER_LINUX_BIN);
      case 'win32':
        return path.join(FLASHTOOL_DIR, RPIIMAGER_WINDOWS_BIN);
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  public parseFlashOutput(line: string): FlashOutput {
    const matches: string[][] = [];
    if (line.includes('opening drive') || line.includes('opening image file') || line.includes('unmounting drive')) {
      return {
        mode: 'flashing',
        percent: 0,
        eta: -1,
      };
    } else if (line.includes('Writing') && line.includes('Verifying')) {
      // at end of process, bin returns all states
      return {
        mode: 'validating',
        percent: 100,
        eta: -1,
      };
    } else {
      this.parseOutput(line, matches);
      if (matches.length !== 1 || matches[0].length !== 3) {
        return;
      }

      return {
        mode: matches[0][1].toLowerCase() === 'writing' ? 'flashing' : 'validating',
        percent: parseInt(matches[0][2]),
        eta: -1,
      };
    }
  }

  private parseOutput(line: string, matches: string[][]): void {
    const res = RPIIMAGER_FLASH_PATTERN.exec(line);
    appLogger.debug('>>>>', res);
    if (res) {
      matches.push(res);
    }
  }
}

export const rpiImager = new RpiImager();
