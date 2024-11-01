import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { appLogger } from './app-logger';

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

class AppCache {
  private cacheDir = path.join(app.getPath('userData'), 'file-cache');
  private readonly SEPARATOR = '===';

  constructor() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir);
    }

    this.addIpcs();
  }

  private addIpcs(): void {
    ipcMain.handle('cache-get-infos', async () => {
      try {
        return {
          data: {
            files: this.getCachedFiles(),
            dir: this.cacheDir,
          },
        };
      } catch (error) {
        appLogger.error('Unable to get cached files', { error });
        return { data: {}, error: true };
      }
    });

    ipcMain.handle('cache-delete-file', (_event, filename: string) => {
      try {
        const deleted = this.deleteCachedFile(filename);
        return { data: deleted };
      } catch (error) {
        appLogger.error(`Unable to delete cached file ${filename}`, error);
        return { data: false, error: true };
      }
    });

    ipcMain.handle('cache-purge-files', () => {
      try {
        this.purgeCachedFiles();
        return { data: true };
      } catch (error) {
        appLogger.error(`Unable to purge cached files`, error);
        return { data: false, error: true };
      }
    });
  }

  public getCachedFileInfos(filename: string): CachedFileInfos {
    const files = fs.readdirSync(this.cacheDir, { encoding: 'utf8' });
    for (const file of files) {
      const appFilename = this.filenameToAppFilename(filename);
      if (appFilename) {
        return this.getFileInfos(path.join(this.cacheDir, file));
      }
    }
    return null;
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
    const fileExtension = path.extname(filename);
    const filenameWithoutExt = filename.replace(fileExtension, '');

    const filenames = fs.readdirSync(this.cacheDir, { encoding: 'utf8' });
    for (const realFilename of filenames) {
      if (realFilename.startsWith(filenameWithoutExt)) {
        const filepath = path.join(this.cacheDir, realFilename);
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
        const filepath = path.join(this.cacheDir, filename);
        cachedFiles.push(this.getFileInfos(filepath));
      } catch {
        appLogger.warn(`Invalid file "${filename}" in cache directory`);
      }
    }

    return cachedFiles;
  }

  public cacheFile(filepath: string, checksum: string, filename?: string): string {
    const requestedFilename = filename || path.basename(filepath);
    const fileExtension = path.extname(requestedFilename);
    const newFilename = `${requestedFilename.replace(fileExtension, '')}${this.SEPARATOR}${checksum}${fileExtension}`;
    const newFilepath = path.join(this.cacheDir, newFilename);
    appLogger.debug(`Cache file "${filepath}" to "${newFilepath}"`);

    try {
      fs.copyFileSync(filepath, newFilepath);
      fs.unlinkSync(filepath);
    } catch (error) {
      appLogger.error(`Error occured while moving file to cache: ${error}`);
      throw new Error('Unable to move file to cache folder');
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
