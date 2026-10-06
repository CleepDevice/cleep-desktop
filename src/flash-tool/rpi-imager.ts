import { FlashOutput } from './flashtool.interface';
import { RPI_IMAGER_DIR, RPI_IMAGER_VERSION } from './constants';
import { downloadFile, OnDownloadProgressCallback } from '../utils/download';
import { getGithubReleaseByTag, IGithubRepo, IRelease, IReleaseInfos } from '../utils/github';
import { extractZipArchive } from '../utils/unzip';
import { appSettings } from '../app-settings';
import { appLogger } from '../app-logger';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { getError } from '../utils/app.helpers';
import { IToolUpdateStatus, OnUpdateAvailableCallback } from '../app-updater';

const ASSET_DARWIN = 'rpi-imager-macos.zip';
const ASSET_LINUX = 'rpi-imager-linux-x64.zip';
const ASSET_WINDOWS = 'rpi-imager-windows-x64.zip';
const RPIIMAGER_MACOS_BIN = 'rpi-imager';
const RPIIMAGER_LINUX_BIN = 'rpi-imager';
const RPIIMAGER_WINDOWS_BIN = 'rpi-imager.exe';
const RPIIMAGER_FLASH_PATTERN = /\s*(Writing|Verifying):\s*\[.*\]\s*(\d+)\s*/imu;

export class RpiImager {
  /**
   * Packaged binary zips live on CleepDevice/cleep-desktop (tag rpi-imager-vX.Y.Z).
   * Source binaries are taken from raspberrypi/rpi-imager via scripts/package-rpi-imager.sh.
   */
  private readonly DESKTOP_REPO: IGithubRepo = { owner: 'CleepDevice', repo: 'cleep-desktop' };
  private updateAvailableCallback: OnUpdateAvailableCallback;
  private downloadProgressCallback: OnDownloadProgressCallback;

  public async checkForUpdates(force = false): Promise<IToolUpdateStatus> {
    const pinnedRelease = await this.getPinnedRelease();
    appLogger.debug('Pinned rpi-imager release', { release: pinnedRelease });
    const currentVersion = this.getInstalledVersion();
    const rpiImagerBinPath = this.getRpiImagerBinPath();

    if (pinnedRelease.error) {
      return { updateAvailable: false, error: pinnedRelease.error };
    }

    if (pinnedRelease.version !== currentVersion || force || !fs.existsSync(rpiImagerBinPath)) {
      appLogger.info('Raspberry Pi Imager update available', {
        pinned: pinnedRelease.version,
        current: currentVersion,
      });
      void this.install(pinnedRelease);
      return { updateAvailable: true };
    }

    appLogger.info('No Raspberry Pi Imager update available');
    return { updateAvailable: false };
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
      appLogger.error(`No rpi-imager package for platform ${platform}`);
      return false;
    }

