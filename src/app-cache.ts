import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { appLogger } from './app-logger';

export interface CachedFileInfos {
  filename: string;
  filesize: number;
  checksum: string;
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
    ipcMain.handle('cache-get-files', async () => {
      try {
        return this.getCachedFiles();
      } catch (error) {
        appLogger.error('Unable to get cached files', { error });
        return { data: {}, error: true };
      }
    });
  }

  public getCachedFileInfos(filename: string): CachedFileInfos {
    const files = fs.readdirSync(this.cacheDir, { encoding: 'utf8' });
    for (const file of files) {
      if (file === filename) {
        return this.getFileInfos(path.join(this.cacheDir, file));
      }
    }
    return null;
  }

  private getFileInfos(filepath: string): CachedFileInfos {
    const realFilename = path.basename(filepath);
    const fileExtension = path.extname(filepath);
    const [filename, checksum] = realFilename.replace(fileExtension, '').split(this.SEPARATOR);
    const fileStats = fs.statSync(filepath);

    return {
      filename,
      checksum,
      filesize: fileStats.size,
    };
  }

  public getCachedFiles(): CachedFileInfos[] {
    const cachedFiles: CachedFileInfos[] = [];

    const files = fs.readdirSync(this.cacheDir, { encoding: 'utf8' });
    for (const file of files) {
      try {
        cachedFiles.push(this.getFileInfos(path.join(this.cacheDir, file)));
      } catch (error) {
        appLogger.warn(`Invalid file "${file}" in cache directory`);
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

    fs.renameSync(filepath, newFilepath);

    return newFilepath;
  }

  public deleteCachedFile(filename: string) {
    const filepath = path.join(this.cacheDir, filename);
    if (fs.existsSync(filepath)) {
      fs.rmSync(filepath);
    }
  }
}

export const appCache = new AppCache();
