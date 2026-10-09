import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { appLogger } from './app-logger';
import { handleInvoke, ipcErr, ipcOk } from './ipc/ipc-main';
import { unlinkInside } from './utils/safe-fs';
import { asBasename, assertPathInside, resolvePathInside } from './utils/safe-path';

export interface CachedFileInfos {
  filename: string;
  filesize: number;
  checksum: string;
  filepath: string;
}

interface AppFilename {
  filename: string;
  checksum: string;
  realFilename: string;
  realFilepath: string;
}

export class AppCache {
  private cacheDir = path.join(app.getPath('userData'), 'file-cache');
  private readonly SEPARATOR = '===';

  constructor() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir);
    }

    this.addIpcs();
  }

  private addIpcs(): void {
    handleInvoke('cache-get-infos', async () => {
      try {
        return ipcOk({
          files: this.getCachedFiles(),
          dir: this.cacheDir,
        });
      } catch (error) {
        appLogger.error('Unable to get cached files', { error });
        return ipcErr('CACHE_LIST_FAILED', 'Unable to get cached files');
      }
    });

    handleInvoke('cache-delete-file', (_event, filename) => {
      try {
        return ipcOk(this.deleteCachedFile(filename));
      } catch (error) {
        appLogger.error(`Unable to delete cached file ${filename}`, error);
        return ipcErr('CACHE_DELETE_FAILED', `Unable to delete cached file ${filename}`);
      }
    });

    handleInvoke('cache-purge-files', () => {
      try {
        this.purgeCachedFiles();
        return ipcOk(true);
      } catch (error) {
        appLogger.error(`Unable to purge cached files`, error);
        return ipcErr('CACHE_PURGE_FAILED', 'Unable to purge cached files');
      }
    });
  }

  public getCachedFileInfos(filename: string): CachedFileInfos {
    const appFilename = this.filenameToAppFilename(filename);
    if (!appFilename) {
      return null;
    }
    return this.getFileInfos(appFilename.realFilepath);
  }

  private getFileInfos(realFilepath: string): CachedFileInfos {
    const appFilename = this.realFilepathToAppFilename(realFilepath);
    const fileStats = fs.statSync(appFilename.realFilepath);

    return {
      filename: appFilename.filename,
      checksum: appFilename.checksum,
      filesize: fileStats?.size || 0,
      filepath: appFilename.realFilepath,
    };
  }

  private realFilepathToAppFilename(filepath: string): AppFilename {
    const realFilename = path.basename(filepath);
    const fileExtension = path.extname(filepath);
    const [filename, checksum] = realFilename.replace(fileExtension, '').split(this.SEPARATOR);

    return {
      filename: `${filename}${fileExtension}`,
      checksum,
      realFilename: realFilename,
      realFilepath: filepath,
    };
  }

  private filenameToAppFilename(filename: string): AppFilename {
    const safeName = asBasename(filename);
    const fileExtension = path.extname(safeName);
    const filenameWithoutExt = safeName.slice(0, safeName.length - fileExtension.length);

    const filenames = fs.readdirSync(this.cacheDir, { encoding: 'utf8' });
    for (const realFilename of filenames) {
      if (realFilename.startsWith(filenameWithoutExt)) {
        const filepath = resolvePathInside(this.cacheDir, asBasename(realFilename));
        return this.realFilepathToAppFilename(filepath);
      }
    }

    return null;
  }

  public getCachedFiles(): CachedFileInfos[] {
    const cachedFiles: CachedFileInfos[] = [];

    const filenames = fs.readdirSync(this.cacheDir, { encoding: 'utf8' });
    for (const filename of filenames) {
      try {
        const filepath = resolvePathInside(this.cacheDir, asBasename(filename));
        cachedFiles.push(this.getFileInfos(filepath));
      } catch {
        appLogger.warn(`Invalid file "${filename}" in cache directory`);
      }
    }

    return cachedFiles;
  }

  public cacheFile(filepath: string, checksum: string, filename?: string): string {
    const requestedFilename = asBasename(filename || path.basename(filepath));
    if (
      typeof checksum !== 'string' ||
      checksum.length === 0 ||
      checksum.includes('\0') ||
      /[\\/]/.test(checksum) ||
      checksum.includes(this.SEPARATOR)
    ) {
      throw new Error('Invalid checksum');
    }
    const fileExtension = path.extname(requestedFilename);
    const stem = requestedFilename.slice(0, requestedFilename.length - fileExtension.length);
    const newFilename = `${stem}${this.SEPARATOR}${checksum}${fileExtension}`;
    const newFilepath = resolvePathInside(this.cacheDir, newFilename);
    appLogger.debug(`Cache file "${filepath}" to "${newFilepath}"`);

    try {
      // Source files come from Electron temp/downloads; keep them inside those roots.
      const sourceRoots = [app.getPath('temp'), app.getPath('downloads'), this.cacheDir];
      let sourcePath: string | null = null;
      let sourceRoot: string | null = null;
      for (const root of sourceRoots) {
        try {
          sourcePath = assertPathInside(root, filepath);
          sourceRoot = root;
          break;
        } catch {
          // try next authorized root
        }
      }
      if (!sourcePath || !sourceRoot) {
        throw new Error('Invalid path specified!');
      }
      fs.copyFileSync(sourcePath, newFilepath);
      unlinkInside(sourceRoot, sourcePath);
    } catch (error) {
      appLogger.error(`Error occured while moving file to cache: ${error}`);
      throw new Error('Unable to move file to cache folder', { cause: error });
    }

    return newFilepath;
  }

  public deleteCachedFile(filename: string): boolean {
    const appFilename = this.filenameToAppFilename(filename);
    if (!appFilename) {
      return false;
    }

    fs.rmSync(appFilename.realFilepath);
    return !fs.existsSync(appFilename.realFilepath);
  }

  public purgeCachedFiles(): void {
    const filenames = fs.readdirSync(this.cacheDir, { encoding: 'utf8' });
    for (const filename of filenames) {
      try {
        this.deleteCachedFile(filename);
      } catch {
        appLogger.warn(`Invalid file "${filename}" in cache directory`);
      }
    }
  }
}

export const appCache = new AppCache();