    try {
      this.updateAvailableCallback({
        version: release.version,
        percent: 0,
        terminated: false,
      });

      const downloadUrl = release[platform as keyof typeof release as 'darwin' | 'linux' | 'win32'].downloadUrl;
      if (!downloadUrl) {
        throw new Error(`Missing rpi-imager download URL for ${platform}`);
      }

      let archivePath: string;
      if (downloadUrl.startsWith('file:')) {
        archivePath = fileURLToPath(downloadUrl);
        this.downloadProgressCallback({ terminated: false, percent: 100, eta: 0 });
      } else {
        archivePath = await downloadFile(downloadUrl, this.downloadProgressCallback);
      }
      await this.unzipArchive(archivePath);

      appSettings.set('rpiimager.version', release.version);
      this.downloadProgressCallback({ terminated: true, percent: 100 });
      return true;
    } catch (error) {
      appLogger.error(`Error installing rpi-imager: ${error}`);
      this.downloadProgressCallback({ percent: 100, terminated: true, error: getError(error) });
      return false;
    }
  }

  private async unzipArchive(sourcePath: string) {
    const destinationPath = RPI_IMAGER_DIR;
    fs.rmSync(destinationPath, { recursive: true, force: true });
    fs.mkdirSync(destinationPath, { recursive: true });
    appLogger.debug(`Unzipping rpi-imager archive "${sourcePath}" to "${destinationPath}"`);
    await extractZipArchive(sourcePath, destinationPath);
    this.ensureRpiImagerExecutable();
    appLogger.info('Raspberry Pi Imager extracted successfully');
  }

  /** Belt-and-suspenders: unzipper historically dropped +x; ensure the CLI binary is runnable. */
  private ensureRpiImagerExecutable(): void {
    const binPath = this.getRpiImagerBinPath();
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      fs.chmodSync(binPath, 0o755);
      appLogger.warn('Restored execute permission on rpi-imager binary', { binPath });
    }
  }

  public async getPinnedRelease(): Promise<IRelease> {
    const tag = `rpi-imager-v${RPI_IMAGER_VERSION}`;
    const localRelease = this.getLocalDistRelease();
    if (localRelease) {
      appLogger.info('Using local dist/ rpi-imager packages', { version: RPI_IMAGER_VERSION });
      return localRelease;
    }

    const githubRelease = await getGithubReleaseByTag(this.DESKTOP_REPO, tag);
    const release = this.mapAssetsToRelease(githubRelease?.assets);

    if (!githubRelease.error && this.hasPlatformAsset(release)) {
      return release;
    }

    const missingTagError =
      githubRelease.error?.includes('404') || githubRelease.error?.includes('not found')
        ? `Raspberry Pi Imager package missing: publish tag ${tag} on CleepDevice/cleep-desktop (npm run package:rpi-imager)`
        : githubRelease.error || `Unable to find rpi-imager assets for ${tag}`;

    return {
      ...release,
      error: missingTagError,
    };
  }

  private mapAssetsToRelease(
    assets: Array<{ name: string; browser_download_url: string; size: number }> | undefined,
  ): IRelease {
    const darwinAsset = assets?.find((asset) => asset.name === ASSET_DARWIN);
    const linuxAsset = assets?.find((asset) => asset.name === ASSET_LINUX);
    const windowsAsset = assets?.find((asset) => asset.name === ASSET_WINDOWS);

    return {
      version: RPI_IMAGER_VERSION,
      darwin: this.toReleaseInfos(darwinAsset),
      linux: this.toReleaseInfos(linuxAsset),
      win32: this.toReleaseInfos(windowsAsset),
    };
  }

  private toReleaseInfos(asset?: {
    name: string;
    browser_download_url: string;
    size: number;
  }): IReleaseInfos {
    return {
      downloadUrl: asset?.browser_download_url,
      filename: asset?.name,
      size: asset?.size,
    };
  }

  private hasPlatformAsset(release: IRelease): boolean {
    const platform = String(process.platform) as 'darwin' | 'linux' | 'win32';
    return Boolean(release[platform]?.downloadUrl);
  }

  /** Dev: use dist/rpi-imager-*.zip when present (after npm run package:rpi-imager). */
  private getLocalDistRelease(): IRelease | null {
    if (app.isPackaged) {
      return null;
    }

    const resolveLocal = (filename: string): IReleaseInfos | null => {
      const candidates = [
        path.join(process.cwd(), 'dist', filename),
        path.join(app.getAppPath(), '..', 'dist', filename),
        path.join(__dirname, '..', '..', 'dist', filename),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return {
            downloadUrl: pathToFileURL(candidate).href,
            filename,
            size: fs.statSync(candidate).size,
          };
        }
      }
      return null;
    };

    const darwin = resolveLocal(ASSET_DARWIN);
    const linux = resolveLocal(ASSET_LINUX);
    const win32 = resolveLocal(ASSET_WINDOWS);
    if (!darwin && !linux && !win32) {
      return null;
    }

    return {
      version: RPI_IMAGER_VERSION,
      darwin: darwin || { downloadUrl: undefined, filename: undefined, size: undefined },
      linux: linux || { downloadUrl: undefined, filename: undefined, size: undefined },
      win32: win32 || { downloadUrl: undefined, filename: undefined, size: undefined },
    };
  }

  public getInstalledVersion(): string {
    const version = appSettings.get<string>('rpiimager.version');
    return (fs.existsSync(this.getRpiImagerBinPath()) && version) || null;
  }

  private getRpiImagerBinPath(): string {
    const platform = String(process.platform);
    switch (platform) {
      case 'darwin':
        return path.join(RPI_IMAGER_DIR, RPIIMAGER_MACOS_BIN);
      case 'linux':
        return path.join(RPI_IMAGER_DIR, RPIIMAGER_LINUX_BIN);
      case 'win32':
        return path.join(RPI_IMAGER_DIR, RPIIMAGER_WINDOWS_BIN);
      default:
        throw new Error(`Platform ${platform} not supported`);
    }
  }

  /**
   * Parse specified line and return FlashOutput if something useful was found or undefined otherwise.
   */
  public parseFlashOutput(line: string): FlashOutput | undefined {
    const matches: string[][] = [];
    if (line.includes('opening drive') || line.includes('opening image file') || line.includes('unmounting drive')) {
      return {
        mode: 'flashing',
        percent: 0,
        eta: -1,
      };
    } else if (line.includes('Writing') && line.includes('Verifying')) {
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
    appLogger.debug('rpi-imager progress match', res);
    if (res) {
      matches.push(res);
    }
  }
}

export const rpiImager = new RpiImager();
