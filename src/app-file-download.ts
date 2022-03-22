import { BrowserWindow, DownloadItem, ipcMain } from 'electron';
import electronDl, { download } from 'electron-dl';
import uuid4 from 'uuid4';
import { appLogger } from './app-logger';

interface Download {
  downloadId: string;
  downloadItem: DownloadItem;
}

export interface DownloadComplete {
  filename: string;
  path: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

export class AppFileDownload {
  private downloads: Record<string, Download> = {};
  public window: BrowserWindow;

  constructor() {
    this.addIpcs();
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
  }

  private addIpcs() {
    ipcMain.on('download-file-cancel', (_event, downloadId: string) => {
      appLogger.debug(`Received download cancel action for ${downloadId}`);
      const download = this.getDownload(downloadId);
      if (download) {
        download.downloadItem.cancel();
      }
    });

    ipcMain.on('download-file', async (_event, url: string) => {
      const downloadId = uuid4();
      appLogger.info(`Downloading file from ${url} with id ${downloadId}`);
      this.downloadUrl(downloadId, url);
    });
  }

  private async downloadUrl(downloadId: string, url: string): Promise<void> {
    try {
      await download(this.window, url, {
        saveAs: true,
        onStarted: (item: DownloadItem) => {
          this.onDownloadStarted(downloadId, url, item);
        },
        onProgress: (progress: electronDl.Progress) => {
          this.onDownloadProgress(downloadId, progress);
        },
        onCancel: (item: DownloadItem) => {
          this.onDownloadCancel(downloadId, item);
        },
        onCompleted: (item: DownloadComplete) => {
          this.onDownloadCompleted(downloadId, item);
        },
      });
    } catch (error) {
      const download = this.getDownload(downloadId);
      if (download) {
        this.deleteDownload(downloadId);
        this.window.webContents.send('download-file-status', {
          downloadId,
          filename: download.downloadItem.getFilename(),
          status: 'failed',
          percent: 100,
        });
      }
    }
  }

  private onDownloadStarted(downloadId: string, url: string, downloadItem: DownloadItem): void {
    appLogger.debug(`Download ${downloadId} started`);
    this.downloads[downloadId] = { downloadId, downloadItem };
    this.window.webContents.send('download-file-started', { downloadId, filename: downloadItem.getFilename(), url });
  }

  private onDownloadProgress(downloadId: string, progress: electronDl.Progress): void {
    if (typeof progress?.percent !== 'number' || !Object.keys(this.downloads).length) return;

    const download = this.getDownload(downloadId);
    if (download) {
      this.window.webContents.send('download-file-status', {
        downloadId,
        filename: download.downloadItem.getFilename(),
        status: 'downloading',
        percent: Math.round(progress.percent * 100),
      });
    }
  }

  private onDownloadCancel(downloadId: string, _item: DownloadItem): void {
    appLogger.info(`Download ${downloadId} canceled`);

    const download = this.getDownload(downloadId);
    if (download) {
      this.deleteDownload(downloadId);
      this.window.webContents.send('download-file-status', {
        downloadId,
        filename: download.downloadItem.getFilename(),
        status: 'canceled',
        percent: 0,
      });
    }
  }

  private onDownloadCompleted(downloadId: string, _item: DownloadComplete): void {
    appLogger.info(`Download ${downloadId} completed`);

    const download = this.getDownload(downloadId);
    if (download) {
      this.window.webContents.send('download-file-status', {
        downloadId,
        filename: download.downloadItem.getFilename(),
        status: 'success',
        percent: 100,
      });
      this.deleteDownload(downloadId);
    }
  }

  private getDownload(downloadId: string): Download {
    return this.downloads[downloadId];
  }

  private deleteDownload(downloadId: string): void {
    if (this.downloads[downloadId]) {
      delete this.downloads[downloadId];
    }
  }
}

export const appFileDownload = new AppFileDownload();
